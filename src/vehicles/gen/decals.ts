import * as THREE from 'three/webgpu';
import type { DecalAnchor } from './body';
import { rng } from './builder';

/**
 * Period lettering painted on as canvas textures. All text is generic or invented: no real
 * fleet, operator, department or route names. Fonts are the project's OFL period faces.
 */
const BASE = import.meta.env.BASE_URL;
let fontsReady: Promise<void> | null = null;
export function loadDecalFonts(): Promise<void> {
  if (!fontsReady) {
    const faces = [
      new FontFace('League Gothic', `url(${BASE}fonts/LeagueGothic-normal-400.woff2)`),
      new FontFace('Courier Prime', `url(${BASE}fonts/CourierPrime-normal-700.woff2)`, { weight: '700' }),
      new FontFace('Archivo', `url(${BASE}fonts/Archivo-normal-400-800.woff2)`, { weight: '400 800' }),
    ];
    fontsReady = Promise.all(faces.map((f) => f.load().then((ff) => { document.fonts.add(ff); }).catch(() => undefined))).then(() => undefined);
  }
  return fontsReady;
}

const GOTHIC = '"League Gothic", "Arial Narrow", Impact, sans-serif';
const MONO = '"Courier Prime", "Courier New", monospace';
const GROT = 'Archivo, Helvetica, Arial, sans-serif';

const BUSINESSES = ['DIMARCO BAKERY', 'SUNRISE LINEN SUPPLY', 'KOVAC BROS. MOVERS', 'GARMENT CENTER DELIVERY', 'HUDSON RIVER PRODUCE', 'ESPOSITO & SON PLUMBING', 'MIDTOWN OFFICE FURNITURE', 'TEN-O-ONE DAIRY'];
const ROUTES = ['34  CROSSTOWN', '42  CROSSTOWN', '6  AVENUE  UPTOWN', '7  AVENUE  DOWNTOWN', '23  CROSSTOWN', 'NOT IN SERVICE'];

function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function draw(kind: DecalAnchor['kind'], seed: number): { c: HTMLCanvasElement; emissive: boolean } {
  const r = rng(seed * 7919 + kind.length);
  switch (kind) {
    case 'fare': {
      // 1973 rate format (docs/STYLE_GUIDE.md §6, ref 549869)
      const c = canvas(512, 256), g = c.getContext('2d')!;
      g.fillStyle = '#111'; g.textBaseline = 'top';
      g.font = `bold 72px ${GOTHIC}`; g.fillText('60¢', 14, 4);
      g.font = `bold 30px ${MONO}`; g.fillText('FIRST 1/5', 150, 14); g.fillText('MILE', 150, 46);
      g.font = `bold 72px ${GOTHIC}`; g.fillText('10¢', 14, 112);
      g.font = `bold 30px ${MONO}`; g.fillText('EACH ADD\'L', 150, 120); g.fillText('1/5 MILE', 150, 152);
      g.font = `bold 22px ${MONO}`; g.fillText('PASSENGERS PAY TOLLS', 14, 216);
      return { c, emissive: false };
    }
    case 'unit': {
      const c = canvas(256, 96), g = c.getContext('2d')!;
      g.fillStyle = '#111'; g.font = `64px ${GOTHIC}`; g.textBaseline = 'middle'; g.textAlign = 'center';
      const n = `${1 + Math.floor(r() * 9)}${String.fromCharCode(65 + Math.floor(r() * 12))}${Math.floor(10 + r() * 89)}`;
      g.fillText(n, 128, 50);
      return { c, emissive: false };
    }
    case 'police': {
      const c = canvas(512, 128), g = c.getContext('2d')!;
      g.fillStyle = '#121418'; g.font = `112px ${GOTHIC}`; g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillText('P O L I C E', 256, 68);
      return { c, emissive: false };
    }
    case 'taxiSign': {
      const c = canvas(256, 80), g = c.getContext('2d')!;
      g.fillStyle = '#f2ead0'; g.fillRect(0, 0, 256, 80);
      g.fillStyle = '#1a1612'; g.font = `70px ${GOTHIC}`; g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillText('TAXI', 128, 44);
      return { c, emissive: true };
    }
    case 'destSign': {
      const c = canvas(1024, 128), g = c.getContext('2d')!;
      g.fillStyle = '#0b0b0a'; g.fillRect(0, 0, 1024, 128);
      g.fillStyle = '#f4efe0'; g.font = `104px ${GOTHIC}`; g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillText(ROUTES[Math.floor(r() * ROUTES.length)], 512, 68);
      return { c, emissive: true };
    }
    case 'operator': {
      const c = canvas(1024, 128), g = c.getContext('2d')!;
      g.fillStyle = seed % 2 ? '#f0ead8' : '#2c3b2a'; g.font = `600 78px ${GROT}`; g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillText(seed % 2 ? 'CITY TRANSIT' : 'CITY SANITATION', 512, 66);
      return { c, emissive: false };
    }
    case 'ambulance': {
      const c = canvas(1024, 128), g = c.getContext('2d')!;
      g.fillStyle = '#b8231c'; g.font = `112px ${GOTHIC}`; g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillText('A M B U L A N C E', 512, 70);
      return { c, emissive: false };
    }
    case 'fireDept': {
      // generic door shield: no real department name, crest or seal
      const c = canvas(512, 256), g = c.getContext('2d')!;
      g.strokeStyle = '#e8d49a'; g.lineWidth = 10;
      g.beginPath(); g.moveTo(256, 18); g.lineTo(470, 70); g.lineTo(440, 180); g.lineTo(256, 240); g.lineTo(72, 180); g.lineTo(42, 70); g.closePath(); g.stroke();
      g.fillStyle = '#e8d49a'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `600 42px ${GROT}`; g.fillText('FIRE DEPT.', 256, 95);
      g.font = `96px ${GOTHIC}`; g.fillText(`ENGINE ${10 + Math.floor(r() * 80)}`, 256, 168);
      return { c, emissive: false };
    }
    case 'mail': {
      const c = canvas(1024, 256), g = c.getContext('2d')!;
      g.fillStyle = '#1f3566'; g.fillRect(0, 150, 1024, 46);
      g.font = `600 120px ${GROT}`; g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillText('MAIL', 512, 82);
      return { c, emissive: false };
    }
    case 'icecream': {
      const c = canvas(1024, 192), g = c.getContext('2d')!;
      g.fillStyle = '#7a2a4a'; g.textBaseline = 'middle'; g.textAlign = 'center';
      g.font = `italic 800 92px ${GROT}`; g.fillText('Soft Ice Cream', 512, 70, 980);
      g.font = `600 40px ${GROT}`; g.fillText('CONES  ·  SUNDAES  ·  SHAKES  ·  15¢', 512, 158, 980);
      return { c, emissive: false };
    }
    case 'fleet':
    default: {
      const c = canvas(1024, 256), g = c.getContext('2d')!;
      const name = BUSINESSES[Math.floor(r() * BUSINESSES.length)];
      g.fillStyle = ['#7a1d16', '#1d2c4a', '#2a3d22', '#5a3a1a'][Math.floor(r() * 4)];
      g.font = `italic 800 96px ${GROT}`; g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillText(name, 512, 100, 980);
      g.font = `600 40px ${GROT}`; g.fillText('NEW YORK, N.Y.  •  CHelsea 3-' + (4000 + Math.floor(r() * 5999)), 512, 200, 900);
      return { c, emissive: false };
    }
  }
}

/** Build the decal meshes for a vehicle. `seed` picks the lettering (unit numbers, routes). */
export function buildDecals(anchors: DecalAnchor[], seed: number, opKind: 'bus' | 'garbage' | 'other'): { group: THREE.Group; lit: THREE.Material[]; dispose(): void } {
  const group = new THREE.Group();
  group.name = 'decals';
  const mats: THREE.Material[] = [], texs: THREE.Texture[] = [], lit: THREE.Material[] = [];
  for (const a of anchors) {
    const s = a.kind === 'operator' ? (opKind === 'bus' ? 1 : 0) : seed;
    const { c, emissive } = draw(a.kind, s);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const m = new THREE.MeshStandardNodeMaterial({ map: tex, transparent: !emissive, roughness: 0.5, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: emissive });
    if (emissive) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = tex; m.emissiveIntensity = 0.0; lit.push(m); }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(a.w, a.h), m);
    mesh.position.set(...a.pos);
    mesh.lookAt(a.pos[0] + a.normal[0], a.pos[1] + a.normal[1], a.pos[2] + a.normal[2]);
    mesh.renderOrder = 2;
    group.add(mesh);
    mats.push(m); texs.push(tex);
  }
  return { group, lit, dispose() { for (const m of mats) m.dispose(); for (const t of texs) t.dispose(); group.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); } };
}

/**
 * Licence plate texture. Generic period plate: dark blue characters on a goldenrod field with a
 * state legend (state names are public facts, not trademarks). Exact 1974 NY colours: (verify).
 */
/**
 * New York passenger plate as issued 1973–80 (the base on the street in 1974): embossed dark-blue
 * serial on reflective orange, a border line, "NEW YORK" centred at the bottom, no slogan, and a
 * bordered (never used) sticker spot at the bottom right; revalidation was a windshield decal.
 * Serials are digits-dash-letters, 12-ABC / 123-ABC (state.ts plateFor). Commercial vehicles use
 * the same base here (their 1974 variants are not verified, so no invented legend).
 */
export function drawPlate(text: string, _opts: { commercial?: boolean } = {}): HTMLCanvasElement {
  const c = canvas(256, 128), g = c.getContext('2d')!;
  const BLUE = '#1c2850';
  g.fillStyle = '#e08a2a'; g.fillRect(0, 0, 256, 128);
  // reflective sheeting sheen
  const sh = g.createLinearGradient(0, 0, 256, 128); sh.addColorStop(0, 'rgba(255,230,180,0.18)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(120,50,0,0.12)');
  g.fillStyle = sh; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = BLUE; g.lineWidth = 4; g.strokeRect(7, 7, 242, 114);
  g.lineWidth = 2; g.strokeRect(206, 96, 36, 20); // sticker spot (unused in New York)
  g.fillStyle = BLUE; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `78px ${GOTHIC}`; g.fillText(text, 128, 58, 232);
  g.font = `700 17px ${GROT}`; g.fillText('NEW YORK', 128, 107);
  return c;
}
