// ═══════════════════════════════════════════════════════════════
//  Renderers — field map (heatmap) + range chart
// ═══════════════════════════════════════════════════════════════

import { FIELD_LENGTH, FIELD_WIDTH, DISPLAY_BUFFER } from './constants';
import { speedColor, angleColor, descentColor } from './drawing';
import { state } from './state';
import type { LayoutCache, RangeChartLayout, PanelPosition } from './types';

// ── Layout & coordinate transforms ──────────────────────────

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

/** Bind the main canvas element (called once at init). */
export function bindCanvas(c: HTMLCanvasElement): void {
  canvas = c;
  ctx = c.getContext('2d')!;
}

/** Recompute layout geometry for the main canvas. */
export function computeLayout(): void {
  const targetX = parseFloat(
    (document.getElementById('targetX') as HTMLInputElement).value,
  );
  const displayFieldLength = Math.min(FIELD_LENGTH, targetX + DISPLAY_BUFFER);

  const rect = canvas.parentElement!.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

  const cw = rect.width;
  const ch = rect.height;
  const pad = 50;
  const legendSpace = 80;
  const availW = cw - pad - legendSpace - pad;
  const availH = ch - 2 * pad;

  const scale = Math.min(availW / displayFieldLength, availH / FIELD_WIDTH);
  const fw = displayFieldLength * scale;
  const fh = FIELD_WIDTH * scale;
  const ox = pad + (availW - fw) / 2;
  const oy = pad + (availH - fh) / 2;

  state.layoutCache = {
    cw, ch, pad, scale, fw, fh, ox, oy,
    legendX: ox + fw + 20,
    displayFieldLength,
  };
}

/**
 * Convert field coordinates to canvas pixel coordinates.
 * Field: (0,0) top-right, X left, Y down.
 * Canvas: (0,0) top-left, X right, Y down.
 */
export function fieldToCanvas(fx: number, fy: number): [number, number] {
  const { ox, scale, fw, oy } = state.layoutCache as LayoutCache;
  return [
    ox + fw - fx * scale,
    oy + fy * scale,
  ];
}

export function canvasToField(cx: number, cy: number): [number, number] {
  const { ox, oy, scale, fw } = state.layoutCache as LayoutCache;
  return [
    (fw - (cx - ox)) / scale,
    (cy - oy) / scale,
  ];
}

// ── Field Map Renderer ──────────────────────────────────────

export function renderFieldMap(): void {
  const lc = state.layoutCache as LayoutCache;
  const { cw, ch, scale, fw, fh, ox, oy, legendX } = lc;
  const colorMode = (document.getElementById('colorMode') as HTMLSelectElement).value;

  ctx.clearRect(0, 0, cw, ch);

  // ── Field background ──
  ctx.fillStyle = '#0f1f0f';
  ctx.fillRect(ox, oy, fw, fh);

  // ── Heatmap cells ──
  const hd = state.heatmapData;
  if (hd) {
    const { cols, rows, res, results, minSpeed, maxSpeed, minAngle, maxAngle } = hd;
    const cellW = res * scale;
    const cellH = res * scale;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const result = results[r][c];
        if (!result) continue;

        const fx = (c + 0.5) * res;
        const fy = (r + 0.5) * res;
        const [px, py] = fieldToCanvas(fx, fy);

        let color: string;
        if (colorMode === 'descent') {
          color = descentColor(result.descentAngleDeg, 0.8);
        } else if (colorMode === 'speed') {
          const range = maxSpeed - minSpeed;
          const t = range > 0.01 ? (result.shotSpeed - minSpeed) / range : 0.5;
          color = speedColor(t, 0.8);
        } else {
          const range = maxAngle - minAngle;
          const t = range > 0.01 ? (result.hoodAngleDeg - minAngle) / range : 0.5;
          color = angleColor(t, 0.8);
        }

        ctx.fillStyle = color;
        ctx.fillRect(px - cellW / 2, py - cellH / 2, cellW, cellH);
      }
    }

  }

  // ── Grid lines every 1m ──
  const dfl = lc.displayFieldLength;
  ctx.strokeStyle = 'rgba(60, 100, 60, 0.35)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= dfl; x++) {
    const [px] = fieldToCanvas(x, 0);
    ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, oy + fh); ctx.stroke();
  }
  for (let y = 0; y <= FIELD_WIDTH; y++) {
    const [, py] = fieldToCanvas(0, y);
    ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox + fw, py); ctx.stroke();
  }

  // ── Field border ──
  ctx.strokeStyle = '#3fb950';
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, fw, fh);

  // ── Alliance wall (Blue, right side, field x=0) ──
  const [bx] = fieldToCanvas(0, 0);
  ctx.fillStyle = 'rgba(31, 111, 235, 0.3)';
  ctx.fillRect(bx - 4, oy, 8, fh);

  // ── Center line (only if within display range) ──
  const halfField = FIELD_LENGTH / 2;
  if (halfField <= dfl) {
    const [mx] = fieldToCanvas(halfField, 0);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(139, 148, 158, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, oy); ctx.lineTo(mx, oy + fh); ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Hub target marker ──
  const tgtX = parseFloat((document.getElementById('targetX') as HTMLInputElement).value);
  const tgtY = parseFloat((document.getElementById('targetY') as HTMLInputElement).value);
  const [hx, hy] = fieldToCanvas(tgtX, tgtY);

  ctx.beginPath();
  ctx.arc(hx, hy, 8, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(88, 166, 255, 0.6)';
  ctx.fill();
  ctx.strokeStyle = '#58a6ff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Crosshair
  ctx.beginPath();
  ctx.moveTo(hx - 12, hy); ctx.lineTo(hx + 12, hy);
  ctx.moveTo(hx, hy - 12); ctx.lineTo(hx, hy + 12);
  ctx.strokeStyle = '#58a6ff';
  ctx.lineWidth = 1;
  ctx.stroke();

  // ── Axis labels ──
  ctx.fillStyle = '#8b949e';
  ctx.font = '13px sans-serif';

  // X labels along bottom — dynamic step
  ctx.textAlign = 'center';
  const xTickPx = 2 * scale;
  const fieldXStep = xTickPx < 36 ? 4 : 2;
  for (let x = 0; x <= dfl; x += fieldXStep) {
    const [px] = fieldToCanvas(x, 0);
    ctx.fillText(x + 'm', px, oy + fh + 18);
  }

  // Y labels along right side — dynamic step
  ctx.textAlign = 'left';
  const yTickPx = 2 * scale;
  const fieldYStep = yTickPx < 36 ? 4 : 2;
  for (let y = 0; y <= FIELD_WIDTH; y += fieldYStep) {
    const [px, py] = fieldToCanvas(0, y);
    ctx.fillText(y + 'm', px + 12, py + 5);
  }

  // Alliance label
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#58a6ff';
  ctx.fillText('BLUE', bx, oy - 8);

  // ── Legend ──
  if (hd && hd.validCount > 0) {
    const lx = legendX;
    const ly = oy;
    const lw = 18;
    const lh = fh;

    if (colorMode === 'descent') {
      // Fixed-scale legend: 60° (top/green) → 15° (bottom/red)
      for (let i = 0; i < lh; i++) {
        const deg = 60 - (i / lh) * (60 - 15); // top=60°, bottom=15°
        ctx.fillStyle = descentColor(deg, 0.9);
        ctx.fillRect(lx, ly + i, lw, 1);
      }
    } else {
      const colorFn = colorMode === 'speed' ? speedColor : angleColor;
      for (let i = 0; i < lh; i++) {
        const t = 1 - i / lh;
        ctx.fillStyle = colorFn(t, 0.9);
        ctx.fillRect(lx, ly + i, lw, 1);
      }
    }

    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.strokeRect(lx, ly, lw, lh);

    ctx.fillStyle = '#c9d1d9';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';

    if (colorMode === 'descent') {
      ctx.fillText('60\u00B0+', lx + lw + 6, ly + 12);
      ctx.fillText('15\u00B0\u2212', lx + lw + 6, ly + lh);
      ctx.fillText('Descent', lx - 2, ly - 6);
    } else if (colorMode === 'speed') {
      ctx.fillText(hd.maxSpeed.toFixed(1) + ' m/s', lx + lw + 6, ly + 12);
      ctx.fillText(hd.minSpeed.toFixed(1) + ' m/s', lx + lw + 6, ly + lh);
      ctx.fillText('Speed', lx - 2, ly - 6);
    } else {
      ctx.fillText(hd.maxAngle.toFixed(1) + '\u00B0', lx + lw + 6, ly + 12);
      ctx.fillText(hd.minAngle.toFixed(1) + '\u00B0', lx + lw + 6, ly + lh);
      ctx.fillText('Angle', lx - 2, ly - 6);
    }
  }
}


// ── Range Chart Renderer ────────────────────────────────────

export function renderRangeChart(): void {
  const lc = state.layoutCache as LayoutCache;
  const { cw, ch } = lc;
  const colorMode = (document.getElementById('colorMode') as HTMLSelectElement).value;

  ctx.clearRect(0, 0, cw, ch);

  const rcd = state.rangeChartData;
  if (!rcd) return;

  const { distances, tangentials, radials, panels } = rcd;
  const numPanels = radials.length;

  // Layout
  const padTop = 24, padBottom = 48, padLeft = 80, padRight = 90;
  const legendW = 18, legendGap = 20;
  const gapBetweenPanels = 4;
  const labelHeight = 16;

  const availW = cw - padLeft - padRight - legendW - legendGap - 40;
  const totalVertOverhead = numPanels * labelHeight + (numPanels - 1) * gapBetweenPanels;
  const availH = ch - padTop - padBottom - totalVertOverhead;
  const panelH = Math.max(20, availH / numPanels);

  const cellW = availW / distances.length;
  const cellH = panelH / tangentials.length;

  // Store layout for tooltip hit-testing
  const panelPositions: PanelPosition[] = [];
  for (let ri = 0; ri < numPanels; ri++) {
    const py = padTop + ri * (panelH + labelHeight + gapBetweenPanels);
    panelPositions.push({ labelY: py, heatY: py + labelHeight, ri });
  }
  state.rangeChartLayout = {
    padLeft, availW, panelH, cellW, cellH,
    panelPositions, distances, tangentials, radials,
  } as RangeChartLayout;

  // Draw each panel
  for (let ri = 0; ri < numPanels; ri++) {
    const { labelY, heatY } = panelPositions[ri];
    const panel = panels[ri];

    // Panel label
    ctx.fillStyle = '#c9d1d9';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    const radLabel = radials[ri] > 0 ? `+${radials[ri].toFixed(0)}` :
                     radials[ri] === 0 ? ' 0' : radials[ri].toFixed(0);
    ctx.fillText(`Radial: ${radLabel} m/s`, padLeft, labelY + labelHeight - 3);

    // Background
    ctx.fillStyle = '#0f1f0f';
    ctx.fillRect(padLeft, heatY, availW, panelH);

    // Heatmap cells
    for (let ti = 0; ti < tangentials.length; ti++) {
      for (let di = 0; di < distances.length; di++) {
        const result = panel[ti][di];
        if (!result) continue;

        let color: string;
        if (colorMode === 'descent') {
          color = descentColor(result.descentAngleDeg, 0.85);
        } else if (colorMode === 'speed') {
          const range = rcd.maxSpeed - rcd.minSpeed;
          const t = range > 0.01 ? (result.shotSpeed - rcd.minSpeed) / range : 0.5;
          color = speedColor(t, 0.85);
        } else {
          const range = rcd.maxAngle - rcd.minAngle;
          const t = range > 0.01 ? (result.hoodAngleDeg - rcd.minAngle) / range : 0.5;
          color = angleColor(t, 0.85);
        }

        ctx.fillStyle = color;
        const cellY = heatY + panelH - (ti + 1) * cellH;
        const cellX = padLeft + di * cellW;
        ctx.fillRect(cellX, cellY, cellW + 0.5, cellH + 0.5);
      }
    }

    // Panel border
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.strokeRect(padLeft, heatY, availW, panelH);

    // Y-axis labels — adaptive step
    ctx.fillStyle = '#8b949e';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    const minTickGap = 18;
    const tanLabelStep = Math.max(1, Math.ceil(minTickGap / cellH));
    for (let ti = 0; ti < tangentials.length; ti += tanLabelStep) {
      const y = heatY + panelH - (ti + 0.5) * cellH;
      ctx.fillText(tangentials[ti].toFixed(1), padLeft - 5, y + 4);
    }
    // Always show last label if it won't overlap
    const lastTi = tangentials.length - 1;
    const lastY = heatY + panelH - (lastTi + 0.5) * cellH;
    const prevShownTi = Math.floor(lastTi / tanLabelStep) * tanLabelStep;
    const prevShownY = heatY + panelH - (prevShownTi + 0.5) * cellH;
    if (lastTi !== prevShownTi && Math.abs(lastY - prevShownY) > minTickGap) {
      ctx.fillText(tangentials[lastTi].toFixed(1), padLeft - 5, lastY + 4);
    }
  }

  // X-axis labels — adaptive step
  const lastPanel = panelPositions[numPanels - 1];
  const bottomY = lastPanel.heatY + panelH;
  ctx.fillStyle = '#8b949e';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';

  const minXTickGap = 36;
  const distLabelStep = Math.max(1, Math.ceil(minXTickGap / cellW));
  for (let di = 0; di < distances.length; di += distLabelStep) {
    const x = padLeft + (di + 0.5) * cellW;
    ctx.fillText(distances[di].toFixed(1), x, bottomY + 16);
  }

  // Axis titles
  ctx.fillStyle = '#58a6ff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Distance to Target (m)', padLeft + availW / 2, bottomY + 36);

  // Y-axis title (rotated)
  ctx.save();
  const midY = padTop + (bottomY - padTop) / 2;
  ctx.translate(15, midY);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Tangential Velocity (m/s)', 0, 0);
  ctx.restore();

  // Legend
  const legendX = padLeft + availW + legendGap;
  const legendTop = panelPositions[0].heatY;
  const legendH = bottomY - legendTop;

  if (rcd.validCount > 0 && legendH > 10) {
    if (colorMode === 'descent') {
      for (let i = 0; i < legendH; i++) {
        const deg = 60 - (i / legendH) * (60 - 15);
        ctx.fillStyle = descentColor(deg, 0.9);
        ctx.fillRect(legendX, legendTop + i, legendW, 1);
      }
    } else {
      const colorFn = colorMode === 'speed' ? speedColor : angleColor;
      for (let i = 0; i < legendH; i++) {
        const t = 1 - i / legendH;
        ctx.fillStyle = colorFn(t, 0.9);
        ctx.fillRect(legendX, legendTop + i, legendW, 1);
      }
    }

    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX, legendTop, legendW, legendH);

    ctx.fillStyle = '#c9d1d9';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';

    if (colorMode === 'descent') {
      ctx.fillText('60\u00B0+', legendX + legendW + 6, legendTop + 12);
      ctx.fillText('15\u00B0\u2212', legendX + legendW + 6, legendTop + legendH);
      ctx.fillText('Descent', legendX - 2, legendTop - 6);
    } else if (colorMode === 'speed') {
      ctx.fillText(rcd.maxSpeed.toFixed(1) + ' m/s', legendX + legendW + 6, legendTop + 12);
      ctx.fillText(rcd.minSpeed.toFixed(1) + ' m/s', legendX + legendW + 6, legendTop + legendH);
      ctx.fillText('Speed', legendX - 2, legendTop - 6);
    } else {
      ctx.fillText(rcd.maxAngle.toFixed(1) + '\u00B0', legendX + legendW + 6, legendTop + 12);
      ctx.fillText(rcd.minAngle.toFixed(1) + '\u00B0', legendX + legendW + 6, legendTop + legendH);
      ctx.fillText('Angle', legendX - 2, legendTop - 6);
    }
  }
}

/** Top-level render dispatch — picks field map or range chart. */
export function render(): void {
  const viewBtn = document.querySelector('[data-group="view"] button.active') as HTMLButtonElement | null;
  const viewMode = viewBtn ? viewBtn.dataset.mode : 'field';
  if (viewMode === 'range') {
    renderRangeChart();
  } else {
    renderFieldMap();
  }
}
