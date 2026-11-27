/**
 * Narrative NPC archetypes (content/npc_archetypes/*.json, schema in NARRATIVE_BRIEF.md) →
 * generation inputs. palette, wardrobe (text brief) and props drive the outfit generator.
 */
import type { OutfitContext } from './wardrobe/outfit';

export interface ArchetypeDef {
  id: string; behaviour?: string; palette?: string[]; wardrobe?: string; props?: string[];
  density?: { day: number; night: number }; scripted?: boolean; note?: string;
}

/** Prop words in archetype files → prop ids built by build/accessories.ts (others become world props). */
const PROP_IDS: [RegExp, string][] = [
  [/shoulder ?bag|camera bag/i, 'shoulderBag'], [/handbag|purse|pocketbook/i, 'handbag'], [/tote|shopping/i, 'shoppingBag'], [/paper bag|grocer/i, 'paperBag'],
  [/newspaper|paper|racing form|tip sheet/i, 'newspaper'], [/briefcase|attach/i, 'briefcase'], [/cigar|cigarette/i, 'cigarette'], [/umbrella/i, 'umbrella'],
  [/nightstick|baton/i, 'nightstick'], [/hand ?cart|rack|dolly/i, 'handcart'], [/lunch ?pail|lunchbox/i, 'lunchPail'], [/shopping cart/i, 'shoppingCart'],
  [/glove/i, 'workGloves'], [/bullhorn|megaphone/i, 'bullhorn'],
];
export function propIds(words: string[] = []): string[] {
  const out = new Set<string>();
  for (const w of words) for (const [r, id] of PROP_IDS) if (r.test(w)) { out.add(id); break; }
  return [...out];
}

export class ArchetypeRegistry {
  private map = new Map<string, ArchetypeDef>();
  register(defs: ArchetypeDef[]) { for (const d of defs) this.map.set(d.id, d); }
  get(id?: string) { return id ? this.map.get(id) ?? this.map.get(`npc.${id}`) : undefined; }
  get all() { return [...this.map.values()]; }
  /** Outfit generator inputs for an archetype id (built-in sim names work too). */
  outfitContext(id?: string): Partial<OutfitContext> {
    const d = this.get(id);
    const key = (id ?? '').replace(/^npc\./, '');
    if (!d) return { archetype: key };
    const text = `${d.wardrobe ?? ''} ${d.note ?? ''}`;
    return {
      archetype: key, wardrobe: d.wardrobe, palette: d.palette, propsList: propIds(d.props).filter((p) => !['handcart', 'shoppingCart', 'lunchPail', 'bullhorn'].includes(p)),
      grit: /work|labou?r|porter|sanitation|cart|vendor|homeless|drunk/i.test(text) ? 0.7 : undefined,
      // binding content rule: street clothes, never a costume or sexualised framing
      modest: /strip_worker|never costume|never sexuali/i.test(`${d.id} ${text}`),
    };
  }
}
