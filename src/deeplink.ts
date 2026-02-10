// ═══════════════════════════════════════════════════════════════
//  Deep Linking — URL ↔ control state
// ═══════════════════════════════════════════════════════════════

import { getViewMode } from './controls';

/** Map of URL param keys → { element id, type }. Modes handled separately. */
const PARAM_KEYS: Record<string, { id: string; type: 'range' | 'select' }> = {
  minSpeed:       { id: 'minSpeed',       type: 'range' },
  maxSpeed:       { id: 'maxSpeed',       type: 'range' },
  fixedSpeed:     { id: 'fixedSpeed',     type: 'range' },
  minAngle:       { id: 'minAngle',       type: 'range' },
  maxAngle:       { id: 'maxAngle',       type: 'range' },
  fixedAngle:     { id: 'fixedAngle',     type: 'range' },
  tangentialVelo: { id: 'tangentialVelo', type: 'range' },
  radialVelo:     { id: 'radialVelo',     type: 'range' },
  gridRes:        { id: 'gridRes',        type: 'range' },
  shooterZ:       { id: 'shooterZ',       type: 'range' },
  ceilingHeight:  { id: 'ceilingHeight',  type: 'range' },
  targetX:        { id: 'targetX',        type: 'range' },
  targetY:        { id: 'targetY',        type: 'range' },
  targetZ:        { id: 'targetZ',        type: 'range' },
  maxVyAtTarget:  { id: 'maxVyAtTarget',  type: 'range' },
  colorMode:      { id: 'colorMode',      type: 'select' },
};

/** Apply URL search params to the DOM controls. */
export function applyUrlParams(): void {
  const params = new URLSearchParams(window.location.search);
  if (params.size === 0) return;

  // Mode toggles (including view)
  (['speed', 'angle', 'view'] as const).forEach(group => {
    const mode = params.get(group + 'Mode');
    const validModes = group === 'view'
      ? ['field', 'range']
      : ['variable', 'fixed'];
    if (mode && validModes.includes(mode)) {
      const toggle = document.querySelector(`[data-group="${group}"]`)!;
      toggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      const target = toggle.querySelector(`[data-mode="${mode}"]`);
      if (target) target.classList.add('active');

      if (group === 'speed') {
        document.getElementById('speed-variable')!.style.display = mode === 'variable' ? '' : 'none';
        document.getElementById('speed-fixed')!.style.display    = mode === 'fixed' ? '' : 'none';
      } else if (group === 'angle') {
        document.getElementById('angle-variable')!.style.display = mode === 'variable' ? '' : 'none';
        document.getElementById('angle-fixed')!.style.display    = mode === 'fixed' ? '' : 'none';
      } else if (group === 'view') {
        document.getElementById('robot-velocity-group')!.style.display =
          mode === 'range' ? 'none' : '';
      }
    }
  });

  // Sliders and selects
  for (const [key, { id, type }] of Object.entries(PARAM_KEYS)) {
    const val = params.get(key);
    if (val == null) continue;
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) continue;

    if (type === 'range') {
      const num = parseFloat(val);
      const inp = el as HTMLInputElement;
      if (!isNaN(num)) {
        const clamped = Math.max(parseFloat(inp.min), Math.min(parseFloat(inp.max), num));
        inp.value = String(clamped);
      }
    } else {
      // select — only set if valid option
      const sel = el as HTMLSelectElement;
      const valid = [...sel.options].some(o => o.value === val);
      if (valid) sel.value = val;
    }
  }
}

/** Write current control state into the URL (replaceState, no reload). */
export function pushStateToUrl(): void {
  const p = new URLSearchParams();

  // Modes
  const speedMode = [...document.querySelectorAll('[data-group="speed"] button')]
    .find(b => b.classList.contains('active'))?.getAttribute('data-mode');
  const angleMode = [...document.querySelectorAll('[data-group="angle"] button')]
    .find(b => b.classList.contains('active'))?.getAttribute('data-mode');
  const viewMode = getViewMode();
  p.set('speedMode', speedMode || 'variable');
  p.set('angleMode', angleMode || 'variable');
  p.set('viewMode', viewMode);

  // Sliders and selects
  for (const [key, { id }] of Object.entries(PARAM_KEYS)) {
    p.set(key, (document.getElementById(id) as HTMLInputElement).value);
  }

  const url = window.location.pathname + '?' + p.toString();
  history.replaceState(null, '', url);
}

/** Bind the copy-link button. */
export function bindCopyLink(): void {
  document.getElementById('copy-link')!.addEventListener('click', () => {
    pushStateToUrl();
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.getElementById('copy-link')!;
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    });
  });
}
