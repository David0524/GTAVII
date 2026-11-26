/**
 * Cutscene data format (content/cutscenes/*.json), owned by the UI & Cinematics stream.
 * Two layers in one file:
 *  - SCRIPT (narrative writes it): id, mission, before, time, date, weather, logline, and per shot
 *    type, framing, blocking, beats, move, notes, lensMm, durationSec, dialogue refs.
 *  - LAYOUT (the ?cine=1 tool writes it): world-space camera keys (position, look-at, lens, focus,
 *    f-stop, roll), actor keys, timed dialogue, audio and commit cues, cards, film settings and
 *    the transition out of each shot.
 * A script-only file still plays: shots without camera keys get a placeholder framing at the scene
 * anchor and a "NOT LAID OUT" slate, so narrative can preview timing before layout.
 */
export type V3 = [number, number, number];

export interface CamKey {
  t: number;              // seconds from the start of the shot
  pos: V3; look: V3;
  lensMm?: number;        // 35 mm-film focal length; animating it is a period zoom
  focusM?: number;        // focus distance (rack focus by keying it)
  fStop?: number;
  roll?: number;          // degrees (dutch)
  ease?: 'linear' | 'in' | 'out' | 'inOut' | 'hold';
}
export interface ActorKey { t: number; x: number; z: number; heading: number; anim?: string }
export interface ShotFilm { grain?: number; weave?: number; halation?: number; letterbox?: number; fadeIn?: number; fadeOut?: number }

export interface Shot {
  id: string;
  durationSec: number;
  // script
  type?: string; lensMm?: number; move?: string; framing?: string; blocking?: string; beats?: string[]; notes?: string;
  // layout
  camera?: { keys: CamKey[]; handheld?: number; fromGameplay?: boolean; toGameplay?: boolean };
  actors?: Record<string, ActorKey[]>;
  dialogue?: (string | { ref: string; t?: number; seconds?: number })[];
  audio?: (string | { t: number; cue: string })[];
  cues?: { t: number; cue: string; data?: unknown }[];
  cards?: { t: number; text: string; style?: 'title' | 'lower' | 'chapter'; seconds?: number }[];
  lighting?: string | Record<string, unknown>;
  film?: ShotFilm | string[];
  transition?: 'cut' | 'dissolve' | 'blend';
  /** Hold this frame, untimed, until something resolves (a dialogue choice: choices = "dlg.x#c1"). */
  waitFor?: 'choice';
  choices?: string;
}

export interface Cutscene {
  id: string;
  format?: 't74-cutscene'; version?: number;
  mission?: string; before?: string; time?: string; date?: string; weather?: string; logline?: string;
  skippable?: boolean;
  anchor?: { x: number; z: number };
  cast?: Record<string, { cast: string; colour?: string; height?: number }>;
  shots: Shot[];
}

export interface DialogueLine { id: string; speaker: string; text: string; emotion?: string }
export interface DialogueChoiceSet { id: string; choices: { text: string; goto?: string; setFlags?: string[] }[] }

export class CutsceneError extends Error {}

/** Structural validation with precise paths (the tool and tests both use it). */
export function validateCutscene(c: Cutscene): string[] {
  const errs: string[] = [];
  const isV3 = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  if (!c || typeof c.id !== 'string') errs.push('id');
  if (!Array.isArray(c?.shots) || !c.shots.length) { errs.push('shots: none'); return errs; }
  const ids = new Set<string>();
  c.shots.forEach((s, i) => {
    const p = `shots[${i}]${s?.id ? ` (${s.id})` : ''}`;
    if (!s.id) errs.push(`${p}.id`); else if (ids.has(s.id)) errs.push(`${p}.id duplicate`); else ids.add(s.id);
    if (!(s.durationSec > 0) && !(s.waitFor && !s.durationSec)) errs.push(`${p}.durationSec`);
    if (s.waitFor === 'choice' && !/^dlg\.[\w.]+#\w+$/.test(s.choices ?? '')) errs.push(`${p}.choices (expected dlg.<script>#<choice id>)`);
    const keys = s.camera?.keys;
    if (keys) {
      if (!keys.length) errs.push(`${p}.camera.keys empty`);
      keys.forEach((k, j) => {
        if (!isV3(k.pos) || !isV3(k.look)) errs.push(`${p}.camera.keys[${j}] pos/look`);
        if (!(k.t >= 0 && k.t <= s.durationSec + 1e-6)) errs.push(`${p}.camera.keys[${j}].t outside the shot`);
        if (j && k.t < keys[j - 1].t) errs.push(`${p}.camera.keys[${j}].t not ascending`);
        if (k.lensMm !== undefined && !(k.lensMm >= 10 && k.lensMm <= 600)) errs.push(`${p}.camera.keys[${j}].lensMm`);
      });
    }
    for (const [a, ks] of Object.entries(s.actors ?? {})) {
      if (c.cast && !(a in c.cast)) errs.push(`${p}.actors.${a} not in cast`);
      ks.forEach((k, j) => { if (![k.t, k.x, k.z, k.heading].every(Number.isFinite)) errs.push(`${p}.actors.${a}[${j}]`); });
    }
    for (const d of s.dialogue ?? []) { const ref = typeof d === 'string' ? d : d.ref; if (!/^dlg\.[\w.]+#\w+$/.test(ref)) errs.push(`${p}.dialogue "${ref}" (expected dlg.<script>#<line>)`); }
  });
  return errs;
}

/** A choice hold may omit durationSec (it holds until the choice resolves): treat it as 0. */
export function normaliseCutscene(c: Cutscene): Cutscene { for (const s of c.shots ?? []) if (s.waitFor && s.durationSec === undefined) (s as { durationSec: number }).durationSec = 0; return c; }

/** Vertical field of view (degrees) for a 35 mm-film focal length (24 mm gate height). */
export function lensToFov(mm: number) { return (2 * Math.atan(12 / mm) * 180) / Math.PI; }
export function fovToLens(fovDeg: number) { return 12 / Math.tan((fovDeg * Math.PI) / 360); }

/**
 * Two files per cutscene so two streams never edit the same file:
 *  - content/cutscenes/<id>.json         narrative's SCRIPT (shots, framing notes, beats, dialogue refs)
 *  - content/cutscenes/layout/<id>.layout.json   this stream's LAYOUT (camera, blocking, timing), written by the tool
 * Layout is keyed by shot id; a layout shot the script no longer has is reported, not played.
 */
export interface ShotLayout {
  durationSec?: number;
  camera?: Shot['camera']; actors?: Shot['actors']; cards?: Shot['cards']; cues?: Shot['cues'];
  audio?: { t: number; cue: string }[]; film?: ShotFilm; transition?: Shot['transition'];
  waitFor?: Shot['waitFor']; choices?: string;
  dialogueTiming?: Record<string, { t?: number; seconds?: number }>;
  notes?: string;
}
export interface CutsceneLayout {
  id: string; format: 't74-cutscene-layout'; version: 1;
  anchor?: Cutscene['anchor']; cast?: Cutscene['cast'];
  shots: Record<string, ShotLayout>;
  [k: string]: unknown;
}
const LAYOUT_KEYS = ['camera', 'actors', 'cards', 'cues', 'transition', 'waitFor', 'choices'] as const;

/** Script + layout -> playable cutscene. Returns the merged scene and any orphaned layout shot ids. */
export function applyLayout(script: Cutscene, layout: CutsceneLayout | null | undefined): { scene: Cutscene; orphans: string[] } {
  const scene = structuredClone(script);
  if (!layout) return { scene, orphans: [] };
  if (layout.anchor) scene.anchor = layout.anchor;
  if (layout.cast) scene.cast = layout.cast;
  const ids = new Set(scene.shots.map((s) => s.id));
  for (const s of scene.shots) {
    const L = layout.shots[s.id]; if (!L) continue;
    if (L.durationSec !== undefined) s.durationSec = L.durationSec;
    for (const k of LAYOUT_KEYS) if (L[k] !== undefined) (s as unknown as Record<string, unknown>)[k] = structuredClone(L[k]);
    const scriptNotes: string[] = [];
    if (L.audio) { scriptNotes.push(...(s.audio ?? []).filter((a): a is string => typeof a === 'string').map((a) => `audio: ${a}`)); s.audio = structuredClone(L.audio); }
    if (L.film) { if (Array.isArray(s.film)) scriptNotes.push(`film: ${s.film.join('; ')}`); s.film = { ...L.film }; }
    if (L.dialogueTiming && s.dialogue) s.dialogue = s.dialogue.map((d) => { const ref = typeof d === 'string' ? d : d.ref, tm = L.dialogueTiming![ref]; return tm ? { ref, ...tm } : d; });
    if (scriptNotes.length || L.notes) s.notes = [s.notes, ...scriptNotes, L.notes && `layout: ${L.notes}`].filter(Boolean).join(' | ');
  }
  return { scene, orphans: Object.keys(layout.shots).filter((id) => !ids.has(id)) };
}

/** The inverse, for the tool's Export: only the layout layer of an edited scene (the script is narrative's). */
export function extractLayout(scene: Cutscene, script: Cutscene): CutsceneLayout {
  const byId = new Map(script.shots.map((s) => [s.id, s]));
  const out: CutsceneLayout = { id: scene.id, format: 't74-cutscene-layout', version: 1, anchor: scene.anchor, cast: scene.cast, shots: {} };
  for (const s of scene.shots) {
    const src = byId.get(s.id), L: ShotLayout = {};
    if (!src || src.durationSec !== s.durationSec) L.durationSec = s.durationSec;
    for (const k of LAYOUT_KEYS) if (s[k] !== undefined && JSON.stringify(s[k]) !== JSON.stringify(src?.[k])) (L as Record<string, unknown>)[k] = structuredClone(s[k]);
    const au = (s.audio ?? []).filter((a): a is { t: number; cue: string } => typeof a === 'object'); if (au.length) L.audio = au;
    if (s.film && !Array.isArray(s.film)) L.film = { ...s.film };
    const tm: Record<string, { t?: number; seconds?: number }> = {};
    for (const d of s.dialogue ?? []) if (typeof d === 'object' && (d.t !== undefined || d.seconds !== undefined)) tm[d.ref] = { ...(d.t !== undefined && { t: d.t }), ...(d.seconds !== undefined && { seconds: d.seconds }) };
    if (Object.keys(tm).length) L.dialogueTiming = tm;
    const ln = s.notes?.match(/layout: (.*)$/); if (ln) L.notes = ln[1];
    out.shots[s.id] = L;
  }
  return out;
}
