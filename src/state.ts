// ═══════════════════════════════════════════════════════════════
//  Shared mutable state — imported by modules that need it
// ═══════════════════════════════════════════════════════════════

import type {
  HeatmapData,
  RangeChartData,
  RangeChartLayout,
  LayoutCache,
  Params,
  DetailedShot,
} from './types';

export const state = {
  heatmapData: null as HeatmapData | null,
  rangeChartData: null as RangeChartData | null,
  rangeChartLayout: {} as Partial<RangeChartLayout>,
  layoutCache: {} as Partial<LayoutCache>,
  currentParams: {} as Partial<Params>,
  recalcTimer: null as ReturnType<typeof setTimeout> | null,
  currentDetailedShot: null as DetailedShot | null,
};
