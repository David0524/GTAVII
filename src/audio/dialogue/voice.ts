/**
 * PLACEHOLDER VOICE. Until the user chooses a voice source, every line is spoken by a formant
 * "mumble" synthesiser: the syllable count, rhythm, pauses and pitch contour follow the written
 * line and its emotion tag, so timing, ducking, subtitles and positional playback are real, but
 * no words are produced and no real voice is imitated. Same API will play recorded files.
 */
import { hash } from '../vehicles/vehicles';

export interface Syl { t: number; dur: number; vowel: number; stress: number; cons: number }
export interface SpeakerVoice { f0: number; scale: number; range: number; rate: number }

const EMOTION: Record<string, { rate: number; range: number; energy: number }> = {
  neutral: { rate: 1, range: 0.25, energy: 0.7 }, wry: { rate: 0.95, range: 0.3, energy: 0.65 }, angry: { rate: 1.15, range: 0.45, energy: 1 },
  scared: { rate: 1.25, range: 0.5, energy: 0.8 }, sad: { rate: 0.8, range: 0.15, energy: 0.5 }, happy: { rate: 1.1, range: 0.45, energy: 0.85 },
  tired: { rate: 0.82, range: 0.12, energy: 0.45 }, urgent: { rate: 1.25, range: 0.35, energy: 0.95 }, whisper: { rate: 0.9, range: 0.1, energy: 0.3 },
};

export function speakerVoice(id: string, overrides: Record<string, Partial<SpeakerVoice>> = {}): SpeakerVoice {
  const h = hash(id); const female = (h & 1) === 1; const r = ((h >>> 8) & 1023) / 1023;
  const base: SpeakerVoice = { f0: female ? 170 + r * 60 : 92 + r * 45, scale: female ? 1.12 + r * 0.06 : 0.96 + r * 0.06, range: 0.25, rate: 0.9 + ((h >>> 20) & 255) / 255 * 0.25 };
  return { ...base, ...overrides[id] };
}

const VOWEL_OF: Record<string, number> = { a: 0, e: 1, i: 2, o: 3, u: 4, y: 2 };
export function syllableScript(text: string, emotion = 'neutral', v: SpeakerVoice): { script: Syl[]; duration: number } {
  const em = EMOTION[emotion] ?? EMOTION.neutral;
  const script: Syl[] = []; let t = 0.05;
  const tokens = text.replace(/\[[^\]]*\]/g, (m) => m.slice(1, -1)).split(/(\s+|[,.;:!?—-]+)/).filter((s) => s.length);
  const question = /\?\s*$/.test(text);
  let wordIdx = 0;
  for (const tok of tokens) {
    if (/^\s+$/.test(tok)) { t += 0.02; continue; }
    if (/^[,.;:!?—-]+$/.test(tok)) { t += /[.!?]/.test(tok) ? 0.32 : 0.16; continue; }
    const groups = tok.toLowerCase().match(/[aeiouy]+/g) ?? ['a'];
    const onset = tok.toLowerCase().match(/^[^aeiouy]+/)?.[0] ?? '';
    groups.forEach((g, i) => {
      const dur = (0.16 + (g.length > 1 ? 0.05 : 0)) / (em.rate * v.rate) * (0.85 + ((hash(tok + i) & 255) / 255) * 0.3);
      const stress = (i === 0 && tok.length > 3 ? 0.8 : 0.4) * em.energy + (question && wordIdx > 0 ? 0 : 0);
      const cons = i === 0 ? (/^(s|sh|f|th|z|ch)/.test(onset) ? 0 : /^[tkpbdg]/.test(onset) ? 1 : -1) : (hash(tok) + i) % 3 === 0 ? 2 : -1;
      script.push({ t, dur, vowel: VOWEL_OF[g[0]] ?? 6, stress, cons });
      t += dur;
    });
    wordIdx++;
  }
  // Question: rising stress over the last two syllables; statements fall.
  if (script.length > 1) { const n = script.length; script[n - 1].stress = question ? 1 : 0.15; script[n - 2].stress = question ? 0.8 : script[n - 2].stress; }
  return { script, duration: t + 0.1 };
}

/** Minimum on-screen time for a subtitle of this length (about 15 characters/s, never under 1.2 s). */
export function readingTime(text: string) { return Math.max(1.2, text.length / 15 + 0.4); }
