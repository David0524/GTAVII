/**
 * Minimap drawn from the real street centrelines (public/data/streets.json).
 * The full map is rasterised once to an offscreen canvas; each frame blits a
 * heading-up window around the player. One-way streets get direction ticks.
 */
export interface StreetRec { n: string; c: string; w: number; o: number; p: number[] }

const PX_PER_M = 0.6;

export class Minimap {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private map = document.createElement('canvas');
  private ox = 0; private oz = 0;
  readonly size = Math.round(Math.min(200, Math.max(110, Math.min(window.innerWidth, window.innerHeight) * 0.3)));
  rangeM = 260;

  constructor(parent: HTMLElement, private streets: StreetRec[], region: { minX: number; maxX: number; minZ: number; maxZ: number }, heroes: { name: string; x: number; z: number }[]) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.canvas.height = this.size * dpr;
    Object.assign(this.canvas.style, {
      position: 'fixed', left: 'calc(12px + env(safe-area-inset-left))', top: matchMedia('(pointer: coarse)').matches ? 'calc(10px + env(safe-area-inset-top))' : '', bottom: matchMedia('(pointer: coarse)').matches ? '' : '14px', zIndex: '6', pointerEvents: 'none', width: `${this.size}px`, height: `${this.size}px`,
      borderRadius: '50%', border: '2px solid #c9bfa8aa', boxShadow: '0 2px 12px #000a', background: '#15130f',
    });
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(dpr, dpr);

    const pad = 300;
    this.ox = region.minX - pad; this.oz = region.minZ - pad;
    const W = (region.maxX - region.minX + 2 * pad) * PX_PER_M, H = (region.maxZ - region.minZ + 2 * pad) * PX_PER_M;
    this.map.width = Math.ceil(W); this.map.height = Math.ceil(H);
    const m = this.map.getContext('2d')!;
    m.fillStyle = '#2a2620'; m.fillRect(0, 0, W, H);
    m.lineCap = 'round'; m.lineJoin = 'round';
    const tx = (x: number) => (x - this.ox) * PX_PER_M, tz = (z: number) => (z - this.oz) * PX_PER_M;
    for (const pass of [0, 1]) for (const s of streets) {
      m.strokeStyle = pass === 0 ? '#0e0d0b' : s.w >= 15 ? '#cfc4a8' : '#8f8672';
      m.lineWidth = (s.w + (pass === 0 ? 4 : 0)) * PX_PER_M;
      m.beginPath();
      for (let k = 0; k < s.p.length; k += 2) (k ? m.lineTo : m.moveTo).call(m, tx(s.p[k]), tz(s.p[k + 1]));
      m.stroke();
    }
    // one-way ticks
    m.fillStyle = '#5a5244';
    for (const s of streets) {
      if (!s.o) continue;
      for (let k = 2; k < s.p.length; k += 2) {
        const x0 = s.p[k - 2], z0 = s.p[k - 1], x1 = s.p[k], z1 = s.p[k + 1];
        const L = Math.hypot(x1 - x0, z1 - z0); if (L < 25) continue;
        const ux = ((x1 - x0) / L) * s.o, uz = ((z1 - z0) / L) * s.o;
        for (let t = 12; t < L - 6; t += 40) {
          const cx = tx(x0 + (x1 - x0) * (t / L)), cz = tz(z0 + (z1 - z0) * (t / L));
          const a = 3.2;
          m.beginPath();
          m.moveTo(cx + ux * a * 1.4, cz + uz * a * 1.4);
          m.lineTo(cx - ux * a - uz * a, cz - uz * a + ux * a);
          m.lineTo(cx - ux * a + uz * a, cz - uz * a - ux * a);
          m.fill();
        }
      }
    }
    m.fillStyle = '#e8b860'; m.font = 'bold 13px ui-monospace, monospace';
    for (const h of heroes) { m.beginPath(); m.arc(tx(h.x), tz(h.z), 4, 0, Math.PI * 2); m.fill(); }
  }

  /** yaw: camera yaw (0 = -Z). Map is drawn heading-up. */
  draw(x: number, z: number, yaw: number) {
    const c = this.ctx, S = this.size, r = S / 2;
    const scale = S / (this.rangeM * 2) / PX_PER_M;
    c.save();
    c.clearRect(0, 0, S, S);
    c.beginPath(); c.arc(r, r, r, 0, Math.PI * 2); c.clip();
    c.translate(r, r);
    c.rotate(yaw);
    c.scale(scale, scale);
    c.drawImage(this.map, -(x - this.ox) * PX_PER_M, -(z - this.oz) * PX_PER_M);
    c.restore();
    // player arrow (always points up)
    c.fillStyle = '#f2d27a'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(r, r - 8); c.lineTo(r + 6, r + 7); c.lineTo(r, r + 3); c.lineTo(r - 6, r + 7); c.closePath(); c.fill(); c.stroke();
  }

  /** Name of the nearest street centreline to (x,z). */
  nearestStreet(x: number, z: number): string {
    let best = Infinity, name = '';
    for (const s of this.streets) {
      if (!s.n) continue;
      for (let k = 2; k < s.p.length; k += 2) {
        const ax = s.p[k - 2], az = s.p[k - 1], bx = s.p[k], bz = s.p[k + 1];
        const dx = bx - ax, dz = bz - az; const L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
        if (d < best) { best = d; name = s.n; }
      }
    }
    return name;
  }
}
