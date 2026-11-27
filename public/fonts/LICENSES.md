# Fonts

The user chose type direction A, "Transit Authority" ("Do A", 2026-11-26). The decision and its references
are in docs/research/TYPE_DIRECTIONS.md.

The files are Latin WOFF2 subsets built by `tools/fonts/build_fonts.py` from the upstream sources below.

| Shipped family (files) | Upstream | Licence | Role |
|---|---|---|---|
| T74 Heros (T74Heros-400/700.woff2) | TeX Gyre Heros, CTAN fonts/tex-gyre (GUST e-foundry) | GUST Font License (LPPL 1.3c), `GUST-FONT-LICENSE.txt` | HUD, menus, map, signs (Helvetica class) |
| T74 Heros Cn (T74HerosCn-400/700.woff2) | TeX Gyre Heros Cn | GUST Font License | Tabs, street plates, condensed labels |
| T74 Schola (T74Schola-400/400i/700.woff2) | TeX Gyre Schola | GUST Font License | Body text, briefings, newspaper text (Century Schoolbook class) |
| T74 Cursor (T74Cursor-400.woff2) | TeX Gyre Cursor | GUST Font License | Typed forms and case files (Courier class) |
| Libre Franklin (LibreFranklin-500-900.woff2) | github.com/google/fonts ofl/librefranklin | SIL OFL 1.1, `OFL-LibreFranklin.txt` (no Reserved Font Name) | Newspaper headlines (Franklin Gothic class) |

**The renames:** the GUST Font License *requests* that modified versions carry new names. A subset is a
modification, so the TeX Gyre families ship as "T74 …". Copyright notices are kept in the font files.

**The title wordmark** is not a font. It is original constructed lettering, `public/ui/wordmark.svg`, built
by `tools/ui/wordmark.py`.

**Rejected:**
- *URW base35* (Nimbus Sans, C059, URW Bookman, URW Gothic): AGPL-3. Its font exception only covers
  PostScript and PDF embedding, not web fonts in a game.
- *Special Elite*: the cliché distressed typewriter look.
- *Fraunces, League Gothic, Archivo and Courier Prime*: removed. The user found the set "very AI".
