/**
 * Mission and trigger runtime, engine Phase 7 (NARRATIVE_BRIEF "engine contract"; docs/HANDOFF_WIRING.md step 6).
 * Pure logic: everything engine-side comes in through MissionHost, so it runs headless in tests.
 *
 *  - Availability: a mission is available when `requires` holds (flags, notFlags, act, date range, time window).
 *    Status per mission lives in the narrative save state (locked | available | active | done | failed).
 *  - Start: 'talk' → the giver stands at start.at and is talkable (gameplay.bindTalk); 'auto' → walking within 40 m
 *    of start.at; 'enter_interior' → being inside that interior.
 *  - Objectives, in order. Playable now: goto, dialogue (lines + choices + setFlags), enter_interior, wait, switch_to,
 *    enter_vehicle; deliver/follow/escort/chase/evade complete on reaching their destination when they name one.
 *    combat and photo are NOT playable yet: they complete after a short notice, so a mission can be walked
 *    end to end (honest placeholder, `skipped` in missionLines).
 *  - Fail: wasted / arrested (gameplay events) → failed card, retry from the last checkpoint objective.
 *  - End: rewards (money, setFlags, unlock), gameplay missionLines → UI missionEnd card; `discover` for the mission's
 *    places with notify from the place's content (silent by default) and mission = id.
 */
import type { Places, PlaceRec } from './places';

export interface MissionDef {
  id: string; title: string; number?: number; act?: number; playAs?: string; giver?: string;
  requires?: { flags?: string[]; notFlags?: string[]; act?: number; timeWindow?: [string, string]; dateRange?: [string, string] };
  start: { type: 'talk' | 'auto' | 'enter_interior'; who?: string; at?: string; marker?: string };
  objectives: Objective[];
  checkpoints?: string[];
  rewards?: { money?: number; setFlags?: string[]; unlock?: string[] };
  locations?: string[];
}
export interface Objective { id: string; type: string; text?: string; to?: string; at?: string; radius?: number; script?: string; marker?: string; until?: string; target?: string; who?: string }
export interface DialogueLine { id: string; speaker?: string; emotion?: string; text?: string; if?: string; choices?: { text: string; goto?: string; setFlags?: string[] }[] }
export type Status = 'locked' | 'available' | 'active' | 'done' | 'failed';
export interface NarrativeState { act: number; flags: Record<string, boolean>; missions: Record<string, Status | string>; relationships: Record<string, number> }

export interface MissionHost {
  player(): { x: number; z: number; lead: string; inCar: boolean; interior: string | null };
  clock(): { minutes: number; date: string };
  state(): NarrativeState;
  loadDialogue(id: string): Promise<{ lines: DialogueLine[] } | null>;
  /** play one line (audio + subtitle); resolves when heard and readable */
  say(line: DialogueLine, script: string): Promise<void>;
  choose(prompt: string | undefined, choices: { id: string; text: string }[]): Promise<string>;
  objective(o: { text: string; target?: { x: number; z: number; label?: string }; mission?: string } | null): void;
  notify(text: string): void;
  discover(placeId: string, notify: 'silent' | 'toast', mission: string): void;
  missionEnd(e: { result: 'passed' | 'failed'; title: string; reason?: string; cash?: number; lines?: { label: string; value: string }[] }): void;
  addMoney(cents: number): void;
  /** skip the clock forward to HH:MM (a fade, as in "Wait until 21:30") */
  waitTo?(hhmm: string): void;
  missionBegin?(id: string): void;
  missionLines?(): { label: string; value: string }[];
  /** giver standing at a place, talkable; returns a remover */
  placeGiver?(castId: string, x: number, z: number): () => void;
}

const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return (h % 24) * 60 + (m || 0); };
const inWindow = (min: number, w: [string, string]) => { const a = hm(w[0]), b = hm(w[1]); return a <= b ? min >= a && min < b : min >= a || min < b; };
const PLACEHOLDER = new Set(['combat', 'photo']);

export class MissionRuntime {
  active: { def: MissionDef; idx: number; t: number; busy: boolean; skipped: number } | null = null;
  private givers = new Map<string, { remove: () => void; x: number; z: number }>();
  private interiorsById: Map<string, { address: string; kind?: string }>;
  checkT = 0;

  constructor(private host: MissionHost, private places: Places, readonly missions: Map<string, MissionDef>, interiors: { id: string; address: string; kind?: string }[], private placeRecs: Map<string, PlaceRec>) {
    this.interiorsById = new Map(interiors.map((i) => [i.id, i]));
  }

  status(id: string): Status {
    const s = this.host.state().missions[id] as Status | undefined;
    if (s === 'done' || s === 'active' || s === 'failed') return s;
    return this.requirementsMet(this.missions.get(id)!) ? 'available' : 'locked';
  }

  requirementsMet(m: MissionDef): boolean {
    const st = this.host.state(), r = m.requires ?? {}, c = this.host.clock();
    if ((r.flags ?? []).some((f) => !st.flags[f])) return false;
    if ((r.notFlags ?? []).some((f) => st.flags[f])) return false;
    if (r.act !== undefined && st.act < r.act) return false;
    if (r.dateRange && (c.date < r.dateRange[0] || c.date > r.dateRange[1])) return false;
    if (r.timeWindow && !inWindow(c.minutes, r.timeWindow)) return false;
    return true;
  }

  private where(ref?: string) { return ref ? this.places.resolve(this.interiorsById.get(ref)?.address ?? ref) : null; }

  /** Givers to show and talk to (gameplay.bindTalk). */
  nearestTalkable(x: number, z: number, r: number) {
    let best: { id: string; name: string; x: number; z: number } | null = null, bd = r;
    for (const [id, g] of this.givers) { const d = Math.hypot(g.x - x, g.z - z); if (d < bd) { bd = d; best = { id, name: this.missions.get(id)?.title ?? id, x: g.x, z: g.z }; } }
    return best;
  }
  talk(missionId: string) { const m = this.missions.get(missionId); if (m && !this.active && this.status(m.id) === 'available') this.begin(m); }

  /** Each frame (cheap; the availability scan runs twice a second). */
  update(dt: number) {
    const p = this.host.player();
    if (this.active) { this.tick(dt, p); return; }
    if ((this.checkT -= dt) > 0) return; this.checkT = 0.5;
    for (const m of this.missions.values()) {
      const st = this.status(m.id);
      const at = this.where(m.start.at ?? m.start.marker);
      const giver = this.givers.get(m.id);
      if (st !== 'available' || !at) { if (giver) { giver.remove(); this.givers.delete(m.id); } continue; }
      const d = Math.hypot(at.x - p.x, at.z - p.z);
      if (m.playAs && m.playAs !== p.lead) continue;
      if (m.start.type === 'talk') {
        if (d < 150 && !giver && this.host.placeGiver && m.start.who) this.givers.set(m.id, { remove: this.host.placeGiver(m.start.who, at.x, at.z), x: at.x, z: at.z });
        else if (d > 220 && giver) { giver.remove(); this.givers.delete(m.id); }
      } else if (m.start.type === 'auto' && d < 40) { this.begin(m); return; }
      else if (m.start.type === 'enter_interior' && p.interior && d < 60) { this.begin(m); return; }
    }
  }

  begin(m: MissionDef, fromObjective = 0) {
    const g = this.givers.get(m.id); if (g) { g.remove(); this.givers.delete(m.id); }
    this.host.state().missions[m.id] = 'active';
    this.active = { def: m, idx: fromObjective, t: 0, busy: false, skipped: 0 };
    this.host.missionBegin?.(m.id);
    for (const loc of m.locations ?? []) {
      const rec = this.placeRecs.get(loc); if (!rec) continue;
      this.host.discover(loc, rec.discovery?.notify ?? 'silent', m.id);
    }
    this.enter();
  }

  private current() { const a = this.active!; return a.def.objectives[a.idx]; }

  /** Set up the current objective (HUD line, target). */
  private enter() {
    const a = this.active!, o = this.current();
    if (!o) { this.finish(true); return; }
    a.t = 0;
    const tgt = this.where(o.to ?? o.at ?? o.marker);
    this.host.objective({ text: o.text ?? '', target: tgt ? { x: tgt.x, z: tgt.z, label: tgt.name } : undefined, mission: a.def.id });
    if (o.type === 'dialogue' && o.script) { a.busy = true; void this.runDialogue(o.script).then(() => { a.busy = false; this.next(); }); }
    if (PLACEHOLDER.has(o.type) && !tgt) this.host.notify(`(${o.type} scene not playable yet: skipped)`);
  }

  private next() { const a = this.active; if (!a) return; a.idx++; this.enter(); }

  private tick(dt: number, p: ReturnType<MissionHost['player']>) {
    const a = this.active!, o = this.current(); if (!o || a.busy) return;
    a.t += dt;
    const tgt = this.where(o.to ?? o.at ?? o.marker), near = (r: number) => !!tgt && Math.hypot(tgt.x - p.x, tgt.z - p.z) < r;
    let done = false;
    switch (o.type) {
      case 'goto': done = near(o.radius ?? 15); break;
      case 'enter_interior': done = !!p.interior && (!tgt || near(60)); break;
      case 'wait':
        if (o.until && a.t > 2 && this.host.waitTo && !inWindow(this.host.clock().minutes, [o.until, o.until])) this.host.waitTo(o.until);
        done = !o.until || inWindow(this.host.clock().minutes, [o.until, o.until.replace(/:(\d\d)$/, (_m, mm) => `:${String(Math.min(59, +mm + 30)).padStart(2, '0')}`)]); break;
      case 'switch_to': done = !o.target || p.lead === o.target; break;
      case 'enter_vehicle': done = p.inCar; break;
      case 'deliver': case 'follow': case 'escort': case 'chase': case 'evade': done = tgt ? near(o.radius ?? 20) : a.t > 3; break;
      default:
        if (PLACEHOLDER.has(o.type)) { done = tgt ? near(o.radius ?? 25) : a.t > 3; if (done) a.skipped++; }
        else done = a.t > 3; // unknown type: never hard-block a mission
    }
    if (done) this.next();
  }

  private async runDialogue(script: string) {
    const d = await this.host.loadDialogue(script); if (!d) { this.host.notify(`(missing dialogue ${script})`); return; }
    const st = this.host.state(), byId = new Map(d.lines.map((l, i) => [l.id, i]));
    for (let i = 0; i < d.lines.length; i++) {
      const l = d.lines[i];
      if (l.if && !st.flags[l.if]) continue;
      if (l.choices?.length) {
        const pick = await this.host.choose(undefined, l.choices.map((c, k) => ({ id: String(k), text: c.text })));
        const c = l.choices[+pick] ?? l.choices[0];
        for (const f of c.setFlags ?? []) st.flags[f] = true;
        if (c.goto && byId.has(c.goto)) i = byId.get(c.goto)! - 1;
        continue;
      }
      if (l.text) await this.host.say(l, script);
    }
  }

  /** gameplay events: 'wasted' | 'arrested' */
  fail(reason: string) {
    const a = this.active; if (!a) return;
    const cps = a.def.checkpoints ?? [], reached = a.def.objectives.slice(0, a.idx + 1).map((o) => o.id).filter((id) => cps.includes(id));
    this.host.state().missions[a.def.id] = 'available';
    this.host.missionEnd({ result: 'failed', title: a.def.title, reason, lines: this.host.missionLines?.() });
    this.host.objective(null);
    const cp = reached.at(-1);
    this.active = null;
    // retry from the last checkpoint reached (the player chooses to start it again by walking back to it; MVP: restart there)
    if (cp) { const idx = a.def.objectives.findIndex((o) => o.id === cp); this.resumeAt = { id: a.def.id, idx }; }
  }
  resumeAt: { id: string; idx: number } | null = null;

  private finish(passed: boolean) {
    const a = this.active!, r = a.def.rewards ?? {}, st = this.host.state();
    st.missions[a.def.id] = 'done';
    for (const f of r.setFlags ?? []) st.flags[f] = true;
    if (r.money) this.host.addMoney(r.money * 100);
    const lines = [...(this.host.missionLines?.() ?? [])];
    if (a.skipped) lines.push({ label: 'Not yet playable', value: `${a.skipped} scene${a.skipped > 1 ? 's' : ''} skipped` });
    this.host.missionEnd({ result: passed ? 'passed' : 'failed', title: a.def.title, cash: r.money ? r.money * 100 : undefined, lines });
    this.host.objective(null);
    this.active = null;
  }
}
