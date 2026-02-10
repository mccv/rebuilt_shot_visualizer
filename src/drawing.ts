// ═══════════════════════════════════════════════════════════════
//  Drawing utilities — arrows, arcs, canvas prep, color ramps
// ═══════════════════════════════════════════════════════════════

import type { LabelPlacer } from './labels';

/** Set up a canvas for HiDPI and return { ctx, w, h } in CSS pixels. */
export function prepCanvas(canvasEl: HTMLCanvasElement): {
  c: CanvasRenderingContext2D;
  w: number;
  h: number;
} {
  const rect = canvasEl.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  canvasEl.width = w * devicePixelRatio;
  canvasEl.height = h * devicePixelRatio;
  const c = canvasEl.getContext('2d')!;
  c.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  return { c, w, h };
}

/** HSL-based color ramp for shot speed: blue (low) → red (high). */
export function speedColor(t: number, alpha: number): string {
  const h = 240 - t * 240; // 240=blue → 0=red
  return `hsla(${h}, 85%, 55%, ${alpha})`;
}

/** HSL-based color ramp for hood angle: green (shallow) → orange (steep). */
export function angleColor(t: number, alpha: number): string {
  const h = 130 - t * 100; // 130=green → 30=orange
  return `hsla(${h}, 80%, 50%, ${alpha})`;
}

/**
 * Draw an arrow from (x1,y1) to (x2,y2) with optional label.
 * If labelPlacer is provided, the label is deferred for collision resolution.
 */
export function drawArrow(
  c: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  color: string,
  label?: string | null,
  headSize?: number,
  labelPlacer?: LabelPlacer,
): void {
  headSize = headSize || 10;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  const ang = Math.atan2(dy, dx);

  c.save();
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();

  // Arrowhead
  c.beginPath();
  c.moveTo(x2, y2);
  c.lineTo(x2 - headSize * Math.cos(ang - 0.45), y2 - headSize * Math.sin(ang - 0.45));
  c.lineTo(x2 - headSize * Math.cos(ang + 0.45), y2 - headSize * Math.sin(ang + 0.45));
  c.closePath();
  c.fill();
  c.restore();

  // Register the arrow shaft + head as obstacles for label avoidance
  if (labelPlacer) {
    labelPlacer.addLine(x1, y1, x2, y2, 8);
  }

  // Label — bold, with dark background for readability
  // Positioned 70% towards arrowhead so it sits near the tip
  if (label) {
    const LABEL_FONT = 'bold 14px sans-serif';
    const bias = 0.70;
    const mx = x1 + dx * bias, my = y1 + dy * bias;
    const nx = -dy / len * 18, ny = dx / len * 18;
    const lx = mx + nx, ly = my + ny;

    if (labelPlacer) {
      labelPlacer.add({ text: label, x: lx, y: ly, font: LABEL_FONT, color });
    } else {
      c.save();
      c.font = LABEL_FONT;
      c.textAlign = 'center';
      c.textBaseline = 'bottom';
      const metrics = c.measureText(label);
      const tw = metrics.width + 10, th = 18;
      c.fillStyle = 'rgba(13, 17, 23, 0.88)';
      c.fillRect(lx - tw / 2, ly - th, tw, th);
      c.fillStyle = color;
      c.fillText(label, lx, ly - 2);
      c.restore();
    }
  }
}

/**
 * Draw an arc to show an angle, with optional label.
 * If labelPlacer is provided, the label is deferred for collision resolution.
 */
export function drawAngleArc(
  c: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  startAngle: number, endAngle: number,
  color: string,
  label?: string | null,
  labelPlacer?: LabelPlacer,
): void {
  c.save();
  c.strokeStyle = color;
  c.lineWidth = 2;
  c.beginPath();
  c.arc(cx, cy, r, startAngle, endAngle, endAngle < startAngle);
  c.stroke();
  c.restore();

  // Register the arc path as obstacles for label avoidance
  if (labelPlacer) {
    labelPlacer.addArc(cx, cy, r, startAngle, endAngle, 6);
  }

  if (label) {
    const LABEL_FONT = 'bold 14px sans-serif';
    const mid = (startAngle + endAngle) / 2;
    const lx = cx + (r + 20) * Math.cos(mid);
    const ly = cy + (r + 20) * Math.sin(mid);

    if (labelPlacer) {
      labelPlacer.add({ text: label, x: lx, y: ly, font: LABEL_FONT, color, baseline: 'middle' });
    } else {
      c.save();
      c.font = LABEL_FONT;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const metrics = c.measureText(label);
      const tw = metrics.width + 10, th = 18;
      c.fillStyle = 'rgba(13, 17, 23, 0.88)';
      c.fillRect(lx - tw / 2, ly - th / 2, tw, th);
      c.fillStyle = color;
      c.fillText(label, lx, ly);
      c.restore();
    }
  }
}
