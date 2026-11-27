/**
 * Cutscene performance tracks (docs/CUTSCENE_PERFORMANCE.md): clips, look-at, IK, expressions, lips and
 * props per actor, resolved at any time t into an ActorFrame. Pure and deterministic (no three.js, no DOM),
 * so the ?cine= tool scrubs to the same pose every time, and unit-tested.
 */
import type { ActorKey, V3 } from './schema';

export type Layer = 'full' | 'upper' | 'additive';
export type Chain = 'hand_l' | 'hand_r' | 'foot_l' | 'foot_r';
export type Target = V3 | 'camera' | { actor: string; joint?: string } | { prop: string };
export interface ClipKey { t: number; clip: string | null; blend?: number; layer?: Layer; speed?: number; loop?: boolean; root?: boolean }
export interface LookKey { t: number; at: Target | null; weight?: number; blend?: number }
export interface IkKey { t: number; chain: Chain; at: Target | null; weight?: number; blend?: number }
export interface ExprKey { t: number; name: string; w: number; blend?: number }
export interface VisemeKey { t: number; v: string; w?: number }
export interface PropKey { t: number; prop: string; attach: string | null; offset?: V3; rot?: V3 }
export interface ActorTrack {
  keys: ActorKey[];
  clips?: ClipKey[]; look?: LookKey[]; ik?: IkKey[]; expr?: ExprKey[];
  lips?: 'auto' | 'off' | VisemeKey[];
  props?: PropKey[];
  blinks?: boolean;
}
export type ActorValue = ActorKey[] | ActorTrack;
export type HandOff = 'despawn' | 'companion' | 'ambient' | 'player';

export interface ActorFrame {
  root: { x: number; y?: number; z: number; heading: number };
  clips: { clip: string; time: number; weight: number; layer: Layer; loop: boolean; root?: boolean }[];
  look: { at: V3 | null; weight: number };
  ik: Partial<Record<Chain, { at: V3; weight: number }>>;
  expr: Record<string, number>;
  visemes: Record<string, number>;
  props: { prop: string; attach: string; offset?: V3; rot?: V3 }[];
  blinks: boolean;
}

export const VISEMES = ['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U'] as const;
export const TRACKS = ['clips', 'look', 'ik', 'expr', 'lips', 'props'] as const;

export const isTrack = (v: ActorValue | undefined): v is ActorTrack => !!v && !Array.isArray(v);
export const keysOf = (v: ActorValue | undefined): ActorKey[] => (!v ? [] : Array.isArray(v) ? v : v.keys ?? []);
/** Upgrade a plain key array to a track in place (the tool calls it before adding a performance key). */
export function asTrack(actors: Record<string, ActorValue>, id: string): ActorTrack {
  const v = actors[id];
  if (isTrack(v)) return v;
  return (actors[id] = { keys: v ?? [] });
}

/** Everything the resolver needs from outside: where actors, joints and the camera are, and clip lengths. */
export interface PerfWorld {
  rootOf(actor: string, t: number): { x: number; y?: number; z: number } | null;
  joint?(actor: string, joint: string): V3 | null;
  camera?(): V3 | null;
  clipInfo?(clip: string): { duration: number; loop: boolean } | null;
  propPos?(prop: string): V3 | null;
}

type Abs<T> = T & { abs: number };
interface Collected {
  clips: Abs<ClipKey>[]; look: Abs<LookKey>[]; ik: Abs<IkKey>[]; expr: Abs<ExprKey>[]; props: Abs<PropKey>[];
  visemes: Abs<VisemeKey>[]; blinks: boolean; any: boolean;
}

export interface SpokenLine { t0: number; t1: number; ref: string; text: string; speakerId?: string; shot: string }

/**
 * Collects every actor's tracks across shots in absolute time (blocking and performance carry over cuts, like
 * the root keys), then resolves frames. `lipsync(ref)` returns a line's viseme file ([t, v, w] from line start)
 * or null; lines without one get a text-estimated mouth so nobody talks with a closed mouth.
 */
export class Performance {
  private by = new Map<string, Collected>();

  constructor(shots: { id: string; actors?: Record<string, ActorValue> }[], shotStart: number[], lines: SpokenLine[],
    speaks: (actor: string, line: SpokenLine) => boolean, lipsync: (ref: string) => [number, string, number][] | null = () => null) {
    shots.forEach((s, i) => {
      const st = shotStart[i];
      for (const [id, v] of Object.entries(s.actors ?? {})) {
        if (!isTrack(v)) continue;
        const c = this.get(id); c.any = true;
        const push = <T extends { t: number }>(dst: Abs<T>[], src?: T[]) => { for (const k of src ?? []) dst.push({ ...k, abs: st + k.t }); };
        push(c.clips, v.clips); push(c.look, v.look); push(c.ik, v.ik); push(c.expr, v.expr); push(c.props, v.props);
        if (v.blinks === false) c.blinks = false;
        const lips = v.lips ?? 'auto';
        if (Array.isArray(lips)) push(c.visemes, lips);
        else if (lips === 'auto') {
          for (const l of lines) {
            if (l.shot !== s.id || !speaks(id, l)) continue;
            const vs = lipsync(l.ref) ?? estimateVisemes(l.text, l.t1 - l.t0);
            for (const [t, vv, w] of vs) c.visemes.push({ t, v: vv, w, abs: l.t0 + t });
            c.visemes.push({ t: l.t1 - l.t0, v: 'sil', w: 1, abs: l.t1 });
          }
        }
      }
    });
    for (const c of this.by.values()) for (const k of ['clips', 'look', 'ik', 'expr', 'props', 'visemes'] as const) (c[k] as { abs: number }[]).sort((a, b) => a.abs - b.abs);
  }

  private get(id: string): Collected {
    let c = this.by.get(id);
    if (!c) this.by.set(id, (c = { clips: [], look: [], ik: [], expr: [], props: [], visemes: [], blinks: true, any: false }));
    return c;
  }

  /** True when the actor has any performance track (otherwise the host keeps its own locomotion via pose()). */
  has(id: string) { return !!this.by.get(id)?.any; }
  /** Keys per lane for the tool's timeline. */
  lanes(id: string) { const c = this.by.get(id); return c ? { clips: c.clips, look: c.look, ik: c.ik, expr: c.expr, props: c.props, lips: c.visemes } : null; }

  frame(id: string, t: number, root: ActorFrame['root'], world: PerfWorld): ActorFrame {
    const c = this.get(id);
    return {
      root,
      clips: resolveClips(c.clips, t, world),
      look: resolveAim(c.look, t, (k) => resolveTarget(k.at, t, id, world)),
      ik: resolveIk(c.ik, t, id, world),
      expr: resolveExpr(c.expr, t),
      visemes: resolveVisemes(c.visemes, t),
      props: resolveProps(c.props, t),
      blinks: c.blinks,
    };
  }
}

const ramp = (t: number, abs: number, blend = 0.3) => (blend <= 0 ? (t >= abs ? 1 : 0) : Math.min(1, Math.max(0, (t - abs) / blend)));

/** Per layer, the newest clip fades in over its blend and the ones before it share what's left. */
function resolveClips(keys: Abs<ClipKey>[], t: number, world: PerfWorld): ActorFrame['clips'] {
  const out: ActorFrame['clips'] = [];
  for (const layer of ['full', 'upper', 'additive'] as Layer[]) {
    const ks = keys.filter((k) => (k.layer ?? 'full') === layer && k.abs <= t);
    let remain = 1;
    for (let i = ks.length - 1; i >= 0 && remain > 1e-4; i--) {
      const k = ks[i], w = (i === 0 && layer === 'full' ? 1 : ramp(t, k.abs, k.blend)) * remain;
      remain -= w;
      if (!k.clip || w <= 1e-4) continue;
      const info = world.clipInfo?.(k.clip), loop = k.loop ?? info?.loop ?? false;
      let time = (t - k.abs) * (k.speed ?? 1);
      if (info && info.duration > 0) time = loop ? time % info.duration : Math.min(time, info.duration);
      out.push({ clip: k.clip, time, weight: w, layer, loop, ...(k.root ? { root: true } : {}) });
    }
  }
  return out;
}

function resolveTarget(at: Target | null, t: number, self: string, world: PerfWorld): V3 | null {
  if (at === null) return null;
  if (at === 'camera') return world.camera?.() ?? null;
  if (Array.isArray(at)) return at;
  if ('prop' in at) return world.propPos?.(at.prop) ?? null;
  if (at.actor === self) return null;
  const j = world.joint?.(at.actor, at.joint ?? 'Head');
  if (j) return j;
  const r = world.rootOf(at.actor, t);
  if (!r) return null;
  const h = at.joint && /hand|arm|clav/.test(at.joint) ? 1.3 : at.joint && /pelvis|spine_01/.test(at.joint) ? 1.0 : 1.62;
  return [r.x, (r.y ?? 0) + h, r.z];
}

/** Look and IK share this: the current key's target fades in over its blend from the previous one. */
function resolveAim<K extends { abs: number; at: Target | null; weight?: number; blend?: number }>(ks: Abs<K>[], t: number, target: (k: K) => V3 | null): { at: V3 | null; weight: number } {
  let i = -1; for (let j = 0; j < ks.length && ks[j].abs <= t; j++) i = j;
  if (i < 0) return { at: null, weight: 0 };
  const cur = ks[i], u = ramp(t, cur.abs, cur.blend ?? 0.3);
  const pc = target(cur), wc = pc ? cur.weight ?? 1 : 0;
  const prev = i > 0 ? ks[i - 1] : null, pp = prev ? target(prev) : null, wp = pp ? prev!.weight ?? 1 : 0;
  if (!pc && !pp) return { at: null, weight: 0 };
  if (!pc) return { at: pp, weight: wp * (1 - u) };
  if (!pp) return { at: pc, weight: wc * u };
  return { at: [0, 1, 2].map((a) => pp[a] + (pc[a] - pp[a]) * u) as V3, weight: wp + (wc - wp) * u };
}

function resolveIk(ks: Abs<IkKey>[], t: number, self: string, world: PerfWorld): ActorFrame['ik'] {
  const out: ActorFrame['ik'] = {};
  for (const chain of ['hand_l', 'hand_r', 'foot_l', 'foot_r'] as Chain[]) {
    const r = resolveAim(ks.filter((k) => k.chain === chain), t, (k) => resolveTarget(k.at, t, self, world));
    if (r.at && r.weight > 1e-4) out[chain] = { at: r.at, weight: r.weight };
  }
  return out;
}

function resolveExpr(ks: Abs<ExprKey>[], t: number): Record<string, number> {
  const out: Record<string, number> = {};
  const names = new Set(ks.map((k) => k.name));
  for (const n of names) {
    let v = 0;
    for (const k of ks) { if (k.name !== n || k.abs > t) continue; v = v + (k.w - v) * ramp(t, k.abs, k.blend ?? 0.2); }
    if (v > 1e-4) out[n] = Math.round(v * 1e4) / 1e4;
  }
  return out;
}

/** The current viseme cross-fades from the previous one over 60 ms: at most two non-zero. */
function resolveVisemes(ks: Abs<VisemeKey>[], t: number): Record<string, number> {
  let i = -1; for (let j = 0; j < ks.length && ks[j].abs <= t; j++) i = j;
  if (i < 0) return {};
  const cur = ks[i], u = ramp(t, cur.abs, 0.06), out: Record<string, number> = {};
  const add = (v: string, w: number) => { if (v !== 'sil' && w > 1e-4) out[v] = (out[v] ?? 0) + w; };
  add(cur.v, (cur.w ?? 1) * u);
  if (i > 0) add(ks[i - 1].v, (ks[i - 1].w ?? 1) * (1 - u));
  return out;
}

function resolveProps(ks: Abs<PropKey>[], t: number): ActorFrame['props'] {
  const last = new Map<string, Abs<PropKey>>();
  for (const k of ks) if (k.abs <= t) last.set(k.prop, k);
  return [...last.values()].filter((k) => k.attach).map((k) => ({ prop: k.prop, attach: k.attach!, ...(k.offset ? { offset: k.offset } : {}), ...(k.rot ? { rot: k.rot } : {}) }));
}

/**
 * A text-estimated mouth for lines without a lip-sync file: letters to the 15 visemes, spread over the line's
 * spoken time (punctuation pauses close the mouth). Rough by design; the aligner replaces it when audio exists.
 */
export function estimateVisemes(text: string, seconds: number): [number, string, number][] {
  const map: [RegExp, string][] = [[/^(th)/, 'TH'], [/^(ch|sh|j)/, 'CH'], [/^[pbm]/, 'PP'], [/^[fv]/, 'FF'], [/^[td]/, 'DD'], [/^[kgq]|^c(?!h)/, 'kk'],
    [/^[sz]|^x/, 'SS'], [/^[nl]/, 'nn'], [/^r/, 'RR'], [/^a/, 'aa'], [/^e/, 'E'], [/^[iy]/, 'I'], [/^o/, 'O'], [/^[uw]/, 'U']];
  const s = text.toLowerCase(), units: (string | null)[] = [];
  for (let i = 0; i < s.length;) {
    if (/[.,!?;:—–-]/.test(s[i])) { units.push(null); i++; continue; }
    const m = map.find(([re]) => re.test(s.slice(i)));
    if (m) { const len = (s.slice(i).match(m[0]) ?? [''])[0].length || 1; if (units[units.length - 1] !== m[1]) units.push(m[1]); i += len; } else i++;
  }
  const n = Math.max(1, units.length), dt = Math.max(0.05, (seconds - 0.2) / n), out: [number, string, number][] = [];
  units.forEach((u, i) => out.push([0.05 + i * dt, u ?? 'sil', u && /^[aEIOU]/.test(u) ? 0.9 : 0.7]));
  return out;
}
