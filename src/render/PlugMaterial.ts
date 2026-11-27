/**
 * Storefront plugs (docs/HANDOFF_WIRING.md, "Interiors hookup design"): the quad that fills each facade opening
 * while that unit's interior is not streamed (interiors stream only within ~30 m).
 *
 *  - Day: dark plate glass. Low roughness so the sun and sky env read as a reflection; a dim, warm room
 *    glimpsed behind it, darker at the edges.
 *  - Night: an uneven lit-room card. Each unit hashes to its own colour temperature (incandescent, fluorescent,
 *    neon-tinted) and brightness, and about a third stay dark after hours. The light falls off from the ceiling
 *    and the centre, so there is no flat glowing panel (WIRING_BOARD item 2).
 *  - Windows get mullions and a frame; doors are darker and carry a push bar.
 *
 * Attributes (meshBuilder plugs): uv = metres within the opening; facade = (kind 0 door / 1 alcove / 2 window /
 * 3 transom, unit hash 0..1, width m, height m); plugHide = 1 while the real interior is live (discarded).
 */
import * as THREE from 'three/webgpu';
import { attribute, uv, vec3, float, fract, smoothstep, mix, select, abs, min, max, clamp } from 'three/tsl';
import { facadeUniforms } from './FacadeMaterial';

export function createPlugMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.12 });
  const fac = attribute<'vec4'>('facade', 'vec4');
  const kind = fac.x, h = fac.y, w = fac.z, hh = fac.w;
  const p = uv(); // metres
  const u = p.x.div(max(w, 0.01)), v = p.y.div(max(hh, 0.01)); // 0..1 within the opening
  const isWindow = kind.equal(float(2)).or(kind.equal(float(3)));
  const isDoor = kind.lessThan(float(1.5));

  // frame and mullions (metal, unlit): 5 cm frame; windows split about every 1.3 m; doors get a push bar
  const edge = min(min(p.x, w.sub(p.x)), min(p.y, hh.sub(p.y)));
  const frame = float(1).sub(smoothstep(0.035, 0.055, edge));
  const panes = max(float(1), w.div(1.3).floor());
  const paneW = w.div(panes), px = fract(u.mul(panes)).mul(paneW);
  const mull = select(isWindow, float(1).sub(smoothstep(0.02, 0.035, min(px, paneW.sub(px)))), float(0));
  const bar = select(isDoor, smoothstep(0.03, 0.0, abs(p.y.sub(1.0))).mul(smoothstep(0.12, 0.2, u)).mul(smoothstep(0.88, 0.8, u)), float(0));
  const metal = clamp(frame.add(mull).add(bar), 0, 1);

  // the room behind: brighter toward the ceiling and the middle, falling off to the sides (no flat panel)
  const vign = smoothstep(0.0, 0.35, u).mul(smoothstep(1.0, 0.65, u));
  const ceiling = mix(float(0.35), float(1.0), smoothstep(0.1, 0.95, v));
  const room = vign.mul(ceiling);
  // per-unit light: colour temperature and level by hash; ~1/3 dark at night (closed), doors dimmer
  const warm = vec3(1.0, 0.72, 0.42), cool = vec3(0.78, 0.9, 1.0), tint = vec3(1.0, 0.55, 0.6);
  const col = select(h.lessThan(0.55), warm, select(h.lessThan(0.85), cool, tint));
  const lit = smoothstep(0.3, 0.36, fract(h.mul(7.31)));
  const level = mix(float(0.45), float(1.0), fract(h.mul(13.7))).mul(select(isDoor, float(0.55), float(1)));
  const night = facadeUniforms.night;

  m.colorNode = mix(vec3(0.02, 0.022, 0.025).add(col.mul(room).mul(0.05)), vec3(0.06, 0.06, 0.055), metal);
  m.roughnessNode = mix(float(0.1), float(0.55), metal);
  m.emissiveNode = col.mul(room).mul(level).mul(lit).mul(night).mul(float(1).sub(metal)).mul(0.9)
    .add(col.mul(room).mul(0.04).mul(float(1).sub(night))); // a faint daytime glimpse of the lit shop
  // live interiors replace their plugs
  m.opacityNode = float(1).sub(attribute<'float'>('plugHide', 'float'));
  m.alphaTest = 0.5;
  return m;
}
