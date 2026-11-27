/**
 * `?characters=1&scene=ict`: design scene for synthesised ICT-FaceKit Light identities
 * (dev only; reads data/raw_ict/ict_basis.bin from tools/characters/build-ict.ts).
 *   &c=0.5,-1.2,...   identity coefficients (unit-variance modes, typically -3..3)
 *   &grid=k           mode k at -3, 0, +3 side by side (to learn what each mode does)
 *   &modes=a-b        grid rows for several modes (e.g. 0-5): one row per mode
 *   &cands=c;c;...    candidate identities in a grid (&cols=4)
 *   &yaw=deg          head turn
 * Identities are designed by hand from these controls only; never fitted to photographs.
 */
import * as THREE from 'three/webgpu';
import { readContainer } from '../format';

interface Basis { neutral: Float32Array; splitSrc: Uint32Array; uv: Float32Array; idx: Uint32Array; deltas: Int16Array; scales: Float32Array; nv: number; modes: number; parts: Record<string, [number, number]> }

async function loadBasis(): Promise<Basis> {
  const buf = await (await fetch('/data/raw_ict/ict_basis.bin')).arrayBuffer();
  const c = readContainer(buf), b = (k: string) => c.blobs.get(k) as any;
  return { neutral: b('neutral'), splitSrc: b('splitSrc'), uv: b('uv'), idx: b('idx'), deltas: b('deltas'), scales: b('scales'), nv: c.meta.numSrc, modes: c.meta.modes, parts: c.meta.parts };
}

/** Source-vertex positions for a coefficient vector. */
export function ictPositions(B: Basis, coef: number[]): Float32Array {
  const p = Float32Array.from(B.neutral), n3 = B.nv * 3;
  coef.forEach((w, m) => { if (!w || m >= B.modes) return; const s = w * B.scales[m], o = m * n3; for (let i = 0; i < n3; i++) p[i] += s * B.deltas[o + i]; });
  return p;
}

function headMesh(B: Basis, coef: number[], mats: Record<string, THREE.Material>) {
  const P = ictPositions(B, coef);
  const n = B.splitSrc.length;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const k = B.splitSrc[i]; pos[i * 3] = P[k * 3]; pos[i * 3 + 1] = P[k * 3 + 1]; pos[i * 3 + 2] = P[k * 3 + 2]; }
  const group = new THREE.Group();
  // one geometry per material group (skin, eyes, teeth, mouth, lashes), by source-vertex part
  const partOf = (k: number) => { for (const [name, [a, b]] of Object.entries(B.parts)) if (k >= a && k < b && !name.startsWith('iris')) return name; return 'face'; };
  const groupOf = (name: string) => (/^(face|headNeck|eyeSocket)/.test(name) ? 'skin' : /^eye[LR]$/.test(name) ? 'eye' : /teeth/.test(name) ? 'teeth' : /gums|mouth/.test(name) ? 'mouth' : /lashes/.test(name) ? 'lash' : 'hidden');
  const tris: Record<string, number[]> = {};
  for (let t = 0; t < B.idx.length; t += 3) { const g = groupOf(partOf(B.splitSrc[B.idx[t]])); (tris[g] ??= []).push(B.idx[t], B.idx[t + 1], B.idx[t + 2]); }
  for (const [g, ix] of Object.entries(tris)) {
    if (g === 'hidden' || !mats[g]) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(B.uv, 2));
    geo.setIndex(ix);
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, mats[g]));
  }
  return group;
}

export async function ictScene(world: THREE.Scene, camera: THREE.PerspectiveCamera, report: any, qp: URLSearchParams) {
  const B = await loadBasis();
  const tone = new THREE.Color(qp.get('tone') ?? '#5a3825');
  const mats: Record<string, THREE.Material> = {
    skin: new THREE.MeshPhysicalNodeMaterial({ color: tone, roughness: 0.55, sheen: 0.3, sheenRoughness: 0.5, sheenColor: new THREE.Color(0.25, 0.12, 0.08) }),
    eye: new THREE.MeshPhysicalNodeMaterial({ color: 0xdcd2c4, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 }),
    teeth: new THREE.MeshStandardNodeMaterial({ color: 0xd8cfbc, roughness: 0.35 }),
    mouth: new THREE.MeshStandardNodeMaterial({ color: 0x5a2420, roughness: 0.6 }),
    lash: new THREE.MeshStandardNodeMaterial({ color: 0x141010, roughness: 0.8 }),
  };
  const coef = (qp.get('c') ?? '').split(',').filter(Boolean).map(Number);
  const yaw = THREE.MathUtils.degToRad(Number(qp.get('yaw') ?? 0));
  const heads: THREE.Group[] = [];
  const rows: number[] = [];
  if (qp.has('grid')) rows.push(Number(qp.get('grid')));
  if (qp.has('modes')) { const [a, b] = qp.get('modes')!.split('-').map(Number); for (let m = a; m <= b; m++) rows.push(m); }
  const cands = (qp.get('cands') ?? '').split(';').filter(Boolean).map((c) => c.split(',').map(Number));
  const cols = Number(qp.get('cols') ?? 4);
  if (cands.length) cands.forEach((cv, i) => { const h = headMesh(B, cv, mats); h.position.set(((i % cols) - (cols - 1) / 2) * 0.3, -Math.floor(i / cols) * 0.36, 0); heads.push(h); });
  else if (rows.length) rows.forEach((m, r) => [-3, 0, 3].forEach((w, c) => { const cv = coef.slice(); cv[m] = (cv[m] ?? 0) + w; const h = headMesh(B, cv, mats); h.position.set((c - 1) * 0.3, -r * 0.36, 0); heads.push(h); }));
  else heads.push(headMesh(B, coef, mats));
  for (const h of heads) { h.rotation.y = yaw; world.add(h); }
  const nR = Math.max(1, rows.length, cands.length ? Math.ceil(cands.length / cols) : 0), grid = rows.length || cands.length;
  camera.fov = 30; camera.updateProjectionMatrix();
  camera.position.set(0, -(nR - 1) * 0.18 + 0.02, grid ? Math.max(nR * 0.68, cands.length ? cols * 0.42 : 0) + 0.25 : 0.75); camera.lookAt(0, -(nR - 1) * 0.18, 0);
  report.ict = { modes: B.modes, rows, coef };
  return () => {};
}
