// ═══════════════════════════════════════════════════════════════
//  Computation — heatmap + range chart
// ═══════════════════════════════════════════════════════════════

import { FIELD_WIDTH, FIELD_LENGTH, DISPLAY_BUFFER } from './constants';
import { evaluateShot, evaluateShotWithHint, evaluateShotAtRange } from './physics';
import type { Params, ShotResult, HeatmapData, RangeChartData } from './types';

// Sentinel value distinguishing "not yet computed" from "computed as null".
const UNCOMPUTED = undefined as unknown as (ShotResult | null);

/** Track a valid result in the running min/max stats. */
function accumStats(data: HeatmapData, result: ShotResult): void {
  data.validCount++;
  data.minSpeed = Math.min(data.minSpeed, result.shotSpeed);
  data.maxSpeed = Math.max(data.maxSpeed, result.shotSpeed);
  data.minAngle = Math.min(data.minAngle, result.hoodAngleDeg);
  data.maxAngle = Math.max(data.maxAngle, result.hoodAngleDeg);
}

/**
 * Compute field-view heatmap using seed-and-propagate.
 *
 *   Phase 1 — Seed grid: full sweep on a sparse sub-grid.
 *   Phase 2 — BFS propagation: Newton-only from valid seeds.
 *   Phase 3 — Stragglers: full sweep for unreached cells.
 *   Phase 4 — Neighbor recovery: one more hint pass for null cells
 *             adjacent to valid ones (fixes sweep mis-seeds).
 */
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

  // Allocate grid — UNCOMPUTED means "not yet evaluated".
  // After evaluation a cell is either a ShotResult or null.
  for (let r = 0; r < rows; r++) {
    data.results[r] = new Array(cols).fill(UNCOMPUTED);
  }

  // Seed spacing: keep seeds ≤ ~0.75 m apart regardless of grid resolution.
  const seedSpacing = Math.min(4, Math.max(1, Math.floor(0.75 / res)));

  // ── Phase 1: Seed grid (full sweep) ──────────────────────────
  const bfsQueue: [number, number][] = [];

  for (let r = 0; r < rows; r += seedSpacing) {
    for (let c = 0; c < cols; c += seedSpacing) {
      const fx = (c + 0.5) * res;
      const fy = (r + 0.5) * res;
      const result = evaluateShot(fx, fy, params);
      data.results[r][c] = result;
      if (result) {
        accumStats(data, result);
        bfsQueue.push([r, c]);
      }
    }
  }

  // ── Phase 2: BFS propagation (Newton with hint) ──────────────
  const DR = [-1, 1, 0, 0];
  const DC = [0, 0, -1, 1];
  let head = 0;

  while (head < bfsQueue.length) {
    const [pr, pc] = bfsQueue[head++];
    const parent = data.results[pr][pc]!; // always valid — only valid cells are enqueued

    for (let d = 0; d < 4; d++) {
      const nr = pr + DR[d];
      const nc = pc + DC[d];
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (data.results[nr][nc] !== UNCOMPUTED) continue; // already computed

      const fx = (nc + 0.5) * res;
      const fy = (nr + 0.5) * res;
      const result = evaluateShotWithHint(
        fx, fy, params,
        parent.shotSpeed, parent.hoodAngleDeg * Math.PI / 180,
      );
      data.results[nr][nc] = result;
      if (result) {
        accumStats(data, result);
        bfsQueue.push([nr, nc]);
      }
    }
  }

  // ── Phase 3: Sweep stragglers (cells BFS couldn't reach) ─────
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (data.results[r][c] !== UNCOMPUTED) continue;
      const fx = (c + 0.5) * res;
      const fy = (r + 0.5) * res;
      const result = evaluateShot(fx, fy, params);
      data.results[r][c] = result;
      if (result) {
        accumStats(data, result);
      }
    }
  }

  // ── Phase 4: Neighbor recovery ───────────────────────────────
  // Any null cell next to a valid one gets one more try using the
  // neighbor's (speed, angle) as a hint.  This recovers cells where
  // the full sweep picked the wrong speed but a neighbor found one
  // that works at a similar range.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (data.results[r][c] !== null) continue; // skip valid & uncomputed

      // Find a valid 4-connected neighbor to borrow a hint from.
      let hint: ShotResult | null = null;
      for (let d = 0; d < 4; d++) {
        const nr = r + DR[d];
        const nc = c + DC[d];
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && data.results[nr][nc]) {
          hint = data.results[nr][nc];
          break;
        }
      }
      if (!hint) continue;

      const fx = (c + 0.5) * res;
      const fy = (r + 0.5) * res;
      const result = evaluateShotWithHint(
        fx, fy, params,
        hint.shotSpeed, hint.hoodAngleDeg * Math.PI / 180,
      );
      if (result) {
        data.results[r][c] = result;
        accumStats(data, result);
      }
    }
  }

  return data;
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
