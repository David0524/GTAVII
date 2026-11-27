/**
 * Mix graph.
 *
 *   voices -> busIn[b] -> busVol[b] -> (duck: radio, ambience) -> (exterior filter: ambience) -> masterSum
 *   voices -> sendIn[b] -> sendVol[b] -> reverbIn -> early (canyon) + FDN (late) -> reverbOut -> masterSum
 *   dialogue busVol --key--> duckers          masterSum -> masterVol -> loudness trim -> TP limiter -> out
 *
 * User volumes act on both the dry bus and its reverb send, so a bus at 0 has no tail either.
 * Overheard/ambient speech enters a second dialogue input that does not key the duckers.
 */
import { BUSES, LOUDNESS, type BusId, type LoudnessProfile, type AudioQuality } from '../config';

type Ctx = BaseAudioContext;
type Bus = Exclude<BusId, 'master'>;

export interface ReverbParams {
  early: { dL: number; dR: number; gL: number; gR: number; dF: number; gF: number; dB: number; gB: number; flutter: number; gain: number };
  late: { rt60: number; damp: number; size: number; predelay: number; gain: number };
}

export class Mixer {
  readonly busIn = {} as Record<Bus, GainNode>;
  readonly sendIn = {} as Record<Bus, GainNode>;
  private busVol = {} as Record<Bus, GainNode>;
  private sendVol = {} as Record<Bus, GainNode>;
  readonly dialogueUnkeyed: GainNode;
  private dialogueUnkeyedVol: GainNode;
  private masterSum: GainNode; private masterVol: GainNode; private trim: GainNode; private comp: DynamicsCompressorNode;
  readonly limiter: AudioWorkletNode;
  private duckRadio: AudioWorkletNode; private duckAmb: AudioWorkletNode;
  private extFilter: BiquadFilterNode; private extGain: GainNode;
  /** HDR window: world bed and radio dip after loud events (gunfire) so they stay loud without raising the integrated level. */
  private hdrAmb: GainNode; private hdrRadio: GainNode; private hdrUntil = 0; private hdrDepth = 0;
  private reverbIn: GainNode; private early: AudioWorkletNode; private fdn: AudioWorkletNode; private reverbOut: GainNode;
  readonly output: AudioNode;
  private nodes: AudioNode[] = [];
  readonly stats = { limiterGrDb: 0, nans: 0, clips: 0, peakIn: 0, duckRadioDb: 0, over1dB: 0, over3dB: 0, maxGrDb: 0, hdrDb: 0, hdrEvents: 0 };
  meters: Partial<Record<BusId | 'reverb', AnalyserNode>> = {};

  constructor(private ctx: Ctx, q: AudioQuality, destination: AudioNode = ctx.destination) {
    const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; this.nodes.push(n); return n; };
    this.masterSum = g(); this.masterVol = g(); this.trim = g();
    this.limiter = new AudioWorkletNode(ctx, 't74-limiter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    this.limiter.port.onmessage = (e) => { const d = e.data; this.stats.limiterGrDb = d.gr; this.stats.nans = d.nans; this.stats.clips = d.clips; this.stats.peakIn = d.peakIn; this.stats.over1dB = d.over1dB; this.stats.over3dB = d.over3dB; this.stats.maxGrDb = d.maxGrDb; };
    this.nodes.push(this.limiter);
    this.comp = ctx.createDynamicsCompressor(); this.nodes.push(this.comp);
    this.masterSum.connect(this.masterVol).connect(this.trim).connect(this.comp).connect(this.limiter).connect(destination);
    this.output = this.limiter;

    const duck = (depth: number) => {
      const n = new AudioWorkletNode(ctx, 't74-duck', { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2] });
      n.parameters.get('depth')!.value = depth; this.nodes.push(n); return n;
    };
    this.duckRadio = duck(-11); this.duckAmb = duck(-5);
    this.duckRadio.port.onmessage = (e) => { this.stats.duckRadioDb = e.data; };
    this.extFilter = ctx.createBiquadFilter(); this.extFilter.type = 'lowpass'; this.extFilter.frequency.value = 20000; this.extFilter.Q.value = 0.5; this.nodes.push(this.extFilter);
    this.extGain = g(); this.hdrAmb = g(); this.hdrRadio = g();

    for (const b of BUSES) {
      this.busIn[b] = g(); this.busVol[b] = g(); this.sendIn[b] = g(); this.sendVol[b] = g();
      this.busIn[b].connect(this.busVol[b]);
      if (b === 'radio') this.busVol[b].connect(this.duckRadio, 0, 0).connect(this.hdrRadio).connect(this.masterSum);
      else if (b === 'ambience') this.busVol[b].connect(this.duckAmb, 0, 0).connect(this.extFilter).connect(this.extGain).connect(this.hdrAmb).connect(this.masterSum);
      else this.busVol[b].connect(this.masterSum);
      this.sendIn[b].connect(this.sendVol[b]);
    }
    this.busVol.dialogue.connect(this.duckRadio, 0, 1);
    this.busVol.dialogue.connect(this.duckAmb, 0, 1);
    this.dialogueUnkeyed = g(); this.dialogueUnkeyedVol = g();
    this.dialogueUnkeyed.connect(this.dialogueUnkeyedVol).connect(this.masterSum);

    this.reverbIn = g(); this.reverbOut = g(1);
    for (const b of BUSES) if (b !== 'ui') this.sendVol[b].connect(this.reverbIn);
    this.early = new AudioWorkletNode(ctx, 't74-early', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    this.fdn = new AudioWorkletNode(ctx, 't74-fdn', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { lines: q.fdnLines } });
    this.nodes.push(this.early, this.fdn);
    this.reverbIn.connect(this.early).connect(this.reverbOut);
    this.reverbIn.connect(this.fdn).connect(this.reverbOut);
    this.reverbOut.connect(this.masterSum);
    this.setLoudness('mobile');
  }

  get now() { return this.ctx.currentTime; }

  /**
   * HDR window: dip the ambience and radio buses by `db` (negative) right away, hold, then recover over
   * `release` s. A deeper event inside an active window deepens it; a shallower one only extends the hold.
   */
  hdr(db: number, hold = 0.25, release = 0.9) {
    const t = this.ctx.currentTime; const active = t < this.hdrUntil;
    const depth = active ? Math.min(this.hdrDepth, db) : db; this.hdrDepth = depth; this.hdrUntil = t + hold + release;
    const lin = Math.pow(10, depth / 20);
    for (const p of [this.hdrAmb.gain, this.hdrRadio.gain]) { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.setTargetAtTime(lin, t, 0.008); p.setTargetAtTime(1, t + hold, release / 3); }
    this.stats.hdrDb = depth; this.stats.hdrEvents++;
  }

  setBusVolume(bus: BusId, v: number) {
    const lin = Math.max(0, Math.min(1, v)); const gv = lin * lin; // perceptual-ish (squared) taper for sliders
    const t = this.ctx.currentTime;
    // Before audio starts (settings applied at boot) jump straight there; afterwards glide (no zipper).
    const set = (p: AudioParam) => { if (t < 0.05) p.value = gv; else p.setTargetAtTime(gv, t, 0.03); };
    if (bus === 'master') { set(this.masterVol.gain); return; }
    set(this.busVol[bus].gain); set(this.sendVol[bus].gain);
    if (bus === 'dialogue') set(this.dialogueUnkeyedVol.gain);
  }

  setLoudness(p: LoudnessProfile) {
    const L = LOUDNESS[p];
    this.trim.gain.setTargetAtTime(Math.pow(10, L.trimDb / 20), this.ctx.currentTime, 0.05);
    this.limiter.parameters.get('ceiling')!.value = L.ceilingDbtp;
    const c = this.comp, t = this.ctx.currentTime;
    c.threshold.setValueAtTime(L.comp.threshold, t); c.ratio.setValueAtTime(L.comp.ratio, t); c.knee.setValueAtTime(L.comp.knee, t);
    c.attack.setValueAtTime(L.comp.attack, t); c.release.setValueAtTime(L.comp.release, t);
  }

  /** Inside a building: exterior ambience through walls and glass. amount 0 = street, 1 = deep inside. */
  setExterior(amount: number) {
    const t = this.ctx.currentTime, a = Math.max(0, Math.min(1, amount));
    this.extFilter.frequency.setTargetAtTime(20000 * Math.pow(650 / 20000, a), t, 0.12);
    this.extGain.gain.setTargetAtTime(1 - 0.68 * a, t, 0.12);
  }

  setReverb(p: ReverbParams, tc = 0.4) {
    const t = this.ctx.currentTime;
    const set = (n: AudioWorkletNode, k: string, v: number) => n.parameters.get(k)!.setTargetAtTime(v, t, tc);
    for (const [k, v] of Object.entries(p.early)) set(this.early, k, v);
    // FDN coefficients are recomputed on change; step them rather than automating every block.
    for (const [k, v] of Object.entries(p.late)) {
      const prm = this.fdn.parameters.get(k)!;
      if (k === 'gain' || k === 'predelay') prm.setTargetAtTime(v, t, tc); else prm.value = v;
    }
  }

  enableMeters() {
    if (Object.keys(this.meters).length) return this.meters;
    const mk = (src: AudioNode, k: BusId | 'reverb') => { const a = this.ctx.createAnalyser(); a.fftSize = 1024; a.smoothingTimeConstant = 0; src.connect(a); this.meters[k] = a; this.nodes.push(a); };
    for (const b of BUSES) mk(this.busVol[b], b);
    mk(this.reverbOut, 'reverb'); mk(this.limiter, 'master');
    return this.meters;
  }

  dispose() {
    for (const n of this.nodes) { try { n.disconnect(); } catch { /* */ } if (n instanceof AudioWorkletNode) { n.port.onmessage = null; n.port.postMessage('dispose'); } }
    this.nodes = [];
  }
}
