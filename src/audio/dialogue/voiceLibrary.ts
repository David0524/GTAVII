/**
 * Rendered speech (eSpeak NG, offline: tools/audio/voices.ts). Lines are looked up by
 * voiceKey(speaker, emotion, text), streamed on demand (Opus where the browser says "probably",
 * else AAC), decoded and kept in a small LRU. A line with no rendering falls back to the
 * placeholder formant voice, so content can change ahead of a re-render without breaking.
 */
import { voiceKey } from './voiceKey';

interface Entry { dur: number }

export class VoiceLibrary {
  private files: Record<string, Entry> = {};
  private cache = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private bytes = 0;
  private codec: 'opus' | 'aac' = 'aac';
  stats = { lines: 0, hits: 0, misses: 0, fetched: 0, downloadedBytes: 0, cachedBytes: 0, failures: 0 };

  constructor(private ctx: BaseAudioContext, private baseUrl: string, private budget = 6 * 1024 * 1024) {}

  async init(enabled = true) {
    if (!enabled) return;
    try { const a = document.createElement('audio'); this.codec = a.canPlayType('audio/webm; codecs="opus"') === 'probably' ? 'opus' : 'aac'; } catch { /* aac */ }
    try {
      const r = await fetch(this.baseUrl + 'audio/voice/manifest.json');
      if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) { this.files = (await r.json()).files ?? {}; this.stats.lines = Object.keys(this.files).length; }
    } catch { /* no rendered voices */ }
  }

  key(speaker: string, emotion: string | undefined, text: string) { return voiceKey(speaker, emotion ?? 'neutral', text); }
  /** Duration in seconds if this exact line is rendered. */
  duration(speaker: string, emotion: string | undefined, text: string): number | undefined { return this.files[this.key(speaker, emotion, text)]?.dur; }

  /** Decoded buffer, or null (not rendered, failed, or slower than `timeoutS`). */
  async get(speaker: string, emotion: string | undefined, text: string, timeoutS = 2): Promise<AudioBuffer | null> {
    const k = this.key(speaker, emotion, text);
    if (!this.files[k]) { this.stats.misses++; return null; }
    const c = this.cache.get(k); if (c) { this.cache.delete(k); this.cache.set(k, c); this.stats.hits++; return c; }
    let p = this.loading.get(k);
    if (!p) {
      p = (async () => {
        try {
          const r = await fetch(`${this.baseUrl}audio/voice/${k}.${this.codec === 'opus' ? 'webm' : 'm4a'}`); if (!r.ok) throw new Error(String(r.status));
          const ab = await r.arrayBuffer(); this.stats.downloadedBytes += ab.byteLength; this.stats.fetched++;
          const buf = await this.ctx.decodeAudioData(ab);
          this.cache.set(k, buf); this.bytes += buf.length * 4;
          for (const [kk, b] of this.cache) { if (this.bytes <= this.budget) break; if (kk === k) continue; this.cache.delete(kk); this.bytes -= b.length * 4; }
          this.stats.cachedBytes = this.bytes;
          return buf;
        } catch {
          if (this.codec === 'opus') { this.codec = 'aac'; this.loading.delete(k); return this.get(speaker, emotion, text, timeoutS); }
          this.stats.failures++; return null;
        } finally { this.loading.delete(k); }
      })();
      this.loading.set(k, p);
    }
    return Promise.race([p, new Promise<null>((res) => setTimeout(() => res(null), timeoutS * 1000))]);
  }

  /** Warm the cache for the next lines of a scene. */
  prefetch(lines: { speaker?: string; emotion?: string; text?: string }[]) { for (const l of lines) if (l.text && l.speaker) void this.get(l.speaker, l.emotion, l.text, 30); }
}
