/**
 * Gameplay HUD for the test scene, in the engine's UI language (docs/STYLE_GUIDE.md §9: film-poster /
 * newspaper / transit-signage feel; marquee-cream text, taxi-yellow accent, truck-red alerts, soot panels).
 * Minimal and diegetic: no wanted meter. What the player gets about the police is what a 1974 street
 * gives you: an overheard radio line, a witness you can see running for a call box, a cop's look.
 * Every audio cue has a text equivalent (narrative "never require audio" rule).
 */
const CSS = `
.gp-hud { position: fixed; inset: 0; pointer-events: none; z-index: 8; font: 13px Archivo, ui-sans-serif, sans-serif; color: #efe3c4; }
.gp-stub { position: absolute; left: calc(14px + env(safe-area-inset-left)); bottom: calc(14px + env(safe-area-inset-bottom)); width: 230px; background: #1a0f12d9; border-left: 3px solid #e3a92a; padding: 8px 10px 9px; }
.gp-stub .row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.gp-stub .name { font: 22px 'League Gothic', Impact, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
.gp-stub .money { font: 600 15px 'Courier Prime', ui-monospace, monospace; color: #e3a92a; }
.gp-bar { height: 6px; background: #ffffff18; margin-top: 6px; position: relative; }
.gp-bar > i { position: absolute; left: 0; top: 0; bottom: 0; background: #efe3c4; transition: width .15s; }
.gp-bar.armor > i { background: #7f8fa8; }
.gp-bar.low > i { background: #b2302a; }
.gp-tags { margin-top: 5px; min-height: 15px; font: 11px 'Courier Prime', monospace; color: #d8b8a0; letter-spacing: .03em; }
.gp-tags b { color: #ff6a50; font-weight: 600; }
.gp-weap { margin-top: 6px; font: 600 12px Archivo, sans-serif; letter-spacing: .05em; text-transform: uppercase; }
.gp-weap .ammo { font: 700 16px 'Courier Prime', monospace; color: #efe3c4; }
.gp-reload { height: 3px; background: #e3a92a; width: 0; margin-top: 3px; }
.gp-reticle { position: absolute; left: 50%; top: 50%; border: 1.5px solid #efe3c4cc; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 2px #000; transition: width .06s, height .06s; }
.gp-dot { position: absolute; left: 50%; top: 50%; width: 3px; height: 3px; margin: -1.5px 0 0 -1.5px; background: #efe3c4; border-radius: 50%; }
.gp-lock { position: absolute; width: 46px; height: 64px; margin: -32px 0 0 -23px; border: 2px solid #e3a92a; border-radius: 3px; display: none; }
.gp-lock span { position: absolute; top: -18px; left: 50%; transform: translateX(-50%); font: 700 10px Archivo; letter-spacing: .12em; color: #e3a92a; white-space: nowrap; }
.gp-hitmark { position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; margin: -11px; opacity: 0; transition: opacity .12s; }
.gp-hitmark::before, .gp-hitmark::after { content: ''; position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: #efe3c4; transform: rotate(45deg); }
.gp-hitmark::after { transform: rotate(-45deg); }
.gp-hitmark.kill::before, .gp-hitmark.kill::after { background: #ff4a3a; }
.gp-sub { position: absolute; left: 50%; bottom: calc(92px + env(safe-area-inset-bottom)); transform: translateX(-50%); max-width: min(760px, 70vw); text-align: center; }
.gp-sub div { display: inline-block; margin: 3px 0; padding: 4px 10px; background: #0d0b09cc; font: 14px 'Courier Prime', ui-monospace, monospace; line-height: 1.35; }
.gp-sub .radio { color: #bfe6d8; } .gp-sub .radio::before { content: 'RADIO  '; color: #7fa89a; font-weight: 700; }
.gp-sub .bark { color: #efe3c4; } .gp-sub .notice { color: #e3a92a; }
.gp-wit { position: absolute; display: none; transform: translate(-50%, -50%); font: 700 11px Archivo; letter-spacing: .08em; color: #ff6a50; text-shadow: 0 1px 2px #000; text-align: center; white-space: nowrap; }
.gp-wit i { display: block; width: 0; height: 0; margin: 0 auto 3px; border-left: 8px solid transparent; border-right: 8px solid transparent; border-bottom: 14px solid #ff6a50; }
.gp-panel { position: absolute; right: calc(16px + env(safe-area-inset-right)); top: 64px; width: 300px; background: #1a0f12ee; border-top: 3px solid #e3a92a; padding: 10px 12px; pointer-events: auto; display: none; }
.gp-panel h3 { margin: 0 0 6px; font: 24px 'League Gothic', Impact, sans-serif; letter-spacing: .05em; text-transform: uppercase; }
.gp-panel .line { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid #ffffff12; gap: 6px; }
.gp-panel .price { font: 600 13px 'Courier Prime', monospace; color: #e3a92a; }
.gp-btn { pointer-events: auto; font: 700 12px Archivo; letter-spacing: .06em; text-transform: uppercase; color: #efe3c4; background: #0d0b09; border: 1.5px solid #efe3c488; padding: 7px 11px; min-height: 40px; min-width: 44px; cursor: pointer; }
.gp-btn.y { border-color: #e3a92a; color: #e3a92a; } .gp-btn.r { border-color: #b2302a; color: #ff6a50; }
.gp-enc { position: absolute; left: 50%; top: 18%; transform: translateX(-50%); background: #1a0f12ee; border-top: 3px solid #b2302a; padding: 10px 14px; pointer-events: auto; display: none; text-align: center; }
.gp-enc .who { font: 20px 'League Gothic', Impact, sans-serif; letter-spacing: .08em; }
.gp-enc .say { font: 15px 'Courier Prime', monospace; margin: 4px 0 8px; }
.gp-enc .btns { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.gp-card { position: absolute; inset: 0; display: none; place-items: center; background: #0c0b0ae6; text-align: center; }
.gp-card .t { font: 64px 'League Gothic', Impact, sans-serif; letter-spacing: .08em; color: #efe3c4; }
.gp-card .s { font: 16px 'Courier Prime', monospace; color: #d8c8a8; margin-top: 8px; white-space: pre-line; }
.gp-nav { position: absolute; top: calc(10px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); display: flex; gap: 4px; pointer-events: auto; }
.gp-nav .gp-btn { min-height: 32px; padding: 5px 9px; font-size: 11px; }
.gp-nav .gp-btn.on { background: #e3a92a; color: #0d0b09; }
.gp-prompt { position: absolute; left: 50%; top: 62%; transform: translateX(-50%); font: 600 13px Archivo; letter-spacing: .05em; background: #0d0b09cc; padding: 5px 10px; display: none; }
.gp-vig { position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 0 0 #6a0a0a; transition: box-shadow .25s; }
.gp-touch { position: absolute; right: calc(10px + env(safe-area-inset-right)); bottom: calc(10px + env(safe-area-inset-bottom)); display: grid; grid-template-columns: repeat(4, 60px); gap: 8px; pointer-events: auto; z-index: 9; }
.gp-touch button { width: 60px; height: 60px; border-radius: 50%; border: 2px solid #efe3c466; background: #0d0b0999; color: #efe3c4; font: 700 10px Archivo; letter-spacing: .05em; touch-action: none; }
.gp-touch button.big { border-color: #e3a92a; color: #e3a92a; }
.gp-touch button.on { background: #e3a92a55; }
.gp-limbs { position: absolute; right: calc(290px + env(safe-area-inset-right)); bottom: calc(80px + env(safe-area-inset-bottom)); display: none; flex-direction: column; gap: 6px; pointer-events: auto; z-index: 9; }
.gp-limbs button { width: 64px; height: 44px; border-radius: 8px; border: 2px solid #e3a92a88; background: #0d0b09aa; color: #e3a92a; font: 700 11px Archivo; }
.gp-limbs button.on { background: #e3a92a; color: #0d0b09; }
`;

export class Hud {
  readonly root = document.createElement('div');
  private stub = el('div', 'gp-stub');
  private name = el('div', 'name'); private money = el('div', 'money');
  private hp = el('div', 'gp-bar'); private armor = el('div', 'gp-bar armor'); private tags = el('div', 'gp-tags');
  private weap = el('div', 'gp-weap'); private reloadBar = el('div', 'gp-reload');
  private reticle = el('div', 'gp-reticle'); private dot = el('div', 'gp-dot'); private lockEl = el('div', 'gp-lock'); private hitmark = el('div', 'gp-hitmark');
  private sub = el('div', 'gp-sub'); private wit = el('div', 'gp-wit');
  readonly panel = el('div', 'gp-panel'); readonly enc = el('div', 'gp-enc'); private card = el('div', 'gp-card');
  readonly nav = el('div', 'gp-nav'); private prompt = el('div', 'gp-prompt'); private vig = el('div', 'gp-vig');
  readonly touch = el('div', 'gp-touch'); readonly limbs = el('div', 'gp-limbs');
  private subs: { el: HTMLElement; t: number }[] = [];
  constructor() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.root.className = 'gp-hud';
    this.hp.appendChild(document.createElement('i')); this.armor.appendChild(document.createElement('i'));
    const top = el('div', 'row'); top.append(this.name, this.money);
    this.stub.append(top, this.hp, this.armor, this.tags, this.weap, this.reloadBar);
    this.lockEl.appendChild(document.createElement('span'));
    this.card.innerHTML = '<div><div class="t"></div><div class="s"></div></div>';
    this.root.append(this.vig, this.reticle, this.dot, this.hitmark, this.lockEl, this.wit, this.stub, this.sub, this.prompt, this.panel, this.enc, this.nav, this.card, this.touch, this.limbs);
    document.body.appendChild(this.root);
  }
  set(h: NonNullable<ReturnType<import('../index').Gameplay['hud']>>, leadName: string) {
    this.name.textContent = leadName;
    this.money.textContent = `$${(h.money / 100).toFixed(2)}`;
    const f = h.hp / h.maxHp;
    (this.hp.firstChild as HTMLElement).style.width = `${(f * 100).toFixed(1)}%`;
    this.hp.classList.toggle('low', f < 0.3);
    (this.armor.firstChild as HTMLElement).style.width = `${Math.min(100, (h.armor / 60) * 100).toFixed(0)}%`;
    this.armor.style.display = h.armor > 0 ? '' : 'none';
    const inj = h.injuries.filter((x) => x !== 'critical').map((x) => (x === 'bleeding' ? '<b>BLEEDING</b>' : x.replace('_l', ' (L)').replace('_r', ' (R)').toUpperCase()));
    this.tags.innerHTML = inj.join(' · ') || `<span style="opacity:.6">${h.outfit}</span>`;
    const ammo = h.loaded === null ? '' : ` <span class="ammo">${h.loaded}</span><span style="opacity:.6"> / ${h.reserve}</span>`;
    this.weap.innerHTML = `${h.weapon}${ammo}${h.cover ? ` <span style="color:#e3a92a">· ${h.cover.blind ? 'BLIND FIRE' : h.cover.peek ? 'PEEK' : 'COVER'}</span>` : ''}`;
    this.reloadBar.style.width = h.reloading === null ? '0' : `${(h.reloading * 100).toFixed(0)}%`;
    const sz = h.loaded === null ? 0 : Math.max(10, h.spread * 9 + h.recoil * 3);
    this.reticle.style.display = sz ? '' : 'none'; this.reticle.style.width = this.reticle.style.height = `${sz}px`;
    // damage vignette: bleeding and low health
    const pain = Math.max(0, 0.35 - f) * 2 + (h.bleeding > 0 ? 0.25 : 0);
    this.vig.style.boxShadow = pain > 0.01 ? `inset 0 0 ${Math.round(80 + pain * 200)}px ${Math.round(pain * 60)}px #6a0a0acc` : 'none';
  }
  lock(screen: { x: number; y: number } | null, limb: string) {
    if (!screen) { this.lockEl.style.display = 'none'; return; }
    Object.assign(this.lockEl.style, { display: 'block', left: `${screen.x}px`, top: `${screen.y}px` });
    (this.lockEl.firstChild as HTMLElement).textContent = `LOCKED · ${limb.toUpperCase()}`;
  }
  hit(kill: boolean) { this.hitmark.classList.toggle('kill', kill); this.hitmark.style.opacity = '1'; setTimeout(() => (this.hitmark.style.opacity = '0'), 110); }
  say(kind: 'radio' | 'bark' | 'notice', text: string, secs = 4) {
    const d = el('div', kind); d.textContent = text;
    const wrap = el('div', ''); wrap.appendChild(d); this.sub.appendChild(wrap);
    this.subs.push({ el: wrap, t: secs });
    while (this.subs.length > 4) this.subs.shift()!.el.remove();
  }
  witness(screen: { x: number; y: number; ang?: number } | null, text: string) {
    if (!screen) { this.wit.style.display = 'none'; return; }
    this.wit.style.display = 'block'; this.wit.style.left = `${screen.x}px`; this.wit.style.top = `${screen.y}px`;
    this.wit.innerHTML = `<i style="transform:rotate(${screen.ang ?? 0}rad)"></i>${text}`;
  }
  showPrompt(text: string | null) { this.prompt.style.display = text ? 'block' : 'none'; if (text) this.prompt.textContent = text; }
  titleCard(title: string, sub: string, secs = 2.6) {
    this.card.style.display = 'grid';
    (this.card.querySelector('.t') as HTMLElement).textContent = title;
    (this.card.querySelector('.s') as HTMLElement).textContent = sub;
    return new Promise<void>((res) => setTimeout(() => { this.card.style.display = 'none'; res(); }, secs * 1000));
  }
  update(dt: number) { for (const s of [...this.subs]) { s.t -= dt; if (s.t <= 0) { s.el.remove(); this.subs.splice(this.subs.indexOf(s), 1); } } }
}
export function el(tag: string, cls: string) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
export function btn(label: string, cls: string, on: () => void) { const b = el('button', `gp-btn ${cls}`) as HTMLButtonElement; b.textContent = label; b.addEventListener('click', (e) => { e.stopPropagation(); on(); }); b.addEventListener('pointerdown', (e) => e.stopPropagation()); return b; }
