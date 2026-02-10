// ═══════════════════════════════════════════════════════════════
//  Top View — Bird's Eye, Range × Lateral
// ═══════════════════════════════════════════════════════════════

import { prepCanvas, drawArrow, drawAngleArc } from '../drawing';
import { createLabelPlacer } from '../labels';
import type { DetailedShot } from '../types';

export function renderTopView(canvasEl: HTMLCanvasElement, shot: DetailedShot): void {
  const { c, w, h } = prepCanvas(canvasEl);
  const pad = { top: 24, bottom: 34, left: 44, right: 24 };
  const pw = w - pad.left - pad.right;
  const ph = h - pad.top - pad.bottom;

  // Reserve pixel space left of shooter for radial velocity arrows (±3 m/s).
  // Arrow scale is derived from the reserved space so it always fits.
  const maxRadialDisplay = 3;  // m/s — defines the arrow range we guarantee
  const originOffsetPx = pw * 0.2;
  const robotVArrowScale = (originOffsetPx - 10) / maxRadialDisplay;  // px per m/s

  // World bounds
  const xMax = shot.range * 1.08;
  const maxLateral = Math.abs(shot.tangentialVelo) * shot.flightTime;
  const yExtent = Math.max(maxLateral * 1.5, shot.range * 0.15, 1.0);
  const scaleX = (pw - originOffsetPx) / xMax;
  const scaleY = ph / (2 * yExtent);
  const sc = Math.min(scaleX, scaleY);

  const cy0 = pad.top + ph / 2;
  const toX = (wx: number) => pad.left + originOffsetPx + wx * sc;
  const toY = (wy: number) => cy0 + wy * sc;

  c.fillStyle = '#0d1117';
  c.fillRect(0, 0, w, h);

  // Center line (shooter → target, no drift)
  c.setLineDash([4, 3]);
  c.strokeStyle = '#3fb95044';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(toX(0), toY(0));
  c.lineTo(toX(shot.range), toY(0));
  c.stroke();
  c.setLineDash([]);

  // Actual trajectory
  c.strokeStyle = '#58a6ff';
  c.lineWidth = 2;
  c.beginPath();
  const traj = shot.trajectory;
  c.moveTo(toX(traj[0].x), toY(traj[0].y));
  for (let i = 1; i < traj.length; i++) {
    c.lineTo(toX(traj[i].x), toY(traj[i].y));
  }
  c.stroke();

  // Shooter dot
  c.beginPath();
  c.arc(toX(0), toY(0), 5, 0, Math.PI * 2);
  c.fillStyle = '#3fb950';
  c.fill();

  // Target dot
  c.beginPath();
  c.arc(toX(shot.range), toY(0), 6, 0, Math.PI * 2);
  c.strokeStyle = '#58a6ff';
  c.lineWidth = 2;
  c.stroke();
  c.beginPath();
  c.arc(toX(shot.range), toY(0), 2, 0, Math.PI * 2);
  c.fillStyle = '#58a6ff';
  c.fill();

  // ── Label placer ──
  const lp = createLabelPlacer(c, w, h);

  // Register obstacles
  for (let i = 3; i < traj.length; i += 3) {
    lp.addLine(toX(traj[i - 3].x), toY(traj[i - 3].y),
               toX(traj[i].x),     toY(traj[i].y), 6);
  }
  lp.addLine(toX(0), toY(0), toX(shot.range), toY(0), 4);

  // Robot velocity vectors
  const sx = toX(0), sy = toY(0);

  // Radial velocity (positive = toward hub, i.e. rightward in this view)
  if (Math.abs(shot.radialVelo) > 0.05) {
    drawArrow(c, sx, sy,
      sx + shot.radialVelo * robotVArrowScale,
      sy,
      '#f0883e', 'radial: ' + shot.radialVelo.toFixed(1) + ' m/s', undefined, lp);
  }

  // Tangential velocity
  if (Math.abs(shot.tangentialVelo) > 0.05) {
    drawArrow(c, sx, sy,
      sx,
      sy + shot.tangentialVelo * robotVArrowScale,
      '#da3633', 'tangential: ' + shot.tangentialVelo.toFixed(1) + ' m/s', undefined, lp);
  }

  // Turret adjustment angle arc
  if (Math.abs(shot.turretAdjRad) > 0.01) {
    const adjDeg = (shot.turretAdjRad * 180 / Math.PI).toFixed(1);
    drawAngleArc(c, sx, sy, 35, 0, shot.turretAdjRad, '#da3633',
      'turret: ' + adjDeg + '\u00B0', lp);
  }

  // Ball heading vector
  const ballHeading = shot.turretAdjRad;
  const ballVecLen = 70;
  const bhTipX = sx + ballVecLen * Math.cos(ballHeading);
  const bhTipY = sy + ballVecLen * Math.sin(ballHeading);
  drawArrow(c, sx, sy, bhTipX, bhTipY, '#58a6ff', null);
  lp.add({ text: 'ball heading', x: bhTipX, y: bhTipY - 14,
    font: 'bold 14px sans-serif', color: '#58a6ff' });

  // Resolve and draw
  lp.resolve();
  lp.draw();

  // Axis labels
  c.fillStyle = '#8b949e';
  c.font = '13px sans-serif';
  c.textAlign = 'center';
  const xStep = Math.ceil(xMax / 6);
  for (let x = 0; x <= xMax; x += xStep) {
    c.fillText(x + 'm', toX(x), h - 6);
  }
  c.textAlign = 'right';
  c.fillText('0', pad.left - 5, cy0 + 4);
  if (yExtent >= 0.5) {
    const yTick = Math.ceil(yExtent);
    c.fillText('+' + yTick + 'm', pad.left - 5, toY(yTick) + 4);
    c.fillText('-' + yTick + 'm', pad.left - 5, toY(-yTick) + 4);
  }
}
