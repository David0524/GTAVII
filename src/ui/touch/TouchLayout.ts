/**
 * Touch controls (docs/briefs/TOUCH_CONTROLS.md). Three states, at most six controls each; the left
 * thumb moves or steers, the right thumb acts.
 *
 *   on foot : floating stick · look drag · CONTEXT (large, label changes) · jump · weapon (if armed) · menu
 *   combat  : stick · aim drag + tap-to-lock + flick to switch · FIRE (large) · cover/roll · reload/swap · context (if any)
 *   driving : steering (stick, arrows or tilt) · GAS pedal (analog: slide up) · BRAKE pedal (analog; hold at a stop
 *             to reverse) · hand brake · exit (long-press: horn) · drive-by (if armed)
 *
 * Positions are stable across states: the context / enter / exit button keeps one slot, and fire / gas /
 * jump share the primary slot, so muscle memory carries over. Controls that leave fade out over 150 ms.
 * Movement, look, jump and the pedals go through Input (pad and keyboard untouched); the rest goes to
 * UiHost.touch. Layout edits (move, resize per element per state) live in settings.touchLayout.
 */
import { TRAVERSAL_VERB, type UiHost, type TouchMode } from '../../shared/uiHost';
import type { Input } from '../../input/Input';
import { settings } from '../../settings/Settings';
import { fullscreenRoute, enterFullscreen, showInstallCard, type FullscreenRoute } from './installCard';
import './touch.css';

type Slot = 'primary' | 'ctx' | 'a' | 'b' | 'c' | 'menu' | 'arrowL' | 'arrowR';
/** Centre offsets from the bottom-right safe corner (CSS px at scale 1); menu is from the top-right. */
export const SLOTS: Record<Slot, { x: number; y: number }> = {
  primary: { x: 86, y: 104 }, ctx: { x: 86, y: 232 }, a: { x: 196, y: 84 }, b: { x: 196, y: 190 }, c: { x: 196, y: 276 },
  menu: { x: 34, y: 32 }, arrowL: { x: -78, y: 84 }, arrowR: { x: -190, y: 84 },
};

interface Def {
  id: string; slot: Slot; kind: 'round' | 'pedal' | 'small';
  w: number; h?: number; label: string;
  /** Which states show it (and any extra condition). */
  in: TouchMode[]; when?: () => boolean;
}

export const STATES: TouchMode[] = ['foot', 'combat', 'drive'];

export class TouchLayout {
  readonly root = document.createElement('div');
  private els = new Map<string, HTMLElement>();
  private defs: Def[];
  private mode: TouchMode = 'foot';
  private stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private look = { id: -1, lx: 0, ly: 0, t0: 0, sx: 0, sy: 0, moved: 0 };
  private stickBase = document.createElement('div');
  private stickKnob = document.createElement('div');
  private marks: HTMLElement[] = [];
  private arrows = { l: false, r: false, v: 0 };
  private tilt = 0;
  private ctxT = 0; private lastLabel = '';
  private visible = true;
  private fs = document.createElement('button');
  private fsRoute: FullscreenRoute = 'api';
  private editing: { state: TouchMode; sel: string | null; onDone: () => void; panel: HTMLElement } | null = null;
  /** Diagnostics for the rig. */
  readonly cost = { frame: 0 };

  /** Long-press on Weapon: the UI's weapon selector (index.ts opens the 'weapons' overlay). */
  onWheel: (() => void) | null = null;

  constructor(private host: UiHost, private input: Input = host.input) {
    const t = host.touch;
    const armed = () => !!t?.armed();
    const hasCtx = () => !!t?.context();
    this.defs = [
      { id: 'jump', slot: 'primary', kind: 'round', w: 80, label: 'Jump', in: ['foot'] },
      { id: 'fire', slot: 'primary', kind: 'round', w: 96, label: 'Fire', in: ['combat'] },
      { id: 'gas', slot: 'primary', kind: 'pedal', w: 82, h: 164, label: 'Gas', in: ['drive'] },
      { id: 'ctx', slot: 'ctx', kind: 'round', w: 76, label: '', in: ['foot', 'combat', 'drive'], when: () => this.mode === 'drive' || hasCtx() },
      { id: 'weapon', slot: 'a', kind: 'round', w: 62, label: 'Weapon', in: ['foot'], when: armed },
      { id: 'cover', slot: 'a', kind: 'round', w: 66, label: 'Cover', in: ['combat'] },
      { id: 'brake', slot: 'a', kind: 'pedal', w: 74, h: 120, label: 'Brake', in: ['drive'] },
      { id: 'reload', slot: 'b', kind: 'round', w: 58, label: 'Reload', in: ['combat'] },
      { id: 'handbrake', slot: 'b', kind: 'round', w: 58, label: 'Hand brake', in: ['drive'] },
      { id: 'driveby', slot: 'c', kind: 'round', w: 56, label: 'Shoot', in: ['drive'], when: armed },
      { id: 'steerL', slot: 'arrowR', kind: 'round', w: 74, label: '◀', in: ['drive'], when: () => settings.get('steerMode') === 'arrows' },
      { id: 'steerR', slot: 'arrowL', kind: 'round', w: 74, label: '▶', in: ['drive'], when: () => settings.get('steerMode') === 'arrows' },
      { id: 'menu', slot: 'menu', kind: 'small', w: 44, label: 'Menu', in: ['foot', 'combat', 'drive'] },
    ];
    this.root.className = 'tc';
    const left = document.createElement('div'); left.className = 'tc-zone tc-left';
    const right = document.createElement('div'); right.className = 'tc-zone tc-right';
    this.stickBase.className = 'tc-stick'; this.stickKnob.className = 'tc-knob'; this.stickBase.appendChild(this.stickKnob);
    this.root.append(left, right, this.stickBase);
    for (const d of this.defs) this.root.appendChild(this.build(d));
    // fullscreen (tries to lock landscape) and the portrait "rotate" prompt, carried over from the old TouchControls
    // fullscreen: the API where it exists; on iPhone (no element fullscreen) the install card; hidden when installed
    this.fs.className = 't74-fs'; this.fs.textContent = '⛶'; this.fs.title = 'Full screen';
    this.fsRoute = fullscreenRoute();
    this.fs.addEventListener('click', () => { if (this.fsRoute === 'api') void enterFullscreen(); else if (this.fsRoute === 'install') showInstallCard('fullscreen'); });
    const rot = document.createElement('div'); rot.className = 't74-rotate'; rot.innerHTML = '↻<br><br>Rotate your phone<br><small>Tenderloin ’74 plays in landscape</small>';
    document.body.append(this.fs, rot);
    for (let i = 0; i < 10; i++) { const m = document.createElement('div'); m.className = 'tc-mark'; this.root.appendChild(m); this.marks.push(m); }
    this.bindStick(left); this.bindLook(right);
    document.body.appendChild(this.root);
    this.applySettings();
    settings.subscribe((_s, k) => { if (/^touch|^steer|^fireMode|^aimAssist|^gyroAim|^autoAccelerate/.test(k)) this.applySettings(); });
    if (typeof DeviceOrientationEvent !== 'undefined') window.addEventListener('deviceorientation', (e) => { this.tilt = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 28)); });
    this.setMode('foot', true);
  }

  // ------------------------------------------------------------------ elements
  private build(d: Def) {
    const el = document.createElement('div');
    el.className = `tc-btn tc-${d.kind} tc-id-${d.id}`; el.dataset.id = d.id;
    el.style.width = `${d.w}px`; el.style.height = `${d.h ?? d.w}px`;
    el.innerHTML = d.kind === 'pedal' ? `<i class="tc-fill"></i><b>${d.label}</b>` : `<b>${d.label}</b>`;
    this.els.set(d.id, el);
    const t = this.host.touch, inp = this.input;
    const hap = () => { if (settings.get('haptics')) navigator.vibrate?.(8); };
    let downT = 0, longTimer = 0, sx = 0, long = false;
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      if (this.editing) { this.editPick(d.id, e); return; }
      el.setPointerCapture(e.pointerId); el.classList.add('on'); downT = performance.now(); sx = e.clientX; long = false;
      switch (d.id) {
        case 'jump': inp.touchHeld.add('jump'); break;
        case 'fire': t?.setFiring?.(true); break;
        case 'gas': case 'brake': this.pedal(d.id, el, e); break;
        case 'handbrake': t?.handbrake?.(true); break;
        case 'driveby': t?.driveBy?.(true); break;
        case 'steerL': this.arrows.l = true; break;
        case 'steerR': this.arrows.r = true; break;
        case 'weapon': longTimer = window.setTimeout(() => { long = true; this.onWheel?.(); hap(); }, 300); break;
        case 'ctx': if (this.mode === 'drive') longTimer = window.setTimeout(() => { long = true; t?.horn?.(true); }, 450); break;
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (this.editing) { this.editDrag(d.id, e); return; }
      if ((d.id === 'gas' || d.id === 'brake') && el.classList.contains('on')) this.pedal(d.id, el, e);
    });
    const up = (e: PointerEvent) => {
      if (this.editing) { this.editEnd(); return; }
      if (!el.classList.contains('on')) return;
      el.classList.remove('on'); clearTimeout(longTimer);
      const tap = performance.now() - downT < 300;
      switch (d.id) {
        case 'jump': inp.touchHeld.delete('jump'); break;
        case 'fire': t?.setFiring?.(false); break;
        case 'gas': inp.touchPedals.gas = 0; this.fill(el, 0); break;
        case 'brake': inp.touchPedals.brake = 0; this.fill(el, 0); break;
        case 'handbrake': t?.handbrake?.(false); break;
        case 'driveby': t?.driveBy?.(false); break;
        case 'steerL': this.arrows.l = false; break;
        case 'steerR': this.arrows.r = false; break;
        case 'weapon': if (!long && tap) t?.drawWeapon?.(); break;
        case 'reload': { const dx = e.clientX - sx; if (Math.abs(dx) > 28) t?.swapWeapon?.(dx > 0 ? 1 : -1); else t?.reload?.(); hap(); break; }
        case 'cover': t?.coverOrRoll?.(this.moveDir()); break;
        case 'ctx': if (long) t?.horn?.(false); else if (t) t.doContext(this.moveDir()); else inp.tap('use'); hap(); break;
        case 'menu': inp.tap('pause'); break;
      }
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    return el;
  }

  /** Analog pedal: thumb height on the pedal, 0 at the bottom edge to 1 at the top (a touch always gives a little). */
  private pedal(id: 'gas' | 'brake', el: HTMLElement, e: PointerEvent) {
    const r = el.getBoundingClientRect();
    const v = Math.max(0.08, Math.min(1, (r.bottom - e.clientY) / r.height));
    this.input.touchPedals[id] = v; this.fill(el, v);
  }
  private fill(el: HTMLElement, v: number) { (el.firstElementChild as HTMLElement).style.transform = `scaleY(${v})`; }

  private moveDir() {
    const p = this.host.player(); const x = this.input.touchMove.x, y = this.input.touchMove.y;
    if (Math.hypot(x, y) < 0.2) return undefined;
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    return { x: x * c - y * s, z: -x * s - y * c };
  }

  // ------------------------------------------------------------------ stick
  private bindStick(zone: HTMLElement) {
    const R = 52;
    zone.addEventListener('pointerdown', (e) => {
      if (this.editing || this.stick.id >= 0) return;
      zone.setPointerCapture(e.pointerId);
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      this.stickBase.classList.add('on'); this.stickBase.style.left = `${e.clientX}px`; this.stickBase.style.top = `${e.clientY}px`;
      this.stickKnob.style.transform = '';
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stick.id) return;
      let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
      const drive = this.mode === 'drive';
      if (drive) dy = 0; // steering: horizontal only
      const m = Math.hypot(dx, dy);
      // the base follows a thumb that overshoots, so a long drag never "sticks" at the rim
      if (m > R * 1.9) { const k = (m - R * 1.9) / m; this.stick.ox += dx * k; this.stick.oy += dy * k; this.stickBase.style.left = `${this.stick.ox}px`; this.stickBase.style.top = `${this.stick.oy}px`; dx -= dx * k; dy -= dy * k; }
      const mm = Math.hypot(dx, dy), cl = mm > R ? R / mm : 1;
      this.stickKnob.style.transform = `translate(${dx * cl}px, ${dy * cl}px)`;
      const dz = (v: number) => (Math.abs(v) < 5 ? 0 : (v - Math.sign(v) * 5) / (R - 5));
      this.stick.x = Math.max(-1, Math.min(1, dz(dx))); this.stick.y = Math.max(-1, Math.min(1, -dz(dy)));
      this.input.touchMove.x = this.stick.x; this.input.touchMove.y = drive ? 0 : this.stick.y;
      // push past the rim to sprint (on foot)
      if (!drive && mm > R * 1.5) this.input.touchHeld.add('sprint'); else this.input.touchHeld.delete('sprint');
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick.id = -1; this.stickBase.classList.remove('on');
      this.input.touchMove.x = this.input.touchMove.y = 0; this.input.touchHeld.delete('sprint');
    };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  }

  // ------------------------------------------------------------------ look / aim / tap-to-lock / flick
  private bindLook(zone: HTMLElement) {
    zone.addEventListener('pointerdown', (e) => {
      if (this.editing || this.look.id >= 0) return;
      zone.setPointerCapture(e.pointerId);
      this.look = { id: e.pointerId, lx: e.clientX, ly: e.clientY, t0: performance.now(), sx: e.clientX, sy: e.clientY, moved: 0 };
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.look.id) return;
      const dx = e.clientX - this.look.lx, dy = e.clientY - this.look.ly;
      this.look.moved += Math.hypot(dx, dy);
      const k = 0.006 * settings.get('touchLookSensitivity') * (this.mode === 'combat' ? settings.get('touchAimSensitivity') : this.mode === 'drive' ? settings.get('touchDriveLookSensitivity') : 1);
      this.input.addLook(-dx * k, -dy * k);
      this.look.lx = e.clientX; this.look.ly = e.clientY;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.look.id) return;
      this.look.id = -1;
      const t = this.host.touch; if (!t || this.mode !== 'combat') return;
      const dt = performance.now() - this.look.t0, dx = e.clientX - this.look.sx, dy = e.clientY - this.look.sy;
      if (dt < 260 && this.look.moved < 12) {
        // tap: lock the nearest lockable under the thumb (56 px), else (tap-to-fire mode) a short burst
        const hit = this.pick(e.clientX, e.clientY);
        if (hit) { t.lockTarget?.(hit); if (settings.get('haptics')) navigator.vibrate?.(10); }
        else if (settings.get('fireMode') === 'tap') { t.setFiring?.(true); setTimeout(() => t.setFiring?.(false), 120); }
      } else if (dt < 280 && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2 && t.locked?.()) {
        t.swipeLock?.(dx > 0 ? 1 : -1); if (settings.get('haptics')) navigator.vibrate?.(6);
      }
    };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  }

  private pick(x: number, y: number): string | null {
    const t = this.host.touch; if (!t?.lockables || !t.project) return null;
    let best: string | null = null, bd = 56;
    for (const l of t.lockables()) { const p = t.project(l.x, l.y, l.z); if (!p) continue; const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = l.id; } }
    return best;
  }

  // ------------------------------------------------------------------ state
  setMode(m: TouchMode, force = false) {
    if (m === this.mode && !force) return;
    this.mode = m; this.root.dataset.mode = m;
    // steering and walking use the same stick: release it so a held walk doesn't become a held turn
    this.input.touchMove.x = this.input.touchMove.y = 0; this.input.touchPedals.gas = this.input.touchPedals.brake = 0;
    this.refresh();
  }
  private refresh() {
    const st = this.editing?.state ?? this.mode;
    for (const d of this.defs) {
      const on = d.in.includes(st) && (this.editing ? true : d.when?.() ?? true);
      this.els.get(d.id)!.classList.toggle('off', !on);
    }
  }
  setVisible(v: boolean) {
    if (v === this.visible) return; this.visible = v; this.root.classList.toggle('hidden', !v); this.fs.style.display = v && this.fsRoute !== 'none' ? '' : 'none';
    if (!v) { this.input.touchMove.x = this.input.touchMove.y = 0; this.input.touchHeld.clear(); this.input.touchPedals.gas = this.input.touchPedals.brake = 0; this.stick.id = -1; this.look.id = -1; this.stickBase.classList.remove('on'); }
  }

  update(dt: number) {
    if (!this.visible || this.editing) return;
    const t0 = performance.now(), t = this.host.touch;
    if (t) this.setMode(t.mode());
    // context label and conditional buttons at 4 Hz (gameplay's own check runs at 4 Hz too)
    this.ctxT -= dt;
    if (this.ctxT <= 0) {
      this.ctxT = 0.25;
      const c = t?.context() ?? null;
      const label = c?.label ?? (this.mode === 'drive' ? 'Exit' : t ? '' : 'Use');
      if (label !== this.lastLabel) { this.lastLabel = label; (this.els.get('ctx')!.firstElementChild as HTMLElement).textContent = label; }
      const cov = t?.coverLabel?.(); if (cov) (this.els.get('cover')!.firstElementChild as HTMLElement).textContent = cov;
      // the one jump button is also climb and vault (MOVEMENT.md): its label follows the engine's traversal check
      const tr = this.host.traversal?.() ?? null, jl = tr ? TRAVERSAL_VERB[tr.kind] : 'Jump';
      const jb = this.els.get('jump')!; if (jb.firstElementChild!.textContent !== jl) { jb.firstElementChild!.textContent = jl; jb.classList.toggle('trav', !!tr); }
      this.refresh();
      if (!t) this.els.get('ctx')!.classList.remove('off');
    }
    // steering by arrows (ramped) or tilt
    if (this.mode === 'drive') {
      const sm = settings.get('steerMode');
      if (sm === 'arrows') { const target = (this.arrows.r ? 1 : 0) - (this.arrows.l ? 1 : 0); this.arrows.v += Math.sign(target - this.arrows.v) * Math.min(Math.abs(target - this.arrows.v), dt / 0.15); this.input.touchMove.x = this.arrows.v; }
      else if (sm === 'tilt') this.input.touchMove.x = Math.abs(this.tilt) < 0.06 ? 0 : this.tilt;
    }
    this.drawMarks();
    this.cost.frame += (performance.now() - t0 - this.cost.frame) * 0.1;
  }

  /** Combat: a thin ring on every lockable in view; brackets on the locked one. */
  private drawMarks() {
    const t = this.host.touch; let n = 0;
    if (this.mode === 'combat' && t?.lockables && t.project) {
      const locked = t.locked?.() ?? null;
      for (const l of t.lockables()) {
        if (n >= this.marks.length) break;
        const p = t.project(l.x, l.y, l.z); if (!p) continue;
        const m = this.marks[n++]; m.style.transform = `translate(${p.x}px, ${p.y}px)`; m.classList.add('on'); m.classList.toggle('locked', l.id === locked);
      }
    }
    for (let i = n; i < this.marks.length; i++) this.marks[i].classList.remove('on');
  }

  // ------------------------------------------------------------------ settings and layout
  private applySettings() {
    const s = settings.data;
    this.root.style.setProperty('--tc-scale', String(s.touchButtonSize));
    this.root.style.setProperty('--tc-alpha', String(s.touchOpacity));
    this.root.classList.toggle('lefty', s.touchLeftHanded); document.body.classList.toggle('touch-lefty', s.touchLeftHanded);
    this.place();
    this.host.touch?.configure?.({ fireMode: s.fireMode, aimAssist: s.aimAssist, gyro: s.gyroAim, steerAssist: s.steerAssist, steerAssistStrength: s.steerAssistStrength, autoAccelerate: s.autoAccelerate });
    (this.els.get('gas')!.lastElementChild as HTMLElement).textContent = s.autoAccelerate ? 'Auto' : 'Gas';
    this.refresh();
  }

  /** Slot + the player's per-state offset; mirrored for left-handed. */
  private place() {
    const lay = settings.get('touchLayout'), lefty = settings.get('touchLeftHanded'), sc = settings.get('touchButtonSize');
    const st = this.editing?.state ?? this.mode;
    for (const d of this.defs) {
      const el = this.els.get(d.id)!, o = lay[st]?.[d.id] ?? lay['*']?.[d.id] ?? { dx: 0, dy: 0, s: 1 };
      const base = SLOTS[d.slot];
      const k = d.kind === 'small' ? 1 : sc;
      const x = base.x * (d.slot === 'menu' ? 1 : k) + o.dx, y = base.y * (d.slot === 'menu' ? 1 : k) + o.dy;
      el.style.setProperty('--s', String(o.s * k));
      el.style.left = el.style.right = el.style.top = el.style.bottom = '';
      const side = lefty ? 'left' : 'right', other = lefty ? 'right' : 'left';
      if (d.slot === 'menu') { el.style.right = `calc(${x}px + var(--safe-r))`; el.style.top = `calc(${y}px + var(--safe-t))`; }
      else if (x < 0) { el.style.setProperty(other, `calc(${-x}px + var(--safe-${other[0]}))`); el.style.bottom = `calc(${y}px + var(--safe-b))`; }
      else { el.style.setProperty(side, `calc(${x}px + var(--safe-${side[0]}))`); el.style.bottom = `calc(${y}px + var(--safe-b))`; }
    }
  }

  // ------------------------------------------------------------------ layout editor
  /** Shows every control of one state; drag to move, the panel resizes the selected one. */
  edit(onDone: () => void) {
    const panel = document.createElement('div'); panel.className = 'tc-edit';
    this.editing = { state: 'foot', sel: null, onDone, panel };
    this.root.classList.add('editing'); this.setVisible(true); this.root.appendChild(panel);
    (this.els.get('ctx')!.firstElementChild as HTMLElement).textContent = 'Context'; this.lastLabel = '';
    this.renderPanel(); this.place(); this.refresh();
  }
  private renderPanel() {
    const ed = this.editing!; const lay = settings.get('touchLayout');
    const sel = ed.sel ? lay[ed.state]?.[ed.sel] ?? { dx: 0, dy: 0, s: 1 } : null;
    const names: Record<TouchMode, string> = { foot: 'On foot', combat: 'Combat', drive: 'Driving' };
    ed.panel.innerHTML = `<div class="tc-edit-tabs">${STATES.map((s) => `<button data-s="${s}" class="${s === ed.state ? 'on' : ''}">${names[s]}</button>`).join('')}</div>
      <div class="tc-edit-row">${sel ? `<span>${this.defs.find((d) => d.id === ed.sel)!.label || 'Context'}</span><button data-a="smaller">−</button><b>${Math.round(sel.s * 100)}%</b><button data-a="bigger">+</button>` : '<span>Drag a control to move it. Tap one to resize it.</span>'}</div>
      <div class="tc-edit-row"><button data-a="reset">Reset ${names[ed.state].toLowerCase()}</button><button data-a="compact">Compact</button><button data-a="large">Large</button><button data-a="done" class="primary">Done</button></div>`;
    ed.panel.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('pointerup', (e) => { e.stopPropagation(); this.editAction(b.dataset.s ?? b.dataset.a!); }));
    ed.panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    for (const [id, el] of this.els) el.classList.toggle('sel', id === ed.sel);
  }
  private editAction(a: string) {
    const ed = this.editing!; const lay = structuredClone(settings.get('touchLayout'));
    const cur = (id: string) => (lay[ed.state] ??= {})[id] ??= { dx: 0, dy: 0, s: 1 };
    if ((STATES as string[]).includes(a)) { ed.state = a as TouchMode; ed.sel = null; }
    else if (a === 'smaller' && ed.sel) cur(ed.sel).s = Math.max(0.7, +(cur(ed.sel).s - 0.1).toFixed(2));
    else if (a === 'bigger' && ed.sel) cur(ed.sel).s = Math.min(1.6, +(cur(ed.sel).s + 0.1).toFixed(2));
    else if (a === 'reset') delete lay[ed.state];
    else if (a === 'compact' || a === 'large') {
      // presets: scale every control of this state and pull the cluster in (compact) or out (large)
      const f = a === 'compact' ? 0.85 : 1.2;
      for (const d of this.defs) if (d.in.includes(ed.state) && d.slot !== 'menu') { const b = SLOTS[d.slot]; lay[ed.state] ??= {}; lay[ed.state][d.id] = { dx: Math.round(b.x * (f - 1)), dy: Math.round(b.y * (f - 1)), s: f }; }
    } else if (a === 'done') { this.root.classList.remove('editing'); ed.panel.remove(); for (const el of this.els.values()) el.classList.remove('sel'); const cb = ed.onDone; this.editing = null; this.place(); this.refresh(); cb(); return; }
    settings.set('touchLayout', lay); this.renderPanel(); this.place(); this.refresh();
  }
  private drag: { id: string; x: number; y: number; dx: number; dy: number } | null = null;
  private editPick(id: string, e: PointerEvent) {
    const ed = this.editing!; ed.sel = id; (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const o = settings.get('touchLayout')[ed.state]?.[id] ?? { dx: 0, dy: 0, s: 1 };
    this.drag = { id, x: e.clientX, y: e.clientY, dx: o.dx, dy: o.dy }; this.renderPanel();
  }
  private editDrag(id: string, e: PointerEvent) {
    if (!this.drag || this.drag.id !== id) return;
    const lefty = settings.get('touchLeftHanded'), ed = this.editing!;
    const lay = structuredClone(settings.get('touchLayout')); const o = ((lay[ed.state] ??= {})[id] ??= { dx: 0, dy: 0, s: 1 });
    // offsets grow toward the screen centre (right-anchored: moving left is +dx)
    o.dx = Math.round(this.drag.dx + (lefty ? 1 : -1) * (e.clientX - this.drag.x) * (id === 'menu' ? -1 : 1));
    o.dy = Math.round(this.drag.dy + (id === 'menu' ? 1 : -1) * (e.clientY - this.drag.y));
    settings.set('touchLayout', lay); this.place();
  }
  private editEnd() { this.drag = null; }

  get state() { return { mode: this.mode, editing: this.editing?.state ?? null, visible: this.visible, pedals: { ...this.input.touchPedals }, steer: this.input.touchMove.x }; }
}
