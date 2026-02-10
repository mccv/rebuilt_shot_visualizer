// ═══════════════════════════════════════════════════════════════
//  Main entry point — init, event wiring, resize
// ═══════════════════════════════════════════════════════════════

import './style.css';

import { state } from './state';
import { computeHeatmap, refineBoundary, computeRangeChart } from './compute';
import { bindCanvas, computeLayout, render } from './render';
import { readParams, updateValueDisplays, getViewMode, bindControls } from './controls';
import { bindTooltip } from './tooltip';
import { bindModal } from './modal';
import { applyUrlParams, pushStateToUrl, bindCopyLink } from './deeplink';
import type { Params } from './types';

function init(): void {
  const canvas = document.getElementById('field-canvas') as HTMLCanvasElement;

  // Bind modules to the main canvas
  bindCanvas(canvas);

  // Hydrate controls from URL before anything else
  applyUrlParams();

  // Compute initial layout
  computeLayout();
  updateValueDisplays();
  state.currentParams = readParams();

  const params = state.currentParams as Params;

  if (getViewMode() === 'range') {
    state.rangeChartData = computeRangeChart(params);
    document.getElementById('status')!.textContent =
      `${state.rangeChartData.validCount} / ${state.rangeChartData.totalCount} valid`;
  } else {
    state.heatmapData = computeHeatmap(params);
    refineBoundary(state.heatmapData, params);

    const total = state.heatmapData.cols * state.heatmapData.rows;
    const rvc = state.heatmapData.refinedValidCount || 0;
    const bc = state.heatmapData.boundaryCellCount || 0;
    let statusText = `${state.heatmapData.validCount} / ${total} valid`;
    if (bc > 0) statusText += ` \u00B7 ${bc} edges refined (+${rvc})`;
    document.getElementById('status')!.textContent = statusText;
  }

  render();
  pushStateToUrl();

  // Wire event handlers
  bindControls();
  bindTooltip(canvas);
  bindModal(canvas);
  bindCopyLink();

  // Resize handler
  window.addEventListener('resize', () => {
    computeLayout();
    render();
  });
}

init();
