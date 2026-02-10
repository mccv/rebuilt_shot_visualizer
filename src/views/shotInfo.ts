// ═══════════════════════════════════════════════════════════════
//  Shot Info Panel — parameter display
// ═══════════════════════════════════════════════════════════════

import type { DetailedShot } from '../types';

/** Populate the shot-info panel with formatted parameters. */
export function populateShotInfo(shot: DetailedShot): void {
  const el = document.getElementById('shot-info')!;
  const row = (label: string, val: string) =>
    `<div><span class="si-label">${label}</span><span class="si-val">${val}</span></div>`;
  const section = (title: string) =>
    `<div class="si-section">${title}</div>`;

  el.innerHTML =
    section('Launch') +
    row('Shot Speed', shot.speed.toFixed(1) + ' m/s') +
    row('Hood Angle', shot.hoodAngleDeg.toFixed(1) + '\u00B0') +
    row('H. Speed', shot.effRadSpeed.toFixed(1) + ' m/s') +
    row('V. Speed', shot.vLaunch.toFixed(1) + ' m/s') +
    row('Turret Adj.', (shot.turretAdjRad * 180 / Math.PI).toFixed(1) + '\u00B0') +
    section('Trajectory') +
    row('Range', shot.range.toFixed(2) + ' m') +
    row('Flight Time', shot.flightTime.toFixed(3) + ' s') +
    row('Apex Height', shot.apexHeight.toFixed(2) + ' m') +
    row('Ceiling', shot.ceilingHeight.toFixed(1) + ' m') +
    section('At Target') +
    row('Vy', shot.vyAtTarget.toFixed(2) + ' m/s') +
    row('Descent Angle', (Math.atan2(-shot.vzTarget, shot.vxTarget) * 180 / Math.PI).toFixed(1) + '\u00B0') +
    section('Robot Velocity') +
    row('Tangential', shot.tangentialVelo.toFixed(1) + ' m/s') +
    row('Radial', shot.radialVelo.toFixed(1) + ' m/s');
}
