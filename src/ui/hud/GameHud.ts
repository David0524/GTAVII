/**
 * The gameplay HUD. Minimal, period and contextual; each element is On / Dynamic / Off (settings).
 *  - Objective line (≤ 40 chars, narrative mobile rule) with distance in blocks.
 *  - Cash on hand (dynamic: appears on change), the equipped weapon with rounds and its
 *    concealment state (always shown when the gun is printing or visible: that's what witnesses see).
 *  - Health is diegetic: a red edge vignette and bandage tags, no bar. Summer heat exhaustion warms
 *    the frame edge. Stamina is a thin strip under the minimap, only while it's below full.
 *  - Police heat: dispatch-radio lines printed and voiced, plus minimap cones. No stars, no meter.
 *  - Clock (wristwatch-small, dynamic), location reveals, pencilled turn call-outs, discovery notes,
 *    subtitles (scene + ambient channels, N3), help text.
 * Budget: HUD + minimap ≤ 0.5 ms/frame on mobile Low. DOM writes happen only when a value changes.
 */
import type { UiHost, HeatView, ObjectiveView } from '../host/types';
import type { MapModel } from '../map/MapModel';
import { MiniMap } from '../map/MiniMap';
import { CATEGORIES, type RevealVia } from '../map/places';
import { icon, type IconName } from '../icons';
import { MissionCard } from './MissionCard';
import { uiSettings, type Mode3, type UiSettingsData } from '../settings/uiSettings';
import { radioLine } from './radio';
import { callout, voicedCallout, routeVoice, type CallLine } from '../map/Route';
const CALLS = Object.values(import.meta.glob<{ lines: CallLine[]; voiceByPassenger?: Record<string, string> }>('/content/barks/route_calls.json', { eager: true, import: 'default' }))[0];
const CALL_POOL = CALLS?.lines ?? [];
const VOICES = CALLS?.voiceByPassenger ?? {};
import { esc, money, blocks, distance } from '../util';
import { promptStrip, glyph } from '../Prompts';
import { TRAVERSAL_VERB } from '../../shared/uiHost';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const VIA_SHORT: Partial<Record<RevealVia, string>> = { sight: '', enter: 'been inside', tip: 'a tip', overheard: 'overheard', news: 'the paper', call: 'a call', card: 'a card', mission: '' };

export class GameHud {
  readonly el = document.createElement('div');
  readonly minimap: MiniMap;
  private cache = new Map<string, HTMLElement>();
  /** Cached element lookup (no querySelector in the frame loop). */
  private q = <T extends HTMLElement = HTMLElement>(s: string) => { let e = this.cache.get(s); if (!e) { e = this.el.querySelector(s) as HTMLElement; this.cache.set(s, e); } return e as T; };
  private styleCache = new Map<string, string>();
  private css(sel: string, prop: 'opacity' | 'width', v: string) { const k = `${sel}|${prop}`; if (this.styleCache.get(k) !== v) { this.styleCache.set(k, v); this.q(sel).style[prop] = v; } }
  private shown = new Map<string, number>(); // element -> seconds left for dynamic visibility
  private last: Record<string, string> = {};
  private notes: HTMLElement;
  private sub: HTMLElement;
  private subT = 0;
  private radioT = 0;
  private heatPhase: HeatView['phase'] = 'none';
  private idleT = 0;
  private lastPos = { x: NaN, z: NaN };
  private t = 0;
  private lastCash = NaN;
  private pollT = 0; private dirtyPoll = true;
  private inv: ReturnType<UiHost['inventory']> | null = null;
  private hp: ReturnType<UiHost['health']> | null = null;
  private locT = 0;
  private loc = { district: '', crossing: '' };
  visible = true;
  readonly cost = { frame: 0 };

  private mcard = new MissionCard();
  private discoverHints = new Map<string, { notify?: 'silent' | 'toast'; mission?: string }>();
  private addQ: { name: string; cat: string; why?: string; how: string; mission?: string }[] = [];
  private addT = 0;
  /** One "Added to map" note at a time; a burst becomes one merged note; nothing off-mission while a mission runs. */
  private flushAdded(dt: number) {
    this.addT -= dt;
    if (this.addT > 0 || !this.addQ.length) return;
    const m = this.host.objective()?.mission;
    const ready = m ? this.addQ.filter((q) => q.mission === m) : this.addQ.slice();
    if (!ready.length) return;
    this.addQ = this.addQ.filter((q) => !ready.includes(q));
    if (ready.length === 1) { const q = ready[0]; this.note('ADDED TO MAP', `${icon(q.cat as IconName, 18)}<span class="nm">${esc(q.name)}</span><span class="how">${esc(q.how || (CATEGORIES as Record<string, { label: string }>)[q.cat]?.label || '')}</span>`, 4.5); }
    else this.note('ADDED TO MAP', `${icon('pin', 18)}<span class="nm">${ready.length} places</span><span class="how">${esc(ready.slice(0, 3).map((q) => q.name).join(' · '))}${ready.length > 3 ? ' …' : ''}</span>`, 5);
    this.addT = 5.5;
  }

  constructor(private host: UiHost, private model: MapModel) {
    this.el.className = 'u-hud';
    this.el.innerHTML = `
      <div class="u-hurt"></div><div class="u-heat"></div>
      <div class="u-objective fade"><div class="lbl">OBJECTIVE</div><div class="txt"></div><div class="dist"></div></div>
      <div class="t74-clock fade u-clockel"><div class="time"></div><div class="date"></div></div>
      <div class="u-cash fade"><div class="amt"></div><div class="delta"></div></div>
      <div class="u-weapon fade"><div><div class="nm"></div><div class="rounds"></div><div class="spare"></div></div><div class="u-conceal"></div></div>
      <div class="u-injuries fade"></div>
      <div class="u-radio off"><svg class="ico" viewBox="0 0 24 24"><rect x="5" y="7" width="14" height="14" rx="2" fill="none" stroke="#ff8a7a" stroke-width="1.6"/><path d="M8 7L16 2" stroke="#ff8a7a" stroke-width="1.6"/><circle cx="12" cy="15" r="3" fill="none" stroke="#ff8a7a" stroke-width="1.4"/></svg><div><div class="src">PRECINCT RADIO</div><div class="line"></div></div></div>
      <div class="t74-reveal u-loc"><div class="name"></div><div class="rule"></div><div class="street"></div></div>
      <div class="u-stamina fade off"><i></i></div>
      <div class="u-turn fade off"></div>
      <div class="u-notes"></div>
      <div class="u-trav"></div>
      <div class="t74-sub u-sub" style="opacity:0"></div>
      <div class="t74-prompts u-prompts"></div>`;
    this.minimap = new MiniMap(model, host.streets);
    this.el.appendChild(this.minimap.el);
    this.notes = this.q('.u-notes'); this.sub = this.q('.u-sub');
    document.body.appendChild(this.el);

    host.on('money', (e) => { this.dirtyPoll = true; if (e.lead === host.player().lead) this.cashDelta(e.delta); });
    host.on('lead', () => { this.dirtyPoll = true; });
    host.on('subtitle', (e) => this.subtitle(e.speaker, e.text, e.channel, e.seconds));
    host.on('notify', (e) => this.note(e.kind === 'help' ? 'NOTE' : '', esc(e.text)));
    host.on('inventory', () => { this.dirtyPoll = true; this.ping('weapon', 6); });
    host.on('damage', () => { this.dirtyPoll = true; this.ping('injuries', 8); });
    host.on('heat', (e) => { if (e.radio) this.radio(e.radio); });
    host.on('missionEnd', (e) => this.mcard.show(e));
    host.on('achievement', (e) => { const a = host.achievements().find((x) => x.id === e.id); if (a) this.note('ACHIEVEMENT', `<i>${esc(a.name)}</i> · ${esc(a.text)}`, 6); });
    host.on('discover', (e) => { this.discoverHints.set(e.placeId, { notify: e.notify, mission: e.mission }); model.discovery.reveal(e.placeId, e.via); });
    // Discoveries are SILENT by default (user, 2026-11-27: "I shouldn't be notified unless it's like a story/character that's
    // worth coming back to"). Routine places just appear on the map; only content tagged notify:'toast' queues one
    // "Added to map" note, merged when several land together, held during missions (unless it's that mission's) and cutscenes.
    model.discovery.on((e) => {
      const h = this.discoverHints.get(e.place.id); this.discoverHints.delete(e.place.id);
      this.ping('minimap', 4);
      const wants = h?.notify ? h.notify === 'toast' : e.place.notify === 'toast' && e.via !== 'mission';
      if (!wants || uiSettings.get('hudDiscovery') === 'off') return;
      this.addQ.push({ name: e.place.name, cat: e.place.cat, why: e.place.notifyWhy, how: VIA_SHORT[e.via] ?? '', mission: h?.mission });
    });
    uiSettings.subscribe((_s, k) => this.applySetting(k));
    for (const k of ['minimapSize', 'subtitleBackground', 'textScale'] as const) this.applySetting(k);
  }

  private applySetting(k: keyof UiSettingsData) {
    if (k === 'minimapSize') { const w = { small: 'clamp(120px, 15vw, 180px)', medium: '', large: 'clamp(190px, 25vw, 300px)' }[uiSettings.get('minimapSize')]; this.minimap.el.style.width = w; }
    if (k === 'subtitleBackground') this.sub.dataset.bg = uiSettings.get('subtitleBackground');
  }

  /** Keep a dynamic element visible for `s` seconds. */
  ping(name: string, s = 5) { this.shown.set(name, Math.max(this.shown.get(name) ?? 0, s)); }
  private mode(k: keyof UiSettingsData): Mode3 { return uiSettings.get(k) as Mode3; }
  private vis(name: string, k: keyof UiSettingsData, always = false): boolean {
    const m = this.mode(k);
    return m === 'on' || (m === 'dynamic' && (always || (this.shown.get(name) ?? 0) > 0));
  }
  private set(sel: string, html: string) { if (this.last[sel] !== html) { this.last[sel] = html; this.q(sel).innerHTML = html; } }
  private show(sel: string, on: boolean) { const e = this.q(sel); if (e.classList.contains('off') === on) e.classList.toggle('off', !on); }

  setVisible(v: boolean) { this.visible = v; this.el.style.visibility = v ? '' : 'hidden'; }

  /** One small prompt at the edge you'd climb or vault (pad/keyboard; touch shows it on the jump button). */
  private trav(dt: number) {
    const el = this.el.querySelector('.u-trav') as HTMLElement, h = this.host;
    const tr = h.input.activeDevice === 'touch' ? null : h.traversal?.() ?? null;
    if (!tr) { el.classList.remove('on'); return; }
    const p = h.project?.(tr.x, tr.y, tr.z) ?? null;
    const W = innerWidth, H = innerHeight;
    const x = p ? Math.max(70, Math.min(W - 70, p.x)) : W / 2, y = p ? Math.max(60, Math.min(H - 90, p.y - 34)) : H * 0.62;
    const verb = TRAVERSAL_VERB[tr.kind];
    if (el.dataset.k !== tr.kind + h.input.promptStyle) { el.dataset.k = tr.kind + h.input.promptStyle; el.innerHTML = `${glyph('jump', h.input.promptStyle)}<b>${verb}</b>`; }
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`; el.classList.add('on');
    void dt;
  }

  update(dt: number) {
    if (!this.visible) return;
    const t0 = performance.now();
    this.trav(dt);
    this.mcard.update(dt);
    this.flushAdded(dt);
    this.t += dt;
    for (const [k, v] of this.shown) this.shown.set(k, v - dt);
    const h = this.host, p = h.player(), heat = h.heat(), obj = h.objective();
    const moved = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z) > 0.05;
    this.lastPos = { x: p.x, z: p.z };
    this.idleT = moved ? 0 : this.idleT + dt;
    if (moved && p.speed > 0.5) this.ping('minimap', 6);

    // heat: radio line on phase change, minimap stays up while there's any heat
    if (heat.phase !== this.heatPhase) { this.heatPhase = heat.phase; const l = radioLine(heat); if (l) this.radio(l); }
    if (heat.phase !== 'none') this.ping('minimap', 3);
    if (this.radioT > 0 && (this.radioT -= dt) <= 0) this.show('.u-radio', false);

    // DOM elements (clock, cash, weapon, health, location, route call-outs) update at 30 Hz; the
    // minimap below stays at full rate so the map never judders against the camera.
    this.slowDt += dt;
    if ((++this.frameN & 1) === 0) { this.slowUpdate(this.slowDt, h, p, heat, obj, moved); this.slowDt = 0; }

    // minimap
    const mmOn = this.vis('minimap', 'hudMinimap', !!this.model.waypoint);
    if (this.minimap.el.classList.contains('dim') === mmOn) this.minimap.el.classList.toggle('dim', !mmOn);
    if (mmOn) this.minimap.draw({ x: p.x, z: p.z, yaw: uiSettings.get('minimapOrientation') === 'north' ? 0 : p.yaw, heading: p.heading ?? p.yaw, speed: p.speed, inVehicle: p.inVehicle, heat, objective: obj, t: this.t }, dt);
    this.model.discovery.tick(p.x, p.z);
    this.model.update(dt, p.x, p.z, p.inVehicle);

    if (this.subT > 0 && (this.subT -= dt) <= 0) this.sub.style.opacity = '0';
    // context button prompts (never on touch: the buttons are on screen)
    const pm = this.mode('hudPrompts'), items = h.prompts?.() ?? [];
    const pk = `${h.input.promptStyle}|${items.map((i) => i.join(':')).join(',')}`;
    if (pk !== this.last.prompts) { this.last.prompts = pk; this.q('.u-prompts').innerHTML = h.input.promptStyle === 'touch' ? '' : promptStrip(h.input, items); }
    this.css('.u-prompts', 'opacity', pm === 'on' || (pm === 'dynamic' && this.idleT > 3) ? '1' : '0');
    const ms = performance.now() - t0;
    this.cost.frame = this.cost.frame ? this.cost.frame * 0.95 + ms * 0.05 : ms;
  }

  private frameN = 0; private slowDt = 0;
  private slowUpdate(dt: number, h: UiHost, p: ReturnType<UiHost['player']>, heat: HeatView, obj: ObjectiveView | null, moved: boolean) {
    void moved; void heat;
    // objective
    this.objective(obj, p.x, p.z);
    // clock (dynamic: when standing still, when the hour turns, or when the objective is time-gated)
    const c = h.clock(), hr = Math.floor(c.minutes / 60), mn = c.minutes % 60;
    const timeStr = uiSettings.get('clock24') ? `${String(hr).padStart(2, '0')}:${String(mn).padStart(2, '0')}` : `${((hr + 11) % 12) + 1}:${String(mn).padStart(2, '0')} <span style="font-size:.55em">${hr < 12 ? 'AM' : 'PM'}</span>`;
    if (this.last.hour !== String(hr)) { this.last.hour = String(hr); this.ping('clock', 6); }
    const d = new Date(`${c.date}T12:00:00Z`);
    this.set('.u-clockel .time', timeStr);
    this.set('.u-clockel .date', `${DAYS[d.getUTCDay()]} · ${MON[d.getUTCMonth()]} ${d.getUTCDate()}${c.tempF ? ` · ${c.tempF}°` : ''}`);
    this.show('.u-clockel', this.vis('clock', 'hudClock', this.idleT > 4 || /\d{1,2}(:\d\d)? ?(a\.?m|p\.?m)/i.test(obj?.text ?? '')));

    // cash
    if ((this.pollT -= dt) <= 0 || this.dirtyPoll) { this.pollT = 0.25; this.dirtyPoll = false; this.inv = h.inventory(); this.hp = h.health(); }
    const inv = this.inv!;
    if (inv.cash !== this.lastCash) { this.lastCash = inv.cash; this.set('.u-cash .amt', `${money(inv.cash).replace(/\.(\d\d)$/, '<i>$1</i>')}`); }
    this.show('.u-cash', this.vis('cash', 'hudCash', this.idleT > 4));

    // weapon + concealment
    const w = inv.items.find((i) => i.equipped && i.kind === 'weapon');
    if (w) {
      const loaded = w.ammo?.loaded ?? 0, cap = Math.max(loaded, /derringer/i.test(w.name) ? 2 : /double|sawn/i.test(w.name) ? 2 : /auto/i.test(w.name) ? 7 : /snub/i.test(w.name) ? 5 : 6);
      this.set('.u-weapon .nm', esc(w.name.replace(/\s*".*?"/, '')));
      this.set('.u-weapon .rounds', Array.from({ length: cap }, (_, i) => `<b class="${i < loaded ? '' : 'spent'}"></b>`).join(''));
      this.set('.u-weapon .spare', w.ammo ? `${w.ammo.spare} spare` : '');
      const cs = this.q('.u-conceal'); const lbl = { hidden: 'Hidden', printing: 'Printing', visible: 'In plain sight' }[w.state];
      if (cs.textContent !== lbl) { cs.textContent = lbl; cs.className = `u-conceal ${w.state}`; }
    }
    this.show('.u-weapon', !!w && (this.vis('weapon', 'hudWeapon', heat.phase !== 'none') || (this.mode('hudWeapon') !== 'off' && w.state !== 'hidden')));

    // health: vignette + injuries; heat exhaustion glow
    const hp = this.hp!;
    const hurt = Math.max(0, 1 - hp.hp / (hp.max * 0.6));
    const breathe = hurt > 0 && !uiSettings.get('reduceFlashing') ? 0.85 + 0.15 * Math.sin(this.t * (2 + hurt * 4)) : 1;
    this.css('.u-hurt', 'opacity', (hurt * breathe).toFixed(2));
    this.css('.u-heat', 'opacity', Math.max(0, hp.heatExhaustion - 0.2).toFixed(2));
    this.set('.u-injuries', hp.injuries.map((i) => `<span class="${i.bandaged ? '' : 'raw'}">${esc(i.region)} · ${i.bandaged ? 'bandaged' : i.kind}</span>`).join(''));
    this.show('.u-injuries', hp.injuries.length > 0 && this.vis('injuries', 'hudInjuries', hp.hp < 60));
    // stamina
    const st = hp.stamina / hp.staminaMax;
    this.css('.u-stamina i', 'width', `${(st * 100).toFixed(0)}%`);
    if (this.q('.u-stamina').classList.contains('low') !== st < 0.25) this.q('.u-stamina').classList.toggle('low', st < 0.25);
    this.show('.u-stamina', this.mode('hudStamina') === 'on' || (this.mode('hudStamina') === 'dynamic' && st < 0.98));

    // location reveal on district change
    if (this.mode('hudLocation') !== 'off') {
      if ((this.locT -= dt) <= 0) { this.locT = 0.5; this.loc = h.location(); }
      const loc = this.loc;
      if (loc.district && loc.district !== this.last.district) {
        this.last.district = loc.district;
        this.q('.u-loc .name').textContent = loc.district; this.q('.u-loc .street').textContent = loc.crossing;
        this.q('.u-loc').classList.add('show'); this.shown.set('loc', 5);
      }
      if ((this.shown.get('loc') ?? 0) <= 0) this.q('.u-loc').classList.remove('show');
    }

    // the route: next turn
    this.turnCallout(p.x, p.z, p.inVehicle);

  }

  private objective(o: ObjectiveView | null, x: number, z: number) {
    const on = !!o && this.mode('hudObjective') !== 'off';
    this.show('.u-objective', on);
    if (!o) return;
    let txt = o.text;
    if (txt.length > 40) { if (import.meta.env.DEV) console.warn(`objective over 40 chars: "${txt}"`); txt = `${txt.slice(0, 39)}…`; }
    this.set('.u-objective .txt', esc(txt));
    this.set('.u-objective .dist', o.target ? `${blocks(Math.hypot(o.target.x - x, o.target.z - z))}${o.target.label ? ` · ${esc(o.target.label)}` : ''}` : '');
  }

  private turnCallout(x: number, z: number, inVehicle: boolean) {
    const m = this.model;
    let html = '';
    if (m.route && m.turns.length && this.mode('hudTurns') !== 'off') {
      // next turn ahead: the first one closer to the waypoint than we are, within 160 m
      const w = m.waypoint!; const dw = Math.hypot(w.x - x, w.z - z);
      const next = m.turns.find((t) => Math.hypot(w.x - t.x, w.z - t.z) < dw - 5);
      if (next) {
        const dd = Math.hypot(next.x - x, next.z - z);
        if (dd < 160) {
          const pv = this.host.player(), voice = inVehicle ? routeVoice(VOICES, pv.companion, pv.quest) : null;
          html = `<small>${voice === 'cabbie' ? 'THE CABBIE' : voice ? 'YOUR PASSENGER' : 'YOUR ROUTE'}</small>${esc(callout(next))} · ${distance(dd, uiSettings.get('units') === 'metric')}`;
          // the companion voices it once per turn (audio stream speaks it; the HUD line above always shows it)
          const key = `${next.x | 0},${next.z | 0}`;
          if (voice && this.last.called !== key) {
            this.last.called = key;
            const line = voicedCallout(next, voice, CALL_POOL, (next.x * 7 + next.z) | 0);
            if (line) this.host.commit?.('audio:route_call', { voice, text: line });
          }
        }
      }
    }
    this.set('.u-turn', html); this.show('.u-turn', !!html);
    if (html && !this.last.mmh) { this.last.mmh = '1'; document.documentElement.style.setProperty('--mm-h', `${this.minimap.el.getBoundingClientRect().height}px`); }
  }

  private cashDelta(d: number) {
    const e = this.q('.u-cash .delta');
    e.textContent = `${d < 0 ? '−' : '+'}${money(Math.abs(d))}`; e.className = `delta show ${d < 0 ? 'neg' : 'pos'}`;
    this.ping('cash', 5);
    setTimeout(() => e.classList.remove('show'), 2600);
  }

  radio(line: string, seconds = 6) {
    if (this.mode('hudRadio') === 'off') return;
    this.set('.u-radio .line', `“${esc(line)}”`); this.show('.u-radio', true); this.radioT = seconds;
  }

  note(label: string, html: string, seconds = 4) {
    const n = document.createElement('div'); n.className = 'u-note';
    n.innerHTML = `${label ? `<b>${label}</b>` : ''}${html}`;
    this.notes.appendChild(n);
    while (this.notes.children.length > 3) this.notes.firstElementChild!.remove();
    requestAnimationFrame(() => n.classList.add('show'));
    setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 450); }, seconds * 1000);
  }

  /** Subtitle (N3 channels). Respects mode (off / scene only / all), names, colours, background, size. */
  subtitle(speaker: string, text: string, channel: 'scene' | 'ambient' = 'scene', seconds = Math.max(2.2, text.length / 14)) {
    const mode = uiSettings.get('subtitleMode');
    if (!uiSettings.get('subtitles') || mode === 'off' || (mode === 'scene' && channel === 'ambient')) return;
    const lead = this.host.party().find((l) => l.short === speaker || l.name === speaker || l.id === speaker);
    const col = uiSettings.get('subtitleSpeakerColours') && lead ? ` style="color:${lead.colour}"` : '';
    const who = uiSettings.get('subtitleSpeakerNames') && speaker ? `<span class="who"${col}>${esc(lead?.short ?? speaker)}</span>` : '';
    this.sub.className = `t74-sub u-sub${channel === 'ambient' ? ' ambient' : ''}`;
    this.sub.innerHTML = `${who}${esc(text)}${channel === 'ambient' ? '' : ''}`;
    this.sub.style.opacity = '1'; this.subT = seconds;
  }
}
void CATEGORIES;
