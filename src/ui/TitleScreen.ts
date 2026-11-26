/**
 * Title screen over the live city at dusk: '70s poster wordmark with a marquee "'74", tagline,
 * film-leader loading bar while the city streams, then CONTINUE / NEW GAME / SETTINGS / CREDITS.
 * The camera behind it drifts slowly past the Flatiron.
 */
import type { Input } from '../input/Input';
import { MenuNav } from './MenuNav';
import { glyph } from './Prompts';
import { escapeHtml } from './Hud';

export interface TitleChoice { kind: 'continue' | 'new' | 'settings' | 'credits' }

export class TitleScreen {
  readonly root = document.createElement('div');
  private menu = document.createElement('div');
  private leader = document.createElement('div');
  private nav: MenuNav;
  open = true;
  private ready = false;

  constructor(private input: Input, private onChoice: (c: TitleChoice) => void) {
    this.nav = new MenuNav(input);
    this.root.className = 't74-screen t74-letterbox t74-grain';
    this.root.innerHTML = `<div class="t74-vignette"></div>
      <div class="t74-logo"><div class="word">Tenderloin</div><div class="t74-marquee">'74</div>
      <div class="t74-tagline">Manhattan · Summer · Nineteen seventy-four</div></div>`;
    this.menu.className = 't74-menu'; this.menu.style.visibility = 'hidden';
    this.leader.className = 't74-leader';
    this.leader.innerHTML = '<span>THREADING THE PROJECTOR</span><div class="bar"><i></i></div>';
    const legal = document.createElement('div'); legal.className = 't74-legal';
    legal.innerHTML = 'Map data © OpenStreetMap contributors · NYC Open Data · All businesses and brands are fictional';
    this.root.append(this.menu, this.leader, legal);
    document.body.appendChild(this.root);
  }

  /** 0..1 city streaming progress. */
  progress(p: number) {
    (this.leader.querySelector('i') as HTMLElement).style.width = `${Math.round(p * 100)}%`;
    const steps = ['THREADING THE PROJECTOR', 'LEADER · 8', 'LEADER · 5', 'LEADER · 3', 'ROLLING'];
    (this.leader.querySelector('span') as HTMLElement).textContent = steps[Math.min(steps.length - 1, Math.floor(p * steps.length))];
  }

  setReady(continueLabel: string | null) {
    if (this.ready) return;
    this.ready = true;
    this.leader.style.display = 'none';
    const st = this.input.promptStyle === 'touch' ? 'keyboard' : this.input.promptStyle;
    const opts: [TitleChoice['kind'], string, string | null][] = [
      ['continue', 'Continue', continueLabel], ['new', 'New game', null], ['settings', 'Settings', null], ['credits', 'Credits', null],
    ];
    this.menu.innerHTML = '';
    const items = opts.filter(([k]) => k !== 'continue' || continueLabel).map(([k, label, sub]) => {
      const b = document.createElement('button');
      b.innerHTML = `${label}${sub ? `<span class="sub">${escapeHtml(sub)}</span>` : ''}`;
      this.menu.appendChild(b);
      return { el: b, activate: () => this.onChoice({ kind: k }) };
    });
    this.menu.style.visibility = '';
    this.nav.set(items);
    const press = document.createElement('div'); press.className = 't74-press';
    press.innerHTML = `${glyph('confirm', st)} SELECT`;
    this.root.appendChild(press);
  }

  update(dt: number) { if (this.open && this.ready) this.nav.update(dt); }

  close() {
    this.open = false;
    this.root.classList.add('fade-out');
    setTimeout(() => (this.root.style.display = 'none'), 650);
  }
  reopen() { this.open = true; this.root.style.display = ''; this.root.classList.remove('fade-out'); }
}
