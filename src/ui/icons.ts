/**
 * The icon set (docs/DESIGN_A.md §5): our own drawings on a 24 px grid, one stroke weight (1.75 px at 24),
 * square caps, mitred joins. UI icons are line-only; map blips are the same drawings set heavier with a dark
 * halo (no discs); landmarks are building silhouettes standing on a plinth line.
 * Path data is plain SVG, so it renders in the DOM (icon()) and on canvas via Path2D (iconSprite()).
 * Original artwork for this project (logged in docs/licenses/ASSETS.md).
 */
type Def = string | { d: string; fill?: boolean }[];

export const ICONS = {
  // ---------------------------------------------------------------- map categories
  home: 'M4 11 12 4l8 7M6.5 9.5V20h11V9.5M10 20v-5.5h4V20',
  safehouse: 'M4 11 12 4l8 7M6.5 9.5V20h11V9.5M9.5 14.5h5V19h-5zM10.75 14.5v-1.2a1.25 1.25 0 0 1 2.5 0v1.2',
  property: 'M6 3.5h9.5L18 6v14.5H6zM9 9h6M9 12h6M9 15h3.5',
  forsale: 'M4.5 5h15v8h-15zM8 13v7.5M16 13v7.5M8 9h8',
  food: 'M5 9.5h11V13a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10.5h1.25a2.25 2.25 0 0 1 0 4.5H16M3 20.5h16M9 3c-.9 1.4.9 2.6 0 4.2M12.5 3c-.9 1.4.9 2.6 0 4.2',
  bar: 'M4.5 4.5h15L12 13zM12 13v7M8 20.5h8M14.5 7.5l4-4',
  clothes: 'M12 7.5a2.25 2.25 0 1 0-2.25-2.25M12 7.5v1.25L3 15.5h18l-9-6.75',
  shop: 'M3 9.5 5 4h14l2 5.5M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M5 12.5v8h14v-8M10 20.5v-5h4v5',
  garage: 'M15 3.5a4.5 4.5 0 0 0-4.3 5.9L3.8 16.3l3.9 3.9 6.9-6.9A4.5 4.5 0 0 0 20.5 9l-3 1.25-2.75-2.75L16 4.5z',
  payphone: [{ d: 'M5.5 4.5 9 4l1.5 4-2 1.25a9 9 0 0 0 6.25 6.25L16 13.5l4 1.5-.5 3.5c-.25 1-1.25 1.75-2.25 1.5C10.5 18.75 5.25 13.5 4 6.75c-.25-1 .5-2 1.5-2.25z' }],
  callbox: 'M10 21V9.5M14 21V9.5M8 9.5h8V4.5H8zM12 4.5V2.5M8.5 21h7M10 13.5h4',
  subway: 'M12 2.75a4.25 4.25 0 1 1 0 8.5 4.25 4.25 0 0 1 0-8.5zM12 11.25v8M8.5 21h7M10 19.25h4',
  service: 'M8 8.25 20 18.5M8 15.75 20 5.5M6 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM6 15.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  police: 'M12 2.75l7.25 3v5.5c0 4.5-3 8-7.25 10-4.25-2-7.25-5.5-7.25-10v-5.5zM12 8.25l1.15 2.35 2.6.4-1.9 1.8.45 2.6L12 14.2l-2.3 1.2.45-2.6-1.9-1.8 2.6-.4z',
  hospital: 'M4.5 4.5h15v15h-15zM9 8v8M15 8v8M9 12h6',
  crime: 'M2.75 16.25c3.5 1.75 15 1.75 18.5 0M6 15.5l1.5-7c.5-2 2.5-2.25 4.5-1 2-1.25 4-1 4.5 1l1.5 7M7.1 12.75c3.1 1 6.7 1 9.8 0',
  job: 'M3.5 8h17v11.5h-17zM9 8V4.5h6V8M3.5 13h17M11 13v2h2v-2',
  stranger: 'M8.75 8.75a3.25 3.25 0 1 1 4.85 2.85c-1.05.6-1.6 1.25-1.6 2.5v.65M12 18v1.5',
  mission: 'M12 2.5l7.5 9.5-7.5 9.5-7.5-9.5zM12 8.25l2.95 3.75L12 15.75 9.05 12z',
  landmark: 'M4 20.5h16M6.5 20.5V10M10 20.5V10M14 20.5V10M17.5 20.5V10M4.5 10h15M12 3.5 19.5 8h-15z',
  collectible: 'M12 3.5l3.5 5.5L12 20.5 8.5 9zM5 9h14M8.5 9 12 3.5 15.5 9',
  waypoint: 'M6.5 21.5V3.5M6.5 4h11l-2.5 4 2.5 4h-11',
  tip: 'M8.75 8.75a3.25 3.25 0 1 1 4.85 2.85c-1.05.6-1.6 1.25-1.6 2.5v.65M12 18v1.5',
  // ---------------------------------------------------------------- landmarks (silhouettes on a plinth)
  lm_flatiron: 'M3.5 21h17M12 3.5l5.25 17.5H6.75zM10.5 11.5h3M9.75 15h4.5M9 18.25h6',
  lm_empire: 'M3.5 21h17M6.5 21v-6h11v6M8.75 15V9.25h6.5V15M10.5 9.25V6h3v3.25M12 6V1.5',
  lm_macys: 'M2.5 21h19M4 21V9.5h16V21M4 9.5l2-3h12l2 3M7.5 13h2M14.5 13h2M7.5 16.5h2M14.5 16.5h2M11 21v-4h2v4M8 6.5V4M16 6.5V4',
  lm_garden: 'M2.5 21h19M3.75 11.75c0-1.9 3.7-3 8.25-3s8.25 1.1 8.25 3v6c0 1.9-3.7 3-8.25 3s-8.25-1.1-8.25-3zM3.75 11.75c0 1.9 3.7 3 8.25 3s8.25-1.1 8.25-3',
  lm_nylife: 'M3.5 21h17M6 21V11h12v10M8.75 11V8h6.5v3M10 8l2-4.5L14 8',
  lm_lifeline: 'M3.5 21h17M8 21V8.5h8V21M8 8.5l4-5.5 4 5.5M12 10.5a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5zM12 11.75v1l.75.75',
  lm_kelsey: 'M3.5 21h17M6 21V4.5h12V21M6 8.75h12M6 12.75h12M6 16.75h12M10.25 21v-2.75h3.5V21',
  lm_grandcentral: 'M2.5 21h19M3.75 21V10h16.5v11M3.75 10l2-2.25h12.5l2 2.25M7 21v-5.5a2 2 0 0 1 4 0V21M13 21v-5.5a2 2 0 0 1 4 0V21M12 3.5a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5z',
  lm_panam: 'M3.5 21h17M7 21V6l2-2.25h6L17 6v15M7 9.25h10',
  lm_penn: 'M2.5 21h19M4 21V11h16v10M4 11h16M6 21v-7M9.5 21v-7M14.5 21v-7M18 21v-7M8 11V8h8v3',
  // ---------------------------------------------------------------- UI
  map: 'M3 6.25 9 4l6 2.25L21 4v14l-6 2.25L9 18l-6 2.25zM9 4v14M15 6.25v14',
  pockets: 'M4 7h14.5a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H4zM4 7l11.5-3V7M15 11.25h5v3.5h-5z',
  paper: 'M4 4.5h13v15H6.25A2.25 2.25 0 0 1 4 17.25zM17 9h3v8.25a2.25 2.25 0 0 1-2.25 2.25M7 8h7M7 11h7M7 14h4.5',
  business: 'M5 11.5h14l1.25 9H3.75zM7 11.5V5.5h10v6M9 8.25h6M7.75 15.25h2M11 15.25h2M14.25 15.25h2',
  cars: 'M2.5 16V13.25l3-.75 2.75-3.5h7.25l3.25 3.5 2.75.75V16M2.5 16h2.25M9.25 16h5.5M19.25 16h2.25M7 14a2.25 2.25 0 1 1 0 4.5A2.25 2.25 0 0 1 7 14zM17 14a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5zM8.5 12.5h8.25',
  record: 'M6 3h12.5v18H6zM6 3H4.25M6 7H4.25M6 11H4.25M6 15H4.25M6 19H4.25M9.5 7.5h6M9.5 10.5h6M9.5 13.5h3.75',
  system: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4.75v4.5M9 14.75v4.5',
  close: 'M6 6l12 12M18 6 6 18',
  back: 'M10 5.5 3.5 12l6.5 6.5M3.5 12h17',
  check: 'M4.5 12.5l5 5L19.5 7',
  lock: 'M5.5 11h13v9.5h-13zM8.25 11V8a3.75 3.75 0 0 1 7.5 0v3',
  cash: 'M2.5 6.5h19v11h-19zM12 9.25a2.75 2.75 0 1 1 0 5.5 2.75 2.75 0 0 1 0-5.5zM5.75 9.75v4.5M18.25 9.75v4.5',
  clock: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM12 7.5V12l3.25 2',
  weapon: 'M2.75 8.5h13.5l1-2H20v4.5h-3l-1.25 2.25h-3l-1 3.75c-.25.9-1 1.5-2 1.5H6.25l1-5.25H2.75zM9 12.75h2.25',
  heat: 'M6.5 18.5v-5.25a5.5 5.5 0 0 1 11 0v5.25M4.5 18.5h15v2.25h-15zM12 2.5v2.25M4 5.75l1.6 1.6M20 5.75l-1.6 1.6M12 10.5v4',
  health: 'M2.5 12h4.25l2-5.25 4.5 10.5 2-5.25h6.25',
  objective: 'M12 2.5v4.25M12 17.25v4.25M2.5 12h4.25M17.25 12h4.25M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  route: 'M6 16.75a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5zM18 2.75a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5zM6 16.75V12.5a3 3 0 0 1 3-3h6a3 3 0 0 0 3-3V7.25',
  audio: 'M3.5 9h4.25l5-4v14l-5-4H3.5zM15.75 9a4.25 4.25 0 0 1 0 6M18.25 6.25a8 8 0 0 1 0 11.5',
  display: 'M2.5 4.5h19v12.25h-19zM8 21h8M12 16.75V21',
  controls: 'M7 7.5h10a4.5 4.5 0 0 1 4.5 4.5v3.25a2.5 2.5 0 0 1-4.5 1.5L15.25 15H8.75L7 16.75a2.5 2.5 0 0 1-4.5-1.5V12A4.5 4.5 0 0 1 7 7.5zM8.25 10v4M6.25 12h4M15.25 11h.5M17.75 13.25h.5',
  access: 'M12 2.75a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5zM4.5 8.75 12 10.5l7.5-1.75M12 10.5V15M12 15l-3.25 6.25M12 15l3.25 6.25',
  save: 'M4.5 3.5h11.75l3.25 3.25V20.5h-15zM8 3.5V9h7.5V3.5M7.75 20.5V14h8.5v6.5',
  profile: 'M12 3.5a4.25 4.25 0 1 1 0 8.5 4.25 4.25 0 0 1 0-8.5zM3.75 21c.9-4.25 4.1-6.5 8.25-6.5s7.35 2.25 8.25 6.5',
  sun: 'M12 7.75a4.25 4.25 0 1 1 0 8.5 4.25 4.25 0 0 1 0-8.5zM12 1.75V4M12 20v2.25M1.75 12H4M20 12h2.25M4.75 4.75l1.6 1.6M17.65 17.65l1.6 1.6M4.75 19.25l1.6-1.6M17.65 6.35l1.6-1.6',
  moon: 'M19.25 14.75A8 8 0 0 1 9.25 4.75 8 8 0 1 0 19.25 14.75z',
  sleep: 'M3 18.5V6.5M3 14h18v4.5M21 14v-1.75A3.25 3.25 0 0 0 17.75 9H11v5M6.75 9.75a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5z',
  key: 'M7.25 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM10.75 12h10M17.5 12v3M20.75 12v2.5',
  newmark: 'M12 6l6 6-6 6-6-6z',
  arrow: 'M12 3.5l6.5 16L12 15.5l-6.5 4z',
  pin: 'M12 21.5s6.5-6.25 6.5-11.5a6.5 6.5 0 0 0-13 0c0 5.25 6.5 11.5 6.5 11.5zM12 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  ticket: 'M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM9 7v10',
  phone: [{ d: 'M5.5 4.5 9 4l1.5 4-2 1.25a9 9 0 0 0 6.25 6.25L16 13.5l4 1.5-.5 3.5c-.25 1-1.25 1.75-2.25 1.5C10.5 18.75 5.25 13.5 4 6.75c-.25-1 .5-2 1.5-2.25z' }],
} satisfies Record<string, Def>;
export type IconName = keyof typeof ICONS;

/** Landmark id (world manifest / landmarks.json) → silhouette. */
export const LANDMARK_ICON: Record<string, IconName> = {
  'lm.flatiron': 'lm_flatiron', 'lm.empire_state': 'lm_empire', 'lm.macys': 'lm_macys', 'lm.msg': 'lm_garden',
  'lm.ny_life': 'lm_nylife', 'lm.met_life': 'lm_lifeline', 'lm.hotel_chelsea': 'lm_kelsey', 'lm.grand_central': 'lm_grandcentral',
  'lm.pan_am': 'lm_panam', 'lm.penn_station': 'lm_penn',
};

const parts = (n: IconName) => { const d = ICONS[n] as Def; return typeof d === 'string' ? [{ d }] : d; };

/** Inline SVG for the DOM (stroke follows currentColor; CSS class .ic sets the weight). */
export function icon(name: IconName, size = 20, cls = ''): string {
  return `<svg class="ic${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${parts(name).map((p) => `<path d="${p.d}"${p.fill ? ' class="f"' : ''}/>`).join('')}</svg>`;
}

const sprites = new Map<string, HTMLCanvasElement>();
/**
 * A canvas sprite for maps: the drawing set heavier (weight × 1.75 px at 24), in `colour`, over a dark halo
 * so it reads on the aerial without a disc. `size` is CSS px; the sprite is padded by the halo.
 */
export function iconSprite(name: IconName, size: number, dpr: number, o: { colour?: string; halo?: string; weight?: number; haloW?: number } = {}): HTMLCanvasElement {
  const colour = o.colour ?? '#f2ede3', halo = o.halo ?? 'rgba(8,8,7,.82)', wgt = o.weight ?? 1.35, hw = o.haloW ?? 3.2;
  const key = `${name}|${size}|${dpr}|${colour}|${halo}|${wgt}|${hw}`;
  const hit = sprites.get(key); if (hit) return hit;
  const pad = Math.ceil(hw + 2), px = Math.ceil((size + pad * 2) * dpr);
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr); g.translate(pad, pad); g.scale(size / 24, size / 24);
  g.lineCap = 'square'; g.lineJoin = 'miter'; g.miterLimit = 4;
  const ps = parts(name).map((p) => ({ path: new Path2D(p.d), fill: !!p.fill }));
  const lw = 1.75 * wgt;
  g.strokeStyle = halo; g.lineWidth = lw + (hw * 2 * 24) / size; g.lineJoin = 'round'; g.lineCap = 'round';
  for (const p of ps) g.stroke(p.path);
  g.lineCap = 'square'; g.lineJoin = 'miter'; g.strokeStyle = colour; g.fillStyle = colour; g.lineWidth = lw;
  for (const p of ps) { if (p.fill) g.fill(p.path); g.stroke(p.path); }
  sprites.set(key, c);
  return c;
}
/** Padding (CSS px) added around a sprite of this halo width, for centring. */
export const spritePad = (haloW = 3.2) => Math.ceil(haloW + 2);
