/**
 * Room tone by interior kind, faded in by the doorway blend (0 = street, 1 = deep inside).
 * diner: ceiling fans and the griddle; bar: jukebox (a radio feed through a jukebox speaker) and
 * low talk; precinct: fluorescent hum and typewriters; sro: fan and hum; loft: sewing machines;
 * cinema: projector and a muffled soundtrack; shop: fan; subway: train rumble; stairwell: nothing
 * (the city through the door does it); rooftop: wind and the city below, unmuffled.
 */
import type { Env } from '../env';
import type { Voice, SourceGraph } from '../core/voices';
import { acUnitSource, humSource, windSource, gratingSource, workletSource, type GratingHandle } from '../synth/live';
import type { RadioSystem } from '../radio/radio';
import { Rng } from '../worklets/dsp';

/** Sizzle/rattle/needle textures: amplitude-modulated band-limited noise. */
function textured(ctx: BaseAudioContext, buf: AudioBuffer, f: number, q: number, am: number, depth: number, gain: number): SourceGraph {
  const n = ctx.createBufferSource(); n.buffer = buf; n.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
  const g = ctx.createGain(); g.gain.value = gain * (1 - depth); const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = am; const lg = ctx.createGain(); lg.gain.value = gain * depth;
  lfo.connect(lg).connect(g.gain); n.connect(bp).connect(g);
  const nodes: AudioNode[] = [n, bp, g, lfo, lg];
  return { output: g, start: (w, o) => { n.start(w, o % buf.duration); lfo.start(w); }, stop: (w) => { try { n.stop(w); lfo.stop(w); } catch { /* */ } }, dispose: () => { for (const x of nodes) { try { (x as AudioScheduledSourceNode).stop?.(); } catch { /* */ } x.disconnect(); } } };
}
function mix(ctx: BaseAudioContext, parts: SourceGraph[]): SourceGraph {
  const out = ctx.createGain(); for (const p of parts) p.output.connect(out);
  return { output: out, start: (w, o) => parts.forEach((p) => p.start(w, o)), stop: (w) => parts.forEach((p) => p.stop(w)), dispose: () => { parts.forEach((p) => p.dispose()); out.disconnect(); }, setPitch: () => {} };
}

export class RoomTone {
  private kind: string | null = null; private voice: Voice | null = null; private rng = new Rng(808); private typeT = 0;
  private grating: GratingHandle | null = null;
  constructor(private env: Env, private radio: RadioSystem) {}

  set(kind: string | null, blend: number) {
    if (kind !== this.kind) { this.voice?.stop(0.4); this.voice = null; this.grating = null; this.kind = kind; if (kind) this.voice = this.start(kind); }
    this.voice?.setGain(Math.max(0, Math.min(1, blend)));
  }

  private start(kind: string): Voice | null {
    const env = this.env, noise = env.noise;
    const build = (ctx: BaseAudioContext): SourceGraph => {
      switch (kind) {
        case 'diner': return mix(ctx, [acUnitSource(ctx, noise, 11), textured(ctx, noise.white, 5200, 0.8, 9, 0.6, 0.05)]);
        case 'bar': { const w = workletSource(ctx, 't74-walla', 2, { seed: 77, talkers: 4 }); w.node.parameters.get('density')!.value = 0.5; w.node.parameters.get('gain')!.value = 0.5; return this.radio.enabled ? mix(ctx, [this.radio.worldSpeaker(ctx, this.radio.stations[0].id, 'bar'), w.graph]) : w.graph; }
        case 'precinct': return mix(ctx, [humSource(ctx, noise), acUnitSource(ctx, noise, 12)]);
        case 'sro': return mix(ctx, [acUnitSource(ctx, noise, 13), humSource(ctx, noise)]);
        case 'loft': return mix(ctx, [textured(ctx, noise.white2, 2400, 2.5, 21, 0.85, 0.12), textured(ctx, noise.pink, 700, 1, 21, 0.7, 0.1)]);
        case 'cinema': { const m = workletSource(ctx, 't74-music', 2, {}); m.node.port.postMessage({ cmd: 'track', seed: 1959, bpm: 70, style: 1, offset: 0, gain: 0.5 }); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; m.graph.output.connect(lp); const film: SourceGraph = { output: lp, start: (w, o) => m.graph.start(w, o), stop: (w) => m.graph.stop(w), dispose: () => { m.node.port.postMessage({ cmd: 'dispose' }); m.graph.dispose(); lp.disconnect(); } };
          return mix(ctx, [textured(ctx, noise.white, 1800, 1.5, 24, 0.9, 0.04), film]); }
        case 'subway': { const g = gratingSource(ctx, noise, 5); this.grating = g; return g; }
        case 'rooftop': return mix(ctx, [windSource(ctx, noise, 9), windSource(ctx, noise, 10)]);
        default: return acUnitSource(ctx, noise, 14);
      }
    };
    return env.vm.play({ name: `room.${kind}`, bus: 'ambience', category: 'bed', priority: 6, loop: true, gain: 0, build });
  }

  update(dt: number) {
    if (!this.kind || !this.voice) return;
    if (this.kind === 'subway' && this.grating) { const t = (this.env.ctx.currentTime % 240) / 240; const r = Math.max(0, Math.sin(t * Math.PI * 2)) ** 3; this.grating.set(0.2 + r * 0.8, r * 0.6, r > 0.8 ? 0.3 : 0); }
    if (this.kind === 'precinct' && this.env.live && (this.typeT -= dt) <= 0) {
      // Typewriters: bursts of keys with the carriage bell now and then (baked UI tick doubles as a key).
      this.typeT = this.rng.range(0.08, 0.2) + (this.rng.next() < 0.08 ? this.rng.range(1, 4) : 0);
      const l = this.env.vm.listener.position; this.env.oneShot(this.rng.next() < 0.03 ? 'ui.select' : 'ui.move', { category: 'emitter', bus: 'ambience', gain: 0.25 * this.voice.gain, at: [l[0] + 3, l[1] - 0.8, l[2] + 2], rate: this.rng.range(0.85, 1.1) });
    }
  }
  dispose() { this.voice?.stop(0.05); this.voice = null; }
}
