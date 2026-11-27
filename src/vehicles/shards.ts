import * as THREE from 'three/webgpu';

/**
 * Safety-glass shards from shattered panes: small tumbling chips, one InstancedMesh per scene.
 * Ballistic (no physics bodies): they fall, bounce once on the ground under the car, settle and
 * glint, then fade after `life` seconds. Tempered side glass bursts into many cubes; laminated
 * windscreens shed few (the plastic layer holds them).
 */
const MAX = 600;
interface Shard { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3; s: number; ground: number; age: number; resting: boolean }

const systems = new WeakMap<THREE.Object3D, ShardSystem>();
export function shardsFor(scene: THREE.Object3D): ShardSystem {
  let s = systems.get(scene);
  if (!s) { s = new ShardSystem(scene); systems.set(scene, s); }
  return s;
}

export class ShardSystem {
  private mesh: THREE.InstancedMesh;
  private list: Shard[] = [];
  life = 25;
  private _m = new THREE.Matrix4(); private _q = new THREE.Quaternion(); private _s = new THREE.Vector3();

  constructor(scene: THREE.Object3D) {
    const geo = new THREE.TetrahedronGeometry(1, 0);
    geo.scale(1, 0.25, 1);
    const mat = new THREE.MeshStandardNodeMaterial({ color: 0x9ab0b0, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.75, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.name = 'glass-shards';
    scene.add(this.mesh);
  }

  /** Burst `n` chips from a world point; `out` is the outward pane normal, `vel` the car's velocity. */
  burst(at: THREE.Vector3, out: THREE.Vector3, vel: { x: number; y: number; z: number }, ground: number, n: number, spread = 0.35) {
    for (let i = 0; i < n; i++) {
      if (this.list.length >= MAX) this.list.shift();
      const p = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread * 2, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread * 2));
      const sp = 0.6 + Math.random() * 1.8;
      const v = new THREE.Vector3(vel.x, vel.y, vel.z).addScaledVector(out, sp).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 1.2, (Math.random() - 0.5) * 1.2));
      this.list.push({ p, v, r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6), w: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20), s: 0.008 + Math.random() * 0.014, ground, age: 0, resting: false });
    }
  }

  private driver: object | null = null;
  /** Every vehicle calls this each step; only one (the first live caller) advances the shards. */
  step(dt: number, who: object) {
    if (!this.driver) this.driver = who;
    if (who === this.driver) this.update(dt);
  }
  /** A vehicle going away hands the stepping to the next caller. */
  release(who: object) { if (this.driver === who) this.driver = null; }

  update(dt: number) {
    let k = 0;
    this.list = this.list.filter((sh) => (sh.age += dt) < this.life);
    for (const sh of this.list) {
      if (!sh.resting) {
        sh.v.y -= 9.81 * dt;
        sh.p.addScaledVector(sh.v, dt);
        sh.r.x += sh.w.x * dt; sh.r.y += sh.w.y * dt; sh.r.z += sh.w.z * dt;
        if (sh.p.y < sh.ground + 0.004) {
          sh.p.y = sh.ground + 0.004;
          if (Math.abs(sh.v.y) > 1) { sh.v.y *= -0.25; sh.v.x *= 0.5; sh.v.z *= 0.5; sh.w.multiplyScalar(0.4); }
          else { sh.resting = true; sh.r.x = 0; sh.r.z = 0; }
        }
      }
      const fade = sh.age > this.life - 2 ? (this.life - sh.age) / 2 : 1;
      this._m.compose(sh.p, this._q.setFromEuler(sh.r), this._s.setScalar(sh.s * fade));
      this.mesh.setMatrixAt(k++, this._m);
    }
    this.mesh.count = k;
    if (k) this.mesh.instanceMatrix.needsUpdate = true;
  }

  get count() { return this.list.length; }
}
