/** Minimal debug HUD: backend, frame time stats, draw calls, triangles, streaming state, location. */
export class FrameStats {
  private samples = new Float32Array(240);
  private n = 0;
  push(ms: number) { this.samples[this.n++ % this.samples.length] = ms; }
  summary() {
    const len = Math.min(this.n, this.samples.length);
    if (!len) return { avg: 0, p95: 0, max: 0, fps: 0 };
    const a = Array.from(this.samples.subarray(0, len)).sort((x, y) => x - y);
    const avg = a.reduce((s, v) => s + v, 0) / len;
    return { avg, p95: a[Math.floor(len * 0.95)], max: a[len - 1], fps: 1000 / avg };
  }
  reset() { this.n = 0; }
}

export class DebugHud {
  readonly el = document.createElement('pre');
  visible = true;
  constructor(parent: HTMLElement) {
    Object.assign(this.el.style, {
      position: 'fixed', left: '10px', top: '8px', margin: '0', padding: '6px 8px', color: '#e6dcc6',
      background: '#0009', font: '11px/1.35 ui-monospace, Menlo, Consolas, monospace', pointerEvents: 'none', whiteSpace: 'pre',
    });
    parent.appendChild(this.el);
    window.addEventListener('keydown', (e) => { if (e.code === 'F3' || e.code === 'Backquote') { this.visible = !this.visible; this.el.style.display = this.visible ? '' : 'none'; } });
  }
  set(text: string) { if (this.visible) this.el.textContent = text; }
}
