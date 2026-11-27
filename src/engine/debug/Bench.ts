/**
 * On-device A/B bench (?bench=1, with ?hud=1 for the copy button). The real frame cost on a phone hides
 * outside what we can time (compositing DOM overlays, GPU work the timestamps miss, GPU->CPU waits), so
 * the bench toggles each suspect in turn at a fixed view and measures the real frame interval:
 * baseline, then one change at a time, each settled 1.5 s and measured 4 s. The table goes into the perf
 * report. Cost of X ~= baseline - (interval with X off).
 */
export interface BenchCase { name: string; apply(): void; revert(): void }

export class Bench {
  rows: { name: string; p50: number; p95: number; js: number; gpu: number | null }[] = [];
  done = false;
  private i = -1;
  private phase: 'settle' | 'measure' = 'settle';
  private t = 0;
  private iv: number[] = []; private js: number[] = []; private gpu: number[] = [];
  private el = document.createElement('div');
  constructor(private cases: BenchCase[]) {
    Object.assign(this.el.style, { position: 'fixed', left: '50%', top: '8px', transform: 'translateX(-50%)', zIndex: '60', font: '12px ui-monospace, monospace', color: '#efe3c4', background: '#0c0b0acc', padding: '4px 10px', pointerEvents: 'none' });
    this.el.className = 't74-bench';
    document.body.appendChild(this.el);
  }
  /** Call every frame once the view is settled. intervalMs: real rAF interval; jsMs: our callback time; gpuMs: latest GPU sample or null. */
  update(dt: number, intervalMs: number, jsMs: number, gpuMs: number | null) {
    if (this.done) return;
    if (this.i < 0) { this.next(); return; }
    this.t += dt;
    if (this.phase === 'settle') { if (this.t > 1.5) { this.phase = 'measure'; this.t = 0; this.iv = []; this.js = []; this.gpu = []; } return; }
    this.iv.push(intervalMs); this.js.push(jsMs); if (gpuMs != null) this.gpu.push(gpuMs);
    if (this.t < 4) return;
    const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
    this.rows.push({ name: this.cases[this.i].name, p50: q(this.iv, 0.5), p95: q(this.iv, 0.95), js: q(this.js, 0.5), gpu: this.gpu.length ? q(this.gpu, 0.5) : null });
    this.cases[this.i].revert();
    this.next();
  }
  private next() {
    this.i++; this.t = 0; this.phase = 'settle';
    if (this.i >= this.cases.length) { this.done = true; this.el.textContent = 'BENCH DONE · copy the perf report'; return; }
    this.cases[this.i].apply();
    this.el.textContent = `BENCH ${this.i + 1}/${this.cases.length} · ${this.cases[this.i].name} · hold still`;
  }
  text(): string {
    if (!this.rows.length) return 'bench: not run (add ?bench=1)';
    const base = this.rows[0];
    return ['bench (real frame interval at a fixed view; saving = baseline p50 - case p50):',
      ...this.rows.map((r) => `  ${r.name.padEnd(22)} p50 ${r.p50.toFixed(1).padStart(5)} ms  p95 ${r.p95.toFixed(1).padStart(5)} ms  js ${r.js.toFixed(1)} ms  gpu ${r.gpu == null ? '-' : r.gpu.toFixed(1) + ' ms'}${r === base ? '' : `  saving ${(base.p50 - r.p50).toFixed(1)} ms`}`),
      this.done ? '' : '  (incomplete)'].join('\n');
  }
}
