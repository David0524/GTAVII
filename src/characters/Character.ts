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
import { scalpHairMesh } from './heads/scalpHair';
import { neckProfile, neckSampler, headFaceExtents, fitHead, headMesh, headWithHairMesh, type HeadAsset, type NeckData } from './heads/rocketbox';
import { assemble, type Assembled } from './build/assemble';
import { createSkinnedMeshes } from './render/meshes';
import { Animator, type LocoInput } from './anim/Animator';
import type { AnimLibrary } from './anim/AnimLibrary';
import { twoBoneIK, lookAt as ikLookAt, alignToNormal, worldPos } from './anim/IK';
import { JOINT_INDEX as JI } from './rig';
import { WeaponRig, type CoverState, type WeaponState } from './weaponRig';
import type { WeaponKind } from './build/weapons';

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
  private handW: Record<'l' | 'r', number> = { l: 1, r: 1 };
  private seat: THREE.Matrix4 | null = null;
  private listeners: Record<string, ((e: any) => void)[]> = {};
  private ground: GroundFn | null = null;
  private footLock: Record<'l' | 'r', { pos: THREE.Vector3; w: number; was: boolean }> = { l: { pos: new THREE.Vector3(), w: 0, was: false }, r: { pos: new THREE.Vector3(), w: 0, was: false } };
  private pelvisDrop = 0;
  /** Step smoothing: autostep moves the capsule instantly; the body absorbs it and springs back. */
  stepSmoothing = true;
  private stepOff = 0; private stepVel = 0; private lastRootY: number | null = null;
  private stairT = 0; private stairSign = 0; private lastStepAt = -10; private clock = 0;
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
      if (rb && this.prebuiltHead) {
        this.rbFit = fitHead(rb, this.prebuiltHead.joints);
        // ICT heads stitch onto our neck (profile measured in the build worker)
        this.rbNeck = (rb.meta as { packed?: boolean }).packed ? neckSampler(this.prebuiltHead.neck) : null;
      }
    }
    else {
      const shape = this.model.evaluate({ ...this.appearance.body, stature: this.appearance.stature });
      const rb = this.desc.overrides?.rbHead as HeadAsset | undefined;
      this.rbFit = rb ? fitHead(rb, shape.joints) : null;
      // ICT heads (packed): our body keeps its own neck and the head's neck is stitched onto it.
      // Pulling our neck in to ICT's thinner neck left a lit ledge above the collar where the skin
      // flared back out to the shoulders. Rocketbox heads keep the body-side conform.
      const ict = !!(rb && (rb.meta as { packed?: boolean }).packed);
      this.asm = assemble(this.model, shape, this.appearance, this.outfit, this.lod, false, this.rbFit ? { headCutY: this.rbFit.cutY, headRing: this.rbFit.ringY, ...(ict ? { headBand: 0.022 } : { headRingR: this.rbFit.ringR, headAxis: this.rbFit.neckAxis }), keepHair: !!this.desc.overrides?.ourHair, headFace: headFaceExtents(rb!, this.rbFit) } : {});
      this.rbNeck = ict && this.rbFit ? neckProfile(shape.pos, shape.joints, this.rbFit.neckBottom - 0.012, this.rbFit.neckBottom + 0.08) : null;
    }
    for (const m of this.meshes) { m.geometry.dispose(); m.removeFromParent(); }
    const { bones, skeleton, root } = buildSkeleton(this.asm.joints);
    this.bones = bones; this.skeleton = skeleton;
    // a rebuild (wardrobe change) replaces the bones: re-equip the weapon on the new ones
    if (this.wrig) { const k = this.wrig.def?.kind ?? null, st = this.wrig.state, cover = this.wrig.cover; this.wrig.dispose(); this.wrig = null; if (k) { this.rig().setWeapon(k); this.rig().cover = cover; if (st === 'drawn' || st === 'drawing') void this.rig().draw(); } }
    const rb = this.desc.overrides?.rbHead as HeadAsset | undefined;
    const merge = !!(rb && this.rbFit && this.desc.overrides?.ourHair && this.asm.hair);
    const { main, hair } = createSkinnedMeshes(this.asm.main, merge ? null : this.asm.hair, skeleton, root);
    this.meshes = hair ? [main, hair] : [main];
    const hopts = { neck: this.rbNeck ?? undefined, lift: this.asm.lift, tint: this.desc.overrides?.headTint as [number, number, number] | undefined, bodyTone: this.appearance.skin.tone, noCards: !!this.desc.overrides?.ourHair };
    // leads: head + our hair in one draw; near ring: head (with its own hair cards) as the second draw
    if (merge) this.meshes.push(headWithHairMesh(rb!, this.rbFit!, this.asm.hair!, skeleton, main.bindMatrix, hopts));
    else if (rb && this.rbFit) this.meshes.push(headMesh(rb, this.rbFit, skeleton, main.bindMatrix, hopts));
    // heads that carry their own scalp-hair weights (ICT) grow the hair from their own scalp
    if (rb && this.rbFit && !merge && rb.hair) { const sh = scalpHairMesh(rb, this.rbFit, this.appearance, skeleton, main.bindMatrix, this.asm.lift, this.lod); if (sh) this.meshes.push(sh); }
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

  // --- firearms (weaponRig.ts) ------------------------------------------------------------------
  private wrig: WeaponRig | null = null;
  private rig() { return (this.wrig ??= new WeaponRig(this.bones, this.object, this.animator, (t, e) => this.emit(t, e))); }
  /** Equip a weapon, holstered (right hip / across the back / under the coat), or null to unequip. */
  setWeapon(kind: WeaponKind | null) { this.rig().setWeapon(kind); this.animator.setHands('relaxed', 'relaxed'); }
  /** Draw (0.55 s handgun, 0.8 s long gun): resolves when the gun is in hand at low-ready. */
  draw() { this.animator.setHands('relaxed', 'grip'); return this.rig().draw(); }
  /** Holster: resolves when it is put away. */
  holster() { return this.rig().holster().then(() => this.animator.setHands('relaxed', 'relaxed')); }
  /** Aim at a world point (null lowers to low-ready). Upper body only: walk, crouch and cover keep the legs. */
  setAim(target: THREE.Vector3 | null) { this.rig().setAim(target); }
  /** A shot: recoil, and a 'shot' event { muzzle, dir } (ballistics and FX are the caller's). False if not drawn. */
  fire() { return this.wrig?.fire() ?? false; }
  /** Reload clip (upper body). */
  reload() { return this.animator.play('reload'); }
  /** Muzzle position and barrel direction in world space, or null when no gun is in hand. */
  muzzle(pos?: THREE.Vector3, dir?: THREE.Vector3) { return this.wrig?.muzzle(pos, dir) ?? null; }
  /** In cover (low: crouched until aiming; high: leans out to `side` when aiming), or null. */
  setCover(c: CoverState | null) { this.rig().cover = c; }
  get weaponState(): WeaponState { return this.wrig?.state ?? 'none'; }
  /** test metrics (scene=weapons) */
  weaponDebug() { return this.wrig?.debug() ?? null; }
  play(action: string, opts?: { loop?: boolean; blendIn?: number; speed?: number }): Promise<void> { return this.animator.play(action, opts); }
  stop() { this.animator.stop(); }
  lookAt(target: THREE.Vector3 | null) { this.lookTarget = target ? target.clone() : null; }
  /** Hand IK target in world space; weight blends from the animated hand (0) to the target (1). */
  setHandTarget(side: 'l' | 'r', target: THREE.Vector3 | null, weight = 1) { this.handTargets[side] = target ? target.clone() : null; this.handW[side] = weight; }
  /**
   * Vehicle seat pose (world matrix). null = stand up.
   * opts.hip: the pose is the seat point the hips rest on (forward = the car's forward); the root is
   * then placed so the drive clip's pelvis (0.514 m up, 0.296 m back from the root at rest-pelvis
   * height 0.873 m, scaled to this body) lands on it. Without it, the pose is the root itself (the
   * engine's original contract: root dropped 0.38 m under the seat).
   */
  setSeat(pose: THREE.Matrix4 | null, opts: { hip?: boolean; clip?: string } = {}) {
    this.seat = pose ? pose.clone() : null;
    this.seatHip = !!opts.hip;
    if (pose) void this.play(opts.clip ?? 'drive', { loop: true }); else { this.animator.stop('full'); this.setWheel(null); }
  }
  private seatHip = false;
  private wheel: { center: THREE.Vector3; axis: THREE.Vector3; up: THREE.Vector3; radius: number } | null = null;
  private steer = 0;
  /**
   * Hands on a steering wheel (world space): centre, axis (the wheel's normal, pointing at the
   * driver), up (12 o'clock) and rim radius. steer -1..1 (left..right) turns the grips around the
   * rim by up to ±90°. Call every frame with the vehicle's steer (or once, and setSteer()). null = off.
   */
  setWheel(w: { center: THREE.Vector3; axis: THREE.Vector3; up: THREE.Vector3; radius: number } | null, steer = this.steer) {
    this.wheel = w ? { center: w.center.clone(), axis: w.axis.clone().normalize(), up: w.up.clone().normalize(), radius: w.radius } : null;
    this.steer = steer;
    if (!w) { this.setHandTarget('l', null); this.setHandTarget('r', null); }
  }
  setSteer(steer: number) { this.steer = Math.max(-1, Math.min(1, steer)); }
  private wheelHands() {
    const w = this.wheel; if (!w) return;
    const right = new THREE.Vector3().crossVectors(w.up, w.axis).normalize();
    const up = new THREE.Vector3().crossVectors(w.axis, right).normalize();
    // ten to two, turned with the wheel; the hand joint sits a little toward the driver of the grip
    const turn = -this.steer * Math.PI / 2;
    for (const [side, a0] of [['l', Math.PI * (150 / 180)], ['r', Math.PI * (30 / 180)]] as const) {
      const a = a0 + turn;
      const p = w.center.clone().addScaledVector(right, Math.cos(a) * w.radius).addScaledVector(up, Math.sin(a) * w.radius).addScaledVector(w.axis, 0.035);
      this.handTargets[side] = p; this.handW[side] = 1;
    }
  }
  setGround(fn: GroundFn | null) { this.ground = fn; }
  setWardrobe(set: string) {
    const gen = this.wardrobeSets?.[set];
    this.outfit = gen ? gen(this.desc.seed) : generateOutfit(this.desc.seed ^ (set.length * 0x9e3779b9), { sex: this.appearance.sex, age: this.appearance.age, archetype: this.desc.archetype, ...this.outfitCtx });
    this.build();
    this.applyHands();
  }
  on(type: 'footstep' | 'contact' | 'hail' | 'shot', cb: (e: any) => void) { (this.listeners[type] ??= []).push(cb); }
  private emit(type: string, e: any) { for (const cb of this.listeners[type] ?? []) cb(e); }

  update(dt: number) {
    const t0 = performance.now();
    dt = Math.min(dt, 0.1);
    if (this.seat) {
      this.seat.decompose(this.object.position, this.object.quaternion, _v);
      if (this.seatHip) {
        // root under and in front of the seat point: the drive clip's pelvis offset, scaled to this body
        const k = this.restPelvis[1] / (this.lib.restPelvisHeight || 0.873);
        this.object.position.add(new THREE.Vector3(0, -0.514 * k, 0.296 * k).applyQuaternion(this.object.quaternion));
      }
      this.yaw = new THREE.Euler().setFromQuaternion(this.object.quaternion, 'YXZ').y;
      this.animator.setLocomotion({ velocity: [0, 0, 0], grounded: true, heading: this.yaw, mode: 'walk' }, dt);
    } else {
      // turn towards the requested heading (smoothed; fast when running)
      let d = this.loco.heading - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 12);
      this.object.rotation.set(0, this.yaw, 0);
      // low cover: crouched behind it until aiming (then up over it)
      const mode = this.wrig?.wantsCrouch() ? 'crouch' as const : this.wrig?.cover?.height === 'low' && this.loco.mode === 'crouch' && this.wrig.state === 'drawn' && this.animator.gun.aim ? 'walk' as const : this.loco.mode;
      this.animator.setLocomotion({ ...this.loco, mode, heading: this.yaw }, dt);
    }
    // steps (kerbs, stoops, stairs): the controller snaps the capsule up or down up to 0.4 m in
    // one frame. Keep the body where it was and let a critically damped spring (about 0.25 s)
    // carry it over, while foot IK plants each foot on the true ground: a dip and recover, no pop.
    this.clock += dt;
    const rootY = this.object.position.y;
    if (this.lastRootY !== null && this.loco.grounded && !this.seat && this.stepSmoothing) {
      const dy = rootY - this.lastRootY;
      if (Math.abs(dy) > 0.02 && Math.abs(dy) < 0.45) {
        this.stepOff -= dy;
        // two steps within 0.9 s in the same direction: a staircase (stair gait)
        if (this.clock - this.lastStepAt < 0.9 && Math.sign(dy) === this.stairSign) this.stairT = 1;
        this.stairSign = Math.sign(dy); this.lastStepAt = this.clock;
      }
    }
    this.lastRootY = rootY;
    const w = 14;
    this.stepVel += (-w * w * this.stepOff - 2 * w * this.stepVel) * dt;
    this.stepOff += this.stepVel * dt;
    this.stairT = Math.max(0, this.stairT - dt / 0.9);
    this.animator.stair = this.stairT * this.stairSign;
    this.animator.update(dt);
    // apply pose
    const pose = this.animator.pose;
    for (let j = 0; j < this.bones.length; j++) this.bones[j].quaternion.fromArray(pose.q, j * 4);
    this.bones[JI.pelvis].position.set(pose.pelvis[0], pose.pelvis[1] + this.asm.lift * 0 + this.pelvisDrop + this.stepOff, pose.pelvis[2]);
    this.object.updateMatrixWorld(true);
    // procedural layers
    if (!this.seat) this.footIK(dt);
    this.wrig?.update(dt);
    this.wheelHands();
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
    this.bones[JI.pelvis].position.y = this.animator.pose.pelvis[1] + this.pelvisDrop + this.stepOff;
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
      if (this.handW[side] > 0.001) twoBoneIK(up, lo, hand, t, elbowPole, this.handW[side]);
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
    this.wrig?.dispose();
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
