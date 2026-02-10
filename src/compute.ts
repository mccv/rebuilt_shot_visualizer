// ═══════════════════════════════════════════════════════════════
//  Computation — heatmap, boundary refinement, range chart
// ═══════════════════════════════════════════════════════════════

import { FIELD_WIDTH, FIELD_LENGTH, DISPLAY_BUFFER } from './constants';
import { evaluateShot, evaluateShotAtRange } from './physics';
import type { Params, HeatmapData, RangeChartData } from './types';

/** Compute field-view heatmap: sweep over (x, y) grid positions. */
export function computeHeatmap(params: Params): HeatmapData {
  const res = params.gridRes;
  const displayLength = Math.min(FIELD_LENGTH, params.targetX + DISPLAY_BUFFER);
  const cols = Math.ceil(displayLength / res);
  const rows = Math.ceil(FIELD_WIDTH / res);

  const data: HeatmapData = {
    cols, rows, res, results: [],
    minSpeed: Infinity, maxSpeed: -Infinity,
    minAngle: Infinity, maxAngle: -Infinity,
    validCount: 0,
  };

  for (let r = 0; r < rows; r++) {
    data.results[r] = [];
    for (let c = 0; c < cols; c++) {
      const fx = (c + 0.5) * res;
      const fy = (r + 0.5) * res;
      const result = evaluateShot(fx, fy, params);
      data.results[r][c] = result;

      if (result) {
        data.validCount++;
        data.minSpeed = Math.min(data.minSpeed, result.shotSpeed);
        data.maxSpeed = Math.max(data.maxSpeed, result.shotSpeed);
        data.minAngle = Math.min(data.minAngle, result.hoodAngleDeg);
        data.maxAngle = Math.max(data.maxAngle, result.hoodAngleDeg);
      }
    }
  }

  return data;
}

/**
 * After the coarse grid pass, find every null cell with at least one
 * valid 8-connected neighbor and re-evaluate it on a finer sub-grid.
 */
export function refineBoundary(data: HeatmapData, params: Params): void {
  const { cols, rows, res, results } = data;
  const subDiv = 4;
  const subRes = res / subDiv;
  const refined = new Map<string, (import('./types').ShotResult | null)[][]>();
  let refinedValidCount = 0;
  let boundaryCellCount = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (results[r][c] !== null) continue;

      // Check 8-connected neighbors for any valid cell
      let hasValidNeighbor = false;
      for (let dr = -1; dr <= 1 && !hasValidNeighbor; dr++) {
        for (let dc = -1; dc <= 1 && !hasValidNeighbor; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && results[nr][nc]) {
            hasValidNeighbor = true;
          }
        }
      }
      if (!hasValidNeighbor) continue;

      boundaryCellCount++;
      const baseX = c * res;
      const baseY = r * res;
      const subResults: (import('./types').ShotResult | null)[][] = [];

      for (let sr = 0; sr < subDiv; sr++) {
        subResults[sr] = [];
        for (let sc = 0; sc < subDiv; sc++) {
          const fx = baseX + (sc + 0.5) * subRes;
          const fy = baseY + (sr + 0.5) * subRes;
          const result = evaluateShot(fx, fy, params);
          subResults[sr][sc] = result;

          if (result) {
            refinedValidCount++;
            data.minSpeed = Math.min(data.minSpeed, result.shotSpeed);
            data.maxSpeed = Math.max(data.maxSpeed, result.shotSpeed);
            data.minAngle = Math.min(data.minAngle, result.hoodAngleDeg);
            data.maxAngle = Math.max(data.maxAngle, result.hoodAngleDeg);
          }
        }
      }

      refined.set(`${r},${c}`, subResults);
    }
  }

  data.refined = refined;
  data.subDiv = subDiv;
  data.subRes = subRes;
  data.refinedValidCount = refinedValidCount;
  data.boundaryCellCount = boundaryCellCount;
}

/**
 * Compute range chart data: sweep over distance × tangential × radial.
 */
export function computeRangeChart(params: Params): RangeChartData {
  const distMin = 0.5, distMax = 10, distStep = 0.25;
  const tanMin = 0, tanMax = 5, tanStep = 0.5;
  const radMin = -3, radMax = 3, radStep = 1;

  const distances: number[] = [];
  for (let d = distMin; d <= distMax + 0.001; d += distStep)
    distances.push(Math.round(d * 100) / 100);

  const tangentials: number[] = [];
  for (let t = tanMin; t <= tanMax + 0.001; t += tanStep)
    tangentials.push(Math.round(t * 10) / 10);

  const radials: number[] = [];
  for (let r = radMin; r <= radMax + 0.001; r += radStep)
    radials.push(Math.round(r * 10) / 10);

  const data: RangeChartData = {
    distances, tangentials, radials,
    panels: [],
    minSpeed: Infinity, maxSpeed: -Infinity,
    minAngle: Infinity, maxAngle: -Infinity,
    validCount: 0, totalCount: 0,
  };

  for (let ri = 0; ri < radials.length; ri++) {
    const panel: (import('./types').ShotResult | null)[][] = [];
    for (let ti = 0; ti < tangentials.length; ti++) {
      panel[ti] = [];
      for (let di = 0; di < distances.length; di++) {
        const result = evaluateShotAtRange(
          distances[di], tangentials[ti], radials[ri], params,
        );
        panel[ti][di] = result;
        data.totalCount++;
        if (result) {
          data.validCount++;
          data.minSpeed = Math.min(data.minSpeed, result.shotSpeed);
          data.maxSpeed = Math.max(data.maxSpeed, result.shotSpeed);
          data.minAngle = Math.min(data.minAngle, result.hoodAngleDeg);
          data.maxAngle = Math.max(data.maxAngle, result.hoodAngleDeg);
        }
      }
    }
    data.panels[ri] = panel;
  }

  return data;
}
