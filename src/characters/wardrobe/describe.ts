/**
 * Outfit → plain data for gameplay (police witness descriptions, the clothes shop):
 * garment types and dominant colours named the way a 1974 witness would say them.
 */
import type { Outfit } from './outfit';

const NAMED: [string, [number, number, number]][] = [
  ['black', [30, 28, 30]], ['white', [228, 224, 214]], ['grey', [130, 130, 128]], ['navy', [46, 53, 80]], ['blue', [60, 90, 150]], ['light blue', [180, 195, 210]],
  ['brown', [90, 60, 40]], ['tan', [176, 150, 110]], ['cream', [216, 207, 192]], ['red', [168, 48, 46]], ['maroon', [110, 34, 40]], ['pink', [214, 160, 184]],
  ['yellow', [209, 166, 58]], ['orange', [192, 96, 42]], ['green', [52, 69, 46]], ['olive', [94, 90, 42]], ['rust', [142, 74, 46]], ['purple', [100, 70, 110]],
];
export function colourName(hex: string): string {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  let best = NAMED[0][0], bd = Infinity;
  for (const [name, r] of NAMED) { const d = (c[0] - r[0]) ** 2 * 0.3 + (c[1] - r[1]) ** 2 * 0.59 + (c[2] - r[2]) ** 2 * 0.11; if (d < bd) { bd = d; best = name; } }
  return best;
}

export interface OutfitDescription {
  /** Most visible first: e.g. [{ slot: 'outer', type: 'trench coat', colour: 'tan', hex: '#…' }, …] */
  items: { slot: 'outer' | 'top' | 'bottom' | 'shoes' | 'hat'; type: string; colour: string; hex: string; pattern: string }[];
  /** Two dominant colour names, top-down. */
  dominant: string[];
  /** One witness-style line: "tan trench coat, brown slacks, a fedora". */
  summary: string;
}

const TYPE: Record<string, string> = {
  suitJacket: 'suit jacket', sportCoat: 'sport coat', leisureJacket: 'leisure suit jacket', cardigan: 'cardigan', vest: 'vest', trench: 'trench coat', overcoat: 'overcoat',
  raincoat: 'raincoat', smock: 'work smock', workJacket: 'work jacket', windbreaker: 'windbreaker', leather: 'leather jacket', uniformJacket: 'uniform jacket',
  dressShirt: 'shirt', printShirt: 'print shirt', knitPolo: 'knit shirt', tee: 'T-shirt', tank: 'undershirt', blouse: 'blouse', shell: 'sleeveless top', turtleneck: 'turtleneck',
  workShirt: 'work shirt', uniformShirt: 'uniform shirt', sweater: 'sweater', trousers: 'slacks', jeans: 'jeans', shorts: 'shorts', skirt: 'skirt',
};

export function describeOutfit(o: Outfit): OutfitDescription {
  const items: OutfitDescription['items'] = [];
  if (o.outer) items.push({ slot: 'outer', type: TYPE[o.outer.kind] ?? o.outer.kind, colour: colourName(o.outer.fabric.color), hex: o.outer.fabric.color, pattern: o.outer.fabric.pattern });
  items.push({ slot: 'top', type: o.dress ? 'dress' : TYPE[o.top.kind] ?? o.top.kind, colour: colourName(o.top.fabric.color), hex: o.top.fabric.color, pattern: o.top.fabric.pattern });
  if (!o.dress) items.push({ slot: 'bottom', type: o.bottom.kind === 'trousers' && o.bottom.flare > 0.045 ? 'flares' : TYPE[o.bottom.kind], colour: colourName(o.bottom.fabric.color), hex: o.bottom.fabric.color, pattern: o.bottom.fabric.pattern });
  if (o.hat) items.push({ slot: 'hat', type: o.hat.kind, colour: colourName(o.hat.fabric.color), hex: o.hat.fabric.color, pattern: o.hat.fabric.pattern });
  items.push({ slot: 'shoes', type: o.shoes.kind, colour: colourName(o.shoes.color), hex: o.shoes.color, pattern: 'solid' });
  const dominant = [...new Set(items.slice(0, 3).map((i) => i.colour))].slice(0, 2);
  const words = items.filter((i) => i.slot !== 'shoes').map((i) => `${i.pattern !== 'solid' && i.pattern !== 'denim' ? i.pattern + ' ' : ''}${i.colour} ${i.type}`);
  return { items, dominant, summary: words.join(', ') };
}
