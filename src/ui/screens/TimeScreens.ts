/**
 * Time screens:
 *  - WaitPrompt: a mission marker was reached outside its window ("Wait until 9:00 PM?").
 *  - SleepMenu: the bed (until morning / evening / an hour you pick) or, with no bed, just waiting an hour or two.
 * Both are plain modals: big buttons, nothing important bottom-right, usable by touch alone.
 */
import type { UiHost } from '../host/types';
import type { Input } from '../../input/Input';
import type { NavItem } from '../MenuNav';
import { Modal } from './Modal';
import { esc } from '../util';

/** 'HH:MM' -> minutes after midnight. */
export function toMinutes(t: string) { const [h, m] = t.split(':').map(Number); return ((h || 0) * 60 + (m || 0) + 1440) % 1440; }
/** minutes -> 'HH:MM'. */
export function toHHMM(min: number) { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
/** 'HH:MM' -> "9 PM" / "9:30 PM"; `full` always shows minutes ("9:00 PM"). */
export function clock12(t: string, full = false) {
  const m = toMinutes(t), h = Math.floor(m / 60), mm = m % 60;
  return `${((h + 11) % 12) + 1}${full || mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}
/** "Night only · 9 PM–3 AM": names the part of the day the window opens in. */
export function windowLabel(start: string, end: string) {
  const s = toMinutes(start), e = toMinutes(end), span = (e - s + 1440) % 1440;
  if (span === 0 || span >= 1380) return 'Any hour';
  const h = s / 60;
  const name = h >= 5 && h < 12 ? 'Morning' : h >= 12 && h < 17 ? 'Afternoon' : h >= 17 && h < 21 ? 'Evening' : h >= 1 && h < 5 ? 'Late night' : 'Night';
  return `${name} only · ${clock12(start)}–${clock12(end)}`;
}
/** "20 minutes" / "about 3 hours". */
function duration(mins: number) {
  if (mins < 60) return `${Math.max(1, Math.round(mins))} minutes`;
  const h = Math.round(mins / 60); return `about ${h} hour${h === 1 ? '' : 's'}`;
}

export class WaitPrompt extends Modal {
  private res: ((accept: boolean) => void) | null = null;
  constructor(input: Input, private host: UiHost) { super(input, 'dimbg u-wait'); }

  ask(e: { mission: string; title: string; windowStart: string; windowEnd: string }, resolve: (accept: boolean) => void) {
    this.res = resolve;
    this.show();
    const now = this.host.clock().minutes, until = toMinutes(e.windowStart);
    const wait = (until - now + 1440) % 1440;
    const at = clock12(e.windowStart, true).split(' ');
    // DESIGN_A: a band across the held frame; the hero is the hour you'd wait for
    this.root.innerHTML = `<div class="ts-center ts-a"><div class="ts-card">
        <div class="ts-job"><div class="ts-eyebrow">Not yet</div><div class="ts-mission"><span>Job</span><b>${esc(e.title)}</b></div><div class="ts-window">${esc(windowLabel(e.windowStart, e.windowEnd))}</div></div>
        <div class="ts-hero"><span class="a-label">Wait until</span><h2 class="a-num">${esc(at[0])}<small>${esc(at[1] ?? '')}</small></h2>
          <p class="ts-line">${esc(duration(wait))} to kill. It's ${esc(clock12(toHHMM(now), true))} now.</p></div>
        <div class="ts-btns"></div>
      </div></div>`;
    const items: NavItem[] = [];
    const btns = this.root.querySelector('.ts-btns')!;
    for (const [label, yes] of [['Wait', true], ['Not now', false]] as const) {
      const b = document.createElement('button'); b.className = `u-btn ts-big${yes ? ' primary' : ''}`; b.textContent = label; btns.appendChild(b);
      items.push({ el: b, activate: () => this.finish(yes) });
    }
    this.setNav(items);
  }
  private finish(accept: boolean) { const r = this.res; this.res = null; this.hide(true); r?.(accept); }
  protected back() { this.finish(false); }
  hide(silent = false) { const r = this.res; this.res = null; super.hide(silent); r?.(false); }
}

export class SleepMenu extends Modal {
  onToast?: (t: string) => void;
  private hour = 3; // the "Until…" stepper, whole hours
  constructor(input: Input, private host: UiHost) { super(input, 'dimbg u-sleep'); }

  openMenu() {
    this.hour = (Math.floor(this.host.clock().minutes / 60) + 4) % 24;
    this.show(); this.render(false);
  }

  private go(kind: 'sleep' | 'wait', until: string) {
    const r = this.host.act({ kind, until });
    this.hide();
    if (r.text) this.onToast?.(r.text);
  }

  private render(keep = true) {
    const info = this.host.sleepInfo?.() ?? { canSleep: true, bed: true, restQuality: 'good' as const };
    const now = this.host.clock().minutes, items: NavItem[] = [];
    const can = info.canSleep;
    const away = (t: string) => duration((toMinutes(t) - now + 1440) % 1440 || 1440);
    this.root.innerHTML = `<div class="u-head"><h2>${info.bed ? 'Turn in' : 'Kill some time'}</h2><span class="sub">${esc(clock12(toHHMM(now), true))} now</span><span class="close"></span></div>
      <div class="ts-sleepbody ts-a">${info.bed ? '<h4 class="t74-group">Wake up</h4>' : ''}<div class="ts-opts"></div><aside class="ts-notes"></aside></div><div class="u-foot">${this.footer()}</div>`;
    const close = document.createElement('button'); close.className = 'u-btn'; close.textContent = 'Cancel'; this.root.querySelector('.close')!.appendChild(close);
    const opts = this.root.querySelector('.ts-opts')!, notes = this.root.querySelector('.ts-notes')!;
    const opt = (title: string, at: string, sub: string, fn: () => void) => {
      const b = document.createElement('button'); b.className = 'ts-opt'; b.innerHTML = `<span class="lbl"><b>${esc(title)}</b><span>${esc(sub)}</span></span><em class="a-num">${esc(at)}</em>`;
      if (!can) b.setAttribute('aria-disabled', 'true');
      opts.appendChild(b); items.push({ el: b, activate: () => { if (can) fn(); } });
    };
    if (info.bed) {
      opt('Until morning', '7:00 AM', away('07:00'), () => this.go('sleep', '07:00'));
      opt('Until evening', '6:00 PM', away('18:00'), () => this.go('sleep', '18:00'));
      const until = toHHMM(this.hour * 60);
      const row = document.createElement('div'); row.className = 'ts-opt ts-step';
      row.innerHTML = `<div class="lbl"><b>Until…</b><span>${esc(away(until))}</span></div><button class="ts-arrow" aria-label="An hour earlier">−1 h</button><div class="ts-time a-num">${esc(clock12(until, true))}</div><button class="ts-arrow" aria-label="An hour later">+1 h</button><button class="u-btn primary ts-go">Sleep</button>`;
      opts.appendChild(row);
      const [dec, inc, goBtn] = [row.querySelectorAll('.ts-arrow')[0], row.querySelectorAll('.ts-arrow')[1], row.querySelector('.ts-go')] as HTMLElement[];
      const step = (d: number) => { this.hour = (this.hour + d + 24) % 24; this.render(); this.nav.focus(3); };
      const timeEl = row.querySelector('.ts-time') as HTMLElement;
      if (!can) goBtn.setAttribute('aria-disabled', 'true');
      items.push({ el: dec, activate: () => step(-1) }, { el: timeEl, inc: () => step(1), dec: () => step(-1), activate: () => { if (can) this.go('sleep', until); } },
        { el: inc, activate: () => step(1) }, { el: goBtn, activate: () => { if (can) this.go('sleep', until); } });
    } else {
      for (const hrs of [1, 2]) {
        const t = toHHMM(now + hrs * 60);
        opt(hrs === 1 ? 'Wait an hour' : 'Wait two hours', clock12(t, true), 'Stand around', () => this.go('wait', t));
      }
    }
    // Rest quality and what's next.
    const quality = info.restQuality === 'good' ? 'Good rest' : 'Poor rest';
    notes.innerHTML = `${info.bed ? `<div class="ts-rest ${info.restQuality}"><span class="a-label">Tonight</span><b>${quality}</b></div>` : ''}
      ${!can && info.reason ? `<p class="ts-reason">${esc(info.reason)}</p>` : ''}
      ${info.note ? `<p class="ts-note">${esc(info.note)}</p>` : ''}
      ${info.nextPinnedDate ? `<div class="ts-pin"><span>The story continues on</span><b>${esc(info.nextPinnedDate)}</b></div>` : ''}`;
    items.push({ el: close, activate: () => this.hide() });
    this.setNav(items, keep);
  }
}
