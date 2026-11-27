/**
 * Per-character pose computation (no three.js): locomotion blend space driven by the
 * controller's velocity and heading, stride-warped so feet match ground speed, plus layered
 * actions (full body / upper body), posture additives (heat slump, age stoop, breathing) and
 * lean into acceleration and turns. Root motion is never used: position belongs to the engine.
 */
import { JOINTS, JOINT_INDEX as JI, NUM_JOINTS } from '../rig';
import { AnimLibrary, Pose, clearAcc, normalizePose, type Clip } from './AnimLibrary';
import { MASKS, handShape } from './authored';

export type LocoMode = 'walk' | 'run' | 'sprint' | 'crouch';
export interface LocoInput { velocity: [number, number, number]; grounded: boolean; heading: number; mode: LocoMode }
export interface AnimEvent { type: 'footstep' | 'contact' | 'hail'; foot?: 'l' | 'r'; data?: any; speed?: number }
export interface Personality { stride: number; swing: number; bounce: number; slump: number; age: number; heat: number; formal: boolean; /** extra arm abduction (radians) so arms clear wide hips and heavy bodies */ girth?: number }

interface Action { clip: number; t: number; w: number; target: number; loop: boolean; layer: 'full' | 'upper'; resolve?: () => void; done?: boolean; speed: number; name: string }

/** Public action names → clips and layers. UAL clip names are accepted directly as well. */
export const ACTIONS: Record<string, { clip: string; layer: 'full' | 'upper'; loop?: boolean }> = {
  hail_cab: { clip: 'hail_cab', layer: 'upper' }, punch_light: { clip: 'Punch_Jab', layer: 'upper' }, punch_heavy: { clip: 'Punch_Cross', layer: 'upper' }, inspect: { clip: 'inspect', layer: 'full', loop: true }, shove: { clip: 'shove', layer: 'upper', loop: true }, exchange_details: { clip: 'exchange_details', layer: 'upper', loop: true }, play_cards: { clip: 'play_cards', layer: 'full', loop: true }, cooloff: { clip: 'cooloff', layer: 'full', loop: true }, slumped: { clip: 'slumped', layer: 'full', loop: true }, sweep: { clip: 'sweep', layer: 'full', loop: true }, drunk_sway: { clip: 'drunk_sway', layer: 'upper', loop: true }, check_watch: { clip: 'cs.m01.teddy_check_watch', layer: 'upper' }, wave: { clip: 'cs.m01.mayhew_wave', layer: 'upper' }, reload: { clip: 'Pistol_Reload', layer: 'upper' }, shoot: { clip: 'Pistol_Shoot', layer: 'upper' }, sit_stoop: { clip: 'sit_stoop', layer: 'full', loop: true }, climb_ledge: { clip: 'ClimbUp_1m', layer: 'full' }, roll: { clip: 'Roll', layer: 'full' },
  vault: { clip: 'vault', layer: 'full' }, vault_turnstile: { clip: 'vault', layer: 'full' }, climb: { clip: 'climb', layer: 'full' }, fence: { clip: 'fence', layer: 'full' },
  ladder: { clip: 'ladder', layer: 'full', loop: true }, ladder_pull: { clip: 'ladder_pull', layer: 'full' }, hang: { clip: 'hang', layer: 'full', loop: true },
  drop_land: { clip: 'drop_land', layer: 'full' }, drop_roll: { clip: 'Roll', layer: 'full' }, roof_jump: { clip: 'roof_jump', layer: 'full' },
  smoke: { clip: 'smoke', layer: 'upper', loop: true }, light_up: { clip: 'light_up', layer: 'upper' }, read_paper: { clip: 'read_paper', layer: 'upper', loop: true },
  lean_wall: { clip: 'lean_wall', layer: 'full', loop: true }, fan: { clip: 'fan_heat', layer: 'upper', loop: true }, argue: { clip: 'argue', layer: 'upper', loop: true },
  vendor: { clip: 'vendor_work', layer: 'upper', loop: true }, flinch: { clip: 'flinch', layer: 'full' }, cower: { clip: 'cower', layer: 'full', loop: true },
  rubberneck: { clip: 'rubberneck', layer: 'full', loop: true }, stumble: { clip: 'stumble', layer: 'full' }, jump: { clip: 'Jump_Start', layer: 'full' },
  land: { clip: 'Jump_Land', layer: 'full' }, hit: { clip: 'Hit_Chest', layer: 'full' }, hit_head: { clip: 'Hit_Head', layer: 'full' }, knockback: { clip: 'Hit_Knockback', layer: 'full' },
  die: { clip: 'Death01', layer: 'full' }, sit: { clip: 'Sitting_Idle_Loop', layer: 'full', loop: true }, sit_talk: { clip: 'Sitting_Talking_Loop', layer: 'full', loop: true },
  interact: { clip: 'Interact', layer: 'upper' }, pickup: { clip: 'PickUp_Table', layer: 'full' }, phone: { clip: 'Idle_TalkingPhone_Loop', layer: 'upper', loop: true },
  nod: { clip: 'Yes', layer: 'upper' }, shake_head: { clip: 'Idle_No_Loop', layer: 'upper' }, fold_arms: { clip: 'Idle_FoldArms_Loop', layer: 'upper', loop: true },
  drink: { clip: 'Consume', layer: 'upper' }, push_cart: { clip: 'Push_Loop', layer: 'full', loop: true }, carry: { clip: 'Walk_Carry_Loop', layer: 'upper', loop: true },
  drive: { clip: 'Driving_Loop', layer: 'full', loop: true }, kneel_fix: { clip: 'Fixing_Kneeling', layer: 'full', loop: true }, throw: { clip: 'OverhandThrow', layer: 'upper' },
  wave_off: { clip: 'wave_off', layer: 'upper', loop: true }, wave_off_bullhorn: { clip: 'wave_off_bullhorn', layer: 'upper', loop: true },
  // street vendors (sim triggers: docs/SIM_PROGRESS.md "Street vendors")
  vendor_serve: { clip: 'vendor_serve', layer: 'upper' }, vendor_call: { clip: 'vendor_call', layer: 'upper' }, vendor_shout: { clip: 'vendor_shout', layer: 'upper' },
  duck_cart: { clip: 'duck_cart', layer: 'full', loop: true }, right_cart: { clip: 'right_cart', layer: 'full' }, shine_shoes: { clip: 'shine_shoes', layer: 'full', loop: true },
  deal_cards: { clip: 'deal_cards', layer: 'full', loop: true }, queue: { clip: 'queue_wait', layer: 'full', loop: true }, pay: { clip: 'pay', layer: 'upper' },
  watch: { clip: 'watch_lean', layer: 'full', loop: true }, eat_walk: { clip: 'eat_walk', layer: 'upper', loop: true }, sip_walk: { clip: 'sip_walk', layer: 'upper', loop: true },
  fall_down: { clip: 'fall_down', layer: 'full' }, down: { clip: 'down_lie', layer: 'full', loop: true }, get_up: { clip: 'get_up', layer: 'full' }, angry: { clip: 'argue', layer: 'upper', loop: true },
  car_enter_l: { clip: 'car_enter_l', layer: 'full' }, car_exit_l: { clip: 'car_exit_l', layer: 'full' }, pulled_out: { clip: 'pulled_out', layer: 'full' },
  idle_pockets: { clip: 'idle_pockets', layer: 'full', loop: true }, idle_hands_behind: { clip: 'idle_hands_behind', layer: 'full', loop: true }, idle_heat: { clip: 'idle_heat', layer: 'full', loop: true },
};

/** Measured stance-foot travel per warped cycle vs. the clip's root travel (tools/characters/scratch/slide.ts). */
export let STRIDE_CAL = 0.87;
export function setStrideCal(v: number) { STRIDE_CAL = v; }
const MIRROR = JOINTS.map((j) => { const n = j.name; const m = n.endsWith('_l') ? n.slice(0, -2) + '_r' : n.endsWith('_r') ? n.slice(0, -2) + '_l' : n; return JI[m]; });
const FINGER_MASK = (() => { const m = new Uint8Array(NUM_JOINTS); JOINTS.forEach((j, i) => { if (/^(thumb|index|middle|ring|pinky)_/.test(j.name)) m[i] = 255; }); return m; })();
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Animator {
  readonly pose = new Pose();
  private tmp = new Pose(); private tmp2 = new Pose(); private neutral = new Pose();
  private lib: AnimLibrary;
  private c: Record<string, number> = {};
  private upperMask = new Uint8Array(NUM_JOINTS);
  /** weapon state, driven by Character: ready (drawn), aim, pitch (-1 down .. 1 up), long gun */
  readonly gun = { ready: false, aim: false, pitch: 0, long: false, readyW: 0, aimW: 0 };
  private gunBuf = new Pose();
  /** the pistol clips' upper body without the lower spine (their spine leans the torso far back) */
  private gunMask = new Uint8Array(NUM_JOINTS);
  /** Rest pelvis offset from the root (character metres). */
  private restPelvis: [number, number, number];
  private pelvisScale: number;
  private p: Personality;
  // locomotion state
  private speed = 0; private vx = 0; private vz = 0; private phase = 0; private strafePhase = 0; private turnPhase = 0;
  private heading = 0; private turnRate = 0; private accel = 0; private lateralAcc = 0; private grounded = true; private mode: LocoMode = 'walk';
  private idleClip: number; private time = 0; private airTime = 0;
  private actions: Action[] = [];
  private events: AnimEvent[] = [];
  private lastPhase = 0;
  private cadenceBoost = 1;
  /** Hand shapes held over every clip (props gripped, otherwise relaxed); see setHands(). */
  private hands: Record<'l' | 'r', 'relaxed' | 'grip' | 'pinch'> = { l: 'relaxed', r: 'relaxed' };
  private handPose = new Pose();
  setHands(l: 'relaxed' | 'grip' | 'pinch', r: 'relaxed' | 'grip' | 'pinch') { this.hands = { l, r }; this.buildHandPose(); }
  /** Rest joint positions (character space) for anatomically correct finger curl axes. */
  restJoints: Float32Array | null = null;
  private buildHandPose() {
    const p = this.handPose; p.identity();
    const RJ = this.restJoints;
    const D = Math.PI / 180;
    const put = (j: number, ax: number[], deg: number) => {
      const a = (deg * D) / 2, s2 = Math.sin(a);
      p.q.set([ax[0] * s2, ax[1] * s2, ax[2] * s2, Math.cos(a)], j * 4);
    };
    for (const side of ['l', 'r'] as const) {
      const shape = handShape(side, this.hands[side]);
      if (!RJ) continue;
      const jp = (n: string) => { const j = JI[n]; return [RJ[j * 3], RJ[j * 3 + 1], RJ[j * 3 + 2]]; };
      const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      const nrm = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
      const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const knuckles = nrm(sub(jp(`index_01_${side}`), jp(`pinky_01_${side}`)));
      const along = nrm(sub(jp(`middle_01_${side}`), jp(`hand_${side}`)));
      // palm faces the thigh at rest (medial): pick the knuckle-axis sign that curls the tips that way
      let palm = nrm(cross(along, knuckles));
      const medial = side === 'l' ? -1 : 1;
      if (palm[0] * medial < 0) palm = palm.map((x) => -x);
      // rotating `along` about +knuckles by +θ moves it along cross(knuckles, along)
      const dirOfPositive = cross(knuckles, along);
      const sign = dirOfPositive[0] * palm[0] + dirOfPositive[1] * palm[1] + dirOfPositive[2] * palm[2] > 0 ? 1 : -1;
      for (const f of ['index', 'middle', 'ring', 'pinky']) for (const k of [1, 2, 3]) {
        const n = `${f}_0${k}_${side}`; const e = shape[n]; if (!e) continue;
        put(JI[n], knuckles, sign * Math.abs(e[2]));
      }
      // thumb: curls across the palm about the finger direction axis
      for (const k of [1, 2, 3]) { const n = `thumb_0${k}_${side}`; const e = shape[n]; if (!e) continue; put(JI[n], along, (side === 'l' ? 1 : -1) * (Math.abs(e[1]) + Math.abs(e[2]))); }
    }
  }
  /** Lean (radians) applied by the procedural layer, exposed for IK/debug. */
  lean = { pitch: 0, roll: 0 };
  /** 0..1: drunk (Character.setDrunk): a slow lateral roll and stagger on top of the lean */
  drunk = 0;
  /** Stair gait (-1 down .. +1 up, set by the character from step cadence): higher knee lift on the swing leg, a forward lean going up. */
  stair = 0;
  /** Contact state per foot (true = planted) for foot locking. */
  readonly planted = { l: true, r: true };

  constructor(lib: AnimLibrary, restPelvis: [number, number, number], p: Personality) {
    this.lib = lib; this.p = p; this.restPelvis = restPelvis;
    this.pelvisScale = restPelvis[1] / lib.restPelvisHeight;

    for (const n of ['Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Fwd_Loop', 'Crouch_Idle_Loop', 'Jump_Loop', 'idle_relaxed', 'idle_heat', 'idle_pockets', 'idle_hands_behind', 'strafe_l', 'turn_step']) this.c[n] = lib.get(n);
    for (const n of ['Pistol_Idle_Loop', 'Pistol_Aim_Neutral', 'Pistol_Aim_Up', 'Pistol_Aim_Down']) this.c[n] = lib.byName.get(n) ?? -1;
    for (const n of MASKS.upper) this.upperMask[JI[n]] = 255;
    for (const n of MASKS.upper) if (n !== 'spine_01' && n !== 'spine_02') this.gunMask[JI[n]] = 255;
    this.idleClip = p.heat > 0.7 && p.age > 30 ? this.c.idle_heat : this.c.idle_relaxed;
    clearAcc(this.neutral); this.lib.accumulate(this.c.idle_relaxed, 0, 1, this.neutral); normalizePose(this.neutral);
    this.time = Math.random() * 10;
    this.buildHandPose();
  }
  setRestJoints(j: Float32Array) { this.restJoints = j; this.buildHandPose(); }

  idleName = '';
  setIdle(name: string) { const i = this.lib.byName.get(name); if (i !== undefined) { this.idleClip = i; this.idleName = name; } }

  setLocomotion(s: LocoInput, dt: number) {
    const ch = Math.cos(s.heading), sh = Math.sin(s.heading);
    // world → character (character faces +Z rotated by heading about +Y)
    const lx = s.velocity[0] * ch - s.velocity[2] * sh, lz = s.velocity[0] * sh + s.velocity[2] * ch;
    const k = 1 - Math.exp(-dt * 10);
    const prevSpeed = this.speed, prevVx = this.vx;
    this.vx += (lx - this.vx) * k; this.vz += (lz - this.vz) * k;
    this.speed = Math.hypot(this.vx, this.vz);
    let dh = s.heading - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.turnRate += ((dt > 0 ? dh / dt : 0) - this.turnRate) * k;
    this.heading = s.heading;
    this.accel += ((dt > 0 ? (this.speed - prevSpeed) / dt : 0) - this.accel) * k;
    this.lateralAcc += ((this.turnRate * this.speed) + (dt > 0 ? (this.vx - prevVx) / dt : 0) * 0.3 - this.lateralAcc) * k;
    this.grounded = s.grounded; this.mode = s.mode;
  }

  play(name: string, opts: { loop?: boolean; blendIn?: number; speed?: number } = {}): Promise<void> {
    const emo = name.startsWith('talk:') ? (this.lib.byName.has(name) ? name : 'talk:neutral') : null;
    const def = emo ? { clip: emo, layer: 'upper' as const, loop: true } : ACTIONS[name] ?? (this.lib.byName.has(name) ? { clip: name, layer: 'full' as const, loop: /_Loop$/.test(name) } : null);
    if (!def) return Promise.reject(new Error(`characters: unknown action ${name}`));
    // replace any action on the same layer
    for (const a of this.actions) if (a.layer === def.layer) { a.target = 0; a.done = true; a.resolve?.(); a.resolve = undefined; }
    return new Promise<void>((resolve) => {
      const a: Action = { name, clip: this.lib.get(def.clip), t: 0, w: 0, target: 1, loop: opts.loop ?? def.loop ?? false, layer: def.layer, resolve, speed: opts.speed ?? 1 };
      (a as any).blendIn = opts.blendIn ?? 0.25;
      this.actions.push(a);
      if (a.loop) { /* looping actions resolve when replaced or stopped */ }
    });
  }
  stop(layer?: 'full' | 'upper') { for (const a of this.actions) if (!layer || a.layer === layer) { a.target = 0; a.done = true; a.resolve?.(); a.resolve = undefined; } }
  get busy() { return this.actions.some((a) => a.target > 0 && a.layer === 'full'); }

  drainEvents(): AnimEvent[] { const e = this.events; this.events = []; return e; }

  update(dt: number) {
    this.time += dt;
    const lib = this.lib, out = this.pose;
    const v = this.speed;
    const fwd = this.vz, side = this.vx;
    const fwdAbs = Math.abs(fwd);
    // --- gait weights ---------------------------------------------------------------------------
    const crouch = this.mode === 'crouch';
    const moveW = sm(0.06, 0.35, v);
    const wRun = sm(2.0, 2.7, fwdAbs), wSprint = sm(5.0, 6.0, fwdAbs);
    const wWalk = 1 - wRun;
    const wJog = wRun * (1 - wSprint);
    // cadence (cycles/s) from human gait data: walking ≈ 0.55 + 0.27 v, running ≈ 1.25 + 0.04 v
    const cps = Math.max(0.35, (wWalk * (0.55 + 0.27 * fwdAbs) + wRun * (1.25 + 0.04 * fwdAbs)) * (crouch ? 0.8 : 1) / Math.sqrt(this.pelvisScale) / this.p.stride);
    const dir = fwd >= -0.05 ? 1 : -1;
    this.phase = (this.phase + dt * cps * this.cadenceBoost * dir + 10) % 1;
    // stride warp: amplitude so that stride (m per cycle) = v / cps, on this body's legs
    const strideOf = (ci: number) => lib.clips[ci].info.speed * lib.clips[ci].info.duration * this.pelvisScale * STRIDE_CAL;
    const formal = this.p.formal;
    const walkClip = formal ? this.c.Walk_Formal_Loop : this.c.Walk_Loop;
    const clipStride = crouch ? strideOf(this.c.Crouch_Fwd_Loop) : wWalk * strideOf(walkClip) + wJog * strideOf(this.c.Jog_Fwd_Loop) + wSprint * strideOf(this.c.Sprint_Loop);
    let kStride = (fwdAbs / cps) / Math.max(0.2, clipStride);
    // past the comfortable amplitude, people take faster steps rather than longer ones
    if (kStride > 1.3) { this.cadenceBoost = kStride / 1.3; kStride = 1.3; } else this.cadenceBoost = 1;
    kStride = Math.max(0.25, kStride);

    // --- base: idle ⊕ moving --------------------------------------------------------------------
    clearAcc(out);
    const idleW = 1 - moveW;
    if (idleW > 0) {
      const turning = Math.abs(this.turnRate) > 0.6 && v < 0.3;
      if (turning) {
        const prev = this.turnPhase % 1;
        this.turnPhase += dt * Math.min(2.2, Math.abs(this.turnRate) * 0.9);
        addWeighted(out, this.sampleAbs(this.c.turn_step, (this.turnPhase % 1) * lib.clips[this.c.turn_step].info.duration), idleW);
        this.stepEvents(this.c.turn_step, prev, this.turnPhase % 1, 0.2);
      } else addWeighted(out, this.sampleAbs(crouch ? this.c.Crouch_Idle_Loop : this.idleClip, this.time), idleW);
    }
    if (moveW > 0) {
      clearAcc(this.tmp);
      const fw = Math.abs(fwd) / Math.max(1e-3, Math.abs(fwd) + Math.abs(side));
      if (crouch) lib.accumulate(this.c.Crouch_Fwd_Loop, this.phase * lib.clips[this.c.Crouch_Fwd_Loop].info.duration, 1, this.tmp);
      else {
        if (wWalk > 0) lib.accumulate(walkClip, this.phase * lib.clips[walkClip].info.duration, wWalk, this.tmp);
        if (wJog > 0) lib.accumulate(this.c.Jog_Fwd_Loop, this.phase * lib.clips[this.c.Jog_Fwd_Loop].info.duration, wJog, this.tmp);
        if (wSprint > 0) lib.accumulate(this.c.Sprint_Loop, this.phase * lib.clips[this.c.Sprint_Loop].info.duration, wSprint, this.tmp);
      }
      normalizePose(this.tmp);
      this.absPelvis(this.tmp, walkClip);
      this.warp(this.tmp, kStride);
      // strafe component
      if (fw < 0.98) {
        clearAcc(this.tmp2);
        this.strafePhase = (this.strafePhase + dt * Math.max(0.6, Math.abs(side) / 0.9) + 10) % 1;
        lib.accumulate(this.c.strafe_l, this.strafePhase, 1, this.tmp2);
        normalizePose(this.tmp2);
        for (let k = 0; k < 3; k++) this.tmp2.pelvis[k] += this.restPelvis[k];
        if (side < 0) mirror(this.tmp2);
        blendInto(this.tmp, this.tmp2, 1 - fw);
      }
      addWeighted(out, this.tmp, moveW);
    }
    normalizePose(out);
    // footsteps from the locomotion phase
    if (moveW > 0.3 && this.grounded) {
      const ci = crouch ? this.c.Crouch_Fwd_Loop : wWalk >= 0.5 ? walkClip : wSprint > 0.5 ? this.c.Sprint_Loop : this.c.Jog_Fwd_Loop;
      this.stepEvents(ci, this.lastPhase, this.phase, v);
      const cc = lib.clips[ci].info.contacts;
      const inC = (iv: [number, number][]) => iv.some(([a, b]) => this.phase >= a && this.phase <= b);
      this.planted.l = inC(cc.l); this.planted.r = inC(cc.r);
    } else { this.planted.l = this.planted.r = true; }
    this.lastPhase = this.phase;
    // airborne
    if (!this.grounded) { this.airTime += dt; blendInto(out, this.sampleAbs(this.c.Jump_Loop, this.airTime), sm(0, 0.15, this.airTime)); this.planted.l = this.planted.r = false; }
    else this.airTime = 0;

    // --- actions --------------------------------------------------------------------------------
    for (const a of this.actions) {
      const clip = lib.clips[a.clip];
      const blendIn = (a as any).blendIn ?? 0.25;
      a.w += (a.target - a.w) * Math.min(1, dt / Math.max(0.05, blendIn) * 2.5);
      const prevT = a.t;
      a.t += dt * a.speed;
      if (!a.loop && a.t >= clip.info.duration - 0.2 && a.target > 0) { a.target = 0; }
      if (!a.loop && a.t >= clip.info.duration && !a.done) { a.done = true; a.resolve?.(); a.resolve = undefined; }
      for (const e of clip.info.events ?? []) {
        const tt = a.loop ? a.t % clip.info.duration : a.t, pt = a.loop ? prevT % clip.info.duration : prevT;
        if (pt <= e.t && tt > e.t) this.events.push({ type: e.type as AnimEvent['type'], data: e.data, foot: e.data?.foot });
      }
      const p = this.sampleAbs(a.clip, a.t);
      blendInto(out, p, a.w, a.layer === 'upper' ? (clip.mask ?? this.upperMask) : null);
    }
    this.actions = this.actions.filter((a) => !(a.done && a.w < 0.01));

    // --- weapon (Character.setWeapon / setAim): handguns hold the pistol idle as low-ready and the
    // three pistol aim clips blended by pitch when aiming; long guns are posed by Character (IK), so
    // only the arms' base comes from here. Upper body only; legs keep walking.
    const gn = this.gun;
    gn.readyW += ((gn.ready ? 1 : 0) - gn.readyW) * Math.min(1, dt * 10);
    gn.aimW += ((gn.aim ? 1 : 0) - gn.aimW) * Math.min(1, dt * 14);
    if (this.c.Pistol_Idle_Loop >= 0 && gn.readyW > 0.01 && !gn.long) {
      blendInto(out, this.sampleAbs(this.c.Pistol_Idle_Loop, this.time), gn.readyW * (1 - gn.aimW), this.gunMask);
    }
    if (this.c.Pistol_Aim_Neutral >= 0 && gn.aimW > 0.01) {
      const p = this.gunBuf, pt = Math.max(-1, Math.min(1, gn.pitch));
      clearAcc(p);
      const other = pt < 0 ? this.c.Pistol_Aim_Down : this.c.Pistol_Aim_Up, wo = Math.abs(pt);
      lib.accumulate(this.c.Pistol_Aim_Neutral, 0.2, 1 - wo, p);
      if (wo > 0.001) lib.accumulate(other, 0.2, wo, p);
      normalizePose(p);
      blendInto(out, p, gn.aimW, this.gunMask);
    }

    // --- hands: the stock clips clench fists; hold relaxed or gripping hands instead, except
    // where an action shapes the hand itself (hailing, waving off, arguing, talking)
    const handFree = this.actions.some((a) => a.w > 0.05 && /hail|wave|argue|talk|throw|punch/i.test(a.name));
    const hw = handFree ? 0 : 0.9;
    if (hw > 0) blendInto(out, this.handPose, hw, FINGER_MASK);

    // --- posture additives ----------------------------------------------------------------------
    const breathe = Math.sin(this.time * 1.7) * 0.012;
    const slump = this.p.slump * 0.12 + this.p.heat * 0.05;
    // lean: forward into acceleration and speed, sideways into turns
    const targetPitch = Math.max(-0.15, Math.min(0.2, this.accel * 0.035 + Math.min(fwdAbs, 7) * 0.006 * dir));
    const targetRoll = Math.max(-0.25, Math.min(0.25, -this.lateralAcc * 0.03));
    this.lean.pitch += (targetPitch - this.lean.pitch) * Math.min(1, dt * 6);
    this.lean.roll += (targetRoll - this.lean.roll) * Math.min(1, dt * 6);
    const dr = this.drunk ? this.drunk * (Math.sin(this.time * 2.1) * 0.14 + Math.sin(this.time * 0.73) * 0.08) : 0;
    rotLocal(out, JI.spine_01, this.lean.pitch * 0.5 + slump * 0.3 + this.drunk * 0.06, 0, this.lean.roll * 0.5 + dr);
    rotLocal(out, JI.spine_02, this.lean.pitch * 0.3 + slump * 0.3, 0, this.lean.roll * 0.3);
    rotLocal(out, JI.spine_03, breathe + slump * 0.3, 0, 0);
    rotLocal(out, JI.neck_01, slump * 0.4 - this.lean.pitch * 0.4, 0, -this.lean.roll * 0.3);
    rotLocal(out, JI.clavicle_l, breathe * 0.5, 0, -slump * 0.1); rotLocal(out, JI.clavicle_r, breathe * 0.5, 0, slump * 0.1);
    // stair gait: the swing leg lifts higher (more going up), the torso leans into the climb
    if (this.stair !== 0 && this.grounded && moveW > 0.3) {
      const up = Math.max(0, this.stair), down = Math.max(0, -this.stair);
      for (const side of ['l', 'r'] as const) {
        if (this.planted[side]) continue;
        rotLocal(out, side === 'l' ? JI.thigh_l : JI.thigh_r, -(0.38 * up + 0.14 * down), 0, 0);
        rotLocal(out, side === 'l' ? JI.calf_l : JI.calf_r, 0.55 * up + 0.22 * down, 0, 0);
      }
      rotLocal(out, JI.spine_01, 0.07 * up - 0.03 * down, 0, 0);
    }
    const g = this.p.girth ?? 0;
    if (g) { rotLocal(out, JI.upperarm_l, 0, 0, g); rotLocal(out, JI.upperarm_r, 0, 0, -g); }
  }

  /** UAL clips: pelvis absolute (scaled to this body); authored: relative to rest. */
  private sampleAbs(ci: number, t: number): Pose {
    const p = this.tmp2;
    clearAcc(p); this.lib.accumulate(ci, t, 1, p); normalizePose(p);
    this.absPelvis(p, ci);
    return p;
  }
  private absPelvis(p: Pose, ci: number) {
    const c: Clip = this.lib.clips[ci];
    if (c.pelvisRelative) for (let k = 0; k < 3; k++) p.pelvis[k] += this.restPelvis[k];
    else { p.pelvis[0] *= this.pelvisScale; p.pelvis[1] *= this.pelvisScale; p.pelvis[2] = p.pelvis[2] * this.pelvisScale + this.restPelvis[2]; }
  }
  /** Scale the leg/arm swing (and pelvis bob) about the neutral stance by k (stride warp). */
  private warp(p: Pose, k: number) {
    const n = this.neutral;
    const legs = [JI.thigh_l, JI.thigh_r, JI.calf_l, JI.calf_r, JI.foot_l, JI.foot_r, JI.ball_l, JI.ball_r];
    const arms = [JI.upperarm_l, JI.upperarm_r, JI.lowerarm_l, JI.lowerarm_r];
    for (const j of legs) extrapolate(n.q, p.q, j, k);
    const ks = Math.min(1.3, 0.4 + 0.6 * k) * this.p.swing;
    for (const j of arms) extrapolate(n.q, p.q, j, ks);
    // pelvis bob: smaller strides bob less
    const restY = this.restPelvis[1];
    p.pelvis[1] = restY + (p.pelvis[1] - restY) * Math.min(1.2, k) * this.p.bounce;
  }
  private stepEvents(ci: number, from: number, to: number, speed: number) {
    const cc = this.lib.clips[ci].info.contacts;
    for (const foot of ['l', 'r'] as const) for (const [a] of cc[foot]) {
      const crossed = from <= to ? from < a && to >= a : from < a || to >= a;
      if (crossed && a > 0.001) this.events.push({ type: 'footstep', foot, speed });
    }
  }
}

// ---- pose helpers ------------------------------------------------------------------------------
function addWeighted(acc: Pose, p: Pose, w: number) {
  for (let j = 0; j < NUM_JOINTS; j++) {
    const o = j * 4;
    let x = p.q[o], y = p.q[o + 1], z = p.q[o + 2], ww = p.q[o + 3];
    if (acc.q[o] * x + acc.q[o + 1] * y + acc.q[o + 2] * z + acc.q[o + 3] * ww < 0) { x = -x; y = -y; z = -z; ww = -ww; }
    acc.q[o] += x * w; acc.q[o + 1] += y * w; acc.q[o + 2] += z * w; acc.q[o + 3] += ww * w;
  }
  for (let k = 0; k < 3; k++) acc.pelvis[k] += p.pelvis[k] * w;
}
/** out = nlerp(out, p, w) per joint (mask optional, 0..255). */
function blendInto(out: Pose, p: Pose, w: number, mask: Uint8Array | null = null) {
  if (w <= 0) return;
  for (let j = 0; j < NUM_JOINTS; j++) {
    const ww = mask ? w * (mask[j] / 255) : w;
    if (ww <= 0) continue;
    const o = j * 4;
    let x = p.q[o], y = p.q[o + 1], z = p.q[o + 2], qw = p.q[o + 3];
    if (out.q[o] * x + out.q[o + 1] * y + out.q[o + 2] * z + out.q[o + 3] * qw < 0) { x = -x; y = -y; z = -z; qw = -qw; }
    const a = out.q[o] + (x - out.q[o]) * ww, b = out.q[o + 1] + (y - out.q[o + 1]) * ww, c = out.q[o + 2] + (z - out.q[o + 2]) * ww, d = out.q[o + 3] + (qw - out.q[o + 3]) * ww;
    const l = Math.hypot(a, b, c, d) || 1;
    out.q[o] = a / l; out.q[o + 1] = b / l; out.q[o + 2] = c / l; out.q[o + 3] = d / l;
  }
  if (!mask) for (let k = 0; k < 3; k++) out.pelvis[k] += (p.pelvis[k] - out.pelvis[k]) * w;
}
function extrapolate(n: Float32Array, q: Float32Array, j: number, k: number) {
  const o = j * 4;
  let ax = n[o], ay = n[o + 1], az = n[o + 2], aw = n[o + 3];
  if (ax * q[o] + ay * q[o + 1] + az * q[o + 2] + aw * q[o + 3] < 0) { ax = -ax; ay = -ay; az = -az; aw = -aw; }
  const x = ax + (q[o] - ax) * k, y = ay + (q[o + 1] - ay) * k, z = az + (q[o + 2] - az) * k, w = aw + (q[o + 3] - aw) * k;
  const l = Math.hypot(x, y, z, w) || 1;
  q[o] = x / l; q[o + 1] = y / l; q[o + 2] = z / l; q[o + 3] = w / l;
}
/** Mirror a pose left↔right (swap sides, reflect across the YZ plane). */
export function mirror(p: Pose) {
  const q = Float32Array.from(p.q);
  for (let j = 0; j < NUM_JOINTS; j++) {
    const m = MIRROR[j];
    p.q[j * 4] = q[m * 4]; p.q[j * 4 + 1] = -q[m * 4 + 1]; p.q[j * 4 + 2] = -q[m * 4 + 2]; p.q[j * 4 + 3] = q[m * 4 + 3];
  }
  p.pelvis[0] = -p.pelvis[0];
}
/** Pre-multiply a small parent-frame rotation (radians, XYZ) onto a joint. */
export function rotLocal(p: Pose, j: number, x: number, y: number, z: number) {
  if (!x && !y && !z) return;
  const c1 = Math.cos(x / 2), s1 = Math.sin(x / 2), c2 = Math.cos(y / 2), s2 = Math.sin(y / 2), c3 = Math.cos(z / 2), s3 = Math.sin(z / 2);
  const rx = s1 * c2 * c3 + c1 * s2 * s3, ry = c1 * s2 * c3 - s1 * c2 * s3, rz = c1 * c2 * s3 + s1 * s2 * c3, rw = c1 * c2 * c3 - s1 * s2 * s3;
  const o = j * 4, qx = p.q[o], qy = p.q[o + 1], qz = p.q[o + 2], qw = p.q[o + 3];
  p.q[o] = rw * qx + rx * qw + ry * qz - rz * qy;
  p.q[o + 1] = rw * qy - rx * qz + ry * qw + rz * qx;
  p.q[o + 2] = rw * qz + rx * qy - ry * qx + rz * qw;
  p.q[o + 3] = rw * qw - rx * qx - ry * qy - rz * qz;
}
