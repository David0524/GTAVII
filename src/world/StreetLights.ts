/**
 * Street lighting (TIME.md lighting groups). Poles placed along the real centrelines: mast-arm
 * "cobra-head" fixtures with high-pressure sodium on the avenues and Broadway (orange, ~2000 K) and
 * mercury-vapour on the side streets (blue-green, ~4000 K): the signature 1970s NYC night mix
 * (STYLE_GUIDE §8). Three instanced draws total: poles, lamp heads, ground light pools.
 *
 * No real lights: each fixture is an emissive head plus an additive light pool on the ground, so 2,000+
 * fixtures cost three draw calls. Fixtures switch on in a wave at dusk (per-fixture jitter) and can be
 * dimmed per area by brownouts (setPower, N2).
 */
import * as THREE from 'three/webgpu';
import { uniform, instanceIndex, hash, smoothstep, uv, float, vec3, attribute, length, sub, vec2 } from 'three/tsl';
import type { StreetRec } from '../ui/Minimap';
import { heightAt, CURB_HEIGHT } from '../shared/terrain';
import { REGION } from '../shared/geo';

export const streetLightUniforms = { lightsOn: uniform(0) };

const SODIUM = new THREE.Color(1.0, 0.55, 0.18);
const MERCURY = new THREE.Color(0.62, 0.95, 0.82);
const AVENUE = /Avenue|Broadway|^(East|West) (14|23|34|42)(st|nd|rd|th) Street/;

export function buildStreetLights(streets: StreetRec[]): THREE.Group {
  const pts: { x: number; y: number; z: number; yaw: number; sodium: boolean }[] = [];
  for (const s of streets) {
    if (!s.n) continue;
    const sodium = AVENUE.test(s.n);
    const spacing = sodium ? 34 : 42, off = s.w / 2 + 0.55;
    let carry = spacing / 2, side = 1;
    for (let k = 2; k < s.p.length; k += 2) {
      const ax = s.p[k - 2], az = s.p[k - 1], bx = s.p[k], bz = s.p[k + 1];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 1) continue;
      const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
      for (let t = carry; t < L; t += spacing) {
        const x = ax + ux * t + nx * off * side, z = az + uz * t + nz * off * side;
        if (x < REGION.minX || x > REGION.maxX || z < REGION.minZ || z > REGION.maxZ) { side = -side; continue; }
        // arm points back over the roadway
        pts.push({ x, y: heightAt(x, z) + CURB_HEIGHT, z, yaw: Math.atan2(nx * side, nz * side), sodium });
        side = -side;
        carry = t + spacing - L;
      }
      if (carry < 0) carry = spacing / 2;
    }
  }

  const g = new THREE.Group(); g.name = 'streetLights';
  // pole + mast arm (one geometry): 8.6 m pole, 2.4 m arm, dark green-grey paint
  const pole = new THREE.CylinderGeometry(0.07, 0.11, 8.6, 6).translate(0, 4.3, 0);
  const arm = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5).rotateX(Math.PI / 2).translate(0, 8.5, -1.2);
  const head = new THREE.BoxGeometry(0.34, 0.16, 0.7).translate(0, 8.42, -2.35);
  const poleGeo = mergeGeos([pole, arm, head]);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2f342c, roughness: 0.7, metalness: 0.3 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, pts.length);
  // lamp lens (emissive), per-instance colour, switches with lightsOn + per-fixture jitter
  const lensGeo = new THREE.BoxGeometry(0.28, 0.04, 0.55).translate(0, 8.33, -2.35);
  const lensMat = new THREE.MeshStandardNodeMaterial({ color: 0x111111, roughness: 0.4 });
  const on = smoothstep(hash(instanceIndex).mul(0.35), hash(instanceIndex).mul(0.35).add(0.08), streetLightUniforms.lightsOn);
  const lampColor = attribute('lampColor', 'vec3');
  lensMat.emissiveNode = lampColor.mul(on).mul(6.0);
  const lenses = new THREE.InstancedMesh(lensGeo, lensMat, pts.length);
  // ground pool: additive radial falloff under each head
  const poolGeo = new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2).translate(0, 0.03, -2.35);
  const poolMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const r = length(sub(uv(), vec2(0.5, 0.5))).mul(2);
  const fall = float(1).sub(smoothstep(0.0, 1.0, r)).pow(2.2);
  poolMat.colorNode = vec3(lampColor).mul(fall).mul(on).mul(0.55);
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, pts.length);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const colors = new Float32Array(pts.length * 3);
  pts.forEach((pt, i) => {
    q.setFromAxisAngle(up, pt.yaw); p.set(pt.x, pt.y, pt.z);
    m.compose(p, q, one);
    poles.setMatrixAt(i, m); lenses.setMatrixAt(i, m);
    // pools sit on the road surface under the head (terrain-following y at the head position)
    const hx = pt.x - Math.sin(pt.yaw) * 2.35, hz = pt.z - Math.cos(pt.yaw) * 2.35;
    p.set(pt.x, heightAt(hx, hz) + 0.02, pt.z); m.compose(p, q, one); pools.setMatrixAt(i, m);
    const c = pt.sodium ? SODIUM : MERCURY; colors.set([c.r, c.g, c.b], i * 3);
  });
  for (const mesh of [lenses, pools]) mesh.geometry.setAttribute('lampColor', new THREE.InstancedBufferAttribute(colors, 3));
  for (const mesh of [poles, lenses, pools]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.frustumCulled = false; }
  pools.renderOrder = 2;
  g.add(poles, lenses, pools);
  g.userData.count = pts.length;
  return g;
}

function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], idx: number[] = []; let base = 0;
  for (const geo of list) {
    const gi = geo.index ? geo : geo;
    const p = gi.attributes.position.array, n = gi.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
    if (gi.index) for (const v of gi.index.array) idx.push(v + base);
    base += p.length / 3;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}
