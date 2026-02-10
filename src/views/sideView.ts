// ═══════════════════════════════════════════════════════════════
//  Side View — Range × Height
// ═══════════════════════════════════════════════════════════════

import { prepCanvas, drawArrow, drawAngleArc } from '../drawing';
import { createLabelPlacer } from '../labels';
import type { DetailedShot } from '../types';

export function renderSideView(canvasEl: HTMLCanvasElement, shot: DetailedShot): void {
  const { c, w, h } = prepCanvas(canvasEl);
  const pad = { top: 24, bottom: 34, left: 44, right: 24 };
  const pw = w - pad.left - pad.right;
  const ph = h - pad.top - pad.bottom;

  // World bounds
  const xMax = shot.range * 1.08;
  const showCeiling = shot.zApex >= 6;
  const zMax = showCeiling
    ? Math.max(shot.ceilingHeight * 1.02, shot.zApex + 1)
    : shot.zApex + 1;
  const zMin = 0;
  const scaleX = pw / xMax;
  const scaleZ = ph / (zMax - zMin);
  const sc = Math.min(scaleX, scaleZ);

  const toX = (wx: number) => pad.left + wx * sc;
  const toY = (wz: number) => pad.top + ph - (wz - zMin) * sc;

  // Background
  c.fillStyle = '#0d1117';
  c.fillRect(0, 0, w, h);

  // Ground line
  c.strokeStyle = '#2d4a2d';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(toX(0), toY(0));
  c.lineTo(toX(xMax), toY(0));
  c.stroke();

  // Ceiling
  if (showCeiling) {
    c.setLineDash([6, 4]);
    c.strokeStyle = '#f8514966';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(toX(0), toY(shot.ceilingHeight));
    c.lineTo(toX(xMax), toY(shot.ceilingHeight));
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#f8514988';
    c.font = '12px sans-serif';
    c.textAlign = 'right';
    c.fillText('ceiling ' + shot.ceilingHeight.toFixed(1) + 'm', toX(xMax) - 4, toY(shot.ceilingHeight) - 5);
  }

  // Trajectory arc
  c.strokeStyle = '#58a6ff';
  c.lineWidth = 2;
  c.beginPath();
  const traj = shot.trajectory;
  c.moveTo(toX(traj[0].x), toY(traj[0].z));
  for (let i = 1; i < traj.length; i++) {
    c.lineTo(toX(traj[i].x), toY(traj[i].z));
  }
  c.stroke();

  // Apex marker
  c.beginPath();
  c.arc(toX(shot.xApex), toY(shot.zApex), 5, 0, Math.PI * 2);
  c.fillStyle = '#f0883e';
  c.fill();

  // Shooter dot
  c.beginPath();
  c.arc(toX(0), toY(shot.shooterZ), 6, 0, Math.PI * 2);
  c.fillStyle = '#3fb950';
  c.fill();

  // Target dot/ring
  const tx = toX(shot.range), tz = toY(shot.targetZ);
  c.beginPath();
  c.arc(tx, tz, 8, 0, Math.PI * 2);
  c.strokeStyle = '#58a6ff';
  c.lineWidth = 2.5;
  c.stroke();
  c.beginPath();
  c.arc(tx, tz, 3, 0, Math.PI * 2);
  c.fillStyle = '#58a6ff';
  c.fill();

  // ── Label placer for collision resolution ──
  const lp = createLabelPlacer(c, w, h);

  // Register trajectory as obstacle
  for (let i = 3; i < traj.length; i += 3) {
    lp.addLine(toX(traj[i - 3].x), toY(traj[i - 3].z),
               toX(traj[i].x),     toY(traj[i].z), 6);
  }

  // Apex label
  lp.add({ text: 'apex ' + shot.zApex.toFixed(2) + 'm',
    x: toX(shot.xApex), y: toY(shot.zApex) - 12,
    font: 'bold 14px sans-serif', color: '#f0883e' });

  // Launch velocity vectors
  const vScale = Math.min(90, pw * 0.22) / shot.speed;
  const launchPx = toX(0), launchPy = toY(shot.shooterZ);
  drawArrow(c, launchPx, launchPy,
    launchPx + shot.vxLaunch * vScale,
    launchPy - shot.vzLaunch * vScale,
    '#3fb950', shot.speed.toFixed(1) + ' m/s', undefined, lp);

  // Horizontal component
  drawArrow(c, launchPx, launchPy,
    launchPx + shot.effRadSpeed * vScale,
    launchPy,
    '#3fb950aa', 'horiz ' + shot.effRadSpeed.toFixed(1) + ' m/s', undefined, lp);

  // Vertical component
  drawArrow(c, launchPx, launchPy,
    launchPx,
    launchPy - shot.vLaunch * vScale,
    '#3fb950aa', 'vert ' + shot.vLaunch.toFixed(1) + ' m/s', undefined, lp);

  // Velocity at target (descent)
  const targPx = tx, targPy = tz;
  drawArrow(c, targPx, targPy,
    targPx + shot.vxTarget * vScale,
    targPy - shot.vzTarget * vScale,
    '#f85149', 'descent ' + Math.abs(shot.vzTarget).toFixed(1) + ' m/s', undefined, lp);

  // Descent angle arc at target
  const descentCanvasAngle = Math.atan2(-shot.vzTarget, shot.vxTarget);
  const descentAngleDeg = descentCanvasAngle * 180 / Math.PI;
  const descentArcR = 45;
  drawAngleArc(c, targPx, targPy, descentArcR, 0, descentCanvasAngle, '#f85149',
    descentAngleDeg.toFixed(1) + '\u00B0', lp);

  // Gravity arrow near apex
  const gLen = 35;
  const gx = toX(shot.xApex) + 25, gy = toY(shot.zApex) + 5;
  drawArrow(c, gx, gy, gx, gy + gLen, '#8b949e', 'g', 7, lp);

  // Hood angle arc at launch — sweep to the actual visual launch vector angle
  // (canvas y-axis is inverted, so the arrow's canvas angle is -atan2(vz, vx))
  const arcR = 55;
  const launchCanvasAngle = Math.atan2(-shot.vzLaunch, shot.vxLaunch);
  drawAngleArc(c, launchPx, launchPy, arcR, 0, launchCanvasAngle, '#f0883e',
    shot.hoodAngleDeg.toFixed(1) + '\u00B0', lp);

  // Resolve overlaps and draw
  lp.resolve();
  lp.draw();

  // Axis labels (margin text — no overlap risk)
  c.fillStyle = '#8b949e';
  c.font = '13px sans-serif';
  c.textAlign = 'center';
  const xStep = Math.ceil(xMax / 6);
  for (let x = 0; x <= xMax; x += xStep) {
    c.fillText(x + 'm', toX(x), h - 6);
  }
  c.textAlign = 'right';
  const zStep = Math.max(1, Math.ceil(zMax / 5));
  for (let z = 0; z <= zMax; z += zStep) {
    c.fillText(z + 'm', pad.left - 5, toY(z) + 4);
  }
}
