# Fonts

All fonts are licensed under the SIL Open Font License 1.1 (full text in `OFL.txt`). They're
self-hosted latin subsets downloaded from Google Fonts and haven't been modified. None uses a
Reserved Font Name in this project.

| Font | Copyright | Role in the UI |
|---|---|---|
| Fraunces | Copyright 2018 The Fraunces Project Authors (github.com/undercasetype/Fraunces) | Title wordmark, location reveals: soft '70s poster serif |
| League Gothic | Copyright 2020 The League Gothic Project Authors (github.com/theleagueof/league-gothic) | Condensed headlines, menu tabs, newspaper heads |
| Archivo | Copyright 2017 The Archivo Project Authors (github.com/Omnibus-Type/Archivo) | HUD, menus, subtitles: grotesque in the spirit of the 1970 transit signage |
| Courier Prime | Copyright 2015 The Courier Prime Project Authors (github.com/quoteunquoteapps/CourierPrime) | Typewritten briefs, case-file text, debug overlay |

## Candidates under review (not shipped; see docs/research/TYPE_DIRECTIONS.md)

The current set (Fraunces, League Gothic, Archivo, Courier Prime) is being replaced: the user found it
generic. Candidates, with licences checked against the files themselves:

| Font | Source | Licence | Notes |
|---|---|---|---|
| TeX Gyre Heros, Heros Cn, Adventor, Bonum, Schola, Cursor | CTAN `fonts/tex-gyre` (GUST e-foundry) | GUST Font License = LPPL 1.3c, with a *request* (not a requirement) to rename modified versions | Redistribution and embedding allowed. Subsetting to WOFF2 counts as modifying, so we'll ship them under new family names (e.g. "T74 Heros") with a MANIFEST, as the licence asks. |
| Libre Franklin | github.com/google/fonts `ofl/librefranklin` | SIL OFL 1.1 | |
| News Cycle | github.com/google/fonts `ofl/newscycle` | SIL OFL 1.1, Reserved Font Name "News Cycle" | A subset must be renamed (RFN). |
| Cutive Mono | github.com/google/fonts `ofl/cutivemono` | SIL OFL 1.1 | |

**Rejected:** URW base35 (Nimbus Sans, Nimbus Sans Narrow, C059, URW Bookman, URW Gothic). Their licence
is AGPL-3, and the font exception only covers embedding in PostScript and PDF documents. Shipping them as
web fonts inside a commercial game would make the fonts AGPL-distributed, which is not acceptable.
Special Elite (Apache 2.0) is licence-clean but rejected on taste: its distressed typewriter is the cliché we're removing.
