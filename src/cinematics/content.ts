/**
 * Loads cutscenes, dialogue and cast names from content/ (narrative's folder; cutscene layout is
 * written by the ?cine=1 tool). Vite bundles them lazily, so unused scenes cost nothing.
 */
import type { Cutscene, DialogueLine } from './schema';

const SCENES = import.meta.glob<Cutscene>('/content/cutscenes/*.json', { import: 'default' });
const DIALOGUE = import.meta.glob<{ id: string; lines: DialogueLine[] }>('/content/dialogue/*.json', { import: 'default' });
const CAST = import.meta.glob<{ id: string; name: string }[]>('/content/cast/*.json', { import: 'default', eager: true });

export function cutsceneIds(): string[] { return Object.keys(SCENES).map((p) => p.replace(/^.*\/(.*)\.json$/, '$1')); }
export function hasCutscene(id: string) { return `/content/cutscenes/${id}.json` in SCENES; }

export async function loadCutscene(id: string): Promise<{ scene: Cutscene; dialogue: (ref: string) => DialogueLine | null; speaker: (castId: string) => string }> {
  const load = SCENES[`/content/cutscenes/${id}.json`];
  if (!load) throw new Error(`no cutscene ${id}`);
  const scene = structuredClone(await load());
  const scripts = new Set<string>();
  for (const s of scene.shots) for (const d of s.dialogue ?? []) scripts.add((typeof d === 'string' ? d : d.ref).split('#')[0]);
  const lines = new Map<string, DialogueLine>();
  for (const sid of scripts) {
    const f = DIALOGUE[`/content/dialogue/${sid.replace(/^dlg\./, '')}.json`];
    if (!f) continue;
    const doc = await f();
    for (const l of doc.lines ?? []) if (l.text) lines.set(`${doc.id}#${l.id}`, l);
  }
  return { scene, dialogue: (ref) => lines.get(ref) ?? null, speaker: speakerName };
}

const NAMES = new Map<string, string>();
for (const list of Object.values(CAST)) for (const c of Array.isArray(list) ? list : []) NAMES.set(c.id, c.name);
/** Subtitle speaker label: the name people call them ("Teddy", "Mayhew"). */
export function speakerName(castId: string) {
  const n = NAMES.get(castId); if (!n) return castId.replace(/^char\./, '').split('_')[0].toUpperCase();
  const nick = n.match(/[“"](.+?)[”"]/); if (nick) return nick[1];
  const parts = n.replace(/^(Sgt|Lt|Det|Mr|Mrs|Ms|Dr)\.?\s+/, '').split(' ');
  return /^(Sgt|Lt|Det)\./.test(n) ? parts[parts.length - 1] : parts[0];
}
