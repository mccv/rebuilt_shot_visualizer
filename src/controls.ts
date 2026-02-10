// ═══════════════════════════════════════════════════════════════
//  Controls — read params, update displays, schedule recalc
// ═══════════════════════════════════════════════════════════════

import { state } from './state';
import { computeHeatmap, computeRangeChart } from './compute';
import { computeLayout, render } from './render';
import { pushStateToUrl } from './deeplink';
import type { Params } from './types';

export function getViewMode(): string {
  const btn = document.querySelector('[data-group="view"] button.active') as HTMLButtonElement | null;
  return btn ? btn.dataset.mode! : 'field';
}

export function readParams(): Params {
  const speedBtns = document.querySelectorAll('[data-group="speed"] button');
  const angleBtns = document.querySelectorAll('[data-group="angle"] button');
  const speedMode = [...speedBtns].find(b => b.classList.contains('active'))!.getAttribute('data-mode')!;
  const angleMode = [...angleBtns].find(b => b.classList.contains('active'))!.getAttribute('data-mode')!;

  return {
    speedMode,
    minSpeed:       parseFloat((document.getElementById('minSpeed') as HTMLInputElement).value),
    maxSpeed:       parseFloat((document.getElementById('maxSpeed') as HTMLInputElement).value),
    fixedSpeed:     parseFloat((document.getElementById('fixedSpeed') as HTMLInputElement).value),
    angleMode,
    minAngle:       parseFloat((document.getElementById('minAngle') as HTMLInputElement).value),
    maxAngle:       parseFloat((document.getElementById('maxAngle') as HTMLInputElement).value),
    fixedAngle:     parseFloat((document.getElementById('fixedAngle') as HTMLInputElement).value),
    tangentialVelo: parseFloat((document.getElementById('tangentialVelo') as HTMLInputElement).value),
    radialVelo:     parseFloat((document.getElementById('radialVelo') as HTMLInputElement).value),
    gridRes:        parseFloat((document.getElementById('gridRes') as HTMLInputElement).value),
    shooterZ:       parseFloat((document.getElementById('shooterZ') as HTMLInputElement).value),
    ceilingHeight:  parseFloat((document.getElementById('ceilingHeight') as HTMLInputElement).value),
    targetX:        parseFloat((document.getElementById('targetX') as HTMLInputElement).value),
    targetY:        parseFloat((document.getElementById('targetY') as HTMLInputElement).value),
    targetZ:        parseFloat((document.getElementById('targetZ') as HTMLInputElement).value),
    maxVyAtTarget:  parseFloat((document.getElementById('maxVyAtTarget') as HTMLInputElement).value),
  };
}

export function updateValueDisplays(): void {
  const val = (id: string) => parseFloat((document.getElementById(id) as HTMLInputElement).value);
  document.getElementById('minSpeed-val')!.textContent       = val('minSpeed').toFixed(1) + ' m/s';
  document.getElementById('maxSpeed-val')!.textContent       = val('maxSpeed').toFixed(1) + ' m/s';
  document.getElementById('fixedSpeed-val')!.textContent     = val('fixedSpeed').toFixed(1) + ' m/s';
  document.getElementById('minAngle-val')!.textContent       = val('minAngle').toFixed(1) + '\u00B0';
  document.getElementById('maxAngle-val')!.textContent       = val('maxAngle').toFixed(1) + '\u00B0';
  document.getElementById('fixedAngle-val')!.textContent     = val('fixedAngle').toFixed(1) + '\u00B0';
  document.getElementById('tangentialVelo-val')!.textContent = val('tangentialVelo').toFixed(1) + ' m/s';
  document.getElementById('radialVelo-val')!.textContent     = val('radialVelo').toFixed(1) + ' m/s';
  document.getElementById('gridRes-val')!.textContent        = val('gridRes').toFixed(2) + ' m';
  document.getElementById('shooterZ-val')!.textContent       = val('shooterZ').toFixed(2) + ' m';
  document.getElementById('ceilingHeight-val')!.textContent  = val('ceilingHeight').toFixed(1) + ' m';
  document.getElementById('targetX-val')!.textContent        = val('targetX').toFixed(2) + ' m';
  document.getElementById('targetY-val')!.textContent        = val('targetY').toFixed(2) + ' m';
  document.getElementById('targetZ-val')!.textContent        = val('targetZ').toFixed(2) + ' m';
  document.getElementById('maxVyAtTarget-val')!.textContent  = val('maxVyAtTarget').toFixed(1) + ' m/s';
}

export function scheduleRecalc(): void {
  updateValueDisplays();
  pushStateToUrl();
  if (state.recalcTimer !== null) clearTimeout(state.recalcTimer);
  state.recalcTimer = setTimeout(() => {
    state.currentParams = readParams();
    document.getElementById('status')!.textContent = 'Computing...';

    requestAnimationFrame(() => {
      computeLayout();
      const t0 = performance.now();
      const params = state.currentParams as Params;

      if (getViewMode() === 'range') {
        state.rangeChartData = computeRangeChart(params);
        const dt = (performance.now() - t0).toFixed(0);
        document.getElementById('status')!.textContent =
          `${state.rangeChartData.validCount} / ${state.rangeChartData.totalCount} valid \u00B7 ${dt} ms`;
      } else {
        state.heatmapData = computeHeatmap(params);
        const dt = (performance.now() - t0).toFixed(0);
        const total = state.heatmapData.cols * state.heatmapData.rows;
        document.getElementById('status')!.textContent =
          `${state.heatmapData.validCount} / ${total} valid \u00B7 ${dt} ms`;
      }

      render();
    });
  }, 80);
}

/** Wire mode toggle buttons and slider inputs. */
export function bindControls(): void {
  // Mode toggle buttons
  document.querySelectorAll('.mode-toggle').forEach(toggle => {
    const group = (toggle as HTMLElement).dataset.group;
    toggle.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        toggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (group === 'speed') {
          document.getElementById('speed-variable')!.style.display = (btn as HTMLElement).dataset.mode === 'variable' ? '' : 'none';
          document.getElementById('speed-fixed')!.style.display    = (btn as HTMLElement).dataset.mode === 'fixed' ? '' : 'none';
        } else if (group === 'angle') {
          document.getElementById('angle-variable')!.style.display = (btn as HTMLElement).dataset.mode === 'variable' ? '' : 'none';
          document.getElementById('angle-fixed')!.style.display    = (btn as HTMLElement).dataset.mode === 'fixed' ? '' : 'none';
        } else if (group === 'view') {
          document.getElementById('robot-velocity-group')!.style.display =
            (btn as HTMLElement).dataset.mode === 'range' ? 'none' : '';
        }

        scheduleRecalc();
      });
    });
  });

  // All sliders and selects trigger recalc
  document.querySelectorAll('#sidebar input[type="range"], #sidebar select').forEach(el => {
    el.addEventListener('input', scheduleRecalc);
  });
}
