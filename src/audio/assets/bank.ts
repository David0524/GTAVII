/**
 * Sound bank: procedural one-shots baked in a worker, plus streamed compressed assets
 * (Opus-in-WebM where the browser says "probably", AAC-in-MP4 otherwise; Safari decodes the
 * AAC path on every version we target). Everything decoded is counted against the preset's
 * memory budget and loaded by group ("boot", "garment", "park", "rain"...) as the listener
 * moves; least-recently-used groups are evicted when the budget is exceeded.
 */
import BakeWorker from './bakeWorker.ts?worker';
import { BAKERS } from '../synth/bake';
import { Rng } from '../worklets/dsp';

export const GROUPS: Record<string, string[]> = {
  boot: ['ui.move', 'ui.select', 'ui.back', 'ui.map', 'ui.switch', 'ui.pickup', 'ui.coins', 'step.concrete', 'step.asphalt', 'step.grating', 'step.park', 'door.slam', 'impact.light', 'signal.click', 'whistle.hail', 'brake.squeal', 'manhole.clank', 'drip'],
  traffic: ['impact.heavy', 'glass', 'bus.door'],
  vendors: ['vendor.steam', 'vendor.sizzle', 'vendor.roaster', 'vendor.bell', 'vendor.chime', 'vendor.change', 'vendor.spill', 'vendor.rag', 'cart.rattle'],
  movement: ['step.granite', 'step.subwaytile', 'step.stoop', 'step.iron', 'step.rung', 'step.gravel', 'fence.rattle', 'foley.cloth', 'foley.vault', 'foley.climb', 'foley.land', 'foley.roll', 'foley.ragdoll', 'paper.crumple'],
  interior: ['step.wood', 'step.tile', 'phone.ring'],
  garment: ['cart.rattle', 'dock.bang', 'jackhammer', 'truck.compactor'],
  park: ['bird.sparrow', 'bird.starling', 'bird.pigeon'],
  night: ['ship.horn'],
  power: ['power.down', 'power.up'],
  calendar: ['bell', 'firework'],
  rain: ['thunder.near', 'thunder.far'],
};
/** Families whose content needs the full band; the rest bake at 32 kHz to save memory. */
const HI_RATE = /^(ui\.|glass|whistle|bird\.|signal|step\.|fence\.|foley\.|paper\.)/;
const LONG = 2.5;

interface Entry { buffers: AudioBuffer[]; bytes: number; lastUse: number; group: string; streamed: boolean }
interface ManifestItem { variants: { opus: string; aac: string; bytesOpus: number; bytesAac: number }[] }

export class AssetBank {
  private entries = new Map<string, Entry>();
  private loading = new Map<string, Promise<void>>();
  private worker: Worker | null = null; private nextId = 1;
  private pending = new Map<number, (r: { data?: Float32Array; ms?: number; error?: string }) => void>();
  private manifest: Record<string, ManifestItem> = {};
  private rng = new Rng(97);
  private codec: 'opus' | 'aac' = 'aac';
  groupsLoaded = new Set<string>();
  stats = { decodedBytes: 0, downloadedBytes: 0, bakeMs: 0, streamed: 0, baked: 0, evicted: 0, codec: 'aac' as string, failures: [] as string[] };

  constructor(private ctx: BaseAudioContext, private budget: number, private baseUrl: string, private variants: number) {}

  async init() {
    try { this.worker = new BakeWorker(); this.worker.onmessage = (e) => { const cb = this.pending.get(e.data.id); this.pending.delete(e.data.id); cb?.(e.data); }; } catch { this.worker = null; }
    try {
      const a = document.createElement('audio');
      this.codec = a.canPlayType('audio/webm; codecs="opus"') === 'probably' ? 'opus' : 'aac';
    } catch { this.codec = 'aac'; }
    this.stats.codec = this.codec;
    try { const r = await fetch(this.baseUrl + 'audio/manifest.json'); if (r.ok) this.manifest = await r.json(); } catch { /* no streamed assets: bake everything */ }
  }

  private bake(family: string, seed: number, sr: number): Promise<Float32Array> {
    if (!this.worker) { const t0 = performance.now(); const d = BAKERS[family].bake(seed, sr); this.stats.bakeMs += performance.now() - t0; return Promise.resolve(d); }
    const id = this.nextId++;
    return new Promise((res, rej) => { this.pending.set(id, (r) => { if (r.data) { this.stats.bakeMs += r.ms ?? 0; res(r.data); } else rej(new Error(r.error)); }); this.worker!.postMessage({ id, family, seed, sr }); });
  }

  private async loadFamily(family: string, group: string): Promise<void> {
    const m = this.manifest[family];
    const buffers: AudioBuffer[] = []; let streamed = false;
    if (m) {
      for (const v of m.variants) {
        try {
          const url = this.baseUrl + (this.codec === 'opus' ? v.opus : v.aac);
          const r = await fetch(url); if (!r.ok) throw new Error(`${r.status}`);
          const ab = await r.arrayBuffer(); this.stats.downloadedBytes += ab.byteLength;
          buffers.push(await this.ctx.decodeAudioData(ab)); streamed = true;
        } catch (e) {
          // Opus decode can fail on older Safari even when canPlayType is optimistic: fall back to AAC once.
          if (this.codec === 'opus') { this.codec = 'aac'; this.stats.codec = 'aac (fallback)'; this.stats.failures.push(`${family}: opus ${e}`); return this.loadFamily(family, group); }
          this.stats.failures.push(`${family}: ${e}`);
        }
      }
    }
    if (!buffers.length) {
      const b = BAKERS[family]; if (!b) return;
      const sr = HI_RATE.test(family) ? 44100 : 32000;
      const n = Math.min(b.variants ?? Infinity, b.dur > LONG ? Math.min(2, this.variants) : this.variants);
      const datas = await Promise.all(Array.from({ length: n }, (_, k) => this.bake(family, 1000 + k * 7919 + family.length, sr)));
      for (const d of datas) { const ab = this.ctx.createBuffer(1, d.length, sr); ab.copyToChannel(d as Float32Array<ArrayBuffer>, 0); buffers.push(ab); }
      this.stats.baked += n;
    } else this.stats.streamed += buffers.length;
    const bytes = buffers.reduce((s, b) => s + b.length * b.numberOfChannels * 4, 0);
    this.entries.set(family, { buffers, bytes, lastUse: performance.now(), group, streamed });
    this.stats.decodedBytes += bytes;
    this.enforceBudget(group);
  }

  /** Make sure every family in a group is resident (idempotent, concurrent-safe). */
  loadGroup(group: string): Promise<void> {
    const fams = GROUPS[group] ?? [];
    this.groupsLoaded.add(group);
    return Promise.all(fams.map((f) => {
      if (this.entries.has(f)) { this.entries.get(f)!.lastUse = performance.now(); return Promise.resolve(); }
      let p = this.loading.get(f);
      if (!p) { const np = this.loadFamily(f, group).finally(() => this.loading.delete(f)); this.loading.set(f, np); p = np; }
      return p;
    })).then(() => undefined);
  }

  private enforceBudget(keep: string) {
    if (this.stats.decodedBytes <= this.budget) return;
    const victims = [...this.entries.entries()].filter(([, e]) => e.group !== 'boot' && e.group !== keep).sort((a, b) => a[1].lastUse - b[1].lastUse);
    for (const [f, e] of victims) {
      if (this.stats.decodedBytes <= this.budget) break;
      this.entries.delete(f); this.stats.decodedBytes -= e.bytes; this.stats.evicted++; this.groupsLoaded.delete(e.group);
    }
  }

  get(family: string): AudioBuffer | null {
    const e = this.entries.get(family); if (!e || !e.buffers.length) return null;
    e.lastUse = performance.now();
    return e.buffers[(this.rng.next() * e.buffers.length) | 0];
  }
  has(family: string) { return this.entries.has(family); }
  gainOf(family: string) { return BAKERS[family]?.gain ?? 1; }
  get budgetBytes() { return this.budget; }

  dispose() { this.worker?.terminate(); this.worker = null; this.entries.clear(); this.stats.decodedBytes = 0; }
}
