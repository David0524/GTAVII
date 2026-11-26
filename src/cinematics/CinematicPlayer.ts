/**
 * Plays a cutscene in-engine in the 35 mm language:
 *  - drives the real camera through CameraDirector (acquire/release), lens -> FOV, roll, rack-focus
 *    data to the post hook when it exists, sub-pixel gate weave via setViewOffset;
 *  - blocks actors (the characters stream's ActorHost when merged; until then period-coloured stand-ins
 *    in one scene group), and hides the player's own body;
 *  - letterbox (2.39:1, animated in and out), grain and vignette as a DOM layer over the 3D and under
 *    the subtitles and cards; title cards and lower thirds; fades;
 *  - subtitles always (no information only in audio), speaker names and colours per settings;
 *  - skippable (hold Enter/Space, hold A, or the HOLD TO SKIP button on touch), pausable everywhere
 *    (Esc / Menu / the ❚❚ button on touch);
 *  - seamless in and out: a shot with fromGameplay/toGameplay starts or ends on the live gameplay pose
 *    and the camera is handed back with no cut and no black frame.
 * Timeline cues go to host.commit (the engine performs state changes; audio cues are 'audio:<name>').
 */
import * as THREE from 'three/webgpu';
import type { UiHost } from '../shared/uiHost';
import { Timeline } from './Timeline';
import type { Cutscene, ShotFilm, V3 } from './schema';
import { loadCutscene } from './content';
import { settings } from '../settings/Settings';
import { esc } from '../ui/util';

export interface PlayOptions { onEnd?: (skipped: boolean) => void; startAt?: number; paused?: boolean }
/** How the player asks the UI for a choice (the UI's Choices overlay: untimed, ≤ 4, large buttons). */
export type AskChoice = (choices: { id: string; text: string }[], resolve: (id: string) => void) => void;

export class CinematicPlayer {
  tl: Timeline | null = null;
  scene: Cutscene | null = null;
  t = 0;
  playing = false;
  paused = false;
  private cam: THREE.PerspectiveCamera | null = null;
  private restoreFov = 60;
  private actors = new THREE.Group();
  private bodies = new Map<string, THREE.Group>();
  private fx = document.createElement('div');
  private skipHeld = 0;
  private lastSkipT = 0;
  private opts: PlayOptions = {};
  private lastLine = '';
  private cardEls: HTMLElement[] = [];
  private bars = 0; // 0..1 letterbox amount
  /** Last evaluated pose (the tool reads it). */
  pose: ReturnType<Timeline['camera']> | null = null;

  /** Set by the UI root: shows the dialogue-choice overlay. */
  askChoice: AskChoice | null = null;
  private waiting = false;
  private held = new Set<number>();
  private choicesOf: (ref: string) => import('./schema').DialogueChoiceSet | null = () => null;

  constructor(private host: UiHost) {
    this.actors.name = 'cinematics-actors';
    this.fx.className = 'cine-fx'; this.fx.style.display = 'none';
    this.fx.innerHTML = `<div class="cine-grain"></div><div class="cine-vig"></div><div class="cine-bar top"></div><div class="cine-bar bot"></div><div class="cine-fade"></div>
      <div class="cine-cards"></div><div class="cine-sub"></div>
      <button class="cine-pause" aria-label="Pause">❚❚</button><button class="cine-skip"><i></i><span>HOLD TO SKIP</span></button><div class="cine-skiphint"></div>
      <div class="cine-menu"><div><b>PAUSED</b><button data-a="resume">Resume</button><button data-a="skip">Skip the scene</button></div></div>`;
    document.body.appendChild(this.fx);
    const skipBtn = this.fx.querySelector('.cine-skip') as HTMLElement;
    let touchHold = false;
    skipBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); touchHold = true; });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) skipBtn.addEventListener(ev, () => { touchHold = false; });
    this.touchHold = () => touchHold;
    this.fx.querySelector('.cine-pause')!.addEventListener('click', () => this.setPaused(true));
    this.fx.querySelectorAll<HTMLElement>('.cine-menu button').forEach((b) => b.addEventListener('click', () => (b.dataset.a === 'skip' ? this.stop(true) : this.setPaused(false))));
  }
  private touchHold: () => boolean = () => false;

  async play(id: string, opts: PlayOptions = {}) {
    const { scene, dialogue, choices, speaker } = await loadCutscene(id);
    this.choicesOf = choices; this.held.clear(); this.waiting = false;
    this.scene = scene; this.opts = opts;
    this.tl = new Timeline(scene, dialogue, speaker);
    this.t = opts.startAt ?? 0; this.playing = true; this.paused = !!opts.paused; this.skipHeld = 0; this.lastLine = '';
    if (this.host.camera) { this.cam = this.host.camera.acquire('cinematics'); this.restoreFov = this.cam.fov; }
    this.host.freezePlayer?.(true);
    this.host.playerVisible?.(false);
    this.spawnActors();
    this.fx.style.display = ''; this.fx.classList.toggle('touch', this.host.input.activeDevice === 'touch');
    this.fx.querySelector('.cine-skiphint')!.innerHTML = this.host.input.activeDevice === 'touch' ? '' : `Hold <span class="t74-key">${this.host.input.promptStyle === 'keyboard' ? 'ENTER' : this.host.input.promptStyle === 'playstation' ? '✕' : 'A'}</span> to skip`;
    (this.fx.querySelector('.cine-skip') as HTMLElement).style.display = scene.skippable === false ? 'none' : '';
    this.bars = scene.shots[0].film && !Array.isArray(scene.shots[0].film) && scene.shots[0].film.letterbox === 0 ? 0 : 1;
    this.apply(0);
  }

  private spawnActors() {
    this.actors.clear(); this.bodies.clear();
    const lead = this.host.player().lead;
    for (const [id, c] of Object.entries(this.scene!.cast ?? {})) {
      if (this.host.actors) { this.host.actors.spawn(id, c.cast, { x: 0, z: 0, heading: 0 }); continue; }
      const h = c.height ?? 1.8, col = new THREE.Color(c.colour ?? '#6a5a4a');
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 });
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, h * 0.42, 4, 10), mat); torso.position.y = h * 0.52;
      const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, h * 0.36, 4, 8), new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.55), roughness: 0.9 })); legs.position.y = h * 0.24;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), new THREE.MeshStandardMaterial({ color: 0x9a7058, roughness: 0.7 })); head.position.y = h * 0.92;
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.06), head.material); nose.position.set(0, h * 0.92, -0.12); // which way they face
      g.add(torso, legs, head, nose); g.userData.lead = c.cast === lead;
      this.actors.add(g); this.bodies.set(id, g);
    }
    if (!this.host.actors) this.host.scene?.add(this.actors);
  }

  private gameplayPose() {
    const gp = this.host.camera?.gameplayPose();
    if (!gp) return undefined;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(gp.quaternion);
    const pos: V3 = [gp.position.x, gp.position.y, gp.position.z];
    return { pos, look: [pos[0] + fwd.x * 10, pos[1] + fwd.y * 10, pos[2] + fwd.z * 10] as V3, fov: this.restoreFov };
  }

  setPaused(p: boolean) { this.paused = p; this.fx.classList.toggle('paused', p); }
  seek(t: number) {
    if (!this.tl) return;
    this.t = Math.max(0, Math.min(this.tl.duration, t)); this.lastLine = '';
    // cards that should be on screen at t (they only start by crossing their time when playing)
    for (const c of this.cardEls) c.remove(); this.cardEls = [];
    for (const e of this.tl.events) if (e.kind === 'card' && e.t <= this.t && this.t < e.t + (e.seconds ?? 4)) this.card(e.cue, e.style ?? 'title', e.t + (e.seconds ?? 4) - this.t);
    this.apply(0);
  }

  update(dt: number) {
    if (!this.playing || !this.tl) return;
    const inp = this.host.input;
    if (inp.pressed('pause')) this.setPaused(!this.paused);
    if (this.scene!.skippable !== false && !this.paused) {
      // wall-clock, not frame dt: dt is clamped, so on a slow device a dt-based hold would take longer than a second
      const holding = inp.isHeld('skip') || this.touchHold(), now = performance.now() / 1000, real = this.lastSkipT ? now - this.lastSkipT : 0; this.lastSkipT = now;
      this.skipHeld = holding ? this.skipHeld + real : Math.max(0, this.skipHeld - real * 2);
      (this.fx.querySelector('.cine-skip i') as HTMLElement).style.width = `${Math.min(1, this.skipHeld / 1) * 100}%`;
      this.fx.classList.toggle('skipping', this.skipHeld > 0.05);
      if (this.skipHeld >= 1) { this.stop(true); return; }
    }
    if (this.paused || this.waiting) return;
    const t0 = this.t;
    this.t = Math.min(this.tl.duration, this.t + dt);
    // a choice-hold shot freezes the frame here, untimed, until the player chooses
    const si = this.tl.shotIndexAt(this.t === this.tl.duration ? this.t - 1e-6 : this.t);
    for (let i = this.tl.shotIndexAt(t0); i <= si; i++) {
      const sh = this.scene!.shots[i];
      if (sh.waitFor === 'choice' && !this.held.has(i) && this.tl.shotStart[i] + sh.durationSec <= this.t + 1e-6) {
        this.held.add(i); this.t = this.tl.shotStart[i] + sh.durationSec; this.apply(0);
        const set = this.choicesOf(sh.choices ?? '');
        if (set && this.askChoice) {
          this.waiting = true;
          this.askChoice(set.choices.map((c, k) => ({ id: c.goto ?? String(k), text: c.text })), (cid) => { this.waiting = false; this.host.commit?.('dialogue.choice', { ref: sh.choices, choice: cid }); });
          return;
        }
      }
    }
    for (const e of this.tl.eventsBetween(t0, this.t)) {
      if (e.kind === 'card') this.card(e.cue, e.style ?? 'title', e.seconds ?? 4);
      else this.host.commit?.(e.kind === 'audio' ? `audio:${e.cue}` : e.cue, e.data);
    }
    this.apply(dt);
    if (this.t >= this.tl.duration) this.stop(false);
  }

  /** Pose the camera, actors and film layer for the current time. */
  private apply(dt: number) {
    const tl = this.tl!, si = tl.shotIndexAt(this.t), shot = this.scene!.shots[si];
    const pose = tl.camera(this.t, this.gameplayPose()); this.pose = pose;
    const cam = this.cam;
    if (cam) {
      cam.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
      cam.up.set(0, 1, 0); cam.lookAt(pose.look[0], pose.look[1], pose.look[2]);
      if (pose.roll) cam.rotateZ((pose.roll * Math.PI) / 180);
      cam.fov = pose.fov; cam.updateProjectionMatrix();
    }
    const film: ShotFilm = shot.film && !Array.isArray(shot.film) ? shot.film : {};
    this.host.post?.set({ dofFocusM: pose.focusM, fStop: pose.fStop, focalMm: pose.lensMm, grain: film.grain, weave: film.weave, letterbox: film.letterbox });
    // gate weave: sub-pixel frame shift, a touch of vertical float like a projector gate
    if (cam && !this.host.post) {
      const w = (film.weave ?? 0.4) * (settings.get('reduceMotion') ? 0 : 1);
      const W = innerWidth, H = innerHeight, k = this.t * 24;
      const dx = (Math.sin(k * 0.71) * 0.6 + Math.sin(k * 2.3) * 0.25) * w * 0.7, dy = (Math.sin(k * 0.53 + 1.3) * 0.7 + Math.sin(k * 1.9) * 0.3) * w;
      if (w > 0.01) cam.setViewOffset(W, H, dx, dy, W, H); else cam.clearViewOffset();
    }
    // actors
    for (const [id, g] of this.bodies) {
      const a = tl.actor(id, this.t); g.visible = !!a; if (!a) continue;
      const bob = a.anim === 'walk' ? Math.abs(Math.sin(this.t * 6.2)) * 0.035 : 0;
      g.position.set(a.x, groundY(a.x, a.z) + bob, a.z); g.rotation.y = a.heading;
    }
    if (this.host.actors) for (const id of tl.actorIds) { const a = tl.actor(id, this.t); if (a) this.host.actors.pose(id, { x: a.x, z: a.z, heading: a.heading }, a.anim); }
    // film layer
    const local = this.t - tl.shotStart[si];
    const lbTarget = settings.get('cutsceneLetterbox') && film.letterbox !== 0 ? 1 : 0;
    this.bars += (lbTarget - this.bars) * Math.min(1, dt * 2.2);
    if (!dt) this.bars = lbTarget;
    const barH = Math.max(0, (innerHeight - innerWidth / 2.39) / 2) * this.bars;
    this.fx.style.setProperty('--bar', `${barH.toFixed(1)}px`);
    this.fx.style.setProperty('--grain', String(((film.grain ?? 0.7) * settings.get('filmGrain') * 0.13).toFixed(3)));
    const fadeIn = film.fadeIn ?? 0, fadeOut = film.fadeOut ?? 0;
    const fade = fadeIn && local < fadeIn ? 1 - local / fadeIn : fadeOut && shot.durationSec - local < fadeOut ? 1 - (shot.durationSec - local) / fadeOut : 0;
    (this.fx.querySelector('.cine-fade') as HTMLElement).style.opacity = fade.toFixed(3);
    // subtitles
    const line = tl.lineAt(this.t);
    const key = line ? `${line.t0}` : '';
    if (key !== this.lastLine) {
      this.lastLine = key;
      const sub = this.fx.querySelector('.cine-sub') as HTMLElement;
      const on = settings.get('subtitles') && settings.get('subtitleMode') !== 'off';
      if (line && on) {
        const leadCol = this.host.party().find((l) => l.short.toLowerCase() === line.speaker.toLowerCase())?.colour;
        const who = settings.get('subtitleSpeakerNames') && line.speaker ? `<span class="who"${settings.get('subtitleSpeakerColours') && leadCol ? ` style="color:${leadCol}"` : ''}>${esc(line.speaker)}</span>` : '';
        sub.innerHTML = `${who}${esc(line.text)}`; sub.dataset.bg = settings.get('subtitleBackground'); sub.style.opacity = '1';
      } else sub.style.opacity = '0';
    }
  }

  private card(text: string, style: string, seconds: number) {
    const c = document.createElement('div'); c.className = `cine-card ${style}`;
    c.innerHTML = style === 'title' ? `<div class="w">${esc(text.replace(/\s*'74$/, ''))}</div>${/'74$/.test(text) ? `<div class="m">'74</div>` : ''}` : esc(text);
    this.fx.querySelector('.cine-cards')!.appendChild(c); this.cardEls.push(c);
    requestAnimationFrame(() => c.classList.add('show'));
    setTimeout(() => { c.classList.remove('show'); setTimeout(() => c.remove(), 1200); }, seconds * 1000);
  }

  stop(skipped: boolean) {
    if (!this.playing) return;
    this.playing = false;
    const tl = this.tl!, last = this.scene!.shots[this.scene!.shots.length - 1];
    // Skipping fires the cues the player would have seen (state must end up the same either way).
    if (skipped) for (const e of tl.eventsBetween(this.t, tl.duration + 1)) if (e.kind === 'cue') this.host.commit?.(e.cue, e.data);
    if (this.cam) {
      this.cam.clearViewOffset(); this.cam.fov = this.restoreFov; this.cam.updateProjectionMatrix();
      // landed on the gameplay pose already -> hand back with no blend; otherwise a short blend (never a black frame)
      this.host.camera!.release(skipped || !last.camera?.toGameplay ? 0.9 : 0);
      this.cam = null;
    }
    this.host.scene?.remove(this.actors);
    if (this.host.actors) for (const id of Object.keys(this.scene!.cast ?? {})) this.host.actors.despawn(id);
    this.host.playerVisible?.(true);
    this.host.freezePlayer?.(false);
    for (const c of this.cardEls) c.remove(); this.cardEls = [];
    this.fx.style.display = 'none'; this.fx.classList.remove('paused', 'skipping');
    this.opts.onEnd?.(skipped);
  }
}

/** Ground height for actor feet: the engine's terrain if loaded (shared API), else 0. */
let heightFn: ((x: number, z: number) => number) | null = null;
import('../shared/terrain').then((m) => { heightFn = (x, z) => m.heightAt(x, z) + m.CURB_HEIGHT; }).catch(() => {});
function groundY(x: number, z: number) { return heightFn ? heightFn(x, z) : 0; }
