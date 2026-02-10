// ═══════════════════════════════════════════════════════════════
//  Type definitions for the Shot Visualizer
// ═══════════════════════════════════════════════════════════════

/** Result of evaluateShot — basic shot feasibility & trajectory summary. */
export interface ShotResult {
  shotSpeed: number;
  hoodAngleDeg: number;
  flightTime: number;
  vyAtTarget: number;
  descentAngleDeg: number;
  apexHeight: number;
  heightError: number;
  lateralDrift: number;
  turretAdjRad: number;
  range: number;
}

/** All control-panel parameters read from the DOM. */
export interface Params {
  speedMode: string;
  minSpeed: number;
  maxSpeed: number;
  fixedSpeed: number;
  angleMode: string;
  minAngle: number;
  maxAngle: number;
  fixedAngle: number;
  tangentialVelo: number;
  radialVelo: number;
  gridRes: number;
  shooterZ: number;
  ceilingHeight: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  maxVyAtTarget: number;
  maxLateralDrift: number;
  dragEnabled: boolean;
}

/** Drag configuration passed through the physics call chain. */
export interface DragConfig {
  enabled: boolean;
  /** Pre-computed  k = ½ρCdA / m  (1/m).  Only meaningful when enabled. */
  k: number;
}

/** Single point on a sampled trajectory. */
export interface TrajectoryPoint {
  x: number;   // along line of fire
  z: number;   // height
  y: number;   // lateral drift
  t: number;   // time since launch
}

/** Full detailed shot used by the 3-view modal rendering. */
export interface DetailedShot {
  speed: number;
  angleRad: number;
  hoodAngleDeg: number;
  hSpeed: number;
  vLaunch: number;
  turretAdjRad: number;
  effRadSpeed: number;
  range: number;
  flightTime: number;
  shooterZ: number;
  targetZ: number;
  ceilingHeight: number;
  tangentialVelo: number;
  radialVelo: number;
  dragEnabled: boolean;
  trajectory: TrajectoryPoint[];
  /** Vacuum (no-drag) trajectory for comparison overlay. Only set when drag is enabled. */
  vacuumTrajectory?: TrajectoryPoint[];
  vxLaunch: number;
  vzLaunch: number;
  vyLaunch: number;
  vxTarget: number;
  vzTarget: number;
  vyTarget: number;
  tApex: number;
  xApex: number;
  zApex: number;
  apexHeight: number;
  vyAtTarget: number;
}

/** Heatmap data produced by computeHeatmap. */
export interface HeatmapData {
  cols: number;
  rows: number;
  res: number;
  results: (ShotResult | null)[][];
  minSpeed: number;
  maxSpeed: number;
  minAngle: number;
  maxAngle: number;
  validCount: number;
}

/** Range chart data produced by computeRangeChart. */
export interface RangeChartData {
  distances: number[];
  tangentials: number[];
  radials: number[];
  panels: (ShotResult | null)[][][];
  minSpeed: number;
  maxSpeed: number;
  minAngle: number;
  maxAngle: number;
  validCount: number;
  totalCount: number;
}

/** Cached layout geometry for the main canvas. */
export interface LayoutCache {
  cw: number;
  ch: number;
  pad: number;
  scale: number;
  fw: number;
  fh: number;
  ox: number;
  oy: number;
  legendX: number;
  displayFieldLength: number;
}

/** Position info for a single range-chart panel. */
export interface PanelPosition {
  labelY: number;
  heatY: number;
  ri: number;
}

/** Layout info for the range chart (used by tooltip hit-testing). */
export interface RangeChartLayout {
  padLeft: number;
  availW: number;
  panelH: number;
  cellW: number;
  cellH: number;
  panelPositions: PanelPosition[];
  distances: number[];
  tangentials: number[];
  radials: number[];
}

/** Sweep result from sweepSpeedAndAngle. */
export interface SweepResult {
  speed: number;
  angle: number;
  error: number;
}

/** Refinement result from refineShot. */
export interface RefineResult {
  angle: number;
  shotTime: number;
  turretAdjRad: number;
}
