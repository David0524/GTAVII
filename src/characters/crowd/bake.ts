/**
 * Bakes a crowd template's animation set into skinning matrices (3×vec4 per bone per frame)
 * for GPU instancing. Poses come from the full Animator (stride warp, posture, layers), so the
 * crowd moves like the near characters; only the skeleton detail is reduced (fingers → hand,
 * jaw/eyes → head).
 */
import { JOINTS, NUM_JOINTS, crowdJoint } from '../rig';
import { Animator, type Personality } from '../anim/Animator';
import type { AnimLibrary } from '../anim/AnimLibrary';

/** Crowd skeleton: the joints that survive crowdJoint(), in rig order. */
export const CROWD_JOINTS: number[] = [...new Set(JOINTS.map((_, j) => crowdJoint(j)))].sort((a, b) => a - b);
export const CROWD_INDEX: Int16Array = (() => { const m = new Int16Array(NUM_JOINTS).fill(-1); CROWD_JOINTS.forEach((j, i) => (m[j] = i)); return m; })();
export const NB = CROWD_JOINTS.length;

export interface BakeClip { name: string; frames: number; fps: number; loop: boolean; speed: number; cycle: number }
/** The crowd animation set. speed = ground speed the cycle was baked at (m/s); cycle = seconds per loop. */
/** only: bake for these template kinds only (vendor work clips stay out of everyone else's atlas). overlay: an upper-body action layered on a move cycle. */
export const CROWD_SET: { name: string; kind: 'idle' | 'move' | 'action'; speed?: number; action?: string; seconds?: number; fps?: number; only?: string[]; overlay?: string }[] = [
  { name: 'idle', kind: 'idle', seconds: 6, fps: 12 },
  { name: 'idle_heat', kind: 'action', action: 'idle_heat', seconds: 5, fps: 12 },
  { name: 'walk_slow', kind: 'move', speed: 0.8, fps: 24 },
  { name: 'walk', kind: 'move', speed: 1.3, fps: 24 },
  { name: 'walk_brisk', kind: 'move', speed: 1.75, fps: 24 },
  { name: 'run', kind: 'move', speed: 3.6, fps: 24 },
  { name: 'sprint', kind: 'move', speed: 6.0, fps: 24 },
  { name: 'talk', kind: 'action', action: 'talk:neutral', seconds: 3.2, fps: 12 },
  { name: 'argue', kind: 'action', action: 'argue', seconds: 2.4, fps: 15 },
  { name: 'smoke', kind: 'action', action: 'smoke', seconds: 7, fps: 10 },
  { name: 'read', kind: 'action', action: 'read_paper', seconds: 6, fps: 10 },
  { name: 'sit', kind: 'action', action: 'sit_stoop', seconds: 6, fps: 8 },
  { name: 'lean', kind: 'action', action: 'lean_wall', seconds: 6, fps: 8 },
  { name: 'hail', kind: 'action', action: 'hail_cab', seconds: 2.6, fps: 15 },
  { name: 'cower', kind: 'action', action: 'cower', seconds: 2, fps: 12 },
  { name: 'rubberneck', kind: 'action', action: 'rubberneck', seconds: 4, fps: 10 },
  { name: 'push', kind: 'action', action: 'push_cart', seconds: 2.67, fps: 20 },
  { name: 'wave_off', kind: 'action', action: 'wave_off', seconds: 2.4, fps: 15 },
  // customers (any pedestrian): queue at a stall, lean in at the monte game, eat/drink on the go
  { name: 'queue', kind: 'action', action: 'queue', seconds: 7, fps: 8 },
  { name: 'watch', kind: 'action', action: 'watch', seconds: 4, fps: 10 },
  { name: 'walk_eat', kind: 'move', speed: 1.2, fps: 20, overlay: 'eat_walk' },
  { name: 'walk_sip', kind: 'move', speed: 1.2, fps: 20, overlay: 'sip_walk' },
  // bumps (sim MOVEMENT): stumble, knocked down, lying, getting up, angry
  { name: 'stumble', kind: 'action', action: 'stumble', seconds: 1.1, fps: 15 },
  { name: 'fall', kind: 'action', action: 'fall_down', seconds: 0.9, fps: 15 },
  { name: 'down', kind: 'action', action: 'down', seconds: 3, fps: 6 },
  { name: 'get_up', kind: 'action', action: 'get_up', seconds: 2.4, fps: 12 },
  // sim incidents (fender-bender acts) and ambient scenarios (act:<name>), drunk walkers
  { name: 'inspect', kind: 'action', action: 'inspect', seconds: 4, fps: 8 },
  { name: 'shove', kind: 'action', action: 'shove', seconds: 1.8, fps: 15 },
  { name: 'details', kind: 'action', action: 'exchange_details', seconds: 4.5, fps: 8 },
  { name: 'cards', kind: 'action', action: 'play_cards', seconds: 6, fps: 8 },
  { name: 'cooloff', kind: 'action', action: 'cooloff', seconds: 2.4, fps: 15 },
  { name: 'slumped', kind: 'action', action: 'slumped', seconds: 6, fps: 6 },
  { name: 'sweep', kind: 'action', action: 'sweep', seconds: 2.2, fps: 12 },
  { name: 'walk_drunk', kind: 'move', speed: 0.9, fps: 20, overlay: 'drunk_sway' },
  // street vendors' work (vendor templates only)
  { name: 'serve', kind: 'action', action: 'vendor_serve', seconds: 3, fps: 12, only: ['vendor'] },
  { name: 'call', kind: 'action', action: 'vendor_call', seconds: 2.4, fps: 12, only: ['vendor'] },
  { name: 'shout', kind: 'action', action: 'vendor_shout', seconds: 2, fps: 12, only: ['vendor'] },
  { name: 'duck', kind: 'action', action: 'duck_cart', seconds: 2, fps: 10, only: ['vendor'] },
  { name: 'right_cart', kind: 'action', action: 'right_cart', seconds: 3, fps: 12, only: ['vendor'] },
  { name: 'shine', kind: 'action', action: 'shine_shoes', seconds: 1.2, fps: 15, only: ['vendor'] },
  { name: 'deal', kind: 'action', action: 'deal_cards', seconds: 1.6, fps: 15, only: ['vendor'] },
];

export interface Baked { data: Float32Array; clips: BakeClip[]; frames: number }

/**
 * restJoints: the template's rest joint positions (character space, metres, shoe lift included).
 * Writes NB*3 vec4 per frame: rows of (worldMatrix × inverseBind).
 */
export function bakeTemplate(lib: AnimLibrary, restJoints: Float32Array, p: Personality, kind = 'general'): Baked {
  const clips: BakeClip[] = [];
  const frames: Float32Array[] = [];
  const restOff = new Float32Array(NUM_JOINTS * 3);
  for (let j = 0; j < NUM_JOINTS; j++) { const par = JOINTS[j].parent; for (let c = 0; c < 3; c++) restOff[j * 3 + c] = restJoints[j * 3 + c] - (par >= 0 ? restJoints[par * 3 + c] : 0); }
  const restPelvis: [number, number, number] = [restOff[3], restOff[4], restOff[5]];
  for (const def of CROWD_SET) {
    if (def.only && !def.only.includes(kind)) continue;
    const an = new Animator(lib, restPelvis, p);
    an.setRestJoints(restJoints);
    const dt = 1 / 60;
    let seconds = def.seconds ?? 2, fps = def.fps ?? 15, speed = 0;
    if (def.kind === 'move') {
      speed = def.speed!;
      if (def.overlay) void an.play(def.overlay, { loop: true, blendIn: 0.01 }).catch(() => {});
      for (let i = 0; i < 120; i++) { an.setLocomotion({ velocity: [0, 0, speed], grounded: true, heading: 0, mode: 'walk' }, dt); an.update(dt); }
      // one locomotion cycle at this speed (cadence model shared with Animator)
      const cps = cadence(speed, (restPelvis[1] / lib.restPelvisHeight) * p.stride);
      seconds = 1 / cps;
    } else {
      for (let i = 0; i < 30; i++) { an.setLocomotion({ velocity: [0, 0, 0], grounded: true, heading: 0, mode: 'walk' }, dt); an.update(dt); }
      if (def.action) void an.play(def.action, { loop: true, blendIn: 0.01 }).catch(() => {});
      for (let i = 0; i < 20; i++) an.update(dt);
    }
    const n = Math.max(2, Math.round(seconds * fps));
    const step = seconds / n;
    for (let f = 0; f < n; f++) {
      frames.push(skinFrame(an.pose.q, an.pose.pelvis, restOff, restJoints));
      const sub = Math.max(1, Math.round(step / dt));
      for (let k = 0; k < sub; k++) { an.setLocomotion({ velocity: [0, 0, speed], grounded: true, heading: 0, mode: 'walk' }, step / sub); an.update(step / sub); }
    }
    clips.push({ name: def.name, frames: n, fps: n / seconds, loop: true, speed, cycle: seconds });
  }
  const per = NB * 12;
  const data = new Float32Array(frames.length * per);
  frames.forEach((f, i) => data.set(f, i * per));
  return { data, clips, frames: frames.length };
}

export function cadence(v: number, legScale: number) {
  const wRun = smooth(2.0, 2.7, v);
  return Math.max(0.35, ((1 - wRun) * (0.55 + 0.27 * v) + wRun * (1.25 + 0.04 * v)) / Math.sqrt(legScale));
}
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Forward kinematics → per crowd joint 3×4 skin matrix rows (world × inverse bind). */
function skinFrame(q: Float32Array, pelvis: Float32Array, restOff: Float32Array, restJoints: Float32Array): Float32Array {
  // world rotation (quat) and position per joint
  const wq = new Float32Array(NUM_JOINTS * 4), wp = new Float32Array(NUM_JOINTS * 3);
  for (let j = 0; j < NUM_JOINTS; j++) {
    const par = JOINTS[j].parent;
    const lx = j === 1 ? pelvis[0] : restOff[j * 3], ly = j === 1 ? pelvis[1] : restOff[j * 3 + 1], lz = j === 1 ? pelvis[2] : restOff[j * 3 + 2];
    const qx = q[j * 4], qy = q[j * 4 + 1], qz = q[j * 4 + 2], qw = q[j * 4 + 3];
    if (par < 0) { wq.set([qx, qy, qz, qw], j * 4); wp.set([lx, ly, lz], j * 3); continue; }
    const px = wq[par * 4], py = wq[par * 4 + 1], pz = wq[par * 4 + 2], pw = wq[par * 4 + 3];
    // rotate the local offset by the parent's world rotation: v' = v + w·t + q×t, t = 2 q×v
    const tx = 2 * (py * lz - pz * ly), ty = 2 * (pz * lx - px * lz), tz = 2 * (px * ly - py * lx);
    wp[j * 3] = wp[par * 3] + lx + pw * tx + (py * tz - pz * ty);
    wp[j * 3 + 1] = wp[par * 3 + 1] + ly + pw * ty + (pz * tx - px * tz);
    wp[j * 3 + 2] = wp[par * 3 + 2] + lz + pw * tz + (px * ty - py * tx);
    wq[j * 4] = pw * qx + px * qw + py * qz - pz * qy;
    wq[j * 4 + 1] = pw * qy - px * qz + py * qw + pz * qx;
    wq[j * 4 + 2] = pw * qz + px * qy - py * qx + pz * qw;
    wq[j * 4 + 3] = pw * qw - px * qx - py * qy - pz * qz;
  }
  const out = new Float32Array(NB * 12);
  CROWD_JOINTS.forEach((j, i) => {
    const x = wq[j * 4], y = wq[j * 4 + 1], z = wq[j * 4 + 2], w = wq[j * 4 + 3];
    // rotation matrix rows
    const r = [
      [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ];
    // skin = [R | p] × [I | -rest]  →  translation = p - R·rest
    const rx = restJoints[j * 3], ry = restJoints[j * 3 + 1], rz = restJoints[j * 3 + 2];
    for (let k = 0; k < 3; k++) {
      const o = i * 12 + k * 4;
      out[o] = r[k][0]; out[o + 1] = r[k][1]; out[o + 2] = r[k][2];
      out[o + 3] = wp[j * 3 + k] - (r[k][0] * rx + r[k][1] * ry + r[k][2] * rz);
    }
  });
  return out;
}
