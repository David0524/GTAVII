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
    if (!(s.durationSec > 0)) errs.push(`${p}.durationSec`);
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

/** Vertical field of view (degrees) for a 35 mm-film focal length (24 mm gate height). */
export function lensToFov(mm: number) { return (2 * Math.atan(12 / mm) * 180) / Math.PI; }
export function fovToLens(fovDeg: number) { return 12 / Math.tan((fovDeg * Math.PI) / 360); }
