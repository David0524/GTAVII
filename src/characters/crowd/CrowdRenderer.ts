/**
 * Crowd renderer for the sim's pedestrian list (AgentView / sim PedView).
 *
 *   near ring  (≤ nearR)  full Characters (LOD1, ≤ 2 draws each), built in a worker, foot IK
 *   mid        (≤ midR)   template LOD2 (~4k tris), GPU-skinned instances from a baked atlas
 *   far        (≤ farR)   template LOD3 (~1.8k tris)
 *   beyond               culled (impostors: see docs/CHARACTERS_PROGRESS.md, known issues)
 *
 * Templates are generated people (body + face + outfit) baked once; every agent gets its own
 * colour variation (hue/value per garment slot, skin tone shift) from its stable variant seed, so
 * the same face + outfit + colour combination never appears twice. Walk cycles are played at
 * speed / bakedSpeed of the nearest baked stride, so feet don't slide at crowd speeds.
 */
import * as THREE from 'three/webgpu';
import type { BodyModel } from '../body/BodyModel';
import type { AnimLibrary } from '../anim/AnimLibrary';
import { generateOutfit, type Outfit } from '../wardrobe/outfit';
import { assemble, type Assembled } from '../build/assemble';
import type { GeoArrays } from '../build/MeshBuilder';
import { crowdJoint } from '../rig';
import { bakeTemplate, CROWD_INDEX, NB, CROWD_SET, type BakeClip } from './bake';
import { crowdMaterial, ATLAS_ROWS } from './crowdMaterial';
import { tintFor, type HeadLibrary, type HeadAsset } from '../heads/rocketbox';
import { generateAppearance, type Appearance } from '../body/appearance';
import { Character, armGirth, type GroundFn } from '../Character';
import { hash2 } from '../util/rng';
import type { ArchetypeRegistry } from '../archetypes';

export interface AgentView {
  id: number; archetype: string; variant: number; x: number; y: number; z: number; yaw: number; speed: number; state: string;
  /** sim PedView.carry: what the ped holds ('frank', 'pretzel', 'coffee', 'newspaper', ...); '' or undefined = nothing */
  carry?: string;
}

/**
 * Street vendors and their customers (sim: docs/SIM_PROGRESS.md "Street vendors"). One mapping for
 * both draw paths: `crowd` names a baked clip (bake.ts CROWD_SET), `near` an Animator action.
 * Continuous states come from AgentView (state, speed, carry); one-shots come from sim events
 * through CrowdRenderer.trigger(); continuous work the sim doesn't expose as a state (shining
 * while a customer waits) through hold().
 */
const EAT = /frank|hot ?dog|pretzel|knish|chestnut|food|sandwich|slice|pizza|apple|ice ?cream/i, DRINK = /coffee|cup|soda|tea|drink|bottle/i;
export const VENDOR_ONE_SHOTS: Record<string, { crowd: string; seconds: number }> = {
  vendor_serve: { crowd: 'serve', seconds: 3 }, vendor_call: { crowd: 'call', seconds: 2.4 }, vendor_shout: { crowd: 'shout', seconds: 2 },
  right_cart: { crowd: 'right_cart', seconds: 3 }, pay: { crowd: 'idle', seconds: 2 },
  // pedBumped responses: a stagger, or knocked down (then the sim's 'down' / 'getUp' states take over)
  stumble: { crowd: 'stumble', seconds: 1.1 }, fall_down: { crowd: 'fall', seconds: 0.9 },
};
const HOLD_CROWD: Record<string, string> = { shine_shoes: 'shine', deal_cards: 'deal', duck_cart: 'duck', queue: 'queue', watch: 'watch' };
function stateAction(kind: string, a: AgentView): { crowd: string; near: string } | null {
  const s = a.state.toLowerCase(), arch = a.archetype.toLowerCase(), moving = a.speed > 0.15;
  const bump = /^down/.test(s) || /getup|get_up|stumble|angry/.test(s);
  if (kind === 'vendor' && !bump) {
    if (/cower|duck|hide/.test(s)) return { crowd: 'duck', near: 'duck_cart' };
    if (moving && /vendor|cart|push|arriv|clos/.test(s + arch) && /cart|vendor|grocer|news|flower/.test(arch)) return { crowd: 'push', near: 'push_cart' };
    if (!moving && /monte_dealer/.test(arch)) return { crowd: 'deal', near: 'deal_cards' };
  }
  // bumps (sim MOVEMENT states): these win over everything else
  if (/^down/.test(s)) return { crowd: 'down', near: 'down' };
  if (/getup|get_up/.test(s)) return { crowd: 'get_up', near: 'get_up' };
  if (/stumble/.test(s)) return { crowd: 'stumble', near: 'stumble' };
  if (/angry/.test(s)) return { crowd: 'argue', near: 'angry' };
  if (/queue/.test(s)) return { crowd: 'queue', near: 'queue' };
  if (/^watch/.test(s) || /monte/.test(s)) return { crowd: 'watch', near: 'watch' };
  if (moving && a.speed < 2.0 && a.carry) {
    if (EAT.test(a.carry)) return { crowd: 'walk_eat', near: 'eat_walk' };
    if (DRINK.test(a.carry)) return { crowd: 'walk_sip', near: 'sip_walk' };
    // a newspaper is drawn by the outfit's prop under the arm; no clip needed
  }
  return null;
}

interface Template {
  archetype?: string;
  index: number; appearance: Appearance; outfit: Outfit; kind: string;
  clips: BakeClip[]; frameBase: number; height: number;
  lods: { mesh: THREE.Mesh; geo: THREE.InstancedBufferGeometry; attrs: THREE.InstancedBufferAttribute[]; count: number; tris: number }[];
}
interface AgentState { phase: number; clip: number; tpl: number; lastX: number; lastZ: number; vx: number; vz: number; near: Character | null; pending: boolean; headId?: string | null; head?: HeadAsset | null;
  oneShot?: { action: string; until: number; start: number } | null; hold?: string | null; nearAction?: string }

const QUALITY = {
  low: { templates: 12, near: 3, nearR: 9, midR: 30, farR: 90 },
  medium: { templates: 20, near: 6, nearR: 11, midR: 40, farR: 130 },
  high: { templates: 32, near: 10, nearR: 13, midR: 50, farR: 170 },
  ultra: { templates: 40, near: 14, nearR: 15, midR: 60, farR: 220 },
} as const;

/** Template pools per archetype family (generic uniforms, no insignia). */
const FAMILIES: { kind: string; archetype?: string; share: number }[] = [
  { kind: 'police', archetype: 'beat_cop', share: 0.08 },
  { kind: 'worker', archetype: 'worker_handcart', share: 0.12 },
  { kind: 'vendor', archetype: 'vendor', share: 0.06 },
  { kind: 'general', share: 0.74 },
];
// street vendors first: 'cart_vendor' must not land in the handcart workers (they have no vendor clips)
const familyOf = (arch: string) => (/cop|police|patrol/.test(arch) ? 'police' : /vendor|grocer|flower_seller|news_vendor|shoeshine|peddler|monte_dealer/.test(arch) ? 'vendor' : /handcart|cart|garment|worker|porter/.test(arch) ? 'worker' : 'general');

export class CrowdRenderer {
  readonly object = new THREE.Group();
  private body: BodyModel; private lib: AnimLibrary;
  private q: (typeof QUALITY)[keyof typeof QUALITY];
  private templates: Template[] = [];
  private toBuild: number[] = [];
  private atlas: THREE.DataTexture;
  private atlasData: Uint16Array;
  private atlasFrames = 0;
  private material: THREE.MeshStandardNodeMaterial;
  private agents = new Map<number, AgentState>();
  private camera: THREE.Camera | null = null;
  private lastT = performance.now();
  private worker: Worker | null = null;
  private workerReady = false;
  private nearPool = new Map<number, Character>();
  private heads: HeadLibrary | null = null;
  private getGround: () => GroundFn | null;
  private max: number;
  private carts: THREE.InstancedMesh;
  /** Measurements for the stress test (ms, counts). */
  /** Optional: tell the renderer which camera drives LOD (else the first camera that draws it). */
  setCamera(cam: THREE.Camera) { this.camera = cam; }
  /** Pending near-ring builds (tests wait for 0). */
  get pendingBuilds() { let n = 0; for (const st of this.agents.values()) if (st.pending) n++; return n; }
  readonly stats = { cpuMs: 0, near: 0, mid: 0, far: 0, culled: 0, draws: 0, tris: 0, templatesReady: 0, nearBuilds: 0 };

  constructor(body: BodyModel, lib: AnimLibrary, opts: { max: number; quality: keyof typeof QUALITY; ground: () => GroundFn | null; baseUrl?: string; archetypes?: ArchetypeRegistry; bodyUrl?: string; nearLod?: number; heads?: HeadLibrary | null }) {
    this.heads = opts.heads ?? null;
    this.nearLod = opts.nearLod ?? 1;
    this.registry = opts.archetypes ?? null;
    this.body = body; this.lib = lib; this.max = opts.max; this.getGround = opts.ground;
    this.q = QUALITY[opts.quality];
    const cols = 32;
    this.atlasData = new Uint16Array(cols * NB * 3 * ATLAS_ROWS * 4);
    this.atlas = new THREE.DataTexture(this.atlasData, cols * NB * 3, ATLAS_ROWS, THREE.RGBAFormat, THREE.HalfFloatType);
    this.atlas.minFilter = this.atlas.magFilter = THREE.NearestFilter;
    this.material = crowdMaterial(this.atlas);
    // template plan: families by share, varied sex/age, adults only
    let n = 0;
    for (const f of FAMILIES) for (let i = 0; i < Math.max(1, Math.round(this.q.templates * f.share)); i++) this.toBuild.push(n++);
    this.plan = [];
    for (const f of FAMILIES) for (let i = 0; i < Math.max(1, Math.round(this.q.templates * f.share)); i++) this.plan.push(f);
    // hand carts for garment workers (one instanced draw)
    this.carts = new THREE.InstancedMesh(cartGeometry(), new THREE.MeshStandardNodeMaterial({ color: 0x5a4a3a, roughness: 0.8 }), Math.max(8, Math.ceil(opts.max * 0.15)));
    this.carts.count = 0; this.carts.frustumCulled = false;
    this.object.add(this.carts);
    // camera capture: the first draw of the frame tells us which camera renders us
    const hook = new THREE.Mesh(new THREE.PlaneGeometry(0.001, 0.001), new THREE.MeshBasicNodeMaterial({ colorWrite: false, depthWrite: false }));
    hook.frustumCulled = false;
    hook.onBeforeRender = (_r, _s, cam) => { this.camera = cam; };
    this.object.add(hook);
    try {
      this.worker = new Worker(new URL('./buildWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this.onWorker(e.data);
      this.worker.postMessage({ type: 'init', url: opts.bodyUrl ?? (opts.baseUrl ?? import.meta.env.BASE_URL) + 'characters/body.bin' });
    } catch { this.worker = null; }
  }
  private plan: { kind: string; archetype?: string }[];
  private registry: ArchetypeRegistry | null;
  private nearLod: number;

  /** Build templates progressively (≈ one per call within a small time budget). */
  private buildTemplates(budgetMs: number) {
    const t0 = performance.now();
    while (this.toBuild.length && performance.now() - t0 < budgetMs) {
      const i = this.toBuild.shift()!;
      this.templates[i] = this.buildTemplate(i);
      this.stats.templatesReady = this.templates.filter(Boolean).length;
    }
  }

  private buildTemplate(i: number): Template {
    const fam = this.plan[i];
    const seed = hash2(0x7e3a, i * 7919 + 17);
    // general templates take turns dressing as registered narrative archetypes (street ones, by density)
    let arch = fam.archetype;
    const street = this.registry?.all.filter((d) => !d.scripted && (d.density?.day ?? 0) + (d.density?.night ?? 0) > 0) ?? [];
    if (fam.kind === 'general' && street.length) arch = street[i % street.length].id;
    const ctx = this.registry?.outfitContext(arch) ?? { archetype: arch };
    const appearance = generateAppearance(seed, fam.kind === 'police' ? { minAge: 24, maxAge: 55 } : {});
    const outfit = generateOutfit(seed ^ 0x5bd1e995, { sex: appearance.sex, age: appearance.age, ...ctx });
    const shape = this.body.evaluate({ ...appearance.body, stature: appearance.stature });
    const lod2 = assemble(this.body, shape, appearance, outfit, 2);
    const lod3 = assemble(this.body, shape, appearance, outfit, 3);
    const baked = bakeTemplate(this.lib, lod2.joints, { stride: appearance.gait.stride, swing: appearance.gait.swing, bounce: appearance.gait.bounce, slump: appearance.slump, age: appearance.age, heat: 0.6, formal: !!outfit.tie, girth: armGirth(appearance) }, fam.kind);
    const frameBase = this.atlasFrames;
    this.writeAtlas(baked.data, frameBase, baked.frames);
    this.atlasFrames += baked.frames;
    const lods = [lod2, lod3].map((a) => this.instancedLod(a));
    for (const l of lods) this.object.add(l.mesh);
    return { index: i, archetype: arch, appearance, outfit, kind: fam.kind, clips: baked.clips, frameBase, height: appearance.stature, lods };
  }

  private writeAtlas(data: Float32Array, frameBase: number, frames: number) {
    const W = this.atlas.image.width;
    const per = NB * 12;
    for (let f = 0; f < frames; f++) {
      const F = frameBase + f;
      const block = Math.floor(F / ATLAS_ROWS), row = F % ATLAS_ROWS;
      if ((block + 1) * NB * 3 > W) { console.warn('characters: crowd atlas full'); return; }
      for (let t = 0; t < NB * 3; t++) {
        const x = block * NB * 3 + t;
        const o = (row * W + x) * 4, s = f * per + t * 4;
        for (let c = 0; c < 4; c++) this.atlasData[o + c] = THREE.DataUtils.toHalfFloat(data[s + c]);
      }
    }
    this.atlas.needsUpdate = true;
  }

  /** One instanced draw for a template LOD: geometry with crowd skin indices and merged hair. */
  private instancedLod(a: Assembled) {
    const g = mergeHair(a.main, a.hair);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(g.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(g.normal, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(g.uv, 2));
    geo.setAttribute('uv1', new THREE.BufferAttribute(g.uv1, 3));
    geo.setAttribute('cA', new THREE.BufferAttribute(g.cA, 3));
    geo.setAttribute('cB', new THREE.BufferAttribute(g.cB, 3));
    geo.setAttribute('m0', new THREE.BufferAttribute(g.m0, 4));
    geo.setAttribute('m1', new THREE.BufferAttribute(g.m1, 4));
    geo.setAttribute('slot', new THREE.BufferAttribute(g.slot, 1));
    const cj = new Float32Array(g.vertexCount * 4);
    for (let i = 0; i < g.vertexCount * 4; i++) cj[i] = CROWD_INDEX[crowdJoint(g.skinIndex[i])];
    geo.setAttribute('cj', new THREE.BufferAttribute(cj, 4));
    geo.setAttribute('cw', new THREE.BufferAttribute(g.skinWeight, 4));
    geo.setIndex(new THREE.BufferAttribute(g.vertexCount < 65536 ? Uint16Array.from(g.index) : g.index, 1));
    const attrs = ['iA', 'iB', 'iC', 'iD'].map((n) => { const at = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4), 4); at.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, at); return at; });
    geo.instanceCount = 0;
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    return { mesh, geo, attrs, count: 0, tris: g.index.length / 3 };
  }

  /** Near-ring build: pick a Rocketbox head (no repeats among the near ring), then build headless in the worker. */
  private requestNear(a: AgentView, st: AgentState) {
    const seed = hash2(a.variant, 0xc0ffee);
    const post = (head: HeadAsset | null) => {
      st.head = head;
      this.worker!.postMessage({ type: 'build', id: a.id, seed, archetype: a.archetype, lod: this.nearLod, head: head ? { landmarks: head.meta.landmarks, neckMinY: head.meta.neckMinY, neckRing: head.meta.neckRing, face: head.meta.face } : null });
    };
    if (!this.heads) { post(null); return; }
    const used = new Set<string>();
    for (const s of this.agents.values()) if (s.headId && (s.near || s.pending)) used.add(s.headId);
    const id = this.heads.pick(generateAppearance(seed), used);
    st.headId = id;
    if (!id) { post(null); return; }
    this.heads.load(id).then(post, () => { st.headId = null; post(null); });
  }

  private onWorker(m: any) {
    if (m.type === 'ready') { this.workerReady = true; return; }
    if (m.type !== 'built') return;
    const st = this.agents.get(m.id);
    if (!st || !st.pending) return;
    st.pending = false;
    const head = m.head && st.head ? st.head : null;
    const overrides = head ? { rbHead: head, headTint: tintFor(head, m.appearance.skin.tone) } : undefined;
    const ch = new Character(this.body, this.lib, { seed: m.appearance.seed, overrides }, { lod: this.nearLod, prebuilt: m.asm, appearance: m.appearance, outfit: m.outfit, prebuiltHead: head ? m.head : undefined });
    ch.setGround(this.getGround());
    st.near = ch;
    this.object.add(ch.object);
    this.stats.nearBuilds++;
  }

  private clock = 0;
  /** A sim event's one-shot on a ped (vendorServed -> 'vendor_serve', vendorCall -> 'vendor_call', vendorShout -> 'vendor_shout', vendorAct right_cart -> 'right_cart', a paying customer -> 'pay'). */
  trigger(id: number, action: string) {
    const st = this.agents.get(id), def = VENDOR_ONE_SHOTS[action];
    if (!st || !def) return;
    st.oneShot = { action, until: this.clock + def.seconds, start: this.clock };
    if (st.near) void st.near.animator.play(action, { blendIn: 0.15 }).catch(() => {});
  }
  /** Continuous work the sim doesn't carry as a state (shoeshine: 'shine_shoes' while a customer waits); null releases it. */
  hold(id: number, action: string | null) {
    const st = this.agents.get(id); if (!st) return;
    st.hold = action && HOLD_CROWD[action] ? action : null;
  }

  setAgents(list: readonly AgentView[]) {
    const t0 = performance.now();
    const now = t0, dt = Math.min(0.1, (now - this.lastT) / 1000); this.lastT = now;
    this.clock += dt;
    if (this.toBuild.length) this.buildTemplates(this.templates.length ? 6 : 1e9);
    const ready = this.templates.filter(Boolean);
    if (!ready.length) return;
    const cam = this.camera;
    const cp = new THREE.Vector3(), frustum = new THREE.Frustum();
    if (cam) { cam.getWorldPosition(cp); cam.updateMatrixWorld(); frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)); }
    for (const t of ready) for (const l of t.lods) l.count = 0;
    let near = 0, mid = 0, far = 0, culled = 0, carts = 0;
    const seen = new Set<number>();
    // nearest agents get full characters
    const nearCands: { a: AgentView; d: number }[] = [];
    const sphere = new THREE.Sphere(new THREE.Vector3(), 1.2);
    const byFamily = new Map<string, Template[]>();
    for (const t of ready) { const k = t.kind; if (!byFamily.has(k)) byFamily.set(k, []); byFamily.get(k)!.push(t); }
    const byArch = new Map<string, Template[]>();
    for (const t of ready) if (t.archetype) { if (!byArch.has(t.archetype)) byArch.set(t.archetype, []); byArch.get(t.archetype)!.push(t); }
    for (const a of list) {
      seen.add(a.id);
      let st = this.agents.get(a.id);
      const own = byArch.get(a.archetype) ?? byArch.get(`npc.${a.archetype}`) ?? [];
      const fam = own.length ? own : byFamily.get(familyOf(a.archetype)) ?? byFamily.get('general') ?? ready;
      const tpl = fam[hash2(a.variant, 0x51) % fam.length];
      if (!st) { st = { phase: (hash2(a.id, 3) % 1000) / 1000, clip: 0, tpl: tpl.index, lastX: a.x, lastZ: a.z, vx: 0, vz: 0, near: null, pending: false }; this.agents.set(a.id, st); }
      if (!this.templates[st.tpl]) st.tpl = tpl.index;
      if (dt > 0) { const k = Math.min(1, dt * 6); st.vx += ((a.x - st.lastX) / dt - st.vx) * k; st.vz += ((a.z - st.lastZ) / dt - st.vz) * k; }
      st.lastX = a.x; st.lastZ = a.z;
      const d = cam ? Math.hypot(a.x - cp.x, a.z - cp.z) : 0;
      if (d <= this.q.nearR) nearCands.push({ a, d });
    }
    nearCands.sort((x, y) => x.d - y.d);
    const nearIds = new Set(nearCands.slice(0, this.q.near).map((c) => c.a.id));
    for (const a of list) {
      const st = this.agents.get(a.id)!;
      const T = this.templates[st.tpl];
      const d = cam ? Math.hypot(a.x - cp.x, a.z - cp.z) : 0;
      sphere.center.set(a.x, a.y + 0.9, a.z);
      const visible = !cam || frustum.intersectsSphere(sphere);
      // --- near ring: full character ---
      if (nearIds.has(a.id)) {
        if (!st.near && !st.pending && this.worker && this.workerReady && this.stats.nearBuilds - this.nearPool.size < 1e9) {
          st.pending = true;
          this.requestNear(a, st);
        }
        if (st.near) {
          st.near.object.position.set(a.x, a.y, a.z);
          st.near.setLocomotion({ velocity: [st.vx, 0, st.vz], grounded: true, heading: a.yaw, mode: a.speed > 4 ? 'sprint' : a.speed > 2.2 ? 'run' : 'walk' });
          // continuous vendor/customer states (one-shots are started by trigger())
          const want = st.hold ?? stateAction(T.kind, a)?.near ?? '';
          if (want !== (st.nearAction ?? '')) {
            if (st.nearAction) st.near.animator.stop();
            if (want) void st.near.animator.play(want, { loop: true, blendIn: 0.3 }).catch(() => {});
            st.nearAction = want;
          }
          if (visible) st.near.update(dt);
          st.near.object.visible = visible;
          near++;
          continue;
        }
      } else if (st.near) { st.near.dispose(); st.near = null; st.headId = null; st.head = null; }
      st.pending = st.pending && nearIds.has(a.id);
      if (!visible || d > this.q.farR) { culled++; continue; }
      // --- instanced: pick a baked clip from state and speed ---
      const ci = this.pickClip(T, a, st);
      const c = T.clips[ci];
      if (c.speed > 0) st.phase += (dt * (a.speed / c.speed)) / c.cycle; else st.phase += dt / c.cycle;
      st.phase -= Math.floor(st.phase);
      let off = 0; for (let i = 0; i < ci; i++) off += T.clips[i].frames;
      const fp = st.phase * c.frames, f0 = Math.floor(fp) % c.frames, f1 = (f0 + 1) % c.frames;
      const lod = T.lods[d <= this.q.midR ? 0 : 1];
      if (d <= this.q.midR) mid++; else far++;
      const i = lod.count++;
      const v = a.variant >>> 0;
      const h = (k: number) => ((hash2(v, k) % 10000) / 10000);
      lod.attrs[0].array.set([a.x, a.y, a.z, a.yaw], i * 4);
      lod.attrs[1].array.set([T.frameBase + off + f0, T.frameBase + off + f1, fp - Math.floor(fp), 1 + (h(9) - 0.5) * 0.05], i * 4);
      lod.attrs[2].array.set([(h(1) - 0.5) * 0.9, 0.78 + h(2) * 0.4, (h(3) - 0.5) * 0.5, 0.8 + h(4) * 0.4], i * 4);
      lod.attrs[3].array.set([(h(5) - 0.5) * 0.7, 0.8 + h(6) * 0.4, (h(7) - 0.5) * 0.25, 0], i * 4);
      if (T.kind === 'worker' && a.speed > 0.2 && carts < this.carts.count + 1e9 && carts < (this.carts.instanceMatrix.count)) {
        const m = new THREE.Matrix4().makeRotationY(a.yaw).setPosition(a.x + Math.sin(a.yaw) * 0.9, a.y, a.z + Math.cos(a.yaw) * 0.9);
        this.carts.setMatrixAt(carts++, m);
      }
    }
    this.carts.count = carts; this.carts.instanceMatrix.needsUpdate = true;
    let draws = carts ? 1 : 0, tris = 0;
    for (const t of ready) for (const l of t.lods) {
      l.geo.instanceCount = l.count;
      l.mesh.visible = l.count > 0;
      if (l.count) { draws++; tris += l.tris * l.count; for (const at of l.attrs) { at.needsUpdate = true; at.clearUpdateRanges(); at.addUpdateRange(0, l.count * 4); } }
    }
    for (const [id, st] of this.agents) if (!seen.has(id)) { st.near?.dispose(); this.agents.delete(id); }
    for (const st of this.agents.values()) if (st.near) { draws += st.near.stats.draws; tris += st.near.stats.tris; }
    Object.assign(this.stats, { cpuMs: performance.now() - t0, near, mid, far, culled, draws, tris });
  }

  private pickClip(T: Template, a: AgentView, st: AgentState): number {
    const idx = (n: string) => T.clips.findIndex((c) => c.name === n);
    const s = a.state.toLowerCase();
    let name: string;
    // sim one-shot (vendor events): played once from its start, then back to the state mapping
    if (st.oneShot && this.clock < st.oneShot.until) {
      const i = idx(VENDOR_ONE_SHOTS[st.oneShot.action].crowd);
      if (i >= 0) { if (i !== st.clip) st.clip = i; st.phase = Math.min(0.999, (this.clock - st.oneShot.start) / T.clips[i].cycle); return i; }
    } else if (st.oneShot) st.oneShot = null;
    const va = st.hold ? { crowd: HOLD_CROWD[st.hold], near: st.hold } : stateAction(T.kind, a);
    if (va?.crowd && idx(va.crowd) >= 0) name = va.crowd;
    else if (a.speed > 0.15 && !/sit|lean|cower/.test(s)) {
      name = a.speed < 1.05 ? 'walk_slow' : a.speed < 1.55 ? 'walk' : a.speed < 2.4 ? 'walk_brisk' : a.speed < 4.8 ? 'run' : 'sprint';
      if (T.kind === 'worker' && a.speed < 2.2 && /cart|push|work|deliver/.test(s + a.archetype)) name = 'push';
    } else {
      const map: [RegExp, string][] = [[/argu|fight|shout/, 'argue'], [/talk|chat|convers/, 'talk'], [/smok/, 'smoke'], [/read|paper/, 'read'], [/sit|stoop|bench/, 'sit'], [/lean|loiter|wait/, (a.variant & 1) ? 'lean' : 'idle'],
        [/hail|cab|taxi/, 'hail'], [/cower|panic|hide/, 'cower'], [/rubber|watch|gawk|look/, 'rubberneck'], [/wave|turn_back|block|barric/, 'wave_off'], [/push|cart/, 'push']];
      name = map.find(([r]) => r.test(s))?.[1] ?? ((a.variant % 4 === 0) ? 'idle_heat' : 'idle');
    }
    const i = idx(name);
    if (i !== st.clip) { st.clip = i; if (T.clips[i].speed === 0) st.phase = (hash2(a.id, i) % 100) / 100; }
    return i >= 0 ? i : 0;
  }

  dispose() {
    this.worker?.terminate();
    for (const st of this.agents.values()) st.near?.dispose();
    for (const t of this.templates) if (t) for (const l of t.lods) l.geo.dispose();
    this.atlas.dispose(); this.object.removeFromParent();
  }
}
void CROWD_SET;

/** Crowds draw hair opaque: the outermost shell gives the silhouette and colour. */
function mergeHair(main: GeoArrays, hair: GeoArrays | null): GeoArrays {
  if (!hair) return main;
  const keep: number[] = [];
  for (let v = 0; v < hair.vertexCount; v++) {
    const h = hair.m0[v * 4], sub = Math.round(hair.m1[v * 4 + 1]);
    keep[v] = sub === 0 && h > 0.99 ? 1 : 0;
  }
  const remap = new Int32Array(hair.vertexCount).fill(-1);
  let n = main.vertexCount;
  const extra: number[] = [];
  for (let v = 0; v < hair.vertexCount; v++) if (keep[v]) { remap[v] = n++; extra.push(v); }
  const idx: number[] = Array.from(main.index);
  for (let i = 0; i < hair.index.length; i += 3) {
    const a = remap[hair.index[i]], b = remap[hair.index[i + 1]], c = remap[hair.index[i + 2]];
    if (a >= 0 && b >= 0 && c >= 0) idx.push(a, b, c);
  }
  const cat = <T extends Float32Array | Uint16Array>(x: T, y: T, k: number, conv?: (v: number, i: number) => number): T => {
    const out = new (x.constructor as any)(n * k);
    out.set(x);
    extra.forEach((v, i) => { for (let c = 0; c < k; c++) out[(main.vertexCount + i) * k + c] = conv ? conv(y[v * k + c], c) : y[v * k + c]; });
    return out;
  };
  return {
    position: cat(main.position, hair.position, 3), normal: cat(main.normal, hair.normal, 3), uv: cat(main.uv, hair.uv, 2), uv1: cat(main.uv1, hair.uv1, 3),
    skinIndex: cat(main.skinIndex, hair.skinIndex, 4), skinWeight: cat(main.skinWeight, hair.skinWeight, 4),
    cA: cat(main.cA, hair.cA, 3), cB: cat(main.cB, hair.cB, 3),
    // hair becomes a coarse "tweed" cloth surface (pattern 10) in the crowd material
    m0: cat(main.m0, hair.m0, 4, (_v, c) => (c === 0 ? 10 : c === 1 ? 0.006 : c === 2 ? 0.7 : 0.1)), m1: cat(main.m1, hair.m1, 4, (_v, c) => (c === 0 ? 1 : c === 3 ? 0 : 0.05)),
    slot: cat(main.slot, hair.slot, 1, () => 6), index: Uint32Array.from(idx), vertexCount: n, triangleCount: idx.length / 3,
  };
}

function cartGeometry(): THREE.BufferGeometry {
  // a garment-district rolling rack: base, two uprights, top bar, hanging dress shapes
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); parts.push(g); };
  box(1.1, 0.04, 0.5, 0, 0.12, 0);
  box(0.03, 1.5, 0.03, -0.53, 0.85, 0); box(0.03, 1.5, 0.03, 0.53, 0.85, 0);
  box(1.1, 0.03, 0.03, 0, 1.6, 0);
  for (let i = 0; i < 7; i++) box(0.06, 1.0, 0.36, -0.42 + i * 0.14, 1.05, 0);
  for (const x of [-0.5, 0.5]) for (const z of [-0.22, 0.22]) box(0.06, 0.1, 0.06, x, 0.05, z);
  const merged = mergeGeos(parts);
  merged.rotateY(Math.PI / 2);
  return merged;
}
function mergeGeos(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  let base = 0;
  for (const g of gs) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), ix = g.getIndex()!;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nrm.push(n.getX(i), n.getY(i), n.getZ(i)); }
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base);
    base += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setIndex(idx);
  return out;
}
