/**
 * A car seen side-on, drawn flat in its own paint: the hero of the lot, the showroom and the Cars tab
 * (DESIGN_A §4: "a render of the car"). One long, low 1970s body per class, ground shadow, chrome
 * bumpers, dark glass. Original drawing; 400 x 120 viewBox, ground line at y = 106.
 */
const BODY: Record<string, { body: string; glass: string; pillar?: number }> = {
  sedan: {
    body: 'M10 76 L14 66 L40 63 L150 59 L186 37 L282 36 L320 58 L382 60 L390 68 L390 90 L384 96 L344 96 A26 26 0 0 0 292 96 L114 96 A26 26 0 0 0 62 96 L16 96 L10 90 Z',
    glass: 'M192 41 L279 40 L312 58 L164 59 Z', pillar: 240,
  },
  hardtop: {
    body: 'M8 76 L12 66 L40 63 L172 59 L206 40 L270 39 L318 57 L384 59 L392 68 L392 90 L386 96 L346 96 A26 26 0 0 0 294 96 L114 96 A26 26 0 0 0 62 96 L14 96 L8 90 Z',
    glass: 'M211 43 L268 42 L308 57 L184 59 Z',
  },
  wagon: {
    body: 'M10 76 L14 66 L40 63 L150 59 L186 37 L372 36 L386 58 L390 68 L390 90 L384 96 L344 96 A26 26 0 0 0 292 96 L114 96 A26 26 0 0 0 62 96 L16 96 L10 90 Z',
    glass: 'M192 41 L366 40 L378 58 L164 59 Z', pillar: 248,
  },
  pickup: {
    body: 'M10 76 L14 64 L40 61 L132 58 L160 34 L214 34 L218 60 L390 60 L390 90 L384 96 L344 96 A26 26 0 0 0 292 96 L114 96 A26 26 0 0 0 62 96 L16 96 L10 90 Z',
    glass: 'M166 38 L208 38 L211 57 L146 58 Z',
  },
  compact: {
    body: 'M34 78 L38 67 L60 64 L156 60 L190 39 L270 38 L306 59 L360 61 L368 69 L368 90 L362 96 L332 96 A24 24 0 0 0 284 96 L124 96 A24 24 0 0 0 76 96 L40 96 L34 90 Z',
    glass: 'M196 43 L267 42 L298 59 L170 60 Z', pillar: 236,
  },
};
const WHEELS: Record<string, [number, number]> = { compact: [100, 308] };

function bodyFor(cls: string) {
  const c = cls.toLowerCase();
  if (c.includes('wagon')) return 'wagon';
  if (c.includes('pickup') || c.includes('truck')) return 'pickup';
  if (c.includes('hardtop') || c.includes('coupe')) return 'hardtop';
  if (c.includes('compact')) return 'compact';
  return 'sedan';
}

export function carProfile(cls: string, paint: string, cls2 = ''): string {
  const k = bodyFor(cls), b = BODY[k], [w1, w2] = WHEELS[k] ?? [88, 318];
  const wheel = (x: number) => `<g transform="translate(${x} 97)"><circle r="22" fill="#0b0b0a"/><circle r="12" fill="none" stroke="#f2ede3" stroke-opacity=".55" stroke-width="2"/><circle r="3" fill="#f2ede3" fill-opacity=".5"/></g>`;
  return `<svg class="car-profile ${cls2}" viewBox="0 0 400 120" aria-hidden="true">
    <ellipse cx="200" cy="117" rx="196" ry="3.5" fill="#000" fill-opacity=".45"/>
    <path d="${b.body}" fill="${paint}"/>
    <path d="${b.body}" fill="url(#cpShade)"/>
    <path d="${b.glass}" fill="#0c0c0b" fill-opacity=".82"/>
    ${b.pillar ? `<path d="M${b.pillar} 40 V59" stroke="${paint}" stroke-width="5"/>` : ''}
    <path d="M14 76 H388" stroke="#f2ede3" stroke-opacity=".38" stroke-width="1.5"/>
    <path d="M9 84 H30 M370 84 H391" stroke="#f2ede3" stroke-opacity=".7" stroke-width="4"/>
    ${wheel(w1)}${wheel(w2)}
    <defs><linearGradient id="cpShade" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" stop-color="#fff" stop-opacity=".1"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient></defs>
  </svg>`;
}
