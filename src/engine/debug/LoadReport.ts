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
  /** Frames over 250 ms with what happened in them (oversight: a 1,344 ms load frame on the iPhone). */
  hitches: [] as { at: number; ms: number; chunks: number; installMs: number; collidersMs: number; marks: string[] }[],
  /** Work done since the last frame boundary (attributed to the frame that just ended). */
  cur: { chunks: 0, installMs: 0, collidersMs: 0, marks: [] as string[] },
  cpu: [] as number[], // JS time inside the frame callback (rest of the frame = GPU/compositor/other)
  mark(name: string) { if (!this.marks.some(([n]) => n === name)) { this.marks.push([name, performance.now()]); this.cur.marks.push(name); } },
  frame(ms: number) {
    if (performance.now() < 120000 && this.frames.length < 4000) this.frames.push(ms);
    if (ms > 250 && this.hitches.length < 20) this.hitches.push({ at: performance.now(), ms, chunks: this.cur.chunks, installMs: this.cur.installMs, collidersMs: this.cur.collidersMs, marks: [...this.cur.marks] });
    this.cur = { chunks: 0, installMs: 0, collidersMs: 0, marks: [] };
  },
  colliders(ms: number) { this.cur.collidersMs += ms; },
  frameCpu(ms: number) { if (performance.now() < 30000 && this.cpu.length < 4000) this.cpu.push(ms); },
  chunkReady(workerMs: number, installMs: number) {
    const c = this.chunks; c.n++; c.workerMs += workerMs; c.installMs += installMs; this.cur.chunks++; this.cur.installMs += installMs;
    const t = performance.now(); if (!c.firstReady) c.firstReady = t; c.lastReady = t;
  },
  text(): string {
    const f = [...this.frames].sort((a, b) => a - b), q = (p: number) => (f.length ? f[Math.min(f.length - 1, Math.floor(f.length * p))] : 0);
    const c = this.chunks;
    const m = Object.fromEntries(this.marks), go = m['new-game'] ?? m['continue'];
    return [
      ...(go && m['playable'] ? [`menu choice -> playable ${(m['playable'] - go).toFixed(0)} ms (the gap title-ready -> choice is the player reading the menu)`] : []),
      `load ${this.marks.map(([n, t]) => `${n} ${(t / 1000).toFixed(2)}s`).join(' · ')}`,
      `chunks ${c.n} · worker ${(c.workerMs / Math.max(1, c.n)).toFixed(0)} ms/chunk · install ${(c.installMs / Math.max(1, c.n)).toFixed(1)} ms/chunk · first ${(c.firstReady / 1000).toFixed(2)}s last ${(c.lastReady / 1000).toFixed(2)}s`,
      ...this.hitches.slice(0, 8).map((h) => `hitch ${h.ms.toFixed(0)} ms at ${(h.at / 1000).toFixed(2)}s: ${h.chunks} chunks installed (${h.installMs.toFixed(0)} ms), colliders ${h.collidersMs.toFixed(0)} ms${h.marks.length ? ', during ' + h.marks.join('+') : ''}; rest = GPU/compile/GC/compositor`),
      `load frames ${f.length} · p50 ${q(0.5).toFixed(0)} ms · p95 ${q(0.95).toFixed(0)} ms · max ${q(1).toFixed(0)} ms · js/frame p50 ${([...this.cpu].sort((a, b) => a - b)[this.cpu.length >> 1] ?? 0).toFixed(0)} ms`,
    ].join('\n');
  },
};
