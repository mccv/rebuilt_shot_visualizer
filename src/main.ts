// ═══════════════════════════════════════════════════════════════
//  Main entry point — init, event wiring, resize
// ═══════════════════════════════════════════════════════════════

import './style.css';

import { state } from './state';
import { computeHeatmap, computeRangeChart } from './compute';
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
    const total = state.heatmapData.cols * state.heatmapData.rows;
    document.getElementById('status')!.textContent =
      `${state.heatmapData.validCount} / ${total} valid`;
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
