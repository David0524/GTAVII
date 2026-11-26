/**
 * Display names for real landmarks (user decision: brand and trademarked names get genre-style renames,
 * picked by the user, stored by narrative in content/landmarks.json). Every UI label for a landmark goes
 * through here, so the swap is instant when the file lands; until then the current names show.
 *
 * Expected shape (any of `real` / `aliases` / `id` may match what world.json or places.json carry):
 *   { "landmarks": [ { "id": "lm.met_life", "real": "Metropolitan Life Insurance Company Tower",
 *                      "aliases": ["Met Life Tower"], "name": "<display name>", "short": "<map label>" } ] }
 */
export interface LandmarkEntry { id?: string; real?: string; aliases?: string[]; name: string; short?: string }

/** Abbreviations for landmarks that keep their real name (not renamed by the registry). */
const FALLBACK_SHORT: Record<string, string> = { 'Flatiron Building': 'Flatiron Bldg.' };

export class Landmarks {
  private byKey = new Map<string, LandmarkEntry>();
  constructor(entries: LandmarkEntry[] = []) {
    for (const e of entries) for (const k of [e.id, e.real, ...(e.aliases ?? [])]) if (k) this.byKey.set(norm(k), e);
  }
  get size() { return new Set(this.byKey.values()).size; }
  /** Full display name ("location reveal" style). */
  name(key: string): string { return this.byKey.get(norm(key))?.name ?? key; }
  /** Short label for maps; falls back to the full display name, then the legacy abbreviations. */
  short(key: string): string {
    const e = this.byKey.get(norm(key));
    if (e) return e.short ?? e.name;
    return FALLBACK_SHORT[key] ?? key;
  }
}
const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
