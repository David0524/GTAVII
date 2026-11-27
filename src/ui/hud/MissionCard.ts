/**
 * Mission end cards (DESIGN_A §6): a black band wipes across the frame, a small label (Done / Failed) over the
 * mission's name set big in Franklin, the takings counting up, then it retracts. Original wording and layout
 * (no "mission passed" banner). Gameplay emits `missionEnd`; skippable with confirm/back or a tap.
 */
import { esc, money } from '../util';

export interface MissionEnd { result: 'passed' | 'failed'; title: string; reason?: string; cash?: number; lines?: { label: string; value: string }[] }

export class MissionCard {
  readonly el = document.createElement('div');
  private t = 0; private dur = 0; private cash = 0; private shown = 0;
  constructor() { this.el.className = 'u-mcard'; this.el.style.display = 'none'; this.el.addEventListener('pointerdown', () => this.close()); document.body.appendChild(this.el); }

  show(e: MissionEnd) {
    const ok = e.result === 'passed';
    this.cash = ok ? e.cash ?? 0 : 0; this.shown = 0; this.t = 0; this.dur = ok ? 6 : 5;
    this.el.className = `u-mcard ${ok ? 'pass' : 'fail'}`;
    this.el.innerHTML = `<div class="band"><div class="in">
        <span class="lbl">${ok ? 'Done' : 'Failed'}</span>
        <h2>${esc(e.title)}</h2>
        ${!ok && e.reason ? `<p class="why">${esc(e.reason)}</p>` : ''}
        <div class="rows">${ok && e.cash ? '<div class="row money"><span>Your cut</span><b class="cash">$0.00</b></div>' : ''}${(e.lines ?? []).map((l) => `<div class="row"><span>${esc(l.label)}</span><b>${esc(l.value)}</b></div>`).join('')}</div>
      </div></div>`;
    this.el.style.display = '';
    requestAnimationFrame(() => this.el.classList.add('on'));
  }
  close() { if (this.el.style.display === 'none') return; this.el.classList.remove('on'); this.el.classList.add('off'); setTimeout(() => { this.el.style.display = 'none'; this.el.classList.remove('off'); }, 380); }
  get open() { return this.el.style.display !== 'none'; }

  update(dt: number) {
    if (!this.open) return;
    this.t += dt;
    if (this.cash && this.t > 0.7 && this.shown < this.cash) {
      this.shown = Math.min(this.cash, this.shown + this.cash * dt / 1.1);
      const c = this.el.querySelector('.cash'); if (c) c.textContent = money(this.shown);
    }
    if (this.t > this.dur) this.close();
  }
}
