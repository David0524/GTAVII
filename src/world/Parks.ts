/**
 * Trees and park dressing (user: "Also trees. Madison square park is bare"), from public/data/parks.json
 * (pipeline: park trees clear of the real paths, sparse residential street trees, benches and lamps along
 * park paths, railings on park edges).
 *
 * All instanced: a handful of draw calls for the whole city.
 *   trees  near (<= nearRadius): trunk + 5-lump canopy (~110 tris); far (<= farRadius): one lump (~20 tris)
 *          canopy sways in the wind (vertex shader, per-tree phase), June foliage graded toward olive
 *   benches (wood slats on iron), park lamps (post + globe, lit with the street lights), railings (one
 *   panel per span with procedural pickets: alpha-tested stripes, ~12 tris per 6 m)
 * Instances are re-sorted by distance twice a second (a few thousand items: microseconds).
 */
import * as THREE from 'three/webgpu';
import { positionLocal, uniform, vec3, float, sin, instanceIndex, hash, mx_noise_float, positionWorld, mix, fract, uv, step, attribute } from 'three/tsl';
import { heightAt, CURB_HEIGHT } from '../shared/terrain';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { streetLightUniforms } from './StreetLights';
import type { QualitySettings } from '../engine/quality';

interface ParksData { trees: number[][]; benches: number[][]; lamps: number[][]; rails: number[][] }
export const parkUniforms = { time: uniform(0), wind: uniform(1) };

function lumpCanopy(lumps: number): THREE.BufferGeometry {
  // unit canopy (radius ~1, base at y=0): a cluster of low-poly lumps, merged
  const parts: THREE.BufferGeometry[] = [];
  const pts = lumps === 1 ? [[0, 0.55, 0, 1]] : [[0, 0.6, 0, 0.72], [0.45, 0.45, 0.15, 0.55], [-0.4, 0.5, -0.2, 0.58], [0.1, 0.42, -0.5, 0.52], [-0.15, 0.85, 0.3, 0.5]];
  for (const [x, y, z, r] of pts) {
    const raw = new THREE.IcosahedronGeometry(r, lumps === 1 ? 0 : 1); // near ~400 tris per tree, far ~20 raw.deleteAttribute('normal'); raw.deleteAttribute('uv');
    const ico = mergeVertices(raw); // welded: smooth normals, and the noise below keeps seams closed
    // organic silhouette: deterministic radial noise per vertex (no two lumps alike, no faceted gem look)
    const P = ico.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < P.count; i++) {
      const vx = P.getX(i), vy = P.getY(i), vz = P.getZ(i);
      const n = Math.sin(vx * 7.1 + vz * 3.3) * 0.5 + Math.sin(vy * 9.7 - vx * 4.1) * 0.35 + Math.sin(vz * 11.3 + vy * 2.2) * 0.25;
      const k = 1 + n * 0.12; P.setXYZ(i, vx * k + x, vy * k * 0.85 + y, vz * k + z);
    }
    parts.push(ico);
  }
  return merge(parts, true);
}
function merge(list: THREE.BufferGeometry[], smooth = false): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [];
  for (const g0 of list) {
    if (smooth && g0.index) g0.computeVertexNormals(); // smooth shading across each lump
    const g = g0.index ? g0.toNonIndexed() : g0; if (!smooth) g.computeVertexNormals();
    pos.push(...(g.attributes.position.array as Float32Array)); nor.push(...(g.attributes.normal.array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return out;
}

export class Parks {
  readonly root = new THREE.Group();
  private data!: ParksData;
  private trunks!: THREE.InstancedMesh; private canopy!: THREE.InstancedMesh; private canopyFar!: THREE.InstancedMesh;
  private t = 0;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private s = new THREE.Vector3(); private p = new THREE.Vector3();
  private ground: number[] = [];

  constructor(private quality: QualitySettings) { this.root.name = 'parks'; }

  async load(url: string) {
    this.data = await (await fetch(url)).json();
    const T = this.data.trees; const n = T.length;
    this.ground = T.map(([x, z]) => heightAt(x, z) + CURB_HEIGHT);

    // trunks: tapered 6-sided cylinder, unit height
    const trunkGeo = new THREE.CylinderGeometry(0.07, 0.11, 1, 6, 1, true).translate(0, 0.5, 0);
    const bark = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
    bark.colorNode = mix(vec3(0.07, 0.065, 0.05), vec3(0.17, 0.16, 0.12), mx_noise_float(positionWorld.mul(vec3(3, 0.6, 3))).mul(0.5).add(0.5)); // plane-tree mottling
    this.trunks = new THREE.InstancedMesh(trunkGeo, bark, n);

    // canopy material: June foliage (olive-leaning, the grade desaturates greens further), per-tree tint,
    // dappled variation, wind sway growing with height above the canopy base
    const leaf = new THREE.MeshStandardNodeMaterial({ roughness: 0.85 });
    const tint = hash(instanceIndex.add(7)).mul(0.25);
    const dapple = mx_noise_float(positionWorld.mul(0.9)).mul(0.5).add(0.5);
    leaf.colorNode = mix(vec3(0.1, 0.14, 0.05), vec3(0.2, 0.24, 0.08), dapple.mul(0.7).add(tint));
    const phase = hash(instanceIndex).mul(6.283);
    const sway = sin(parkUniforms.time.mul(1.3).add(phase)).mul(0.045).add(sin(parkUniforms.time.mul(2.9).add(phase.mul(2))).mul(0.015)).mul(parkUniforms.wind);
    leaf.positionNode = positionLocal.add(vec3(sway.mul(positionLocal.y), float(0), sway.mul(0.6).mul(positionLocal.y)));
    this.canopy = new THREE.InstancedMesh(lumpCanopy(5), leaf, n);
    this.canopyFar = new THREE.InstancedMesh(lumpCanopy(1), leaf, n);
    for (const im of [this.trunks, this.canopy, this.canopyFar]) { im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; }
    this.root.add(this.trunks, this.canopy, this.canopyFar);

    this.root.add(this.buildBenches(), this.buildLamps(), this.buildRails());
  }

  private buildBenches(): THREE.Object3D {
    const B = this.data.benches;
    const wood = new THREE.Color(0.24, 0.16, 0.09), iron = new THREE.Color(0.05, 0.05, 0.045);
    const parts: [THREE.BufferGeometry, THREE.Color][] = [
      [new THREE.BoxGeometry(1.8, 0.05, 0.42).translate(0, 0.45, 0), wood], // seat slats
      [new THREE.BoxGeometry(1.8, 0.32, 0.04).translate(0, 0.72, -0.22).rotateX(-0.12), wood], // back
      [new THREE.BoxGeometry(0.06, 0.45, 0.5).translate(-0.8, 0.22, 0), iron], [new THREE.BoxGeometry(0.06, 0.45, 0.5).translate(0.8, 0.22, 0), iron],
    ];
    const geo = mergeColored(parts);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), B.length);
    B.forEach(([x, z, yaw], i) => { this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw); this.p.set(x, heightAt(x, z) + CURB_HEIGHT, z); this.m.compose(this.p, this.q, this.s.set(1, 1, 1)); mesh.setMatrixAt(i, this.m); });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  private buildLamps(): THREE.Object3D {
    const L = this.data.lamps, g = new THREE.Group();
    const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.1, 3.6, 6).translate(0, 1.8, 0), new THREE.MeshStandardMaterial({ color: 0x1f2420, roughness: 0.7, metalness: 0.3 }), L.length);
    const globeMat = new THREE.MeshStandardNodeMaterial({ color: 0xd8d2c0, roughness: 0.3 });
    globeMat.emissiveNode = vec3(1.0, 0.82, 0.55).mul(streetLightUniforms.lightsOn).mul(3.0); // incandescent park globes
    const globe = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 10, 6).translate(0, 3.85, 0), globeMat, L.length);
    L.forEach(([x, z], i) => { this.m.makeTranslation(x, heightAt(x, z) + CURB_HEIGHT, z); post.setMatrixAt(i, this.m); globe.setMatrixAt(i, this.m); });
    for (const im of [post, globe]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
    g.add(post, globe); return g;
  }

  private buildRails(): THREE.Object3D {
    // one unit panel (1 m long, 1.1 m high), stretched along each span; pickets every 12 cm via alpha-tested
    // stripes (span length per instance keeps the spacing constant), solid top and bottom rails
    const R = this.data.rails;
    const geo = new THREE.PlaneGeometry(1, 1.1).translate(0.5, 0.55, 0);
    const lenAttr = new THREE.InstancedBufferAttribute(new Float32Array(R.length), 1);
    geo.setAttribute('spanLen', lenAttr);
    const mat = new THREE.MeshStandardNodeMaterial({ color: 0x141614, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide, alphaTest: 0.5 });
    const u = uv().x, v = uv().y;
    const picket = step(0.62, fract(u.mul(attribute('spanLen', 'float')).div(0.12)));
    mat.opacityNode = picket.max(step(0.9, v)).max(step(v, 0.08));
    const mesh = new THREE.InstancedMesh(geo, mat, R.length);
    R.forEach(([x0, z0, x1, z1], i) => {
      const L = Math.hypot(x1 - x0, z1 - z0); lenAttr.setX(i, L);
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-(z1 - z0), x1 - x0));
      this.p.set(x0, heightAt(x0, z0) + CURB_HEIGHT, z0); this.m.compose(this.p, this.q, this.s.set(L, 1, 1)); mesh.setMatrixAt(i, this.m);
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    return mesh;
  }

  /** Re-sort trees into near/far instance sets around the camera (twice a second) and advance the wind. */
  update(dt: number, cam: THREE.Vector3) {
    parkUniforms.time.value += dt;
    if ((this.t -= dt) > 0 || !this.data) return;
    this.t = 0.5;
    const near = this.quality.name === 'low' ? 160 : this.quality.name === 'medium' ? 260 : 400, far = this.quality.name === 'low' ? 700 : 1400;
    let nN = 0, nF = 0;
    this.data.trees.forEach(([x, z, h, r], i) => {
      const d = Math.hypot(x - cam.x, z - cam.z); if (d > far) return;
      const y = this.ground[i], trunkH = h * 0.42;
      this.q.identity();
      if (d <= near) {
        this.m.compose(this.p.set(x, y, z), this.q, this.s.set(r * 0.9, trunkH + 0.6, r * 0.9)); this.trunks.setMatrixAt(nN, this.m);
        this.m.compose(this.p.set(x, y + trunkH, z), this.q, this.s.set(r, (h - trunkH) * 0.95, r)); this.canopy.setMatrixAt(nN, this.m); nN++;
      } else {
        this.m.compose(this.p.set(x, y + trunkH, z), this.q, this.s.set(r, (h - trunkH) * 0.95, r)); this.canopyFar.setMatrixAt(nF, this.m); nF++;
      }
    });
    this.trunks.count = this.canopy.count = nN; this.canopyFar.count = nF;
    for (const im of [this.trunks, this.canopy, this.canopyFar]) im.instanceMatrix.needsUpdate = true;
  }
  get stats() { return { trees: this.data?.trees.length ?? 0, near: this.canopy?.count ?? 0, far: this.canopyFar?.count ?? 0 }; }
}

function mergeColored(parts: [THREE.BufferGeometry, THREE.Color][]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  for (const [g0, c] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const P = g.attributes.position.array as Float32Array, N = g.attributes.normal.array as Float32Array;
    for (let i = 0; i < P.length; i += 3) { pos.push(P[i], P[i + 1], P[i + 2]); nor.push(N[i], N[i + 1], N[i + 2]); col.push(c.r, c.g, c.b); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
