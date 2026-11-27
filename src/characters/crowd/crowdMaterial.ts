/**
 * Crowd material: GPU skinning from the baked bone atlas + per-instance transform and colour
 * tints, sharing the character surface shading (patterns, wear, skin). One compiled pipeline
 * for every crowd draw.
 */
import * as THREE from 'three/webgpu';
import { attribute, Fn, float, vec3, vec4, ivec2, int, textureLoad, mix, cos, sin, dot, floor, mod, normalLocal, positionLocal, uniform, varying, transformNormalToView } from 'three/tsl';
import { surfaceNodes } from '../render/materials';
import { NB } from './bake';

export const ATLAS_ROWS = 1024;

export function crowdMaterial(atlas: THREE.DataTexture): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
  const iA = attribute('iA', 'vec4'); // x, y, z, yaw
  const iB = attribute('iB', 'vec4'); // frame0, frame1, t, scale
  const iC = attribute('iC', 'vec4'); // hue/val for slots 1 (top) and 2 (bottom)
  const iD = attribute('iD', 'vec4'); // hue/val for slot 3 (outer), skin tone shift, unused
  const cj = attribute('cj', 'vec4'), cw = attribute('cw', 'vec4');
  const rows = float(ATLAS_ROWS);
  const fetchRow = (frame: any, j: any, k: number) => {
    const block = floor(frame.div(rows)), row = mod(frame, rows);
    const x = block.mul(NB * 3).add(j.mul(3)).add(k);
    return textureLoad(atlas, ivec2(int(x), int(row)));
  };
  const vNormal = varying(vec3(0, 1, 0), 'vCrowdNormal');
  const skinned = Fn(() => {
    const p = vec4(positionLocal, 1);
    const n = normalLocal;
    const outP = vec3(0).toVar(), outN = vec3(0).toVar();
    for (let i = 0; i < 4; i++) {
      const j = (cj as any)[['x', 'y', 'z', 'w'][i]], w = (cw as any)[['x', 'y', 'z', 'w'][i]];
      const r0 = mix(fetchRow(iB.x, j, 0), fetchRow(iB.y, j, 0), iB.z);
      const r1 = mix(fetchRow(iB.x, j, 1), fetchRow(iB.y, j, 1), iB.z);
      const r2 = mix(fetchRow(iB.x, j, 2), fetchRow(iB.y, j, 2), iB.z);
      outP.addAssign(vec3(dot(r0, p), dot(r1, p), dot(r2, p)).mul(w));
      outN.addAssign(vec3(dot(r0.xyz, n), dot(r1.xyz, n), dot(r2.xyz, n)).mul(w));
    }
    // instance transform: scale, yaw about +Y, translate
    const c = cos(iA.w), s = sin(iA.w);
    const sp = outP.mul(iB.w);
    const world = vec3(sp.x.mul(c).add(sp.z.mul(s)), sp.y, sp.z.mul(c).sub(sp.x.mul(s))).add(iA.xyz);
    const nr = vec3(outN.x.mul(c).add(outN.z.mul(s)), outN.y, outN.z.mul(c).sub(outN.x.mul(s)));
    vNormal.assign(nr);
    return world;
  });
  m.positionNode = skinned();
  m.normalNode = transformNormalToView(vNormal.normalize());
  // per-instance colour: hue rotation (YIQ) and value scale per garment slot; skin tone shift
  const slot = attribute('slot', 'float');
  const tint = (col: any) => {
    const s1 = slot.equal(1), s2 = slot.equal(2), s3 = slot.equal(3), s0 = slot.equal(0);
    const hue = s1.select(iC.x, s2.select(iC.z, s3.select(iD.x, float(0))));
    const val = s1.select(iC.y, s2.select(iC.w, s3.select(iD.y, float(1))));
    const y = dot(col, vec3(0.299, 0.587, 0.114)), i = dot(col, vec3(0.596, -0.274, -0.322)), q = dot(col, vec3(0.211, -0.523, 0.312));
    const ch = cos(hue), sh = sin(hue);
    const i2 = i.mul(ch).sub(q.mul(sh)), q2 = i.mul(sh).add(q.mul(ch));
    const rgb = vec3(y.add(i2.mul(0.956)).add(q2.mul(0.621)), y.sub(i2.mul(0.272)).sub(q2.mul(0.647)), y.sub(i2.mul(1.106)).add(q2.mul(1.703))).max(0).mul(val);
    return s0.select(col.mul(iD.z.add(1)), rgb);
  };
  const { color, roughness } = surfaceNodes(tint);
  m.colorNode = color;
  m.roughnessNode = roughness;
  m.metalnessNode = float(0);
  void uniform;
  return m;
}
