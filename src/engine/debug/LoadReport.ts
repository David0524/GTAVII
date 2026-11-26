/**
 * Load-time instrumentation (bug report 2026-11-26: "?webgl=1 takes a very long time to load").
 * Phase marks are ms since navigation start (performance.now(), so JS download + eval are included).
 * Chunk costs are split into worker time (fetch + parse + mesh, off the main thread) and main-thread
 * install time (buffer upload prep + scene insert). Real frame times (unclamped) are kept for the
 * first 30 s. Read it via __T74.load.text(), the ?hud=1 perf-report copy, or the console line
 * printed when the title becomes ready and when play starts.
 */
export const loadReport = {
  marks: [] as [string, number][],
  chunks: { n: 0, workerMs: 0, installMs: 0, firstReady: 0, lastReady: 0 },
  frames: [] as number[],
  cpu: [] as number[], // JS time inside the frame callback (rest of the frame = GPU/compositor/other)
  mark(name: string) { if (!this.marks.some(([n]) => n === name)) this.marks.push([name, performance.now()]); },
  frame(ms: number) { if (performance.now() < 30000 && this.frames.length < 4000) this.frames.push(ms); },
  frameCpu(ms: number) { if (performance.now() < 30000 && this.cpu.length < 4000) this.cpu.push(ms); },
  chunkReady(workerMs: number, installMs: number) {
    const c = this.chunks; c.n++; c.workerMs += workerMs; c.installMs += installMs;
    const t = performance.now(); if (!c.firstReady) c.firstReady = t; c.lastReady = t;
  },
  text(): string {
    const f = [...this.frames].sort((a, b) => a - b), q = (p: number) => (f.length ? f[Math.min(f.length - 1, Math.floor(f.length * p))] : 0);
    const c = this.chunks;
    return [
      `load ${this.marks.map(([n, t]) => `${n} ${(t / 1000).toFixed(2)}s`).join(' · ')}`,
      `chunks ${c.n} · worker ${(c.workerMs / Math.max(1, c.n)).toFixed(0)} ms/chunk · install ${(c.installMs / Math.max(1, c.n)).toFixed(1)} ms/chunk · first ${(c.firstReady / 1000).toFixed(2)}s last ${(c.lastReady / 1000).toFixed(2)}s`,
      `load frames ${f.length} · p50 ${q(0.5).toFixed(0)} ms · p95 ${q(0.95).toFixed(0)} ms · max ${q(1).toFixed(0)} ms · js/frame p50 ${([...this.cpu].sort((a, b) => a - b)[this.cpu.length >> 1] ?? 0).toFixed(0)} ms`,
    ].join('\n');
  },
};
