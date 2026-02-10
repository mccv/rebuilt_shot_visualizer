// ═══════════════════════════════════════════════════════════════
//  Tooltip — field map + range chart hover tooltips
// ═══════════════════════════════════════════════════════════════

import { FIELD_WIDTH } from './constants';
import { canvasToField } from './render';
import { getViewMode } from './controls';
import { state } from './state';
import type { LayoutCache, RangeChartLayout } from './types';

/** Bind pointer events for the tooltip on the main canvas. */
export function bindTooltip(canvas: HTMLCanvasElement): void {
  const tooltip = document.getElementById('tooltip')!;

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.parentElement!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    let html = '';

    if (getViewMode() === 'range') {
      // ── Range chart tooltip ──
      const rcd = state.rangeChartData;
      const rcl = state.rangeChartLayout as RangeChartLayout;
      if (!rcd || !rcl.panelPositions) {
        tooltip.style.display = 'none'; return;
      }
      const { padLeft, availW, panelH, cellW, cellH, panelPositions,
              distances, tangentials, radials } = rcl;

      let hitPanel: typeof panelPositions[0] | null = null;
      for (const p of panelPositions) {
        if (cy >= p.heatY && cy < p.heatY + panelH) { hitPanel = p; break; }
      }
      if (!hitPanel || cx < padLeft || cx > padLeft + availW) {
        tooltip.style.display = 'none'; return;
      }

      const relY = (hitPanel.heatY + panelH) - cy;
      const ti = Math.floor(relY / cellH);
      const di = Math.floor((cx - padLeft) / cellW);

      if (ti < 0 || ti >= tangentials.length || di < 0 || di >= distances.length) {
        tooltip.style.display = 'none'; return;
      }

      const result = rcd.panels[hitPanel.ri][ti][di];
      const radVal = radials[hitPanel.ri];
      const radSign = radVal > 0 ? '+' : radVal === 0 ? '' : '';

      html = `<div class="tt-header">Dist: ${distances[di].toFixed(2)} m \u00B7 Tan: ${tangentials[ti].toFixed(1)} m/s \u00B7 Rad: ${radSign}${radVal.toFixed(1)} m/s</div>`;
      if (result) {
        html += `<div class="tt-valid">\u2713 Valid Shot</div>`;
        html += `<div class="tt-row">Speed: ${result.shotSpeed.toFixed(1)} m/s</div>`;
        html += `<div class="tt-row">Hood Angle: ${result.hoodAngleDeg.toFixed(1)}\u00B0</div>`;
        html += `<div class="tt-row">Flight Time: ${result.flightTime.toFixed(3)} s</div>`;
        html += `<div class="tt-row">Apex: ${result.apexHeight.toFixed(2)} m</div>`;
        html += `<div class="tt-row">Vy at target: ${result.vyAtTarget.toFixed(2)} m/s \u2193</div>`;
      } else {
        html += `<div class="tt-invalid">\u2717 No Valid Shot</div>`;
      }

    } else {
      // ── Field map tooltip ──
      const [fx, fy] = canvasToField(cx, cy);
      const lc = state.layoutCache as LayoutCache;

      if (fx < 0 || fx > (lc.displayFieldLength || 16.54) || fy < 0 || fy > FIELD_WIDTH) {
        tooltip.style.display = 'none'; return;
      }

      let result = null;
      let cellFx = fx, cellFy = fy;
      const hd = state.heatmapData;
      if (hd) {
        const col = Math.floor(fx / hd.res);
        const row = Math.floor(fy / hd.res);
        if (row >= 0 && row < hd.rows && col >= 0 && col < hd.cols) {
          result = hd.results[row][col];
          cellFx = (col + 0.5) * hd.res;
          cellFy = (row + 0.5) * hd.res;

          if (!result && hd.refined) {
            const subResults = hd.refined.get(`${row},${col}`);
            if (subResults) {
              const subCol = Math.min(hd.subDiv! - 1,
                Math.max(0, Math.floor((fx - col * hd.res) / hd.subRes!)));
              const subRow = Math.min(hd.subDiv! - 1,
                Math.max(0, Math.floor((fy - row * hd.res) / hd.subRes!)));
              result = subResults[subRow][subCol];
              cellFx = col * hd.res + (subCol + 0.5) * hd.subRes!;
              cellFy = row * hd.res + (subRow + 0.5) * hd.subRes!;
            }
          }
        }
      }

      html = `<div class="tt-header">Cell: (${cellFx.toFixed(2)}, ${cellFy.toFixed(2)}) m</div>`;
      if (result) {
        html += `<div class="tt-valid">\u2713 Valid Shot</div>`;
        html += `<div class="tt-row">Speed: ${result.shotSpeed.toFixed(1)} m/s</div>`;
        html += `<div class="tt-row">Hood Angle: ${result.hoodAngleDeg.toFixed(1)}\u00B0</div>`;
        html += `<div class="tt-row">Flight Time: ${result.flightTime.toFixed(3)} s</div>`;
        html += `<div class="tt-row">Range: ${result.range.toFixed(2)} m</div>`;
        html += `<div class="tt-row">Apex: ${result.apexHeight.toFixed(2)} m</div>`;
        html += `<div class="tt-row">Vy at target: ${result.vyAtTarget.toFixed(2)} m/s \u2193</div>`;
      } else {
        html += `<div class="tt-invalid">\u2717 No Valid Shot</div>`;
      }
    }

    tooltip.innerHTML = html;
    tooltip.style.display = 'block';

    // Position tooltip avoiding edge overflow
    const ttRect = tooltip.getBoundingClientRect();
    let tx = e.clientX - rect.left + 14;
    let ty = e.clientY - rect.top - 10;
    if (tx + ttRect.width > rect.width) tx = e.clientX - rect.left - ttRect.width - 14;
    if (ty + ttRect.height > rect.height) ty = rect.height - ttRect.height - 4;
    if (ty < 4) ty = 4;

    tooltip.style.left = tx + 'px';
    tooltip.style.top  = ty + 'px';
  });

  canvas.parentElement!.addEventListener('pointerleave', () => {
    tooltip.style.display = 'none';
  });
}
