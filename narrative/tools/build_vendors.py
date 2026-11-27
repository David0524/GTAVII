#!/usr/bin/env python3
"""Street vendors (docs/briefs/STREET_VENDORS.md, user decision 27 Nov 2026: "Just realized we're absolutely going to need
street vendors."). Narrative owns names, cart/umbrella copy, menus and price boards (1974 money), barks, side content and
image prompts. All brands invented. Adults only (content rule).
Writes content/vendors.json, content/barks/vendor_calls.json (via build_barks pool format) and assets/prompts/sources/vendors.json."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
C = ROOT / "content"

# Brands: name, cart type, umbrella/cart copy, check
BRANDS = [
 {"id": "brand.big_cyrus", "name": "Big Cyrus Franks", "type": "hot_dog", "umbrella": "BIG CYRUS · FRANKS · SODA",
  "umbrellaLook": "yellow and red stripes", "cart": "BIG CYRUS FRANKS · HOT · KRAUT · ONIONS",
  "check": "cleared: exact-name search (Nov 2026), none found. Rejected 'Ferraro's Franks' (a real New Haven frank maker)."},
 {"id": "brand.dominick_red_hots", "name": "Dominick's Red Hots", "type": "hot_dog", "umbrella": "DOMINICK'S · RED HOTS",
  "umbrellaLook": "blue and white stripes", "cart": "DOMINICK'S RED HOTS · SINCE 1951", "check": "batch name; not searched (weak); recheck pre-ship"},
 {"id": "brand.peppys", "name": "Peppy's Pretzels", "type": "pretzel_knish", "umbrella": "PEPPY'S · HOT PRETZELS · KNISHES",
  "umbrellaLook": "green and cream", "cart": "PEPPY'S · SALT OR NO SALT", "check": "cleared: exact-name search (Nov 2026), none found"},
 {"id": "brand.mama_lucchese", "name": "Mama Lucchese Italian Ices", "type": "italian_ice", "umbrella": "MAMA LUCCHESE · ITALIAN ICES",
  "umbrellaLook": "red, white and green", "cart": "LEMON · CHERRY · RAINBOW · PAPER CUPS", "check": "cleared: exact-name search (Nov 2026), none found"},
 {"id": "brand.hot_nuts_harry", "name": "Hot Nuts Harry", "type": "nut_roaster", "umbrella": None, "umbrellaLook": None,
  "cart": "HONEY ROASTED · CASHEWS · PEANUTS · ALMONDS", "check": "descriptive nickname; not searched (weak)"},
 {"id": "brand.sunrise_cart", "name": "Sunrise Coffee & Roll", "type": "coffee_cart", "umbrella": "SUNRISE · COFFEE & ROLL",
  "umbrellaLook": "orange", "cart": "COFFEE 20¢ · BUTTERED ROLL 15¢ · DANISH 30¢", "check": "generic descriptive; not searched (weak)"},
]
# 1974 prices: sources are period norms (NYC street food, cigarettes ~60¢ a pack with city tax). Narrative's best estimate; recheck in sensitivity/period read.
MENUS = {
 "hot_dog": [("Frank", "35¢"), ("Frank with kraut or onions", "40¢"), ("Soda", "25¢"), ("Knish", "40¢")],
 "pretzel_knish": [("Hot pretzel", "25¢"), ("Two pretzels", "45¢"), ("Potato knish", "40¢"), ("Kasha knish", "45¢")],
 "italian_ice": [("Small ice", "25¢"), ("Large ice", "40¢"), ("Rainbow (three flavours)", "50¢")],
 "nut_roaster": [("Cashews, bag", "75¢"), ("Peanuts, bag", "50¢"), ("Almonds, bag", "75¢")],
 "coffee_cart": [("Coffee", "20¢"), ("Buttered roll", "15¢"), ("Danish", "30¢"), ("Tea", "15¢")],
 "fruit_stand": [("Apple", "15¢"), ("Peach", "20¢"), ("Banana", "10¢"), ("Bag of cherries", "60¢")],
 "flower_stand": [("Carnation", "25¢"), ("Bunch of daisies", "$1.00"), ("A dozen roses", "$6.00")],
 "newsstand": [("Daily Ticker", "15¢"), ("Manhattan Evening Dispatch", "15¢"), ("Cigarettes, pack", "60¢"), ("Candy bar", "15¢"), ("Gum", "10¢")],
 "shoeshine": [("Shine", "50¢"), ("Shine and tip", "75¢")],
 "peddler": [("Umbrella (rain only)", "$2.00"), ("Sunglasses", "$3.00"), ("'Gold' watch", "$10.00"), ("8-track tape (no label)", "$2.00"), ("Souvenir pennant", "$1.00")],
}
VENDORS = [
 {"type": "hot_dog", "brands": ["brand.big_cyrus", "brand.dominick_red_hots"], "where": "hotspot corners, park edges, Herald Sq, Penn, the Deuce", "hours": ["10:00", "22:00"], "health": 10},
 {"type": "pretzel_knish", "brands": ["brand.peppys"], "where": "subway mouths, Bryant Park edge, Grand Central entrances", "hours": ["09:00", "20:00"], "health": 8},
 {"type": "italian_ice", "brands": ["brand.mama_lucchese"], "where": "park edges, Chelsea, the hydrant streets (summer only)", "hours": ["12:00", "21:00"], "stamina": 10},
 {"type": "nut_roaster", "brands": ["brand.hot_nuts_harry"], "where": "Times Sq, 34th St, theatre corners", "hours": ["11:00", "23:00"], "health": 5},
 {"type": "coffee_cart", "brands": ["brand.sunrise_cart"], "where": "Garment District at dawn (7th Ave, 36th–39th St), Flower District", "hours": ["05:00", "10:00"], "stamina": 15},
 {"type": "fruit_stand", "brands": [], "where": "corner grocers' sidewalk displays (9th Ave, Chelsea)", "hours": ["07:00", "20:00"], "health": 5},
 {"type": "flower_stand", "brands": [], "where": "Grand Central concourse, Penn, Madison Sq; Moretti's corner in the Flower District", "hours": ["08:00", "19:00"]},
 {"type": "newsstand", "brands": [], "where": "subway mouths, every major corner; Grand Central and Penn kiosks", "hours": ["05:00", "23:00"]},
 {"type": "shoeshine", "brands": [], "where": "Penn, Grand Central, hotel lobbies; Earl's stand on the Deuce", "hours": ["07:00", "20:00"]},
 {"type": "peddler", "brands": [], "where": "Times Sq, 34th St, Penn; umbrellas appear only when it rains", "hours": ["10:00", "22:00"],
  "note": "Souvenirs use a period pennant slogan, 'NEW YORK · SEE IT TO BELIEVE IT'. The famous heart slogan is 1977 and real, so it's anachronistic and never used."},
 {"type": "monte", "brands": [], "where": "the Deuce, Times Sq, 34th St near Lacy's", "hours": ["11:00", "23:00"],
  "note": "A crew: dealer, two shills and a lookout. They scatter when a cop appears (sim). Rigged unless the player catches the trick (gameplay). See side.monte."},
]

pool_lines = [
 ("hot_dog", "calling", "Hot dogs! Hot dogs here! Red hot and still warm!"),
 ("hot_dog", "calling", "Franks! Kraut, onions, the works! Thirty-five cents!"),
 ("hot_dog", "wry", "Mustard's free. Advice is a nickel."),
 ("hot_dog", "annoyed", "Don't lean on the umbrella, it's older than you."),
 ("pretzel", "calling", "Pretzels! Hot pretzels! Salt or no salt!"),
 ("pretzel", "calling", "Knishes! Potato, kasha! Hot like your mother made!"),
 ("pretzel", "wry", "A pretzel's a meal if you believe in yourself."),
 ("ice", "calling", "Ices! Lemon ice! Cherry! Cold, cold, cold!"),
 ("ice", "cheerful", "Rainbow's fifty cents. Three flavours, one heat wave."),
 ("nuts", "calling", "Hot nuts! Honey roasted! Smell that? That's free!"),
 ("nuts", "wry", "Cashews, seventy-five. Peanuts, fifty. The smell, on the house."),
 ("coffee", "brisk", "Coffee, regular! Roll and butter! Keep it moving!"),
 ("coffee", "brisk", "Regular means milk and sugar, pal. This is New York."),
 ("fruit", "calling", "Peaches! Jersey peaches! Sweet as a lie!"),
 ("flowers", "gentle", "Carnation for your lapel, sir? Twenty-five cents for a better day."),
 ("news", "calling", "Ticker! Dispatch! Get your Ticker! It's all in there!"),
 ("news", "wry", "Read it here, you buy it. This ain't the library."),
 ("shine", "calling", "Shine, mister? Fifty cents. Walk out new."),
 ("peddler", "low", "Watches. Gold. Practically gold. Twenty-two karat for ten bucks."),
 ("peddler", "calling", "Umbrellas! Two dollars! It's raining, you need me!"),
 ("peddler", "low", "Sunglasses, three bucks. Look like a movie star. A cheap one."),
 ("monte", "patter", "Find the lady, find the lady! Follow the red, win the bread!"),
 ("monte", "patter", "Easy money! Watch close! Who's got a sharp eye today?"),
 ("monte", "alarmed", "Cops! Fold it! Fold it, go, go!"),
 ("any", "furious", "Hey! You hit my cart! That's my whole day on the street!"),
 ("any", "scared", "Get down! Get behind the cart! Get down!"),
 ("any", "angry", "Watch where you're driving, you maniac! I got a permit!"),
 ("any", "weary", "Permit's on the cart, officer. Same permit as yesterday."),
 ("any", "wry", "Business is like the weather. It's terrible and I'm still out here."),
 ("any", "grumbling", "Somebody's selling on my corner again. Thirty years, my corner."),
 ("any", "low", "Ten a week, they want now. Ten a week to stand on a sidewalk."),
]

SIDE = [
 # (id, title, leads, acts, objectives, rewards text, money, durationMin, heat, where, systems, mobile, rank)
 ("vendor_tipsters", "The Sidewalk Wire", ["any"], [1, 2, 3], [
   {"id": "o1", "type": "goto", "text": "Big Cyrus's cart, 34th & Seventh", "to": "W 34th St & 7th Ave", "radius": 20},
   {"id": "o2", "type": "dialogue", "text": "Buy a frank. Ask what he's seen.", "script": "dlg.side_vendor_tipsters_1"},
   {"id": "o3", "type": "goto", "text": "Peppy's cart, Bryant Park, 42nd St", "to": "W 42nd St & 6th Ave", "radius": 20},
   {"id": "o4", "type": "dialogue", "text": "Peppy trades a tip for a favour", "script": "dlg.side_vendor_tipsters_2"}],
  "Tips: vendors reveal hidden places and tell you which corners are hot (heat hints on the minimap)", 0, 12, 0,
  "Hot-dog and pretzel carts across Midtown", ["dialogue", "minimap hints", "relationships"], "No timers; tips refresh weekly.", 56),
 ("cart_racket", "Ten a Week", ["char.teddy_arce", "char.delphine_moore"], [2, 3], [
   {"id": "o1", "type": "goto", "text": "Mama Lucchese's cart, 23rd & Eighth", "to": "W 23rd St & 8th Ave", "radius": 20},
   {"id": "o2", "type": "dialogue", "text": "She pays ten a week. To whom?", "script": "dlg.side_cart_racket_1"},
   {"id": "o3", "type": "follow", "text": "Follow the collector down Eighth", "target": "npc.stickup_man", "keepWithinM": 60},
   {"id": "o4", "type": "combat", "mode": "takedown", "text": "Stop the shakedown, 26th & Eighth", "targets": [{"archetype": "npc.stickup_man", "count": 2}], "nonLethalAllowed": True},
   {"id": "o5", "type": "dialogue", "text": "Tell the carts they're free. For now.", "script": "dlg.side_cart_racket_2", "requireNoHeat": True}],
  "The carts on Eighth stop paying; free food from the vendors there", 300, 18, 2,
  "Eighth Ave, 23rd–30th St", ["follow", "combat (takedown)", "witness system"], "Takedown is non-lethal-friendly; no precise aim.", 57),
 ("permit_fight", "Whose Corner Is It?", ["any"], [1, 2, 3], [
   {"id": "o1", "type": "goto", "text": "Herald Sq: two carts, one corner", "to": "W 34th St & 6th Ave", "radius": 20},
   {"id": "o2", "type": "dialogue", "text": "Settle it: permit, seniority or cash", "script": "dlg.side_permit_fight_1"},
   {"id": "o3", "type": "goto", "text": "Licence office clerk, 31st & Eighth", "to": "W 31st St & 8th Ave", "radius": 20, "note": "Only if the player chose the licence office (dlg.side_permit_fight_1 l_permit)."},
   {"id": "o4", "type": "dialogue", "text": "The corner's settled", "script": "dlg.side_permit_fight_2"}],
  "Whoever you back gives you free food; the other sulks", 50, 10, 0,
  "Herald Square, 34th & Sixth", ["dialogue choice", "relationships"], "No timers.", 58),
]


def write():
    (C / "vendors.json").write_text(json.dumps({
        "_note": "Street vendors (STREET_VENDORS.md). Narrative: brands, cart/umbrella copy, menus and price boards in 1974 money, side content. All brands invented; adults only. Sim places them, Gameplay prices consumables from 'menus' (health/stamina from 'vendors').",
        "brands": BRANDS, "menus": {k: [{"item": i, "price": p} for i, p in v] for k, v in MENUS.items()}, "vendors": VENDORS}, ensure_ascii=False, indent=2) + "\n")
    (C / "barks" / "vendor_calls.json").write_text(json.dumps({"id": "barks.vendor_calls", "core": False,
        "note": "Vendor calls and reactions (context = vendor type, or 'any'). Adults only. 1974 prices match content/vendors.json.",
        "lines": [{"context": c, "emotion": e, "text": t} for c, e, t in pool_lines]}, ensure_ascii=False, indent=2) + "\n")
    for sid, title, leads, acts, objs, rtxt, money, dur, heat, where, systems, mobile, rank in SIDE:
        sp = {"id": f"mission.side_{sid}", "kind": "side", "title": title, "number": None, "leads": leads, "acts": acts, "objectives": objs,
              "fail": [], "checkpoints": [objs[1]["id"]], "rewards": {"text": rtxt}, "where": where, "systems": systems, "mobile": mobile,
              "rank": rank, "slice": False}
        (C / "side" / f"{sid}.json").write_text(json.dumps(sp, ensure_ascii=False, indent=2) + "\n")
    # image prompts
    R = ("Manhattan, 1974. Photorealistic texture, flat and frontal, evenly lit with no strong shadows, no perspective. "
         "No people, no logos other than the exact text given, no modern materials. Muted, slightly sun-faded 1970s colour.")
    E = []
    for b in BRANDS:
        k = b["id"].split(".", 1)[1]
        if b["umbrella"]:
            E.append({"id": f"vendor.{k}.umbrella", "file": f"vendor_{k}_umbrella.png", "owner": "narrative",
                      "use": f"{b['name']}: cart umbrella panel (tiled around the umbrella)", "aspect": "2:1", "size": "2048×1024", "sizeFinal": False,
                      "prompt": f"Create one flat panel of a street-vendor cart umbrella in {b['umbrellaLook']} canvas stripes, unrolled flat, with lettering along the scalloped edge. {R} EXACT TEXT: \"{b['umbrella']}\". Render these characters only, spelled exactly, with no other words or numbers anywhere. Aspect ratio 2:1.",
                      "text": b["umbrella"], "textPolicy": "exact", "accept": ["text letter-perfect", "no real brand", "flat panel, no umbrella frame"], "priority": 2})
        E.append({"id": f"vendor.{k}.cart", "file": f"vendor_{k}_cart.png", "owner": "narrative",
                  "use": f"{b['name']}: cart side panel", "aspect": "3:1", "size": "3072×1024", "sizeFinal": False,
                  "prompt": f"Create the flat side panel of a 1970s stainless-steel New York street-food cart with hand-painted sign-writer lettering, a little dented and greasy. {R} EXACT TEXT: \"{b['cart']}\". Render these characters only, spelled exactly, with no other words or numbers anywhere. Aspect ratio 3:1.",
                  "text": b["cart"], "textPolicy": "exact", "accept": ["text letter-perfect", "no real brand", "frontal"], "priority": 2})
    E.append({"id": "vendor.price_board", "file": "vendor_price_board.png", "owner": "narrative", "use": "Generic cart price board (the renderer sets the prices from vendors.json)",
              "aspect": "3:4", "size": "768×1024", "sizeFinal": False,
              "prompt": f"Create a small black-painted price board with a white chalk-line border and EMPTY rows for prices, hung from a street cart. {R} NO TEXT AT ALL: no letters, numbers or symbols that read as writing. Aspect ratio 3:4.",
              "text": None, "textPolicy": "none", "accept": ["no legible text", "rows empty"], "priority": 2})
    E.append({"id": "vendor.pennant", "file": "vendor_pennant.png", "owner": "narrative", "use": "Peddler's souvenir pennant (period slogan, not the 1977 heart slogan)",
              "aspect": "3:1", "size": "1536×512", "sizeFinal": False,
              "prompt": f"Create a flat felt souvenir pennant, triangular, red with white felt letters and a simple skyline silhouette (no real building logos). {R} EXACT TEXT: \"NEW YORK · SEE IT TO BELIEVE IT\". Render these characters only, spelled exactly, with no other words or numbers anywhere. Aspect ratio 3:1.",
              "text": "NEW YORK · SEE IT TO BELIEVE IT", "textPolicy": "exact", "accept": ["text letter-perfect", "no heart symbol", "no real logo"], "priority": 3})
    (ROOT / "assets" / "prompts" / "sources" / "vendors.json").write_text(json.dumps(E, ensure_ascii=False, indent=2) + "\n")
    print(len(BRANDS), "brands;", len(VENDORS), "vendor types;", len(pool_lines), "calls;", len(SIDE), "side;", len(E), "prompts")


if __name__ == "__main__":
    write()
    import side_pay  # noqa: E402,F401  (re-applies payouts, durationMin and heat to the new side specs)
