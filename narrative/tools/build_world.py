#!/usr/bin/env python3
"""Authoring source for N6 ambient world data:
  content/businesses.json (+ generated content/BUSINESS_NAMES.md), content/newspapers.json.
Names are invented. 'check' records the collision search done (see NARRATIVE_PROGRESS N6)."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
C = ROOT / "content"

CLEARED = "cleared: exact-name search, no real business found"
BATCH = "batch-checked (multi-name query; weak). Re-check individually before ship"
GENERIC = "descriptive or generic pattern; low risk; not searched"
B = []


def biz(id, name, trade, where, era, sign, check, story=True, note=""):
    B.append({"id": id, "name": name, "trade": trade, "where": where, "era": era, "sign": sign,
              "check": check, "story": story, "note": note})


# ---- story businesses
biz("biz.hotel_corwin", "Hotel Corwin", "SRO hotel, 14 storeys", "loc.corwin_hotel",
    "A 1900s commercial hotel turned single-room-occupancy, typical of Broadway in the 30s by the 1970s [S6][S7].",
    ["HOTEL CORWIN (vertical neon, three letters dead: 'HOT  CO WIN')", "ROOMS · DAY · WEEK · MONTH", "NO VISITORS AFTER 11 P.M. — MGMT"], CLEARED)
biz("biz.hotel_arden", "Hotel Arden", "SRO hotel with a lobby bar", "loc.arden_hotel",
    "One of the cheap Eighth Avenue hotels near the bus terminal [S8].",
    ["HOTEL ARDEN", "ARDEN BAR · COCKTAILS · OPEN 4 P.M.", "TRANSIENT · PERMANENT"], CLEARED)
biz("biz.shamrock_rail", "The Shamrock Rail", "Bar and grill (the cops' bar)", "loc.cop_bar",
    "A neighbourhood Irish bar near a station house; a period staple.",
    ["SHAMROCK RAIL (green neon shamrock)", "BAR · GRILL · COLD BEER · SANDWICHES", "TV (hand-lettered)"], CLEARED)
biz("biz.lisle_associates", "Lisle & Associates", "Law office", "loc.lisle_office",
    "Gold leaf on the 11th-floor door; a lobby directory board.", ["LISLE & ASSOCIATES · COUNSELORS AT LAW · 1104"], GENERIC)
biz("biz.fifth_ave_luncheonette", "The Fifth Avenue Luncheonette", "Lunch counter", "loc.lisle_luncheonette",
    "A soda-fountain lunch counter with a fixed menu board.", ["LUNCHEONETTE · FOUNTAIN", "TUNA ON RYE 85¢ · EGG CREAM 35¢ · COFFEE 20¢"], GENERIC)
biz("biz.saca", "Seventh Avenue Carriers' Association", "Garment trucking combine", "loc.carriers_garage",
    "Garment-district trucking as a gatekeeping business [S4].", ["S.A.C.A. · GARMENT TRUCKING · LICENSED & BONDED (on truck doors)", "NO PARKING — TRUCKS IN AND OUT 24 HRS"], GENERIC)
biz("biz.varelas", "Varelas & Co.", "Fur manufacturer and cold storage", "loc.varelas_loft",
    "Kastorian-run fur houses in the Fur District [S12]. Summer cold storage of customers' coats.",
    ["VARELAS & CO. · FURS", "COLD STORAGE · INSURED · BONDED", "MANUFACTURING FURRIERS · SINCE 1955"], CLEARED,
    note="The owner's name was checked in N1 (no notable real namesake). Avoid 143 and 210 W 29th St (real fur houses).")
biz("biz.iron_gate", "The Iron Gate Chop House", "Steakhouse", "loc.steakhouse",
    "A Garment District steakhouse where buyers are entertained.", ["THE IRON GATE · CHOP HOUSE · EST. 1938"], CLEARED)
biz("biz.kafeneio_kastoria", "Kafeneio Kastoria", "Greek coffeehouse", "loc.kafeneio",
    "Greek men's coffeehouses near the Fur District.", ["ΚΑΦΕΝΕΙΟ ΚΑΣΤΟΡΙΑ · KAFENEIO KASTORIA · COFFEE · TAVLI"], BATCH)
biz("biz.royal_cafeteria", "Royal Cafeteria", "24-hour cafeteria", "loc.eighth_ave_cafeteria",
    "An all-night Eighth Avenue cafeteria: trays, steam table, pie case.", ["ROYAL CAFETERIA · OPEN ALL NIGHT", "PIE 30¢ · COFFEE 20¢"], CLEARED)
biz("biz.lucky_quarter", "Lucky Quarter Amusements", "Arcade (pinball, peep booths implied)", "loc.bauer_arcade",
    "42nd St arcades [S8]. Replaces 'Fun-O-Rama', which is a real operating arcade in Maine.",
    ["LUCKY QUARTER (chasing bulbs)", "AMUSEMENTS · PINBALL · SKILL GAMES · OPEN 24 HRS"], CLEARED)
biz("biz.earls_shine", "Earl's Shine", "Shoeshine stand", "loc.poole_shine", "Sidewalk shine stands on the Deuce.",
    ["EARL'S SHINE · FINEST ON THE DEUCE · 50¢"], GENERIC)
biz("biz.feld_frocks", "Feld Frocks", "Dress manufacturer (9th-floor loft)", "loc.feld_loft",
    "A family dress house of the kind that ran south in the 1960s–70s [S4][S20].", ["FELD FROCKS INC. · 9TH FL. · SHOWROOM BY APPT."], CLEARED)
biz("biz.moretti", "Moretti & Sons Wholesale Florists", "Wholesale florist", "loc.moretti_flowers",
    "W 28th St wholesale florists [S11].", ["MORETTI & SONS · WHOLESALE FLORISTS · SINCE 1912"], CLEARED)
biz("biz.kallis_furs", "Kallis Fur Salon", "Fur salon", "loc.kallis_furs", "A rival fur house.",
    ["KALLIS · FURS OF DISTINCTION"], BATCH)
biz("biz.seoul_star", "Seoul Star Imports", "Wig and handbag wholesaler", "loc.baek_wholesale",
    "Early Korean wholesalers between 24th and 34th Sts, Fifth to Sixth [S10].", ["SEOUL STAR IMPORTS · WIGS · HANDBAGS · WHOLESALE ONLY"], CLEARED)
biz("biz.hanyang_house", "Hanyang House", "Korean restaurant", "loc.korean_restaurant",
    "Modelled on the pattern of an early-1970s midtown Korean restaurant [S10].", ["한양집 HANYANG HOUSE · KOREAN FOOD"], CLEARED)
biz("biz.ashgrove_trust", "Ashgrove Trust Company", "Bank (34th St branch)", "loc.bank_branch",
    "Replaces 'Fifth Avenue Trust', which was a real NYC trust company (1907 bank run).", ["ASHGROVE TRUST COMPANY · MEMBER F.D.I.C."], CLEARED,
    note="F.D.I.C. is a real public institution; 'member' wording is period-plausible.")
biz("biz.baxter_lowe", "Baxter & Lowe", "Department store at Herald Square", "loc.herald_sq_store",
    "Invented in place of the real store on Herald Square (a trademark).", ["BAXTER & LOWE (huge rooftop letters)", "BAXTER & LOWE · HERALD SQUARE · LUNCH COUNTER · FUR SALON 5"], CLEARED)
biz("biz.kettle_crane", "Kettle & Crane Pictures", "Film production (NIGHT RATE)", "content/boundaries.json",
    "Location crime-picture shoots were common on 1970s NYC streets.", ["KETTLE & CRANE GRIP & ELECTRIC (truck sides)"], CLEARED,
    note="Chosen after 'Lamplight' and 'Halyard' turned out to be real production companies.")
biz("biz.hudson_union", "Hudson Union Steam & Power", "Utility (steam and electric)", "all districts",
    "Stands in for the real utility in all period beats (the skipped dividend, the August shortfall) [S15].", ["HUDSON UNION — STEAM — KEEP BACK"], CLEARED)
biz("biz.evening_dispatch", "Manhattan Evening Dispatch", "Evening newspaper (Nora Finch's paper)", "newsstands",
    "The afternoon-paper tradition.", ["MANHATTAN EVENING DISPATCH · FINAL · 15¢"], CLEARED,
    note="A 'New York Dispatch' existed until 1899. That's no live trademark, and the full title differs.")
biz("biz.daily_ticker", "The Daily Ticker", "Morning tabloid", "newsstands", "The morning tabloid tradition.",
    ["THE DAILY TICKER · NEW YORK'S PICTURE PAPER · 15¢"], CLEARED,
    note="'Clarion' was rejected: it's a fictional New York paper in an existing film franchise.")
biz("biz.wmhc", "West Midtown Housing Council", "Non-profit housing group", "loc.corwin_hotel (epilogue)", "A community housing non-profit.",
    ["WEST MIDTOWN HOUSING COUNCIL · THIS BUILDING IS HOUSING"], GENERIC)
biz("biz.corwin_residential", "Corwin Residential Associates", "Shell company (Lisle's)", "loc.corwin_hotel", "A paper owner.",
    ["NOTICE — CORWIN RESIDENTIAL ASSOCIATES — H. LISLE, COUNSEL"], GENERIC)
# ---- ambient shopfronts (signage variety)
for id, name, trade, where, sign in [
    ("pinsky", "Pinsky Bros. Notions", "Notions wholesaler", "Broadway & W 27th St", "PINSKY BROS. · NOTIONS · ZIPPERS · THREAD · WHOLESALE"),
    ("silverglass", "Silverglass Luggage", "Luggage wholesaler", "Broadway & W 26th St", "SILVERGLASS LUGGAGE · TRUNKS · CASES"),
    ("ardito", "Ardito Novelty Co.", "Novelties", "Broadway & W 28th St", "ARDITO NOVELTY CO. · PARTY GOODS · PLASTIC FLOWERS"),
    ("marlowe", "Marlowe Import House", "Importer", "Broadway & W 30th St", "MARLOWE IMPORT HOUSE · BRASS · GLASS · GIFTS"),
    ("halpern", "Halpern Pleating & Stitching", "Garment contractor", "W 36th St & 8th Ave", "HALPERN PLEATING & STITCHING · 4TH FL."),
    ("rivkin", "Rivkin Buttons & Trims", "Trimmings", "W 38th St & 7th Ave", "RIVKIN BUTTONS & TRIMS · TO THE TRADE"),
    ("dorfman", "Dorfman Dye Works", "Dye house", "W 38th St & 9th Ave", "DORFMAN DYE WORKS · PIECE DYEING"),
    ("kaplowitz", "Kaplowitz Hangers", "Hanger supply", "W 35th St & 8th Ave", "KAPLOWITZ HANGERS · WIRE · WOOD · PLASTIC"),
    ("papadakis", "Papadakis Pelts", "Fur skins dealer", "W 29th St & 7th Ave", "PAPADAKIS PELTS · MINK · FOX · PERSIAN"),
    ("zissis", "Zissis Cold Storage", "Fur storage", "W 28th St & 8th Ave", "ZISSIS · FUR COLD STORAGE · BONDED"),
    ("velvet_moon", "The Velvet Moon", "Grindhouse cinema", "W 42nd St, 7th–8th Aves", "VELVET MOON · 3 FEATURES · CONTINUOUS · $1"),
    ("orbit", "The Orbit Lounge", "Bar", "8th Ave & W 41st St", "ORBIT LOUNGE · COCKTAILS (neon Saturn)"),
    ("mr_lucky", "Mr. Lucky's Lunch", "Lunch counter", "8th Ave & W 41st St", "MR. LUCKY'S LUNCH · HOT DOGS · PAPAYA DRINK"),
    ("ostrander", "Ostrander Opticians", "Optician", "Madison Ave & E 25th St", "OSTRANDER OPTICIANS · EYES EXAMINED"),
    ("penny_lantern", "The Penny Lantern Diner", "Diner", "W 23rd St & 9th Ave", "PENNY LANTERN DINER · BREAKFAST ALL DAY"),
    ("krause", "Krause Hardware", "Hardware store (Gus's)", "6th Ave & W 31st St", "KRAUSE HARDWARE · KEYS MADE · FANS IN STOCK")]:
    biz(f"biz.{id}", name, trade, where, "Ambient shopfront for signage variety.", [sign], BATCH, story=False)
for id, name, trade, where, sign in [
    ("botanica", "Botánica San Lázaro", "Botanica (religious goods)", "8th Ave & W 25th St", "BOTÁNICA SAN LÁZARO · HIERBAS · VELAS"),
    ("bodega_25", "Bodega La Esquina", "Bodega", "8th Ave & W 25th St", "BODEGA LA ESQUINA · CAFÉ · CERVEZA FRÍA"),
    ("pawn_8th", "Eighth Avenue Loan Office", "Pawnshop", "8th Ave & W 37th St", "LOANS · 8TH AVE LOAN OFFICE · WE BUY GOLD")]:
    biz(f"biz.{id}", name, trade, where, "Ambient shopfront.", [sign], GENERIC, story=False)
for b in B:
    if b["where"].startswith("loc."):
        pass

(C / "businesses.json").write_text(json.dumps({"_note": "Invented business registry (N6). 'sign' gives the signage text for the engine. 'check' records the trademark/collision search.", "businesses": B}, ensure_ascii=False, indent=2) + "\n")
L = ["# BUSINESS_NAMES: invented business registry", "",
     "> Generated from `content/businesses.json` by `narrative/tools/build_world.py`. Don't edit by hand.",
     "> Every name is invented. Each row records the collision search done for it.",
     "> **Rejected after searching:**",
     "> - *Fun-O-Rama*: a real arcade.",
     "> - *Fifth Avenue Trust*: a real historic NYC bank.",
     "> - *Lamplight* and *Halyard Pictures*: real production companies.",
     "> - *Clarion*: a fictional paper in an existing franchise.",
     "", "| Name | Trade | Where | Sign text | Era note | Collision check |", "|---|---|---|---|---|---|"]
for b in B:
    L.append(f"| **{b['name']}** | {b['trade']} | {b['where']} | {' / '.join(b['sign'])} | {b['era']} {b['note']} | {b['check']} |")
(C / "BUSINESS_NAMES.md").write_text("\n".join(L) + "\n")

# ---------------------------------------------------------------- newspapers (one front page per in-game week)
W = []


def week(n, dfrom, dto, masthead, headline, sub, items, requires=None, real=None):
    d = {"id": f"news.w{n:02d}" + ("" if not requires else "_" + "_".join(f.split('.')[-1] for f in requires.get('all', []))),
         "week": n, "dateRange": [dfrom, dto], "masthead": masthead, "headline": headline, "subhead": sub, "items": items}
    if requires:
        d["requires"] = requires
    if real:
        d["realBackground"] = real
    W.append(d)


TK, DS = "biz.daily_ticker", "biz.evening_dispatch"
week(1, "1974-06-21", "1974-06-27", TK, "LONGEST DAY, SHORTEST FUSE", "Heat, a broke city and hotels changing hands on Broadway",
     ["City borrows again to meet payroll, comptroller warns", "SRO row: three Broadway hotels sold in a month", "Subway graffiti arrests top last year's pace"],
     real=["short-term borrowing [S3]", "graffiti arrests [S17]"])
week(2, "1974-06-28", "1974-07-04", DS, "A QUIET FOURTH IN A NERVOUS CITY", "Fireworks on the rivers; empty streets in midtown",
     ["Hudson Union asks customers to 'conserve, conserve, conserve'", "Garment makers eye the South: 'New York costs too much'", "Vacate notices at a W 31st St hotel; tenants vow to stay"],
     real=["utility conservation appeals [S15]", "runaway shops [S20]"])
week(3, "1974-07-05", "1974-07-11", TK, "FLOWER TRUCKS SLASHED ON 28TH", "Wholesalers blame 'trucking politics'; police shrug",
     ["Hudson Union: August reserves 'negative'", "Heat sends 14 to hospital in midtown", "Special Prosecutor's office: 'investigations continue'"],
     real=["the utility projected negative August reserve margins [S15]", "the Special Prosecutor's office [S2]"])
week(4, "1974-07-12", "1974-07-18", DS, "WHO OWNS THE OLD HOTELS?", "A paper trail of 'associates' and 'counsel' leads nowhere",
     ["Bryant Park: dealers back by dusk, office workers stay away", "Drug-law cases clog the courts; mandatory terms bite", "Fur trade's slow summer: 'we're storing, not selling'"],
     real=["Bryant Park's decline [S13]", "the 1973 drug laws [S14]"])
week(5, "1974-07-19", "1974-07-25", TK, "LIGHTS OUT!", "Brownout darkens Fur District; vault owners race for ice",
     ["Signals dead from 26th to 34th; cops direct traffic by flashlight", "Hudson Union: 'equipment strain, not shortage'", "Herald Square store opens its doors as a cooling centre"],
     real=["invented brownout, consistent with the projected shortfall [S15]"])
week(6, "1974-07-26", "1974-08-01", DS, "OLD SEAMAN DIES IN HOTEL HEAT", "Power was cut for 'rewiring', tenants say. Owners send flowers.",
     ["Second brownout: furrier reports vault failure, coats 'spoiled'", "Dress house quits 37th St overnight; workers find empty loft", "Heat wave to break 'by the weekend' (it doesn't)"])
week(7, "1974-08-02", "1974-08-08", TK, "CAPITAL ON THE BRINK", "Washington waits; midtown sweats",
     ["Night watchman: 'nothing missing' from Fifth Ave law office", "Hotel tenants form committee: 'We live here'", "Garment pushboys fewer every season"])
week(8, "1974-08-09", "1974-08-15", TK, "PRESIDENT RESIGNS", "Historic noon hand-over; Times Square crowds listened all night",
     ["'Who's next?' Panic in the precincts as probes widen", "Trucking combine 'for sale', sources say", "Calm at the Corwin: residents keep their radio on"],
     real=["the resignation, effective at noon on 9 Aug 1974 [S16]; never named"])
week(9, "1974-08-16", "1974-08-22", DS, "FALSE ALARM EMPTIES 31ST ST HOTEL", "Tenants walked out by neighbours; 'someone wanted us out', says committee",
     ["Fur insurance claim questioned", "Plainclothes unit 'reviewing procedures'", "Rain at last"])
week(10, "1974-08-23", "1974-08-29", TK, "TENANTS MARCH ON HERALD SQ", "Hotel residents, garment workers and florists fill Broadway",
     ["'Who owns the Tenderloin?' signs everywhere", "Store owners close for an hour 'in sympathy'", "Owner of Corwin seen walking with marchers"])
week(11, "1974-08-30", "1974-09-02", DS, "PROSECUTOR WIDENS HOTEL PROBE", "Witness to testify; lawyer's office sealed",
     ["Lieutenant suspended pending inquiry", "Hotel tenants: 'We'll believe it in court'", "Labor Day traffic"], requires={"all": ["flag.ledger_to_prosecutor"]})
week(11, "1974-08-30", "1974-09-02", DS, "THE LEDGER", "Twenty hotels, a lieutenant's boat and a lawyer who never touched cash",
     ["Page nine: the Corwin, in their own words", "Plainclothes unit disbanded", "Editor's note on a family conflict, disclosed"], requires={"all": ["flag.ledger_to_press"]})
week(11, "1974-08-30", "1974-09-02", DS, "HEAT WAVE BREAKS", "A quiet end to a long summer",
     ["Lunch-counter regular takes new stool, waitresses note", "Hotel probe 'stalls'", "Labor Day traffic"], requires={"all": ["flag.ledger_kept"]})
week(11, "1974-08-30", "1974-09-02", DS, "HOTELS SOLD FOR 'CONVERSION'", "Investors close on Broadway portfolio",
     ["Tenants given thirty days", "Boiler fire at W 31st St hotel, no injuries", "Labor Day traffic"], requires={"all": ["flag.ledger_burned"]})
week(12, "1974-10-01", "1974-10-01", TK, "CITY FACES $1.5 BILLION GAP", "Mayor's plan: cuts, freezes, and 'shared sacrifice'",
     ["Furs back in season on 30th St", "Corwin Hotel: see page 3", "Subway fare 'safe through winter'"], real=["the budget gap reported from Oct 1974 [S3]"])
# ---- 26 Nov rework: combat-era stories and the economy page (daily number, results, classifieds)
COMBAT_NEWS = {1: "Night clerk foils stick-up at W 31st St hotel (M1)", 2: "Shots on Eighth Ave on the Fourth; two men flee into Penn Station (M9)",
               3: "Dawn brawl among the palms on 28th St (M10)", 4: "Robbers routed at a fur vault on 30th St (M14)",
               5: "Looters rush ice truck in brownout (M15)", 6: "Gunfire as furrier's truck is hijacked (M18)",
               7: "Freight-stair scuffle at Fifth Ave law office (M21)", 8: "Chase beneath Herald Square: woman escapes through old passage (M23)",
               9: "Shootout on W 35th St; ex-sergeant unhurt (M25)", 10: "March scuffle: hired men routed by tenants (M28)", 11: "Labor Day: running fight ends at the Flatiron (M32)"}
import random
rng = random.Random(1974)
FIGHTERS = ["'Iron' Eddie Mallory", "Benny 'The Bell' Okoro", "Ray 'Sailor' Dempster", "Luis 'Cha-Cha' Ortiz"]
for pg in W:
    wk = pg["week"]
    if wk in COMBAT_NEWS:
        text, _, ref = COMBAT_NEWS[wk].rpartition(" (")
        if text not in pg["items"]:
            pg["items"] = [text] + pg["items"]
        pg["missionRefs"] = [ref.rstrip(")")]
    a, b = rng.sample(FIGHTERS, 2)
    pg["economy"] = {"dailyNumber": f"{rng.randint(0, 999):03d}",
                     "raceResults": f"Belmar Downs (invented): {rng.choice(['Sodium Light', 'Night Desk', 'Brass Token', 'Tar Beach', 'Hydrant Mambo'])} wins the {rng.choice(['third', 'fifth', 'seventh'])} at {rng.randint(3, 12)}-1",
                     "fightCard": f"Garden: {a} vs {b}",
                     "prices": {"subway": "35\u00a2", "paper": "15\u00a2", "coffee": "20\u00a2", "rye_bottle": "$4.50"},
                     "classifieds": "cars.json listings; businesses for sale (economy.json); rooms by the week"}
(C / "newspapers.json").write_text(json.dumps({"_note": "One front page per in-game week (N6), plus the epilogue. Ending-dependent pages carry 'requires'. Real background is never attributed to a named person.", "pages": W}, ensure_ascii=False, indent=2) + "\n")
print(len(B), "businesses;", len(W), "front pages")
