// ═══════════════════════════════════════════════════════════════
//  Back View — End-On, Lateral × Height
// ═══════════════════════════════════════════════════════════════

import { prepCanvas, drawArrow } from '../drawing';
import { createLabelPlacer } from '../labels';
import type { DetailedShot } from '../types';

export function renderBackView(canvasEl: HTMLCanvasElement, shot: DetailedShot): void {
  const { c, w, h } = prepCanvas(canvasEl);
  const pad = { top: 24, bottom: 34, left: 44, right: 24 };
  const pw = w - pad.left - pad.right;
  const ph = h - pad.top - pad.bottom;

  // World bounds
  const maxLateral = Math.abs(shot.tangentialVelo) * shot.flightTime;
  const yExtent = Math.max(maxLateral * 1.5, 1.0);
  const showCeiling = shot.zApex >= 6;
  const zMax = showCeiling
    ? Math.max(shot.ceilingHeight * 1.02, shot.zApex + 1)
    : shot.zApex + 1;
  const zMin = 0;
  const scaleY = pw / (2 * yExtent);
  const scaleZ = ph / (zMax - zMin);
  const sc = Math.min(scaleY, scaleZ);

  const cx0 = pad.left + pw / 2;
  const toX = (wy: number) => cx0 + wy * sc;
  const toY = (wz: number) => pad.top + ph - (wz - zMin) * sc;

  c.fillStyle = '#0d1117';
  c.fillRect(0, 0, w, h);

  // Ground
  c.strokeStyle = '#2d4a2d';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(pad.left, toY(0));
  c.lineTo(pad.left + pw, toY(0));
  c.stroke();

  // Ceiling
  if (showCeiling) {
    c.setLineDash([6, 4]);
    c.strokeStyle = '#f8514966';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(pad.left, toY(shot.ceilingHeight));
    c.lineTo(pad.left + pw, toY(shot.ceilingHeight));
    c.stroke();
    c.setLineDash([]);
  }

  // Target ring
  const tgtPx = toX(0), tgtPy = toY(shot.targetZ);
  c.beginPath();
  c.arc(tgtPx, tgtPy, 14, 0, Math.PI * 2);
  c.strokeStyle = '#58a6ff44';
  c.lineWidth = 2;
  c.stroke();
  c.beginPath();
  c.arc(tgtPx, tgtPy, 3, 0, Math.PI * 2);
  c.fillStyle = '#58a6ff';
  c.fill();

  // Ball arrival point
  const lateralAtTarget = shot.trajectory[shot.trajectory.length - 1].y;
  const ballPx = toX(lateralAtTarget);
  const ballPy = toY(shot.targetZ);

  c.beginPath();
  c.arc(ballPx, ballPy, 5, 0, Math.PI * 2);
  c.fillStyle = '#3fb950';
  c.fill();

  // ── Label placer ──
  const lp = createLabelPlacer(c, w, h);

  // Descent velocity arrow
  const vScale = Math.min(70, ph * 0.25) / Math.max(1, Math.abs(shot.vzTarget));
  drawArrow(c, ballPx, ballPy,
    ballPx,
    ballPy - shot.vzTarget * vScale,
    '#f85149', 'Vy: ' + shot.vyAtTarget.toFixed(1) + ' m/s', undefined, lp);

  // Target label
  lp.add({ text: 'target', x: tgtPx, y: tgtPy + 34,
    font: 'bold 13px sans-serif', color: '#58a6ff' });

  // Vacuum trajectory overlay (dashed, when drag is active)
  if (shot.vacuumTrajectory) {
    c.setLineDash([6, 5]);
    c.strokeStyle = '#58a6ff22';
    c.lineWidth = 1;
    c.beginPath();
    const vt = shot.vacuumTrajectory;
    c.moveTo(toX(vt[0].y), toY(vt[0].z));
    for (let i = 1; i < vt.length; i++) {
      c.lineTo(toX(vt[i].y), toY(vt[i].z));
    }
    c.stroke();
    c.setLineDash([]);
  }

  // Trajectory projection (lateral vs height)
  c.strokeStyle = '#58a6ff44';
  c.lineWidth = 1.5;
  c.beginPath();
  const traj = shot.trajectory;
  c.moveTo(toX(traj[0].y), toY(traj[0].z));
  for (let i = 1; i < traj.length; i++) {
    c.lineTo(toX(traj[i].y), toY(traj[i].z));
  }
  c.stroke();

  // Register trajectory as obstacles
  for (let i = 3; i < traj.length; i += 3) {
    lp.addLine(toX(traj[i - 3].y), toY(traj[i - 3].z),
               toX(traj[i].y),     toY(traj[i].z), 6);
  }

  // Resolve and draw
  lp.resolve();
  lp.draw();

  // Axis labels
  c.fillStyle = '#8b949e';
  c.font = '13px sans-serif';
  c.textAlign = 'center';
  c.fillText('0', toX(0), h - 6);
  if (yExtent >= 0.5) {
    const yTick = Math.ceil(yExtent);
    c.fillText('+' + yTick + 'm', toX(yTick), h - 6);
    c.fillText('-' + yTick + 'm', toX(-yTick), h - 6);
  }
  c.textAlign = 'right';
  const zStep = Math.max(1, Math.ceil(zMax / 5));
  for (let z = 0; z <= zMax; z += zStep) {
    c.fillText(z + 'm', pad.left - 5, toY(z) + 4);
  }
}
