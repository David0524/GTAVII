import * as THREE from 'three/webgpu';
import type { Gameplay } from '../index';
import { describeText } from '../police/description';

/**
 * Debug overlays for the test scene (toggle O):
 *  - police: sight cones on the ground (yellow searching → orange suspicious → red pursuit), the search
 *    area around each report's last-known point, a report panel (house, heat/tier, age, description, units)
 *  - witnesses: sightline to where they last saw the perp, and their run to the call box / payphone
 *  - combat: cover points, AI state / morale / token labels
 * Plus a radar canvas showing what the engine minimap would get (cones + search circles), pending the
 * minimap overlay API (ENGINE_REQUESTS "From gameplay: 4").
 */
export class Overlays {
  readonly root = new THREE.Group();
  enabled = true;
  private cones = new Map<string, THREE.Mesh>();
  private circles = new Map<number, THREE.Mesh>();
  private lines: THREE.LineSegments;
  private linePos = new Float32Array(6 * 400);
  private lineCol = new Float32Array(6 * 400);
  private coverPts: THREE.InstancedMesh;
  private panel = document.createElement('div');
  private labels = new Map<string, HTMLDivElement>();
  private radar = document.createElement('canvas');
  private tmp = new THREE.Object3D();

  constructor(private g: Gameplay, private camera: THREE.Camera) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.lineCol, 3));
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthTest: false }));
    this.lines.frustumCulled = false; this.lines.renderOrder = 10;
    this.coverPts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.04, 0.12), new THREE.MeshBasicMaterial({ color: 0x5ad0a0 }), 600);
    this.coverPts.count = 0; this.coverPts.frustumCulled = false;
    this.root.add(this.lines, this.coverPts);
    Object.assign(this.panel.style, { position: 'fixed', left: 'calc(12px + env(safe-area-inset-left))', top: '56px', width: '330px', maxHeight: '45vh', overflow: 'hidden', background: '#0d0b09cc', color: '#d8d0c0', font: '11px "Courier Prime", ui-monospace, monospace', padding: '6px 8px', zIndex: '7', pointerEvents: 'none', whiteSpace: 'pre-wrap', borderLeft: '3px solid #bfe6d8' });
    this.radar.width = this.radar.height = 170;
    Object.assign(this.radar.style, { position: 'fixed', right: 'calc(12px + env(safe-area-inset-right))', top: '56px', width: '170px', height: '170px', zIndex: '7', pointerEvents: 'none', borderRadius: '50%', background: '#0d0b09aa', border: '1px solid #efe3c444' });
    document.body.append(this.panel, this.radar);
  }

  setEnabled(on: boolean) { this.enabled = on; this.root.visible = on; this.panel.style.display = on ? '' : 'none'; this.radar.style.display = on ? '' : 'none'; for (const l of this.labels.values()) l.style.display = on ? '' : 'none'; }

  update(playerPos: THREE.Vector3, yaw: number) {
    if (!this.enabled) return;
    const g = this.g;
    // cones
    const seen = new Set<string>();
    for (const u of g.policeSys.units.values()) {
      if (u.state === 'down') continue;
      seen.add(u.id);
      let m = this.cones.get(u.id);
      if (!m) {
        const full = u.fov >= Math.PI * 2 - 1e-3;
        const geo = new THREE.CircleGeometry(u.sight, 28, full ? 0 : Math.PI / 2 - u.fov / 2, full ? Math.PI * 2 : u.fov);
        geo.rotateX(-Math.PI / 2);
        m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xe3a92a, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }));
        m.renderOrder = 5; this.root.add(m); this.cones.set(u.id, m);
      }
      m.position.set(u.x, g.world.ground(u.x, u.z) + 0.22, u.z);
      m.rotation.y = u.yaw + Math.PI / 2 - Math.PI / 2;
      // CircleGeometry starts at +X; after rotateX the arc centre (π/2) points to -Z = yaw 0 forward
      const mat = m.material as THREE.MeshBasicMaterial;
      const hot = u.state === 'pursuit' || u.state === 'combat' || u.state === 'encounter' || u.state === 'approach';
      mat.color.setHex(hot ? 0xff3b2f : u.state === 'suspicious' ? 0xff8a2a : 0xe3a92a);
      mat.opacity = hot ? 0.22 : u.state === 'suspicious' ? 0.16 + u.recog * 0.15 : 0.1;
    }
    for (const [id, m] of this.cones) if (!seen.has(id)) { this.root.remove(m); m.geometry.dispose(); this.cones.delete(id); }
    // search circles
    const rs = new Set<number>();
    for (const r of g.policeSys.reports) {
      rs.add(r.id);
      let c = this.circles.get(r.id);
      if (!c) { c = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xbfe6d8, transparent: true, opacity: 0.6, depthWrite: false })); this.root.add(c); this.circles.set(r.id, c); }
      const rad = Math.min(150, 25 + r.sinceSighting * 1.2);
      c.scale.setScalar(rad); c.position.set(r.lastKnown[0], g.world.ground(r.lastKnown[0], r.lastKnown[1]) + 0.25, r.lastKnown[1]);
    }
    for (const [id, c] of this.circles) if (!rs.has(id)) { this.root.remove(c); this.circles.delete(id); }
    // lines: witness sightlines + runs, AI aim
    let n = 0;
    const line = (a: number[], b: number[], col: number) => {
      if (n >= 400) return;
      const c = new THREE.Color(col);
      this.linePos.set([a[0], a[1], a[2], b[0], b[1], b[2]], n * 6); this.lineCol.set([c.r, c.g, c.b, c.r, c.g, c.b], n * 6); n++;
    };
    for (const w of g.witnesses.list.values()) {
      const p = g.witnesses['port'].ped(w.ped); if (!p) continue;
      const eye = [p.x, p.y + 1.6, p.z];
      const col = w.state === 'toReport' || w.state === 'calling' ? 0xff4a3a : w.state === 'silenced' ? 0x60a060 : w.state === 'filed' ? 0x8080ff : 0xffd070;
      line(eye, [w.lastSeen[0], g.world.ground(w.lastSeen[0], w.lastSeen[1]) + 1.2, w.lastSeen[1]], col);
      if (w.target && (w.state === 'toReport' || w.state === 'calling')) line([p.x, p.y + 0.3, p.z], [w.target.x, p.y + 0.3, w.target.z], 0xff4a3a);
    }
    for (const a of g.ai.agents.values()) if (a.alive && a.firing) line([a.pos[0], a.pos[1] + 1.45, a.pos[2]], [a.pos[0] + a.aimDir[0] * 20, a.pos[1] + 1.45 + a.aimDir[1] * 20, a.pos[2] + a.aimDir[2] * 20], 0xff8060);
    this.lines.geometry.setDrawRange(0, n * 2);
    (this.lines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.lines.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    // cover points near the player
    let k = 0;
    for (const p of g.cover.points) {
      if (k >= 600 || Math.hypot(p.x - playerPos.x, p.z - playerPos.z) > 40) continue;
      this.tmp.position.set(p.x, p.y + 0.05, p.z); this.tmp.scale.setScalar(p.occupant ? 2 : 1); this.tmp.updateMatrix();
      this.coverPts.setMatrixAt(k++, this.tmp.matrix);
    }
    this.coverPts.count = k; this.coverPts.instanceMatrix.needsUpdate = true;
    // labels
    const used = new Set<string>();
    const label = (id: string, pos: number[], text: string, color = '#efe3c4') => {
      const v = new THREE.Vector3(pos[0], pos[1], pos[2]).project(this.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return;
      used.add(id);
      let d = this.labels.get(id);
      if (!d) { d = document.createElement('div'); Object.assign(d.style, { position: 'fixed', transform: 'translate(-50%,-100%)', font: '10px "Courier Prime", monospace', color, textShadow: '0 1px 2px #000', pointerEvents: 'none', zIndex: '6', whiteSpace: 'nowrap' }); document.body.appendChild(d); this.labels.set(id, d); }
      d.style.left = `${((v.x + 1) / 2) * innerWidth}px`; d.style.top = `${((1 - v.y) / 2) * innerHeight}px`; d.style.color = color; d.textContent = text;
    };
    for (const a of g.ai.agents.values()) {
      const h = g.healthSys.state(a.id);
      if (!a.alive) continue;
      label(a.id, [a.pos[0], a.pos[1] + 2.15, a.pos[2]], `${a.state}${a.token ? ' ●' : ''} m${a.morale.toFixed(2)} ${h ? Math.round(h.hp) : ''}${a.gun ? ` ${a.gun.loaded}` : ''}`, a.faction === 'police' ? '#9ab8ff' : '#ffb090');
    }
    for (const u of g.policeSys.units.values()) if (u.state !== 'combat') label(u.id, [u.x, g.world.ground(u.x, u.z) + 2.2, u.z], `${u.kind} ${u.state}${u.recog > 0 ? ` ${(u.recog * 100).toFixed(0)}%` : ''}${u.corrupt > 0 ? ' $' : ' ✝'}`, '#9ab8ff');
    for (const w of g.witnesses.list.values()) { const p = g.witnesses['port'].ped(w.ped); if (p) label(`w:${w.ped}`, [p.x, p.y + 2.05, p.z], `witness ${w.state}${w.target ? ` → ${w.target.kind}` : ''}`, '#ffd070'); }
    for (const [id, d] of this.labels) if (!used.has(id)) { d.remove(); this.labels.delete(id); }
    // report panel
    const reps = g.policeSys.reports;
    this.panel.textContent = reps.length ? reps.map((r) => {
      const units = r.units.map((id) => { const u = g.policeSys.units.get(id); return u ? `${u.kind}:${u.state}` : ''; }).filter(Boolean).join(' ');
      const pct = g.policeSys.pct(r.precinct).name;
      const tier = g.police.reports.find((x) => x.id === r.id)?.tier ?? 0;
      return `#${r.id} ${pct.toUpperCase()}  heat ${r.heat.toFixed(1)} · tier ${tier} · ${fmt(r.age)}\n  ${r.kinds.join(', ')}\n  ${describeText(r.description)}\n  last seen ${fmt(r.sinceSighting)} ago · ${units || 'no units yet'}${r.pending.length ? ` · ${r.pending.length} coming` : ''}`;
    }).join('\n') + `\npad: ${[...g.policeSys.payoff].map(([k, v]) => `${k.replace('pct.', '')} ${v.toFixed(1)}`).join(', ') || 'none'}` : 'POLICE: no reports.\nA crime only counts if someone sees or hears it.';
    this.drawRadar(playerPos, yaw);
  }

  private drawRadar(p: THREE.Vector3, yaw: number) {
    const c = this.radar.getContext('2d')!; const W = 170, S = W / 2 / 160; // 160 m radius
    c.clearRect(0, 0, W, W); c.save(); c.translate(W / 2, W / 2); c.rotate(yaw); // heading-up
    const P = (x: number, z: number) => [(x - p.x) * S, (z - p.z) * S];
    for (const r of this.g.policeSys.reports) { const [x, y] = P(r.lastKnown[0], r.lastKnown[1]); c.strokeStyle = '#bfe6d8aa'; c.beginPath(); c.arc(x, y, Math.min(150, 25 + r.sinceSighting * 1.2) * S, 0, Math.PI * 2); c.stroke(); }
    for (const u of this.g.policeSys.units.values()) {
      const [x, y] = P(u.x, u.z), hot = ['pursuit', 'combat', 'encounter', 'approach'].includes(u.state);
      c.fillStyle = hot ? '#ff3b2f55' : u.state === 'suspicious' ? '#ff8a2a44' : '#e3a92a33';
      const a = -Math.PI / 2 - u.yaw; // yaw 0 = -Z = up on screen
      c.beginPath(); c.moveTo(x, y); c.arc(x, y, u.sight * S, a - u.fov / 2, a + u.fov / 2); c.closePath(); c.fill();
      c.fillStyle = '#9ab8ff'; c.fillRect(x - 2, y - 2, 4, 4);
    }
    for (const w of this.g.witnesses.list.values()) { const q = this.g.witnesses['port'].ped(w.ped); if (!q) continue; const [x, y] = P(q.x, q.z); c.fillStyle = w.state === 'toReport' || w.state === 'calling' ? '#ff4a3a' : '#ffd070'; c.beginPath(); c.arc(x, y, 2.5, 0, Math.PI * 2); c.fill(); }
    c.restore();
    c.fillStyle = '#efe3c4'; c.beginPath(); c.moveTo(W / 2, W / 2 - 6); c.lineTo(W / 2 - 4, W / 2 + 4); c.lineTo(W / 2 + 4, W / 2 + 4); c.fill();
  }
}
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
