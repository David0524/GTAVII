/**
 * Pure evaluation of a cutscene at time t (no three.js, no DOM: unit-tested).
 *  - Camera: Catmull-Rom through the shot's keys (position and look-at), per-segment easing, lens
 *    (period zooms) and focus (rack focus) interpolated. `fromGameplay` / `toGameplay` substitute the
 *    live gameplay pose for the first / last key, which is what makes the blend in and out seamless.
 *  - Handheld: two octaves of smooth noise, amplitude scaled by focal length (a long lens shows more
 *    shake, as it does on a real 35 mm shoulder rig).
 *  - Actors: keys collected across all shots in absolute time, so blocking carries over cuts.
 *  - Dialogue: lines without an explicit time are laid out at reading pace (≥ 1.6 s, ~0.32 s a word,
 *    plus a 0.25 s breath), which is also how long the subtitle stays up.
 */
import type { Cutscene, Shot, CamKey, ActorKey, V3, DialogueLine } from './schema';
import { lensToFov, normaliseCutscene } from './schema';
import { Performance, keysOf, type PerfWorld, type ActorFrame } from './performance';

export interface CamPose { pos: V3; look: V3; fov: number; lensMm: number; focusM: number; fStop: number; roll: number }
export interface ScheduledLine { t0: number; t1: number; ref: string; speaker: string; speakerId?: string; text: string; shot: string }
export interface TimedEvent { t: number; kind: 'cue' | 'audio' | 'card'; cue: string; data?: unknown; seconds?: number; style?: string; shot: string }

const EASE = {
  linear: (u: number) => u,
  in: (u: number) => u * u,
  out: (u: number) => 1 - (1 - u) * (1 - u),
  inOut: (u: number) => u * u * (3 - 2 * u),
  hold: () => 0,
};

export class Timeline {
  readonly shotStart: number[] = [];
  readonly duration: number;
  readonly lines: ScheduledLine[] = [];
  readonly events: TimedEvent[] = [];
  /** The shots that play: branch shots (showIf) only for the picked option, or all of them in 'all' mode (the tool). */
  readonly shots: Shot[];
  private actorKeys = new Map<string, (ActorKey & { abs: number })[]>();

  constructor(readonly scene: Cutscene, dialogue: (ref: string) => DialogueLine | null = () => null, speakerName: (id: string) => string = (s) => s,
    picks: ReadonlyMap<string, number> | 'all' = new Map(), lipsync: (ref: string) => [number, string, number][] | null = () => null) {
    normaliseCutscene(scene);
    // Unresolved branches are left out, so a scene plays straight to its choice hold; the player rebuilds
    // the timeline with the pick, which leaves every shot before the hold where it was.
    this.shots = scene.shots.filter((s) => !s.showIf || picks === 'all' || picks.get(s.showIf.choice) === s.showIf.option);
    let t = 0;
    for (const s of this.shots) { this.shotStart.push(t); t += s.durationSec; }
    this.duration = t;
    this.shots.forEach((s, i) => {
      const st = this.shotStart[i];
      let cursor = 0.3;
      for (const d of s.dialogue ?? []) {
        const ref = typeof d === 'string' ? d : d.ref;
        const line = dialogue(ref);
        const text = line?.text ?? `[${ref}]`;
        const dur = (typeof d === 'object' && d.seconds) || readingTime(text);
        const t0 = typeof d === 'object' && d.t !== undefined ? d.t : cursor;
        this.lines.push({ t0: st + t0, t1: st + Math.min(s.durationSec + 0.6, t0 + dur), ref, speaker: line ? speakerName(line.speaker) : '', speakerId: line?.speaker, text, shot: s.id });
        cursor = t0 + dur + 0.25;
      }
      for (const a of s.audio ?? []) if (typeof a === 'object') this.events.push({ t: st + a.t, kind: 'audio', cue: a.cue, shot: s.id });
      for (const c of s.cues ?? []) this.events.push({ t: st + c.t, kind: 'cue', cue: c.cue, data: c.data, shot: s.id });
      for (const c of s.cards ?? []) this.events.push({ t: st + c.t, kind: 'card', cue: c.text, seconds: c.seconds ?? 4, style: c.style ?? 'title', shot: s.id });
      for (const [id, ks] of Object.entries(s.actors ?? {})) {
        const arr = this.actorKeys.get(id) ?? [];
        for (const k of keysOf(ks)) arr.push({ ...k, abs: st + k.t });
        this.actorKeys.set(id, arr);
      }
    });
    this.events.sort((a, b) => a.t - b.t);
    for (const a of this.actorKeys.values()) a.sort((p, q) => p.abs - q.abs);
    // a line belongs to an actor when its speaker is the actor's id or the cast member they play
    const cast = scene.cast ?? {};
    this.perf = new Performance(this.shots, this.shotStart, this.lines, (id, l) => !!l.speakerId && (l.speakerId === id || l.speakerId === cast[id]?.cast), lipsync);
  }

  readonly perf: Performance;

  /** The resolved performance frame for an actor at t (null when the actor isn't on set). */
  actorFrame(id: string, t: number, world: Partial<PerfWorld> = {}): ActorFrame | null {
    const a = this.actor(id, t); if (!a) return null;
    const w: PerfWorld = { rootOf: (o, tt) => this.actor(o, tt), ...world };
    return this.perf.frame(id, t, { x: a.x, z: a.z, heading: a.heading, ...(a.y !== undefined ? { y: a.y } : {}) }, w);
  }

  shotIndexAt(t: number) { let i = 0; while (i + 1 < this.shotStart.length && t >= this.shotStart[i + 1]) i++; return i; }
  get actorIds() { return [...this.actorKeys.keys()]; }

  /** Camera pose at absolute time t. `gameplay` is the live gameplay pose for from/toGameplay shots. */
  camera(t: number, gameplay?: { pos: V3; look: V3; fov: number }): CamPose {
    const i = this.shotIndexAt(t), shot = this.shots[i], lt = Math.max(0, Math.min(shot.durationSec, t - this.shotStart[i]));
    const keys = this.keysFor(shot, i, gameplay);
    const pose = evalKeys(keys, lt);
    const hh = shot.camera?.handheld ?? 0;
    if (hh > 0) {
      const amp = hh * Math.max(0.6, pose.lensMm / 50);
      const n = (k: number, f: number) => smoothNoise(t * f + k * 17.3) * 0.65 + smoothNoise(t * f * 2.7 + k * 5.1) * 0.35;
      pose.pos = [pose.pos[0] + n(1, 0.9) * 0.025 * amp, pose.pos[1] + n(2, 1.1) * 0.02 * amp, pose.pos[2] + n(3, 0.8) * 0.025 * amp];
      pose.look = [pose.look[0] + n(4, 0.7) * 0.06 * amp, pose.look[1] + n(5, 0.9) * 0.05 * amp, pose.look[2] + n(6, 0.6) * 0.06 * amp];
      pose.roll += n(7, 0.5) * 0.6 * amp;
    }
    return pose;
  }

  private keysFor(shot: Shot, i: number, gameplay?: { pos: V3; look: V3; fov: number }): CamKey[] {
    let keys = shot.camera?.keys?.length ? shot.camera.keys.map((k) => ({ ...k })) : this.placeholder(shot);
    if (gameplay && (shot.camera?.fromGameplay || shot.camera?.toGameplay)) {
      const gk = (t: number): CamKey => ({ t, pos: gameplay.pos, look: gameplay.look, lensMm: fovLens(gameplay.fov), focusM: 6, fStop: 5.6 });
      if (shot.camera?.fromGameplay) keys = [gk(0), ...keys.filter((k) => k.t > 0)];
      if (shot.camera?.toGameplay) keys = [...keys.filter((k) => k.t < shot.durationSec), { ...gk(shot.durationSec), ease: 'inOut' }];
    }
    void i;
    return keys;
  }

  /** A shot with no layout yet: a wide static frame of the anchor so the scene still plays. */
  private placeholder(shot: Shot): CamKey[] {
    const a = this.scene.anchor ?? { x: 0, z: 0 };
    return [{ t: 0, pos: [a.x + 14, 4, a.z + 14], look: [a.x, 1.5, a.z], lensMm: shot.lensMm ?? 35 }];
  }

  actor(id: string, t: number): ActorKey | null {
    const ks = this.actorKeys.get(id); if (!ks?.length) return null;
    if (t <= ks[0].abs) return ks[0];
    for (let k = 1; k < ks.length; k++) {
      if (t < ks[k].abs) {
        const a = ks[k - 1], b = ks[k], u = (t - a.abs) / Math.max(1e-6, b.abs - a.abs);
        let dh = b.heading - a.heading; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
        const moving = Math.hypot(b.x - a.x, b.z - a.z) > 0.05;
        return { t, x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, heading: a.heading + dh * u, ...(a.y !== undefined && b.y !== undefined ? { y: a.y + (b.y - a.y) * u } : {}), anim: moving ? (a.anim ?? 'walk') : a.anim };
      }
    }
    return ks[ks.length - 1];
  }

  /** Ground speed (m/s) an actor is moving at when the scene ends: the last key segment, if it runs to the end. */
  endSpeed(id: string): number {
    const ks = this.actorKeys.get(id); if (!ks || ks.length < 2) return 0;
    const b = ks[ks.length - 1], a = ks[ks.length - 2];
    if (this.duration - b.abs > 0.05) return 0; // stopped before the end
    return Math.round(Math.hypot(b.x - a.x, b.z - a.z) / Math.max(1e-3, b.abs - a.abs) * 100) / 100;
  }

  lineAt(t: number) { return this.lines.find((l) => t >= l.t0 && t < l.t1) ?? null; }
  /** Events with t in (t0, t1]. */
  eventsBetween(t0: number, t1: number) { return this.events.filter((e) => e.t > t0 && e.t <= t1); }
}

export function readingTime(text: string) { const words = text.split(/\s+/).filter(Boolean).length; return Math.max(1.6, words * 0.32 + 0.6); }
function fovLens(fov: number) { return 12 / Math.tan((fov * Math.PI) / 360); }

function evalKeys(keys: CamKey[], t: number): CamPose {
  const last = keys[keys.length - 1];
  const mk = (k: CamKey): CamPose => ({ pos: [...k.pos] as V3, look: [...k.look] as V3, lensMm: k.lensMm ?? 35, fov: lensToFov(k.lensMm ?? 35), focusM: k.focusM ?? 10, fStop: k.fStop ?? 4, roll: k.roll ?? 0 });
  if (keys.length === 1 || t <= keys[0].t) return mk(keys[0]);
  if (t >= last.t) return mk(last);
  let i = 0; while (keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1];
  const raw = (t - a.t) / Math.max(1e-6, b.t - a.t);
  const u = EASE[b.ease ?? a.ease ?? 'inOut'](raw);
  const p0 = keys[Math.max(0, i - 1)], p3 = keys[Math.min(keys.length - 1, i + 2)];
  const cr = (q: (k: CamKey) => V3): V3 => [0, 1, 2].map((c) => catmull(q(p0)[c], q(a)[c], q(b)[c], q(p3)[c], u)) as V3;
  const lens = lerp(a.lensMm ?? 35, b.lensMm ?? a.lensMm ?? 35, u);
  return { pos: cr((k) => k.pos), look: cr((k) => k.look), lensMm: lens, fov: lensToFov(lens), focusM: lerp(a.focusM ?? 10, b.focusM ?? a.focusM ?? 10, u), fStop: lerp(a.fStop ?? 4, b.fStop ?? a.fStop ?? 4, u), roll: lerp(a.roll ?? 0, b.roll ?? 0, u) };
}
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
function catmull(p0: number, p1: number, p2: number, p3: number, u: number) {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}
/** Smooth 1D value noise in [-1, 1]. */
function smoothNoise(x: number) {
  const i = Math.floor(x), f = x - i, h = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
