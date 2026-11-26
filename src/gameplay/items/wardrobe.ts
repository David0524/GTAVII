import { Emitter } from '../core/events';
import type { Inventory } from './inventory';
import type { Registry } from './registry';
import type { OutfitDef } from '../data/schema';

/**
 * Player wardrobe. Outfits are owned per lead and kept at that lead's home; you change at home (or
 * walk out of a clothing store in what you just bought). The worn outfit drives
 *  - the characters stream's `Character.setWardrobe(wardrobeSet)` (event `wear`), and
 *  - witness descriptions: what people remember is the loudest piece and its colour.
 */
export interface Look { outfit: string; pieces: { slot: string; noun: string; colour: string; style: string }[]; headline: string; words: string[] }
export interface WardrobeEvents extends Record<string, unknown> { wear: { lead: string; outfit: string; wardrobeSet: string } }

const SALIENCE: Record<string, number> = { full: 5, outer: 4, top: 3, hat: 2.5, bottom: 2, shoes: 0.5 };

export class Wardrobe extends Emitter<WardrobeEvents> {
  constructor(private reg: Registry, private inv: Inventory) { super(); }

  owned(lead: string) { return [...this.inv.ensure(lead).outfits]; }
  wearing(lead: string) { return this.inv.ensure(lead).wearing; }

  /** Change outfit. `atHome` (engine/interior knows) or `justBought` lets you change. */
  change(lead: string, outfit: string, where: { atHome?: boolean; justBought?: boolean }): boolean {
    const l = this.inv.ensure(lead);
    if (!l.outfits.has(outfit)) return false;
    if (!where.atHome && !where.justBought) return false;
    if (l.wearing === outfit) return true;
    l.wearing = outfit;
    const o = this.reg.outfits.get(outfit)!;
    this.emit('wear', { lead, outfit, wardrobeSet: o.wardrobeSet });
    return true;
  }

  look(lead: string): Look { return describeOutfit(this.reg, this.reg.outfits.get(this.wearing(lead))); }
}

export function describeOutfit(reg: Registry, o: OutfitDef | undefined): Look {
  if (!o) return { outfit: '', pieces: [], headline: 'dark clothes', words: ['dark clothes'] };
  const pieces = o.pieces.map((p) => { const g = reg.garments.get(p.garment)!; return { slot: g.slot, noun: g.noun, colour: p.colour, style: g.style }; });
  const sorted = [...pieces].sort((a, b) => (SALIENCE[b.slot] ?? 0) - (SALIENCE[a.slot] ?? 0));
  const words = sorted.filter((p) => p.slot !== 'shoes').map((p) => `${p.colour} ${p.noun}`);
  return { outfit: o.id, pieces, headline: words[0] ?? 'dark clothes', words };
}
