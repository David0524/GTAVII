import type { GameplayContent, ItemDef, WeaponDef, ShopDef, OutfitDef, GarmentDef, PrecinctDef, LeadProfile } from '../data/schema';
import { validateContent } from '../data/schema';

/** Indexed, validated content. */
export class Registry {
  readonly items = new Map<string, ItemDef>();
  readonly weapons = new Map<string, WeaponDef>();
  readonly shops = new Map<string, ShopDef>();
  readonly outfits = new Map<string, OutfitDef>();
  readonly garments = new Map<string, GarmentDef>();
  readonly precincts: PrecinctDef[];
  readonly leads = new Map<string, LeadProfile>();
  constructor(readonly content: GameplayContent) {
    validateContent(content);
    for (const i of content.items) this.items.set(i.id, i);
    for (const w of content.weapons) this.weapons.set(w.id, w);
    for (const s of content.shops) this.shops.set(s.id, s);
    for (const o of content.outfits) this.outfits.set(o.id, o);
    for (const g of content.garments) this.garments.set(g.id, g);
    for (const l of content.leads) this.leads.set(l.id, l);
    this.precincts = content.precincts;
  }
  item(id: string) { const i = this.items.get(id); if (!i) throw new Error(`unknown item ${id}`); return i; }
  weapon(id: string) { const w = this.weapons.get(id); if (!w) throw new Error(`unknown weapon ${id}`); return w; }
  lead(id: string) { const l = this.leads.get(id); if (!l) throw new Error(`unknown lead ${id}`); return l; }
  /** Weapon item for a weapon id (first match). */
  itemForWeapon(wid: string) { for (const i of this.items.values()) if (i.weapon === wid) return i; return null; }
}
