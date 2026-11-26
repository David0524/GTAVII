/**
 * Gameplay HUD: clock/date/weather readout, location reveal, subtitles (scene + ambient channels, for
 * narrative N3), help-text card, context button prompts. Minimal by default, all elements toggleable.
 */
import { worldClock } from '../world/Clock';
import { settings } from '../settings/Settings';

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const WX: Record<string, string> = { clear: 'CLEAR · 81°F · HUMID', overcast: 'OVERCAST · 76°F', rain: 'RAIN · 72°F' };

export class Hud {
  readonly el = document.createElement('div');
  private clock = document.createElement('div');
  private reveal = document.createElement('div');
  private sub = document.createElement('div');
  private help = document.createElement('div');
  readonly prompts = document.createElement('div');
  private revealTimer = 0;
  private subTimer = 0;
  private helpTimer = 0;
  private lastDistrict = '';
  private lastClock = '';

  constructor() {
    this.el.className = 't74-hud';
    this.clock.className = 't74-clock';
    this.reveal.className = 't74-reveal';
    this.reveal.innerHTML = '<div class="name"></div><div class="rule"></div><div class="street"></div>';
    this.sub.className = 't74-sub'; this.sub.style.opacity = '0';
    this.help.className = 't74-help';
    this.prompts.className = 't74-prompts';
    this.el.append(this.clock, this.reveal, this.sub, this.help, this.prompts);
    document.body.appendChild(this.el);
    this.applySettings();
    settings.subscribe(() => this.applySettings());
  }

  private applySettings() {
    this.el.style.display = settings.get('hud') ? '' : 'none';
    this.el.style.setProperty('--sub-scale', String(settings.get('subtitleScale')));
  }

  /** Called each frame with the player's district/intersection (from Locator). */
  update(dt: number, district: string, street: string) {
    const c = worldClock;
    const key = `${c.date}|${c.minutes}|${c.weather}`;
    if (key !== this.lastClock) {
      this.lastClock = key;
      const d = new Date(`${c.date}T12:00:00Z`);
      const h = Math.floor(c.minutes / 60), m = c.minutes % 60, h12 = ((h + 11) % 12) + 1;
      this.clock.innerHTML = `<div class="time">${h12}:${String(m).padStart(2, '0')} <span style="font-size:.55em">${h < 12 ? 'AM' : 'PM'}</span></div>` +
        `<div class="date">${DAYS[d.getUTCDay()]} · ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}</div><div class="wx">${WX[c.weather] ?? ''}</div>`;
    }
    if (district && district !== this.lastDistrict) { this.lastDistrict = district; this.showLocation(district, street); }
    if (this.revealTimer > 0 && (this.revealTimer -= dt) <= 0) this.reveal.classList.remove('show');
    if (this.subTimer > 0 && (this.subTimer -= dt) <= 0) this.sub.style.opacity = '0';
    if (this.helpTimer > 0 && (this.helpTimer -= dt) <= 0) this.help.classList.remove('show');
  }

  showLocation(name: string, street: string, seconds = 5) {
    (this.reveal.querySelector('.name') as HTMLElement).textContent = name;
    (this.reveal.querySelector('.street') as HTMLElement).textContent = street;
    this.reveal.classList.add('show'); this.revealTimer = seconds;
  }

  /** Subtitle line. channel 'ambient' = overheard (non-blocking, dimmer, italic). */
  subtitle(speaker: string, text: string, seconds = Math.max(2.2, text.length / 14), channel: 'scene' | 'ambient' = 'scene') {
    if (!settings.get('subtitles')) return;
    this.sub.className = `t74-sub${channel === 'ambient' ? ' ambient' : ''}`;
    this.sub.innerHTML = `${speaker ? `<span class="who">${escapeHtml(speaker)}</span>` : ''}${escapeHtml(text)}`;
    this.sub.style.opacity = '1'; this.subTimer = seconds;
  }

  helpText(html: string, seconds = 6) { this.help.innerHTML = html; this.help.classList.add('show'); this.helpTimer = seconds; }
  setVisible(v: boolean) { this.el.style.visibility = v ? '' : 'hidden'; }
}

export function escapeHtml(s: string) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!); }
