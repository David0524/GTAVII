/**
 * Game-facing save API. Collects state from providers (party/player now; clock, weather and narrative
 * state as those systems land), writes via a SaveStore, autosaves on a cadence and when the page is
 * backgrounded (mobile browsers kill background tabs), and exports/imports checksummed files.
 * Settings are NOT here: they are per-device (src/settings); saves are per-profile.
 */
import { SAVE_VERSION, migrate, toFile, fromFile, type SaveData } from './schema';
import { AUTO_SLOTS, MemorySaveStore, type Profile, type SaveStore, type SlotMeta } from './SaveStore';
import { IdbSaveStore } from './IdbSaveStore';

export interface SaveProviders {
  /** Snapshot of the current game state (without version/savedAt/label, which the manager fills). */
  snapshot(): Omit<SaveData, 'version' | 'savedAt' | 'build' | 'label' | 'playtimeSec'>;
  /** Human label for the slot list, e.g. the nearest intersection + in-game date/time. */
  label(): string;
  /** Apply a loaded save to the running game. */
  apply(save: SaveData): void;
}

const LAST_PROFILE_KEY = 't74.lastProfile';
const BUILD = `${import.meta.env?.MODE ?? 'dev'}`;

export class SaveManager {
  profile!: Profile;
  private autoIndex = 0;
  private playtime = 0;
  private lastAuto = 0;
  autosaveEverySec = 90;
  persisted: boolean | null = null;
  onSaved = new Set<(meta: SlotMeta, kind: 'manual' | 'auto') => void>();

  private constructor(readonly store: SaveStore, private p: SaveProviders) {}

  static async create(p: SaveProviders): Promise<SaveManager> {
    let store: SaveStore;
    try { store = await IdbSaveStore.open(); } catch { store = new MemorySaveStore(); }
    const m = new SaveManager(store, p);
    // Ask the browser not to evict our storage under pressure (granted silently for installed PWAs,
    // engaged sites, or bookmarked ones depending on the browser).
    try { m.persisted = (await navigator.storage?.persist?.()) ?? null; } catch { m.persisted = null; }
    const profiles = await store.listProfiles();
    let last: string | null = null;
    try { last = localStorage.getItem(LAST_PROFILE_KEY); } catch { /* ignore */ }
    m.profile = profiles.find((x) => x.id === last) ?? profiles[0] ?? (await store.createProfile('Player 1'));
    m.rememberProfile();
    const slots = await store.listSlots(m.profile.id);
    const autos = slots.filter((s) => s.slot.startsWith('auto-')).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    if (autos[0]) m.autoIndex = parseInt(autos[0].slot.slice(5)) % AUTO_SLOTS;
    m.installLifecycleHooks();
    return m;
  }

  private rememberProfile() { try { localStorage.setItem(LAST_PROFILE_KEY, this.profile.id); } catch { /* ignore */ } }
  async switchProfile(id: string) { const p = (await this.store.listProfiles()).find((x) => x.id === id); if (p) { this.profile = p; this.rememberProfile(); } }

  tick(dt: number) {
    this.playtime += dt;
    this.lastAuto += dt;
    if (this.lastAuto >= this.autosaveEverySec) { this.lastAuto = 0; void this.autosave('interval'); }
  }

  private build(): SaveData {
    return { version: SAVE_VERSION, savedAt: new Date().toISOString(), build: BUILD, playtimeSec: Math.round(this.playtime), label: this.p.label(), ...this.p.snapshot() } as SaveData;
  }

  async save(slot: string): Promise<SlotMeta> {
    const meta = await this.store.write(this.profile.id, slot, this.build());
    await this.store.touchProfile(this.profile.id);
    for (const cb of this.onSaved) cb(meta, 'manual');
    return meta;
  }

  /** Rotating autosave ring (auto-1..auto-N): a bad autosave can never wipe the only good one. */
  async autosave(reason: string): Promise<SlotMeta | null> {
    try {
      this.autoIndex = (this.autoIndex % AUTO_SLOTS) + 1;
      const meta = await this.store.write(this.profile.id, `auto-${this.autoIndex}`, this.build());
      for (const cb of this.onSaved) cb(meta, 'auto');
      void reason;
      return meta;
    } catch (e) { console.warn('autosave failed', e); return null; }
  }

  async load(slot: string): Promise<SaveData | null> {
    const raw = await this.store.read(this.profile.id, slot);
    if (!raw) return null;
    const data = migrate(raw);
    this.playtime = data.playtimeSec;
    this.p.apply(data);
    return data;
  }

  /** Most recent save of any kind in this profile (Continue). */
  async latest(): Promise<SlotMeta | null> {
    const slots = await this.store.listSlots(this.profile.id);
    return slots.sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0] ?? null;
  }

  async exportSlot(slot: string): Promise<{ name: string; text: string } | null> {
    const raw = await this.store.read(this.profile.id, slot);
    if (!raw) return null;
    const data = migrate(raw);
    return { name: `tenderloin74-${this.profile.name.replace(/\W+/g, '_')}-${slot}-${data.savedAt.slice(0, 10)}.t74save.json`, text: await toFile(data) };
  }

  /** Import a save file into a manual slot (validated, checksum-verified, migrated). */
  async importToSlot(text: string, slot: string): Promise<SlotMeta> {
    const data = await fromFile(text);
    return this.store.write(this.profile.id, slot, data);
  }

  private installLifecycleHooks() {
    // Mobile browsers freeze/kill hidden tabs: save as soon as we're hidden. IndexedDB writes started in
    // visibilitychange normally complete; pagehide is a last chance on navigation.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void this.autosave('hidden'); });
    window.addEventListener('pagehide', () => { void this.autosave('pagehide'); });
  }
}

/** Download text as a file (export). */
export function downloadText(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------------------------------------------------------- iOS storage eviction notice
/**
 * iOS Safari (and every iOS browser, all WebKit) deletes a site's storage after ~7 days without a visit
 * unless the site is installed to the Home Screen. Detect "iOS, not installed" so the UI can show a
 * gentle, dismissible, in-world note, and a stronger reminder after a long absence.
 */
export function iosEvictionRisk(): { atRisk: boolean; daysSinceLastVisit: number | null } {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
  let days: number | null = null;
  try {
    const last = localStorage.getItem('t74.lastVisit');
    if (last) days = (Date.now() - Date.parse(last)) / 86400000;
    localStorage.setItem('t74.lastVisit', new Date().toISOString());
  } catch { /* ignore */ }
  return { atRisk: ios && !standalone, daysSinceLastVisit: days };
}
