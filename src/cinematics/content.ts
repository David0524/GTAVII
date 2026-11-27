/**
 * Loads cutscenes, dialogue and cast names from content/. A cutscene is narrative's script
 * (content/cutscenes/<id>.json) plus this stream's layout (content/cutscenes/layout/<id>.layout.json,
 * written by the ?cine= tool), merged by shot id. Vite bundles them lazily, so unused scenes cost nothing.
 */
import type { Cutscene, CutsceneLayout, DialogueLine, DialogueChoiceSet } from './schema';
import { applyLayout } from './schema';

const SCENES = import.meta.glob<Cutscene>('/content/cutscenes/*.json', { import: 'default' });
const LAYOUTS = import.meta.glob<CutsceneLayout>('/content/cutscenes/layout/*.layout.json', { import: 'default' });
const DIALOGUE = import.meta.glob<{ id: string; lines: (DialogueLine & Partial<DialogueChoiceSet>)[] }>('/content/dialogue/*.json', { import: 'default' });
/** Viseme timing per dialogue line (characters generate it from the voice audio; docs/CUTSCENE_PERFORMANCE.md). */
const LIPSYNC = import.meta.glob<{ line: string; visemes: [number, string, number][] }>('/content/lipsync/*.json', { import: 'default', eager: true });
const LIPS = new Map<string, [number, string, number][]>();
for (const f of Object.values(LIPSYNC)) if (f?.line && Array.isArray(f.visemes)) LIPS.set(f.line, f.visemes);
export function lipsync(ref: string) { return LIPS.get(ref) ?? null; }
const CAST = import.meta.glob<{ id: string; name: string }[]>('/content/cast/*.json', { import: 'default', eager: true });

export function cutsceneIds(): string[] { return Object.keys(SCENES).map((p) => p.replace(/^.*\/(.*)\.json$/, '$1')); }
export function hasCutscene(id: string) { return `/content/cutscenes/${id}.json` in SCENES; }

export async function loadCutscene(id: string): Promise<{ scene: Cutscene; script: Cutscene; dialogue: (ref: string) => DialogueLine | null; choices: (ref: string) => DialogueChoiceSet | null; speaker: (castId: string) => string }> {
  const load = SCENES[`/content/cutscenes/${id}.json`];
  if (!load) throw new Error(`no cutscene ${id}`);
  const script = structuredClone(await load());
  const lay = LAYOUTS[`/content/cutscenes/layout/${id}.layout.json`];
  const { scene, orphans } = applyLayout(script, lay ? await lay() : null);
  if (orphans.length) console.warn(`cutscene ${id}: layout has shots the script no longer has: ${orphans.join(', ')}`);
  const scripts = new Set<string>();
  for (const s of scene.shots) { for (const d of s.dialogue ?? []) scripts.add((typeof d === 'string' ? d : d.ref).split('#')[0]); if (s.choices) scripts.add(s.choices.split('#')[0]); }
  const lines = new Map<string, DialogueLine>(); const choiceSets = new Map<string, DialogueChoiceSet>();
  for (const sid of scripts) {
    const f = DIALOGUE[`/content/dialogue/${sid.replace(/^dlg\./, '')}.json`];
    if (!f) continue;
    const doc = await f();
    for (const l of doc.lines ?? []) { if (l.text) lines.set(`${doc.id}#${l.id}`, l); if (l.choices) choiceSets.set(`${doc.id}#${l.id}`, { id: l.id, choices: l.choices }); }
  }
  return { scene, script, dialogue: (ref) => lines.get(ref) ?? null, choices: (ref) => choiceSets.get(ref) ?? null, speaker: speakerName };
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
