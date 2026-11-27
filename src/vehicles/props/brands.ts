import type { VendorPropId } from './vendorModels';

/**
 * Vendor brands and cart copy come from Narrative's content/vendors.json (trademark-checked
 * there), read at build time. Until that file is on this branch, a built-in fallback with the
 * same names is used, so nothing diverges.
 */
interface NarrativeBrand { id: string; name: string; type: string; umbrella: string | null; umbrellaLook: string | null; cart: string }
interface VendorsJson { brands: NarrativeBrand[]; vendors?: { type: string; brands: string[] }[] }

let content: VendorsJson | null = null;
try {
  const files = import.meta.glob('/content/vendors.json', { eager: true, import: 'default' }) as Record<string, VendorsJson>;
  content = Object.values(files)[0] ?? null;
} catch { content = null; }

const FALLBACK: NarrativeBrand[] = [
  { id: 'brand.big_cyrus', name: 'Big Cyrus Franks', type: 'hot_dog', umbrella: 'BIG CYRUS · FRANKS · SODA', umbrellaLook: 'yellow and red stripes', cart: 'BIG CYRUS FRANKS · HOT · KRAUT · ONIONS' },
  { id: 'brand.dominick_red_hots', name: "Dominick's Red Hots", type: 'hot_dog', umbrella: "DOMINICK'S · RED HOTS", umbrellaLook: 'blue and white stripes', cart: "DOMINICK'S RED HOTS · SINCE 1951" },
  { id: 'brand.peppys', name: "Peppy's Pretzels", type: 'pretzel_knish', umbrella: "PEPPY'S · HOT PRETZELS · KNISHES", umbrellaLook: 'green and cream', cart: "PEPPY'S · SALT OR NO SALT" },
  { id: 'brand.mama_lucchese', name: 'Mama Lucchese Italian Ices', type: 'italian_ice', umbrella: 'MAMA LUCCHESE · ITALIAN ICES', umbrellaLook: 'red, white and green', cart: 'LEMON · CHERRY · RAINBOW · PAPER CUPS' },
  { id: 'brand.hot_nuts_harry', name: 'Hot Nuts Harry', type: 'nut_roaster', umbrella: null, umbrellaLook: null, cart: 'HONEY ROASTED · CASHEWS · PEANUTS · ALMONDS' },
  { id: 'brand.sunrise_cart', name: 'Sunrise Coffee & Roll', type: 'coffee_cart', umbrella: 'SUNRISE · COFFEE & ROLL', umbrellaLook: 'orange', cart: 'COFFEE 20¢ · BUTTERED ROLL 15¢ · DANISH 30¢' },
];

/** Narrative vendor type for each cart prop (stands carry generic, unbranded signs). */
const TYPE_OF: Partial<Record<VendorPropId, string>> = {
  cart_hot_dog: 'hot_dog', cart_pretzel: 'pretzel_knish', cart_ices: 'italian_ice', cart_nuts: 'nut_roaster', cart_coffee: 'coffee_cart',
};
const GENERIC: Partial<Record<VendorPropId, string[][]>> = {
  stand_fruit: [['FRESH FRUIT', ''], ['FRUIT & VEG', ''], ['PRODUCE', '']],
  stand_flowers: [['FLOWERS', ''], ['FRESH CUT FLOWERS', '']],
  stand_news: [['NEWS', 'PAPERS · MAGAZINES'], ['NEWS · CIGARS', 'CANDY · SMOKES']],
  stand_shoeshine: [['SHINE', '50¢'], ['SHOE SHINE', '']],
};

const COLOURS: Record<string, number> = {
  yellow: 0xe0b020, red: 0xc0281e, blue: 0x1f4fa0, white: 0xf0ece0, green: 0x2f7a3a, cream: 0xe8dcb8, orange: 0xe07a1c,
};
/** "yellow and red stripes" -> [yellow, red]; "red, white and green" -> three colours. */
function stripes(look: string | null): number[] | null {
  if (!look) return null;
  const words = look.toLowerCase().match(/[a-z]+/g) ?? [];
  const cols = words.filter((w) => w in COLOURS).map((w) => COLOURS[w]);
  return cols.length ? cols : null;
}

export interface VendorBrand { name: string; lines: string[]; umbrellaText: string | null; stripes: number[] | null; source: 'narrative' | 'fallback' | 'generic' }

/** Brand for a prop and sim variant (index into the brands for that vendor type). */
export function brandFor(prop: VendorPropId, variant: number): VendorBrand {
  const type = TYPE_OF[prop];
  if (!type) {
    const g = GENERIC[prop];
    const l = g ? g[variant % g.length] : ['', ''];
    return { name: l[0], lines: l, umbrellaText: null, stripes: null, source: 'generic' };
  }
  const list = (content?.brands ?? FALLBACK).filter((b) => b.type === type);
  const b = list.length ? list[variant % list.length] : FALLBACK.find((x) => x.type === type)!;
  return { name: b.name, lines: [b.name.toUpperCase(), b.cart.replace(new RegExp('^' + b.name.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*·?\\s*'), '')], umbrellaText: b.umbrella, stripes: stripes(b.umbrellaLook), source: content ? 'narrative' : 'fallback' };
}
