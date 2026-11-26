/**
 * Versioned save schema. RULES (saves must survive every game update):
 *  1. Never change the meaning of an existing field in place. Add a new version instead.
 *  2. Each version bump adds one entry to MIGRATIONS (vN -> vN+1) and a fixture file
 *     tests/save-fixtures/vN.json (a real save of that version); the test suite loads every fixture.
 *  3. migrate() runs on every load and import, so old saves upgrade transparently.
 */
export const SAVE_VERSION = 2;

export interface LeadSave {
  money: number;
  inventory: string[];
  wardrobe: string;
  at: { x: number; y: number; z: number; heading: number };
}

export interface SaveV1 {
  version: 1;
  savedAt: string; // ISO
  build: string; // game build id at save time (informational)
  playtimeSec: number;
  label: string; // shown in the slot list, e.g. "W 31st St & Broadway — Fri Jun 21, 8:14 PM"
  world: { date: string; minutes: number; weather: 'clear' | 'overcast' | 'rain' };
  party: { activeCharacter: string; characters: Record<string, LeadSave> };
  narrative: {
    act: number;
    flags: Record<string, boolean | number | string>;
    missions: Record<string, 'locked' | 'available' | 'active' | 'done' | 'failed'>;
    relationships: Record<string, number>;
  };
}

/**
 * v2: adds `sections`: independently versioned blocks owned by workstreams (ui, gameplay, economy,
 * ...). Each owner registers its section (version + migrations + validate) with registerSection();
 * the engine never edits another stream's section shape. Unknown sections are preserved verbatim, so a
 * save written by a newer build with an extra stream's data round-trips through an older build.
 */
export interface SectionBlob { v: number; data: unknown }
export interface SaveV2 extends Omit<SaveV1, 'version'> {
  version: 2;
  sections: Record<string, SectionBlob>;
}

export type SaveData = SaveV2; // the current version

export interface SectionDef<T = unknown> {
  name: string;           // e.g. 'ui', 'gameplay', 'economy'
  version: number;        // current version of this section's shape
  migrations: Record<number, (data: any) => any>; // vN -> vN+1
  validate?: (data: T) => void; // throw SaveFormatError on bad data
  empty: () => T;          // value for saves that predate the section
}
const SECTIONS = new Map<string, SectionDef>();
export function registerSection<T>(def: SectionDef<T>) { SECTIONS.set(def.name, def as SectionDef); }
export function registeredSections() { return [...SECTIONS.values()]; }

/** Bring every registered section to its current version (missing -> empty()). Unknown sections are kept. */
export function migrateSections(sections: Record<string, SectionBlob>): Record<string, SectionBlob> {
  const out: Record<string, SectionBlob> = { ...sections };
  for (const def of SECTIONS.values()) {
    let blob = out[def.name] ?? { v: def.version, data: def.empty() };
    if (blob.v > def.version) throw new SaveFormatError(`section '${def.name}' is from a newer game version`);
    while (blob.v < def.version) {
      const step = def.migrations[blob.v];
      if (!step) throw new SaveFormatError(`no migration for section '${def.name}' v${blob.v}`);
      blob = { v: blob.v + 1, data: step(blob.data) };
    }
    def.validate?.(blob.data);
    out[def.name] = blob;
  }
  return out;
}

/** vN -> vN+1 upgrade functions (input is the raw object of version N). */
export const MIGRATIONS: Record<number, (s: any) => any> = {
  1: (s) => ({ ...s, version: 2, sections: {} }),
};

export class SaveFormatError extends Error {}

export function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') throw new SaveFormatError('save is not an object');
  let s = raw as { version?: number };
  if (typeof s.version !== 'number' || s.version < 1) throw new SaveFormatError('save has no version');
  if (s.version > SAVE_VERSION) throw new SaveFormatError(`save is from a newer game version (v${s.version}); update the game`);
  while (s.version! < SAVE_VERSION) {
    const step = MIGRATIONS[s.version!];
    if (!step) throw new SaveFormatError(`no migration from v${s.version}`);
    s = step(s);
  }
  const out = s as SaveData;
  out.sections = migrateSections(out.sections ?? {});
  validate(out);
  return out;
}

/** Structural validation of the current version; throws SaveFormatError with a precise path. */
export function validate(s: SaveData): void {
  const fail = (p: string) => { throw new SaveFormatError(`invalid save: ${p}`); };
  if (s.version !== SAVE_VERSION) fail('version');
  if (typeof s.savedAt !== 'string') fail('savedAt');
  if (typeof s.playtimeSec !== 'number') fail('playtimeSec');
  if (!s.world || !/^\d{4}-\d{2}-\d{2}$/.test(s.world.date) || typeof s.world.minutes !== 'number') fail('world');
  if (!s.party || typeof s.party.activeCharacter !== 'string' || !s.party.characters) fail('party');
  if (!(s.party.activeCharacter in s.party.characters)) fail('party.activeCharacter not in characters');
  for (const [id, c] of Object.entries(s.party.characters)) {
    if (typeof c.money !== 'number' || !Array.isArray(c.inventory) || !c.at || ![c.at.x, c.at.y, c.at.z, c.at.heading].every(Number.isFinite)) fail(`party.characters.${id}`);
  }
  if (!s.narrative || typeof s.narrative.act !== 'number' || typeof s.narrative.flags !== 'object') fail('narrative');
  if (!s.sections || typeof s.sections !== 'object') fail('sections');
  for (const [k, b] of Object.entries(s.sections)) if (!b || typeof b.v !== 'number') fail(`sections.${k}`);
}

// ---------------------------------------------------------------- portable file format (export/import)
export interface SaveFile { format: 't74-save'; version: number; sha256: string; data: SaveData }

/** Canonical JSON (sorted keys) so checksums are stable across engines. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function toFile(data: SaveData): Promise<string> {
  const file: SaveFile = { format: 't74-save', version: data.version, sha256: await sha256(canonical(data)), data };
  return JSON.stringify(file, null, 1);
}

export async function fromFile(text: string): Promise<SaveData> {
  let f: SaveFile;
  try { f = JSON.parse(text); } catch { throw new SaveFormatError('not a save file (bad JSON)'); }
  if (f?.format !== 't74-save' || !f.data) throw new SaveFormatError('not a Tenderloin \'74 save file');
  if ((await sha256(canonical(f.data))) !== f.sha256) throw new SaveFormatError('save file is damaged or was edited (checksum mismatch)');
  return migrate(f.data);
}
