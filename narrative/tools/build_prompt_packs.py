#!/usr/bin/env python3
"""Image-prompt packs (docs/briefs/ART_ASSETS.md, Lever 2) generated from content/businesses.json.
Pack format: one row per asset with id, file, use, size/aspect, prompt, text policy and acceptance notes.
Slot sizes are PROVISIONAL until the engine defines facade sign slots; re-run with the engine's slot table then.
Visual direction per business is written by the lead writer (not delegated)."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "prompts"
BIZ = {b["id"]: b for b in json.loads((ROOT / "content" / "businesses.json").read_text())["businesses"]}

# Provisional slot classes: aspect and pixel size the engine will likely want; flagged as provisional in the pack.
SLOTS = {
    "fascia":  ("6:1", "3072×512", "a flat, frontal storefront fascia sign board, filling the frame edge to edge"),
    "blade":   ("1:4", "512×2048", "a vertical projecting blade sign, seen dead-on from the front, isolated on a flat black background"),
    "window":  ("3:2", "1536×1024", "lettering painted on a shop window, seen straight on, on a fully transparent background (lettering only, no glass reflections)"),
    "awning":  ("5:1", "2560×512", "the front valance of a canvas shop awning, flat and frontal, filling the frame"),
    "roof":    ("8:1", "4096×512", "a run of giant rooftop sign letters on a steel frame, frontal, isolated on a flat black background"),
    "marquee": ("4:1", "3072×768", "a cinema marquee front, flat and frontal, with three EMPTY changeable-letter rows (white boards with black rails, no letters on them)"),
}
RULES = ("Manhattan, 1974. Photorealistic texture, flat and frontal, evenly lit with no strong shadows, no perspective. "
         "No people, no cars, no logos, no brand names other than the exact text given, no modern materials. Muted, slightly soot-dulled 1970s colour.")

# (biz id, slot, exact text or None, visual direction)
STOREFRONTS = [
 ("biz.hotel_corwin", "blade", "HOTEL CORWIN", "Tall vertical neon on a sheet-metal can painted oxblood, red neon tubes in a 1930s sans serif; the E, L and R tubes dead and grey (unlit glass) while the rest glow, so at night it reads HOT CO WIN. Rust streaks at the bolts."),
 ("biz.hotel_arden", "fascia", "HOTEL ARDEN", "Porcelain-enamel panel, cream letters on bottle green, chipped at the corners; small brass bulbs along the edge, two missing."),
 ("biz.shamrock_rail", "blade", "SHAMROCK RAIL", "Green neon script over a neon shamrock outline on a black-painted box, Irish-bar style; slightly flickery look (one stroke dimmer)."),
 ("biz.fifth_ave_luncheonette", "window", "LUNCHEONETTE", "Gold-leaf window lettering with a black outline and drop shadow, set in a gentle arch; classic sign-painter style."),
 ("biz.iron_gate", "fascia", "THE IRON GATE", "Dark wood board with raised gilt serif letters, a small wrought-iron gate motif at each end; old-money, well kept."),
 ("biz.kafeneio_kastoria", "awning", None, "Faded blue-and-white striped canvas valance, scalloped edge, sun-bleached; plain area left for lettering (renderer sets Greek and Latin text)."),
 ("biz.royal_cafeteria", "fascia", "ROYAL CAFETERIA", "Red porcelain enamel with cream streamline letters and chrome trim bands; grime along the bottom edge; 24-hour diner energy."),
 ("biz.lucky_quarter", "fascia", "LUCKY QUARTER", "Arcade sign: yellow-painted sheet metal ringed with exposed incandescent chaser bulbs, letters in red outlined block type, a painted quarter coin at the left (no real coin design, just a generic coin)."),
 ("biz.earls_shine", "window", "EARL'S SHINE", "Hand-painted sign-writer lettering in white and red on a small board, a painted shoe silhouette; scuffed and proud."),
 ("biz.feld_frocks", "window", "FELD FROCKS INC.", "Small gold-leaf lettering for an upper-floor loft window, modest serif, a bit flaked."),
 ("biz.moretti", "fascia", "MORETTI & SONS", "Green-painted wooden board, gold serif letters, a painted ribbon scroll and tiny painted roses at the corners; old (1912) and repainted many times."),
 ("biz.kallis_furs", "fascia", "KALLIS", "Black glass (Carrara-style) panel with elegant silver script letters; luxurious, a fur-salon front; spotless."),
 ("biz.seoul_star", "fascia", "SEOUL STAR IMPORTS", "Plain white plastic-faced lightbox with red block letters and a small red star; a little yellowed."),
 ("biz.hanyang_house", "window", None, "Window decal frame for a small Korean restaurant: a painted red border and a simple bowl motif; leave the centre empty (renderer sets Hangul and English)."),
 ("biz.ashgrove_trust", "fascia", "ASHGROVE TRUST COMPANY", "Cast bronze letters on polished grey granite, Roman capitals, a bank front; dignified, slightly tarnished."),
 ("biz.baxter_lowe", "roof", "LACY'S", "Giant red rooftop letters on a black steel lattice frame, each letter outlined with incandescent bulbs; a department store crown sign. Not any real store's logo or lettering style: plain bold slab-serif capitals."),
 ("biz.pinsky", "fascia", "PINSKY BROS.", "Black board, white hand-painted block capitals, a wholesale front; faded."),
 ("biz.silverglass", "fascia", "SILVERGLASS LUGGAGE", "Brushed aluminium letters on a maroon board, a painted trunk silhouette at one end."),
 ("biz.ardito", "fascia", "ARDITO NOVELTY CO.", "Bright yellow board with blue circus-style letters, peeling; a cheap novelty shop."),
 ("biz.marlowe", "fascia", "MARLOWE IMPORT HOUSE", "Navy board with gilt serif letters and a thin brass border; slightly grand for the block."),
 ("biz.halpern", "window", "HALPERN PLEATING & STITCHING", "Small upper-floor window lettering in white paint, plain sans serif, slightly crooked."),
 ("biz.rivkin", "fascia", "RIVKIN BUTTONS & TRIMS", "Dark green board, cream letters, a row of painted buttons along the bottom."),
 ("biz.dorfman", "fascia", "DORFMAN DYE WORKS", "Industrial painted brick-wall sign (ghost-sign style) in faded white on soot-dark red brick."),
 ("biz.kaplowitz", "fascia", "KAPLOWITZ HANGERS", "Grey board with black condensed letters and a painted wire hanger icon; utilitarian."),
 ("biz.papadakis", "fascia", "PAPADAKIS PELTS", "Brown board with cream serif letters, fur-district style, a little greasy."),
 ("biz.zissis", "fascia", "ZISSIS COLD STORAGE", "Pale blue enamel panel with white block letters and a painted snowflake; a heavy steel door frame suggested at the edges."),
 ("biz.velvet_moon", "marquee", None, "Grindhouse marquee: deep purple sheet-metal front with a crescent-moon cutout at the top centre lined in chaser bulbs, rust at the seams; three empty letter rows."),
 ("biz.orbit", "blade", "ORBIT", "Neon Saturn with a tilted ring in pink and teal tubes above the word in script; space-age 1960s lounge sign, a bit tired."),
 ("biz.mr_lucky", "fascia", "MR. LUCKY'S LUNCH", "Orange and yellow plastic lightbox, a painted hot dog with a smiling face (generic, cartoonish), chips and cracks in the plastic."),
 ("biz.ostrander", "blade", None, "A projecting optician's sign shaped like a pair of round spectacles, black frame with frosted lenses; no text."),
 ("biz.penny_lantern", "fascia", "PENNY LANTERN DINER", "Stainless steel diner fascia with red enamel letters and a small painted lantern; streamline bands."),
 ("biz.krause", "fascia", "KRAUSE HARDWARE", "Red board with white block letters, a painted key at one end; a neighbourhood hardware store."),
 ("biz.botanica", "window", "BOTÁNICA SAN LÁZARO", "Hand-painted window lettering in red and gold, with painted candles and simple leaves around it (no religious figures)."),
 ("biz.bodega_25", "awning", "BODEGA LA ESQUINA", "Red canvas awning valance with white letters, worn and patched; a corner-store awning."),
 ("biz.pawn_8th", "blade", None, "A projecting pawnshop sign: three gilt balls hanging from a bracket, isolated on black; no text."),
 ("biz.wmhc", "fascia", "WEST MIDTOWN HOUSING COUNCIL", "A small engraved bronze plaque, new and bright (epilogue), Roman capitals."),
]
MARQUEES = [
 ("biz.cormorant", "Former legit house: a tall stepped marquee in faded green enamel with a stylised cormorant bird silhouette in neon at the top centre; three empty letter rows."),
 ("biz.gilded_lyre", "A 1910s gilt marquee: gold-painted pressed tin, a lyre motif at the centre in bulbs, much of the gilt flaking to grey; three empty letter rows."),
 ("biz.pharaoh", "Egyptian-revival marquee: sandstone-coloured panels, a stylised winged sun disc at the top in neon (generic, no hieroglyph text), chaser bulbs; three empty letter rows."),
 ("biz.comet", "A narrow 1930s marquee: chrome and red enamel, a neon comet with a tail swooping across the top; three empty letter rows."),
]


def row(i, bid, slot, text, look):
    b = BIZ[bid]; asp, px, form = SLOTS[slot]
    tp = f'EXACT TEXT: "{text}". Render these characters only, spelled exactly, with no other words or numbers anywhere.' if text else "NO TEXT AT ALL: no letters, numbers or symbols that read as writing."
    prompt = f"Create {form} for {b['name']} ({b['trade']}), {RULES} {look} {tp} Aspect ratio {asp}."
    acc = ["text letter-perfect" if text else "no legible text anywhere", "no real logo or brand", "no people or vehicles", "frontal and evenly lit"]
    if slot in ("blade", "roof"): acc.append("clean black background for keying")
    if slot == "window": acc.append("transparent background (if ChatGPT won't, use flat pure white and say so)")
    if slot == "marquee": acc.append("letter rows empty (the game sets the titles from content/street_text.json)")
    file = f"{bid.split('.', 1)[1]}_{slot}.png"
    return (f"### {i:02d}. {b['name']}: {slot}\n"
            f"- **id:** `sign.{bid.split('.', 1)[1]}.{slot}` · **file:** `{file}` · **size:** {px} ({asp}, provisional)\n"
            f"- **use:** {b['where']} · {b['trade']}\n"
            f"- **text policy:** {'exact: ' + text if text else 'none (the renderer sets any words in period fonts)'}; other sign lines from `businesses.json` (" + " / ".join(b['sign']) + ") are set by the renderer\n"
            f"- **prompt (paste this):**\n\n  > {prompt}\n\n"
            f"- **accept if:** " + "; ".join(acc) + "\n")


HEAD = """# {title}

> Generated by `narrative/tools/build_prompt_packs.py` from `content/businesses.json`. Don't edit by hand.
> Format: `docs/briefs/ART_ASSETS.md` (Lever 2). **Slot sizes are provisional** until the engine's Phase 3
> facades define sign slots; the pack will be regenerated to those sizes, and the prompts won't change.

**How to use (phone-friendly):**
1. Paste each prompt into ChatGPT's image tool.
2. Save the result with the exact **file** name.
3. Upload it to `assets/incoming/{pack}/` (GitHub's web upload works from a phone), or attach it in the narrative chat.
4. If a sign's lettering comes out misspelled, regenerate it. Don't fix it by hand.

**Every image must:** show only invented names from our registry, with no real brands, logos or people; show 1974 materials only; be frontal and evenly lit.

"""


def write(pack, title, rows):
    OUT.mkdir(parents=True, exist_ok=True)
    body = HEAD.format(title=title, pack=pack) + "\n".join(row(i + 1, *r) for i, r in enumerate(rows))
    (OUT / f"{pack}.md").write_text(body)
    return len(rows)


SF = [(b, s, t, l) for b, s, t, l in STOREFRONTS]
MQ = [(b, "marquee", None, l) for b, l in MARQUEES]
deuce = [r for r in SF if r[1] == "marquee" or r[0] in ("biz.lucky_quarter", "biz.earls_shine", "biz.orbit", "biz.mr_lucky", "biz.royal_cafeteria", "biz.shamrock_rail")] + MQ
rest = [r for r in SF if r not in deuce]
n1 = write("pack01_storefronts", "Pack 01: storefronts (Broadway, the garment and fur blocks, Herald Square)", rest[:20])
n2 = write("pack02_storefronts_deuce", "Pack 02: storefronts (the rest) and the Deuce marquees", rest[20:] + deuce)
print(n1, n2, "prompts")
