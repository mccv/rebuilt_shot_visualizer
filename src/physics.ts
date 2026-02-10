// ═══════════════════════════════════════════════════════════════
//  Physics engine — ported from ShotCalculator.java
// ═══════════════════════════════════════════════════════════════

import { GRAVITY, DRAG_K } from './constants';
import type { ShotResult, SweepResult, RefineResult, Params, DragConfig } from './types';

// ── Drag helpers ─────────────────────────────────────────────

/** Build a DragConfig from Params (convenience). */
export function dragFromParams(p: Params): DragConfig {
  return { enabled: p.dragEnabled, k: DRAG_K };
}

/** Result of a numerical trajectory simulation to the target range. */
interface SimResult {
  z: number;      // height relative to launch (= absolute - shooterZ)
  y: number;      // lateral drift
  t: number;      // flight time
  vx: number;     // radial velocity at target
  vy: number;     // lateral velocity at target
  vz: number;     // vertical velocity at target
  apexZ: number;  // maximum height relative to launch
}

/**
 * Numerically integrate a 3-D trajectory with quadratic drag using RK4.
 *
 * State: (x, y, z, vx, vy, vz)  — z is height relative to launch point.
 * Forces: gravity (0, 0, −g) and drag  −k|v| · v⃗.
 *
 * Stops when x ≥ range and linearly interpolates to exact range.
 * Returns null if the ball hits the ground (z < −shooterZ) or times out.
 */
function simulateToRange(
  vx0: number, vy0: number, vz0: number,
  range: number, shooterZ: number, k: number,
): SimResult | null {
  const DT = 0.002;   // 2 ms integration step
  const MAX_T = 5.0;  // safety cap

  let x = 0, y = 0, z = 0;
  let vx = vx0, vy = vy0, vz = vz0;
  let t = 0;
  let apexZ = 0;

  // Previous step values for interpolation
  let px = 0, py = 0, pz = 0, pvx = vx, pvy = vy, pvz = vz, pt = 0, pApexZ = 0;

  // Derivative evaluation: returns [dx,dy,dz,dvx,dvy,dvz]
  const deriv = (
    _vx: number, _vy: number, _vz: number,
  ): [number, number, number, number, number, number] => {
    const speed = Math.sqrt(_vx * _vx + _vy * _vy + _vz * _vz);
    const drag = k * speed; // k·|v|
    return [
      _vx, _vy, _vz,
      -drag * _vx,
      -drag * _vy,
      -GRAVITY - drag * _vz,
    ];
  };

  while (t < MAX_T) {
    // Save previous state for interpolation
    px = x; py = y; pz = z;
    pvx = vx; pvy = vy; pvz = vz;
    pt = t; pApexZ = apexZ;

    // ── RK4 step ────────────────────────────────────────────
    const [dx1, dy1, dz1, dvx1, dvy1, dvz1] = deriv(vx, vy, vz);

    const hvx2 = vx + dvx1 * DT / 2;
    const hvy2 = vy + dvy1 * DT / 2;
    const hvz2 = vz + dvz1 * DT / 2;
    const [dx2, dy2, dz2, dvx2, dvy2, dvz2] = deriv(hvx2, hvy2, hvz2);

    const hvx3 = vx + dvx2 * DT / 2;
    const hvy3 = vy + dvy2 * DT / 2;
    const hvz3 = vz + dvz2 * DT / 2;
    const [dx3, dy3, dz3, dvx3, dvy3, dvz3] = deriv(hvx3, hvy3, hvz3);

    const fvx4 = vx + dvx3 * DT;
    const fvy4 = vy + dvy3 * DT;
    const fvz4 = vz + dvz3 * DT;
    const [dx4, dy4, dz4, dvx4, dvy4, dvz4] = deriv(fvx4, fvy4, fvz4);

    x  += DT / 6 * (dx1  + 2 * dx2  + 2 * dx3  + dx4);
    y  += DT / 6 * (dy1  + 2 * dy2  + 2 * dy3  + dy4);
    z  += DT / 6 * (dz1  + 2 * dz2  + 2 * dz3  + dz4);
    vx += DT / 6 * (dvx1 + 2 * dvx2 + 2 * dvx3 + dvx4);
    vy += DT / 6 * (dvy1 + 2 * dvy2 + 2 * dvy3 + dvy4);
    vz += DT / 6 * (dvz1 + 2 * dvz2 + 2 * dvz3 + dvz4);
    t  += DT;

    if (z > apexZ) apexZ = z;

    // Ground check (z=0 is launch height, ground is at -shooterZ)
    if (z < -shooterZ) return null;

    // Crossed the target range — interpolate
    if (x >= range) {
      // Linear interpolation fraction within this step
      const frac = (px === x) ? 0 : (range - px) / (x - px);
      return {
        z:  pz + frac * (z - pz),
        y:  py + frac * (y - py),
        t:  pt + frac * DT,
        vx: pvx + frac * (vx - pvx),
        vy: pvy + frac * (vy - pvy),
        vz: pvz + frac * (vz - pvz),
        apexZ: Math.max(pApexZ, pz + frac * (z - pz)),
      };
    }
  }

  return null; // timed out — ball never reached range
}

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
 * Returns { f1, f2, effRadSpeed, shotTime, vz } or null if effRadSpeed is too low.
 * When drag is enabled, uses numerical simulation instead of closed-form.
 */
function evalResiduals(
  speed: number, theta: number, phi: number,
  radialVelo: number, tangentialVelo: number,
  range: number, heightDiff: number,
  drag: DragConfig,
): { f1: number; f2: number; effRadSpeed: number; shotTime: number; vz: number } | null {
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const hSpeed = speed * cosT;

  const effRadSpeed = hSpeed * Math.cos(phi) + radialVelo;
  if (effRadSpeed <= 0.1) return null;

  const lateralVelo = hSpeed * Math.sin(phi) + tangentialVelo;
  const vLaunch = speed * sinT;

  if (drag.enabled) {
    // ── Numerical integration path ────────────────────────
    // Pass a large shooterZ to effectively disable the ground check here.
    // Ground / ceiling validation happens later in validateAndBuildResult
    // which has the real shooterZ.  Using 0 would kill valid high-arc
    // trajectories that dip below the launch point on their way to the target.
    const sim = simulateToRange(effRadSpeed, lateralVelo, vLaunch, range, 1000, drag.k);
    if (!sim) return null;
    return {
      f1: sim.z - heightDiff,
      f2: sim.y,
      effRadSpeed,
      shotTime: sim.t,
      vz: sim.vz,
    };
  }

  // ── Closed-form (vacuum) path ─────────────────────────
  const shotTime = range / effRadSpeed;
  const height = vLaunch * shotTime - 0.5 * GRAVITY * shotTime * shotTime;
  const f1 = height - heightDiff;
  const f2 = lateralVelo * shotTime;
  const vz = vLaunch - GRAVITY * shotTime;

  return { f1, f2, effRadSpeed, shotTime, vz };
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
  drag: DragConfig = { enabled: false, k: 0 },
): RefineResult {
  const clampMin = Math.max(clampMinDeg * Math.PI / 180, 0.05);
  const clampMax = Math.min(clampMaxDeg * Math.PI / 180, Math.PI / 2 - 0.05);
  const phiMin = -Math.PI / 2 + 0.05;
  const phiMax = Math.PI / 2 - 0.05;

  let theta = initialTheta;
  // Seed turret angle from the geometric approximation
  let phi = Math.atan2(-tangentialVelo, speed * Math.cos(theta));
  let shotTime = 0;
  let lastVz = 0; // track vertical velocity at target for descent check

  const delta = 0.0001; // finite-difference step

  for (let attempt = 0; attempt < 2; attempt++) {
    for (let i = 0; i < 25; i++) {
      const r0 = evalResiduals(speed, theta, phi, radialVelo, tangentialVelo, range, heightDiff, drag);
      if (!r0) {
        // effRadSpeed too low — reduce theta to increase hSpeed
        if (!fixedTheta) theta = Math.max(theta - 0.1, clampMin);
        // Re-seed phi for the new theta
        phi = Math.atan2(-tangentialVelo, speed * Math.cos(theta));
        continue;
      }

      shotTime = r0.shotTime;
      lastVz = r0.vz;

      // Check convergence
      if (Math.abs(r0.f1) < 0.001 && Math.abs(r0.f2) < 0.001) break;

      if (fixedTheta) {
        // ── 1D Newton on phi only ─────────────────────────────
        const rPhi = evalResiduals(speed, theta, phi + delta, radialVelo, tangentialVelo, range, heightDiff, drag);
        if (!rPhi) break;

        const df2_dphi = (rPhi.f2 - r0.f2) / delta;
        if (Math.abs(df2_dphi) < 0.0001) break;

        phi -= r0.f2 / df2_dphi;
        phi = Math.max(phiMin, Math.min(phiMax, phi));
      } else {
        // ── 2D Newton on (theta, phi) ─────────────────────────
        const rTheta = evalResiduals(speed, theta + delta, phi, radialVelo, tangentialVelo, range, heightDiff, drag);
        const rPhi   = evalResiduals(speed, theta, phi + delta, radialVelo, tangentialVelo, range, heightDiff, drag);
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

    // Check if converged solution is descending (use drag-aware vz)
    if (lastVz < 0) break; // descending — done

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
  drag: DragConfig,
): ShotResult | null {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const hSpeed = speed * cosA;
  const effRadSpeed = hSpeed * Math.cos(turretAdj) + p.radialVelo;

  if (effRadSpeed <= 0.1) return null;

  const lateralVelo = hSpeed * Math.sin(turretAdj) + p.tangentialVelo;
  const vLaunch = speed * sinA;

  let t: number;
  let heightError: number;
  let vyAtTarget: number;
  let apexHeight: number;
  let lateralDrift: number;
  let vxAtTarget: number;

  if (drag.enabled) {
    // ── Numerical integration path ────────────────────────
    const sim = simulateToRange(effRadSpeed, lateralVelo, vLaunch, range, p.shooterZ, drag.k);
    if (!sim) return null;

    t = sim.t;
    heightError = Math.abs(sim.z - heightDiff);
    vyAtTarget = sim.vz;
    apexHeight = p.shooterZ + sim.apexZ;
    lateralDrift = sim.y;
    vxAtTarget = sim.vx;
  } else {
    // ── Closed-form (vacuum) path ─────────────────────────
    t = range / effRadSpeed;
    const h = vLaunch * t - 0.5 * GRAVITY * t * t;
    heightError = Math.abs(h - heightDiff);
    vyAtTarget = vLaunch - GRAVITY * t;
    apexHeight = p.shooterZ + vLaunch ** 2 / (2 * GRAVITY);
    lateralDrift = lateralVelo * t;
    vxAtTarget = effRadSpeed;
  }

  // Tighter tolerance when Newton was used, looser for fixed angle
  const tolerance = p.angleMode === 'fixed' ? 0.15 : 0.05;
  if (heightError > tolerance) return null;

  if (apexHeight > p.ceilingHeight) return null;

  // Must be descending at least as fast as the threshold (maxVyAtTarget is negative)
  if (vyAtTarget > p.maxVyAtTarget) return null;

  if (p.maxLateralDrift > 0 && Math.abs(lateralDrift) > p.maxLateralDrift) return null;

  // Descent angle: angle below horizontal at target (positive = descending)
  const descentAngleDeg = Math.atan2(-vyAtTarget, vxAtTarget) * 180 / Math.PI;

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
  speed: number, seedAngle: number, range: number, heightDiff: number,
  p: Params, drag: DragConfig,
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
    drag,
  );

  return validateAndBuildResult(speed, ref.angle, ref.turretAdjRad, range, heightDiff, p, drag);
}

/**
 * Evaluate whether a shot from field position (fx, fy) can reach the target.
 * Runs a full (speed, angle) vacuum sweep followed by drag-aware Newton refinement.
 * Returns shot details, or null if invalid.
 */
export function evaluateShot(fx: number, fy: number, p: Params): ShotResult | null {
  const dx = p.targetX - fx;
  const dy = p.targetY - fy;
  const range = Math.sqrt(dx * dx + dy * dy);
  const heightDiff = p.targetZ - p.shooterZ;

  if (range < 0.3) return null; // too close to target

  const drag = dragFromParams(p);

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

  // Sweep (always vacuum — just finding a seed for Newton)
  const sweep = sweepSpeedAndAngle(
    sMin, sMax, actualSpeedSteps,
    aMin, aMax,
    p.tangentialVelo, p.radialVelo,
    range, heightDiff, p.shooterZ, p.ceilingHeight,
  );

  return trySpeedWithNewton(sweep.speed, sweep.angle, range, heightDiff, p, drag);
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

  const drag = dragFromParams(p);
  const sMin = p.speedMode === 'fixed' ? p.fixedSpeed : p.minSpeed;
  const sMax = p.speedMode === 'fixed' ? p.fixedSpeed : p.maxSpeed;

  // Try the hint speed directly — this is the fast path and works for the
  // vast majority of cells that are adjacent to a valid neighbor.
  const direct = trySpeedWithNewton(hintSpeed, hintAngleRad, range, heightDiff, p, drag);
  if (direct) return direct;

  // Try nearby speeds in expanding rings around the hint.
  for (let delta = 0.2; delta <= 0.8; delta += 0.2) {
    const lo = hintSpeed - delta;
    const hi = hintSpeed + delta;
    if (lo >= sMin) {
      const r = trySpeedWithNewton(lo, hintAngleRad, range, heightDiff, p, drag);
      if (r) return r;
    }
    if (hi <= sMax) {
      const r = trySpeedWithNewton(hi, hintAngleRad, range, heightDiff, p, drag);
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
 * When drag is enabled, the trajectory is produced by RK4 integration.
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
  const drag = dragFromParams(params);

  // Velocity at launch (same with or without drag — it's the initial state)
  const vxLaunch = effRadSpeed;
  const vzLaunch = vLaunch;
  const vyLaunch = lateralVelo;

  let trajectory: import('./types').TrajectoryPoint[];
  let vxTarget: number;
  let vzTarget: number;
  let vyTarget: number;
  let tApex: number;
  let xApex: number;
  let zApex: number;

  if (drag.enabled) {
    // ── RK4-integrated trajectory ───────────────────────────
    const DT = 0.002;
    const k = drag.k;
    trajectory = [];

    let x = 0, y = 0, z = 0;
    let vx = effRadSpeed, vy = lateralVelo, vz = vLaunch;
    let t = 0;
    let maxZ = 0;
    tApex = 0;
    xApex = 0;

    // Record launch point
    trajectory.push({ x: 0, z: shooterZ, y: 0, t: 0 });

    const deriv = (
      _vx: number, _vy: number, _vz: number,
    ): [number, number, number, number, number, number] => {
      const spd = Math.sqrt(_vx * _vx + _vy * _vy + _vz * _vz);
      const d = k * spd;
      return [_vx, _vy, _vz, -d * _vx, -d * _vy, -GRAVITY - d * _vz];
    };

    // Sample roughly 60 evenly-spaced trajectory points by time
    const sampleInterval = flightTime / 60;
    let nextSample = sampleInterval;

    while (t < flightTime + DT) {
      // RK4 step
      const [dx1, dy1, dz1, dvx1, dvy1, dvz1] = deriv(vx, vy, vz);
      const [dx2, dy2, dz2, dvx2, dvy2, dvz2] = deriv(vx + dvx1 * DT / 2, vy + dvy1 * DT / 2, vz + dvz1 * DT / 2);
      const [dx3, dy3, dz3, dvx3, dvy3, dvz3] = deriv(vx + dvx2 * DT / 2, vy + dvy2 * DT / 2, vz + dvz2 * DT / 2);
      const [dx4, dy4, dz4, dvx4, dvy4, dvz4] = deriv(vx + dvx3 * DT, vy + dvy3 * DT, vz + dvz3 * DT);

      x  += DT / 6 * (dx1  + 2 * dx2  + 2 * dx3  + dx4);
      y  += DT / 6 * (dy1  + 2 * dy2  + 2 * dy3  + dy4);
      z  += DT / 6 * (dz1  + 2 * dz2  + 2 * dz3  + dz4);
      vx += DT / 6 * (dvx1 + 2 * dvx2 + 2 * dvx3 + dvx4);
      vy += DT / 6 * (dvy1 + 2 * dvy2 + 2 * dvy3 + dvy4);
      vz += DT / 6 * (dvz1 + 2 * dvz2 + 2 * dvz3 + dvz4);
      t  += DT;

      if (z > maxZ) { maxZ = z; tApex = t; xApex = x; }

      // Record evenly-spaced samples
      if (t >= nextSample || t >= flightTime) {
        trajectory.push({ x, z: shooterZ + z, y, t });
        nextSample += sampleInterval;
      }
    }

    vxTarget = vx;
    vzTarget = vz;
    vyTarget = vy;
    zApex = shooterZ + maxZ;
  } else {
    // ── Closed-form (vacuum) trajectory ─────────────────────
    const steps = 60;
    trajectory = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * flightTime;
      const x = effRadSpeed * t;
      const z = shooterZ + vLaunch * t - 0.5 * GRAVITY * t * t;
      const y = lateralVelo * t;
      trajectory.push({ x, z, y, t });
    }

    vxTarget = effRadSpeed;
    vzTarget = result.vyAtTarget;
    vyTarget = lateralVelo;

    tApex = vLaunch / GRAVITY;
    xApex = effRadSpeed * tApex;
    zApex = result.apexHeight;
  }

  // Generate vacuum comparison trajectory when drag is active
  let vacuumTrajectory: import('./types').TrajectoryPoint[] | undefined;
  if (drag.enabled) {
    // Use the same flight-time span as the drag trajectory so arcs are
    // visually comparable.  The vacuum ball will overshoot the target.
    const vacSteps = 60;
    vacuumTrajectory = [];
    for (let i = 0; i <= vacSteps; i++) {
      const t = (i / vacSteps) * flightTime;
      const x = effRadSpeed * t;
      const z = shooterZ + vLaunch * t - 0.5 * GRAVITY * t * t;
      const y = lateralVelo * t;
      vacuumTrajectory.push({ x, z, y, t });
    }
  }

  return {
    speed, angleRad, hoodAngleDeg: result.hoodAngleDeg,
    hSpeed, vLaunch, turretAdjRad, effRadSpeed,
    range, flightTime, shooterZ, targetZ, ceilingHeight,
    tangentialVelo, radialVelo,
    dragEnabled: drag.enabled,
    trajectory,
    vacuumTrajectory,
    vxLaunch, vzLaunch, vyLaunch,
    vxTarget, vzTarget, vyTarget,
    tApex, xApex, zApex,
    apexHeight: zApex,
    vyAtTarget: result.vyAtTarget,
  };
}
