// ═══════════════════════════════════════════════════════════════
//  Physics engine — ported from ShotCalculator.java
// ═══════════════════════════════════════════════════════════════

import { GRAVITY } from './constants';
import type { ShotResult, SweepResult, RefineResult, Params } from './types';

/**
 * 2D sweep over (speed, angle) to find the best starting point for Newton.
 * Prefers descending trajectories under the ceiling with smallest height error.
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
  let foundDescending = false;
  const minDescentRate = -0.5;

  const speedStep = speedSteps > 1 ? (maxSpeed - minSpeed) / (speedSteps - 1) : 0;
  const angleStep = 0.02; // ~1.1°

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
        if (!foundDescending || err < bestError) {
          bestError = err;
          bestSpeed = v;
          bestAngle = angle;
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
 * Newton's-method refinement of launch angle at a fixed speed.
 */
export function refineAngle(
  speed: number, initialTheta: number,
  tangentialVelo: number, radialVelo: number,
  range: number, heightDiff: number,
  clampMinDeg: number, clampMaxDeg: number,
): RefineResult {
  const clampMin = Math.max(clampMinDeg * Math.PI / 180, 0.05);
  const clampMax = Math.min(clampMaxDeg * Math.PI / 180, Math.PI / 2 - 0.05);

  let theta = initialTheta;
  let shotTime = 0;
  let turretAdjRad = 0;

  for (let attempt = 0; attempt < 2; attempt++) {
    for (let i = 0; i < 20; i++) {
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const hSpeed = speed * cosT;

      turretAdjRad = Math.atan2(-tangentialVelo, hSpeed);
      const cosTurret = Math.cos(turretAdjRad);
      const effRadSpeed = hSpeed * cosTurret + radialVelo;

      if (effRadSpeed <= 0.1) {
        theta = Math.max(theta - 0.1, clampMin);
        continue;
      }

      shotTime = range / effRadSpeed;
      const h = speed * sinT * shotTime - 0.5 * GRAVITY * shotTime * shotTime;
      const error = h - heightDiff;

      if (Math.abs(error) < 0.001) break;

      // Finite-difference derivative dH/dθ
      const dTheta = 0.0001;
      const cosTp = Math.cos(theta + dTheta);
      const sinTp = Math.sin(theta + dTheta);
      const hSpeedP = speed * cosTp;
      const turretP = Math.atan2(-tangentialVelo, hSpeedP);
      const effP = hSpeedP * Math.cos(turretP) + radialVelo;
      const tP = effP > 0.1 ? range / effP : shotTime;
      const hP = speed * sinTp * tP - 0.5 * GRAVITY * tP * tP;

      const dH = (hP - h) / dTheta;
      if (Math.abs(dH) < 0.0001) break;

      theta -= error / dH;
      theta = Math.max(clampMin, Math.min(clampMax, theta));
    }

    // Check if converged solution is descending
    const vy = speed * Math.sin(theta) - GRAVITY * shotTime;
    if (vy < 0) break; // descending — done

    // Ascending — bump steeper and retry once
    theta = Math.min(theta + 0.15, clampMax);
  }

  return { angle: theta, shotTime, turretAdjRad };
}

/**
 * Evaluate whether a shot from field position (fx, fy) can reach the target.
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
  const sSteps = p.speedMode === 'fixed' ? 1 : 30;

  const aMin = p.angleMode === 'fixed' ? p.fixedAngle : p.minAngle;
  const aMax = p.angleMode === 'fixed' ? p.fixedAngle : p.maxAngle;

  // Use finer speed sweep when angle is fixed (more resolution needed)
  const actualSpeedSteps = (p.angleMode === 'fixed' && p.speedMode !== 'fixed') ? 30 : sSteps;

  // Sweep
  const sweep = sweepSpeedAndAngle(
    sMin, sMax, actualSpeedSteps,
    aMin, aMax,
    p.tangentialVelo, p.radialVelo,
    range, heightDiff, p.shooterZ, p.ceilingHeight,
  );

  let speed = sweep.speed;
  let angle = sweep.angle;

  // Newton refinement (only when angle is variable)
  if (p.angleMode !== 'fixed') {
    const ref = refineAngle(
      speed, angle,
      p.tangentialVelo, p.radialVelo,
      range, heightDiff,
      aMin, aMax,
    );
    angle = ref.angle;
  }

  // Final validation
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const hSpeed = speed * cosA;
  const turretAdj = Math.atan2(-p.tangentialVelo, hSpeed);
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

  return {
    shotSpeed: speed,
    hoodAngleDeg: angle * 180 / Math.PI,
    flightTime: t,
    vyAtTarget,
    apexHeight,
    heightError,
    range,
  };
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

  const turretAdjRad = Math.atan2(-tangentialVelo, hSpeed);
  const effRadSpeed = hSpeed * Math.cos(turretAdjRad) + radialVelo;

  // Lateral velocity: turret compensates for tangential motion, but not perfectly
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
