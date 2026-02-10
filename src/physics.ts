// ═══════════════════════════════════════════════════════════════
//  Physics engine — ported from ShotCalculator.java
// ═══════════════════════════════════════════════════════════════

import { GRAVITY } from './constants';
import type { ShotResult, SweepResult, RefineResult, Params } from './types';

/**
 * 2D sweep over (speed, angle) to find the best starting point for Newton.
 * Prefers descending trajectories under the ceiling, biased toward the
 * high-arc (steepest descent) solution when both arcs are available.
 */
export function sweepSpeedAndAngle(
  minSpeed: number, maxSpeed: number, speedSteps: number,
  minAngleDeg: number, maxAngleDeg: number,
  tangentialVelo: number, radialVelo: number,
  range: number, heightDiff: number, shooterZ: number, ceilingHeight: number,
): SweepResult {
  const minAngle = minAngleDeg * Math.PI / 180;
  const maxAngle = maxAngleDeg * Math.PI / 180;

  let bestSpeed = (minSpeed + maxSpeed) / 2;
  let bestAngle = (minAngle + maxAngle) / 2;
  let bestError = Infinity;
  let bestVy = 0;
  let foundDescending = false;
  const minDescentRate = -0.5;

  // Sweep error threshold: seeds within this tolerance are considered viable
  // for Newton convergence.  Among viable seeds we prefer steeper descent
  // (high arc); among non-viable ones we prefer lower error.  0.5 m is
  // tight enough that Newton reliably converges, while still accepting
  // imperfect grid points.
  const sweepErrorThreshold = 0.5;

  const speedStep = speedSteps > 1 ? (maxSpeed - minSpeed) / (speedSteps - 1) : 0;
  const angleStep = 0.01; // ~0.55°

  for (let si = 0; si < speedSteps; si++) {
    const v = minSpeed + si * speedStep;

    for (let a = minAngle; a <= maxAngle + 0.001; a += angleStep) {
      const angle = Math.min(a, maxAngle);
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      // Ceiling check: apex = shooterZ + (v·sinθ)² / (2g)
      const vVert = v * sinA;
      const apex = shooterZ + (vVert * vVert) / (2 * GRAVITY);
      if (apex > ceilingHeight) continue;

      const hSpeed = v * cosA;
      const turretAdj = Math.atan2(-tangentialVelo, hSpeed);
      const effSpeed = hSpeed * Math.cos(turretAdj) + radialVelo;
      if (effSpeed <= 0.1) continue;

      const t = range / effSpeed;
      const h = v * sinA * t - 0.5 * GRAVITY * t * t;
      const err = Math.abs(h - heightDiff);
      const vyTarget = v * sinA - GRAVITY * t;
      const desc = vyTarget < minDescentRate;

      if (desc) {
        // Classify candidates as "viable" (close enough for Newton to converge)
        // vs "marginal" (too far off to be a reliable seed).
        const newViable  = err       < sweepErrorThreshold;
        const bestViable = bestError < sweepErrorThreshold;

        const shouldReplace = !foundDescending               // first descending — always accept
          || (newViable && !bestViable)                       // viable beats marginal
          || (newViable && bestViable && vyTarget < bestVy)   // both viable — prefer steeper descent (high arc)
          || (!newViable && !bestViable && err < bestError);  // both marginal — prefer lower error

        if (shouldReplace) {
          bestError = err;
          bestSpeed = v;
          bestAngle = angle;
          bestVy = vyTarget;
          foundDescending = true;
        }
      } else if (!foundDescending && err < bestError) {
        bestError = err;
        bestSpeed = v;
        bestAngle = angle;
      }

      // Fixed angle: one iteration only
      if (maxAngle - minAngle < 0.002) break;
    }
  }

  return { speed: bestSpeed, angle: bestAngle, error: bestError };
}

/**
 * Evaluate the two residuals for the joint solver:
 *   f1 = height at target − desired height  (want 0)
 *   f2 = lateral drift at target            (want 0)
 *
 * Returns { f1, f2, effRadSpeed, shotTime } or null if effRadSpeed is too low.
 */
function evalResiduals(
  speed: number, theta: number, phi: number,
  radialVelo: number, tangentialVelo: number,
  range: number, heightDiff: number,
): { f1: number; f2: number; effRadSpeed: number; shotTime: number } | null {
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const hSpeed = speed * cosT;

  const effRadSpeed = hSpeed * Math.cos(phi) + radialVelo;
  if (effRadSpeed <= 0.1) return null;

  const shotTime = range / effRadSpeed;
  const height = speed * sinT * shotTime - 0.5 * GRAVITY * shotTime * shotTime;
  const f1 = height - heightDiff;

  const lateralVelo = hSpeed * Math.sin(phi) + tangentialVelo;
  const f2 = lateralVelo * shotTime;

  return { f1, f2, effRadSpeed, shotTime };
}

/**
 * Joint 2D Newton refinement of launch angle (theta) and turret angle (phi).
 *
 * Simultaneously zeros out:
 *   f1 = height error at target
 *   f2 = lateral drift at target
 *
 * Uses a 2×2 finite-difference Jacobian, analytically inverted.
 * When fixedTheta is true, holds theta constant and runs 1D Newton on phi alone.
 */
export function refineShot(
  speed: number, initialTheta: number,
  tangentialVelo: number, radialVelo: number,
  range: number, heightDiff: number,
  clampMinDeg: number, clampMaxDeg: number,
  fixedTheta: boolean = false,
): RefineResult {
  const clampMin = Math.max(clampMinDeg * Math.PI / 180, 0.05);
  const clampMax = Math.min(clampMaxDeg * Math.PI / 180, Math.PI / 2 - 0.05);
  const phiMin = -Math.PI / 2 + 0.05;
  const phiMax = Math.PI / 2 - 0.05;

  let theta = initialTheta;
  // Seed turret angle from the geometric approximation
  let phi = Math.atan2(-tangentialVelo, speed * Math.cos(theta));
  let shotTime = 0;

  const delta = 0.0001; // finite-difference step

  for (let attempt = 0; attempt < 2; attempt++) {
    for (let i = 0; i < 25; i++) {
      const r0 = evalResiduals(speed, theta, phi, radialVelo, tangentialVelo, range, heightDiff);
      if (!r0) {
        // effRadSpeed too low — reduce theta to increase hSpeed
        if (!fixedTheta) theta = Math.max(theta - 0.1, clampMin);
        // Re-seed phi for the new theta
        phi = Math.atan2(-tangentialVelo, speed * Math.cos(theta));
        continue;
      }

      shotTime = r0.shotTime;

      // Check convergence
      if (Math.abs(r0.f1) < 0.001 && Math.abs(r0.f2) < 0.001) break;

      if (fixedTheta) {
        // ── 1D Newton on phi only ─────────────────────────────
        const rPhi = evalResiduals(speed, theta, phi + delta, radialVelo, tangentialVelo, range, heightDiff);
        if (!rPhi) break;

        const df2_dphi = (rPhi.f2 - r0.f2) / delta;
        if (Math.abs(df2_dphi) < 0.0001) break;

        phi -= r0.f2 / df2_dphi;
        phi = Math.max(phiMin, Math.min(phiMax, phi));
      } else {
        // ── 2D Newton on (theta, phi) ─────────────────────────
        const rTheta = evalResiduals(speed, theta + delta, phi, radialVelo, tangentialVelo, range, heightDiff);
        const rPhi   = evalResiduals(speed, theta, phi + delta, radialVelo, tangentialVelo, range, heightDiff);
        if (!rTheta || !rPhi) break;

        // Jacobian entries
        const df1_dtheta = (rTheta.f1 - r0.f1) / delta;
        const df1_dphi   = (rPhi.f1   - r0.f1) / delta;
        const df2_dtheta = (rTheta.f2 - r0.f2) / delta;
        const df2_dphi   = (rPhi.f2   - r0.f2) / delta;

        // Determinant of the 2×2 Jacobian
        const det = df1_dtheta * df2_dphi - df1_dphi * df2_dtheta;
        if (Math.abs(det) < 1e-10) break;

        // J⁻¹ · [f1, f2]
        const invDet = 1 / det;
        const dTheta = invDet * ( df2_dphi * r0.f1 - df1_dphi * r0.f2);
        const dPhi   = invDet * (-df2_dtheta * r0.f1 + df1_dtheta * r0.f2);

        theta -= dTheta;
        phi   -= dPhi;

        theta = Math.max(clampMin, Math.min(clampMax, theta));
        phi   = Math.max(phiMin, Math.min(phiMax, phi));
      }
    }

    // Check if converged solution is descending
    const vy = speed * Math.sin(theta) - GRAVITY * shotTime;
    if (vy < 0) break; // descending — done

    // Ascending — bump steeper and retry once
    if (fixedTheta) break; // can't adjust theta in fixed mode
    theta = Math.min(theta + 0.15, clampMax);
    // Re-seed phi for new theta
    phi = Math.atan2(-tangentialVelo, speed * Math.cos(theta));
  }

  return { angle: theta, shotTime, turretAdjRad: phi };
}

/**
 * Validate a (speed, angle, turretAdj) candidate and build a ShotResult.
 * Checks height error, ceiling, descent, and lateral drift constraints.
 * Returns null if any check fails.
 */
function validateAndBuildResult(
  speed: number, angle: number, turretAdj: number,
  range: number, heightDiff: number, p: Params,
): ShotResult | null {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const hSpeed = speed * cosA;
  const effRadSpeed = hSpeed * Math.cos(turretAdj) + p.radialVelo;

  if (effRadSpeed <= 0.1) return null;

  const t = range / effRadSpeed;
  const h = speed * sinA * t - 0.5 * GRAVITY * t * t;
  const heightError = Math.abs(h - heightDiff);

  // Tighter tolerance when Newton was used, looser for fixed angle
  const tolerance = p.angleMode === 'fixed' ? 0.15 : 0.05;
  if (heightError > tolerance) return null;

  const vyAtTarget = speed * sinA - GRAVITY * t;
  const apexHeight = p.shooterZ + (speed * sinA) ** 2 / (2 * GRAVITY);

  if (apexHeight > p.ceilingHeight) return null;

  // Must be descending at least as fast as the threshold (maxVyAtTarget is negative)
  if (vyAtTarget > p.maxVyAtTarget) return null;

  // Lateral drift: residual lateral velocity × flight time
  const lateralVelo = hSpeed * Math.sin(turretAdj) + p.tangentialVelo;
  const lateralDrift = lateralVelo * t;
  if (p.maxLateralDrift > 0 && Math.abs(lateralDrift) > p.maxLateralDrift) return null;

  // Descent angle: angle below horizontal at target (positive = descending)
  const descentAngleDeg = Math.atan2(-vyAtTarget, effRadSpeed) * 180 / Math.PI;

  return {
    shotSpeed: speed,
    hoodAngleDeg: angle * 180 / Math.PI,
    flightTime: t,
    vyAtTarget,
    descentAngleDeg,
    apexHeight,
    heightError,
    lateralDrift,
    turretAdjRad: turretAdj,
    range,
  };
}

/**
 * Try Newton refinement at a given speed and validate the result.
 * Returns ShotResult or null.  Used by both evaluateShot and evaluateShotWithHint.
 */
function trySpeedWithNewton(
  speed: number, seedAngle: number, range: number, heightDiff: number, p: Params,
): ShotResult | null {
  const aMin = p.angleMode === 'fixed' ? p.fixedAngle : p.minAngle;
  const aMax = p.angleMode === 'fixed' ? p.fixedAngle : p.maxAngle;
  const isFixedAngle = p.angleMode === 'fixed';

  const ref = refineShot(
    speed, isFixedAngle ? aMin * Math.PI / 180 : seedAngle,
    p.tangentialVelo, p.radialVelo,
    range, heightDiff,
    aMin, aMax,
    isFixedAngle,
  );

  return validateAndBuildResult(speed, ref.angle, ref.turretAdjRad, range, heightDiff, p);
}

/**
 * Evaluate whether a shot from field position (fx, fy) can reach the target.
 * Runs a full (speed, angle) sweep followed by Newton refinement.
 * Returns shot details, or null if invalid.
 */
export function evaluateShot(fx: number, fy: number, p: Params): ShotResult | null {
  const dx = p.targetX - fx;
  const dy = p.targetY - fy;
  const range = Math.sqrt(dx * dx + dy * dy);
  const heightDiff = p.targetZ - p.shooterZ;

  if (range < 0.3) return null; // too close to target

  // Determine sweep parameters from mode
  const sMin  = p.speedMode === 'fixed' ? p.fixedSpeed : p.minSpeed;
  const sMax  = p.speedMode === 'fixed' ? p.fixedSpeed : p.maxSpeed;

  const aMin = p.angleMode === 'fixed' ? p.fixedAngle : p.minAngle;
  const aMax = p.angleMode === 'fixed' ? p.fixedAngle : p.maxAngle;

  // Use a fixed speed step size so widening the speed range adds samples
  // instead of diluting them.  Speed is never Newton-refined, so sweep
  // resolution directly determines accuracy.
  // Finer step when angle is fixed (speed is the only degree of freedom).
  const speedStepSize = (p.angleMode === 'fixed' && p.speedMode !== 'fixed') ? 0.05 : 0.1;
  const actualSpeedSteps = p.speedMode === 'fixed'
    ? 1
    : Math.max(2, Math.round((sMax - sMin) / speedStepSize) + 1);

  // Sweep
  const sweep = sweepSpeedAndAngle(
    sMin, sMax, actualSpeedSteps,
    aMin, aMax,
    p.tangentialVelo, p.radialVelo,
    range, heightDiff, p.shooterZ, p.ceilingHeight,
  );

  return trySpeedWithNewton(sweep.speed, sweep.angle, range, heightDiff, p);
}

/**
 * Evaluate a shot using a neighbor's (speed, angle) as a starting hint.
 * Tries the hint speed first, then nearby speeds.  Does NOT fall back to a
 * full sweep — the caller handles escalation.
 */
export function evaluateShotWithHint(
  fx: number, fy: number, p: Params,
  hintSpeed: number, hintAngleRad: number,
): ShotResult | null {
  const dx = p.targetX - fx;
  const dy = p.targetY - fy;
  const range = Math.sqrt(dx * dx + dy * dy);
  const heightDiff = p.targetZ - p.shooterZ;

  if (range < 0.3) return null;

  const sMin = p.speedMode === 'fixed' ? p.fixedSpeed : p.minSpeed;
  const sMax = p.speedMode === 'fixed' ? p.fixedSpeed : p.maxSpeed;

  // Try the hint speed directly — this is the fast path and works for the
  // vast majority of cells that are adjacent to a valid neighbor.
  const direct = trySpeedWithNewton(hintSpeed, hintAngleRad, range, heightDiff, p);
  if (direct) return direct;

  // Try nearby speeds in expanding rings around the hint.
  for (let delta = 0.2; delta <= 0.8; delta += 0.2) {
    const lo = hintSpeed - delta;
    const hi = hintSpeed + delta;
    if (lo >= sMin) {
      const r = trySpeedWithNewton(lo, hintAngleRad, range, heightDiff, p);
      if (r) return r;
    }
    if (hi <= sMax) {
      const r = trySpeedWithNewton(hi, hintAngleRad, range, heightDiff, p);
      if (r) return r;
    }
  }

  return null;
}

/**
 * Evaluate a shot at a given range (distance to target), bypassing field position.
 * Creates a virtual field position at the correct distance from the target.
 */
export function evaluateShotAtRange(
  range: number,
  tangentialVelo: number,
  radialVelo: number,
  params: Params,
): ShotResult | null {
  const fx = params.targetX + range;
  const fy = params.targetY;
  const modParams = Object.assign({}, params, { tangentialVelo, radialVelo });
  return evaluateShot(fx, fy, modParams);
}

/**
 * Build a detailed shot object from a basic result + velocity context.
 * Generates trajectory points and all derived vectors for the 3-view drawing.
 */
export function computeDetailedShot(
  result: ShotResult,
  tangentialVelo: number,
  radialVelo: number,
  params: Params,
): import('./types').DetailedShot {
  const speed = result.shotSpeed;
  const angleRad = result.hoodAngleDeg * Math.PI / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const hSpeed = speed * cosA;
  const vLaunch = speed * sinA;

  // Use the optimized turret angle from the joint solver
  const turretAdjRad = result.turretAdjRad;
  const effRadSpeed = hSpeed * Math.cos(turretAdjRad) + radialVelo;

  // Lateral velocity: residual after turret compensation
  const lateralVelo = hSpeed * Math.sin(turretAdjRad) + tangentialVelo;

  const range = result.range;
  const flightTime = result.flightTime;
  const shooterZ = params.shooterZ;
  const targetZ = params.targetZ;
  const ceilingHeight = params.ceilingHeight;

  // Parametric trajectory: sample 60 points
  const steps = 60;
  const trajectory: import('./types').TrajectoryPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * flightTime;
    const x = effRadSpeed * t;                                  // along line of fire
    const z = shooterZ + vLaunch * t - 0.5 * GRAVITY * t * t;  // height
    const y = lateralVelo * t;                                  // lateral drift
    trajectory.push({ x, z, y, t });
  }

  // Velocity at launch
  const vxLaunch = effRadSpeed;
  const vzLaunch = vLaunch;
  const vyLaunch = lateralVelo;

  // Velocity at target
  const vxTarget = effRadSpeed;
  const vzTarget = result.vyAtTarget;
  const vyTarget = lateralVelo;

  // Apex time and position
  const tApex = vLaunch / GRAVITY;
  const xApex = effRadSpeed * tApex;
  const zApex = result.apexHeight;

  return {
    speed, angleRad, hoodAngleDeg: result.hoodAngleDeg,
    hSpeed, vLaunch, turretAdjRad, effRadSpeed,
    range, flightTime, shooterZ, targetZ, ceilingHeight,
    tangentialVelo, radialVelo,
    trajectory,
    vxLaunch, vzLaunch, vyLaunch,
    vxTarget, vzTarget, vyTarget,
    tApex, xApex, zApex,
    apexHeight: result.apexHeight,
    vyAtTarget: result.vyAtTarget,
  };
}
