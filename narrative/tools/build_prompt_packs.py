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



SOURCES = OUT / "sources"   # other chats' requests, transcribed by narrative: sources/<owner>.json = [{id,file,owner,use,aspect,size,prompt,text,accept,priority}]
FINAL = False               # flip to True only when the engine has published Phase 3 sign slots and all sizes are frozen
SLICE_IDS = {"biz.hotel_corwin", "biz.hotel_arden", "biz.shamrock_rail", "biz.fifth_ave_luncheonette", "biz.baxter_lowe",
             "biz.royal_cafeteria", "biz.lucky_quarter", "biz.earls_shine", "biz.velvet_moon", "biz.varelas", "biz.moretti", "biz.krause"}


def sign_entry(bid, slot, text, look):
    b = BIZ[bid]; asp, px, form = SLOTS[slot]
    tp = f'EXACT TEXT: "{text}". Render these characters only, spelled exactly, with no other words or numbers anywhere.' if text else "NO TEXT AT ALL: no letters, numbers or symbols that read as writing."
    prompt = f"Create {form} for {b['name']} ({b['trade']}), {RULES} {look} {tp} Aspect ratio {asp}."
    acc = ["text letter-perfect" if text else "no legible text anywhere", "no real logo or brand", "no people or vehicles", "frontal and evenly lit"]
    if slot in ("blade", "roof"): acc.append("clean black background")
    if slot == "window": acc.append("transparent or flat pure-white background")
    if slot == "marquee": acc.append("letter rows empty")
    key = bid.split(".", 1)[1]
    pri = 1 if bid in SLICE_IDS else (2 if b.get("story") or slot == "marquee" else 3)
    return {"id": f"sign.{key}.{slot}", "file": f"sign_{key}_{slot}.png", "owner": "narrative", "use": f"{b['name']} · {b['where']}",
            "aspect": asp, "size": px, "sizeFinal": False, "prompt": prompt, "text": text or None,
            "textPolicy": "exact" if text else "none", "accept": acc, "priority": pri}


def gather():
    E = [sign_entry(*r) for r in STOREFRONTS] + [sign_entry(b, "marquee", None, l) for b, l in MARQUEES]
    for f in sorted(SOURCES.glob("*.json")) if SOURCES.exists() else []:
        E += json.loads(f.read_text())
    ids = [e["id"] for e in E]; files = [e["file"] for e in E]
    assert len(set(ids)) == len(ids), "duplicate id"; assert len(set(files)) == len(files), "duplicate file"
    old = {}
    pj = OUT / "prompts.json"
    if pj.exists():
        old = {e["id"]: e for e in json.loads(pj.read_text()).get("queue", [])}
    for e in E:   # status is run state: keep it across regenerations unless the prompt changed
        o = old.get(e["id"])
        e["status"] = o["status"] if o and o.get("prompt") == e["prompt"] else "todo"
    E.sort(key=lambda e: (e["priority"], e["owner"], e["id"]))
    return E


RUNBOOK = """## Runbook (for a browser agent: Claude in Chrome driving ChatGPT's image tool)

**Run only when the line below says RUNNABLE.** Status: **{state}**

Follow these steps exactly. Do not reword, improve or combine prompts.

1. Open https://chatgpt.com and start a **new chat**. Make sure image generation is available.
2. Take the entries in this file **from top to bottom** whose `status` is `todo`. For each one:
   a. Paste the entry's **prompt** text exactly, as the whole message, and nothing else. Send one prompt per turn. Start a new chat every 10 entries.
   b. Wait for the image. Check it against the entry's **accept** list:
      - If **text policy** is `exact`, compare the lettering letter by letter with the **text** field. Any extra, missing or wrong character is a fail.
      - If **text policy** is `none`, any legible letters, numbers or words are a fail.
      - Any real brand, logo, person, car or modern object is a fail.
   c. On a fail, send exactly: `Regenerate. Follow the prompt exactly; {{reason}}.` Here {{reason}} is a few words, e.g. "the text must read HOTEL ARDEN". Allow **at most 2 retries**. After the third failed image, **skip** the entry and log it as `failed`.
   d. On a pass, download the image and save it **with the exact `file` name and extension** (lowercase).
3. Upload in batches of up to 20 files. On github.com, go to the repository's branch `claude/sharp-maxwell-jnb6hr`, open the folder `assets/incoming/` (one flat folder, no subfolders), choose **Add file → Upload files**, drop the batch in, and commit with the message `incoming: images <first id> … <last id>`. Commit directly to `claude/sharp-maxwell-jnb6hr`.
4. Append one line per entry to `assets/prompts/RUN_LOG.md` (edit it on github.com in the same branch): `id | attempts | generated / failed | note`. Do not edit this file or prompts.json; the narrative chat updates statuses from the log.
5. Stop when no `todo` entries remain, or if ChatGPT refuses or rate-limits three times in a row. Log where you stopped.
"""


def write_all(E):
    OUT.mkdir(parents=True, exist_ok=True)
    state = "RUNNABLE" if FINAL else "NOT YET RUNNABLE: sizes are provisional until the engine defines sign slots"
    (OUT / "prompts.json").write_text(json.dumps({"_note": "Master image-prompt queue (generated by narrative/tools/build_prompt_packs.py; don't edit by hand). Status values: todo, generated, accepted, failed.",
        "runnable": FINAL, "uploadTo": "assets/incoming/ on branch claude/sharp-maxwell-jnb6hr", "queue": E}, ensure_ascii=False, indent=2) + "\n")
    L = ["# ALL_PROMPTS: the single image-prompt queue", "",
         "> Generated by `narrative/tools/build_prompt_packs.py` from `content/businesses.json` and `assets/prompts/sources/*.json`. Don't edit by hand.",
         "> Every chat's image requests come through the narrative chat. Machine-readable copy: `assets/prompts/prompts.json`.",
         f"> {len(E)} entries; {sum(e['status']=='todo' for e in E)} todo. Sorted by priority (1 = vertical slice, 2 = story, 3 = ambient, 4 = placeholder or low).", "", RUNBOOK.format(state=state), "## Queue", ""]
    for i, e in enumerate(E, 1):
        L += [f"### {i:03d}. `{e['id']}` · priority {e['priority']} · status: **{e['status']}**",
              f"- **file:** `{e['file']}` · **size:** {e['size']} ({e['aspect']}{'' if e.get('sizeFinal') else ', provisional'}) · **owner:** {e['owner']}",
              f"- **use:** {e['use']}",
              f"- **text policy:** {e['textPolicy']}" + (f" · **text:** `{e['text']}`" if e.get('text') else ""),
              f"- **accept:** " + "; ".join(e["accept"]),
              "- **prompt:**", "", "```text", e["prompt"], "```", ""]
    (OUT / "ALL_PROMPTS.md").write_text("\n".join(L))
    log = OUT / "RUN_LOG.md"
    if not log.exists():
        log.write_text("# RUN_LOG (append only; written by the browser agent)\n\nid | attempts | result | note\n---|---|---|---\n")


E = gather()
write_all(E)
for old in ("pack01_storefronts.md", "pack02_storefronts_deuce.md"):
    (OUT / old).unlink(missing_ok=True)
print(len(E), "queued prompts")
