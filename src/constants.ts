// ═══════════════════════════════════════════════════════════════
//  Global constants
// ═══════════════════════════════════════════════════════════════

export const FIELD_LENGTH = 16.54;   // meters, X dimension (full field)
export const FIELD_WIDTH  = 8.07;    // meters, Y dimension
export const GRAVITY      = 9.8;
export const DISPLAY_BUFFER = 1.5;   // meters past target to show on field view

// ── Ball / drag properties (2026 FRC game piece) ─────────────
export const BALL_MASS       = 0.2268;   // kg  (0.5 lb)
export const BALL_DIAMETER   = 0.150;    // m   (5.91 in)
export const DRAG_COEFFICIENT = 0.47;    // smooth sphere
export const AIR_DENSITY     = 1.225;    // kg/m³ (sea-level standard)

/** Pre-computed drag constant  k = ½ρCdA / m   (units: 1/m) */
export const DRAG_K = 0.5 * AIR_DENSITY * DRAG_COEFFICIENT
  * Math.PI * (BALL_DIAMETER / 2) ** 2 / BALL_MASS;
