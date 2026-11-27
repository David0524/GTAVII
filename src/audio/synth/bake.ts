/**
 * Baked one-shots: pure functions (no Web Audio, no DOM) that synthesise a mono sound into a
 * Float32Array. They run at load time in the browser (lazily, per family, counted against the
 * memory budget) and in Node for the offline asset build (tools/audio/bake.ts), which encodes
 * the long ones (thunder) to Opus and AAC to prove the streaming path.
 *
 * Every family is original synthesis: modal resonators for metal and glass, filtered noise for
 * air and friction, FM for birds, simple physical intuition for timing. No samples.
 */
import { Rng, Pink, Brown, OnePole, Biquad, Mode, TAU, clamp } from '../worklets/dsp';

export type Baker = (seed: number, sr: number) => Float32Array;

const len = (s: number, sr: number) => new Float32Array(Math.max(1, Math.round(s * sr)));
const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp(-(t - a) / d));
function normalize(x: Float32Array, peak = 0.9) { let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); if (m > 0) { const k = peak / m; for (let i = 0; i < x.length; i++) x[i] *= k; } return x; }
function fadeOut(x: Float32Array, sr: number, s = 0.01) { const n = Math.min(x.length, Math.round(s * sr)); for (let i = 0; i < n; i++) x[x.length - 1 - i] *= i / n; return x; }

/** Sum of decaying modes excited by a short noise/impulse burst. */
function modal(out: Float32Array, sr: number, r: Rng, at: number, modes: [number, number, number][], strike = 0.002) {
  const ms = modes.map(([f, dec, a]) => { const m = new Mode(); m.start(f * (1 + r.bi() * 0.01), dec, a, sr); return m; });
  const lp = new OnePole(6000, sr); const sN = Math.round(strike * sr);
  const i0 = Math.round(at * sr);
  for (let i = i0; i < out.length; i++) {
    let v = 0; for (const m of ms) v += m.run();
    if (i - i0 < sN) v += lp.lp(r.bi()) * (1 - (i - i0) / sN) * 0.6;
    out[i] += v;
  }
}

export const BAKERS: Record<string, { bake: Baker; dur: number; gain?: number }> = {
  /** Car door: heavy panel thump, latch clack, a little window-glass rattle. */
  'door.slam': { dur: 0.6, bake: (s, sr) => {
    const r = new Rng(s), o = len(0.6, sr), lp = new OnePole(260, sr), b = new Brown(r);
    for (let i = 0; i < o.length; i++) { const t = i / sr; o[i] = lp.lp(b.next()) * env(t, 0.002, 0.06) * 2.4; }
    modal(o, sr, r, 0.004, [[r.range(95, 130), 0.09, 0.7], [r.range(210, 260), 0.06, 0.4], [r.range(1800, 2400), 0.02, 0.15]]);
    modal(o, sr, r, 0.012, [[r.range(2500, 3400), 0.015, 0.25], [r.range(4100, 5200), 0.01, 0.15]], 0.0008); // latch
    return fadeOut(normalize(o, 0.85), sr);
  } },
  /** City bus door: pneumatic exhaust hiss, then the fold-door clunk. */
  'bus.door': { dur: 1.6, bake: (s, sr) => {
    const r = new Rng(s), o = len(1.6, sr), hp = new OnePole(1800, sr), bp = new Biquad().set('bp', 3200, 1.2, sr);
    for (let i = 0; i < o.length; i++) { const t = i / sr; o[i] = bp.run(hp.hp(r.bi())) * (t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) / 0.35)) * 0.9; }
    modal(o, sr, r, 0.45, [[r.range(140, 180), 0.08, 0.8], [r.range(620, 720), 0.05, 0.3], [r.range(1500, 1900), 0.03, 0.2]], 0.004);
    return fadeOut(normalize(o, 0.8), sr);
  } },
  /** Light car-to-car impact: crumple noise, panel modes, bumper chrome ring. */
  'impact.light': { dur: 1.0, bake: (s, sr) => {
    const r = new Rng(s), o = len(1.0, sr), p = new Pink(r), lp = new OnePole(2200, sr);
    for (let i = 0; i < o.length; i++) { const t = i / sr; o[i] = lp.lp(p.next()) * env(t, 0.001, 0.05) * (1 + 0.6 * Math.sin(t * 90)) * 1.6; }
    modal(o, sr, r, 0, [[r.range(70, 110), 0.12, 0.9], [r.range(180, 260), 0.09, 0.5], [r.range(900, 1400), 0.12, 0.25], [r.range(2300, 3100), 0.25, 0.12]]);
    return fadeOut(normalize(o, 0.9), sr);
  } },
  /** Heavy impact: sustained crunch with stochastic metal tearing and a low body thud. */
  'impact.heavy': { dur: 1.8, bake: (s, sr) => {
    const r = new Rng(s), o = len(1.8, sr), b = new Brown(r), bp = new Biquad().set('bp', 1300, 0.7, sr), lp = new OnePole(180, sr);
    let crack = 0;
    for (let i = 0; i < o.length; i++) {
      const t = i / sr; if (r.next() < 0.004 * Math.exp(-t / 0.3)) crack = r.range(0.4, 1);
      crack *= 0.997;
      o[i] = lp.lp(b.next()) * env(t, 0.001, 0.15) * 3 + bp.run(r.bi()) * (env(t, 0.002, 0.25) * 0.8 + crack);
    }
    modal(o, sr, r, 0, [[r.range(55, 80), 0.2, 1], [r.range(140, 190), 0.15, 0.6], [r.range(600, 900), 0.2, 0.3], [r.range(1700, 2600), 0.35, 0.15], [r.range(3500, 4800), 0.3, 0.08]]);
    return fadeOut(normalize(o, 0.95), sr);
  } },
  /** Glass shatter: dense cloud of high modes with falling shards afterwards. */
  'glass': { dur: 1.6, bake: (s, sr) => {
    const r = new Rng(s), o = len(1.6, sr);
    for (let k = 0; k < 60; k++) { const at = k < 20 ? r.range(0, 0.04) : r.range(0.08, 1.2) ** 1.3; modal(o, sr, r, at, [[r.range(2500, 9000), r.range(0.02, 0.12), r.range(0.05, 0.3) * (k < 20 ? 1 : 0.5)], [r.range(4000, 11000), 0.04, 0.1]], 0.0005); }
    const hp = new OnePole(3000, sr); for (let i = 0; i < Math.min(o.length, sr * 0.08); i++) o[i] += hp.hp(r.bi()) * (1 - i / (sr * 0.08)) * 0.8;
    return fadeOut(normalize(o, 0.8), sr);
  } },
  /** Brake squeal at walking pace: a slowly wavering high whistle. */
  'brake.squeal': { dur: 1.4, bake: (s, sr) => {
    const r = new Rng(s), o = len(1.4, sr); const f = r.range(2600, 4200); let ph = 0; const bp = new Biquad().set('bp', f, 20, sr);
    for (let i = 0; i < o.length; i++) { const t = i / sr; ph += (f * (1 + 0.012 * Math.sin(TAU * 5.5 * t) + 0.004 * r.bi())) / sr; const e = Math.sin(Math.PI * clamp(t / 1.3, 0, 1)) ** 0.6; o[i] = (Math.sin(TAU * ph) * 0.7 + bp.run(r.bi()) * 2) * e; }
    return fadeOut(normalize(o, 0.6), sr);
  } },
  /** Signal-controller relay click (electromechanical cabinets of the era). */
  'signal.click': { dur: 0.15, bake: (s, sr) => {
    const r = new Rng(s), o = len(0.15, sr);
    modal(o, sr, r, 0, [[r.range(1800, 2300), 0.012, 0.6], [r.range(3500, 4200), 0.008, 0.4], [r.range(420, 520), 0.02, 0.3]], 0.0006);
    modal(o, sr, r, r.range(0.035, 0.05), [[r.range(1600, 2100), 0.01, 0.3], [r.range(3800, 4500), 0.006, 0.2]], 0.0005);
    return fadeOut(normalize(o, 0.7), sr);
  } },
  /** Loose manhole cover rocked by a wheel: the double clank every New Yorker knows. */
  'manhole.clank': { dur: 0.9, bake: (s, sr) => {
    const r = new Rng(s), o = len(0.9, sr);
    const modes = (): [number, number, number][] => [[r.range(180, 230), 0.25, 0.9], [r.range(410, 470), 0.18, 0.5], [r.range(960, 1100), 0.12, 0.3], [r.range(2100, 2500), 0.06, 0.15]];
    modal(o, sr, r, 0, modes(), 0.002); modal(o, sr, r, r.range(0.09, 0.16), modes().map(([f, d, a]) => [f * 1.01, d, a * 0.7] as [number, number, number]), 0.002);
    return fadeOut(normalize(o, 0.9), sr);
  } },
  /** Garment-district handcart over pavement joints: a burst of wheel rattles. */
  'cart.rattle': { dur: 2.2, bake: (s, sr) => {
    const r = new Rng(s), o = len(2.2, sr); let t = 0.02;
    while (t < 2.0) { modal(o, sr, r, t, [[r.range(300, 600), 0.03, 0.4], [r.range(1200, 2400), 0.02, 0.2]], 0.002); t += r.range(0.04, 0.12) + (r.next() < 0.1 ? 0.25 : 0); }
    const lp = new OnePole(900, sr), b = new Brown(r); for (let i = 0; i < o.length; i++) o[i] += lp.lp(b.next()) * 0.25 * Math.sin(Math.PI * i / o.length);
    return fadeOut(normalize(o, 0.7), sr);
  } },
  /** Loading dock: steel dock plate or roll-up door slammed down. */
  'dock.bang': { dur: 2.0, bake: (s, sr) => {
    const r = new Rng(s), o = len(2.0, sr);
    modal(o, sr, r, 0, [[r.range(70, 95), 0.5, 1], [r.range(160, 210), 0.4, 0.6], [r.range(350, 450), 0.35, 0.4], [r.range(820, 1000), 0.25, 0.2], [r.range(1900, 2300), 0.15, 0.1]], 0.004);
    return fadeOut(normalize(o, 0.9), sr);
  } },
  /** Condensate drip from a window AC unit onto the sidewalk (or a puddle): a tick and a small bubble. */
  'drip': { dur: 0.18, bake: (s, sr) => {
    const r = new Rng(s), o = len(0.18, sr), hp = new OnePole(2500, sr);
    for (let i = 0; i < sr * 0.002; i++) o[i] += hp.hp(r.bi()) * (1 - i / (sr * 0.002)) * 0.5;
    const f = r.range(900, 2200); const m = new Mode(); m.start(f, r.range(0.02, 0.05), r.next() < 0.6 ? 0.6 : 0.15, sr, 3);
    for (let i = 0; i < o.length; i++) o[i] += m.run();
    return fadeOut(normalize(o, 0.6), sr);
  } },
  /** Two-finger cab-hailing whistle. */
  'whistle.hail': { dur: 0.9, bake: (s, sr) => {
    const r = new Rng(s), o = len(0.9, sr); let ph = 0; const f0 = r.range(2300, 2900), hp = new OnePole(2000, sr);
    for (let i = 0; i < o.length; i++) { const t = i / sr; const f = t < 0.12 ? f0 * (0.8 + 0.2 * t / 0.12) : f0 * (1 + 0.04 * Math.sin(TAU * 3 * t)) * (t > 0.6 ? 1 - (t - 0.6) * 0.5 : 1); ph += f / sr; const e = clamp(t / 0.04, 0, 1) * (t > 0.75 ? Math.max(0, 1 - (t - 0.75) / 0.12) : 1); o[i] = (Math.sin(TAU * ph) + hp.hp(r.bi()) * 0.12) * e; }
    return fadeOut(normalize(o, 0.7), sr);
  } },
  /** Footsteps by surface: heel strike then toe roll; surface sets the spectrum and grit. */
  'step.concrete': { dur: 0.22, bake: (s, sr) => step(s, sr, 1400, 0.012, 0.3, 0) },
  'step.asphalt': { dur: 0.22, bake: (s, sr) => step(s, sr, 900, 0.016, 0.45, 0) },
  'step.grating': { dur: 0.35, bake: (s, sr) => step(s, sr, 1200, 0.012, 0.25, 1) },
  'step.park': { dur: 0.25, bake: (s, sr) => step(s, sr, 2600, 0.02, 0.8, 2) },
  'step.wood': { dur: 0.25, bake: (s, sr) => step(s, sr, 700, 0.02, 0.2, 3) },
  'step.tile': { dur: 0.2, bake: (s, sr) => step(s, sr, 2000, 0.008, 0.2, 4) },
  // ---------------------------------------------------------------- movement set (docs/briefs/MOVEMENT.md)
  /** Granite kerb: hard, bright heel click with a short stone ring. */
  'step.granite': { dur: 0.2, bake: (s, sr) => { const o = step(s, sr, 2400, 0.006, 0.15, 0); const r = new Rng(s + 1); modal(o, sr, r, 0.001, [[r.range(3200, 4200), 0.008, 0.25], [r.range(1700, 2100), 0.012, 0.2]], 0.0004); return fadeOut(normalize(o, 0.7), sr); } },
  /** Glazed subway tile over concrete: click plus the tiled room's flutter does the rest. */
  'step.subwaytile': { dur: 0.22, bake: (s, sr) => { const o = step(s, sr, 2200, 0.007, 0.15, 4); const r = new Rng(s + 2); modal(o, sr, r, 0.001, [[r.range(4200, 5200), 0.012, 0.2]], 0.0004); return fadeOut(normalize(o, 0.7), sr); } },
  /** Brownstone/wood stoop step: hollow riser boom under the tread. */
  'step.stoop': { dur: 0.3, bake: (s, sr) => { const o = step(s, sr, 650, 0.018, 0.25, 3); const r = new Rng(s + 3); modal(o, sr, r, 0.002, [[r.range(95, 130), 0.07, 0.8], [r.range(240, 300), 0.04, 0.35]], 0.003); return fadeOut(normalize(o, 0.75), sr); } },
  /** Fire-escape iron: grated tread clank, rattle of the loose landing, long ringing modes. */
  'step.iron': { dur: 0.6, bake: (s, sr) => {
    const r = new Rng(s), o = len(0.6, sr);
    modal(o, sr, r, 0, [[r.range(210, 260), 0.18, 0.7], [r.range(530, 610), 0.12, 0.45], [r.range(1150, 1350), 0.09, 0.3], [r.range(2500, 2900), 0.05, 0.15]], 0.0015);
    for (let k = 0; k < 4; k++) modal(o, sr, r, 0.02 + k * r.range(0.025, 0.05), [[r.range(700, 1500), 0.02, 0.18 / (k + 1)]], 0.0008); // loose bolts
    return fadeOut(normalize(o, 0.75), sr);
  } },
  /** Ladder rung (fire-escape drop ladder, sidewalk scaffold): sharp tube ping. */
  'step.rung': { dur: 0.35, bake: (s, sr) => { const r = new Rng(s), o = len(0.35, sr); modal(o, sr, r, 0, [[r.range(780, 900), 0.12, 0.6], [r.range(2150, 2450), 0.07, 0.35], [r.range(4200, 4700), 0.03, 0.15]], 0.0008); return fadeOut(normalize(o, 0.7), sr); } },
  /** Gravel over roof tar: granular crunch (many tiny stones) on a soft, damped base. */
  'step.gravel': { dur: 0.3, bake: (s, sr) => {
    const r = new Rng(s), o = len(0.3, sr), lp = new OnePole(260, sr);
    for (let k = 0; k < 70; k++) { const t0 = Math.pow(r.next(), 1.8) * 0.18; modal(o, sr, r, t0, [[r.range(2500, 7000), r.range(0.002, 0.006), r.range(0.05, 0.25)]], 0.0003); }
    for (let i = 0; i < sr * 0.06; i++) o[i] += lp.lp(r.bi()) * (1 - i / (sr * 0.06)) * 0.9; // tar thud
    return fadeOut(normalize(o, 0.7), sr);
  } },
  /** Chain-link fence: wire mesh rattle from a hand/foot hold (also the drop over the top). */
  'fence.rattle': { dur: 1.1, bake: (s, sr) => {
    const r = new Rng(s), o = len(1.1, sr);
    for (let k = 0; k < 90; k++) { const t0 = Math.pow(r.next(), 1.5) * 0.9; modal(o, sr, r, t0, [[r.range(1800, 5200), r.range(0.01, 0.04), r.range(0.04, 0.2) * Math.exp(-t0 * 2)]], 0.0004); }
    modal(o, sr, r, 0, [[r.range(60, 90), 0.25, 0.5], [r.range(140, 180), 0.15, 0.3]], 0.004); // post and panel flex
    return fadeOut(normalize(o, 0.7), sr);
  } },
  /** Cloth rustle (jacket/trousers), used under every traversal move. */
  'foley.cloth': { dur: 0.45, bake: (s, sr) => fadeOut(normalize(cloth(new Rng(s), len(0.45, sr), sr, 0, 0.45, 1), 0.5), sr) },
  /** Vault: two hand slaps on the obstacle, body swish, light land. */
  'foley.vault': { dur: 0.9, bake: (s, sr) => {
    const r = new Rng(s), o = len(0.9, sr);
    hit(o, sr, r, 0, 0.6, 1800); hit(o, sr, r, r.range(0.03, 0.06), 0.5, 1700);
    cloth(r, o, sr, 0.05, 0.5, 0.8); body(o, sr, r, r.range(0.5, 0.6), 0.7);
    return fadeOut(normalize(o, 0.8), sr);
  } },
  /** Climb: hand plant, shoe scrape up the wall, pull-up cloth. */
  'foley.climb': { dur: 1.4, bake: (s, sr) => {
    const r = new Rng(s), o = len(1.4, sr); hit(o, sr, r, 0, 0.7, 1500); hit(o, sr, r, r.range(0.12, 0.2), 0.5, 1500);
    const bp = new Biquad().set('bp', 2200, 1.2, sr); for (let i = Math.round(sr * 0.25); i < sr * 0.75; i++) { const t = i / sr - 0.25; o[i] += bp.run(r.bi()) * Math.sin(Math.PI * t / 0.5) * 0.25; } // shoe scrape
    cloth(r, o, sr, 0.3, 0.9, 1); return fadeOut(normalize(o, 0.75), sr);
  } },
  /** Landing from a drop: heavy body thump, both feet, knees, cloth. */
  'foley.land': { dur: 0.7, bake: (s, sr) => { const r = new Rng(s), o = len(0.7, sr); body(o, sr, r, 0, 1); hit(o, sr, r, 0.008, 0.5, 900); cloth(r, o, sr, 0.02, 0.4, 0.7); return fadeOut(normalize(o, 0.85), sr); } },
  /** Landing roll: shoulder, back and hip contacts in sequence with grit scrape and cloth. */
  'foley.roll': { dur: 1.3, bake: (s, sr) => {
    const r = new Rng(s), o = len(1.3, sr); for (const [t, a] of [[0, 0.8], [0.22, 0.6], [0.45, 0.5], [0.7, 0.7]] as [number, number][]) body(o, sr, r, t + r.range(-0.02, 0.02), a);
    const hp = new OnePole(1800, sr); for (let i = 0; i < sr * 0.9; i++) o[i] += hp.hp(r.bi()) * 0.12 * Math.sin(Math.PI * i / (sr * 0.9));
    cloth(r, o, sr, 0, 1.1, 1.2); return fadeOut(normalize(o, 0.8), sr);
  } },
  /** Ragdoll body impact (hit by a car, fall): dull, heavy, no bones-snap gore. */
  'foley.ragdoll': { dur: 0.8, bake: (s, sr) => { const r = new Rng(s), o = len(0.8, sr); body(o, sr, r, 0, 1.2); body(o, sr, r, r.range(0.12, 0.25), 0.6); cloth(r, o, sr, 0, 0.6, 0.9); return fadeOut(normalize(o, 0.85), sr); } },
  /** Birds: house-sparrow chirps, starling whistles, pigeon coos (FM and AM synthesis). */
  'bird.sparrow': { dur: 0.5, bake: (s, sr) => {
    const r = new Rng(s), o = len(0.5, sr); let t0 = 0;
    for (let n = 0; n < r.range(2, 5); n++) { const d = r.range(0.04, 0.08), f = r.range(3200, 4800); let ph = 0; for (let i = 0; i < d * sr; i++) { const t = i / sr; const ff = f * (1 + 0.25 * Math.sin(Math.PI * t / d)) ; ph += ff / sr; const k = Math.round((t0 + t) * sr); if (k < o.length) o[k] += Math.sin(TAU * ph) * Math.sin(Math.PI * t / d); } t0 += d + r.range(0.03, 0.07); }
    return fadeOut(normalize(o, 0.6), sr);
  } },
  'bird.starling': { dur: 0.9, bake: (s, sr) => {
    const r = new Rng(s), o = len(0.9, sr); let ph = 0, mph = 0; const f0 = r.range(2200, 3600), fm = r.range(40, 120), dev = r.range(300, 900);
    for (let i = 0; i < o.length; i++) { const t = i / sr; mph += fm / sr; ph += (f0 + dev * Math.sin(TAU * mph) + 900 * Math.sin(Math.PI * t / 0.9)) / sr; o[i] = Math.sin(TAU * ph) * Math.sin(Math.PI * t / 0.9) ** 2; }
    return fadeOut(normalize(o, 0.5), sr);
  } },
  'bird.pigeon': { dur: 1.3, bake: (s, sr) => {
    const r = new Rng(s), o = len(1.3, sr); let ph = 0; const f0 = r.range(330, 420); const lp = new OnePole(900, sr);
    for (let i = 0; i < o.length; i++) { const t = i / sr; const seg = t < 0.35 ? Math.sin(Math.PI * t / 0.35) : t > 0.45 ? Math.sin(Math.PI * clamp((t - 0.45) / 0.8, 0, 1)) : 0; ph += f0 * (t < 0.35 ? 1 + 0.2 * t : 1.08 - 0.1 * (t - 0.45)) / sr; o[i] = lp.lp(Math.sin(TAU * ph) + 0.4 * Math.sin(2 * TAU * ph) + r.bi() * 0.25) * seg * (1 + 0.5 * Math.sin(TAU * 28 * t)); }
    return fadeOut(normalize(o, 0.55), sr);
  } },
  /** Thunder: near crack plus long rumbling roll. Long: these are the ones we stream encoded. */
  'thunder.near': { dur: 9, bake: (s, sr) => thunder(s, sr, 9, true) },
  'thunder.far': { dur: 11, bake: (s, sr) => thunder(s, sr, 11, false) },
  /** Brownout: a transformer clunk and the hum winding down. */
  'power.down': { dur: 3.5, bake: (s, sr) => {
    const r = new Rng(s), o = len(3.5, sr); let ph = 0; const lp = new OnePole(700, sr);
    for (let i = 0; i < o.length; i++) { const t = i / sr; const f = 120 * Math.max(0.15, 1 - t / 2.6); ph += f / sr; o[i] = lp.lp(Math.sign(Math.sin(TAU * ph)) * 0.35 + Math.sin(TAU * ph * 0.5)) * Math.max(0, 1 - t / 3) * 0.5; }
    modal(o, sr, r, 0, [[r.range(60, 80), 0.4, 1], [r.range(150, 190), 0.3, 0.5], [r.range(900, 1100), 0.1, 0.2]], 0.006);
    return fadeOut(normalize(o, 0.8), sr);
  } },
  'power.up': { dur: 2.2, bake: (s, sr) => {
    const r = new Rng(s), o = len(2.2, sr); let ph = 0; const lp = new OnePole(800, sr);
    for (let i = 0; i < o.length; i++) { const t = i / sr; const f = 120 * Math.min(1, 0.2 + t / 1.4); ph += f / sr; o[i] = lp.lp(Math.sign(Math.sin(TAU * ph)) * 0.3) * Math.min(1, t * 2) * Math.max(0, 1 - (t - 1.4) / 0.8) * 0.5; }
    modal(o, sr, r, 0, [[r.range(70, 90), 0.2, 0.7], [r.range(1200, 1500), 0.05, 0.2]], 0.003);
    return fadeOut(normalize(o, 0.6), sr);
  } },
  /** Garbage-truck compactor cycle: hydraulic whine rising under load, crunching, the blade knock. */
  'truck.compactor': { dur: 7, bake: (s, sr) => {
    const r = new Rng(s), o = len(7, sr); let ph = 0; const bp = new Biquad().set('bp', 900, 1.2, sr), b = new Brown(r); let crunch = 0;
    for (let i = 0; i < o.length; i++) {
      const t = i / sr; const press = t < 1 ? t : t < 5 ? 1 + 0.25 * (t - 1) / 4 : Math.max(0, 2 - (t - 5) * 0.6);
      ph += (260 + 140 * press) / sr;
      const whine = (Math.sin(TAU * ph) + 0.35 * Math.sin(2 * TAU * ph) + 0.15 * Math.sin(3 * TAU * ph)) * 0.25 * clamp(t * 3, 0, 1) * clamp((7 - t) * 2, 0, 1);
      if (t > 1.5 && t < 5 && r.next() < 0.0012) crunch = r.range(0.5, 1.2); crunch *= 0.9993;
      o[i] = whine + bp.run(b.next()) * crunch * 1.5;
    }
    modal(o, sr, r, 5.2, [[r.range(80, 110), 0.3, 1.5], [r.range(260, 320), 0.2, 0.7], [r.range(900, 1100), 0.1, 0.3]], 0.004);
    return fadeOut(normalize(o, 0.85), sr);
  } },
  /** Distant jackhammer: a burst of ~22 Hz blows. */
  'jackhammer': { dur: 3.2, bake: (s, sr) => {
    const r = new Rng(s), o = len(3.2, sr); const n = Math.round(r.range(2, 3) * 22);
    for (let k = 0; k < n; k++) modal(o, sr, r, 0.05 + k / 22 + r.bi() * 0.002, [[r.range(140, 170), 0.02, 0.8], [r.range(700, 900), 0.012, 0.4], [r.range(2000, 2600), 0.006, 0.25]], 0.003);
    return fadeOut(normalize(o, 0.8), sr);
  } },
  /** Ship's horn from the Hudson piers at night (heard ~1.5 km away; the reverb does the rest). */
  'ship.horn': { dur: 4.5, bake: (s, sr) => {
    const r = new Rng(s), o = len(4.5, sr); let a = 0, b2 = 0; const f = r.range(95, 125), lp = new OnePole(700, sr);
    for (let i = 0; i < o.length; i++) { const t = i / sr; a += f / sr; b2 += f * 1.26 / sr; const e = clamp(t / 0.4, 0, 1) * clamp((3.6 - t) / 0.5, 0, 1); o[i] = lp.lp(Math.tanh((Math.sin(TAU * a) + 0.7 * Math.sin(TAU * b2)) * 2.5)) * e; }
    return fadeOut(normalize(o, 0.8), sr);
  } },
  /** Church bell (generic bronze bell modes: hum, prime, tierce, quint, nominal). */
  'bell': { dur: 5, bake: (s, sr) => {
    const r = new Rng(s), o = len(5, sr); const f = r.range(300, 420);
    modal(o, sr, r, 0, [[f * 0.5, 3.5, 0.6], [f, 2.6, 0.8], [f * 1.19, 2.0, 0.5], [f * 1.5, 1.6, 0.35], [f * 2, 1.3, 0.5], [f * 2.52, 0.9, 0.25], [f * 3.01, 0.7, 0.15]], 0.003);
    return fadeOut(normalize(o, 0.8), sr);
  } },
  /** Distant firework: thump of the launch is lost, just the burst and the city slapback. */
  'firework': { dur: 2.5, bake: (s, sr) => {
    const r = new Rng(s), o = len(2.5, sr), lp = new OnePole(500, sr), b = new Brown(r);
    for (let i = 0; i < o.length; i++) { const t = i / sr; o[i] = lp.lp(b.next()) * env(t, 0.003, 0.25) * 3; }
    for (let k = 0; k < 30; k++) modal(o, sr, r, r.range(0.25, 1.6), [[r.range(1500, 4000), 0.01, r.range(0.02, 0.08)]], 0.0005);
    return fadeOut(normalize(o, 0.8), sr);
  } },
  // ------------------------------------------------------------------ UI
  /** Menu move: a soft typewriter-key tick. */
  'ui.move': { dur: 0.08, gain: 0.5, bake: (s, sr) => { const r = new Rng(s), o = len(0.08, sr); modal(o, sr, r, 0, [[r.range(2200, 2500), 0.01, 0.5], [r.range(5200, 5600), 0.006, 0.3], [700, 0.012, 0.2]], 0.0005); return fadeOut(normalize(o, 0.6), sr); } },
  /** Menu select: a heavier carriage-return style clack and a bell ping. */
  'ui.select': { dur: 0.6, gain: 0.6, bake: (s, sr) => { const r = new Rng(s), o = len(0.6, sr); modal(o, sr, r, 0, [[r.range(900, 1100), 0.02, 0.6], [r.range(3000, 3400), 0.01, 0.3]], 0.001); modal(o, sr, r, 0.04, [[2093, 0.5, 0.25], [2093 * 2.76, 0.2, 0.08]], 0.0005); return fadeOut(normalize(o, 0.6), sr); } },
  'ui.back': { dur: 0.12, gain: 0.5, bake: (s, sr) => { const r = new Rng(s), o = len(0.12, sr); modal(o, sr, r, 0, [[r.range(600, 700), 0.02, 0.6], [r.range(1500, 1700), 0.01, 0.3]], 0.001); return fadeOut(normalize(o, 0.6), sr); } },
  /** Map: paper street map unfolding (crinkle bursts). */
  'ui.map': { dur: 0.7, gain: 0.5, bake: (s, sr) => { const r = new Rng(s), o = len(0.7, sr), hp = new OnePole(1500, sr); let e = 0; for (let i = 0; i < o.length; i++) { const t = i / sr; if (r.next() < 0.004) e = r.range(0.2, 1); e *= 0.996; o[i] = hp.hp(r.bi()) * (e + 0.05) * Math.sin(Math.PI * t / 0.7); } return fadeOut(normalize(o, 0.5), sr); } },
  /**
   * Character switch = film reel-change: projector sprocket rattle slowing, the changeover
   * shutter clack, then the new reel spinning up (matches the engine's film-burn transition).
   */
  'ui.switch': { dur: 1.8, gain: 0.7, bake: (s, sr) => {
    const r = new Rng(s), o = len(1.8, sr); let t = 0;
    while (t < 0.7) { const rate = 24 * (1 - t / 0.9); modal(o, sr, r, t, [[r.range(1500, 1900), 0.008, 0.25], [r.range(400, 500), 0.01, 0.2]], 0.0006); t += 1 / Math.max(rate, 6); }
    modal(o, sr, r, 0.78, [[r.range(250, 320), 0.06, 1], [r.range(1200, 1500), 0.03, 0.6], [r.range(3200, 3800), 0.015, 0.3]], 0.002);
    t = 0.9; while (t < 1.75) { const k = (t - 0.9) / 0.85; modal(o, sr, r, t, [[r.range(1500, 1900), 0.008, 0.25 * k], [r.range(400, 500), 0.01, 0.2 * k]], 0.0006); t += 1 / (6 + 18 * k); }
    const lp = new OnePole(3000, sr); for (let i = 0; i < o.length; i++) { const tt = i / sr; o[i] += lp.lp(r.bi()) * 0.06 * Math.exp(-Math.abs(tt - 0.8) / 0.25); }
    return fadeOut(normalize(o, 0.7), sr);
  } },
  'ui.pickup': { dur: 0.5, gain: 0.6, bake: (s, sr) => { const r = new Rng(s), o = len(0.5, sr); modal(o, sr, r, 0, [[1320, 0.15, 0.5], [1320 * 2.4, 0.08, 0.2]], 0.0005); modal(o, sr, r, 0.07, [[1760, 0.2, 0.5], [1760 * 2.4, 0.1, 0.2]], 0.0005); return fadeOut(normalize(o, 0.6), sr); } },
  /** Money: a few coins and a bill. */
  'ui.coins': { dur: 0.8, gain: 0.6, bake: (s, sr) => { const r = new Rng(s), o = len(0.8, sr); for (let k = 0; k < 4; k++) modal(o, sr, r, k * r.range(0.05, 0.11), [[r.range(3800, 5200), 0.12, 0.4], [r.range(7000, 9000), 0.06, 0.2], [r.range(2100, 2600), 0.08, 0.2]], 0.0004); return fadeOut(normalize(o, 0.6), sr); } },
  /** Bell telephone ringer: hammer between two gongs at ~20 Hz for 2 s. */
  'phone.ring': { dur: 2.2, bake: (s, sr) => { const r = new Rng(s), o = len(2.2, sr); for (let k = 0; k < 40; k++) modal(o, sr, r, k / 20, [[k % 2 ? 1180 : 1050, 0.35, 0.3], [(k % 2 ? 1180 : 1050) * 2.7, 0.12, 0.1]], 0.0005); return fadeOut(normalize(o, 0.8), sr); } },
};

function step(s: number, sr: number, f: number, dec: number, grit: number, kind: number): Float32Array {
  const r = new Rng(s), o = len(kind === 1 ? 0.35 : 0.22, sr), bp = new Biquad().set('bp', f * r.range(0.85, 1.15), 1.1, sr), lp = new OnePole(f * 2, sr);
  const heel = 0, toe = r.range(0.045, 0.075);
  for (let i = 0; i < o.length; i++) {
    const t = i / sr; const e = Math.exp(-(t - heel) / dec) + (t > toe ? 0.5 * Math.exp(-(t - toe) / (dec * 1.3)) : 0);
    o[i] = (bp.run(r.bi()) * (1 - grit) + lp.lp(r.bi()) * grit * (r.next() < 0.3 ? 2 : 0.6)) * e;
  }
  if (kind === 1) modal(o, sr, r, 0.002, [[r.range(380, 460), 0.08, 0.5], [r.range(900, 1100), 0.06, 0.3], [r.range(2300, 2700), 0.04, 0.15]], 0.001); // steel grating ring
  if (kind === 3) modal(o, sr, r, 0.001, [[r.range(160, 220), 0.03, 0.5]], 0.002);
  if (kind === 4) modal(o, sr, r, 0.001, [[r.range(2800, 3400), 0.01, 0.3]], 0.0005);
  // low body thump of the heel
  const lp2 = new OnePole(180, sr); for (let i = 0; i < Math.min(o.length, sr * 0.04); i++) o[i] += lp2.lp(r.bi()) * (1 - i / (sr * 0.04)) * 0.8;
  return fadeOut(normalize(o, 0.7), sr);
}

/** Fabric rustle: bursts of band-passed noise with a slow swish envelope. */
function cloth(r: Rng, o: Float32Array, sr: number, at: number, dur: number, amp: number): Float32Array {
  const bp = new Biquad().set('bp', r.range(2500, 4500), 0.8, sr); const i0 = Math.round(at * sr), n = Math.round(dur * sr); let burst = 0;
  for (let i = 0; i < n && i0 + i < o.length; i++) { if (r.next() < 0.002) burst = r.range(0.3, 1); burst *= 0.9993; const env = Math.sin(Math.PI * i / n); o[i0 + i] += bp.run(r.bi()) * env * (0.25 + burst) * 0.35 * amp; }
  return o;
}
/** Palm/shoe contact: short slap with a skin-on-surface resonance. */
function hit(o: Float32Array, sr: number, r: Rng, at: number, amp: number, f: number) {
  const bp = new Biquad().set('bp', f * r.range(0.8, 1.2), 1, sr); const i0 = Math.round(at * sr), n = Math.round(0.03 * sr);
  for (let i = 0; i < n && i0 + i < o.length; i++) o[i0 + i] += bp.run(r.bi()) * Math.exp(-i / (0.006 * sr)) * amp * 1.5;
}
/** Body mass on the ground: low thud with a little chest resonance. */
function body(o: Float32Array, sr: number, r: Rng, at: number, amp: number) {
  const lp = new OnePole(220, sr), i0 = Math.round(at * sr), n = Math.round(0.15 * sr);
  for (let i = 0; i < n && i0 + i < o.length; i++) o[i0 + i] += lp.lp(r.bi()) * Math.exp(-i / (0.035 * sr)) * amp * 3;
  modal(o, sr, r, at, [[r.range(70, 110), 0.06, 0.5 * amp], [r.range(180, 240), 0.03, 0.25 * amp]], 0.004);
}

function thunder(s: number, sr: number, dur: number, near: boolean): Float32Array {
  const r = new Rng(s), o = len(dur, sr), b = new Brown(r), p = new Pink(r);
  const lp = new OnePole(near ? 900 : 300, sr), lp2 = new OnePole(near ? 2500 : 600, sr), hp = new OnePole(25, sr);
  // Sum of many delayed "strokes" from points along the lightning channel at different distances.
  const strokes: { t: number; a: number; d: number }[] = [];
  const n = near ? 40 : 25;
  for (let k = 0; k < n; k++) strokes.push({ t: (near ? 0.02 : 0.3) + Math.pow(r.next(), 1.6) * dur * 0.55, a: r.range(0.2, 1) * (k === 0 && near ? 3 : 1), d: r.range(0.3, 1.2) });
  for (let i = 0; i < o.length; i++) {
    const t = i / sr; let e = 0;
    for (const st of strokes) if (t >= st.t) e += st.a * Math.exp(-(t - st.t) / st.d) * Math.min(1, (t - st.t) / 0.02);
    const tail = Math.min(1, t / 0.3) * Math.exp(-t / (dur * 0.35));
    o[i] = hp.hp(lp.lp(b.next()) * 2 * (e * 0.5 + tail) + (near ? lp2.lp(p.next()) * e * 0.4 : 0));
  }
  return fadeOut(normalize(o, 0.9), sr, 0.5);
}
