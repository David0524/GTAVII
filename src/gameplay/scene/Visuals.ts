import * as THREE from 'three/webgpu';
import type { Material } from '../core/world';
import type { PropType } from '../props/props';

/**
 * Test-scene visuals. Everything here is a GENERIC PLACEHOLDER: bodies belong to the characters
 * stream (Character.play('aim' | 'fire' | 'reload' | 'hit' | 'surrender' | ...)), cars to the vehicles
 * stream. Props and combat FX are gameplay's own stand-ins until art passes; props are instanced
 * per type with destruction stages, FX use instanced quads (WebGPU has no point size).
 */
const COL = {
  player: 0x8e4a2e, gang: 0x3c4a63, hood: 0xa07a52, corrupt_cop: 0x1f2a44, police: 0x1f2a44, muscle: 0x5a3326, civilian: 0x7a5a3a, skin: 0xb08060,
};
const CIV = [0x7a3b2c, 0xb59a7a, 0xc9b89a, 0x6f6a5e, 0x5a3326, 0x4a1f22, 0xd8cdb4, 0x6b6b3a, 0xc79a3c, 0x3c4a63, 0xa44030];

export type Pose = 'idle' | 'walk' | 'run' | 'crouch' | 'aim' | 'handsUp' | 'down' | 'dead' | 'cower' | 'call' | 'windup' | 'strike' | 'block' | 'stagger' | 'grapple';

export class Body {
  readonly root = new THREE.Group();
  private torso: THREE.Mesh; private head: THREE.Mesh; private armL: THREE.Group; private armR: THREE.Group; private legL: THREE.Mesh; private legR: THREE.Mesh; private hat: THREE.Mesh | null = null;
  private phase = Math.random() * 6;
  pose: Pose = 'idle';
  speed = 0;
  flinch = 0;
  private mat: THREE.MeshStandardMaterial;
  constructor(color: number, opts: { cop?: boolean; scale?: number } = {}) {
    this.mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: COL.skin, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9 });
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 4, 10), this.mat); this.torso.position.y = 1.2;
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), skin); this.head.position.y = 1.66;
    const arm = () => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), this.mat); m.position.y = -0.27; g.add(m); g.position.y = 1.42; return g; };
    this.armL = arm(); this.armL.position.x = -0.27; this.armR = arm(); this.armR.position.x = 0.27;
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.82, 0.16), dark); this.legL.geometry.translate(0, -0.41, 0); this.legL.position.set(-0.1, 0.86, 0);
    this.legR = this.legL.clone(); this.legR.position.x = 0.1;
    if (opts.cop) { this.hat = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.09, 12), new THREE.MeshStandardMaterial({ color: 0x141a2c })); this.hat.position.y = 1.77; }
    this.root.add(this.torso, this.head, this.armL, this.armR, this.legL, this.legR);
    if (this.hat) this.root.add(this.hat);
    this.root.scale.setScalar(opts.scale ?? 1);
    this.root.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  }
  setTint(c: number) { this.mat.color.setHex(c); }
  update(dt: number) {
    const s = this.speed;
    this.phase += dt * (2 + s * 2.3);
    const sw = Math.sin(this.phase) * Math.min(0.9, s * 0.22);
    const p = this.pose;
    // defaults
    let tY = 1.2, crouch = 0, armLx = sw, armRx = -sw, lean = -Math.min(0.2, s * 0.03), rollZ = 0, legLx = -sw, legRx = sw, rootDrop = 0, lyingX = 0;
    if (p === 'crouch' || p === 'cower') { crouch = 0.42; legLx = legRx = -1.0; lean = 0.35; }
    if (p === 'aim') { armRx = armLx = -Math.PI / 2; }
    if (p === 'handsUp') { armRx = armLx = Math.PI; }
    if (p === 'call') { armRx = -2.4; }
    if (p === 'windup') { armRx = 0.9; lean = 0.1; }
    if (p === 'strike') { armRx = -1.7; lean = -0.25; }
    if (p === 'block') { armRx = armLx = -2.2; }
    if (p === 'grapple') { armRx = armLx = -1.4; }
    if (p === 'stagger') { lean = 0.4; rollZ = 0.2; }
    if (p === 'down' || p === 'dead') { lyingX = -Math.PI / 2; rootDrop = 0; armLx = armRx = 0.3; legLx = legRx = 0; }
    if (this.flinch > 0) { this.flinch -= dt; lean += 0.3 * this.flinch / 0.3; }
    this.torso.position.y = tY - crouch; this.head.position.y = 1.66 - crouch; this.armL.position.y = this.armR.position.y = 1.42 - crouch;
    if (this.hat) this.hat.position.y = 1.77 - crouch;
    this.legL.position.y = this.legR.position.y = 0.86 - crouch * 0.5;
    this.armL.rotation.x = armLx; this.armR.rotation.x = armRx; this.legL.rotation.x = legLx; this.legR.rotation.x = legRx;
    this.torso.rotation.x = lean; this.torso.rotation.z = rollZ;
    this.root.rotation.x = lyingX; this.root.position.y -= rootDrop;
    if (p === 'down' || p === 'dead') { this.root.children.forEach((c) => (c.visible = true)); }
  }
  dispose() { this.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); } }); }
}
/** Witness colour words → stand-in tint, so a change of clothes shows on the placeholder body. */
export const CLOTH: Record<string, number> = { white: 0xd9d4c8, cream: 0xd8cdb4, tan: 0xa07a52, camel: 0xa07a52, brown: 0x5a3326, black: 0x1c1a18, grey: 0x6f6a5e, charcoal: 0x3a3836, navy: 0x1f2a44, 'dark blue': 0x3c4a63, 'powder blue': 0x8fa8c8, orange: 0xc06a2a, red: 0xa44030, yellow: 0xc79a3c, green: 0x4f5a2e, straw: 0xc9b07a };
export function bodyColor(kind: string, seed = 0) { return (COL as any)[kind] ?? CIV[seed % CIV.length]; }

/** A placeholder full-size 1970s sedan block-out (vehicles stream owns the real models). */
export function carMesh(color = 0x5a3326, police = false) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.7 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xbfb8a8, roughness: 0.25, metalness: 0.9 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 5.4), paint); body.position.y = 0.62;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.5, 2.6), glass); cabin.position.set(0, 1.15, 0.25);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.06, 2.5), police ? new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.5 }) : paint); roof.position.set(0, 1.42, 0.25);
  const bf = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.16, 0.14), chrome); bf.position.set(0, 0.45, -2.72);
  const br = bf.clone(); br.position.z = 2.72;
  g.add(body, cabin, roof, bf, br);
  for (const [x, z] of [[0.86, -1.6], [-0.86, -1.6], [0.86, 1.6], [-0.86, 1.6]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 14), tyre); w.rotation.z = Math.PI / 2; w.position.set(x, 0.36, z); g.add(w); }
  if (police) {
    const doors = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 2.4), new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.5 })); doors.position.set(0, 0.72, 0.2); g.add(doors);
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xff3b2f, emissive: 0xff2010, emissiveIntensity: 0.6 })); bubble.position.set(0, 1.45, 0.25); bubble.name = 'bubble'; g.add(bubble);
  }
  g.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  return g;
}

/** Instanced breakable props: one InstancedMesh per (type, look). Broken stages swap transform/colour. */
export class PropMeshes {
  readonly root = new THREE.Group();
  private sets = new Map<PropType, { mesh: THREE.InstancedMesh; ids: string[] }>();
  private tmp = new THREE.Object3D();
  constructor(defs: { id: string; type: PropType; x: number; y: number; z: number; yaw: number }[]) {
    const byType = new Map<PropType, typeof defs>();
    for (const d of defs) { const a = byType.get(d.type) ?? []; a.push(d); byType.set(d.type, a); }
    for (const [type, list] of byType) {
      const { geo, mat } = propLook(type);
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.castShadow = true;
      this.sets.set(type, { mesh, ids: list.map((d) => d.id) });
      list.forEach((d, i) => { this.place(mesh, i, d.x, d.y, d.z, d.yaw, 0, type); mesh.setColorAt(i, new THREE.Color(0xffffff)); });
      this.root.add(mesh);
    }
  }
  private place(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, yaw: number, stage: number, type: PropType) {
    const t = this.tmp; t.position.set(x, y, z); t.rotation.set(0, yaw, 0); t.scale.set(1, 1, 1);
    const broken = stage >= 1;
    if (broken) {
      if (type === 'hydrant') { t.scale.set(1, 0.35, 1); }
      else if (type === 'parking_meter' || type === 'call_box' || type === 'mailbox') { t.rotation.set(1.25, yaw, 0.2); t.position.y += 0.15; }
      else if (type === 'trash_can') { t.rotation.set(Math.PI / 2, yaw, 0); t.position.y += 0.3; }
      else if (type === 'storefront_glass') t.scale.set(0.001, 0.001, 0.001);
    }
    if (type === 'newsstand' && stage === 1) t.rotation.z = 0.04;
    if ((type === 'newsstand' || type === 'phone_booth') && stage >= 2) { t.scale.set(1, 0.7, 1); t.rotation.z = 0.12; }
    t.updateMatrix(); mesh.setMatrixAt(i, t.matrix); mesh.instanceMatrix.needsUpdate = true;
  }
  set(id: string, type: PropType, p: { x: number; y: number; z: number; yaw: number }, stage: number) {
    const s = this.sets.get(type); if (!s) return;
    const i = s.ids.indexOf(id); if (i < 0) return;
    this.place(s.mesh, i, p.x, p.y, p.z, p.yaw, stage, type);
    s.mesh.setColorAt(i, new THREE.Color(stage === 0 ? 0xffffff : stage === 1 ? 0xb8a898 : 0x6a5a50));
    if (s.mesh.instanceColor) s.mesh.instanceColor.needsUpdate = true;
  }
}
function propLook(type: PropType): { geo: THREE.BufferGeometry; mat: THREE.Material } {
  const M = (c: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
  switch (type) {
    case 'hydrant': { const g = new THREE.CylinderGeometry(0.14, 0.18, 0.8, 12); g.translate(0, 0.4, 0); return { geo: g, mat: M(0x9a2a22, { metalness: 0.3 }) }; }
    case 'newsstand': { const g = new THREE.BoxGeometry(2.8, 2.3, 1.6); g.translate(0, 1.15, 0); return { geo: g, mat: M(0x3f4a2e) }; }
    case 'phone_booth': { const g = new THREE.BoxGeometry(1.0, 2.3, 1.0); g.translate(0, 1.15, 0); return { geo: g, mat: M(0xbfbab0, { metalness: 0.6, roughness: 0.35 }) }; }
    case 'mailbox': { const g = new THREE.BoxGeometry(0.64, 1.2, 0.54); g.translate(0, 0.6, 0); return { geo: g, mat: M(0x2a3d6b) }; }
    case 'parking_meter': { const g = new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8); g.translate(0, 0.65, 0); const h = new THREE.BoxGeometry(0.2, 0.3, 0.14); h.translate(0, 1.35, 0); return { geo: mergeGeos([g, h]), mat: M(0x6f6a5e, { metalness: 0.5 }) }; }
    case 'trash_can': { const g = new THREE.CylinderGeometry(0.3, 0.26, 0.9, 12, 1, true); g.translate(0, 0.45, 0); return { geo: g, mat: M(0x3a3632, { side: THREE.DoubleSide, metalness: 0.4 }) }; }
    case 'storefront_glass': { const g = new THREE.BoxGeometry(4.4, 2.6, 0.04); g.translate(0, 1.3, 0); return { geo: g, mat: M(0x8aa0a8, { transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.6 }) }; }
    case 'call_box': { const g = new THREE.CylinderGeometry(0.07, 0.09, 1.2, 8); g.translate(0, 0.6, 0); const h = new THREE.BoxGeometry(0.32, 0.42, 0.24); h.translate(0, 1.35, 0); return { geo: mergeGeos([g, h]), mat: M(0xb2302a, { emissive: 0x401008, emissiveIntensity: 0.4 }) }; }
  }
}
function mergeGeos(gs: THREE.BufferGeometry[]) {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  let off = 0;
  for (const g0 of gs) {
    const g = g0.index ? g0 : g0; const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
    if (g.index) { const ia = g.index.array; for (let q = 0; q < ia.length; q++) idx.push(ia[q] + off); } else for (let i = 0; i < p.length / 3; i++) idx.push(i + off);
    off += p.length / 3;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setIndex(idx);
  return out;
}

/** Instanced particles and tracers. */
export class Fx {
  readonly root = new THREE.Group();
  private parts: THREE.InstancedMesh; private pdata: { p: THREE.Vector3; v: THREE.Vector3; life: number; max: number; size: number; grav: number; drag: number; color: THREE.Color; spin: number }[] = [];
  private tracers: THREE.InstancedMesh; private tdata: { a: THREE.Vector3; b: THREE.Vector3; life: number }[] = [];
  private flash: THREE.PointLight; private flashT = 0; private flashMesh: THREE.Mesh;
  private tmp = new THREE.Object3D(); private c = new THREE.Color();
  readonly MAX = 1400;
  constructor() {
    this.parts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.MAX);
    this.parts.count = 0; this.parts.frustumCulled = false;
    this.parts.setColorAt(0, new THREE.Color(1, 1, 1));
    this.tracers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85 }), 64);
    this.tracers.count = 0; this.tracers.frustumCulled = false;
    this.flash = new THREE.PointLight(0xffb060, 0, 9, 2);
    this.flashMesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }));
    this.flashMesh.visible = false;
    this.root.add(this.parts, this.tracers, this.flash, this.flashMesh);
  }
  burst(at: THREE.Vector3 | number[], o: { n: number; color: number; speed: number; up?: number; life?: number; size?: number; grav?: number; drag?: number; dir?: number[]; spread?: number }) {
    const p0 = Array.isArray(at) ? new THREE.Vector3(at[0], at[1], at[2]) : at.clone();
    for (let i = 0; i < o.n && this.pdata.length < this.MAX; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5 + (o.up ?? 0), Math.random() - 0.5).normalize().multiplyScalar(o.speed * (0.4 + Math.random() * 0.8));
      if (o.dir) v.add(new THREE.Vector3(o.dir[0], o.dir[1], o.dir[2]).multiplyScalar(o.speed * (1 - (o.spread ?? 0.5))));
      const life = (o.life ?? 0.5) * (0.6 + Math.random() * 0.8);
      this.pdata.push({ p: p0.clone(), v, life, max: life, size: (o.size ?? 0.04) * (0.6 + Math.random() * 0.8), grav: o.grav ?? 9.8, drag: o.drag ?? 1.5, color: new THREE.Color(o.color).multiplyScalar(0.8 + Math.random() * 0.4), spin: Math.random() * 6 });
    }
  }
  impact(at: number[], material: Material, normal?: number[]) {
    const dir = normal ?? [0, 1, 0];
    const look: Record<string, [number, number, number]> = { brick: [0x8a4a38, 10, 0.06], concrete: [0xb0a898, 12, 0.05], asphalt: [0x5a504a, 8, 0.05], metal_thin: [0xffc070, 22, 0.02], metal_thick: [0xffd090, 18, 0.02], glass: [0xcfe0e8, 16, 0.03], wood: [0x8a6a40, 10, 0.05], plaster: [0xe0d8c8, 14, 0.05], flesh: [0x5a1010, 6, 0.04], cloth: [0x6a5a4a, 4, 0.03], water: [0x9ab8c8, 10, 0.04] };
    const [col, n, size] = look[material] ?? look.concrete;
    this.burst(at, { n, color: col, speed: material.startsWith('metal') ? 5 : 2.4, dir, spread: 0.6, life: material.startsWith('metal') ? 0.25 : 0.6, size, grav: material.startsWith('metal') ? 6 : 4 });
  }
  tracer(a: number[], b: number[]) { this.tdata.push({ a: new THREE.Vector3(a[0], a[1], a[2]), b: new THREE.Vector3(b[0], b[1], b[2]), life: 0.07 }); if (this.tdata.length > 64) this.tdata.shift(); }
  muzzle(at: number[]) { this.flash.position.set(at[0], at[1], at[2]); this.flash.intensity = 30; this.flashT = 0.05; this.flashMesh.position.copy(this.flash.position); this.flashMesh.visible = true; this.burst(at, { n: 4, color: 0x9a9088, speed: 0.8, up: 0.8, life: 0.6, size: 0.06, grav: -0.5 }); }
  geyser(at: number[]) { this.burst([at[0], at[1] + 0.6, at[2]], { n: 26, color: 0xb0c8d8, speed: 6.5, dir: [0, 1, 0], spread: 0.15, life: 1.1, size: 0.07, grav: 9.8, drag: 0.4 }); }
  papers(at: number[]) { this.burst([at[0], at[1] + 1.2, at[2]], { n: 60, color: 0xe8e0d0, speed: 3, up: 0.7, life: 4, size: 0.18, grav: 0.8, drag: 2.5 }); }
  glass(at: number[]) { this.burst([at[0], at[1] + 1.2, at[2]], { n: 70, color: 0xcfe0e8, speed: 3.5, life: 1.2, size: 0.05, grav: 9.8 }); }
  coins(at: number[]) { this.burst([at[0], at[1] + 1.2, at[2]], { n: 10, color: 0xc0b890, speed: 2, up: 0.8, life: 1, size: 0.03, grav: 9.8 }); }
  update(dt: number) {
    let k = 0;
    for (let i = this.pdata.length - 1; i >= 0; i--) { const d = this.pdata[i]; d.life -= dt; if (d.life <= 0) { this.pdata.splice(i, 1); } }
    for (const d of this.pdata) {
      d.v.y -= d.grav * dt; d.v.multiplyScalar(Math.max(0, 1 - d.drag * dt)); d.p.addScaledVector(d.v, dt);
      const s = d.size * (0.5 + 0.5 * d.life / d.max);
      this.tmp.position.copy(d.p); this.tmp.rotation.set(d.spin * d.life, d.spin, 0); this.tmp.scale.set(s, d.size > 0.12 ? s * 0.05 : s, s); this.tmp.updateMatrix();
      this.parts.setMatrixAt(k, this.tmp.matrix); this.parts.setColorAt(k, d.color); k++;
    }
    this.parts.count = k; this.parts.instanceMatrix.needsUpdate = true; if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
    let j = 0;
    for (let i = this.tdata.length - 1; i >= 0; i--) { const t = this.tdata[i]; t.life -= dt; if (t.life <= 0) this.tdata.splice(i, 1); }
    for (const t of this.tdata) {
      const mid = t.a.clone().lerp(t.b, 0.5), L = t.a.distanceTo(t.b);
      this.tmp.position.copy(mid); this.tmp.lookAt(t.b); this.tmp.scale.set(0.012, 0.012, L); this.tmp.updateMatrix();
      this.tracers.setMatrixAt(j++, this.tmp.matrix);
    }
    this.tracers.count = j; this.tracers.instanceMatrix.needsUpdate = true;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { this.flash.intensity = 0; this.flashMesh.visible = false; } }
    void this.c;
  }
}
