/**
 * Interior surface vocabulary. Every surface is one uber-material (see runtime/material.ts); a
 * vertex carries an albedo, a pattern id and a parameter. Colours come from 1970s interiors as
 * photographed and from STYLE_GUIDE §2 (warm, chalky, nothing pristine).
 */
/** Pattern param convention: integer part = variant, fractional part = scale (0 = pattern default). */
export const enum Pat {
  Plain = 0, Checker = 1, HexTile = 2, Planks = 3, Linoleum = 4, Terrazzo = 5, Wallpaper = 6, SubwayTile = 7,
  Dado = 8, TinCeiling = 9, Brick = 10, Paneling = 11, AcousticTile = 12, Chrome = 13, Vinyl = 14, Formica = 15,
  Emissive = 16, Mirror = 17, Baize = 18, Tar = 19, GlassBlock = 20, Lettering = 21, Carpet = 22, Concrete = 23,
  Fabric = 24, Paper = 25, Wood = 26,
}
export type RGB = [number, number, number];
export interface Mat { c: RGB; pat: Pat; p?: number; wear?: number; e?: number }

const hex = (h: string): RGB => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const m = (c: string, pat: Pat, p = 0, wear = 0.35, e = 0): Mat => ({ c: hex(c), pat, p, wear, e });

/** Named materials. Generators may tint copies via `tint()`. */
export const M = {
  // floors
  checkerBW: m('#d8cfbd', Pat.Checker, 0.3, 0.5),
  checkerRed: m('#c9b9a0', Pat.Checker, 1.3, 0.5),
  hexWhite: m('#d6d0c2', Pat.HexTile, 0, 0.55),
  planks: m('#6b4a30', Pat.Planks, 0, 0.45),
  planksWorn: m('#5a3f2a', Pat.Planks, 0, 0.7),
  lino: m('#7d6c55', Pat.Linoleum, 0, 0.5),
  linoGreen: m('#5e6650', Pat.Linoleum, 0, 0.5),
  terrazzo: m('#b8ab95', Pat.Terrazzo, 0, 0.35),
  concrete: m('#77706a', Pat.Concrete, 0, 0.6),
  carpetRed: m('#6e2a24', Pat.Carpet, 0, 0.5),
  carpetGreen: m('#3e4a32', Pat.Carpet, 1, 0.5),
  tar: m('#2a2624', Pat.Tar, 0, 0.6),
  // walls
  plasterCream: m('#cdbf9f', Pat.Plain, 0, 0.45),
  plasterGreen: m('#8f9a7a', Pat.Plain, 0, 0.5),
  plasterBlue: m('#8c9aa0', Pat.Plain, 0, 0.5),
  plasterYellow: m('#c8b273', Pat.Plain, 0, 0.5),
  dadoTenement: m('#c7bc98', Pat.Dado, 0, 0.65), // institutional two-tone: brown-green below, cream above
  dadoHall: m('#cfc4a2', Pat.Dado, 1, 0.55),
  wallpaper: m('#a8906a', Pat.Wallpaper, 0, 0.5),
  wallpaperGreen: m('#7f8a62', Pat.Wallpaper, 1, 0.5),
  subway: m('#e0d9c8', Pat.SubwayTile, 0, 0.45),
  brick: m('#7a3b2c', Pat.Brick, 0, 0.5),
  brickPainted: m('#b9ab8c', Pat.Brick, 1, 0.5),
  paneling: m('#5b3e26', Pat.Paneling, 0, 0.3),
  panelingLight: m('#8a6a44', Pat.Paneling, 1, 0.3),
  marble: m('#cfc3ad', Pat.Terrazzo, 2, 0.25),
  glassBlock: m('#b9c4bc', Pat.GlassBlock, 0, 0.3),
  // ceilings
  tin: m('#d4ccb7', Pat.TinCeiling, 0, 0.5),
  acoustic: m('#d6d1c3', Pat.AcousticTile, 0, 0.45),
  ceilingPlaster: m('#d2c8b0', Pat.Plain, 0, 0.55),
  // furniture
  wood: m('#6a4529', Pat.Wood, 0, 0.35),
  woodDark: m('#3e2818', Pat.Wood, 0, 0.35),
  woodLight: m('#9a7448', Pat.Wood, 0, 0.35),
  formicaRed: m('#b5543e', Pat.Formica, 0, 0.3),
  formicaCream: m('#d9cba8', Pat.Formica, 1, 0.3),
  formicaTeal: m('#5f8a80', Pat.Formica, 2, 0.3),
  chrome: m('#b8b6b0', Pat.Chrome, 0, 0.25),
  steel: m('#8b8a85', Pat.Chrome, 1, 0.4),
  vinylRed: m('#8e2b25', Pat.Vinyl, 0, 0.35),
  vinylGreen: m('#3d5a44', Pat.Vinyl, 0, 0.35),
  vinylBrown: m('#5a3424', Pat.Vinyl, 0, 0.35),
  vinylOrange: m('#b35a2a', Pat.Vinyl, 0, 0.35),
  baize: m('#2f5e3a', Pat.Baize, 0, 0.3),
  enamelWhite: m('#ddd6c6', Pat.Plain, 0, 0.3),
  enamelGreen: m('#5e7a5c', Pat.Plain, 0, 0.35),
  enamelCream: m('#d6c79e', Pat.Plain, 0, 0.35),
  paintDarkGreen: m('#2f3a2c', Pat.Plain, 0, 0.45),
  paintBrown: m('#4a3222', Pat.Plain, 0, 0.45),
  paintRed: m('#8a2a20', Pat.Plain, 0, 0.45),
  paintGrey: m('#6c6a64', Pat.Plain, 0, 0.45),
  black: m('#1c1916', Pat.Plain, 0, 0.3),
  rubber: m('#24201d', Pat.Plain, 0, 0.3),
  fabricBrown: m('#6a4a34', Pat.Fabric, 0, 0.4),
  fabricRust: m('#8e4a2e', Pat.Fabric, 0, 0.4),
  fabricCamel: m('#a07a52', Pat.Fabric, 0, 0.4),
  fabricPlaid: m('#7a5a3a', Pat.Fabric, 1, 0.4),
  fabricDenim: m('#3c4a63', Pat.Fabric, 0, 0.4),
  fabricOlive: m('#6b6b3a', Pat.Fabric, 0, 0.4),
  fur: m('#5a4232', Pat.Fabric, 2, 0.2),
  paper: m('#d8cfb8', Pat.Paper, 0, 0.4),
  newsprint: m('#c9c0aa', Pat.Lettering, 1, 0.4),
  sign: m('#efe3c4', Pat.Lettering, 0, 0.35),
  mirror: m('#8f9490', Pat.Mirror, 0, 0.3),
  glass: m('#9fb0aa', Pat.Plain, 0, 0.2),
  porcelain: m('#e2ddd0', Pat.Plain, 0, 0.3),
  // emissives (e = strength, colour = light colour)
  bulb: m('#ffd9a0', Pat.Emissive, 0, 0, 2.5),
  tube: m('#e8f0e0', Pat.Emissive, 1, 0, 2.2),
  neonRed: m('#ff3b2f', Pat.Emissive, 2, 0, 3.0),
  neonPink: m('#ff6fa8', Pat.Emissive, 2, 0, 3.0),
  neonBlue: m('#6fb6ff', Pat.Emissive, 2, 0, 2.6),
  tvGlow: m('#9fc0e0', Pat.Emissive, 3, 0, 1.4),
  exitSign: m('#ff4a30', Pat.Emissive, 0, 0, 1.6),
  marqueeBulbs: m('#ffe0a8', Pat.Emissive, 4, 0, 2.8),
} satisfies Record<string, Mat>;

export function tint(base: Mat, c: RGB | string, extra?: Partial<Mat>): Mat {
  return { ...base, c: typeof c === 'string' ? hex(c) : c, ...extra };
}
export { hex };
