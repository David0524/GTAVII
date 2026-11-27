import * as THREE from 'three/webgpu';

let puffTex: THREE.Texture | null = null;
function puff() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}

interface P { s: THREE.Sprite; m: THREE.SpriteNodeMaterial; v: THREE.Vector3; age: number; life: number; size: number; grow: number }

/**
 * Small sprite emitter living in world space (so trails stay behind a moving car).
 * kind 'smoke' fades grey->dark depending on `darkness`; 'fire' is additive orange.
 */
export class Emitter {
  readonly group = new THREE.Group();
  private pool: P[] = [];
  private acc = 0;
  darkness = 0;

  constructor(parent: THREE.Object3D, readonly kind: 'smoke' | 'fire', max = 28) {
    this.group.name = `vehicle-${kind}`;
    parent.add(this.group);
    for (let i = 0; i < max; i++) {
      const m = new THREE.SpriteNodeMaterial({ map: puff(), transparent: true, depthWrite: false, blending: kind === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true });
      m.color = new THREE.Color(kind === 'fire' ? 0xff7a1e : 0xdddddd);
      const s = new THREE.Sprite(m);
      s.visible = false;
      this.group.add(s);
      this.pool.push({ s, m, v: new THREE.Vector3(), age: 0, life: 1, size: 1, grow: 1 });
    }
  }

  /** Emit `rate` particles/s at `pos` (world), drifting with `vel`. */
  update(dt: number, pos: THREE.Vector3 | null, rate: number, vel?: THREE.Vector3) {
    if (pos && rate > 0) {
      this.acc += rate * dt;
      while (this.acc >= 1) {
        this.acc -= 1;
        const p = this.pool.find((q) => !q.s.visible);
        if (!p) break;
        p.s.visible = true; p.age = 0;
        p.s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.1, (Math.random() - 0.5) * 0.4));
        p.v.set((Math.random() - 0.5) * 0.4, this.kind === 'fire' ? 1.6 + Math.random() : 0.9 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4);
        if (vel) p.v.addScaledVector(vel, 0.3);
        p.life = this.kind === 'fire' ? 0.5 + Math.random() * 0.4 : 2.2 + Math.random() * 1.5;
        p.size = this.kind === 'fire' ? 0.6 + Math.random() * 0.5 : 0.3 + Math.random() * 0.25;
        p.grow = this.kind === 'fire' ? -0.4 : 0.55;
        if (this.kind === 'smoke') {
          const d = this.darkness;
          const c = THREE.MathUtils.lerp(0.85, 0.12, d) * (0.85 + Math.random() * 0.15);
          p.m.color.setRGB(c, c * 0.98, c * 0.95);
        } else p.m.color.setHSL(0.06 + Math.random() * 0.04, 1, 0.55);
      }
    } else this.acc = 0;
    for (const p of this.pool) {
      if (!p.s.visible) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) { p.s.visible = false; continue; }
      p.s.position.addScaledVector(p.v, dt);
      p.v.multiplyScalar(1 - dt * 0.6);
      const sz = Math.max(0.05, p.size + p.grow * p.age);
      p.s.scale.setScalar(sz);
      p.m.opacity = (this.kind === 'fire' ? 0.9 : 0.4) * Math.sin(Math.PI * Math.min(1, t * 1.2)) * (this.kind === 'fire' ? 1 : 1 - t * 0.5);
    }
  }

  get active() { return this.pool.some((p) => p.s.visible); }

  dispose() {
    this.group.removeFromParent();
    for (const p of this.pool) p.m.dispose();
  }
}
