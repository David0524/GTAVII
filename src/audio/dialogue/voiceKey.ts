/**
 * Shared by the offline voice renderer (tools/audio/voices.ts) and the runtime: the key a rendered
 * line is stored under, and the automatic casting rules.
 */

/** 64-bit FNV-1a of speaker|emotion|text as 16 hex chars. */
export function voiceKey(speaker: string, emotion: string, text: string): string {
  const s = `${speaker}|${emotion}|${text}`;
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export interface VoiceCast { variant: string; pitch: number; speed: number; gap: number }

const HE = ['m1', 'm2', 'm3', 'm4', 'm6', 'm7', 'klatt', 'klatt3'];
const SHE = ['f1', 'f2', 'f3', 'f4', 'f5', 'klatt2', 'klatt4'];
const ANY = ['m3', 'f2', 'klatt5', 'm5', 'f4', 'klatt6', 'm7', 'f5'];

function h(s: string) { let x = 2166136261; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619); return x >>> 0; }

/**
 * Automatic casting. `pron` comes from the narrative's own cast descriptions (pronoun counts), never
 * from names; unknown speakers get a neutral, deterministic spread. Overrides: tools/audio/casting.json.
 */
export function castVoice(speaker: string, info?: { age?: number; pron: 'he' | 'she' | 'they' | null }): VoiceCast {
  const x = h(speaker), r = (x >>> 8 & 255) / 255, age = info?.age ?? 40;
  const old = Math.max(0, Math.min(1, (age - 30) / 45)); // 0 at 30, 1 at 75
  const speed = Math.round(172 - old * 25 + (r - 0.5) * 16), gap = 1 + (x & 1);
  if (speaker.startsWith('dj.')) return { variant: ['m3', 'f2', 'm7', 'klatt3'][x % 4], pitch: 40 + Math.round(r * 25), speed: 178, gap: 1 };
  if (info?.pron === 'he') return { variant: HE[x % HE.length], pitch: Math.round(42 - old * 14 + (r - 0.5) * 12), speed, gap };
  if (info?.pron === 'she') return { variant: SHE[x % SHE.length], pitch: Math.round(66 - old * 14 + (r - 0.5) * 12), speed, gap };
  return { variant: ANY[x % ANY.length], pitch: Math.round(38 + r * 30), speed, gap };
}
