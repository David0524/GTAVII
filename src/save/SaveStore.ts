/**
 * Storage abstraction for saves. Game code only talks to SaveStore, so a cloud backend (accounts /
 * sync: a later milestone pending the user's go-ahead) can be added without touching gameplay.
 *
 *   profiles : a few per device ("who is playing"), each with manual slots + rotating autosaves
 *   slots    : 'manual-1'..'manual-N', 'auto-1'..'auto-3' (autosave ring), 'quick'
 */
import type { SaveData } from './schema';

export interface Profile { id: string; name: string; createdAt: string; lastPlayedAt: string }
export interface SlotMeta { slot: string; label: string; savedAt: string; playtimeSec: number; version: number; bytes: number }

export interface SaveStore {
  readonly kind: 'indexeddb' | 'memory' | 'cloud';
  listProfiles(): Promise<Profile[]>;
  createProfile(name: string): Promise<Profile>;
  renameProfile(id: string, name: string): Promise<void>;
  deleteProfile(id: string): Promise<void>;
  touchProfile(id: string): Promise<void>;
  listSlots(profileId: string): Promise<SlotMeta[]>;
  /** Raw stored object (not yet migrated); SaveManager migrates. */
  read(profileId: string, slot: string): Promise<unknown | null>;
  /** Atomic: either the new save is fully committed and visible, or the previous one remains. */
  write(profileId: string, slot: string, data: SaveData): Promise<SlotMeta>;
  deleteSlot(profileId: string, slot: string): Promise<void>;
}

export const MANUAL_SLOTS = 6;
export const AUTO_SLOTS = 3;

export function newId(prefix: string) {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${Date.now().toString(36)}${r[0].toString(36)}${r[1].toString(36)}`.slice(0, 32);
}

/** In-memory store: fallback when IndexedDB is unavailable (private mode) and for tests. */
export class MemorySaveStore implements SaveStore {
  readonly kind = 'memory' as const;
  private profiles = new Map<string, Profile>();
  private slots = new Map<string, { meta: SlotMeta; json: string }>();
  async listProfiles() { return [...this.profiles.values()].sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt)); }
  async createProfile(name: string) { const now = new Date().toISOString(); const p = { id: newId('p'), name, createdAt: now, lastPlayedAt: now }; this.profiles.set(p.id, p); return p; }
  async renameProfile(id: string, name: string) { const p = this.profiles.get(id); if (p) p.name = name; }
  async deleteProfile(id: string) { this.profiles.delete(id); for (const k of [...this.slots.keys()]) if (k.startsWith(id + '/')) this.slots.delete(k); }
  async touchProfile(id: string) { const p = this.profiles.get(id); if (p) p.lastPlayedAt = new Date().toISOString(); }
  async listSlots(profileId: string) { return [...this.slots.entries()].filter(([k]) => k.startsWith(profileId + '/')).map(([, v]) => v.meta); }
  async read(profileId: string, slot: string) { const s = this.slots.get(`${profileId}/${slot}`); return s ? JSON.parse(s.json) : null; }
  async write(profileId: string, slot: string, data: SaveData) {
    const json = JSON.stringify(data);
    const meta: SlotMeta = { slot, label: data.label, savedAt: data.savedAt, playtimeSec: data.playtimeSec, version: data.version, bytes: json.length };
    this.slots.set(`${profileId}/${slot}`, { meta, json });
    return meta;
  }
  async deleteSlot(profileId: string, slot: string) { this.slots.delete(`${profileId}/${slot}`); }
}
