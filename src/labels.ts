// ═══════════════════════════════════════════════════════════════
//  Simulated-annealing label placer with obstacle avoidance
// ═══════════════════════════════════════════════════════════════
//
//  Energy function penalizes:
//    • Label–anchor distance (labels want to stay near their point)
//    • Label–label overlap area
//    • Label–obstacle overlap (arrows, arcs, trajectory segments)
//    • Out-of-bounds (near-infinite penalty for leaving the canvas)
//
//  Each SA iteration picks a random label, tries a random candidate
//  position near its anchor, and accepts / rejects via Boltzmann.
// ═══════════════════════════════════════════════════════════════

/** Internal label entry tracked by the placer. */
interface LabelEntry {
  text: string;
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  font: string;
  color: string;
  baseline: 'bottom' | 'middle';
}

/** Internal obstacle rect (sampled from lines / arcs). */
interface Obstacle {
  cx: number;
  cy: number;
  hw: number;  // half-width
  hh: number;  // half-height
}

/** Axis-aligned bounding box. */
interface AABB {
  left: number;
  right: number;
  top: number;
  bot: number;
}

// ── Helpers ──────────────────────────────────────────────────

function labelBounds(lb: LabelEntry): AABB {
  const left  = lb.x - lb.width / 2;
  const right = lb.x + lb.width / 2;
  const top   = lb.baseline === 'middle' ? lb.y - lb.height / 2 : lb.y - lb.height;
  const bot   = lb.baseline === 'middle' ? lb.y + lb.height / 2 : lb.y;
  return { left, right, top, bot };
}

function overlapArea(a: AABB, b: AABB): number {
  const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const dy = Math.min(a.bot, b.bot) - Math.max(a.top, b.top);
  if (dx <= 0 || dy <= 0) return 0;
  return dx * dy;
}

function obsBounds(obs: Obstacle): AABB {
  return {
    left:  obs.cx - obs.hw,
    right: obs.cx + obs.hw,
    top:   obs.cy - obs.hh,
    bot:   obs.cy + obs.hh,
  };
}

// ── Energy for a single label index ─────────────────────────

function computeEnergy(
  idx: number,
  labels: LabelEntry[],
  obstacles: Obstacle[],
  boundsW: number,
  boundsH: number,
): number {
  const label = labels[idx];
  const lb = labelBounds(label);
  let e = 0;

  // 1. Distance from anchor — quadratic, lightly weighted
  const dx = label.x - label.anchorX;
  const dy = label.y - label.anchorY;
  e += (dx * dx + dy * dy) * 0.02;

  // 2. Label-label overlap
  for (let j = 0; j < labels.length; j++) {
    if (j === idx) continue;
    const area = overlapArea(lb, labelBounds(labels[j]));
    if (area > 0) e += area * 8;
  }

  // 3. Label-obstacle overlap
  for (const obs of obstacles) {
    const area = overlapArea(lb, obsBounds(obs));
    if (area > 0) e += area * 5;
  }

  // 4. Out-of-bounds penalty
  const margin = 2;
  if (lb.left < margin)       e += (margin - lb.left) * 200;
  if (lb.top < margin)        e += (margin - lb.top) * 200;
  if (lb.right > boundsW - margin) e += (lb.right - (boundsW - margin)) * 200;
  if (lb.bot > boundsH - margin)   e += (lb.bot - (boundsH - margin)) * 200;

  return e;
}

// ── Clamp a label into the canvas ───────────────────────────

function clampToCanvas(label: LabelEntry, boundsW: number, boundsH: number): void {
  const lb = labelBounds(label);
  if (lb.top < 2)              label.y += (2 - lb.top);
  if (lb.bot > boundsH - 2)   label.y -= (lb.bot - (boundsH - 2));
  if (lb.left < 2)            label.x += (2 - lb.left);
  if (lb.right > boundsW - 2) label.x -= (lb.right - (boundsW - 2));
}

// ── Public API ──────────────────────────────────────────────

export interface LabelPlacer {
  add(opts: {
    text: string;
    x: number;
    y: number;
    font: string;
    color: string;
    align?: string;
    baseline?: 'bottom' | 'middle';
  }): void;
  addLine(x1: number, y1: number, x2: number, y2: number, thickness?: number): void;
  addArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number, thickness?: number): void;
  resolve(): void;
  draw(): void;
  labels: LabelEntry[];
  obstacles: Obstacle[];
}

/**
 * Create a label placer. Queue labels via add(), register geometry as
 * obstacles via addLine()/addArc(), then call resolve() + draw().
 */
export function createLabelPlacer(
  c: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
): LabelPlacer {
  const labels: LabelEntry[] = [];
  const obstacles: Obstacle[] = [];
  const boundsW = canvasW || 9999;
  const boundsH = canvasH || 9999;

  return {
    /** Queue a text label for deferred drawing. */
    add({ text, x, y, font, color, baseline = 'bottom' }) {
      c.save();
      c.font = font;
      const metrics = c.measureText(text);
      const width = metrics.width + 12;
      const height = 20;
      c.restore();
      labels.push({
        text, anchorX: x, anchorY: y,
        x, y, width, height,
        font, color, baseline,
      });
    },

    /** Register a line segment as an obstacle (sampled into small rects). */
    addLine(x1, y1, x2, y2, thickness = 8) {
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) return;
      const step = Math.min(12, len);
      const segments = Math.max(1, Math.ceil(len / step));
      const hw = thickness / 2;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        obstacles.push({ cx: x1 + dx * t, cy: y1 + dy * t, hw, hh: hw });
      }
    },

    /** Register sample points along an arc as obstacles. */
    addArc(cx, cy, r, startAngle, endAngle, thickness = 6) {
      const hw = thickness / 2;
      const sweep = endAngle - startAngle;
      const arcLen = Math.abs(sweep) * r;
      const segments = Math.max(3, Math.ceil(arcLen / 10));
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const a = startAngle + sweep * t;
        obstacles.push({
          cx: cx + r * Math.cos(a),
          cy: cy + r * Math.sin(a),
          hw, hh: hw,
        });
      }
    },

    /**
     * Run simulated annealing to find good label positions.
     *
     * For the typical 5-10 labels in a view panel, ~600 sweeps is
     * plenty and finishes in <5ms on any modern machine.
     */
    resolve() {
      const n = labels.length;
      if (n === 0) return;

      // ── Candidate offsets (relative to anchor) ─────────────
      // Build a set of candidate positions: 8 cardinal/diagonal
      // directions at 3 distances, plus the original position.
      const candidateOffsets: { dx: number; dy: number }[] = [{ dx: 0, dy: 0 }];
      const angles8 = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4,
                        Math.PI, -3 * Math.PI / 4, -Math.PI / 2, -Math.PI / 4];
      for (const dist of [18, 30, 48]) {
        for (const a of angles8) {
          candidateOffsets.push({
            dx: dist * Math.cos(a),
            dy: dist * Math.sin(a),
          });
        }
      }

      // ── Initial greedy placement ───────────────────────────
      // For each label, pick the candidate with lowest energy.
      // Process in order; later labels see earlier ones' positions.
      for (let i = 0; i < n; i++) {
        let bestE = Infinity;
        let bestX = labels[i].x;
        let bestY = labels[i].y;

        for (const off of candidateOffsets) {
          labels[i].x = labels[i].anchorX + off.dx;
          labels[i].y = labels[i].anchorY + off.dy;
          const e = computeEnergy(i, labels, obstacles, boundsW, boundsH);
          if (e < bestE) {
            bestE = e;
            bestX = labels[i].x;
            bestY = labels[i].y;
          }
        }

        labels[i].x = bestX;
        labels[i].y = bestY;
      }

      // ── Simulated annealing refinement ─────────────────────
      // After greedy placement, refine with SA to escape local optima.
      const maxSweeps = 600;
      let temp = 2.0;
      const cooling = 0.994;

      for (let sweep = 0; sweep < maxSweeps; sweep++) {
        for (let li = 0; li < n; li++) {
          const label = labels[li];
          const oldX = label.x, oldY = label.y;
          const oldE = computeEnergy(li, labels, obstacles, boundsW, boundsH);

          // Perturbation range shrinks as temperature drops
          const moveRange = 20 * temp;
          label.x = label.anchorX + (Math.random() - 0.5) * moveRange * 2;
          label.y = label.anchorY + (Math.random() - 0.5) * moveRange * 2;

          const newE = computeEnergy(li, labels, obstacles, boundsW, boundsH);
          const delta = newE - oldE;

          // Accept if better, or probabilistically if worse
          if (delta > 0 && Math.random() >= Math.exp(-delta / temp)) {
            label.x = oldX;
            label.y = oldY;
          }
        }

        temp *= cooling;

        // Early exit if temperature is negligible
        if (temp < 0.01) break;
      }

      // ── Final clamp to canvas bounds ───────────────────────
      for (const label of labels) {
        clampToCanvas(label, boundsW, boundsH);
      }
    },

    /** Draw all queued labels with dark background pills. */
    draw() {
      for (const label of labels) {
        c.save();
        c.font = label.font;
        c.textAlign = 'center';
        c.textBaseline = label.baseline;

        const { left: rx, top: ry } = labelBounds(label);

        c.fillStyle = 'rgba(13, 17, 23, 0.88)';
        c.fillRect(rx, ry, label.width, label.height);
        c.fillStyle = label.color;

        const textY = label.baseline === 'middle' ? label.y : label.y - 2;
        c.fillText(label.text, label.x, textY);
        c.restore();
      }
    },

    labels,
    obstacles,
  };
}
