/**
 * Offline animation build: retargets Quaternius Universal Animation Library 1 + 2 (CC0) clips
 * onto our rig (src/characters/rig.ts) and writes public/characters/anims.bin.
 *   npx tsx tools/characters/build-anims.ts
 *
 * Retargeting: for every joint, the clip's world-space rotation delta from the source bind pose
 * is applied to our identity-oriented rest pose, after a per-bone alignment rotation that maps
 * the source rest bone frame onto ours (two-axis where a secondary axis is meaningful, minimal
 * rotation otherwise). Our rest is MakeHuman's A-pose, theirs a T-pose; the alignment absorbs it.
 * Root motion is never applied (the engine's Rapier controller owns position); the _RM files are
 * read only to measure each clip's travel speed and foot-contact phases.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { readGlb, accessor, type Glb } from './lib/io.ts';
import { RAW } from './sources.ts';
import { writeContainer, readContainer, formatReady } from '../../src/characters/format.ts';
import { JOINTS, JOINT_INDEX, NUM_JOINTS, primaryChild } from '../../src/characters/rig.ts';
await formatReady(); // meshopt-coded index blobs

const OUT = path.resolve(import.meta.dirname, '../../public/characters');
const FPS = 30;

const CLIPS: Record<string, string[]> = {
  'UAL1_Standard.glb': ['A_TPose', 'Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop',
    'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Hit_Chest', 'Hit_Head', 'Push_Loop',
    'Sitting_Enter', 'Sitting_Idle_Loop', 'Sitting_Exit', 'Sitting_Talking_Loop', 'Driving_Loop', 'Interact', 'PickUp_Table',
    'Fixing_Kneeling', 'Roll', 'Death01', 'Punch_Jab', 'Punch_Cross',
    'Pistol_Idle_Loop', 'Pistol_Aim_Down', 'Pistol_Aim_Neutral', 'Pistol_Aim_Up', 'Pistol_Shoot', 'Pistol_Reload'],
  'UAL2_Standard.glb': ['ClimbUp_1m', 'Consume', 'Hit_Knockback', 'Idle_FoldArms_Loop', 'Idle_No_Loop', 'Idle_Rail_Call', 'Idle_Rail_Loop',
    'Idle_TalkingPhone_Loop', 'LayToIdle', 'Walk_Carry_Loop', 'Yes', 'OverhandThrow'],
};

// --- our rest pose (from the neutral body) ------------------------------------------------------
const bodyBuf = fs.readFileSync(path.join(OUT, 'body.bin'));
const body = readContainer(bodyBuf.buffer.slice(bodyBuf.byteOffset, bodyBuf.byteOffset + bodyBuf.length));
const rest = (body.meta.restJoints as number[][]).map((p) => new THREE.Vector3(...p));
const restMin = Math.min(...rest.map((p) => p.y));
const ourPelvisH = rest[JOINT_INDEX.pelvis].y - restMin;

// --- source skeleton ---------------------------------------------------------------------------
interface Src { glb: Glb; nodes: THREE.Object3D[]; byName: Map<string, number>; bindWorld: THREE.Matrix4[] }
function loadSrc(file: string): Src {
  const glb = readGlb(fs.readFileSync(path.join(RAW, file)));
  const nodes = glb.json.nodes.map((n: any) => {
    const o = new THREE.Object3D(); o.name = n.name;
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  glb.json.nodes.forEach((n: any, i: number) => (n.children || []).forEach((c: number) => nodes[i].add(nodes[c])));
  nodes.filter((o: THREE.Object3D) => !o.parent).forEach((r: THREE.Object3D) => r.updateMatrixWorld(true));
  const byName = new Map<string, number>(nodes.map((o: THREE.Object3D, i: number) => [o.name, i]));
  const skin = glb.json.skins[0];
  const ibm = accessor(glb, skin.inverseBindMatrices).data;
  const bindWorld: THREE.Matrix4[] = nodes.map((o: THREE.Object3D) => o.matrixWorld.clone());
  skin.joints.forEach((ni: number, k: number) => { bindWorld[ni] = new THREE.Matrix4().fromArray(ibm, k * 16).invert(); });
  return { glb, nodes, byName, bindWorld };
}

const posOf = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixPosition(m);
const rotOf = (m: THREE.Matrix4) => { const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s); return q; };

/** Source node used for each of our joints (null = no source; stays at rest / procedural). */
const srcName = (j: number): string | null => {
  const n = JOINTS[j].name;
  if (n === 'jaw' || n.startsWith('eye_')) return null;
  return n;
};
/** Direction helper points: [from, to] in our rig and in the source. */
function frames(src: Src) {
  const A: THREE.Quaternion[] = [];
  const bp = (name: string) => posOf(src.bindWorld[src.byName.get(name)!]);
  for (let j = 0; j < NUM_JOINTS; j++) {
    const n = JOINTS[j].name;
    if (!srcName(j)) { A.push(new THREE.Quaternion()); continue; }
    let tP: THREE.Vector3, sP: THREE.Vector3;
    let tS: THREE.Vector3 | null = null, sS: THREE.Vector3 | null = null;
    const c = primaryChild(j);
    const side = n.slice(-1);
    if (n === 'root') { A.push(new THREE.Quaternion()); continue; }
    if (['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head'].includes(n)) {
      const up = n === 'Head' ? null : JOINTS[c].name;
      tP = up ? rest[c].clone().sub(rest[j]) : new THREE.Vector3(0, 1, 0);
      sP = up ? bp(up).sub(bp(n)) : new THREE.Vector3(0, 1, 0);
      if (n === 'Head') { sP = bp('Head').sub(bp('neck_01')); tP = rest[j].clone().sub(rest[JOINT_INDEX.neck_01]); }
      tS = new THREE.Vector3(1, 0, 0); sS = new THREE.Vector3(1, 0, 0); // character left
    } else if (n.startsWith('hand_')) {
      tP = rest[JOINT_INDEX[`middle_01_${side}`]].clone().sub(rest[j]); sP = bp(`middle_01_${side}`).sub(bp(n));
      tS = rest[JOINT_INDEX[`index_01_${side}`]].clone().sub(rest[JOINT_INDEX[`pinky_01_${side}`]]);
      sS = bp(`index_01_${side}`).sub(bp(`pinky_01_${side}`));
    } else if (n.startsWith('foot_')) {
      tP = rest[JOINT_INDEX[`ball_${side}`]].clone().sub(rest[j]); sP = bp(`ball_${side}`).sub(bp(n));
      tS = new THREE.Vector3(0, 1, 0); sS = new THREE.Vector3(0, 1, 0);
    } else if (n.startsWith('ball_')) {
      tP = new THREE.Vector3(...(body.meta.landmarks ? [0, 0, 1] : [0, 0, 1])); sP = bp(`ball_leaf_${side}`).sub(bp(n));
      tP = new THREE.Vector3(0, 0, 1);
      tS = new THREE.Vector3(0, 1, 0); sS = new THREE.Vector3(0, 1, 0);
    } else if (c >= 0) {
      tP = rest[c].clone().sub(rest[j]); sP = bp(JOINTS[c].name).sub(bp(n));
    } else {
      // finger tips: use the parent segment direction, extended to the source leaf
      const p = JOINTS[j].parent;
      tP = rest[j].clone().sub(rest[p]);
      const leaf = n.replace(/_03_/, '_04_leaf_');
      sP = src.byName.has(leaf) ? bp(leaf).sub(bp(n)) : bp(n).sub(bp(JOINTS[p].name));
    }
    tP.normalize(); sP.normalize();
    if (tS && sS) {
      const frame = (p: THREE.Vector3, s: THREE.Vector3) => {
        const x = p.clone(); const z = new THREE.Vector3().crossVectors(x, s).normalize(); const y = new THREE.Vector3().crossVectors(z, x);
        return new THREE.Matrix4().makeBasis(x, y, z);
      };
      const Ft = frame(tP, tS), Fs = frame(sP, sS);
      A.push(new THREE.Quaternion().setFromRotationMatrix(Ft.multiply(Fs.transpose())));
    } else A.push(new THREE.Quaternion().setFromUnitVectors(sP, tP));
  }
  return A;
}

// --- sampling ------------------------------------------------------------------------------------
function sampleTrack(g: Glb, sampler: any, t: number, size: number): number[] {
  const times = accessor(g, sampler.input).data, vals = accessor(g, sampler.output).data;
  const n = times.length;
  const cubic = sampler.interpolation === 'CUBICSPLINE';
  const at = (i: number) => (cubic ? Array.from(vals.slice((i * 3 + 1) * size, (i * 3 + 2) * size)) : Array.from(vals.slice(i * size, (i + 1) * size)));
  if (t <= times[0]) return at(0);
  if (t >= times[n - 1]) return at(n - 1);
  let i = 0; while (i < n - 2 && times[i + 1] < t) i++;
  const u = (t - times[i]) / (times[i + 1] - times[i]);
  const a = at(i), b = at(i + 1);
  if (sampler.interpolation === 'STEP') return a;
  if (size === 4) { const qa = new THREE.Quaternion().fromArray(a), qb = new THREE.Quaternion().fromArray(b); return qa.slerp(qb, u).toArray(); }
  return a.map((x, k) => x + (b[k] - x) * u);
}
const trackCache = new Map<string, any>();
function clipPose(src: Src, anim: any, t: number): THREE.Matrix4[] {
  // reset to rest TRS, apply channels, compute world
  src.glb.json.nodes.forEach((n: any, i: number) => {
    const o = src.nodes[i];
    o.position.fromArray(n.translation ?? [0, 0, 0]); o.quaternion.fromArray(n.rotation ?? [0, 0, 0, 1]); o.scale.fromArray(n.scale ?? [1, 1, 1]);
  });
  for (const ch of anim.channels) {
    const o = src.nodes[ch.target.node];
    const s = anim.samplers[ch.sampler];
    const key = `${anim.name}:${ch.sampler}`;
    if (!trackCache.has(key)) trackCache.set(key, s);
    if (ch.target.path === 'rotation') o.quaternion.fromArray(sampleTrack(src.glb, s, t, 4));
    else if (ch.target.path === 'translation') o.position.fromArray(sampleTrack(src.glb, s, t, 3));
    else if (ch.target.path === 'scale') o.scale.fromArray(sampleTrack(src.glb, s, t, 3));
  }
  src.nodes.filter((o) => !o.parent).forEach((r) => r.updateMatrixWorld(true));
  return src.nodes.map((o) => o.matrixWorld.clone());
}
const clipDuration = (g: Glb, anim: any) => Math.max(...anim.samplers.map((s: any) => g.json.accessors[s.input].max[0]));

// --- main ----------------------------------------------------------------------------------------
const clipsMeta: any[] = [];
const rotBlobs: Int16Array[] = [], pelvisBlobs: Float32Array[] = [];
for (const [file, names] of Object.entries(CLIPS)) {
  const src = loadSrc(file);
  const rm = loadSrc(file.replace('.glb', '_RM.glb'));
  const A = frames(src);
  const Ainv = A.map((q) => q.clone().invert());
  const bindRot = JOINTS.map((_, j) => { const n = srcName(j); return n ? rotOf(src.bindWorld[src.byName.get(n)!]) : new THREE.Quaternion(); });
  const bindRotInv = bindRot.map((q) => q.clone().invert());
  const srcPelvisH = posOf(src.bindWorld[src.byName.get('pelvis')!]).y;
  for (const name of names) {
    const anim = src.glb.json.animations.find((a: any) => a.name === name);
    if (!anim) { console.warn('missing clip', name); continue; }
    const dur = clipDuration(src.glb, anim);
    const frames = Math.max(2, Math.round(dur * FPS) + 1);
    const rot = new Int16Array(frames * NUM_JOINTS * 4);
    const pel = new Float32Array(frames * 3);
    const world: THREE.Quaternion[] = [];
    for (let f = 0; f < frames; f++) {
      const t = Math.min(dur, f / FPS);
      const W = clipPose(src, anim, t);
      for (let j = 0; j < NUM_JOINTS; j++) {
        const n = srcName(j);
        let q: THREE.Quaternion;
        if (!n || n === 'root') q = j === 0 ? new THREE.Quaternion() : world[JOINTS[j].parent].clone();
        else {
          const delta = rotOf(W[src.byName.get(n)!]).multiply(bindRotInv[j]);
          q = delta.multiply(Ainv[j]);
        }
        world[j] = q;
        const parentW = j === 0 ? new THREE.Quaternion() : world[JOINTS[j].parent];
        const local = parentW.clone().invert().multiply(q).normalize();
        if (local.w < 0) { local.x = -local.x; local.y = -local.y; local.z = -local.z; local.w = -local.w; }
        const o = (f * NUM_JOINTS + j) * 4;
        rot[o] = Math.round(local.x * 32767); rot[o + 1] = Math.round(local.y * 32767); rot[o + 2] = Math.round(local.z * 32767); rot[o + 3] = Math.round(local.w * 32767);
      }
      // pelvis position relative to the root, scaled to our proportions
      const pp = posOf(W[src.byName.get('pelvis')!]).sub(posOf(W[src.byName.get('root')!]));
      const s = ourPelvisH / srcPelvisH;
      pel[f * 3] = pp.x * s; pel[f * 3 + 1] = pp.y * s; pel[f * 3 + 2] = pp.z * s;
    }
    // root motion + foot contacts from the RM variant
    const rmAnim = rm.glb.json.animations.find((a: any) => a.name === name);
    let speed = 0, travel = [0, 0, 0];
    const contacts: Record<string, [number, number][]> = { l: [], r: [] };
    if (rmAnim) {
      const W0 = clipPose(rm, rmAnim, 0), W1 = clipPose(rm, rmAnim, dur);
      const r0 = posOf(W0[rm.byName.get('root')!]), r1 = posOf(W1[rm.byName.get('root')!]);
      travel = [r1.x - r0.x, r1.y - r0.y, r1.z - r0.z].map((x) => x * (ourPelvisH / srcPelvisH));
      speed = Math.hypot(travel[0], travel[2]) / Math.max(dur, 1e-3);
      // contacts: ball joint nearly still in world space and near its lowest height
      for (const side of ['l', 'r'] as const) {
        const N = 48; const ys: number[] = [], vs: number[] = [];
        let prev: THREE.Vector3 | null = null;
        for (let k = 0; k <= N; k++) {
          const W = clipPose(rm, rmAnim, (k / N) * dur);
          const p = posOf(W[rm.byName.get(`ball_${side}`)!]).add(posOf(W[rm.byName.get(`foot_${side}`)!])).multiplyScalar(0.5);
          ys.push(p.y); vs.push(prev ? p.distanceTo(prev) / (dur / N) : 0); prev = p;
        }
        vs[0] = vs[1];
        const minY = Math.min(...ys);
        let start = -1;
        for (let k = 0; k <= N; k++) {
          const planted = ys[k] < minY + 0.035 && vs[k] < Math.max(0.35, speed * 0.25);
          if (planted && start < 0) start = k;
          if ((!planted || k === N) && start >= 0) { contacts[side].push([start / N, k / N]); start = -1; }
        }
      }
    }
    clipsMeta.push({ name, file, duration: dur, frames, fps: FPS, loop: /_Loop$/.test(name), speed: +speed.toFixed(3), travel: travel.map((x) => +x.toFixed(3)), contacts });
    rotBlobs.push(rot); pelvisBlobs.push(pel);
    console.log(name.padEnd(24), `${dur.toFixed(2)}s`, `speed ${speed.toFixed(2)} m/s`, 'contacts', JSON.stringify(contacts));
  }
}
const blobs: Record<string, ArrayBufferView> = {};
clipsMeta.forEach((_c, i) => { blobs[`rot_${i}`] = rotBlobs[i]; blobs[`pel_${i}`] = pelvisBlobs[i]; });
const bin = writeContainer({ version: 1, source: 'Quaternius Universal Animation Library 1+2 (CC0), retargeted', numJoints: NUM_JOINTS, restPelvisHeight: ourPelvisH, clips: clipsMeta }, blobs);
fs.writeFileSync(path.join(OUT, 'anims.bin'), bin);
console.log('wrote anims.bin', (bin.length / 1048576).toFixed(2), 'MiB', clipsMeta.length, 'clips');
