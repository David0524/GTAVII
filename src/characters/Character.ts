/**
 * One animated person: meshes (≤ 2 draws), skeleton, animator and procedural layers
 * (foot IK with locking on curbs/stairs/slopes, look-at, hand IK, seat pose).
 * Position is owned by the engine (Rapier controller): set `object.position` each frame and
 * call setLocomotion() with the controller's velocity; the character turns to `heading`.
 */
import * as THREE from 'three/webgpu';
import type { BodyModel } from './body/BodyModel';
import { generateAppearance, type Appearance } from './body/appearance';
import { buildSkeleton } from './body/skeleton';
import { generateOutfit, type Outfit, type OutfitContext } from './wardrobe/outfit';
import { fitHead, headMesh, neckProfile, neckSampler, type HeadAsset, type NeckData } from './heads/rocketbox';
import { assemble, type Assembled } from './build/assemble';
import { createSkinnedMeshes } from './render/meshes';
import { Animator, type LocoInput } from './anim/Animator';
import type { AnimLibrary } from './anim/AnimLibrary';
import { twoBoneIK, lookAt as ikLookAt, alignToNormal, worldPos } from './anim/IK';
import { JOINT_INDEX as JI } from './rig';

export interface CharacterDesc { seed: number; archetype?: string; hero?: string; act?: number; overrides?: Record<string, unknown> }
export type GroundFn = (x: number, z: number) => { y: number; surface?: string } | null;
export interface FootstepEvent { type: 'footstep'; foot: 'l' | 'r'; position: THREE.Vector3; surface: string; speed: number; character: Character }
export interface ContactEvent { type: 'contact'; hand?: string; what?: string; position: THREE.Vector3; character: Character }

export interface CharacterBuild {
  appearance: Appearance;
  outfit: Outfit;
  wardrobeSets?: Record<string, (seed: number) => Outfit>;
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _n = new THREE.Vector3(), _m4 = new THREE.Matrix4();

export class Character {
  readonly object = new THREE.Group();
  readonly desc: CharacterDesc;
  appearance: Appearance;
  outfit: Outfit;
  readonly lod: number;
  private model: BodyModel;
  private lib: AnimLibrary;
  private asm!: Assembled;
  private bones!: THREE.Bone[];
  private skeleton!: THREE.Skeleton;
  private meshes: THREE.SkinnedMesh[] = [];
  private restPelvis!: [number, number, number];
  animator!: Animator;
  private loco: LocoInput = { velocity: [0, 0, 0], grounded: true, heading: 0, mode: 'walk' };
  private yaw = 0;
  private lookTarget: THREE.Vector3 | null = null;
  private lookBlend = 0;
  private handTargets: Record<'l' | 'r', THREE.Vector3 | null> = { l: null, r: null };
  private seat: THREE.Matrix4 | null = null;
  private listeners: Record<string, ((e: any) => void)[]> = {};
  private ground: GroundFn | null = null;
  private footLock: Record<'l' | 'r', { pos: THREE.Vector3; w: number; was: boolean }> = { l: { pos: new THREE.Vector3(), w: 0, was: false }, r: { pos: new THREE.Vector3(), w: 0, was: false } };
  private pelvisDrop = 0;
  private wardrobeSets: CharacterBuild['wardrobeSets'];
  private outfitCtx?: Partial<OutfitContext>;
  /** CPU time of the last update (ms), for budgets. */
  lastUpdateMs = 0;
  private rbFit: ReturnType<typeof fitHead> | null = null;
  private rbNeck: ReturnType<typeof neckProfile> | null = null;
  private prebuiltHead: { joints: Float32Array; neck: NeckData } | null = null;
  readonly stats = { tris: 0, hairTris: 0, draws: 0, buildMs: 0 };

  constructor(model: BodyModel, lib: AnimLibrary, desc: CharacterDesc, opts: { lod: number; build?: CharacterBuild; outfitCtx?: Partial<OutfitContext>; heat?: number; prebuilt?: Assembled; appearance?: Appearance; outfit?: Outfit; prebuiltHead?: { joints: Float32Array; neck: NeckData } }) {
    this.model = model; this.lib = lib; this.desc = desc; this.lod = opts.lod;
    void this.lib;
    this.appearance = (opts.build?.appearance ?? (opts as { appearance?: Appearance }).appearance) ?? generateAppearance(desc.seed);
    this.outfit = (opts.build?.outfit ?? (opts as { outfit?: Outfit }).outfit) ?? generateOutfit(desc.seed ^ 0x5bd1e995, { sex: this.appearance.sex, age: this.appearance.age, archetype: desc.archetype, ...opts.outfitCtx });
    // evaluation: a substituted Rocketbox head sets the body's skin tone to match its texture
    const toneOv = desc.overrides?.skinTone as string | undefined;
    if (toneOv) { const t = toneOv; const l = ['1', '3', '5'].map((i) => parseInt(t.slice(+i, +i + 2), 16) / 255); const lum = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; this.appearance = { ...this.appearance, skin: { ...this.appearance.skin, tone: t, melanin: Math.min(1, Math.max(0, 1 - lum * 1.6)) } }; }
    // desc.overrides.hair / facialHair: appearance overrides (tests, cast tweaks)
    if (desc.overrides?.hair) this.appearance = { ...this.appearance, hair: { ...this.appearance.hair, ...(desc.overrides.hair as object) } };
    if (desc.overrides?.facialHair) this.appearance = { ...this.appearance, facialHair: desc.overrides.facialHair as Appearance['facialHair'] };
    // desc.overrides: shallow per-slot outfit overrides, e.g. { shoes: { kind: 'pump' } } (tests, cutscenes)
    if (desc.overrides) for (const [k, v] of Object.entries(desc.overrides)) if (k in this.outfit && k !== 'hair' && k !== 'rbHead' && k !== 'skinTone' && k !== 'headTint' && k !== 'ourHair') {
      const cur = (this.outfit as unknown as Record<string, unknown>)[k];
      (this.outfit as unknown as Record<string, unknown>)[k] = v && typeof v === 'object' && cur && typeof cur === 'object' ? { ...cur, ...v } : v;
    }
    this.outfitCtx = opts.outfitCtx;
    this.wardrobeSets = opts.build?.wardrobeSets;
    this.object.name = `character:${desc.hero ?? desc.archetype ?? 'ped'}:${desc.seed}`;
    this.prebuiltHead = opts.prebuiltHead ?? null;
    this.build(opts.prebuilt);
    const formal = !!this.outfit.outer && (this.outfit.outer.kind === 'suitJacket' || this.outfit.outer.kind === 'sportCoat') || !!this.outfit.tie;
    this.animator = new Animator(lib, this.restPelvis, { stride: this.appearance.gait.stride, swing: this.appearance.gait.swing, bounce: this.appearance.gait.bounce, slump: this.appearance.slump, age: this.appearance.age, heat: opts.heat ?? 0.6, formal, girth: armGirth(this.appearance) });
    // idle_pockets / idle_hands_behind need a hand-placement pass before they're used by default
    this.animator.setRestJoints(this.asm.joints);
    this.applyHands();
  }

  private build(prebuilt?: Assembled) {
    const t0 = performance.now();
    if (prebuilt) {
      this.asm = prebuilt;
      const rb = this.desc.overrides?.rbHead as HeadAsset | undefined;
      if (rb && this.prebuiltHead) { this.rbFit = fitHead(rb, this.prebuiltHead.joints); this.rbNeck = neckSampler(this.prebuiltHead.neck); }
    }
    else {
      const shape = this.model.evaluate({ ...this.appearance.body, stature: this.appearance.stature });
      const rb = this.desc.overrides?.rbHead as HeadAsset | undefined;
      this.rbFit = rb ? fitHead(rb, shape.joints) : null;
      this.rbNeck = this.rbFit ? neckProfile(shape.pos, shape.joints, this.rbFit.neckBottom - 0.012, this.rbFit.neckBottom + 0.03) : null;
      this.asm = assemble(this.model, shape, this.appearance, this.outfit, this.lod, false, this.rbFit ? { headCutY: this.rbFit.cutY, keepHair: !!this.desc.overrides?.ourHair } : {});
    }
    for (const m of this.meshes) { m.geometry.dispose(); m.removeFromParent(); }
    const { bones, skeleton, root } = buildSkeleton(this.asm.joints);
    this.bones = bones; this.skeleton = skeleton;
    const { main, hair } = createSkinnedMeshes(this.asm.main, this.asm.hair, skeleton, root);
    this.meshes = hair ? [main, hair] : [main];
    const rb = this.desc.overrides?.rbHead as HeadAsset | undefined;
    if (rb && this.rbFit) this.meshes.push(headMesh(rb, this.rbFit, skeleton, main.bindMatrix, { lift: this.asm.lift, tint: this.desc.overrides?.headTint as [number, number, number] | undefined, neck: this.rbNeck ?? undefined, bodyTone: this.appearance.skin.tone, noCards: !!this.desc.overrides?.ourHair }));
    for (const m of this.meshes) this.object.add(m);
    const p = bones[JI.pelvis].position;
    this.restPelvis = [p.x, p.y, p.z];
    this.stats.tris = this.asm.stats.tris + this.asm.stats.hairTris;
    this.stats.hairTris = this.asm.stats.hairTris;
    this.stats.draws = this.meshes.reduce((n, m) => n + (Array.isArray(m.material) ? m.material.length : 1), 0);
    if (rb) this.stats.tris += rb.idx.length / 3;
    this.stats.buildMs = performance.now() - t0;
  }

  /** Hands follow the props: handles are gripped, a cigarette is pinched, otherwise relaxed. */
  private applyHands() {
    const p = this.outfit.props;
    const l = p.some((x) => x === 'handbag' || x === 'tote') ? 'grip' : 'relaxed';
    const r = p.includes('cigarette') ? 'pinch' : p.some((x) => ['briefcase', 'shoppingBag', 'paperBag', 'umbrella'].includes(x)) ? 'grip' : 'relaxed';
    this.animator?.setHands(l, r);
  }

  /** Engine controller input. heading: yaw about +Y (radians); the rest pose faces +Z. */
  setLocomotion(s: LocoInput) { this.loco = s; }
  play(action: string, opts?: { loop?: boolean; blendIn?: number }): Promise<void> { return this.animator.play(action, opts); }
  stop() { this.animator.stop(); }
  lookAt(target: THREE.Vector3 | null) { this.lookTarget = target ? target.clone() : null; }
  setHandTarget(side: 'l' | 'r', target: THREE.Vector3 | null) { this.handTargets[side] = target ? target.clone() : null; }
  /** Vehicle seat pose (vehicles' seatPose, world matrix). null = stand up. */
  setSeat(pose: THREE.Matrix4 | null) {
    this.seat = pose ? pose.clone() : null;
    if (pose) void this.play('drive', { loop: true }); else this.animator.stop('full');
  }
  setGround(fn: GroundFn | null) { this.ground = fn; }
  setWardrobe(set: string) {
    const gen = this.wardrobeSets?.[set];
    this.outfit = gen ? gen(this.desc.seed) : generateOutfit(this.desc.seed ^ (set.length * 0x9e3779b9), { sex: this.appearance.sex, age: this.appearance.age, archetype: this.desc.archetype, ...this.outfitCtx });
    this.build();
    this.applyHands();
  }
  on(type: 'footstep' | 'contact' | 'hail', cb: (e: any) => void) { (this.listeners[type] ??= []).push(cb); }
  private emit(type: string, e: any) { for (const cb of this.listeners[type] ?? []) cb(e); }

  update(dt: number) {
    const t0 = performance.now();
    dt = Math.min(dt, 0.1);
    if (this.seat) {
      this.seat.decompose(this.object.position, this.object.quaternion, _v);
      this.yaw = new THREE.Euler().setFromQuaternion(this.object.quaternion, 'YXZ').y;
      this.animator.setLocomotion({ velocity: [0, 0, 0], grounded: true, heading: this.yaw, mode: 'walk' }, dt);
    } else {
      // turn towards the requested heading (smoothed; fast when running)
      let d = this.loco.heading - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 12);
      this.object.rotation.set(0, this.yaw, 0);
      this.animator.setLocomotion({ ...this.loco, heading: this.yaw }, dt);
    }
    this.animator.update(dt);
    // apply pose
    const pose = this.animator.pose;
    for (let j = 0; j < this.bones.length; j++) this.bones[j].quaternion.fromArray(pose.q, j * 4);
    this.bones[JI.pelvis].position.set(pose.pelvis[0], pose.pelvis[1] + this.asm.lift * 0 + this.pelvisDrop, pose.pelvis[2]);
    this.object.updateMatrixWorld(true);
    // procedural layers
    if (!this.seat) this.footIK(dt);
    this.handIK();
    this.lookAtLayer(dt);
    // events
    for (const e of this.animator.drainEvents()) {
      if (e.type === 'footstep' && e.foot) {
        const b = this.bones[JI[`ball_${e.foot}`]];
        const pos = worldPos(b, new THREE.Vector3());
        const g = this.ground?.(pos.x, pos.z);
        if (g) pos.y = g.y; // the sound source is the contact point on the ground
        this.emit('footstep', { type: 'footstep', foot: e.foot, position: pos, surface: g?.surface ?? 'concrete', speed: e.speed ?? 0, character: this } satisfies FootstepEvent);
      } else if (e.type === 'contact') {
        const hand = e.data?.hand === 'l' ? 'hand_l' : 'hand_r';
        this.emit('contact', { type: 'contact', hand: e.data?.hand, what: e.data?.what, position: worldPos(this.bones[JI[hand]], new THREE.Vector3()), character: this } satisfies ContactEvent);
      } else if (e.type === 'hail') this.emit('hail', { type: 'hail', character: this, position: this.object.position.clone() });
    }
    this.lastUpdateMs = performance.now() - t0;
  }

  /** Feet onto the ground (curbs 0.15 m, stairs, slopes), pelvis lowered to reach, planted feet locked. */
  private footIK(dt: number) {
    if (!this.ground) return;
    const lift = this.asm.lift;
    let need = 0;
    const targets: Record<'l' | 'r', { pos: THREE.Vector3; n: THREE.Vector3; w: number } | null> = { l: null, r: null };
    for (const side of ['l', 'r'] as const) {
      const foot = this.bones[JI[`foot_${side}`]], ball = this.bones[JI[`ball_${side}`]];
      const fp = worldPos(foot, new THREE.Vector3()), bp = worldPos(ball, _v2);
      const restAnkle = this.asm.joints[JI[`foot_${side}`] * 3 + 1]; // ankle height above the sole incl. shoe lift
      const gh = this.ground(fp.x, fp.z), gt = this.ground(bp.x, bp.z);
      if (!gh) continue;
      const rootY = this.object.position.y;
      // animated height of the ankle above the character's base plane
      const animAbove = fp.y - rootY - restAnkle;
      const groundY = Math.max(gh.y, gt ? gt.y : gh.y);
      const desired = groundY + restAnkle + Math.max(0, animAbove);
      // slope normal from heel/toe heights
      _n.set(0, 1, 0);
      if (gt) { const dz = bp.clone().sub(fp); const l = Math.hypot(dz.x, dz.z) || 1; const slope = (gt.y - gh.y) / l; _n.set(-dz.x / l * slope, 1, -dz.z / l * slope).normalize(); }
      const lock = this.footLock[side];
      const planted = this.animator.planted[side];
      if (planted && !lock.was) lock.pos.set(fp.x, desired, fp.z);
      lock.was = planted;
      lock.w += ((planted ? 1 : 0) - lock.w) * Math.min(1, dt * 14);
      const tp = new THREE.Vector3(fp.x, desired, fp.z);
      if (lock.w > 0.01) tp.lerp(_v.set(lock.pos.x, desired, lock.pos.z), lock.w);
      targets[side] = { pos: tp, n: _n.clone(), w: 1 };
      need = Math.min(need, desired - fp.y);
      void lift;
    }
    // lower the pelvis so the lower foot can reach (never raise above the animated height)
    const targetDrop = Math.max(-0.35, need);
    this.pelvisDrop += (targetDrop - this.pelvisDrop) * Math.min(1, dt * 10);
    this.bones[JI.pelvis].position.y += this.pelvisDrop - (this.bones[JI.pelvis].position.y - this.animator.pose.pelvis[1]);
    this.bones[JI.pelvis].updateMatrixWorld(true);
    for (const side of ['l', 'r'] as const) {
      const t = targets[side]; if (!t) continue;
      const thigh = this.bones[JI[`thigh_${side}`]], calf = this.bones[JI[`calf_${side}`]], foot = this.bones[JI[`foot_${side}`]];
      const kneeFwd = worldPos(calf, new THREE.Vector3()).add(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(0.5));
      twoBoneIK(thigh, calf, foot, t.pos, kneeFwd, t.w);
      alignToNormal(foot, t.n, 0.8);
    }
  }

  private handIK() {
    for (const side of ['l', 'r'] as const) {
      const t = this.handTargets[side]; if (!t) continue;
      const up = this.bones[JI[`upperarm_${side}`]], lo = this.bones[JI[`lowerarm_${side}`]], hand = this.bones[JI[`hand_${side}`]];
      const elbowPole = worldPos(lo, new THREE.Vector3()).add(new THREE.Vector3(side === 'l' ? 0.5 : -0.5, -0.4, -0.3).applyQuaternion(this.object.quaternion));
      twoBoneIK(up, lo, hand, t, elbowPole, 1);
    }
  }

  private lookAtLayer(dt: number) {
    this.lookBlend += ((this.lookTarget ? 1 : 0) - this.lookBlend) * Math.min(1, dt * 4);
    if (this.lookBlend < 0.01 || !this.lookTarget) return;
    ikLookAt([{ bone: this.bones[JI.spine_03], w: 0.2 }, { bone: this.bones[JI.neck_01], w: 0.35 }, { bone: this.bones[JI.Head], w: 0.45 }], [this.bones[JI.eye_l], this.bones[JI.eye_r]], this.bones[JI.Head], this.lookTarget, this.lookBlend);
  }

  /** World position of a joint (props, cameras, audio). */
  jointWorld(name: string, out = new THREE.Vector3()) { return worldPos(this.bones[JI[name]], out); }

  dispose() {
    for (const m of this.meshes) { m.geometry.dispose(); m.removeFromParent(); }
    this.skeleton.dispose();
    this.object.removeFromParent();
    this.listeners = {};
    void _m4;
  }
}

/** Arm abduction for wide hips / heavy bodies (radians, +Z lifts the left arm away from the body). */
export function armGirth(a: Appearance): number {
  const m = a.body.macro;
  return Math.max(0, (m.weight - 0.45) * 0.35 + (1 - m.sex) * 0.05 + (m.muscle - 0.5) * 0.12);
}
