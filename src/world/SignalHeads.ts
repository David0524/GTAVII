/**
 * Traffic and pedestrian signals driven by the sim (wiring step 5, sim request 9). They replace the
 * OSM-placed poles in StreetFurniture, whose lenses ran on a clock the cars didn't obey. Every lit head
 * here is one the sim's cars and pedestrians obey.
 *
 *  - vehicle heads: dark-green steel pole, a three-lens head (red over amber over green) facing the
 *    approach. One-way avenues also get the far-left head (altX/altZ), as in 1974.
 *  - pedestrian heads: a two-panel box at the crosswalk end (DONT WALK orange over WALK white), with the
 *    flashing DONT WALK clearance phase.
 * One InstancedMesh per part. Each lens reads its head's state from a per-instance attribute that is
 * re-uploaded only when some state changed.
 */
import * as THREE from 'three/webgpu';
import { attribute, vec3, float, select, uniform, fract } from 'three/tsl';
import { heightAt, CURB_HEIGHT } from '../shared/terrain';
import type { SignalHead } from '../sim';

const POLE_GREEN = new THREE.Color(0.1, 0.13, 0.1), HOUSING = new THREE.Color(0.13, 0.15, 0.09);
export const signalUniforms = { time: uniform(0) };

type FNode = THREE.Node<'float'>;
type SNode = THREE.Node<'float'>;
interface Mount { head: number; x: number; z: number; yaw: number }

export class SignalHeads {
  readonly root = new THREE.Group();
  private state!: THREE.InstancedBufferAttribute; // per vehicle-mount state
  private pedState!: THREE.InstancedBufferAttribute;
  private veh: Mount[] = []; private ped: Mount[] = [];
  private last = new Uint8Array(0);

  constructor(heads: readonly SignalHead[]) {
    this.root.name = 'signalHeads';
    for (const h of heads) {
      const list = h.kind === 'vehicle' ? this.veh : this.ped;
      list.push({ head: h.index, x: h.x, z: h.z, yaw: h.faceYaw });
      if (h.kind === 'vehicle' && h.altX !== undefined && h.altZ !== undefined) list.push({ head: h.index, x: h.altX, z: h.altZ, yaw: h.faceYaw });
    }
    this.state = new THREE.InstancedBufferAttribute(new Float32Array(this.veh.length), 1);
    this.pedState = new THREE.InstancedBufferAttribute(new Float32Array(this.ped.length), 1);
    this.build();
  }

  private place(mesh: THREE.InstancedMesh, list: Mount[]) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    list.forEach((s, i) => { q.setFromAxisAngle(up, s.yaw); p.set(s.x, heightAt(s.x, s.z) + CURB_HEIGHT, s.z); m.compose(p, q, one); mesh.setMatrixAt(i, m); });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.frustumCulled = true;
    this.root.add(mesh);
  }

  private build() {
    const std = (c: THREE.Color) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.3 });
    // vehicle: pole + head housing with a visor-ish top; lenses on the -z face (faces the approach)
    if (this.veh.length) {
      const pole = new THREE.CylinderGeometry(0.08, 0.11, 4.4, 8).translate(0, 2.2, 0);
      const house = new THREE.BoxGeometry(0.34, 1.0, 0.26).translate(0, 3.85, -0.12);
      const pm = new THREE.InstancedMesh(pole, std(POLE_GREEN), this.veh.length); pm.name = 'signalPoles'; pm.castShadow = true;
      const hm = new THREE.InstancedMesh(house, std(HOUSING), this.veh.length); hm.name = 'signalHousings'; hm.castShadow = true;
      this.place(pm, this.veh); this.place(hm, this.veh);
      const lens = (c: THREE.Color, y: number, lit: (s: FNode) => SNode) => {
        const geo = new THREE.CircleGeometry(0.1, 12).rotateY(Math.PI).translate(0, y, -0.255);
        geo.setAttribute('sigState', this.state);
        const mat = new THREE.MeshBasicNodeMaterial();
        mat.colorNode = vec3(c.r, c.g, c.b).mul(lit(float(attribute('sigState', 'float'))).mul(2.6).add(0.06));
        const im = new THREE.InstancedMesh(geo, mat, this.veh.length); im.name = 'signalLens';
        this.place(im, this.veh);
      };
      const is = (k: number) => (s: FNode) => select(s.equal(float(k)), float(1), float(0));
      lens(new THREE.Color(1, 0.12, 0.05), 4.17, is(1));
      lens(new THREE.Color(1, 0.6, 0.05), 3.85, is(2));
      lens(new THREE.Color(0.25, 1, 0.55), 3.53, is(3));
    }
    // pedestrian: short pole + two-panel box at 2.6 m
    if (this.ped.length) {
      const pole = new THREE.CylinderGeometry(0.05, 0.07, 2.4, 6).translate(0, 1.2, 0);
      const box = new THREE.BoxGeometry(0.4, 0.62, 0.22).translate(0, 2.65, -0.06);
      const pm = new THREE.InstancedMesh(pole, std(POLE_GREEN), this.ped.length); pm.name = 'pedPoles';
      const bm = new THREE.InstancedMesh(box, std(HOUSING), this.ped.length); bm.name = 'pedHousings';
      this.place(pm, this.ped); this.place(bm, this.ped);
      const blink = fract(signalUniforms.time.mul(1.0)).lessThan(0.5);
      const panel = (c: THREE.Color, y: number, lit: (s: FNode) => SNode) => {
        const geo = new THREE.PlaneGeometry(0.32, 0.24).rotateY(Math.PI).translate(0, y, -0.175);
        geo.setAttribute('sigState', this.pedState);
        const mat = new THREE.MeshBasicNodeMaterial();
        mat.colorNode = vec3(c.r, c.g, c.b).mul(lit(float(attribute('sigState', 'float'))).mul(2.2).add(0.05));
        const im = new THREE.InstancedMesh(geo, mat, this.ped.length); im.name = 'pedPanel';
        this.place(im, this.ped);
      };
      // 4 DONT WALK steady, 5 DONT WALK flashing (clearance), 6 WALK
      panel(new THREE.Color(1, 0.42, 0.08), 2.8, (s: FNode) => select(s.equal(float(4)), float(1), select(s.equal(float(5)).and(blink), float(1), float(0))));
      panel(new THREE.Color(0.85, 0.9, 0.95), 2.5, (s: FNode) => select(s.equal(float(6)), float(1), float(0)));
    }
  }

  /** states: Simulation.signalStates() (one byte per head). */
  update(dt: number, states: Uint8Array) {
    signalUniforms.time.value += dt;
    if (states.length === this.last.length) {
      let same = true; for (let i = 0; i < states.length; i++) if (states[i] !== this.last[i]) { same = false; break; }
      if (same) return;
    }
    this.last = Uint8Array.from(states);
    const a = this.state.array as Float32Array, b = this.pedState.array as Float32Array;
    this.veh.forEach((v, i) => { a[i] = states[v.head] ?? 0; });
    this.ped.forEach((v, i) => { b[i] = states[v.head] ?? 0; });
    this.state.needsUpdate = true; this.pedState.needsUpdate = true;
  }

  /** Pole footprints for the sim's pedestrians to step around. */
  obstacles(): { x: number; z: number; r: number }[] {
    return [...this.veh, ...this.ped].map((s) => ({ x: s.x, z: s.z, r: 0.15 }));
  }
}
