// ═══════════════════════════════════════════════════════════════
//  Shot Modal — open / close / expand / click handling
// ═══════════════════════════════════════════════════════════════

import { state } from './state';
import { canvasToField } from './render';
import { computeDetailedShot } from './physics';
import { getViewMode } from './controls';
import { renderSideView } from './views/sideView';
import { renderTopView } from './views/topView';
import { renderBackView } from './views/backView';
import { populateShotInfo } from './views/shotInfo';
import type { DetailedShot, LayoutCache, RangeChartLayout, Params } from './types';

// ── Panel renderer lookup ───────────────────────────────────

type PanelRenderer = (canvas: HTMLCanvasElement, shot: DetailedShot) => void;

function getPanelRenderer(panelEl: Element): PanelRenderer | null {
  const cv = panelEl.querySelector('canvas');
  if (!cv) return null;
  if (cv.id === 'cv-side') return renderSideView;
  if (cv.id === 'cv-top')  return renderTopView;
  if (cv.id === 'cv-back') return renderBackView;
  return null;
}

function renderAllPanels(shot: DetailedShot): void {
  renderSideView(document.getElementById('cv-side') as HTMLCanvasElement, shot);
  renderTopView(document.getElementById('cv-top') as HTMLCanvasElement, shot);
  renderBackView(document.getElementById('cv-back') as HTMLCanvasElement, shot);
}

// ── Open / Close ────────────────────────────────────────────

function collapseExpandedPanel(): void {
  const panels = document.querySelectorAll('#shot-modal-grid .shot-panel');
  let wasExpanded = false;
  panels.forEach(p => {
    if (p.classList.contains('expanded') || p.classList.contains('collapsed')) wasExpanded = true;
    p.classList.remove('expanded', 'collapsed');
  });
  if (wasExpanded && state.currentDetailedShot) {
    requestAnimationFrame(() => renderAllPanels(state.currentDetailedShot!));
  }
}

function openShotModal(shot: DetailedShot): void {
  state.currentDetailedShot = shot;
  collapseExpandedPanel();

  const backdrop = document.getElementById('shot-modal-backdrop')!;
  backdrop.style.display = 'flex';

  document.getElementById('shot-modal-title')!.textContent =
    `Shot Trajectory \u2014 ${shot.range.toFixed(1)}m, ${shot.speed.toFixed(1)} m/s, ${shot.hoodAngleDeg.toFixed(1)}\u00B0`;

  populateShotInfo(shot);
  requestAnimationFrame(() => renderAllPanels(shot));
}

function closeShotModal(): void {
  collapseExpandedPanel();
  document.getElementById('shot-modal-backdrop')!.style.display = 'none';
  state.currentDetailedShot = null;
}

function expandPanel(panelEl: Element): void {
  if (!state.currentDetailedShot) return;
  const panels = document.querySelectorAll('#shot-modal-grid .shot-panel');
  panels.forEach(p => {
    if (p === panelEl) {
      p.classList.add('expanded');
      p.classList.remove('collapsed');
    } else {
      p.classList.add('collapsed');
      p.classList.remove('expanded');
    }
  });

  requestAnimationFrame(() => {
    const renderer = getPanelRenderer(panelEl);
    if (renderer) {
      renderer(panelEl.querySelector('canvas')!, state.currentDetailedShot!);
    }
  });
}

// ── Event Binding ───────────────────────────────────────────

export function bindModal(mainCanvas: HTMLCanvasElement): void {
  // Panel click → expand / collapse
  document.querySelectorAll('#shot-modal-grid .shot-panel').forEach(panel => {
    panel.addEventListener('click', (e) => {
      e.stopPropagation();
      if (panel.classList.contains('expanded')) {
        collapseExpandedPanel();
      } else {
        expandPanel(panel);
      }
    });
  });

  // Close on backdrop click, close button, Escape
  document.getElementById('shot-modal-backdrop')!.addEventListener('click', (e) => {
    if ((e.target as Element).id === 'shot-modal-backdrop') closeShotModal();
  });
  document.getElementById('shot-modal-close')!.addEventListener('click', closeShotModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const expanded = document.querySelector('#shot-modal-grid .shot-panel.expanded');
      if (expanded) {
        collapseExpandedPanel();
      } else {
        closeShotModal();
      }
    }
  });

  // Click on main canvas → open modal
  mainCanvas.addEventListener('click', (e) => {
    const rect = mainCanvas.parentElement!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const params = state.currentParams as Params;

    let result = null;
    let tangentialVelo = params.tangentialVelo;
    let radialVelo = params.radialVelo;

    if (getViewMode() === 'range') {
      const rcd = state.rangeChartData;
      const rcl = state.rangeChartLayout as RangeChartLayout;
      if (!rcd || !rcl.panelPositions) return;
      const { padLeft, availW, panelH, cellW, cellH, panelPositions,
              distances, tangentials, radials } = rcl;

      let hitPanel: typeof panelPositions[0] | null = null;
      for (const p of panelPositions) {
        if (cy >= p.heatY && cy < p.heatY + panelH) { hitPanel = p; break; }
      }
      if (!hitPanel || cx < padLeft || cx > padLeft + availW) return;

      const relY = (hitPanel.heatY + panelH) - cy;
      const ti = Math.floor(relY / cellH);
      const di = Math.floor((cx - padLeft) / cellW);
      if (ti < 0 || ti >= tangentials.length || di < 0 || di >= distances.length) return;

      result = rcd.panels[hitPanel.ri][ti][di];
      tangentialVelo = tangentials[ti];
      radialVelo = radials[hitPanel.ri];

    } else {
      const lc = state.layoutCache as LayoutCache;
      const [fx, fy] = canvasToField(cx, cy);
      if (fx < 0 || fx > (lc.displayFieldLength || 16.54) || fy < 0 || fy > 8.07) return;

      const hd = state.heatmapData;
      if (hd) {
        const col = Math.floor(fx / hd.res);
        const row = Math.floor(fy / hd.res);
        if (row >= 0 && row < hd.rows && col >= 0 && col < hd.cols) {
          result = hd.results[row][col];
        }
      }
    }

    if (!result) return;

    const detailed = computeDetailedShot(result, tangentialVelo, radialVelo, params);
    openShotModal(detailed);
  });
}
