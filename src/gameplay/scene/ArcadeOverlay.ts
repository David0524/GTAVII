/**
 * The cabinet view for the test scene: a 2D canvas over the 3D scene that draws a machine's state and
 * maps input. The real game's UI chat can restyle it; the rules live in arcade/.
 *   Pinball: left/right half of the screen (or Z / M, ← / →) = flippers; pull down on the plunger
 *            (or hold Space) and let go to launch; a quick sideways swipe (or N) = nudge.
 *   Gallery: drag (or the mouse) aims; tap / click / Space fires.
 */
import type { Arcade, Game } from '../arcade';
import { Pinball, TABLE, BALL_R } from '../arcade/pinball';
import { Gallery, GALLERY } from '../arcade/gallery';

const C = { bg: '#120c10', wood: '#3a2316', field: '#1d2a3a', rail: '#c9b48a', rubber: '#e8e0d0', lit: '#ffb43a', unlit: '#6b5640', ball: '#e9eef2', text: '#f2e6c8', red: '#e04a3a', green: '#6fd08c' };

export class ArcadeOverlay {
  readonly root = document.createElement('div');
  private cv = document.createElement('canvas');
  private ctx = this.cv.getContext('2d')!;
  private game: Game | null = null;
  private machine = '';
  private pull = 0; private pulling = false; private pullStart = 0;
  private touches = new Map<number, { x: number; y: number; t: number; side: 'L' | 'R' | 'plunger' | 'aim' }>();
  onClose: () => void = () => {};

  constructor(private arcade: Arcade, private lead: () => string, private toast: (s: string) => void) {
    Object.assign(this.root.style, { position: 'fixed', inset: '0', background: 'rgba(8,6,8,0.92)', display: 'none', zIndex: '40', touchAction: 'none' });
    Object.assign(this.cv.style, { width: '100%', height: '100%', display: 'block' });
    this.root.appendChild(this.cv);
    const close = document.createElement('button'); close.textContent = 'LEAVE';
    Object.assign(close.style, { position: 'absolute', top: '10px', right: '10px', padding: '8px 14px', background: '#000', color: C.red, border: `1px solid ${C.red}`, font: '600 13px sans-serif' });
    close.onclick = () => this.close(); this.root.appendChild(close);
    document.body.appendChild(this.root);
    this.cv.addEventListener('pointerdown', (e) => this.down(e));
    this.cv.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
  }
  get open() { return this.root.style.display !== 'none'; }
  get current() { return this.game; }

  start(machine: string) {
    const g = this.arcade.play(this.lead(), machine);
    if (!g) { this.toast('Not enough change'); return false; }
    this.game = g; this.machine = machine; this.root.style.display = 'block'; this.resize(); return true;
  }
  close() { if (this.game && !this.game.over) this.finish(); this.game = null; this.root.style.display = 'none'; this.onClose(); }
  private finish() {
    if (!this.game) return;
    const rank = this.arcade.finish(this.lead(), this.machine, this.game, this.lead().split('.')[1]?.slice(0, 3) ?? 'YOU');
    this.toast(rank ? `High score #${rank}!` : `Game over: ${this.game.score.toLocaleString()}`);
  }

  update(dt: number) {
    const g = this.game; if (!g || !this.open) return;
    if (this.pulling) this.pull = Math.min(1, this.pull + dt * 1.2);
    const wasOver = g.over;
    g.step(dt);
    if (!wasOver && g.over) this.finish();
    g.events.length = 0;
    this.draw();
  }

  // ------------------------------------------------------------------ input
  private down(e: PointerEvent) {
    const g = this.game; if (!g) return;
    const r = this.cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (g instanceof Pinball) {
      const side = x > 0.82 && y > 0.6 ? 'plunger' : x < 0.5 ? 'L' : 'R';
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), side });
      if (side === 'plunger') { this.pulling = true; this.pull = 0; this.pullStart = e.clientY; } else g.flip(side, true);
    } else { this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), side: 'aim' }); this.aimAt(e); }
  }
  private move(e: PointerEvent) {
    const g = this.game; if (!g) return;
    const t = this.touches.get(e.pointerId);
    if (g instanceof Gallery && (t || e.pointerType === 'mouse')) this.aimAt(e);
    if (g instanceof Pinball && t?.side === 'plunger') this.pull = Math.min(1, Math.max(0, (e.clientY - this.pullStart) / 120));
  }
  private up(e: PointerEvent) {
    const g = this.game; const t = this.touches.get(e.pointerId); this.touches.delete(e.pointerId);
    if (!g || !t) return;
    if (g instanceof Pinball) {
      if (t.side === 'plunger') { this.pulling = false; g.launch(this.pull); this.pull = 0; }
      else {
        g.flip(t.side as 'L' | 'R', false);
        const dx = e.clientX - t.x; if (Math.abs(dx) > 60 && performance.now() - t.t < 250) g.nudge(dx);
      }
    } else if (g instanceof Gallery) g.fire();
  }
  private key(e: KeyboardEvent, down: boolean) {
    const g = this.game; if (!g || !this.open) return;
    if (g instanceof Pinball) {
      if (e.code === 'KeyZ' || e.code === 'ArrowLeft') g.flip('L', down);
      if (e.code === 'KeyM' || e.code === 'ArrowRight') g.flip('R', down);
      if (e.code === 'Space') { if (down && !this.pulling) { this.pulling = true; this.pull = 0; } else if (!down) { this.pulling = false; g.launch(this.pull); this.pull = 0; } }
      if (e.code === 'KeyN' && down) g.nudge(1);
    } else if (g instanceof Gallery && e.code === 'Space' && down) g.fire();
    if (e.code === 'Escape' && down) this.close();
    e.stopPropagation();
  }
  private aimAt(e: PointerEvent) { const g = this.game as Gallery; const b = this.galleryBox(); g.setAim((e.clientX - b.x) / b.w, (e.clientY - b.y) / b.h); }

  // ------------------------------------------------------------------ drawing
  private resize() { const d = Math.min(2, devicePixelRatio || 1); this.cv.width = innerWidth * d; this.cv.height = innerHeight * d; this.ctx.setTransform(d, 0, 0, d, 0, 0); }
  private galleryBox() { const w = Math.min(innerWidth - 32, (innerHeight - 120) * 1.6), h = w / 1.6; return { x: (innerWidth - w) / 2, y: 70, w, h }; }
  private draw() {
    const g = this.game!, x = this.ctx;
    x.fillStyle = C.bg; x.fillRect(0, 0, innerWidth, innerHeight);
    if (g instanceof Pinball) this.drawPinball(g); else this.drawGallery(g as Gallery);
  }
  private drawPinball(p: Pinball) {
    const x = this.ctx, H = innerHeight - 90, s = H / TABLE.h, W = TABLE.w * s, ox = (innerWidth - W) / 2, oy = 60;
    const X = (v: number) => ox + v * s, Y = (v: number) => oy + v * s;
    x.fillStyle = C.wood; x.fillRect(ox - 14, oy - 14, W + 28, H + 28);
    x.fillStyle = C.field; x.fillRect(ox, oy, W, H);
    // backglass strip
    x.fillStyle = C.text; x.font = '700 20px Georgia, serif'; x.textAlign = 'center'; x.fillText('NIGHT OWL', innerWidth / 2, 28);
    x.font = '600 14px monospace'; x.fillText(`${p.score.toLocaleString().padStart(7)}   BALL ${Math.min(p.ballNo, 3)}   BONUS ${p.bonus}×${p.mult}${p.tilted ? '   TILT' : ''}${p.credits ? '   REPLAY!' : ''}`, innerWidth / 2, 48);
    const line = (a: { x: number; y: number }, b: { x: number; y: number }, c: string, w = 3) => { x.strokeStyle = c; x.lineWidth = w; x.beginPath(); x.moveTo(X(a.x), Y(a.y)); x.lineTo(X(b.x), Y(b.y)); x.stroke(); };
    for (const w of p.t.walls) line(w.a, w.b, C.rail);
    for (const sl of p.t.slings) line(sl.a, sl.b, C.rubber, 5);
    for (const d of p.t.drops) if (!d.down) line(d.seg.a, d.seg.b, C.lit, 6);
    for (const r of p.t.rollovers) { x.fillStyle = p.lit.has(r.letter) ? C.lit : C.unlit; x.font = '700 12px sans-serif'; x.fillText(r.letter, X(r.x), Y(r.y) + 4); }
    for (const b of p.t.bumpers) { x.fillStyle = p.bumpersLit ? C.lit : C.red; x.beginPath(); x.arc(X(b.x), Y(b.y), b.r * s, 0, Math.PI * 2); x.fill(); x.strokeStyle = C.rubber; x.lineWidth = 2; x.stroke(); }
    for (const f of p.t.flippers) line(f.pivot, p.flipperTip(f), C.rubber, 9);
    if (p.ball.live) { x.fillStyle = C.ball; x.beginPath(); x.arc(X(p.ball.x), Y(p.ball.y), BALL_R * s, 0, Math.PI * 2); x.fill(); }
    // plunger gauge
    x.fillStyle = C.unlit; x.fillRect(X(TABLE.w) + 20, oy + H - 120, 12, 100); x.fillStyle = C.lit; x.fillRect(X(TABLE.w) + 20, oy + H - 120, 12, 100 * this.pull);
    x.fillStyle = C.text; x.font = '12px sans-serif'; x.fillText(p.over ? 'GAME OVER' : p.ball.inLane ? 'pull the plunger' : '', innerWidth / 2, innerHeight - 10);
  }
  /** Painted tin cut-outs (no fonts or emoji): duck, rabbit, owl, the gold bell. */
  private tin(kind: string, cx: number, cy: number, u: number) {
    const x = this.ctx; const disc = (px: number, py: number, r: number, c: string) => { x.fillStyle = c; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill(); };
    if (kind === 'duck') { x.fillStyle = '#e8d8a8'; x.beginPath(); x.ellipse(cx, cy + u * 0.4, u * 1.2, u * 0.6, 0, 0, Math.PI * 2); x.fill(); disc(cx + u * 0.9, cy - u * 0.3, u * 0.45, '#e8d8a8'); x.fillStyle = C.lit; x.fillRect(cx + u * 1.25, cy - u * 0.35, u * 0.5, u * 0.18); }
    else if (kind === 'rabbit') { x.fillStyle = '#cfc6b8'; x.beginPath(); x.ellipse(cx, cy + u * 0.4, u * 0.9, u * 0.7, 0, 0, Math.PI * 2); x.fill(); x.fillRect(cx - u * 0.35, cy - u * 1.3, u * 0.22, u * 1.0); x.fillRect(cx + u * 0.1, cy - u * 1.3, u * 0.22, u * 1.0); }
    else if (kind === 'owl') { disc(cx, cy, u * 1.1, '#9a7650'); disc(cx - u * 0.42, cy - u * 0.2, u * 0.34, '#f2e6c8'); disc(cx + u * 0.42, cy - u * 0.2, u * 0.34, '#f2e6c8'); disc(cx - u * 0.42, cy - u * 0.2, u * 0.14, '#111'); disc(cx + u * 0.42, cy - u * 0.2, u * 0.14, '#111'); }
    else { x.fillStyle = '#f0c040'; x.beginPath(); x.moveTo(cx - u, cy + u * 0.7); x.quadraticCurveTo(cx - u * 0.8, cy - u, cx, cy - u); x.quadraticCurveTo(cx + u * 0.8, cy - u, cx + u, cy + u * 0.7); x.closePath(); x.fill(); disc(cx, cy + u * 0.85, u * 0.2, '#f0c040'); }
  }
  private drawGallery(g: Gallery) {
    const x = this.ctx, b = this.galleryBox();
    x.fillStyle = C.wood; x.fillRect(b.x - 12, b.y - 12, b.w + 24, b.h + 24);
    x.fillStyle = '#2b1d14'; x.fillRect(b.x, b.y, b.w, b.h);
    x.fillStyle = C.text; x.textAlign = 'center'; x.font = '700 20px Georgia, serif'; x.fillText('DEAD-EYE GALLERY', innerWidth / 2, 28);
    x.font = '600 14px monospace'; x.fillText(`${g.score.toLocaleString().padStart(5)}   TIME ${g.timeLeft.toFixed(0)}   SHOTS ${GALLERY.shots - g.shots}`, innerWidth / 2, 50);
    for (const r of g.rows) {
      x.strokeStyle = C.unlit; x.lineWidth = 2; x.beginPath(); x.moveTo(b.x, b.y + r.y * b.h + b.h * 0.07); x.lineTo(b.x + b.w, b.y + r.y * b.h + b.h * 0.07); x.stroke();
      for (const t of r.targets) {
        x.globalAlpha = t.down ? 0.25 : 1;
        this.tin(t.kind, b.x + t.x * b.w, b.y + r.y * b.h, b.h * 0.05);
      }
      x.globalAlpha = 1;
    }
    const ax = b.x + g.aim.x * b.w, ay = b.y + g.aim.y * b.h;
    x.strokeStyle = C.green; x.lineWidth = 2; x.beginPath(); x.arc(ax, ay, 14, 0, Math.PI * 2); x.moveTo(ax - 22, ay); x.lineTo(ax + 22, ay); x.moveTo(ax, ay - 22); x.lineTo(ax, ay + 22); x.stroke();
    if (g.over) { x.fillStyle = C.text; x.font = '700 28px Georgia, serif'; x.fillText('GAME OVER', innerWidth / 2, b.y + b.h / 2); }
  }
}
