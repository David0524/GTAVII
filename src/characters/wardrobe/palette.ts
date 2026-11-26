/**
 * Clothing colours, from docs/STYLE_GUIDE.md §2 and docs/WARDROBE_1974.md §3.12 (corrected
 * targets, with the reference ids noted there). Values are sRGB hex; the generator jitters
 * them per garment (fade, dye-lot variation) so no two pieces are identical.
 */
export const CLOTH = {
  camel: '#a07a52', rust: '#8e4a2e', trench: '#d8cfb8', navy: '#2e3550', charcoal: '#3a3a3e', suitBrown: '#5a3d2a',
  suitGrey: '#6a6a68', black: '#26242a', tieMaroon: '#6e2228', red70: '#a8302e', pinkPantsuit: '#d6a0b8', mustard: '#c99a35',
  harvestYellow: '#d1a63a', rustDress: '#b0714a', paleBlue: '#b9c3d0', chambray: '#9db0c8', royalBlue: '#2f4f86',
  olive: '#5e5a2a', tweedOat: '#c4b48f', fauxFurCream: '#e3d8c6', oxblood: '#6e2a1e', khaki: '#b0a080', cream: '#d8cfc0',
  denim70: '#3c4a63', denimMid: '#4a5a7a', white: '#e4e0d6', offWhite: '#d9d2c2', shirtBlue: '#b4c4d8', shirtPink: '#dcb8b4',
  brownTan: '#8a6a48', chocolate: '#4a3020', burgundy: '#6a2430', forest: '#34452e', avocado: '#6b6b3a', orange70: '#c0602a',
  lilac: '#a890b0', teal70: '#3a6a6a', greyMarl: '#8a8884', beige: '#bba98a', plaidRed: '#a44030', plaidBrown: '#7a5a3a',
} as const;
export type ClothKey = keyof typeof CLOTH;

export const LEATHER = { black: '#1e1a18', brown: '#4a2e1e', oxblood: '#4e1c18', tan: '#8a5a34', white: '#d8d2c4', patent: '#151314' } as const;
export const METAL = { gold: '#b08a3a', silver: '#9a9a98', tortoise: '#4a2a18', blackFrame: '#141212' } as const;

/** Uniform colours: generic, period-plausible; no real insignia. */
export const UNIFORM = {
  policeShirt: '#9fb3cf', policeDark: '#1e2434', transitGrey: '#5a6068', sanitation: '#4e5a44', railRed: '#b03a2e',
  slicker: '#c8962a', smock: '#c8c4b4', smockBlue: '#7d93a8', doorman: '#3a2a3e', hardhat: '#c8962a',
} as const;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
/** sRGB → linear. */
export function toLinear(c: [number, number, number]): [number, number, number] {
  return c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
}
