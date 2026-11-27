/**
 * Button-prompt glyphs that follow the active device (keyboard keycaps, Xbox-style lettered buttons,
 * PlayStation-style shape buttons, touch labels). Drawn with CSS/SVG: generic shapes and letters,
 * no console-maker logos.
 */
import type { ButtonAction, Input } from '../input/Input';
import { settings } from '../settings/Settings';

type Style = 'xbox' | 'playstation' | 'keyboard' | 'touch';

const PAD_LABEL: Partial<Record<ButtonAction, { xbox: string; ps: string }>> = {
  sprint: { xbox: 'L3', ps: 'L3' }, jump: { xbox: 'A', ps: 'cross' }, use: { xbox: 'Y', ps: 'triangle' },
  confirm: { xbox: 'A', ps: 'cross' }, back: { xbox: 'B', ps: 'circle' }, photo: { xbox: 'R3', ps: 'R3' },
  map: { xbox: 'VIEW', ps: 'CREATE' }, pause: { xbox: 'MENU', ps: 'OPTIONS' }, hud: { xbox: 'D-UP', ps: 'D-UP' },
  rise: { xbox: 'RT', ps: 'R2' }, sink: { xbox: 'LT', ps: 'L2' }, tabPrev: { xbox: 'LB', ps: 'L1' }, tabNext: { xbox: 'RB', ps: 'R1' },
};
const KEY_LABEL: Partial<Record<ButtonAction, string>> = {
  sprint: 'SHIFT', jump: 'SPACE', use: 'F', confirm: 'ENTER', back: 'ESC', photo: 'P', map: 'M', pause: 'ESC', hud: 'F3', rise: 'E', sink: 'Q', tabPrev: '[', tabNext: ']',
};
const XBOX_COLORS: Record<string, string> = { A: '#5fb548', B: '#d9473b', X: '#3f7fd6', Y: '#e8b92e' };
const PS_SHAPES: Record<string, string> = {
  cross: '<path d="M6 6L18 18M18 6L6 18" stroke="#7fa7e6" stroke-width="2.4" stroke-linecap="round"/>',
  circle: '<circle cx="12" cy="12" r="6.5" fill="none" stroke="#e5686a" stroke-width="2.3"/>',
  square: '<rect x="6" y="6" width="12" height="12" fill="none" stroke="#e48fc4" stroke-width="2.3"/>',
  triangle: '<path d="M12 5.5L19 17.5H5Z" fill="none" stroke="#4fcba9" stroke-width="2.2" stroke-linejoin="round"/>',
};

export const PROMPT_CSS = `
.t74-key { display:inline-flex; align-items:center; justify-content:center; min-width:1.7em; height:1.7em; padding:0 .4em;
  border:1.5px solid currentColor; border-radius:.3em; font:700 .72em/1 var(--f-ui); letter-spacing:.04em;
  vertical-align:middle; box-sizing:border-box; opacity:.95 }
.t74-face { display:inline-flex; width:1.75em; height:1.75em; border-radius:50%; background:#111c; border:1.5px solid #ffffff55;
  align-items:center; justify-content:center; vertical-align:middle; font:700 .8em/1 var(--f-ui) }
.t74-face svg { width:100%; height:100% }
.t74-pill { display:inline-flex; align-items:center; justify-content:center; height:1.6em; padding:0 .5em; border-radius:.8em;
  background:#111c; border:1.5px solid #ffffff55; font:700 .68em/1 var(--f-ui); letter-spacing:.05em; vertical-align:middle }
`;

export function glyph(action: ButtonAction, style: Style): string {
  if (style === 'keyboard') return `<span class="t74-key">${KEY_LABEL[action] ?? action.toUpperCase()}</span>`;
  if (style === 'touch') return `<span class="t74-pill">${action.toUpperCase()}</span>`;
  let l = PAD_LABEL[action];
  const preset = settings.get('controlPreset');
  if (preset === 'classic' && action === 'sprint') l = { xbox: 'A', ps: 'cross' };
  if (preset === 'classic' && action === 'jump') l = { xbox: 'X', ps: 'square' };
  if (preset === 'lefthanded' && action === 'sprint') l = { xbox: 'R3', ps: 'R3' };
  if (preset === 'lefthanded' && action === 'photo') l = { xbox: 'L3', ps: 'L3' };
  if (!l) return `<span class="t74-pill">${action.toUpperCase()}</span>`;
  if (style === 'xbox') {
    const c = XBOX_COLORS[l.xbox];
    return c ? `<span class="t74-face" style="color:${c}">${l.xbox}</span>` : `<span class="t74-pill">${l.xbox}</span>`;
  }
  const shape = PS_SHAPES[l.ps];
  return shape ? `<span class="t74-face"><svg viewBox="0 0 24 24">${shape}</svg></span>` : `<span class="t74-pill">${l.ps}</span>`;
}

/** "[glyph] Label" strip, re-rendered when the device changes. */
export function promptStrip(input: Input, items: [ButtonAction, string][]): string {
  const st = input.promptStyle;
  return items.map(([a, label]) => `<span style="margin-right:1.1em;white-space:nowrap">${glyph(a, st)} <span style="vertical-align:middle">${label}</span></span>`).join('');
}
