/**
 * Street furniture (Phase 3 block A; user: "There are no street signs/traffic lights"), from
 * public/data/furniture.json (pipeline: 1974 placement rules, shared with gameplay request 6).
 *
 * Instanced per type (one draw each), culled to a radius around the camera twice a second.
 *  - signal poles: dark green steel, two 3-lens heads at right angles; lenses cycle on a 60 s plan per
 *    junction (red / amber / green), axis A and axis B opposed. The sim's signal state replaces the clock
 *    at the sim merge (signalStates()).
 *  - street-name signs: 1970s Manhattan black-on-yellow blades ("W 42 ST"), text from a canvas atlas.
 *  - call boxes (red), payphone booths, hydrants, mailboxes, parking meters, newsstands, wire trash baskets,
 *    bus-stop poles: simple period forms, vertex-coloured, no brands.
 */
import * as THREE from 'three/webgpu';
import { attribute, float, vec3, fract, step, uniform, uv, texture, vec2, select } from 'three/tsl';
import { heightAt, CURB_HEIGHT } from '../shared/terrain';
import type { QualitySettings } from '../engine/quality';

interface FurnitureData { items: [string, number, number, number][]; signals: number[][]; signs: [number, number, number, string, string][] }
export const furnitureUniforms = { time: uniform(0) };

type Part = [THREE.BufferGeometry, [number, number, number]];
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, seg = 8) => new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z);
function merge(parts: Part[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  for (const [g0, c] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const P = g.attributes.position.array as Float32Array, N = g.attributes.normal.array as Float32Array;
    for (let i = 0; i < P.length; i += 3) { pos.push(P[i], P[i + 1], P[i + 2]); nor.push(N[i], N[i + 1], N[i + 2]); col.push(...c); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
const POLE_GREEN: [number, number, number] = [0.1, 0.13, 0.1], RED: [number, number, number] = [0.42, 0.05, 0.04];
const MODELS: Record<string, () => THREE.BufferGeometry> = {
  callbox: () => merge([[cyl(0.07, 0.09, 1.3, 0, 0.65, 0), RED], [box(0.32, 0.42, 0.24, 0, 1.45, 0), RED], [cyl(0.08, 0.08, 0.14, 0, 1.74, 0), [0.7, 0.55, 0.3]]]),
  payphone: () => merge([[box(0.95, 2.2, 0.95, 0, 1.1, 0), [0.3, 0.31, 0.32]], [box(0.8, 1.5, 0.97, 0, 1.15, 0), [0.12, 0.14, 0.15]], [box(0.97, 0.22, 0.97, 0, 2.1, 0), [0.55, 0.5, 0.42]]]),
  hydrant: () => merge([[cyl(0.13, 0.15, 0.6, 0, 0.3, 0), [0.45, 0.45, 0.43]], [cyl(0.15, 0.13, 0.12, 0, 0.66, 0), RED], [cyl(0.06, 0.06, 0.4, 0, 0.38, 0), [0.4, 0.4, 0.38]]]),
  mailbox: () => merge([[box(0.5, 0.95, 0.45, 0, 0.62, 0), [0.07, 0.12, 0.3]], [cyl(0.25, 0.25, 0.45, 0, 1.1, 0, 10).rotateX(Math.PI / 2).translate(0, 0, 0), [0.07, 0.12, 0.3]], [box(0.06, 0.15, 0.06, 0.2, 0.07, 0.18), [0.05, 0.05, 0.05]], [box(0.06, 0.15, 0.06, -0.2, 0.07, -0.18), [0.05, 0.05, 0.05]]]),
  meter: () => merge([[cyl(0.035, 0.04, 1.15, 0, 0.58, 0, 6), [0.25, 0.25, 0.24]], [box(0.16, 0.26, 0.12, 0, 1.28, 0), [0.32, 0.32, 0.3]]]),
  newsstand: () => merge([[box(2.6, 2.2, 1.5, 0, 1.1, 0), [0.12, 0.18, 0.12]], [box(2.7, 0.12, 1.9, 0, 2.26, 0.15), [0.1, 0.14, 0.1]], [box(2.3, 0.9, 0.05, 0, 1.15, 0.76), [0.5, 0.42, 0.3]]]),
  trash: () => merge([[cyl(0.3, 0.26, 0.85, 0, 0.43, 0, 10), [0.12, 0.14, 0.11]]]),
  busstop: () => merge([[cyl(0.04, 0.04, 2.8, 0, 1.4, 0, 6), POLE_GREEN], [box(0.45, 0.6, 0.03, 0, 2.55, 0), [0.75, 0.72, 0.62]]]),
};

/** "West 42nd Street" -> "W 42 ST", "Avenue of the Americas" stays readable. */
function abbreviate(n: string): string {
  return n.toUpperCase().replace(/^WEST /, 'W ').replace(/^EAST /, 'E ').replace(/(\d+)(ST|ND|RD|TH)\b/, '$1')
    .replace(/ STREET$/, ' ST').replace(/ AVENUE$/, ' AV').replace(/^(\d+) AV$/, '$1 AV').replace(/ PLACE$/, ' PL');
}

export class StreetFurniture {
  readonly root = new THREE.Group();
  private data!: FurnitureData;
  private meshes = new Map<string, { mesh: THREE.InstancedMesh; pts: [number, number, number][] }>();
  private t = 0;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private p = new THREE.Vector3(); private one = new THREE.Vector3(1, 1, 1); private up = new THREE.Vector3(0, 1, 0);

  constructor(private quality: QualitySettings) { this.root.name = 'streetFurniture'; }

  async load(url: string) {
    this.data = await (await fetch(url)).json();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
    const byType = new Map<string, [number, number, number][]>();
    for (const [type, x, z, yaw] of this.data.items) (byType.get(type) ?? byType.set(type, []).get(type)!).push([x, z, yaw]);
    for (const [type, pts] of byType) {
      const make = MODELS[type]; if (!make) continue;
      const mesh = new THREE.InstancedMesh(make(), mat, pts.length); mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = type;
      this.meshes.set(type, { mesh, pts }); this.root.add(mesh);
    }
    this.buildSignals(); this.buildSigns();
  }

  private buildSignals() {
    const S = this.data.signals; const n = S.length;
    // pole + mast stub + two head bodies (axis A faces yaw, axis B faces yaw+90)
    const pole = merge([[cyl(0.08, 0.11, 4.2, 0, 2.1, 0), POLE_GREEN], [box(0.32, 0.95, 0.28, 0, 3.6, -0.22), [0.15, 0.17, 0.1]], [box(0.28, 0.95, 0.32, -0.22, 3.6, 0), [0.15, 0.17, 0.1]]]);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 });
    const poles = new THREE.InstancedMesh(pole, mat, n); poles.name = 'signalPoles';
    // lenses: 6 per pole (3 per head), each instanced mesh is one colour; per-instance phase offset
    const phase = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    S.forEach(([x, z, yaw], i) => { phase.setX(i, ((x * 0.37 + z * 0.11) % 60 + 60) % 60); this.q.setFromAxisAngle(this.up, yaw); this.p.set(x, heightAt(x, z) + CURB_HEIGHT, z); this.m.compose(this.p, this.q, this.one); poles.setMatrixAt(i, this.m); });
    poles.instanceMatrix.needsUpdate = true; poles.computeBoundingSphere(); this.root.add(poles);
    const lens = (colour: THREE.Color, y: number, which: 0 | 1 | 2) => {
      const geo = merge([[new THREE.CircleGeometry(0.1, 10).rotateY(Math.PI).translate(0, y, -0.37), [1, 1, 1]], [new THREE.CircleGeometry(0.1, 10).rotateY(-Math.PI / 2).translate(-0.37, y, 0), [1, 1, 1]]]); // discs face out of each head
      // the second disc belongs to axis B (per-vertex flag)
      const axis = new Float32Array(geo.attributes.position.count); axis.fill(0, 0, axis.length / 2); axis.fill(1, axis.length / 2);
      geo.setAttribute('axisB', new THREE.Float32BufferAttribute(axis, 1));
      geo.setAttribute('phase', phase);
      const m = new THREE.MeshBasicNodeMaterial();
      const t = fract(furnitureUniforms.time.add(attribute('phase', 'float')).div(60)).mul(60); // 0..60 s
      const tb = fract(t.add(30).div(60)).mul(60); // axis B runs half a cycle later
      const tt = select(attribute('axisB', 'float').greaterThan(0.5), tb, t);
      const green = step(tt, 27), amber = step(27, tt).mul(step(tt, 30)), red = step(30, tt);
      const lit = which === 0 ? red : which === 1 ? amber : green;
      m.colorNode = vec3(colour.r, colour.g, colour.b).mul(lit.mul(2.6).add(0.06));
      const im = new THREE.InstancedMesh(geo, m, n);
      S.forEach((_s, i) => { poles.getMatrixAt(i, this.m); im.setMatrixAt(i, this.m); });
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); this.root.add(im);
    };
    lens(new THREE.Color(1, 0.12, 0.05), 3.9, 0); lens(new THREE.Color(1, 0.6, 0.05), 3.6, 1); lens(new THREE.Color(0.25, 1, 0.55), 3.3, 2);
  }

  private buildSigns() {
    const S = this.data.signs; if (!S.length) return;
    // atlas of unique names, black on yellow
    const names = [...new Set(S.flatMap((s) => [s[3], s[4]]).map(abbreviate))];
    const cols = 4, cw = 512, ch = 112, rows = Math.ceil(names.length / cols);
    const cv = document.createElement('canvas'); cv.width = cols * cw; cv.height = Math.max(1, rows) * ch;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#e3b72a'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    names.forEach((nm, i) => {
      const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch;
      g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(cx + 6, cy + 6, cw - 12, ch - 12);
      let size = 72; g.font = `700 ${size}px Archivo, Helvetica, Arial, sans-serif`;
      while (g.measureText(nm).width > cw - 40 && size > 30) { size -= 4; g.font = `700 ${size}px Archivo, Helvetica, Arial, sans-serif`; }
      g.fillText(nm, cx + cw / 2, cy + ch / 2 + 2);
    });
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const index = new Map(names.map((n, i) => [n, i]));
    // pole
    const poleGeo = merge([[cyl(0.04, 0.05, 3.3, 0, 1.65, 0, 6), POLE_GREEN]]);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }), S.length);
    // blades: one double-sided quad per name, uv offset per instance into the atlas
    const blade = new THREE.PlaneGeometry(0.95, 0.21);
    const n2 = S.length * 2; const off = new THREE.InstancedBufferAttribute(new Float32Array(n2 * 2), 2);
    blade.setAttribute('cell', off);
    const bm = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.5 });
    const cell = attribute('cell', 'vec2');
    bm.colorNode = texture(tex, uv().div(vec2(cols, Math.max(1, rows))).add(cell)).rgb;
    const blades = new THREE.InstancedMesh(blade, bm, n2);
    S.forEach(([x, z, yaw, a, b], i) => {
      const y = heightAt(x, z) + CURB_HEIGHT;
      this.q.setFromAxisAngle(this.up, yaw); this.p.set(x, y, z); this.m.compose(this.p, this.q, this.one); poles.setMatrixAt(i, this.m);
      [[a, 3.25, yaw], [b, 3.03, yaw + Math.PI / 2]].forEach(([nm, h, ry], k) => {
        const id = index.get(abbreviate(nm as string)) ?? 0, j = i * 2 + k;
        off.setXY(j, (id % cols) / cols, (rows - 1 - Math.floor(id / cols)) / Math.max(1, rows));
        this.q.setFromAxisAngle(this.up, (ry as number) + Math.PI / 2);
        this.p.set(x, y + (h as number), z); this.m.compose(this.p, this.q, this.one); blades.setMatrixAt(j, this.m);
      });
    });
    for (const im of [poles, blades]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
    poles.name = 'signPoles'; blades.name = 'signBlades';
    this.root.add(poles, blades);
    void float;
  }

  update(dt: number, cam: THREE.Vector3) {
    furnitureUniforms.time.value += dt;
    if ((this.t -= dt) > 0 || !this.data) return;
    this.t = 0.5;
    const R = this.quality.name === 'low' ? 140 : this.quality.name === 'medium' ? 240 : 380;
    for (const { mesh, pts } of this.meshes.values()) {
      let n = 0;
      for (const [x, z, yaw] of pts) {
        if (Math.abs(x - cam.x) > R || Math.abs(z - cam.z) > R) continue;
        this.q.setFromAxisAngle(this.up, yaw); this.p.set(x, heightAt(x, z) + CURB_HEIGHT, z); this.m.compose(this.p, this.q, this.one); mesh.setMatrixAt(n++, this.m);
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
