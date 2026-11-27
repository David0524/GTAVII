/**
 * npm run audio:voices — render every narrative line to speech, offline, with eSpeak NG.
 *
 * Why eSpeak NG (user decision 2026-11-26: "free methods; generate speech locally"):
 *  - it is a formant synthesiser: no recorded human voice inside, so no real person's voice is
 *    imitated (brief rule), and no dataset licence questions (neural TTS voices are trained on
 *    real speakers with mixed licences);
 *  - it runs only here, at build time; the game ships the rendered audio, not the GPL program.
 *
 * Input: the narrative content tree (default public/content, a local copy of the narrative branch's
 * content/; pass --content DIR). Output: public/audio/voice/<key>.{webm,m4a} + manifest.json, where
 * key = fnv64(speaker|emotion|text) — the runtime computes the same key, so a line whose text changes
 * simply falls back to the placeholder voice until re-rendered, and unchanged lines never churn.
 *
 * Casting: tools/audio/casting.json (committed, editable) overrides the automatic casting, which
 * reads the pronouns the narrative's own cast descriptions use (never names) and the age.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, copyFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import EspeakModule from '@echogarden/espeak-ng-emscripten';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { voiceKey, castVoice, type VoiceCast } from '../../src/audio/dialogue/voiceKey';
import { measure } from './loudness';
import { dispatchVocab, templateFragments } from '../../src/audio/dialogue/dispatchText';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const CONTENT = opt('content', 'public/content'), OUT = 'public/audio/voice', JOBS = +opt('jobs', '4');
/** Renders live here keyed by hash; Vercel's build cache restores node_modules/.cache between builds. */
const CACHE = opt('cache', 'node_modules/.cache/t74-voices');
/** --soft (the deploy build): never fail the build; anything not rendered plays the placeholder voice. */
const SOFT = args.includes('--soft');
const bail = (msg: string): never => { if (SOFT) { console.warn(`[audio:voices] ${msg}; continuing without (re-)rendered speech (placeholder voice)`); process.exit(0); } console.error(msg); process.exit(1); };
const TARGET_LUFS = -20;

// eSpeak NG compiled to WASM (npm, GPL-3.0) and a static ffmpeg (npm, GPL-3.0): build-time tools only, so this
// runs on any Node build host (Vercel included) without apt. Neither is imported by game code or shipped.
let espeak: any;
try { espeak = new ((await (EspeakModule as any)()) as any).eSpeakNGWorker(); } catch (e) { bail(`eSpeak WASM failed to load: ${e}`); }
const FFMPEG = ffmpegPath as unknown as string;
if (!FFMPEG || !existsSync(FFMPEG)) bail('ffmpeg-static has no binary for this platform');
const SR_TTS: number = espeak.get_samplerate();
const VOL_DB: Record<string, number> = { soft: -3, medium: 0, loud: 2 };
if (!existsSync(CONTENT)) bail(`no narrative content at ${CONTENT}`);
mkdirSync(OUT, { recursive: true }); mkdirSync(CACHE, { recursive: true });

// ------------------------------------------------------------------ casting
const castFiles = ['leads', 'principals', 'secondary'].map((f) => join(CONTENT, 'cast', `${f}.json`)).filter(existsSync);
const cast = new Map<string, { age?: number; pron: 'he' | 'she' | 'they' | null }>();
for (const f of castFiles) for (const c of JSON.parse(readFileSync(f, 'utf8'))) {
  const text = Object.values(c).filter((v) => typeof v === 'string').join(' ').toLowerCase();
  const n = (re: RegExp) => (text.match(re) ?? []).length;
  const he = n(/\b(he|him|his|himself)\b/g), she = n(/\b(she|her|hers|herself)\b/g), they = n(/\b(themself|themselves)\b/g);
  // Only a clear majority counts (descriptions mention other people too); otherwise neutral casting.
  const pron = they > 0 ? 'they' : he > she * 2 && he >= 2 ? 'he' : she > he * 2 && she >= 2 ? 'she' : null;
  cast.set(c.id, { age: c.age, pron });
}
const overrides: Record<string, Partial<VoiceCast>> = existsSync('tools/audio/casting.json') ? JSON.parse(readFileSync('tools/audio/casting.json', 'utf8')).speakers ?? {} : {};
const castOf = (speaker: string): VoiceCast => ({ ...castVoice(speaker, cast.get(speaker)), ...overrides[speaker] });

// ------------------------------------------------------------------ lines
interface Job { speaker: string; emotion: string; text: string; key: string; refs: string[] }
const jobs = new Map<string, Job>();
const TWO_VOICE = new Set(['road_rage', 'fender_bender']);
const add = (speaker: string, emotion: string | undefined, text: string, ref: string) => {
  if (!text?.trim()) return; const em = emotion ?? 'neutral'; const key = voiceKey(speaker, em, text);
  const j = jobs.get(key); if (j) j.refs.push(ref); else jobs.set(key, { speaker, emotion: em, text, key, refs: [ref] });
};
for (const f of readdirSync(join(CONTENT, 'dialogue')).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(join(CONTENT, 'dialogue', f), 'utf8'));
  for (const l of d.lines ?? []) if (l.text && l.speaker) add(l.speaker, l.emotion, l.text, `${d.id}/${l.id}`);
}
for (const f of readdirSync(join(CONTENT, 'barks')).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(join(CONTENT, 'barks', f), 'utf8')); const pool = f.replace(/\.json$/, '');
  // Templated lines ({street}, {description}...) are dispatch radio: they're stitched from fragments below, never rendered whole.
  for (const l of d.lines ?? []) if (!/[{}]/.test(l.text ?? '')) add(`npc.${pool}`, l.emotion, l.text, `barks.${pool}:${l.context}`);
  // Pools where two people trade lines (an argument between drivers) also get a second voice, `npc.<pool>.b`.
  if (TWO_VOICE.has(pool)) for (const l of d.lines ?? []) if (!/[{}]/.test(l.text ?? '')) add(`npc.${pool}.b`, l.emotion, l.text, `barks.${pool}:${l.context}`);
}
// Police dispatch fragments (src/audio/dialogue/dispatchText.ts): Central in two registers, the radio cars in one.
{
  const streets = existsSync('public/data/streets.json') ? [...new Set((JSON.parse(readFileSync('public/data/streets.json', 'utf8')) as { n: string }[]).map((x) => x.n))] : [];
  const pf = join(CONTENT, 'police', 'precincts.json'); const precincts = existsSync(pf) ? (JSON.parse(readFileSync(pf, 'utf8')).precincts ?? []).map((x: { name: string }) => x.name) : [];
  const templates: string[] = [];
  const slots: string[] = [];
  for (const f of ['police_radio', 'cop_killed']) {
    const bf = join(CONTENT, 'barks', `${f}.json`); if (!existsSync(bf)) continue;
    const d = JSON.parse(readFileSync(bf, 'utf8'));
    for (const l of d.lines ?? []) if (f === 'police_radio' || l.context === 'radio') templates.push(l.text);
    // Narrative's slot vocabularies (audio.slots): lists are rendered as-is; prose descriptions are covered by the map/number vocab.
    for (const v of Object.values(d.audio?.slots ?? {})) if (Array.isArray(v)) slots.push(...(v as string[]));
  }
  const vocab = dispatchVocab({ streets, precincts, templates, slots });
  // Four registers: Central calm/urgent, the cars calm/urgent (urgent also serves 'breathless' foot pursuits).
  for (const v of vocab) for (const [sp, em] of [['dispatch.central', 'flat'], ['dispatch.central', 'urgent'], ['dispatch.car', 'flat'], ['dispatch.car', 'urgent']]) add(sp, em, v, 'dispatch');
  // The sergeant (narrative's `voice: sergeant`, older and slower) only says his own lines: render just their fragments and words.
  const pr = join(CONTENT, 'barks', 'police_radio.json');
  if (existsSync(pr)) { const sg = (JSON.parse(readFileSync(pr, 'utf8')).lines ?? []).filter((l: { voice?: string }) => l.voice === 'sergeant').map((l: { text: string }) => l.text); const frags = templateFragments(sg); for (const f of new Set([...frags, ...frags.flatMap((x) => x.split(' '))])) if (f && f !== ',') add('dispatch.sergeant', 'flat', f, 'dispatch'); }
  console.log(`dispatch vocabulary: ${vocab.length} fragments x 4 voice registers`);
}
if (existsSync(join(CONTENT, 'radio.json'))) {
  for (const s of JSON.parse(readFileSync(join(CONTENT, 'radio.json'), 'utf8')).stations ?? []) (s.patter ?? []).forEach((p: { text: string }, i: number) => add(`dj.${s.id}`, 'radio', p.text, `${s.id}.p${i}`));
}

// ------------------------------------------------------------------ render
const EMO: Record<string, [number, number, string]> = { // rate %, pitch %, volume
  flat: [0, -4, 'medium'], wry: [-3, 2, 'medium'], warm: [-5, 3, 'medium'], dry: [0, -3, 'medium'], inner: [-10, -4, 'soft'], low: [-10, -10, 'soft'],
  cold: [-5, -8, 'medium'], tired: [-15, -10, 'soft'], friendly: [5, 8, 'medium'], annoyed: [8, 5, 'loud'], weary: [-12, -8, 'soft'], quiet: [-8, -5, 'soft'],
  angry: [12, 12, 'loud'], brisk: [15, 2, 'medium'], proud: [0, 5, 'loud'], worried: [8, 10, 'medium'], gruff: [-5, -12, 'loud'], formal: [-5, 0, 'medium'],
  smug: [-5, 3, 'medium'], cocky: [8, 6, 'loud'], cool: [-5, -4, 'medium'], urgent: [20, 10, 'loud'], easy: [-5, 0, 'medium'], charming: [0, 6, 'medium'],
  alarmed: [15, 15, 'loud'], crisp: [10, 2, 'medium'], soft: [-10, -2, 'soft'], serious: [-5, -6, 'medium'], grave: [-12, -10, 'medium'], startled: [15, 15, 'loud'],
  alert: [10, 5, 'medium'], panicked: [25, 20, 'loud'], sad: [-15, -8, 'soft'], cheerful: [10, 12, 'medium'], impatient: [15, 6, 'loud'], radio: [5, 4, 'loud'],
};
function run(cmd: string, a: string[]): Promise<void> {
  return new Promise((res, rej) => { const p = spawn(cmd, a, { stdio: ['ignore', 'ignore', 'pipe'] }); let e = ''; p.stderr.on('data', (d) => (e += d)); p.on('close', (c) => (c === 0 ? res() : rej(new Error(`${cmd} ${c}: ${e.slice(0, 300)}`)))); });
}
function writeWav(path: string, x: Float32Array, sr: number) {
  const b = Buffer.alloc(44 + x.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2); writeFileSync(path, b);
}

const manifestPath = join(OUT, 'manifest.json'), cacheIndex = join(CACHE, 'index.json');
let old: { files: Record<string, any> } = { files: {} };
try { if (existsSync(cacheIndex)) old = JSON.parse(readFileSync(cacheIndex, 'utf8')); } catch { /* cold cache */ }
let failed = 0;
const files: Record<string, { dur: number; bytesOpus: number; bytesAac: number; speaker: string; emotion: string; voice: string }> = {};
let done = 0, skipped = 0; const t0 = Date.now();
async function render(j: Job) {
  try { await renderOne(j); } catch (e) { failed++; if (!SOFT) throw e; console.warn(`[audio:voices] ${j.key} (${j.speaker}) failed: ${String(e).slice(0, 200)}`); }
}
async function renderOne(j: Job) {
  const webm = join(CACHE, `${j.key}.webm`), m4a = join(CACHE, `${j.key}.m4a`); const c = castOf(j.speaker);
  const voiceStr = `wasm en-us+${c.variant} p${c.pitch} s${c.speed}`;
  if (old.files[j.key]?.voice === voiceStr && existsSync(webm) && existsSync(m4a)) { files[j.key] = old.files[j.key]; skipped++; return; }
  const [rate, pitch, vol] = EMO[j.emotion] ?? [0, 0, 'medium'];
  const tmp2 = join(tmpdir(), `t74v-${j.key}-n.wav`);
  // Emotion as rate/pitch offsets (synthesis is synchronous; ffmpeg encodes run in parallel below).
  espeak.set_voice(`en-us+${c.variant}`); espeak.set_rate(Math.round(c.speed * (1 + rate / 100))); espeak.set_pitch(Math.max(0, Math.min(99, Math.round(c.pitch * (1 + pitch / 100)))));
  const parts: Int16Array[] = []; espeak.synthesize(j.text, (d: Int16Array) => { if (d) parts.push(d); return 0; });
  const x = new Float32Array(parts.reduce((s2, p2) => s2 + p2.length, 0)); { let o = 0; for (const p2 of parts) { for (let i = 0; i < p2.length; i++) x[o + i] = p2[i] / 32768; o += p2.length; } }
  const sr = SR_TTS;
  // Trim leading/trailing silence, gentle high-pass, and normalise every line to the same loudness.
  let a = 0, b = x.length - 1; while (a < b && Math.abs(x[a]) < 0.004) a++; while (b > a && Math.abs(x[b]) < 0.004) b--;
  const pad = Math.round(sr * 0.04); const y = x.slice(Math.max(0, a - pad), Math.min(x.length, b + pad));
  let hp = 0, prev = 0; const k = Math.exp(-2 * Math.PI * 90 / sr); for (let i = 0; i < y.length; i++) { const v = y[i]; hp = k * (hp + v - prev); prev = v; y[i] = hp; }
  const m = measure(resampleTo48(y, sr), resampleTo48(y, sr), 48000); const g = isFinite(m.integrated) ? Math.pow(10, (TARGET_LUFS + (VOL_DB[vol] ?? 0) - m.integrated) / 20) : 1;
  let peak = 0; for (let i = 0; i < y.length; i++) { y[i] *= g; peak = Math.max(peak, Math.abs(y[i])); } if (peak > 0.9) for (let i = 0; i < y.length; i++) y[i] *= 0.9 / peak;
  writeWav(tmp2, y, sr);
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmp2, '-c:a', 'libopus', '-b:a', '16k', '-application', 'voip', '-map_metadata', '-1', webm]);
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmp2, '-ar', '16000', '-c:a', 'aac', '-b:a', '20k', '-movflags', '+faststart', '-map_metadata', '-1', m4a]);
  rmSync(tmp2);
  files[j.key] = { dur: +(y.length / sr).toFixed(3), bytesOpus: statSync(webm).size, bytesAac: statSync(m4a).size, speaker: j.speaker, emotion: j.emotion, voice: voiceStr };
  if (++done % 50 === 0) console.log(`${done} rendered, ${skipped} unchanged (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
/** Linear-interpolation upsample, only for loudness measurement of speech. */
function resampleTo48(x: Float32Array, sr: number) { const n = Math.floor(x.length * 48000 / sr), y = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i * sr / 48000, k = Math.floor(t), f = t - k; y[i] = (x[k] ?? 0) * (1 - f) + (x[k + 1] ?? 0) * f; } return y; }

const queue = [...jobs.values()];
await Promise.all(Array.from({ length: JOBS }, async () => { while (queue.length) await render(queue.shift()!); }));
// Publish the current lines from the cache into public/, and drop anything no line refers to any more.
for (const k of Object.keys(files)) for (const ext of ['webm', 'm4a']) { const src = join(CACHE, `${k}.${ext}`), dst = join(OUT, `${k}.${ext}`); if (!existsSync(dst) || statSync(dst).size !== statSync(src).size) copyFileSync(src, dst); }
for (const dir of [OUT, CACHE]) for (const f of readdirSync(dir)) { const key = f.replace(/\.(webm|m4a)$/, ''); if (f !== 'manifest.json' && f !== 'index.json' && !files[key]) rmSync(join(dir, f)); }
writeFileSync(cacheIndex, JSON.stringify({ files }));
const castTable: Record<string, VoiceCast & { from: string }> = {};
for (const j of jobs.values()) if (!castTable[j.speaker]) castTable[j.speaker] = { ...castOf(j.speaker), from: overrides[j.speaker] ? 'override' : cast.get(j.speaker)?.pron ? `cast pronouns (${cast.get(j.speaker)!.pron}), age ${cast.get(j.speaker)!.age ?? '?'}` : 'neutral spread (no cast entry)' };
const totals = Object.values(files).reduce((s, f) => ({ dur: s.dur + f.dur, opus: s.opus + f.bytesOpus, aac: s.aac + f.bytesAac }), { dur: 0, opus: 0, aac: 0 });
writeFileSync(manifestPath, JSON.stringify({ engine: 'eSpeak NG (Emscripten/WASM build @echogarden/espeak-ng-emscripten 0.3.5, formant synthesis), rendered at build time by tools/audio/voices.ts', targetLufs: TARGET_LUFS, totals, cast: castTable, files }, null, 1) + '\n');
console.log(`${jobs.size} lines (${done} rendered, ${skipped} from cache, ${failed} failed): ${(totals.dur / 60).toFixed(1)} min, opus ${(totals.opus / 1048576).toFixed(1)} MB, aac ${(totals.aac / 1048576).toFixed(1)} MB`);

// Per-file provenance table (docs/AUDIO_SOURCES_VOICES.md), regenerated with the renders.
{
  const rows = ['# Voice files: provenance, one row per line', '',
    `Every file in \`public/audio/voice/\` is rendered by \`tools/audio/voices.ts\` from the narrative team's text (\`content/\` on \`claude/sharp-maxwell-jnb6hr\`) with **eSpeak NG 1.51** (formant synthesis, no recorded voice; the program is GPL-3 but its audio output carries no licence obligation). Licence of the files: the project's own. Edits: silence trim, 90 Hz high-pass, loudness normalised to −20 LUFS, encoded with ffmpeg (Opus 16 kb/s VBR \`.webm\`; AAC-LC 20 kb/s at 16 kHz \`.m4a\`). Last render: ${new Date().toISOString().slice(0, 10)}. Generated; do not edit by hand.`, '',
    `Totals: ${Object.keys(files).length} lines, ${(totals.dur / 60).toFixed(1)} min, Opus ${(totals.opus / 1048576).toFixed(1)} MB, AAC ${(totals.aac / 1048576).toFixed(1)} MB.`, '',
    '| Key (`<key>.webm`, `<key>.m4a`) | Speaker | Emotion | eSpeak voice | Seconds |', '|---|---|---|---|---|'];
  for (const [k, f] of Object.entries(files).sort((a, b) => (a[1].speaker + a[0]).localeCompare(b[1].speaker + b[0]))) rows.push(`| ${k} | ${f.speaker} | ${f.emotion} | ${f.voice} | ${f.dur.toFixed(2)} |`);
  writeFileSync('docs/AUDIO_SOURCES_VOICES.md', rows.join('\n') + '\n');
}
