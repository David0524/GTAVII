/**
 * The in-browser cutscene tool (index.html?cine=1 or ?cine=<scene>). Lays out narrative's shot lists
 * in the real city:
 *  - scene picker and shot list, with each shot's script (type, framing, blocking, beats) beside it,
 *    so the layout follows what narrative wrote;
 *  - a timeline: shots to scale, camera key diamonds, actor keys, dialogue bars, cues and cards;
 *    drag the playhead to scrub; Space plays the real film-look preview;
 *  - a free camera to place shots (WASD/QE move, right-drag or arrow keys look, Shift fast, wheel =
 *    focal length like a zoom ring); K keys the camera at the playhead; lens, focus, stop, roll,
 *    easing, handheld; "focus on" an actor sets the focus distance;
 *  - actors: pick one, click the ground to key their mark at the playhead, [ and ] turn them;
 *  - shot ops: add after, duplicate, delete, duration, start/end on the gameplay camera;
 *  - validation as you go; Export downloads the layout JSON (content/cutscenes/layout/<id>.layout.json) (and keeps an autosave in this browser).
 * The tool owns the camera (CameraDirector owner 'cine-tool') while open.
 */
import * as THREE from 'three/webgpu';
import type { UiHost } from '../../shared/uiHost';
import { CinematicPlayer } from '../CinematicPlayer';
import { cutsceneIds, loadCutscene } from '../content';
import { validateCutscene, lensToFov, fovToLens, applyLayout, extractLayout, type Cutscene, type CutsceneLayout, type Shot, type CamKey, type V3 } from '../schema';
import { Timeline } from '../Timeline';
import { esc } from '../../ui/util';
import { heightAt, CURB_HEIGHT } from '../../shared/terrain';
import './cinetool.css';

const LENSES = [18, 24, 28, 35, 40, 50, 65, 85, 100, 135];
const r3 = (v: number) => Math.round(v * 100) / 100;

export class CineTool {
  readonly root = document.createElement('div');
  private player: CinematicPlayer;
  private scene: Cutscene | null = null;
  private script: Cutscene | null = null;
  private id = '';
  private shotI = 0;
  private mode: 'edit' | 'preview' = 'edit';
  private cam!: THREE.PerspectiveCamera;
  private fly = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, lens: 35, focus: 10, fStop: 4, roll: 0 };
  private keys = new Set<string>();
  private drag: { x: number; y: number } | null = null;
  private actorSel = '';
  private dirty = false;
  private errors: string[] = [];
  private markers = new THREE.Group();

  constructor(private host: UiHost) {
    this.player = new CinematicPlayer(host);
    this.root.className = 'ct';
    document.body.appendChild(this.root);
    document.body.classList.add('cine-tool');
    this.cam = host.camera!.acquire('cine-tool');
    host.freezePlayer?.(true);
    document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement) document.exitPointerLock(); });
    this.markers.name = 'cine-tool-markers'; host.scene?.add(this.markers);
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    const canvas = document.querySelector('#app canvas') as HTMLCanvasElement;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => { if (e.button === 2 || e.pointerType === 'touch') { this.drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); } else if (e.button === 0) this.clickGround(e); });
    canvas.addEventListener('pointermove', (e) => { if (!this.drag) return; this.fly.yaw -= (e.clientX - this.drag.x) * 0.004; this.fly.pitch = Math.max(-1.4, Math.min(1.4, this.fly.pitch - (e.clientY - this.drag.y) * 0.004)); this.drag = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', () => { this.drag = null; });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); const i = LENSES.indexOf(this.nearestLens()); this.fly.lens = LENSES[Math.max(0, Math.min(LENSES.length - 1, i + (e.deltaY > 0 ? -1 : 1)))]; this.render(); }, { passive: false });
    void this.open(new URLSearchParams(location.search).get('cine') || cutsceneIds()[0]);
  }

  private nearestLens() { return LENSES.reduce((b, l) => (Math.abs(l - this.fly.lens) < Math.abs(b - this.fly.lens) ? l : b)); }

  async open(id: string) {
    if (!id || id === '1') id = cutsceneIds()[0];
    const saved = (() => { try { return localStorage.getItem(`t74.cine.${id}`); } catch { return null; } })();
    const { scene, script } = await loadCutscene(id);
    this.script = script;
    // the autosave holds only layout, so a script change by narrative is never shadowed by a stale copy
    this.scene = saved ? applyLayout(script, JSON.parse(saved) as CutsceneLayout).scene : scene;
    this.id = id; this.shotI = 0; this.dirty = !!saved;
    await this.player.play(id, { paused: true });
    this.player.scene = this.scene; this.rebuild();
    this.gotoShot(0);
  }

  /** Re-time the player after any edit (timeline is pure, so this is cheap). */
  private rebuild() {
    const sc = this.scene!;
    this.errors = validateCutscene(sc);
    const old = this.player.tl!;
    // keep the dialogue resolver from the player's load
    const lineOf = (ref: string) => old.lines.find((l) => l.ref === ref);
    this.player.tl = new Timeline(sc, (ref) => { const l = lineOf(ref); return l ? { id: ref, speaker: l.speaker, text: l.text } : null; }, (s) => s);
    this.player.scene = sc;
    this.dirty = true;
    try { localStorage.setItem(`t74.cine.${this.id}`, JSON.stringify(extractLayout(sc, this.script!))); } catch { /* ignore */ }
    this.render();
  }

  private get shot(): Shot { return this.scene!.shots[this.shotI]; }
  private get local() { return this.player.t - this.player.tl!.shotStart[this.shotI]; }

  gotoShot(i: number, local = 0) {
    this.shotI = Math.max(0, Math.min(this.scene!.shots.length - 1, i));
    this.player.seek(this.player.tl!.shotStart[this.shotI] + local);
    this.syncFlyFromPose();
    this.render();
  }
  private syncFlyFromPose() {
    const p = this.player.pose!; if (!p) return;
    this.fly.pos.set(...p.pos);
    const d = new THREE.Vector3(p.look[0] - p.pos[0], p.look[1] - p.pos[1], p.look[2] - p.pos[2]).normalize();
    this.fly.yaw = Math.atan2(-d.x, -d.z); this.fly.pitch = Math.asin(d.y);
    this.fly.lens = Math.round(p.lensMm); this.fly.focus = r3(p.focusM); this.fly.fStop = r3(p.fStop); this.fly.roll = p.roll;
  }

  /** Write a camera key at the playhead from the free camera. */
  keyCamera() {
    const s = this.shot, t = r3(Math.max(0, Math.min(s.durationSec, this.local)));
    const f = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.fly.pitch, this.fly.yaw, 0, 'YXZ'));
    const pos: V3 = [r3(this.fly.pos.x), r3(this.fly.pos.y), r3(this.fly.pos.z)];
    const look: V3 = [r3(pos[0] + f.x * this.fly.focus), r3(pos[1] + f.y * this.fly.focus), r3(pos[2] + f.z * this.fly.focus)];
    const k: CamKey = { t, pos, look, lensMm: this.fly.lens, focusM: this.fly.focus, fStop: this.fly.fStop, ...(this.fly.roll ? { roll: r3(this.fly.roll) } : {}) };
    s.camera ??= { keys: [] };
    s.camera.keys = s.camera.keys.filter((x) => Math.abs(x.t - t) > 0.05).concat(k).sort((a, b) => a.t - b.t);
    this.rebuild();
  }
  private deleteKeyAtPlayhead() { const s = this.shot; if (!s.camera) return; const t = this.local; s.camera.keys = s.camera.keys.filter((x) => Math.abs(x.t - t) > 0.12); this.rebuild(); }

  private clickGround(e: PointerEvent) {
    if (!this.actorSel || this.mode !== 'edit') return;
    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.cam);
    // march the ray to the terrain surface (heightAt) instead of hitting meshes: marks belong on the street
    const o = ray.ray.origin, d = ray.ray.direction;
    let hit: THREE.Vector3 | null = null;
    for (let t = 0.5; t < 400; t += 0.25) { const p = o.clone().addScaledVector(d, t); if (p.y <= heightAt(p.x, p.z) + CURB_HEIGHT) { hit = p; break; } }
    if (!hit) return;
    const s = this.shot, t = r3(Math.max(0, Math.min(s.durationSec, this.local)));
    s.actors ??= {};
    const ks = (s.actors[this.actorSel] ??= []);
    const prev = this.player.tl!.actor(this.actorSel, this.player.t);
    const k = { t, x: r3(hit.x), z: r3(hit.z), heading: r3(prev?.heading ?? 0), anim: prev?.anim ?? 'idle' };
    s.actors[this.actorSel] = ks.filter((x) => Math.abs(x.t - t) > 0.05).concat(k).sort((a, b) => a.t - b.t);
    this.rebuild();
  }
  private turnActor(d: number) {
    if (!this.actorSel) return;
    const s = this.shot, t = this.local, ks = s.actors?.[this.actorSel]; if (!ks?.length) return;
    const k = ks.reduce((b, x) => (Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b)); k.heading = r3(k.heading + d); this.rebuild();
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
    if (down) this.keys.add(e.code);
    if (!down) return;
    if (e.code === 'Space') { e.preventDefault(); this.togglePreview(); }
    if (e.code === 'KeyK') this.keyCamera();
    if (e.code === 'Delete' || e.code === 'Backspace') this.deleteKeyAtPlayhead();
    if (e.code === 'BracketLeft') this.turnActor(0.2);
    if (e.code === 'BracketRight') this.turnActor(-0.2);
    if (e.code === 'PageDown') this.gotoShot(this.shotI + 1);
    if (e.code === 'PageUp') this.gotoShot(this.shotI - 1);
  }

  togglePreview() {
    this.mode = this.mode === 'edit' ? 'preview' : 'edit';
    this.player.setPaused(this.mode === 'edit');
    if (this.mode === 'edit') this.syncFlyFromPose();
    this.render();
  }

  update(dt: number) {
    if (!this.scene || !this.player.tl) return;
    if (this.mode === 'preview') {
      this.player.update(dt);
      if (!this.player.playing) { this.cam = this.host.camera!.acquire('cine-tool'); this.host.freezePlayer?.(true); void this.player.play(this.id, { paused: true }).then(() => { this.player.scene = this.scene; this.rebuild(); this.mode = 'edit'; this.gotoShot(0); }); }
      this.shotI = this.player.tl!.shotIndexAt(this.player.t);
      this.updatePlayhead();
      return;
    }
    // free camera
    const sp = (this.keys.has('ShiftLeft') ? 22 : 5) * dt, f = this.fly;
    const fwd = new THREE.Vector3(-Math.sin(f.yaw), 0, -Math.cos(f.yaw)), right = new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
    if (this.keys.has('KeyW')) f.pos.addScaledVector(fwd, sp);
    if (this.keys.has('KeyS')) f.pos.addScaledVector(fwd, -sp);
    if (this.keys.has('KeyD')) f.pos.addScaledVector(right, sp);
    if (this.keys.has('KeyA')) f.pos.addScaledVector(right, -sp);
    if (this.keys.has('KeyE')) f.pos.y += sp;
    if (this.keys.has('KeyQ')) f.pos.y -= sp;
    if (this.keys.has('ArrowLeft')) f.yaw += dt; if (this.keys.has('ArrowRight')) f.yaw -= dt;
    if (this.keys.has('ArrowUp')) f.pitch += dt * 0.7; if (this.keys.has('ArrowDown')) f.pitch -= dt * 0.7;
    this.cam.position.copy(f.pos); this.cam.rotation.set(f.pitch, f.yaw, (f.roll * Math.PI) / 180, 'YXZ');
    this.cam.fov = lensToFov(f.lens); this.cam.clearViewOffset(); this.cam.updateProjectionMatrix();
    this.drawMarkers();
  }

  /** Camera path and key positions of the current shot, as markers in the world. */
  private drawMarkers() {
    const s = this.shot, key = JSON.stringify(s.camera?.keys ?? []);
    if (this.markers.userData.key === key) return;
    this.markers.userData.key = key; this.markers.clear();
    const keys = s.camera?.keys ?? []; if (!keys.length) return;
    const pts: THREE.Vector3[] = [], tl = this.player.tl!, s0 = tl.shotStart[this.shotI];
    for (let t = 0; t <= s.durationSec; t += s.durationSec / 40) pts.push(new THREE.Vector3(...tl.camera(s0 + t).pos));
    this.markers.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xe3a92a })));
    for (const k of keys) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.25), new THREE.MeshBasicMaterial({ color: 0xff6a3a })); m.position.set(...k.pos); this.markers.add(m); }
  }

  private export() {
    // only the layout layer: content/cutscenes/layout/<id>.layout.json (the script is narrative's file)
    const text = JSON.stringify(extractLayout(this.scene!, this.script!), null, 1);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = `${this.id}.layout.json`; a.click();
    void navigator.clipboard?.writeText(text).catch(() => {});
    this.dirty = false; this.render();
  }

  // ------------------------------------------------------------------ panel
  render() {
    if (!this.scene || !this.player.tl) return;
    const sc = this.scene, s = this.shot, tl = this.player.tl!;
    const castIds = Object.keys(sc.cast ?? {});
    this.root.innerHTML = `
      <aside class="ct-side">
        <header><b>CUTSCENE TOOL</b><select class="ct-scene">${cutsceneIds().map((i) => `<option ${i === this.id ? 'selected' : ''}>${esc(i)}</option>`).join('')}</select></header>
        <div class="ct-log">${esc(sc.logline ?? '')}</div>
        <ol class="ct-shots">${sc.shots.map((x, i) => `<li class="${i === this.shotI ? 'on' : ''}" data-i="${i}"><b>${esc(x.id)}</b> ${esc(x.type ?? '')} <span>${x.durationSec}s${x.camera?.keys?.length ? ` · ${x.camera.keys.length}k` : ' · not laid out'}</span></li>`).join('')}</ol>
        <div class="ct-script"><h4>SCRIPT · ${esc(s.id)}</h4>
          ${s.framing ? `<p><i>Framing</i> ${esc(s.framing)}</p>` : ''}${s.blocking ? `<p><i>Blocking</i> ${esc(s.blocking)}</p>` : ''}${s.move ? `<p><i>Move</i> ${esc(s.move)}</p>` : ''}
          ${(s.beats ?? []).map((b) => `<p>• ${esc(b)}</p>`).join('')}${s.notes ? `<p class="n">${esc(s.notes)}</p>` : ''}</div>
        <div class="ct-errs">${this.errors.length ? this.errors.map((e) => `<div>⚠ ${esc(e)}</div>`).join('') : '<div class="ok">✓ valid</div>'}</div>
      </aside>
      <section class="ct-insp">
        <div class="row"><label>Lens</label><select class="ct-lens">${LENSES.map((l) => `<option ${l === this.nearestLens() ? 'selected' : ''}>${l}</option>`).join('')}</select><span>mm · ${lensToFov(this.fly.lens).toFixed(1)}° v</span></div>
        <div class="row"><label>Focus</label><input class="ct-focus" type="range" min="0.5" max="250" step="0.1" value="${this.fly.focus}"><span>${this.fly.focus} m</span></div>
        <div class="row"><label>Stop</label><select class="ct-stop">${[1.4, 2, 2.8, 4, 5.6, 8, 11].map((f) => `<option ${f === this.fly.fStop ? 'selected' : ''}>${f}</option>`).join('')}</select><label>Roll</label><input class="ct-roll" type="number" step="1" value="${this.fly.roll}"></div>
        <div class="row"><label>Focus on</label>${castIds.map((c) => `<button class="ct-fon" data-a="${c}">${esc(c)}</button>`).join('')}</div>
        <div class="row"><button class="ct-key primary">Key camera (K)</button><button class="ct-delkey">Delete key</button></div>
        <div class="row"><label>Duration</label><input class="ct-dur" type="number" step="0.1" min="0.5" value="${s.durationSec}"><label>Handheld</label><input class="ct-hh" type="range" min="0" max="1" step="0.05" value="${s.camera?.handheld ?? 0}"></div>
        <div class="row"><label><input type="checkbox" class="ct-from" ${s.camera?.fromGameplay ? 'checked' : ''}> start on gameplay cam</label><label><input type="checkbox" class="ct-to" ${s.camera?.toGameplay ? 'checked' : ''}> end on gameplay cam</label></div>
        <div class="row"><label>Actor</label>${castIds.map((c) => `<button class="ct-act ${c === this.actorSel ? 'on' : ''}" data-a="${c}">${esc(c)}</button>`).join('')}<span class="hint">${this.actorSel ? 'click the street to mark · [ ] turn' : ''}</span></div>
        <div class="row"><button class="ct-add">+ Shot after</button><button class="ct-dup">Duplicate</button><button class="ct-del">Delete shot</button></div>
        <div class="row"><button class="ct-play primary">${this.mode === 'edit' ? '▶ Preview (Space)' : '❚❚ Edit (Space)'}</button><button class="ct-export">${this.dirty ? '⬇ Export JSON*' : '⬇ Export JSON'}</button><button class="ct-reset">Revert</button></div>
        <div class="row hint">WASD/QE fly · Shift fast · right-drag look · wheel = zoom ring · PgUp/PgDn shots</div>
      </section>
      <footer class="ct-tl"><div class="ct-ruler"></div><div class="ct-track"></div><div class="ct-head"></div></footer>
      <div class="ct-safe"><i></i><i></i><i></i><i></i></div>`;
    // timeline
    const track = this.root.querySelector('.ct-track') as HTMLElement, D = tl.duration;
    track.innerHTML = sc.shots.map((x, i) => `<div class="blk ${i === this.shotI ? 'on' : ''}" style="left:${(tl.shotStart[i] / D) * 100}%;width:${(x.durationSec / D) * 100}%"><b>${esc(x.id)}</b>${(x.camera?.keys ?? []).map((k) => `<i class="k" style="left:${(k.t / x.durationSec) * 100}%"></i>`).join('')}</div>`).join('')
      + tl.lines.map((l) => `<div class="ln" style="left:${(l.t0 / D) * 100}%;width:${((l.t1 - l.t0) / D) * 100}%" title="${esc(l.speaker)}: ${esc(l.text)}"></div>`).join('')
      + tl.events.map((e) => `<div class="ev ${e.kind}" style="left:${(e.t / D) * 100}%" title="${esc(e.kind)}: ${esc(e.cue)}"></div>`).join('');
    const ruler = this.root.querySelector('.ct-ruler') as HTMLElement;
    for (let t = 0; t <= D; t += 5) ruler.insertAdjacentHTML('beforeend', `<span style="left:${(t / D) * 100}%">${t}s</span>`);
    const scrub = (e: PointerEvent) => { const r = track.getBoundingClientRect(); const t = ((e.clientX - r.left) / r.width) * D; this.player.seek(t); this.shotI = tl.shotIndexAt(this.player.t); this.syncFlyFromPose(); this.updatePlayhead(); };
    track.addEventListener('pointerdown', (e) => { track.setPointerCapture(e.pointerId); scrub(e); const mv = (ev: PointerEvent) => scrub(ev); track.addEventListener('pointermove', mv); track.addEventListener('pointerup', () => { track.removeEventListener('pointermove', mv); this.render(); }, { once: true }); });
    this.updatePlayhead();
    // wiring
    const q = <T extends HTMLElement>(c: string) => this.root.querySelector(c) as T;
    q<HTMLSelectElement>('.ct-scene').onchange = (e) => void this.open((e.target as HTMLSelectElement).value);
    this.root.querySelectorAll<HTMLElement>('.ct-shots li').forEach((li) => (li.onclick = () => this.gotoShot(+li.dataset.i!)));
    q<HTMLSelectElement>('.ct-lens').onchange = (e) => { this.fly.lens = +(e.target as HTMLSelectElement).value; this.render(); };
    q<HTMLInputElement>('.ct-focus').oninput = (e) => { this.fly.focus = +(e.target as HTMLInputElement).value; (e.target as HTMLElement).nextElementSibling!.textContent = `${this.fly.focus} m`; };
    q<HTMLSelectElement>('.ct-stop').onchange = (e) => { this.fly.fStop = +(e.target as HTMLSelectElement).value; };
    q<HTMLInputElement>('.ct-roll').onchange = (e) => { this.fly.roll = +(e.target as HTMLInputElement).value; };
    this.root.querySelectorAll<HTMLElement>('.ct-fon').forEach((b) => (b.onclick = () => { const a = tl.actor(b.dataset.a!, this.player.t); if (a) { this.fly.focus = r3(Math.hypot(a.x - this.fly.pos.x, 1.6 - this.fly.pos.y, a.z - this.fly.pos.z)); this.render(); } }));
    q('.ct-key').onclick = () => this.keyCamera();
    q('.ct-delkey').onclick = () => this.deleteKeyAtPlayhead();
    q<HTMLInputElement>('.ct-dur').onchange = (e) => { s.durationSec = Math.max(0.5, +(e.target as HTMLInputElement).value); for (const k of s.camera?.keys ?? []) k.t = Math.min(k.t, s.durationSec); this.rebuild(); };
    q<HTMLInputElement>('.ct-hh').onchange = (e) => { (s.camera ??= { keys: [] }).handheld = +(e.target as HTMLInputElement).value; this.rebuild(); };
    q<HTMLInputElement>('.ct-from').onchange = (e) => { (s.camera ??= { keys: [] }).fromGameplay = (e.target as HTMLInputElement).checked; this.rebuild(); };
    q<HTMLInputElement>('.ct-to').onchange = (e) => { (s.camera ??= { keys: [] }).toGameplay = (e.target as HTMLInputElement).checked; this.rebuild(); };
    this.root.querySelectorAll<HTMLElement>('.ct-act').forEach((b) => (b.onclick = () => { this.actorSel = this.actorSel === b.dataset.a ? '' : b.dataset.a!; this.render(); }));
    q('.ct-add').onclick = () => { sc.shots.splice(this.shotI + 1, 0, { id: `s${sc.shots.length + 1}`, durationSec: 4, type: 'new shot', camera: { keys: [] } }); this.rebuild(); this.gotoShot(this.shotI + 1); };
    q('.ct-dup').onclick = () => { const c = structuredClone(s); c.id = `${s.id}b`; sc.shots.splice(this.shotI + 1, 0, c); this.rebuild(); this.gotoShot(this.shotI + 1); };
    q('.ct-del').onclick = () => { if (sc.shots.length > 1 && confirm(`Delete shot ${s.id}?`)) { sc.shots.splice(this.shotI, 1); this.rebuild(); this.gotoShot(Math.min(this.shotI, sc.shots.length - 1)); } };
    q('.ct-play').onclick = () => this.togglePreview();
    q('.ct-export').onclick = () => this.export();
    q('.ct-reset').onclick = () => { try { localStorage.removeItem(`t74.cine.${this.id}`); } catch { /* ignore */ } void this.open(this.id); };
    void fovToLens;
  }
  private updatePlayhead() {
    const h = this.root.querySelector('.ct-head') as HTMLElement | null; if (!h || !this.player.tl) return;
    h.style.left = `${(this.player.t / this.player.tl.duration) * 100}%`;
    h.dataset.t = `${this.player.t.toFixed(2)} s · ${this.shot.id} +${this.local.toFixed(2)}`;
  }
}
