/**
 * Free prop models (CC0 GLBs from tools/interiors/fetchProps.ts) instanced into live interiors.
 * Each model object is parented to its cell's opaque mesh, so portal culling hides it with the cell.
 * Geometry and materials are shared across instances (userData.shared stops unload from disposing them).
 *
 * Lighting: the models use their glTF PBR materials (lit). Until the engine's PBR foundation (ENGINE_REQUESTS 9) lands,
 * `cellLights` adds up to two point lights per cell from the interior's baked light list so the models are lit
 * coherently with the baked room.
 */
import * as THREE from 'three/webgpu';
import manifest from '../props/manifest.json';
import type { BuiltInterior, ModelOut } from '../spec';

type Entry = { file: string; bounds: number[]; tris: number | null };
const M = manifest as Record<string, Entry>;
/** Heading offset so every model faces -z in its own frame (the kit convention: the user-facing side toward -z). */
export const YAW_OFFSET: Record<string, number> = {};

/**
 * Minimal GLB reader on three/webgpu (GLTFLoader imports 'three', which would ship a second copy of three.js next to
 * 'three/webgpu'). Handles what fetchProps.ts produces: node TRS hierarchy, indexed triangle primitives with
 * POSITION/NORMAL/TEXCOORD_0, metal-rough materials with base colour, normal and ORM textures, embedded JPEG images.
 */
async function readGlb(url: string): Promise<THREE.Object3D> {
  const buf = await (await fetch(url)).arrayBuffer(), dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error(`not a GLB: ${url}`);
  const jl = dv.getUint32(12, true), j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
  const binOff = 20 + jl + 8;
  const COMP: Record<number, { new (b: ArrayBuffer, o: number, n: number): ArrayLike<number> }> = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array } as never;
  const SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const accessor = (i: number) => {
    const a = j.accessors[i], bv = j.bufferViews[a.bufferView], n = SIZE[a.type], C = COMP[a.componentType];
    const bpe = (C as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT, stride = bv.byteStride ?? 0, off = binOff + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    if (stride && stride !== n * bpe) { // de-interleave
      const out = new (C as never as Float32ArrayConstructor)(a.count * n), src = new DataView(buf);
      for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = a.componentType === 5126 ? src.getFloat32(off + k * stride + c * 4, true) : src.getUint16(off + k * stride + c * 2, true);
      return { arr: out, n };
    }
    return { arr: new (C as never as Float32ArrayConstructor)(buf.slice(off, off + a.count * n * bpe)), n };
  };
  const tex = new Map<number, Promise<THREE.Texture>>();
  const texture = (i: number, srgb: boolean) => {
    const key = i * 2 + (srgb ? 1 : 0); let p = tex.get(key);
    if (!p) {
      const img = j.images[j.textures[i].source], bv = j.bufferViews[img.bufferView];
      const blob = new Blob([new Uint8Array(buf, binOff + (bv.byteOffset ?? 0), bv.byteLength)], { type: img.mimeType ?? 'image/jpeg' });
      p = createImageBitmap(blob, { imageOrientation: 'none' }).then((bm) => {
        const t = new THREE.Texture(bm as unknown as HTMLImageElement); t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t;
      });
      tex.set(key, p);
    }
    return p;
  };
  const mats = await Promise.all((j.materials ?? []).map(async (m: any) => {
    const pbr = m.pbrMetallicRoughness ?? {}, mat = new THREE.MeshStandardNodeMaterial();
    if (pbr.baseColorFactor) { mat.color.setRGB(pbr.baseColorFactor[0], pbr.baseColorFactor[1], pbr.baseColorFactor[2]); mat.opacity = pbr.baseColorFactor[3]; }
    mat.metalness = pbr.metallicFactor ?? 1; mat.roughness = pbr.roughnessFactor ?? 1;
    if (pbr.baseColorTexture) mat.map = await texture(pbr.baseColorTexture.index, true);
    if (pbr.metallicRoughnessTexture) mat.metalnessMap = mat.roughnessMap = await texture(pbr.metallicRoughnessTexture.index, false);
    if (m.normalTexture) { mat.normalMap = await texture(m.normalTexture.index, false); if (m.normalTexture.scale) mat.normalScale.setScalar(m.normalTexture.scale); }
    if (m.occlusionTexture) mat.aoMap = await texture(m.occlusionTexture.index, false);
    mat.side = m.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    if (m.alphaMode === 'MASK') { mat.alphaTest = m.alphaCutoff ?? 0.5; } else if (m.alphaMode === 'BLEND') mat.transparent = true;
    mat.name = m.name ?? ''; return mat;
  }));
  const meshes = (j.meshes ?? []).map((me: any) => {
    const g = new THREE.Group();
    for (const p of me.primitives) {
      const geo = new THREE.BufferGeometry();
      for (const [attr, name] of [['POSITION', 'position'], ['NORMAL', 'normal'], ['TEXCOORD_0', 'uv']] as const) {
        if (p.attributes[attr] === undefined) continue; const { arr, n } = accessor(p.attributes[attr]); geo.setAttribute(name, new THREE.BufferAttribute(arr as Float32Array, n));
      }
      if (geo.getAttribute('uv')) geo.setAttribute('uv1', geo.getAttribute('uv')); // aoMap channel
      if (p.indices !== undefined) geo.setIndex(new THREE.BufferAttribute(accessor(p.indices).arr as unknown as Uint32Array, 1));
      if (!geo.getAttribute('normal')) geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, mats[p.material] ?? new THREE.MeshStandardNodeMaterial()));
    }
    return g;
  });
  const node = (i: number): THREE.Object3D => {
    const n = j.nodes[i], o = n.mesh !== undefined ? meshes[n.mesh].clone(false) : new THREE.Group();
    if (n.mesh !== undefined) for (const ch of meshes[n.mesh].children) o.add(ch.clone(false));
    if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
    else { if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale); }
    for (const c of n.children ?? []) o.add(node(c));
    return o;
  };
  const root = new THREE.Group();
  for (const r of j.scenes[j.scene ?? 0].nodes) root.add(node(r));
  return root;
}

const cache = new Map<string, Promise<THREE.Object3D | null>>();
function load(base: string, key: string) {
  let p = cache.get(key);
  if (!p) {
    const e = M[key];
    p = e ? readGlb(base + e.file).then((scene) => { scene.traverse((o) => { o.userData.shared = true; const me = o as THREE.Mesh; if (me.isMesh) { me.castShadow = true; me.receiveShadow = true; } }); return scene; }).catch((err) => { console.warn('interiors: model', key, err); return null; }) : Promise.resolve(null);
    cache.set(key, p);
  }
  return p;
}
export const hasModel = (key: string) => key in M;

/** Place the interior's models under its cell meshes. Resolves when all are attached (missing keys are skipped). */
export async function placeModels(base: string, built: BuiltInterior, cellMeshes: THREE.Object3D[]) {
  await Promise.all(built.models.map(async (m: ModelOut) => {
    const src = await load(base, m.key); const parent = cellMeshes[m.cell];
    if (!src || !parent) return;
    const o = src.clone(true); o.userData.shared = true;
    o.position.set(m.x, m.y, m.z); o.rotation.y = m.yaw + (YAW_OFFSET[m.key] ?? 0); if (m.s) o.scale.setScalar(m.s);
    parent.add(o);
  }));
}

/** Interim lighting for lit models: the two strongest baked lights of each cell become point lights under that cell. */
export function cellLights(built: BuiltInterior, cellMeshes: THREE.Object3D[], power = 1) {
  const byCell = new Map<number, BuiltInterior['lights']>();
  for (const l of built.lights) { if (l.kind === 'window') continue; const a = byCell.get(l.cell) ?? []; a.push(l); byCell.set(l.cell, a); }
  for (const [cell, ls] of byCell) {
    const parent = cellMeshes[cell]; if (!parent) continue;
    ls.sort((a, b) => b.intensity - a.intensity);
    for (const l of ls.slice(0, 2)) {
      const p = new THREE.PointLight(new THREE.Color(...l.color), l.intensity * 2.2 * power, 9, 2);
      p.position.set(l.x, l.y - 0.15, l.z); p.userData.shared = true; parent.add(p);
    }
  }
}
