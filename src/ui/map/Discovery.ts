/**
 * Map discovery (FEATURE_AUDIT "Map discovery", a user requirement).
 *  - The map starts with streets, the active lead's home and mission markers only.
 *  - Places are revealed through the channels each place accepts: sight (walking or driving past
 *    something visible from the street), entering, a tip, an overheard line, a newspaper ad, a call,
 *    a business card, a mission.
 *  - Shady places (fences, chop shop, card games, numbers drops, gun sellers) never reveal by sight.
 *  - Collectibles are not in the catalogue at all; gameplay adds them when found (addFound()).
 *  - A revealed place carries a "new" mark until the player looks at it on the map.
 *  - State serialises into the save's ui.discovery section (ENGINE_REQUESTS ui 2).
 * Pure logic (no DOM), unit-tested in tests/ui-discovery.test.ts.
 */
import type { Place, RevealVia } from './places';

export interface DiscoveryEntry { at: number; via: RevealVia; seen: boolean }
export type DiscoveryState = Record<string, DiscoveryEntry>;
export interface RevealEvent { place: Place; via: RevealVia }

const CELL = 100; // m, spatial hash for sight checks

export class Discovery {
  private byId = new Map<string, Place>();
  private grid = new Map<string, Place[]>();
  private state: DiscoveryState = {};
  private listeners = new Set<(e: RevealEvent) => void>();
  /** Game clock in minutes since the campaign started; the host sets it so entries record when. */
  now = 0;
  /** Sight checks are skipped when the player moved less than this since the last check. */
  private last = { x: NaN, z: NaN };

  constructor(places: Place[]) { for (const p of places) this.add(p); }

  private add(p: Place) {
    this.byId.set(p.id, p);
    if (!p.reveal.includes('sight') || p.shady || !p.sightM) return;
    const k = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
    const a = this.grid.get(k) ?? []; a.push(p); this.grid.set(k, a);
  }

  on(cb: (e: RevealEvent) => void) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  place(id: string) { return this.byId.get(id); }
  get all(): Iterable<Place> { return this.byId.values(); }
  isKnown(id: string) { return id in this.state; }
  isNew(id: string) { const e = this.state[id]; return !!e && !e.seen; }
  entry(id: string): DiscoveryEntry | undefined { return this.state[id]; }
  /** Known places (optionally only one lead's homes are 'yours'; others stay hidden until met). */
  known(): Place[] { const out: Place[] = []; for (const id in this.state) { const p = this.byId.get(id); if (p) out.push(p); } return out; }
  get counts() { let known = 0, fresh = 0; for (const id in this.state) { known++; if (!this.state[id].seen) fresh++; } return { known, fresh, total: this.byId.size }; }

  /** New-game state: reveal 'start' places (lead homes) for the given leads. */
  start(leads: string[]) {
    for (const p of this.byId.values()) if (p.reveal.includes('start') && (!p.lead || leads.includes(p.lead))) this.reveal(p.id, 'start', true);
  }

  /**
   * Reveal through a channel. Returns false when the place doesn't accept that channel (for
   * example a fence by sight) or is already known. 'mission' is always accepted: story wins.
   */
  reveal(id: string, via: RevealVia, quiet = false): boolean {
    const p = this.byId.get(id);
    if (!p || id in this.state) return false;
    if (via !== 'mission' && !p.reveal.includes(via)) return false;
    if (via === 'sight' && p.shady) return false;
    this.state[id] = { at: this.now, via, seen: quiet };
    if (!quiet) for (const l of this.listeners) l({ place: p, via });
    return true;
  }

  /** Gameplay found something not in the catalogue (a collectible, a stash): add and reveal it. */
  addFound(p: Place) { if (!this.byId.has(p.id)) this.add(p); return this.reveal(p.id, 'mission'); }

  /** Sight check around the player; call a few times a second. Cost: one 3x3 cell lookup. */
  tick(x: number, z: number): number {
    if (Math.abs(x - this.last.x) < 2 && Math.abs(z - this.last.z) < 2) return 0;
    this.last = { x, z };
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let n = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const cell = this.grid.get(`${cx + i},${cz + j}`); if (!cell) continue;
      for (const p of cell) if (!(p.id in this.state) && Math.hypot(p.x - x, p.z - z) <= p.sightM!) { if (this.reveal(p.id, 'sight')) n++; }
    }
    return n;
  }

  /** The player looked at these on the map: drop their "new" marks. */
  markSeen(ids: Iterable<string>) { for (const id of ids) { const e = this.state[id]; if (e) e.seen = true; } }
  markAllSeen() { for (const id in this.state) this.state[id].seen = true; }

  serialize(): DiscoveryState { return JSON.parse(JSON.stringify(this.state)); }
  deserialize(s: DiscoveryState | undefined) {
    this.state = {};
    if (!s) return;
    for (const [id, e] of Object.entries(s)) if (e && typeof e.at === 'number') this.state[id] = { at: e.at, via: e.via, seen: !!e.seen };
    this.last = { x: NaN, z: NaN };
  }
}
