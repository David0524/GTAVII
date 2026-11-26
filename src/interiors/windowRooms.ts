/**
 * Tier C: a room behind every non-enterable window (interior mapping / parallax rooms, TSL).
 * A material feature the engine applies to facade window quads (ENGINE_REQUESTS "From interiors: 6").
 *
 * Per-vertex attributes on window quads:
 *   wuv  vec2  0..1 across the window (x along the facade, y up)
 *   wtan vec3  world unit vector along the facade (x direction of wuv); the outward normal is the geometry normal
 *   wdat vec4  x = stable window hash 0..1, y = building use (PLUTO 1..11), z = floor index, w = condition 0..4
 * Uniforms (shared): minutes (clock 0..1439), power (0 off, 0.45 dim, 1 on), daylight 0..1.
 *
 * Per window it decides lit or unlit (by use, floor, hour and power), then draws the room: wallpaper or
 * office paint by use, floor, ceiling with a lamp pool, furniture silhouettes, blinds or curtains at a
 * random drop, TV flicker, a ceiling-fan shadow, an occasional figure crossing, and an AC unit in
 * about one window in six (STYLE_GUIDE §3). No textures.
 */
import * as THREE from 'three/webgpu';
import { Fn, attribute, uniform, vec2, vec3, float, floor, fract, sin, abs, mix, step, smoothstep, max, min, dot, normalize, positionWorld, cameraPosition, normalWorld, time, select, clamp, If, cos, atan, fwidth } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
const h1 = Fn(([x]: [N]) => fract(sin(x.mul(91.345)).mul(47453.5453)));

export interface WindowRoomUniforms { minutes: { value: number }; power: { value: number }; daylight: { value: number } }

export function createWindowRoomMaterial(): { material: THREE.MeshBasicNodeMaterial; uniforms: WindowRoomUniforms } {
  const minutes = uniform(20 * 60), power = uniform(1), daylight = uniform(0);
  const mat = new THREE.MeshBasicNodeMaterial();
  const wuv = attribute('wuv', 'vec2'), wtan = attribute('wtan', 'vec3'), wdat = attribute('wdat', 'vec4');
  const n0 = normalize(normalWorld), t0 = normalize(wtan);
  const room = interiorRoomNode({ wuv, id: wdat.x, use: wdat.y, floor: wdat.z, cond: wdat.w, minutes, power, daylight, n: n0, t: t0 });
  mat.colorNode = Fn(() => {
    const cond = wdat.w, n = n0;
    const V = normalize(positionWorld.sub(cameraPosition));
    // glass: sky/street reflection by fresnel, grime by condition
    const fres = float(1).sub(abs(dot(V, n))).pow(4);
    const skyRefl = mix(vec3(0.05, 0.05, 0.07), vec3(0.55, 0.6, 0.66), daylight);
    const grime = float(4).sub(cond).mul(0.05);
    // window frame (sash) and a mullion
    const frame = float(1).sub(step(0.04, wuv.x).mul(step(wuv.x, 0.96)).mul(step(0.03, wuv.y).mul(step(wuv.y, 0.97))));
    const sash = step(abs(wuv.y.sub(0.52)), 0.018);
    const glassC = mix(room, skyRefl, clamp(fres.add(daylight.mul(0.25)).add(grime), 0, 0.85));
    return mix(glassC, vec3(0.16, 0.12, 0.09), max(frame, sash));
  })();
  void If; void cos; void vec2;
  return { material: mat, uniforms: { minutes, power, daylight } as unknown as WindowRoomUniforms };
}

/**
 * Tier C room radiance for one window cell (TSL). Everything the engine's FacadeMaterial already computes per window:
 *   wuv   vec2 0..1 inside the window   id    float hash 0..1 per window   use  PLUTO land use (residential <= 4)
 *   floor floor index                  cond  0..4 condition               minutes/power/daylight  shared uniforms
 *   n, t  optional world normal / facade tangent (defaults: geometry normal, horizontal tangent)
 * Returns the colour seen through the glass (room, shade, AC unit), to be used as emissive behind the engine's glass.
 */
export function interiorRoomNode(o: { wuv: N; id: N; use: N; floor: N; cond: N; minutes: N; power: N; daylight: N; n?: N; t?: N }): N {
  return Fn(() => {
    const { wuv, id, use, floor: flr, cond, minutes, power, daylight } = o;
    const n: N = normalize(o.n ?? normalWorld); const t: N = normalize(o.t ?? vec3(n.z, 0, n.x.negate()));
    const V = normalize(positionWorld.sub(cameraPosition));
    // tangent space: x along facade, y up, z into the room
    const vx = dot(V, t), vy = V.y, vz = max(dot(V, n.negate()), 0.05);
    const D = float(1.1).add(h1(id.add(3)).mul(0.8)); // room depth in window-widths
    const org = vec3(wuv.x, wuv.y, 0);
    const dir = vec3(vx, vy.mul(0.62), vz); // windows are ~1.6x taller than wide: rooms scale in y
    const tx = select(dir.x.greaterThan(0), float(1).sub(org.x), org.x.negate()).div(dir.x.add(select(dir.x.greaterThan(0), 1e-4, -1e-4)));
    const ty = select(dir.y.greaterThan(0), float(1).sub(org.y), org.y.negate()).div(dir.y.add(select(dir.y.greaterThan(0), 1e-4, -1e-4)));
    const tz = D.div(dir.z);
    const tHit = min(min(tx, ty), tz);
    const p = org.add(dir.mul(tHit));
    // which face
    const isBack = step(tz, min(tx, ty));
    const isFloor = step(ty, min(tx, tz)).mul(step(dir.y, 0));
    const isCeil = step(ty, min(tx, tz)).mul(step(0, dir.y));
    const isSide = float(1).sub(isBack).sub(isFloor).sub(isCeil).clamp(0, 1);
    // occupancy rules: residential lit evenings/night, offices by day, lofts by day; power gates all
    const hr = minutes.div(60);
    const residential = step(use, 4.5).mul(step(0.5, use));
    const office = float(1).sub(residential);
    const evening = smoothstep(17.5, 19.5, hr).mul(float(1).sub(smoothstep(23.0, 24.0, hr))).add(smoothstep(5.5, 6.5, hr).mul(float(1).sub(smoothstep(8.0, 9.0, hr))).mul(0.5));
    const workday = smoothstep(7.5, 8.5, hr).mul(float(1).sub(smoothstep(17.5, 19.0, hr)));
    const pLit = residential.mul(evening.mul(0.7).add(0.06)).add(office.mul(workday.mul(0.78).add(0.12)));
    const lit = step(h1(id.add(floor(hr.div(2.0)).mul(0.13)).add(flr.mul(0.017))), pLit).mul(power.greaterThan(0.01).select(1, 0)).mul(step(0.5, cond).mul(0.9).add(0.1));
    // palettes: residential wallpaper (warm), offices (cool green/grey paint), by hash
    const wallRes = mix(vec3(0.55, 0.42, 0.28), vec3(0.42, 0.45, 0.33), h1(id.add(7)));
    const wallOff = mix(vec3(0.42, 0.46, 0.42), vec3(0.5, 0.48, 0.42), h1(id.add(8)));
    const wall = mix(wallOff, wallRes, residential);
    const floorC = mix(vec3(0.28, 0.18, 0.11), vec3(0.32, 0.3, 0.26), office);
    const ceilC = vec3(0.62, 0.58, 0.5);
    let col: N = wall.mul(isBack.add(isSide.mul(0.72))).add(floorC.mul(isFloor)).add(ceilC.mul(isCeil));
    // wallpaper stripes / office partitions on the back wall
    col = col.mul(float(1).sub(isBack.mul(residential).mul(smoothstep(0.35, 0.65, abs(fract(p.x.mul(6)).sub(0.5)).mul(2)).mul(0.08))));
    // furniture silhouettes on the back wall: sofa/dresser (res) or filing cabinets/desk (office)
    const furn = isBack.mul(step(p.y, mix(0.32, 0.5, h1(id.add(11))))).mul(step(abs(p.x.sub(h1(id.add(12)).mul(0.6).add(0.2))), 0.22));
    col = mix(col, vec3(0.12, 0.08, 0.06), furn.mul(0.85));
    // light: a lamp pool from the ceiling centre (incandescent warm or fluorescent cool)
    const lampC = mix(vec3(1.0, 0.72, 0.42), vec3(0.85, 0.95, 0.9), office);
    const fall = float(1).div(float(1).add(p.sub(vec3(0.5, 1.0, D.mul(0.5))).length().mul(2.2).pow(2)));
    const flick = float(1).sub(power.lessThan(0.6).select(abs(sin(time.mul(17).add(id.mul(40)))).mul(0.4), 0));
    const lampLight = lampC.mul(fall.mul(3.2).add(0.55)).mul(lit).mul(power).mul(flick);
    // TV flicker (residential, evening, some windows)
    const tv = residential.mul(lit).mul(step(0.62, h1(id.add(21)))).mul(sin(time.mul(7.0).add(id.mul(30))).mul(0.25).add(sin(time.mul(23.0)).mul(0.15)).add(0.6));
    const tvLight = vec3(0.35, 0.5, 0.8).mul(tv).mul(0.5);
    // ceiling fan shadow (rotating stripes) in some lit residential rooms
    const fanA = time.mul(4.0).add(id.mul(10));
    const rel = vec2(p.x.sub(0.5), p.z.sub(D.mul(0.5)));
    const ang = atan(rel.y, rel.x).add(fanA);
    const fan = isCeil.mul(step(0.75, h1(id.add(31)))).mul(step(0.6, sin(ang.mul(4)))).mul(step(rel.length(), 0.45)).mul(0.35);
    const ambientNight = vec3(0.012, 0.012, 0.018);
    const dayIn = vec3(0.22, 0.2, 0.18).mul(daylight);
    let room: N = col.mul(lampLight.add(tvLight).add(ambientNight).add(dayIn)).mul(float(1).sub(fan));
    // a figure crossing mid-room now and then (lit rooms only)
    const zf = D.mul(0.45), tf = zf.div(dir.z), pf = org.add(dir.mul(tf));
    const px = fract(time.mul(0.05).add(h1(id.add(41))).mul(1.0)).mul(3.0).sub(1.0);
    const fig = lit.mul(step(tf, tHit)).mul(step(abs(pf.x.sub(px)), 0.07)).mul(step(pf.y, 0.82)).mul(step(0.2, pf.y)).mul(step(0.55, h1(id.add(floor(time.mul(0.05)).mul(0.71)))));
    room = mix(room, room.mul(0.15), fig);
    // blinds / curtains on the window plane at a random drop
    const drop = h1(id.add(51)).mul(0.85);
    const shade = step(float(1).sub(drop), wuv.y);
    const blinds = mix(vec3(0.72, 0.66, 0.5), vec3(0.6, 0.38, 0.26), step(0.5, h1(id.add(52))));
    const slats = mix(step(0.5, fract(wuv.y.mul(28))).mul(0.15).add(0.85), float(0.925), smoothstep(0.02, 0.05, fwidth(wuv.y)));
    const shadeLit = blinds.mul(slats).mul(lampLight.mul(0.6).add(ambientNight).add(dayIn.mul(1.5)).add(tvLight.mul(0.3)));
    room = mix(room, shadeLit, shade);
    // AC unit in ~1 window in 6: lower 30% of the window
    const ac = step(h1(id.add(61)), 0.17).mul(step(wuv.y, 0.3)).mul(step(abs(wuv.x.sub(0.5)), 0.32));
    const grille = mix(step(0.5, fract(wuv.y.mul(40))).mul(0.2).add(0.8), float(0.9), smoothstep(0.015, 0.04, fwidth(wuv.y)));
    room = mix(room, vec3(0.6, 0.57, 0.5).mul(grille).mul(daylight.mul(0.8).add(0.1)), ac);
    return room;
  })();
}

/** Helper for builders: append one window quad (world space) with the attributes above. */
export function pushWindow(out: { position: number[]; normal: number[]; wuv: number[]; wtan: number[]; wdat: number[]; index: number[] },
  p0: [number, number, number], tan: [number, number, number], nrm: [number, number, number], w: number, h: number, dat: [number, number, number, number]) {
  const v = out.position.length / 3;
  for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    out.position.push(p0[0] + tan[0] * w * a + nrm[0] * 0.02, p0[1] + h * b, p0[2] + tan[2] * w * a + nrm[2] * 0.02);
    out.normal.push(...nrm); out.wuv.push(a, b); out.wtan.push(...tan); out.wdat.push(...dat);
  }
  // front face toward the normal
  const cx = tan[1] * 0 - tan[2] * 1, cz = tan[0] * 1 - tan[1] * 0; // tan x up
  if (cx * nrm[0] + cz * nrm[2] > 0) out.index.push(v, v + 1, v + 2, v, v + 2, v + 3); else out.index.push(v, v + 2, v + 1, v, v + 3, v + 2);
}
