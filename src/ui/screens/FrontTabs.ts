/**
 * SAVES (profiles and slots on the engine's SaveStore) and CREDITS (every attribution plus the full
 * text of every bundled licence). Ported from the engine's PauseMenu and extended: profile create,
 * rename, delete with confirm; slot save/load/export/import; credits as a film-style end roll with
 * a licence reader.
 */
import type { SaveManager } from '../../save/SaveManager';
import { downloadText } from '../../save/SaveManager';
import { MANUAL_SLOTS, AUTO_SLOTS } from '../../save/SaveStore';
import type { NavItem } from '../MenuNav';
import type { Tab } from './PauseHub';
import { CREDITS } from '../data/credits';
import { esc } from '../util';

export class SavesTab implements Tab {
  id = 'saves'; label = 'SAVES';
  el = document.createElement('div');
  private setNav: (i: NavItem[], keep?: boolean) => void = () => {};
  private confirmDelete = '';
  onToast?: (t: string) => void;
  onLoaded?: () => void;
  /** Title screen mode: no saving (nothing to save yet). */
  canSave = true;
  constructor(private saves: SaveManager | null) { this.el.className = 'u-scroll u-saves sv-a'; }
  open(setNav: (items: NavItem[], keep?: boolean) => void) { this.setNav = setNav; void this.render(); }

  private async render(keep = false) {
    const s = this.saves, items: NavItem[] = [];
    if (!s) { this.el.innerHTML = '<p class="hint">Saves are unavailable in the lab.</p>'; this.setNav([]); return; }
    const metas = new Map((await s.store.listSlots(s.profile.id)).map((m) => [m.slot, m]));
    const profiles = await s.store.listProfiles();
    const day = (iso: string) => new Date(iso).toLocaleDateString();
    const hm = (sec: number) => `${Math.floor(sec / 3600)} h ${String(Math.floor(sec / 60) % 60).padStart(2, '0')} min`;
    // DESIGN_A: who is playing is the hero (left); the slots are a dense ruled list (right)
    const me = profiles.find((p) => p.id === s.profile.id) ?? s.profile;
    const played = Math.max(0, ...[...metas.values()].map((m) => m.playtimeSec));
    const side = document.createElement('aside'); side.className = 'sv-who';
    side.innerHTML = `<span class="a-label">Playing as</span><b class="a-voice">${esc(me.name)}</b>
      <div class="sv-facts"><span><b class="a-num">${metas.size}</b> saves</span><span><b class="a-num">${hm(played)}</b> played</span></div>
      ${s.store.kind === 'memory' ? '<p class="sv-warn">Storage is unavailable here: saves last this session only. Export the ones you want to keep.</p>' : ''}
      <div class="sv-me"></div><h4 class="t74-group">Profiles on this device</h4><div class="sv-profiles"></div>`;
    const btn = (host: Element, label: string, fn: () => void, cls = '') => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; host.appendChild(b); items.push({ el: b, activate: fn }); return b; };
    const rename = (p: typeof me) => async () => { const n = prompt('Profile name', p.name)?.trim(); if (n) { await s.store.renameProfile(p.id, n.slice(0, 24)); if (p.id === s.profile.id) s.profile.name = n.slice(0, 24); void this.render(true); } };
    btn(side.querySelector('.sv-me')!, 'Rename', rename(me), 'u-btn');
    const plist = side.querySelector('.sv-profiles')!;
    for (const p of profiles) {
      if (p.id === s.profile.id) continue;
      const row = document.createElement('div'); row.className = 't74-slot sv-prof';
      row.innerHTML = `<div class="lbl">${esc(p.name)}<small>Last played ${day(p.lastPlayedAt)}</small></div><div class="acts"></div>`;
      const acts = row.querySelector('.acts')!;
      btn(acts, 'Play as', async () => { await s.switchProfile(p.id); this.onToast?.(`Profile · ${p.name}`); void this.render(true); });
      btn(acts, 'Rename', rename(p));
      if (profiles.length > 1) btn(acts, this.confirmDelete === p.id ? 'Sure? Delete' : 'Delete', async () => {
        if (this.confirmDelete !== p.id) { this.confirmDelete = p.id; void this.render(true); return; }
        this.confirmDelete = ''; await s.store.deleteProfile(p.id); this.onToast?.(`Deleted ${p.name}`); void this.render(true);
      }, this.confirmDelete === p.id ? 'danger' : '');
      plist.appendChild(row);
    }
    if (profiles.length < 4) {
      const add = document.createElement('div'); add.className = 't74-row btn sv-add'; add.innerHTML = '<div class="k">New profile<small>Up to four on this device, each with its own saves</small></div><div class="v">+</div>';
      plist.appendChild(add);
      items.push({ el: add, activate: async () => { const p = await s.store.createProfile(`Player ${profiles.length + 1}`); await s.switchProfile(p.id); this.onToast?.(`New profile · ${p.name}`); void this.render(true); } });
    }
    const wrap = document.createElement('section'); wrap.className = 'sv-slots';
    const group = (t: string) => wrap.insertAdjacentHTML('beforeend', `<h4 class="t74-group">${t}</h4>`);
    const slotRow = (slot: string, title: string, canSave: boolean) => {
      const m = metas.get(slot);
      const el = document.createElement('div'); el.className = `t74-slot${m ? '' : ' empty'}`;
      el.innerHTML = `<div class="id">${title}</div><div class="lbl">${m ? esc(m.label) : 'Empty'}${m ? `<small>${new Date(m.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · ${hm(m.playtimeSec)}</small>` : ''}</div><div class="acts"></div>`;
      const acts = el.querySelector('.acts')!;
      if (canSave && this.canSave) btn(acts, 'Save', async () => { await s.save(slot); this.onToast?.('Saved'); void this.render(true); });
      if (m) btn(acts, 'Load', async () => { try { await s.load(slot); this.onToast?.(`Loaded · ${m.label}`); this.onLoaded?.(); } catch (e) { this.onToast?.(String((e as Error).message)); } });
      if (m) btn(acts, 'Export', async () => { const f = await s.exportSlot(slot); if (f) { downloadText(f.name, f.text); this.onToast?.('Exported save file'); } });
      if (canSave) btn(acts, 'Import', () => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = async () => { const f = inp.files?.[0]; if (!f) return; try { await s.importToSlot(await f.text(), slot); this.onToast?.('Imported save'); void this.render(true); } catch (e) { this.onToast?.(String((e as Error).message)); } };
        inp.click();
      });
      wrap.appendChild(el);
    };
    group(`Saves · ${esc(s.profile.name)}`);
    for (let i = 1; i <= MANUAL_SLOTS; i++) slotRow(`manual-${i}`, `Slot ${i}`, true);
    slotRow('quick', 'Quick', true);
    group('Autosaves · every 90 s and when you leave');
    for (let i = 1; i <= AUTO_SLOTS; i++) slotRow(`auto-${i}`, `Auto ${i}`, false);
    this.el.innerHTML = ''; this.el.append(side, wrap);
    this.setNav(items, keep);
  }
}

export class CreditsTab implements Tab {
  id = 'credits'; label = 'CREDITS';
  el = document.createElement('div');
  private licences: { name: string; version: string; licence: string; text: string }[] | null = null;
  private reading = -1;
  private setNav: (i: NavItem[], keep?: boolean) => void = () => {};
  constructor(private baseUrl: string) { this.el.className = 'u-scroll u-credits cr-a'; }
  open(setNav: (items: NavItem[], keep?: boolean) => void) { this.setNav = setNav; void this.render(); }
  back() { if (this.reading >= 0) { this.reading = -1; void this.render(); return true; } return false; }

  private async render() {
    this.licences ??= await fetch(`${this.baseUrl}data/ui/licences.json`).then((r) => r.json()).catch(() => []);
    const items: NavItem[] = [];
    if (this.reading >= 0) {
      const l = this.licences![this.reading];
      this.el.innerHTML = `<div class="cr-lic"><h3>${esc(l.name)} <small>${esc(l.version)} · ${esc(l.licence)}</small></h3><pre>${esc(l.text)}</pre></div>`;
      const b = document.createElement('button'); b.className = 'u-btn'; b.textContent = '‹ Back to credits'; this.el.prepend(b);
      items.push({ el: b, activate: () => { this.reading = -1; void this.render(); } });
      this.setNav(items); return;
    }
    this.el.innerHTML = `<div class="cr-roll"><img class="cr-mark" src="${this.baseUrl}ui/wordmark.svg" alt="Tenderloin ’74">${CREDITS.map((c) => `<section><h3>${esc(c.title)}</h3>${c.lines.map((l) => `<p>${l.role ? `<b>${esc(l.role)}</b>` : ''}${l.href ? `<a href="${l.href}" target="_blank" rel="noopener">${esc(l.text)}</a>` : esc(l.text)}</p>`).join('')}</section>`).join('')}
      <section><h3>Licences</h3><div class="cr-libs"></div></section><div class="cr-end">THE END<small>of the credits. The city keeps going.</small></div></div>`;
    const libs = this.el.querySelector('.cr-libs')!;
    this.licences!.forEach((l, i) => {
      const b = document.createElement('button'); b.className = 'u-btn'; b.innerHTML = `Read · ${esc(l.name)} <small style="opacity:.7">${esc(l.licence)}</small>`; libs.appendChild(b);
      items.push({ el: b, activate: () => { this.reading = i; void this.render(); } });
    });
    this.el.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => items.unshift({ el: a, activate: () => window.open(a.href, '_blank', 'noopener') }));
    this.setNav(items);
    this.el.scrollTop = 0; // the roll starts at the top, whatever the first link is
  }
}
