import { Emitter } from '../core/events';
import type { Registry } from './registry';
import { DEFAULT_GUN, type GunState } from './guns';
import { SKILLS, type Skills } from '../player/skills';
import { makeStamina, type StaminaState } from '../player/stamina';

/**
 * Per-lead inventory and money. Money is integer cents. Ammo items count ROUNDS (buying one box at a
 * shop grants `rounds`). Weapons are one per type. Rounds already in a gun are kept per weapon so
 * swapping guns never loses ammo. Everything round-trips through serialize()/deserialize().
 */
export interface LeadInv {
  money: number;
  items: Map<string, number>;
  loaded: Map<string, number>;   // weapon id -> rounds in the gun
  equipped: string;              // weapon id ('weapon.fists' when empty-handed)
  outfits: Set<string>;          // owned (stored at home)
  wearing: string;
  armor: number;                 // vest points remaining when worn
  plates: number;                // plate-swap generation of the lead's car (description breaking)
  /** protected money (bank / home safe): never lost to death or arrest */
  savings: number;
  /** gun instance state per owned firearm (tier, condition, jam) */
  guns: Map<string, GunState>;
  /** home stash: safe from death and arrest */
  stash: Map<string, number>;
  /** gun instance state for firearms sitting in the stash */
  stashGuns: Map<string, GunState>;
  skills: Skills;
  stamina: StaminaState;
}
export interface InvEvents extends Record<string, unknown> {
  changed: { lead: string; id: string; delta: number; qty: number };
  money: { lead: string; delta: number; money: number; reason: string };
}

export class Inventory extends Emitter<InvEvents> {
  readonly leads = new Map<string, LeadInv>();
  constructor(readonly reg: Registry) { super(); }

  ensure(lead: string): LeadInv {
    let l = this.leads.get(lead);
    if (!l) {
      const p = this.reg.leads.get(lead);
      const sk = Object.fromEntries(SKILLS.map((k) => [k, p?.skills?.[k] ?? 50])) as Skills;
      l = { money: 0, items: new Map(), loaded: new Map(), equipped: 'weapon.fists', outfits: new Set(), wearing: '', armor: 0, plates: 0, savings: 0, guns: new Map(), stash: new Map(), stashGuns: new Map(), skills: sk, stamina: makeStamina(60 + 0.8 * sk.stamina) };
      this.leads.set(lead, l);
      if (p) {
        l.money = p.startMoney;
        for (const it of p.startItems) this.give(lead, it.id, it.qty);
        for (const o of p.startOutfits) l.outfits.add(o);
        l.wearing = p.startOutfits[0] ?? '';
        const gun = p.startItems.map((i) => this.reg.items.get(i.id)).find((i) => i?.kind === 'weapon' && this.reg.weapon(i.weapon!).class !== 'melee');
        if (gun) { const w = this.reg.weapon(gun.weapon!); l.loaded.set(w.id, w.magazine ?? 0); }
      }
    }
    return l;
  }

  of(lead: string) {
    const l = this.ensure(lead);
    return { money: l.money, items: [...l.items].map(([id, qty]) => ({ id, qty })) };
  }
  count(lead: string, id: string) { return this.ensure(lead).items.get(id) ?? 0; }
  has(lead: string, id: string, qty = 1) { return this.count(lead, id) >= qty; }

  /** Adds up to the stack limit; returns how many were actually added. */
  give(lead: string, id: string, qty = 1): number {
    if (!(qty > 0) || !Number.isInteger(qty)) return 0;
    const def = this.reg.item(id), l = this.ensure(lead);
    const have = l.items.get(id) ?? 0;
    const cap = def.kind === 'weapon' ? 1 : def.stack;
    const add = Math.min(qty, cap - have);
    if (add <= 0) return 0;
    l.items.set(id, have + add);
    if (def.kind === 'weapon' && def.weapon && !l.loaded.has(def.weapon)) l.loaded.set(def.weapon, 0);
    if (def.kind === 'weapon' && def.weapon && this.reg.weapon(def.weapon).class !== 'melee' && !l.guns.has(def.weapon)) l.guns.set(def.weapon, { ...DEFAULT_GUN, ...(def.tier ? { tier: def.tier } : {}) });
    this.emit('changed', { lead, id, delta: add, qty: have + add });
    return add;
  }
  /** All-or-nothing removal. */
  take(lead: string, id: string, qty = 1): boolean {
    if (!(qty > 0) || !Number.isInteger(qty)) return false;
    const l = this.ensure(lead), have = l.items.get(id) ?? 0;
    if (have < qty) return false;
    if (have === qty) l.items.delete(id); else l.items.set(id, have - qty);
    const def = this.reg.items.get(id);
    if (def?.kind === 'weapon' && have === qty && def.weapon) {
      l.loaded.delete(def.weapon); l.guns.delete(def.weapon);
      if (l.equipped === def.weapon) l.equipped = 'weapon.fists';
    }
    this.emit('changed', { lead, id, delta: -qty, qty: have - qty });
    return true;
  }
  addMoney(lead: string, cents: number, reason = 'gift') {
    if (!Number.isInteger(cents) || cents < 0) throw new Error(`money must be non-negative integer cents, got ${cents}`);
    const l = this.ensure(lead); l.money += cents;
    this.emit('money', { lead, delta: cents, money: l.money, reason });
  }
  /** All-or-nothing payment. */
  spend(lead: string, cents: number, reason = 'purchase'): boolean {
    if (!Number.isInteger(cents) || cents < 0) return false;
    const l = this.ensure(lead);
    if (l.money < cents) return false;
    l.money -= cents;
    this.emit('money', { lead, delta: -cents, money: l.money, reason });
    return true;
  }
  /** Pay as much as possible of a debt (hospital bill); returns what was paid. */
  payUpTo(lead: string, cents: number, reason: string) {
    const l = this.ensure(lead), pay = Math.min(l.money, Math.max(0, Math.round(cents)));
    if (pay > 0) this.spend(lead, pay, reason);
    return pay;
  }

  /** Cash on hand → savings (bank teller or home safe). */
  deposit(lead: string, cents: number) { if (!this.spend(lead, cents, 'deposit')) return false; this.ensure(lead).savings += cents; return true; }
  withdraw(lead: string, cents: number) { const l = this.ensure(lead); if (!Number.isInteger(cents) || cents < 0 || l.savings < cents) return false; l.savings -= cents; this.addMoney(lead, cents, 'withdraw'); return true; }
  /** Move items between the lead's pockets and the home stash (safe from death and arrest). */
  toStash(lead: string, id: string, qty = 1) {
    const l = this.ensure(lead), w = this.reg.items.get(id)?.weapon, gs = w ? l.guns.get(w) : undefined;
    if (!this.take(lead, id, qty)) return false;
    l.stash.set(id, (l.stash.get(id) ?? 0) + qty);
    if (gs) l.stashGuns.set(id, gs);
    return true;
  }
  fromStash(lead: string, id: string, qty = 1) {
    const l = this.ensure(lead), have = l.stash.get(id) ?? 0;
    if (have < qty) return false;
    const got = this.give(lead, id, qty); if (got <= 0) return false;
    if (have - got <= 0) l.stash.delete(id); else l.stash.set(id, have - got);
    const w = this.reg.items.get(id)?.weapon, sg = l.stashGuns.get(id);
    if (w && sg) { l.guns.set(w, sg); l.stashGuns.delete(id); }
    return true;
  }
  /** Lend between leads (Nick's loans; interest is tracked by the economy). */
  transfer(from: string, to: string, cents: number, reason = 'loan') { if (!this.spend(from, cents, reason)) return false; this.addMoney(to, cents, reason); return true; }

  /** Weapons the lead carries (fists always). */
  weapons(lead: string): string[] {
    const out = ['weapon.fists'];
    for (const [id] of this.ensure(lead).items) { const d = this.reg.items.get(id); if (d?.kind === 'weapon' && d.weapon) out.push(d.weapon); }
    return out;
  }
  equip(lead: string, weaponId: string) {
    if (!this.weapons(lead).includes(weaponId)) return false;
    this.ensure(lead).equipped = weaponId; return true;
  }
  /** Reserve rounds for a weapon (from its ammo item). */
  reserve(lead: string, weaponId: string) { const w = this.reg.weapon(weaponId); return w.ammo ? this.count(lead, w.ammo) : 0; }
  takeRounds(lead: string, weaponId: string, n: number) {
    const w = this.reg.weapon(weaponId); if (!w.ammo) return 0;
    const got = Math.min(n, this.count(lead, w.ammo));
    if (got > 0) this.take(lead, w.ammo, got);
    return got;
  }

  /** Illicit items (for arrest confiscation and cop searches). */
  illicit(lead: string) { return [...this.ensure(lead).items].filter(([id]) => this.reg.items.get(id)?.illicit).map(([id, qty]) => ({ id, qty })); }

  serialize() {
    const out: Record<string, SavedLeadInv> = {};
    for (const [id, l] of this.leads) out[id] = {
      money: l.money, items: [...l.items].map(([i, q]) => ({ id: i, qty: q })), loaded: Object.fromEntries(l.loaded), equipped: l.equipped,
      outfits: [...l.outfits], wearing: l.wearing, armor: l.armor, plates: l.plates,
      savings: l.savings, guns: Object.fromEntries(l.guns), stash: [...l.stash].map(([i, q]) => ({ id: i, qty: q })), stashGuns: Object.fromEntries(l.stashGuns), skills: { ...l.skills }, stamina: { ...l.stamina },
    };
    return out;
  }
  deserialize(s: Record<string, SavedLeadInv>) {
    this.leads.clear();
    for (const [id, d] of Object.entries(s)) {
      const items = new Map<string, number>();
      for (const it of d.items) if (this.reg.items.has(it.id) && it.qty > 0) items.set(it.id, it.qty); // unknown ids (removed content) are dropped, never crash a load
      const p = this.reg.leads.get(id);
      const skills = Object.fromEntries(SKILLS.map((k) => [k, d.skills?.[k] ?? p?.skills?.[k] ?? 50])) as Skills;
      const guns = new Map<string, GunState>(Object.entries(d.guns ?? {}));
      for (const [i] of items) { const w = this.reg.items.get(i)?.weapon; if (w && this.reg.weapon(w).class !== 'melee' && !guns.has(w)) guns.set(w, { ...DEFAULT_GUN }); }
      this.leads.set(id, {
        money: d.money, items, loaded: new Map(Object.entries(d.loaded ?? {})), equipped: d.equipped ?? 'weapon.fists',
        outfits: new Set(d.outfits ?? []), wearing: d.wearing ?? '', armor: d.armor ?? 0, plates: d.plates ?? 0,
        savings: d.savings ?? 0, guns, stash: new Map((d.stash ?? []).filter((x) => this.reg.items.has(x.id)).map((x) => [x.id, x.qty])), stashGuns: new Map(Object.entries(d.stashGuns ?? {})), skills,
        stamina: d.stamina ?? makeStamina(60 + 0.8 * skills.stamina),
      });
    }
  }
}
export interface SavedLeadInv {
  money: number; items: { id: string; qty: number }[]; loaded: Record<string, number>; equipped: string; outfits: string[]; wearing: string; armor: number; plates: number;
  // v4
  savings?: number; guns?: Record<string, GunState>; stash?: { id: string; qty: number }[]; stashGuns?: Record<string, GunState>; skills?: Partial<Skills>; stamina?: StaminaState;
}
