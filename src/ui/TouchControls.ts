import type { Input, ButtonAction } from '../input/Input';
import { settings } from '../settings/Settings';

/**
 * Landscape touch layout (phones/tablets):
 *   left half  : floating analog stick (appears where the thumb lands)
 *   right half : drag anywhere to look
 *   right edge : action buttons (up/down for the Phase 1 fly cam; jump/use/sprint later)
 * Portrait shows a "rotate your device" prompt. A fullscreen button tries to lock landscape.
 */
const CSS = `
.t74-touch { position: fixed; inset: 0; z-index: 5; touch-action: none; user-select: none; -webkit-user-select: none; }
.t74-zone { position: absolute; top: 0; bottom: 0; }
.t74-stick-base { position: absolute; width: 120px; height: 120px; margin: -60px 0 0 -60px; border-radius: 50%;
  border: 2px solid #e6dcc655; background: #0003; display: none; pointer-events: none; }
.t74-stick-knob { position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; margin: -27px 0 0 -27px; border-radius: 50%;
  background: #e6dcc677; }
.t74-btns { position: absolute; right: calc(12px + env(safe-area-inset-right)); bottom: calc(14px + env(safe-area-inset-bottom));
  display: grid; grid-template-columns: repeat(2, 58px); gap: 10px; }
.t74-btn { width: 58px; height: 58px; border-radius: 50%; border: 2px solid #e6dcc666; background: #0006; color: #efe6d0;
  font: 600 12px ui-monospace, monospace; display: grid; place-items: center; letter-spacing: .05em; }
.t74-btn.on { background: #e6dcc655; }
.t74-fs { position: fixed; top: calc(8px + env(safe-area-inset-top)); right: calc(8px + env(safe-area-inset-right)); z-index: 6;
  width: 40px; height: 40px; border-radius: 8px; border: 1px solid #e6dcc666; background: #0007; color: #efe6d0; font-size: 18px; }
.t74-rotate { position: fixed; inset: 0; z-index: 20; display: none; place-items: center; background: #0c0b0a; color: #e6dcc6;
  font: 14px ui-monospace, monospace; letter-spacing: .15em; text-align: center; padding: 24px; }
@media (orientation: portrait) and (pointer: coarse) { .t74-rotate { display: grid; } }
`;

export class TouchControls {
  readonly root = document.createElement('div');
  private stickBase = document.createElement('div');
  private stickKnob = document.createElement('div');
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  lookSpeed = 0.006; // rad per CSS px

  constructor(input: Input, buttons: { label: string; action: ButtonAction; hold: boolean }[]) {
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    this.root.className = 't74-touch';
    const left = document.createElement('div'); left.className = 't74-zone'; left.style.left = '0'; left.style.width = '45%';
    const right = document.createElement('div'); right.className = 't74-zone'; right.style.right = '0'; right.style.width = '55%';
    this.stickBase.className = 't74-stick-base'; this.stickKnob.className = 't74-stick-knob'; this.stickBase.appendChild(this.stickKnob);
    this.root.append(left, right, this.stickBase);

    left.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      this.stickId = e.pointerId; left.setPointerCapture(e.pointerId);
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      Object.assign(this.stickBase.style, { display: 'block', left: `${e.clientX}px`, top: `${e.clientY}px` });
      this.stickKnob.style.transform = '';
    });
    left.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      const R = 50; let dx = e.clientX - this.stickOrigin.x, dy = e.clientY - this.stickOrigin.y;
      const m = Math.hypot(dx, dy); if (m > R) { dx *= R / m; dy *= R / m; }
      this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      // small dead zone, then linear; pushing to the rim also sprints
      const dz = (v: number) => (Math.abs(v) < 6 ? 0 : v / R);
      input.touchMove.x = dz(dx); input.touchMove.y = -dz(dy);
      if (m > R * 1.6) input.touchHeld.add('sprint'); else input.touchHeld.delete('sprint');
    });
    const endStick = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null; this.stickBase.style.display = 'none';
      input.touchMove.x = input.touchMove.y = 0; input.touchHeld.delete('sprint');
    };
    left.addEventListener('pointerup', endStick); left.addEventListener('pointercancel', endStick);

    right.addEventListener('pointerdown', (e) => {
      if (this.lookId !== null) return;
      this.lookId = e.pointerId; right.setPointerCapture(e.pointerId); this.lookLast = { x: e.clientX, y: e.clientY };
    });
    right.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      const k = this.lookSpeed * settings.get('touchLookSensitivity');
      input.addLook(-(e.clientX - this.lookLast.x) * k, -(e.clientY - this.lookLast.y) * k);
      this.lookLast = { x: e.clientX, y: e.clientY };
    });
    const endLook = (e: PointerEvent) => { if (e.pointerId === this.lookId) this.lookId = null; };
    right.addEventListener('pointerup', endLook); right.addEventListener('pointercancel', endLook);

    const btns = document.createElement('div'); btns.className = 't74-btns';
    for (const b of buttons) {
      const el = document.createElement('button'); el.className = 't74-btn'; el.textContent = b.label;
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); el.setPointerCapture(e.pointerId); el.classList.add('on');
        if (b.hold) input.touchHeld.add(b.action); else input.tap(b.action);
      });
      const up = () => { el.classList.remove('on'); if (b.hold) input.touchHeld.delete(b.action); };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      btns.appendChild(el);
    }
    this.root.appendChild(btns);
    document.body.appendChild(this.root);

    const fs = document.createElement('button'); fs.className = 't74-fs'; fs.textContent = '⛶'; fs.title = 'Fullscreen';
    fs.addEventListener('click', async () => {
      try {
        await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
        await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
      } catch { /* iOS Safari: no fullscreen/orientation lock; the rotate prompt covers it */ }
    });
    document.body.appendChild(fs);

    // A controller takes over: hide the on-screen controls; the next touch brings them back.
    const show = (d: string) => { const on = d === 'touch'; this.root.style.display = on ? '' : 'none'; fs.style.display = on ? '' : 'none'; };
    input.onDeviceChange(show);
    show(input.activeDevice);

    const rot = document.createElement('div'); rot.className = 't74-rotate';
    rot.innerHTML = '↻<br><br>ROTATE YOUR DEVICE<br>TENDERLOIN \'74 PLAYS IN LANDSCAPE';
    document.body.appendChild(rot);
  }
}
