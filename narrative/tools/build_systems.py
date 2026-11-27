#!/usr/bin/env python3
"""Step 3 content for the Gameplay, Interiors and UI chats (26 Nov 2026):
police and precincts, service characters, items and gun registry, shops, crews, economy givers,
homes, cars, and police/combat barks. Every name is invented; checks are recorded in 'check'.
Writes content/police/*.json, content/items/*.json, content/shops.json, content/crews.json,
content/economy.json, content/homes.json, content/cars.json, content/barks/{police_radio,combat,
surrender,ambulance}.json and content/dialogue/sys_*.json."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
C = ROOT / "content"
for d in ("police", "items"):
    (C / d).mkdir(exist_ok=True)
WEAK = "batch-checked (multi-name query; weak). Re-check individually and USPTO before ship"
GEN = "generic/descriptive; low risk"


def W(path, obj):
    (C / path).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


# ------------------------------------------------------------------ precincts (invented identities on real geography)
precincts = {"_note": "Invented precincts covering the playable area (E8). Real NYPD precinct numbers and houses are not used. 'corruptibility' is 0-5 (how cheaply reports go away). 'payoffs' ties the story's pad to the bribe system: flags move corruptibility. Gameplay owns the mechanics.",
 "precincts": [
  {"id": "precinct.midtown_central", "bounds": {"streets": ["W 29th St", "W 43rd St"], "avenues": ["6th Ave", "west edge"], "edges": "north: mid-block 28th–29th St; south: mid-block 43rd–44th (map edge); east: 6th Ave centreline; west: map edge"}, "name": "Midtown Central", "house": "loc.station_house",
   "covers": "W 29th to W 43rd St, 6th Ave west to the edge (the Garment District, Penn Station, the Deuce, Eighth Ave)",
   "deskSergeant": "char.pat_kearney", "corruptibility": 4,
   "why": "Wurtz's plainclothes 'conditions' unit works out of here. Collections are routine, and reports are cheap to lose.",
   "payoffs": [{"if": "flag.teddy_collector", "effect": "Teddy's own reports cost less to bury (he carries their envelopes)"},
               {"if": "flag.ledger_to_prosecutor", "effect": "corruptibility drops to 1 in the epilogue (unit suspended)"},
               {"if": "flag.ledger_to_press", "effect": "corruptibility drops to 2 (unit disbanded, the rest scared)"},
               {"if": "flag.ledger_kept", "effect": "corruptibility 5, but only for Teddy: the new pad"}],
   "honest": ["char.pat_kearney (won't take money; can be persuaded by relationship)", "char.luis_navarro (IA field associate)"]},
  {"id": "precinct.madison_square", "bounds": {"streets": ["south edge", "W 28th St"], "avenues": ["west edge", "east edge"], "edges": "north: mid-block 28th–29th St; south: map edge (mid-block 21st–22nd); east and west: map edges"}, "name": "Madison Square", "house": "W 24th St, 6th–7th Aves, north side",
   "covers": "W 22nd to W 29th St, the edge east to Madison (Flatiron, Madison Sq Park, the Flower and Fur Districts, Penn South)",
   "deskSergeant": "char.sgt_bauman", "corruptibility": 2,
   "why": "An old-fashioned house: the florists and furriers pay small at Christmas, but nobody organises it. Since the Commission, nervous.",
   "payoffs": [{"if": "flag.saw_surcharge", "effect": "none (informational)"}],
   "honest": ["char.sgt_bauman (takes a Christmas turkey, never cash)"]},
  {"id": "precinct.bryant_park", "bounds": {"streets": ["W 29th St", "W 43rd St"], "avenues": ["6th Ave", "east edge"], "edges": "north: mid-block 28th–29th St; south: map edge; west: 6th Ave centreline (6th Ave itself belongs to Bryant Park); east: map edge (mid-block Madison–Park)"}, "name": "Bryant Park", "house": "W 40th St, 5th–6th Aves, south side",
   "covers": "W 29th to W 43rd St, 6th Ave east to the edge (Herald Square, Fifth Ave offices, the Library, Bryant Park)",
   "deskSergeant": "char.sgt_greer", "corruptibility": 1,
   "why": "Fifth Avenue money wants a clean precinct. Bribes are expensive and risky here. Greer files everything twice.",
   "payoffs": [{"if": "flag.nick_flipped", "effect": "Nick's reports here are 'lost' (the Special Prosecutor's protection)"}],
   "honest": ["char.sgt_greer", "char.det_fisk (Internal Affairs; hunts players who bribe too often citywide)"]}],
 "reports": {"note": "Per the CORE_SYSTEMS design: witnesses run to red police call boxes; each precinct keeps reports with descriptions (lead, clothing colours, vehicle). Narrative supplies the text below.",
             "callBoxColour": "red (period police call boxes on lampposts)"}}
precincts["copKilled"] = {"note": "User: 'Fully lethal everywhere'; missions follow the genre (heat only, never a fail or branch).",
 "memory": "The precinct where an officer is killed keeps it: for the rest of the act, its corruptibility drops to 0 for the killer's description (bribes refused), patrol density doubles in its blocks, and the desk sergeant's lines turn cold.",
 "relationships": {"char.teddy_arce/char.pat_kearney": -2, "char.teddy_arce/char.luis_navarro": -2},
 "newspaper": ["COP SLAIN ON {street}", "MANHUNT FOR {description}", "'ONE OF OURS': PRECINCT MOURNS"],
 "teddyNote": "Teddy's always-available non-lethal option stays a meaningful choice: barks.cop_killed (teddy vs teddy_nonlethal), and Kearney and Navarro remember."}
W("police/precincts.json", precincts)

# ------------------------------------------------------------------ service characters (tier 'service': lighter sheets)
def svc(id, name, age, role, at, schedule, samples, visual, edges=(), note=""):
    return {"id": id, "tier": "service", "name": name, "age": age, "role": role, "at": at, "schedule": schedule,
            "speech": {"samples": samples}, "visual": visual, "edges": list(edges), "note": note}


SV = [
 svc("char.sgt_bauman", "Sgt. Leo Bauman", 54, "Desk sergeant, Madison Square precinct", "W 24th St, 6th–7th Aves",
     "08:00–16:00 desk; otherwise off map",
     ["Florists bring me carnations at Christmas. I bring them back their tickets.", "Sit. Fill out the form. Twice. We lose everything once.", "You want a favour, go to Thirty-First. Here we do paperwork."],
     "Round, bald, half-glasses, cardigan over the uniform shirt"),
 svc("char.sgt_greer", "Sgt. Thomasina “Tommie” Greer", 46, "Desk sergeant, Bryant Park precinct; one of few women sergeants", "W 40th St, 5th–6th Aves",
     "16:00–00:00 desk; otherwise off map",
     ["Put the envelope away before I have to write it down. I write everything down.", "Description says brown jacket, tall, fast. That's half the city. Sit.", "Twenty-two years. They didn't make me sergeant for being friendly."],
     "Tall, grey bun, reading glasses on a chain, immaculate uniform"),
 svc("char.det_fisk", "Det. Sgt. Orrin Fisk", 41, "Internal Affairs; can't be bought", "Roams; appears when a lead bribes too often",
     "Appears by trigger", ["I'm not here about the crime. I'm here about who you paid.", "Every envelope has a fingerprint on the inside, Mr. Arce.", "Money talks. I listen to who it's talking to."],
     "Thin, grey suit, brown shoes, notebook, never smiles", note="The honest-investigator counterweight to bribes (Gameplay heat). Never violent."),
 svc("char.maureen_kehoe", "Maureen Kehoe, Esq.", 39, "Criminal lawyer; callable from any precinct payphone", "Office W 33rd St & 7th Ave (2nd floor over a luncheonette)",
     "09:00–21:00 office; always reachable by phone (answering service at night)",
     ["Don't say anything. Not 'hello', not 'officer', not your name. I'm on my way.", "Fifty dollars now, fifty when you're out. I don't do Sundays. Today I do Sundays.", "You were walking home from church. Which church? Think of one on the way."],
     "Red hair going grey, a man's raincoat, a briefcase older than her clients", edges=[{"to": "char.teddy_arce", "kind": "former_opponent", "note": "She cross-examined him in 1969"}]),
 svc("char.albert_pruss", "Albert Pruss", 62, "Property clerk: returns impounded items and cars", "Midtown Central station house, basement window",
     "09:00–17:00", ["Sign here, here and here. The car's got a dent. It came with the dent.", "One revolver, one wallet, one shoe. Where's the other shoe? Not my problem.", "Release fee's twelve dollars. Plus storage. Storage is the expensive part."],
     "Small, sleeve garters, green eyeshade, a ledger as thick as a brick"),
 svc("char.bondsman_rizzo", "Frankie Abend, bail bondsman", 50, "Bail bondsman with a board of skips (economy giver)", "W 31st St & 8th Ave, storefront across from the Shamrock Rail",
     "10:00–02:00", ["Ten percent and your mother's wedding ring as collateral. Kidding. Mostly.", "Board's on the wall. Bring 'em in breathing, I pay full.", "Skip on me once, shame on you. Skip twice, I send Teddy."],
     "Short-sleeve shirt, loud tie, a cigar, a .38 he never draws"),
 svc("char.dr_osei", "Dr. Kwame Osei", 44, "Emergency-room surgeon at Pennington General (hospital flow)", "Pennington General Hospital, W 26th St & 9th Ave",
     "20:00–08:00 nights", ["Two bullets out, one stays. It's lucky where it is. You're lucky I'm on.", "Rest. You won't. Nobody on this ward ever does.", "Sign yourself out against advice. Everybody does that too."],
     "Tall, scrubs, half-moon glasses, Ghanaian-born, trained in London and Brooklyn"),
 svc("char.cas_wojcik", "Casimir “Cas” Wojcik", 61, "Doorman at Nick's building", "Madison Ave & E 37th St",
     "06:00–14:00 and 14:00–22:00 (alternating weeks)", ["Good morning, Mr. Varelas. A man from the bank called. Twice. I said you were swimming.", "Mrs. Varelas left early. She took the small suitcase, not the big one. That's good.", "Packages, sir. And a letter with no stamp. Somebody delivered by hand."],
     "Grey uniform with gold piping, white gloves, a moustache waxed since 1948", note="Recurring at Nick's home; a barometer of Nick's finances."),
 svc("char.dutch_galloway", "Dutch Galloway", 48, "Used-car salesman, Galloway Auto Exchange", "W 25th St & 9th Ave lot",
     "09:00–20:00", ["This one? Owned by a nun. Drove it to church. Backwards, apparently.", "Cash, I'm your friend. Credit, I'm your cousin. Nobody trusts a cousin.", "No warranty. But I'll cry with you if it breaks."],
     "Plaid jacket, white belt, pinkie ring, a straw hat with a feather"),
 svc("char.sully_garage", "Sully McNamee", 57, "Parking-garage attendant (owned-car storage)", "W 33rd St, 7th–8th Aves (Penn Garage)",
     "16:00–04:00", ["Monthly's sixty. Hourly's robbery. I don't set the prices, I just park the robbery.", "Your car's on four. Somebody tried the door. I tried his head.", "Leave the keys. I don't drive 'em. Much."],
     "Coveralls, a ticket punch, a transistor radio on the races"),
 svc("char.walter_feeney", "Walter Feeney", 63, "Information-booth clerk, Grand Central (side quest giver)", "Grand Central, the information booth under the clock",
     "07:00–19:00 in the booth; 17:40 Thursdays at the whispering arches",
     ["Track 29, five fifty-two, all stops. Don't run, sir, it's a terminal, not a racetrack.", "Every question in the world comes to this booth. Nobody asks how I am.", "Eleven years she said good night across the arch. Three Thursdays now, nothing."],
     "Grey booth jacket, a gold watch chain, half-glasses he never uses; stands perfectly still in a moving crowd."),
 svc("char.ida_lorne", "Ida Lorne", 66, "Retired switchboard operator; Feeney's Thursday voice (side quest)", "A rooming house on E 41st St (Madison–Park); Thursdays, the far corner of the arches",
     "Home with a broken ankle (offscreen until found); afterwards Thursdays 17:40 at the arches",
     ["I never once looked at his face. Eleven years. That was the arrangement.", "Tell him the ankle, not the age. Men worry about the wrong things.", "Good night, Walter. There. Say it back. Louder. The arch is old."],
     "Cardigan over a print dress, a cane she resents, a switchboard operator's precise diction."),
 svc("char.ignatz_hallisey", "Ignatz “The Commodore” Hallisey", 71, "Rooftop pigeon racer (side arc)", "Roof coop over W 29th St & 7th Ave",
     "06:00–09:00 and 17:00–20:00 on the roof; otherwise in his walk-up below",
     ["Pigeons are the only New Yorkers who always come home.", "That's Admiral Nelson. Blue bar, white band. He's smarter than the mayor.", "Somebody's stealing my champions mid-race. Over these roofs. I need young legs."],
     "Small, wiry, a captain's cap, binoculars, a feed bag, forearms freckled with old scratches", note="Pigeons (user: 'Definitely should be some pigeons'). Side arc rank 1."),
]
W("cast_service.json", {"_note": "Service-tier characters for systems (precincts, lawyer, bail, hospital, homes, cars). Lighter sheets than the main cast. Names checked for famous namesakes only.", "characters": SV})

# ------------------------------------------------------------------ items: weapons (invented makers), ammo, consumables, keys, evidence
weapons = {"_note": "Invented makers and models by tier (street / service / quality). No real makers, models or trademarks. Stats are Gameplay's; narrative gives names, period price, flavour and where it's found. No functional or instructional detail (content rule 6).",
 "makers": [{"name": n, "check": WEAK} for n in ["Hartwell Arms", "Ferrante Arms", "Lyle-Brandt", "Akers", "Mercer", "Boone", "Delacroix"]],
 "weapons": [
  {"id": "item.akers_25_vestpocket", "name": "Akers .25 “Vestpocket”", "tier": "street", "class": "pocket pistol", "price": 25, "where": ["fences", "the Deuce (street sale)"], "flavour": "Fits in a sock. Misses in a sock."},
  {"id": "item.boone_22_parlor", "name": "Boone .22 “Parlor”", "tier": "street", "class": "small revolver", "price": 30, "where": ["pawnshops"], "flavour": "Grandfather's target gun, pawned twice."},
  {"id": "item.mercer_38_pocketbook", "name": "Mercer .38 “Pocketbook”", "tier": "street", "class": "snub-nose revolver", "price": 45, "where": ["fences", "Delphine's bag (start of game)"], "flavour": "Delphine's. Five shots, short barrel, heavy for its size."},
  {"id": "item.revolver_service", "name": "Hartwell .38 “Patrolman”", "tier": "service", "class": "service revolver", "price": 110, "where": ["M7 (Mayhew returns Teddy's)", "the gun shop on W 38th St"], "flavour": "Six shots, four-inch barrel. Teddy's old service piece, oiled by Mayhew for two years."},
  {"id": "item.ferrante_12_farmhand", "name": "Ferrante 12-gauge “Farmhand”", "tier": "service", "class": "pump shotgun", "price": 95, "where": ["the gun shop", "the Carriers' garage (looted)"], "flavour": "Built for Ohio barns, sold on Ninth Avenue."},
  {"id": "item.lyle_brandt_45_commissioner", "name": "Lyle-Brandt .45 “Commissioner”", "tier": "quality", "class": "automatic pistol", "price": 210, "where": ["Lisle's security (looted)", "a fence's special order"], "flavour": "Heavy, accurate, expensive. Rich men's bodyguards carry it."},
  {"id": "item.delacroix_9_continental", "name": "Delacroix 9mm “Continental”", "tier": "quality", "class": "automatic pistol", "price": 240, "where": ["Nick's desk drawer (unloaded, since 1956)"], "flavour": "European, elegant. Nick bought it to feel like a man who'd use it."},
  {"id": "item.hartwell_30_longshot", "name": "Hartwell .30 “Longshot”", "tier": "quality", "class": "hunting rifle", "price": 160, "where": ["the gun shop (permit required)"], "flavour": "A deer rifle in a city with no deer."},
  {"id": "item.straight_razor", "name": "Straight razor", "tier": "melee", "class": "blade", "price": 4, "where": ["barber supply", "Delphine (start)"], "flavour": "Her father's, from Wilmington."},
  {"id": "item.tire_iron", "name": "Tyre iron", "tier": "melee", "class": "blunt", "price": 3, "where": ["any truck", "hardware store"]},
  {"id": "item.nightstick", "name": "Nightstick", "tier": "melee", "class": "blunt", "price": 0, "where": ["Teddy's footlocker"], "flavour": "Teddy kept it. Nobody asked for it back."},
  {"id": "item.crowbar", "name": "Crowbar", "tier": "melee", "class": "blunt/tool", "price": 4, "where": ["hardware store"], "flavour": "Opens crates and arguments."},
  {"id": "item.bat", "name": "Softball bat", "tier": "melee", "class": "blunt", "price": 6, "where": ["sporting goods", "Penn South"]}]}
W("items/weapons.json", weapons)
W("items/ammo.json", {"items": [
  {"id": "item.ammo_25", "name": ".25 cartridges (box of 50)", "price": 5}, {"id": "item.ammo_22", "name": ".22 cartridges (box of 50)", "price": 2},
  {"id": "item.ammo_38", "name": ".38 cartridges (box of 50)", "price": 7}, {"id": "item.ammo_45", "name": ".45 cartridges (box of 50)", "price": 11},
  {"id": "item.ammo_9", "name": "9mm cartridges (box of 50)", "price": 9}, {"id": "item.ammo_12ga", "name": "12-gauge shells (box of 25)", "price": 6},
  {"id": "item.ammo_30", "name": ".30 cartridges (box of 20)", "price": 8}]})
W("items/consumables.json", {"items": [
  {"id": "item.coffee", "name": "Coffee, to go", "price": 0.20, "effect": "small stamina"}, {"id": "item.diner_meal", "name": "Blue-plate special", "price": 1.75, "effect": "health"},
  {"id": "item.pie", "name": "Pie (Royal Cafeteria)", "price": 0.30, "effect": "small health"}, {"id": "item.first_aid", "name": "First-aid kit (drugstore)", "price": 3, "effect": "health, stops bleeding"},
  {"id": "item.aspirin", "name": "Aspirin tin", "price": 0.79, "effect": "steadies aim briefly"}, {"id": "item.cigarettes", "name": "Pack of cigarettes (invented brand: Harbor Lights)", "price": 0.55, "effect": "none (flavour; NPC barter)"},
  {"id": "item.beer", "name": "Beer, bar", "price": 0.50, "effect": "flavour; slight sway"}, {"id": "item.whiskey", "name": "Whiskey, shot", "price": 1.00, "effect": "flavour; sway"},
  {"id": "item.ice", "name": "Ice block (5 lb)", "price": 0.40, "effect": "heat relief; brownout activity"}, {"id": "item.candles", "name": "Candles (box)", "price": 0.60},
  {"id": "item.subway_token", "name": "Subway token", "price": 0.35}, {"id": "item.newspaper", "name": "Newspaper", "price": 0.15, "effect": "reveals map tips (discovery)"},
  {"id": "item.film_pack", "name": "Instant-camera film pack", "price": 4.50, "effect": "10 photos (Delphine)"}, {"id": "item.dime", "name": "Dime (payphone)", "price": 0.10}]})
W("items/quest.json", {"_note": "Carried quest items for activities and side quests (not weapons or evidence).", "items": [
  {"id": "item.film_reel", "name": "Film reel (1947 picture)"}, {"id": "item.flashlights", "name": "Box of flashlights"},
  {"id": "item.flower_order", "name": "Flower order (Moretti)"}, {"id": "item.garment_racks", "name": "Garment racks"},
  {"id": "item.ice_candles", "name": "Ice and candles (brownout relief)"}, {"id": "item.money_order", "name": "Postal money order"},
  {"id": "item.paper_bundle", "name": "Newspaper bundle (bulldog edition)"}, {"id": "item.slips", "name": "Numbers slips"},
  {"id": "item.purse", "name": "Stolen purse"}, {"id": "item.lifted_wallet", "name": "A commuter's lifted wallet"}, {"id": "item.champion_pigeon", "name": "A banded champion pigeon in a shoebox"}, {"id": "item.stored_coat", "name": "Customer's stored fur coat"},
  {"id": "item.telegram", "name": "Telegram"}, {"id": "item.vehicle", "name": "A car on the Dukes' list (the car itself; Gameplay delivers vehicles)"},
  {"id": "item.wanted_goods", "name": "Marty's want-list goods (radio, camera, fur)"}, {"id": "item.water", "name": "Water cans"},
  {"id": "item.ice", "name": "Ice block"}]})
W("items/keys.json", {"items": [
  {"id": "item.corwin_master_keys", "name": "Corwin master key ring", "opens": "every Corwin room, roof, basement; Teddy's 'Keys' special"},
  {"id": "item.arden_service_key", "name": "Arden service-door key", "opens": "the Arden back stairs and boiler room (from Marcus)"},
  {"id": "item.varelas_vault_key", "name": "Vault wheel combination card", "opens": "Varelas & Co. vaults"},
  {"id": "item.locker_418_key", "name": "Penn Station locker 418 key", "opens": "Wurtz's locker (M27)"},
  {"id": "item.passage_gate_key", "name": "33rd St passage gate key", "opens": "the shuttered gate in the old passage (side content)"},
  {"id": "item.car_keys_owned", "name": "Car keys (owned car)", "opens": "a car the lead owns (cars.json)"}]})
W("items/evidence.json", {"items": [
  {"id": "item.photo_lisle_counter", "name": "Photo: Lisle at the counter"}, {"id": "item.photo_lisle_mayhew", "name": "Photo: Lisle and Mayhew, Pennsylvania lobby"},
  {"id": "item.print_brannock_1", "name": "Print: Brannock takes an envelope"}, {"id": "item.print_brannock_2", "name": "Print: Brannock at Earl's stand"},
  {"id": "item.print_wurtz_ricky", "name": "Print: Wurtz with Ricky"}, {"id": "item.print_wurtz_nick", "name": "Print: Wurtz takes Nick's cut"},
  {"id": "item.print_editor_lisle", "name": "Print: the editor's brother-in-law with Lisle"}, {"id": "item.ledger", "name": "The ledger (or its copy)"},
  {"id": "item.marjorie_carbons", "name": "Marjorie Kell's carbons"}, {"id": "item.kearney_list", "name": "Kearney's Christmas list, 1969–71"},
  {"id": "item.collection_list_week1", "name": "Mayhew's collection list"}, {"id": "item.club_shoebox", "name": "The club's shoebox"}, {"id": "item.club_cash", "name": "Club dues (cash)"},
  {"id": "item.feld_sample_racks", "name": "Feld sample racks"}, {"id": "item.feld_sample_bags", "name": "Feld sample bags"}, {"id": "item.fur_bales", "name": "Bales of furs"},
  {"id": "item.ice_order", "name": "Ice order"}, {"id": "item.club_payout_claudette", "name": "Claudette's payout"}, {"id": "item.hollis_postcard", "name": "One of Walter Hollis's postcards (20 to find)"}]})

# ------------------------------------------------------------------ shops (1974 prices)
shops = {"_note": "Shops and 1974 prices (narrative content; Gameplay builds the shop flow). Prices are plausible for mid-1974 New York.", "shops": [
  {"id": "shop.royal_cafeteria", "biz": "biz.royal_cafeteria", "type": "diner", "sells": ["item.coffee", "item.pie", "item.diner_meal"]},
  {"id": "shop.fifth_ave_luncheonette", "biz": "biz.fifth_ave_luncheonette", "type": "diner", "sells": ["item.coffee", "item.diner_meal"], "menu": ["Tuna on rye 85¢", "Egg cream 35¢"]},
  {"id": "shop.penny_lantern", "biz": "biz.penny_lantern", "type": "diner", "sells": ["item.coffee", "item.diner_meal"]},
  {"id": "shop.baxter_lowe_menswear", "biz": "biz.baxter_lowe", "type": "clothing", "sells": ["suit $65", "sport coat $38", "shirt $8", "slacks $14", "shoes $25", "hat $12", "raincoat $30"], "note": "Wardrobe changes defeat descriptions (CORE_SYSTEMS)."},
  {"id": "shop.eighth_ave_outlet", "name": "Eighth Avenue Clothing Outlet", "at": "8th Ave & W 36th St", "type": "clothing", "sells": ["windbreaker $9", "jeans $11", "T-shirt $3", "sneakers $12", "wig $15", "sunglasses $5"], "check": GEN},
  {"id": "shop.eighth_ave_loan", "biz": "biz.pawn_8th", "type": "pawn", "sells": ["item.boone_22_parlor", "watches", "radios", "item.film_pack"], "buys": ["watches", "jewellery", "radios", "cameras"]},
  {"id": "shop.krause_hardware", "biz": "biz.krause", "type": "hardware", "sells": ["item.crowbar", "item.tire_iron", "item.candles", "flashlight $3", "bolt cutters $9", "fan $16"]},
  {"id": "shop.newsstand_herald", "name": "Herald Square newsstand", "at": "W 34th St & Broadway", "type": "newsstand", "sells": ["item.newspaper", "item.cigarettes", "item.subway_token", "maps 50¢"], "check": GEN},
  {"id": "shop.drugstore_34", "name": "All-night drugstore", "at": "W 34th St & 7th Ave", "type": "drugstore", "sells": ["item.first_aid", "item.aspirin", "item.film_pack"], "check": GEN},
  {"id": "shop.liquor_9th", "name": "Ninth Avenue Wines & Liquors", "at": "W 38th St & 9th Ave", "type": "liquor", "sells": ["bottle of rye $4.50", "bottle of wine $2.50", "item.ice"], "check": GEN},
  {"id": "shop.gun_shop_38", "name": "Wexler Sporting Arms (licensed)", "at": "W 38th St & 8th Ave", "type": "guns", "sells": ["item.revolver_service", "item.ferrante_12_farmhand", "item.hartwell_30_longshot", "ammo"], "check": WEAK, "note": "A licensed dealer; New York's strict permit law is flavour (a permit card is needed)."}]}
W("shops.json", shops)

# ------------------------------------------------------------------ crews and territories (all adults; multi-ethnic; defined by trade)
W("crews.json", {"_note": "Crews and territories for Gameplay (hostility, encounters). All members are adults. Crews are defined by trade, not ethnicity (N1 rule).", "crews": [
  {"id": "crew.carriers", "name": "The Carriers' drivers", "boss": "char.augie_lomax", "territory": "Garment District, W 35th–40th St, 7th–9th Aves; the garage at W 38th & 9th", "archetypes": ["npc.carrier_muscle", "npc.truck_driver"], "hostileWhen": "Teddy steps in at the Baeks' (M4) or Moretti's sabotage is exposed", "weapons": ["item.tire_iron", "item.ferrante_12_farmhand"]},
  {"id": "crew.lonnie", "name": "Lonnie's crew", "boss": "char.lonnie_gage", "territory": "Eighth Ave, W 34th–42nd St", "archetypes": ["npc.lonnie_crew"], "hostileWhen": "always toward Delphine after M6", "weapons": ["item.akers_25_vestpocket", "item.straight_razor"]},
  {"id": "crew.dyer_dukes", "name": "The Dyer Avenue Dukes", "boss": "(invented, side content)", "territory": "The tunnel-trench blocks, W 34th–40th St near 9th Ave", "archetypes": ["npc.stickup_man"], "hostileWhen": "car-theft side content; they run the chop shop", "weapons": ["item.tire_iron", "item.boone_22_parlor"], "note": "Car thieves and the chop-shop crew (economy)."},
  {"id": "crew.lisle_security", "name": "Lisle's hired security", "boss": "char.howard_lisle (never on scene)", "territory": "Fifth Ave & W 36th St; the Broadway hotels Lisle owns", "archetypes": ["npc.lisle_driver"], "hostileWhen": "from M21 on", "weapons": ["item.lyle_brandt_45_commissioner"]},
  {"id": "crew.kallis_men", "name": "Kallis's men", "boss": "char.stavros_kallis", "territory": "Fur District, W 27th–30th St", "archetypes": ["npc.kallis_driver"], "hostileWhen": "toward Nick from M16", "weapons": ["item.tire_iron"]},
  {"id": "crew.prentiss_movers", "name": "Prentiss's 'movers'", "boss": "char.vic_prentiss", "territory": "The SRO hotels on Broadway, W 28th–32nd St", "archetypes": ["npc.prentiss_mover", "npc.hired_firebug"], "hostileWhen": "toward Teddy from M2", "weapons": ["item.crowbar"]},
  {"id": "crew.wurtz_unit", "name": "The 'conditions' unit (police)", "boss": "char.dennis_wurtz", "territory": "Eighth Ave, the Deuce, Bryant Park (Midtown Central)", "archetypes": ["npc.plainclothes"], "hostileWhen": "per story; they're police, so the Gameplay police rules apply", "note": "Not a gang: a corrupt police unit. Lethality rules are held pending the user's decision."}]})

# ------------------------------------------------------------------ economy givers (ECONOMY.md)
W("economy.json", {"_note": "Free-roam money (user: 'Make sure there's a way for players to make money aside from missions'). Narrative content for Gameplay's systems. Upgrades, not duplicates, of the side activities. Nothing gives functional instructions for crimes (rule 6).", "givers": [
  {"id": "econ.hack_fares", "who": "char.delroy_tate", "where": "loc.penn_hack_stand", "pays": "$3–7 a fare + tips", "links": "activity.cab_fares", "ladder": "Licensed hack from Act 2 if Teddy renews his licence (Maureen Kehoe can fix it): +50% fares"},
  {"id": "econ.garment_houses", "who": "char.dwayne_little", "where": "W 37th St & 7th Ave", "pays": "$15 a run", "links": "activity.garment_rush"},
  {"id": "econ.locksmith_callouts", "who": "Gus's hardware contact (Krause Hardware)", "where": "biz.krause", "pays": "$10–25 a call-out", "lead": "char.teddy_arce", "note": "Teddy's keys skill: let tenants back in, open a dead man's apartment for the family, a stuck safe."},
  {"id": "econ.photo_night_desk", "who": "The Daily Ticker night photo desk (editor 'Mac' Hollander, invented)", "where": "W 26th St & 7th Ave (the paper's midtown bureau, invented)", "pays": "$10–75 a print, more if first", "lead": "char.delphine_moore", "note": "Race the police radio to scenes (side content). No exploitation of victims: crashes, fires, arrests, celebrities-of-the-street, never the dead."},
  {"id": "econ.bail_skips", "who": "char.bondsman_rizzo", "where": "W 31st St & 8th Ave", "pays": "10% of bail ($50–500)", "note": "Board of skips with personalities (side content). Bring them in breathing."},
  {"id": "econ.fences", "who": "The Eighth Avenue Loan Office; Marty the fence (invented, W 39th & 9th)", "where": ["biz.pawn_8th", "W 39th St & 9th Ave"], "pays": "30–50% of value", "wants": "a weekly want list: watches, radios, a fur (!), cameras"},
  {"id": "econ.chop_shop", "who": "The Dyer Avenue Dukes' chop shop", "where": "W 36th St & 9th Ave (garage)", "pays": "$100–600 per car on the weekly list", "note": "Car theft is Gameplay's system; narrative gives the list and the owner, 'Cuffs' Delaney (invented)."},
  {"id": "econ.numbers", "who": "char.earl_poole", "where": "loc.poole_shine", "pays": "runner pay $10 a day; the street number is the last three digits of the track handle printed in the paper (no legal daily number until 1980)", "links": "activity.numbers_slips"},
  {"id": "econ.otb", "name": "OTB parlour (invented branch: 'Eighth Avenue Teletrack')", "where": "8th Ave & W 37th St", "pays": "bets on invented race cards", "races": ["Aqueduct-style card at 'Belmar Downs' (invented track)"], "note": "Off-track betting existed in NYC from 1971 as a public corporation; the parlour and races here are invented."},
  {"id": "econ.card_games", "where": ["Kafeneio Kastoria (tavli and cards)", "the Shamrock Rail back room (poker, cops)", "a pool hall over a W 41st St storefront (invented: Corner Pocket Billiards)"], "pays": "stake-based"},
  {"id": "econ.fight_cards", "where": "Penn Square Garden (invented fighters)", "pays": "bets; Teddy can work the door", "fighters": ["'Iron' Eddie Mallory", "Benny 'The Bell' Okoro", "Ray 'Sailor' Dempster", "Luis 'Cha-Cha' Ortiz"]},
  {"id": "econ.businesses_for_sale", "items": [
     {"name": "Hanyang House (half share)", "price": 4000, "income": "$60/week", "trouble": "Kallis's men want a cut; a health inspector wants a 'tip'"},
     {"name": "Royal Cafeteria", "price": 9000, "income": "$120/week", "trouble": "Lonnie's crew uses it; the night manager skims"},
     {"name": "Lucky Quarter Amusements", "price": 7500, "income": "$150/week", "trouble": "Wurtz's 'tax'; Bauer's debts come with it", "requires": "flag.bauer_burned"},
     {"name": "Krause Hardware", "price": 3000, "income": "$40/week", "trouble": "Prentiss's movers buy crowbars here; a fire inspector"},
     {"name": "A Ninth Avenue garage", "price": 6000, "income": "$90/week + car storage", "trouble": "the Dukes want it for the chop shop"}],
   "nick": "Nick's properties (the Corwin until M30, the W 29th St building until sold, the W 37th St storefront) pay rent and generate 'trouble' events (a burst pipe, a tenant strike, a cop's hand out)."},
  {"id": "econ.loan_shark", "who": "Augie's cousin, 'Mr. Tuesday' Calabrese (invented)", "where": "Kafeneio back table, Tuesdays", "note": "Debtors with personalities pay or don't (side content: collect, forgive, or buy the debt). Violence is optional and has consequences."}]})

# ------------------------------------------------------------------ homes (HOMES_AND_CARS.md)
W("homes.json", {"_note": "Each lead's own home (user: 'The characters should all have their own home. Apartments should match the characters.'). Portrait dressing for the Interiors chat. Sleeping per TIME.md.", "homes": [
  {"lead": "char.teddy_arce", "interior": "interior.corwin_9f", "where": "Hotel Corwin, room 9F (W 31st St, Broadway–6th Ave)",
   "why": "The job comes with the room (N1). He lives where he works: eight by ten, one window on West Thirty-First Street: the Corwin's own broken neon (HOT  CO WIN) blinks red through it all night.",
   "portrait": ["Army footlocker as a table", "academy class photo, turned face-down", "expired hack licence tucked in the mirror", "Saint Christopher on a nail", "broken window air-conditioner with a towel in it", "Carmen's tupperware, washed, never returned", "a hot plate and one pan"],
   "byAct": {"1": "the nightstick in the footlocker", "2": "the revolver in a coffee can on the shelf (after M7); collection envelopes counted on the bed", "3": "Hollis's radio on the sill (after M19); the ledger copy under the floorboard (if wire)", "epilogue": "packed (Testimony) / unchanged (Public) / a new suit on the door (New Pad) / bare (Ashes)"},
   "storyObjects": ["item.nightstick", "item.revolver_service", "item.ledger"]},
  {"lead": "char.delphine_moore", "interior": "interior.penn_south_delphine", "where": "Penn South co-op, a 7th-floor one-bedroom (W 27th St, 8th–9th Aves)",
   "why": "Bought in 1965 as an ILGWU presser, when Penn South was union housing. She kept paying the maintenance when the work went south. Dignified, separate from Eighth Ave; nobody on the strip knows. Carmen Arce lives two buildings over, and they nod in the elevator.",
   "portrait": ["the pressing iron she kept, on a shelf like a trophy", "a sewing machine with a cover she made", "a framed union card (1963)", "her mother's photo from Wilmington", "a green notebook she never writes in (decoy)", "two good dresses and five practical ones", "plants: a lot of plants"],
   "byAct": {"1": "a beauty-shop magazine open on the table", "2": "prints drying on a string over the bath (the photo file)", "3": "the lease papers (if any) on the table; Tina's hairbrush in the bathroom (if she stays)", "epilogue": "a key to W 37th St on a nail (shop) or a joint ledger with Mi-sook (kye)"},
   "storyObjects": ["item.film_pack", "item.print_brannock_1"], "note": "Club cash still lives in the Arden boiler room (Marcus), not at home. That's her rule."},
  {"lead": "char.nick_varelas", "interior": "interior.varelas_apartment", "where": "A prewar doorman building, Madison Ave & E 37th St (11th floor)",
   "why": "Grand, bought in 1968 at the top of his rise. The doorman (Cas Wojcik) is a barometer of his finances.",
   "portrait": ["a grand piano nobody plays", "Eleni's reading chair with her glasses on a ledger", "framed photos: Kastoria lake, the first shop on W 29th St, a furriers' banquet 1962", "amber worry beads on every table", "a desk with a drawer of unpaid bills", "the Delacroix 9mm in a velvet case (unloaded since 1956)", "a balcony with dead geraniums"],
   "byAct": {"2": "bank letters on the hall table; the AC rattling", "3": "a small suitcase by the door (Eleni)", "epilogue": "piano sold (sold-on) / paid bills framed as a joke (kept) / a Housing Council thank-you letter on the piano (council)"},
   "storyObjects": ["item.delacroix_9_continental"]},
  {"lead": "principal", "who": "char.carmen_arce", "interior": "interior.carmen_apartment", "where": "Penn South, W 26th St & 8th Ave", "portrait": ["sewing machine by the window", "saint candles", "Teddy's academy photo, face-up", "a pot always on the stove"]},
  {"lead": "principal", "who": "char.odessa_pruitt", "interior": "interior.corwin_floor11", "where": "Corwin room 1104", "portrait": ["a window on the Empire Estate", "church hats in boxes", "the court notice in her Bible", "a folding chair"]}]})

# ------------------------------------------------------------------ cars (HOMES_AND_CARS.md); makes come from the vehicles registry
_CARS = ({"_note": "Buying and owning cars (user: 'Should be able to buy/own cars too.'). Makes and models come from the vehicles chat's invented registry; narrative supplies sellers, prices, the insurer and the garage.", "sellers": [
  {"id": "cars.galloway", "name": "Galloway Auto Exchange", "who": "char.dutch_galloway", "where": "W 25th St & 9th Ave (open lot)", "stock": "used, $400–1,800", "quirk": "One car in five is a lemon. Dutch tells you which if your relationship with him is +2 or more.", "check": WEAK},
  {"id": "cars.park_lane_motors", "name": "Park Lane Motors", "where": "Madison Ave & E 39th St (showroom)", "stock": "new, $3,400–9,500", "quirk": "The salesman ignores Delphine until she pays cash (period commentary; she can make him regret it).", "check": WEAK},
  {"id": "cars.classifieds", "name": "Classifieds (The Daily Ticker, Sundays)", "stock": "private sellers, $250–2,500", "listings": [
     {"ad": "'Widow sells late husband's sedan, garaged, low miles. W 28th St.'", "truth": "A bargain (and a sad conversation)"},
     {"ad": "'Runs great! Must sell today! Cash only!'", "truth": "A lemon; stolen from Jersey"},
     {"ad": "'Ex-cab, new engine, yellow paint stripped.'", "truth": "Good engine, every cop pulls it over"},
     {"ad": "'Doctor's convertible, red, one owner.'", "truth": "Fine; the doctor wants to meet you at the hospital"}]}],
 "insurer": {"name": "Albemarle Casualty & Indemnity", "where": "Fifth Ave & W 33rd St (5th floor)", "policy": "$25/month; replaces a destroyed owned car once per act", "check": WEAK},
 "garages": [{"name": "Penn Garage", "who": "char.sully_garage", "where": "W 33rd St, 7th–8th Aves", "price": "$60/month", "note": "Owned cars persist here (engine E10)"},
             {"name": "Nick's building garage", "where": "Madison Ave & E 37th St", "price": "included (Nick)", "note": "Cas Wojcik has the keys"}]})
for _sl in _CARS["sellers"]: _sl["discoveryNotify"] = "toast"  # cars for sale: one map toast (user feedback 27 Nov)
W("cars.json", _CARS)

# ------------------------------------------------------------------ police / combat barks
def pool(pid, note, lines):
    W(f"barks/{pid.split('.', 1)[1]}.json", {"id": pid, "core": False, "note": note, "lines": [{"context": c, "emotion": e, "text": t} for c, e, t in lines]})


pool("barks.police_radio", "Dispatch ('Central') and car chatter: the main heat cue (CORE_SYSTEMS). Plain-English period style; no real call signs. {placeholders} are filled by Gameplay from the witness description.", [
 ("report", "flat", "Central to Midtown Central cars: a report of shots fired, {street} and {avenue}."),
 ("report", "flat", "Central to Madison Square cars: assault in progress, {street} near {avenue}."),
 ("report", "flat", "Central to Bryant Park cars: a car theft, {street} and {avenue}. Check it out."),
 ("description", "flat", "Suspect: {sex}, {build}, {topColor} {top}, last seen {direction} on {street}."),
 ("description", "flat", "Vehicle: {carColor} {carType}, partial plate {plate}, {direction} on {avenue}."),
 ("description", "flat", "Witness: {sex}, {topColor} {top}, carrying a {item}. Use caution."),
 ("description_vague", "flat", "Description's vague, Central. A woman, dark coat. That's all we've got."),
 ("description_vague", "wry", "Witness says 'a guy'. Just 'a guy'. Thanks, Central."),
 ("description_teddy", "flat", "Witness says he looked like a cop. Walked like a cop. Says he's no cop."),
 ("description_nick", "flat", "Heavy-set male, expensive suit, grey hair, big black sedan. Real memorable."),
 ("escalate", "urgent", "Central to all cars: officer down, {street} and {avenue}. All units respond."),
 ("escalate", "urgent", "Central, we need a second car. Suspect is armed."),
 ("search", "flat", "Car one-four, canvass the block. Check the doorways and the subway."),
 ("search", "flat", "Nothing on Eighth, Central. Lot of people. Lot of coats."),
 ("lost", "weary", "Central, we lost him at the station. Too many exits."),
 ("lost", "flat", "Suspect is gone, Central. Resuming patrol."),
 ("cooldown", "flat", "Central, cancel that. Complainant isn't sure what she saw."),
 ("bribe_heard", "low", "Car eight, never mind that report. Sergeant says it's handled."),
 ("brownout", "urgent", "Central to all cars: signals dark from Twenty-Sixth to Thirty-Fourth. Watch the crossings."),
 ("idle", "flat", "Central, car six, out of service for coffee. Ten minutes."),
 ("idle", "wry", "Central, any word on overtime? …Never mind."),
 ("idle", "flat", "Central to Midtown Central: hydrant open again, Thirty-Seventh and Ninth."),
 ("heat1", "flat", "Central to Midtown Central: a disturbance, {street} and {avenue}. One car."),
 ("heat1", "flat", "Central: a complaint of a man acting suspicious, {street}. Take a look when you can."),
 ("heat2", "flat", "Central to Midtown Central cars: suspect wanted for {crime}, last seen {street}."),
 ("heat2", "flat", "Car one-four to Central: we'll swing by {avenue}. Ten-four."),
 ("heat3", "urgent", "Central to all Midtown cars: armed suspect, {street} and {avenue}. Approach with caution."),
 ("heat3", "urgent", "Central, car nine: we're setting up on {avenue}. Need another car on the corner."),
 ("heat4", "urgent", "Central to all cars: shots fired at officers, {street}. Every car in the sector."),
 ("heat4", "urgent", "Central: sawhorses at {avenue} and {street}. Nobody in or out."),
 ("heat5", "urgent", "Central to all precincts, all units: Midtown is closed. Every car. Every man."),
 ("heat5", "grave", "Central: the captain's on the air. Find this one. I don't care how."),
 ("pursuit_foot", "breathless", "Car six, on foot! He's going {direction} on {street}! Over the fence!"),
 ("pursuit_foot", "breathless", "Central, I lost him on the roofs. He's up top somewhere. Send a car to {street}."),
 ("pursuit_car", "urgent", "Car eleven in pursuit, {carColor} {carType}, {direction} on {avenue}! Clear the crossings!"),
 ("pursuit_car", "urgent", "He went the wrong way on {street}! Wrong way! Central, warn the sector!"),
 ("responding", "flat", "Car one-four responding. Two minutes."),
 ("responding", "flat", "Car nine, on our way. We're stuck behind a bus on {avenue}."),
 ("responding", "wry", "Car three, responding. If the car starts."),
 ("ack", "flat", "Central, ten-four."),
 ("ack", "flat", "Ten-four, Central. On it."),
 ("all_clear", "flat", "Central to Midtown Central: cancel the alarm on {street}. Suspect not located."),
 ("all_clear", "weary", "Central, show us back in service. Nothing doing."),
 ("shift", "flat", "Central, all cars: four-to-midnight tour coming on. Look alive."),
 ("brownout", "urgent", "Central to all cars: Hudson Union says an hour. Treat every crossing as a stop."),
 ("brownout", "flat", "Central, car six: the lights are out at {avenue}. We're directing traffic by hand."),
 ("hot", "urgent", "Central to all units: keep this channel clear. Emergency traffic only. Clear the air."),
 ("hot", "breathless", "Car nine, on {avenue}, coming up on the scene now. Two minutes."),
 ("hot", "breathless", "Car one-four, we're on {street}. We got the corner. Nobody's leaving."),
 ("hot", "grave", "This is the sergeant. I'm taking the air. Every car, give me your position."),
 ("hot", "urgent", "Central: ambulance is rolling. Cars on {avenue}, clear them a lane."),
 ("hot", "grave", "Sergeant to all cars: you see him, you call it in. You don't go alone. Understood?")])
pool("barks.cop_killed", "Consequences of killing a police officer (user: 'Fully lethal everywhere'). Heat is Gameplay's; this is flavour. Teddy's lines are a meaningful contrast with his always-available non-lethal option.", [
 ("radio", "urgent", "Central to all cars: officer down, {street} and {avenue}. All units. All units."),
 ("radio", "grave", "Central, the officer is not breathing. Repeat: not breathing."),
 ("radio", "cold", "All precincts: shooter of a police officer. Description follows. Use extreme caution."),
 ("radio", "grave", "Central to all cars: a moment of silence on the air for car one-four. …Back to work."),
 ("teddy", "shaken", "(Teddy) I wore that uniform. Eight years. God forgive me."),
 ("teddy", "hollow", "(Teddy) Some kid from Bay Ridge. He had a mother. Everybody's got a mother."),
 ("teddy", "cold", "(Teddy) Kearney will hear about this before I'm off the block."),
 ("teddy_nonlethal", "relieved", "(Teddy) Down, not dead. Cuffs on his own wrist. He'll go home tonight."),
 ("teddy_nonlethal", "dry", "(Teddy) Old habits. You don't shoot a man you'd have bought coffee for."),
 ("delphine", "cold", "(Delphine) Rule twenty-one: they'll never stop looking now. Never."),
 ("nick", "panicked", "(Nick) I'm a furrier! I'm a furrier! What have I done?"),
 ("street", "shocked", "They shot a cop. On Eighth Avenue. They shot a cop."),
 ("street", "low", "Get inside. Every cop in the city is coming here.")])

pool("barks.route_calls", "No-GPS route call-outs (goto.routeCalledBy). Every voice covers left/right x {street}/{avenue} (UI test tests/ui-route.test.ts). The HUD prints the computed turn; a voiced line plays only if its direction and slot match.", [
 ("fare", "brisk", "Left on {street}."), ("fare", "brisk", "Right on {street}, then straight."), ("fare", "brisk", "Hang a left on {avenue}."), ("fare", "brisk", "Right on {avenue}. Keep going."),
 ("fare", "relieved", "Here. Right here. Pull over."), ("fare", "annoyed", "You missed it! Go around the block. {street}'s one way."),
 ("fare_tourist", "nervous", "The map says left? On, um, {street}?"), ("fare_tourist", "nervous", "Right on {street}, I think. Is that a street or an avenue?"),
 ("fare_tourist", "unsure", "Left onto {avenue}? The book says it's very long."), ("fare_tourist", "excited", "Right on {avenue}! Look, honey, the big one!"),
 ("fare_tourist", "happy", "Oh! That's it! That's the building!"),
 ("cabbie", "easy", "Hang a left on {street}, kid."), ("cabbie", "easy", "Right on {street}. Easy. Mind the hydrant."), ("cabbie", "easy", "Left on {avenue}. Faster than it looks."),
 ("cabbie", "easy", "Swing right on {avenue}. Ride the lights."), ("cabbie", "wry", "Broadway does what it wants. Stay on {avenue}."),
 ("cabbie", "easy", "Pull up by the hydrant. Nobody tickets a hack at the hydrant."),
 ("labour", "strained", "Left. On {street}. Hurry. Please hurry."), ("labour", "strained", "Right on {street}! Right! Don't brake so hard!"),
 ("labour", "strained", "Left on {avenue}. Breathe. Breathe and drive."), ("labour", "strained", "Right on {avenue}. Pennington's on Ninth. Go!"),
 ("odessa", "steady", "Slowly, Mr. Arce. Left at {street}. I'm in no hurry. You are."), ("odessa", "steady", "Right on {street}. Mind the old man on the corner. That's me in ten years."),
 ("odessa", "steady", "Left onto {avenue}, if you please."), ("odessa", "dry", "Right on {avenue}. Gently. I'm not a sack of laundry."),
 ("delphine", "brisk", "Left on {street}. Rule nine: never the obvious way."), ("delphine", "brisk", "Right on {street}. Quick, before the light."),
 ("delphine", "cool", "Left on {avenue}. Nobody watches the left."), ("delphine", "brisk", "Rule nine: never take {avenue} after midnight. Right on it anyway."),
 ("nick", "expansive", "Left on {street}! I own a building on this block, I should know."), ("nick", "expansive", "Right on {street}. My first shop was here. Smaller than this car."),
 ("nick", "expansive", "Left on {avenue}! No, here! Yes, here!"), ("nick", "expansive", "Right on {avenue}. Everybody gets paid on {avenue}.")])

_pr = json.loads((C / "barks" / "police_radio.json").read_text())
_DISP = {"report", "description", "escalate", "cooldown", "brownout", "idle", "heat1", "heat2", "heat3", "heat4", "heat5", "all_clear", "shift", "bribe_heard"}
for _l in _pr["lines"]:
    _t = _l["text"]
    _l["voice"] = "dispatcher" if _t.startswith(("Central to", "Central:")) or _l["context"] in ("description", "shift") else ("sergeant" if _t.startswith(("This is the sergeant", "Sergeant to")) else "car")
_pr["audio"] = {"filter": "1970s police two-way radio: band-limited 300-3000 Hz, squelch tail, light static; dispatcher slightly cleaner than cars",
                "voices": {"sergeant": "one older adult voice, gravel, slow; the hot tier only (audio may map to the car urgent register)", "dispatcher": "one adult voice, calm, flat, fast, Midtown Central dispatch", "car": "several adult patrol voices, rotating; breathless on foot, louder in pursuit"},
                "tiers": "heat1-heat5 map to Gameplay heat levels; escalate and cop_killed take over at 'officer down'; 'hot' plays in the 90 s after officer down (band clears, cars check in, a sergeant takes the air)",
                "slots": {"street": "numbered cross streets 21st-45th, spoken ('Thirty-Fourth')", "avenue": "Fifth, Sixth, Seventh, Eighth, Ninth, Madison, Park, Lexington, Broadway",
                          "direction": ["uptown", "downtown", "east", "west"], "crime": ["a robbery", "an assault", "a car theft", "shots fired", "a hit-and-run"],
                          "sex": ["male", "female"], "build": ["thin", "heavy-set", "medium build", "tall", "short"],
                          "topColor": ["dark", "light", "tan", "red", "blue", "green", "brown", "white"], "top": ["jacket", "coat", "shirt", "windbreaker", "dress", "suit"],
                          "carColor": ["black", "white", "green", "brown", "maroon", "yellow", "blue"], "carType": ["sedan", "cab", "coupe", "wagon", "van", "truck"],
                          "item": ["bag", "briefcase", "camera", "package", "suitcase"], "plate": "spoken letters and digits, e.g. 'K-L-four'"},
                "renderNote": "For build-time voices: render each line's fixed parts once and concatenate slot words (slot lists above); or render the most common filled variants."}
(C / "barks" / "police_radio.json").write_text(json.dumps(_pr, ensure_ascii=False, indent=2) + "\n")
_rc = json.loads((C / "barks" / "route_calls.json").read_text())
_rc["voiceByPassenger"] = {"npc.cab_fare_businessman": "fare", "npc.cab_fare_night_worker": "fare", "npc.cab_fare_tourist": "fare_tourist",
    "npc.cab_driver": "cabbie", "char.delroy_tate": "cabbie", "char.odessa_pruitt": "odessa", "char.delphine_moore": "delphine",
    "char.nick_varelas": "nick", "side.baby_cab": "labour", "default": "fare"}
_rc["voiceNote"] = "Keyed by the passenger's cast id. 'side.baby_cab' overrides to 'labour' for that quest only. Leads riding as passengers in another lead's car use their own voice."
W("barks/route_calls.json", _rc)

pool("barks.combat", "Generic enemy and ally combat barks (crews, stick-up men, security). No slurs.", [
 ("spot", "alert", "There! That's him!"), ("spot", "angry", "That's the one from Eighth Avenue!"), ("spot", "cold", "Lonnie said you'd come this way."),
 ("cover", "urgent", "Get down! Behind the car!"), ("cover", "urgent", "He's got a piece! Cover!"), ("flank", "urgent", "Go around! Take the alley!"),
 ("reload", "urgent", "I'm empty! Cover me!"), ("hurt", "pained", "I'm hit! I'm hit!"), ("hurt", "pained", "My leg! Ah, my leg!"),
 ("retreat", "panicked", "Forget it! It's not worth it! Go!"), ("retreat", "panicked", "Cops are coming! Scatter!"), ("taunt", "cocky", "That all you got, old man?"),
 ("taunt", "cocky", "Come on out, collector! Bring the envelope!"), ("disarmed", "shocked", "Hey! That's my— Okay. Okay."), ("down_nonlethal", "groaning", "Uhh… nobody pays me enough for this."),
 ("ally_delphine", "cold", "Rule twenty: don't miss."), ("ally_teddy", "flat", "Drop it. Drop it and walk away."), ("ally_nick", "panicked", "I'm paying you men! Do something!")])
pool("barks.surrender", "Surrender and arrest lines (player-side and NPC-side).", [
 ("npc_surrender", "panicked", "Okay! Okay! I give up! Don't shoot!"), ("npc_surrender", "tired", "Fine. You win. Can I keep my hat?"),
 ("npc_surrender", "scared", "I got kids! I got kids in Queens!"), ("npc_surrender", "bitter", "Go ahead. Call the cops. They work for Wurtz anyway."),
 ("player_arrest_teddy", "tired", "I know the drill, officer. Hands on the car."), ("player_arrest_teddy", "dry", "Tell Kearney I said hello."),
 ("player_arrest_delphine", "cold", "Cuff me gentle. These wrists earn a living."), ("player_arrest_delphine", "dry", "Brannock's badge says married. Yours?"),
 ("player_arrest_nick", "indignant", "Do you know who I am? …That's a no. Call my lawyer."), ("player_arrest_nick", "tired", "Everybody gets paid, officer. Name your number."),
 ("cop_arrest", "flat", "Hands where I can see them!"), ("cop_arrest", "flat", "You're under arrest. Don't make it worse.")])
pool("barks.ambulance", "Ambulance attendants and the ER (hospital flow).", [
 ("arrive", "brisk", "Make room! Make room! Who's hurt?"), ("arrive", "weary", "Third shooting tonight. Third. Okay, on the stretcher."),
 ("treat", "calm", "Stay with me. Look at me. What's your name?"), ("treat", "brisk", "Pressure here. Hold it. Harder."),
 ("transport", "urgent", "Pennington General! Go, go!"), ("transport", "calm", "Ten minutes to the hospital. You'll make it. You're too stubborn not to."),
 ("er", "brisk", "Bay four. Get Dr. Osei."), ("discharge", "dry", "You're out. Hospital bill's in the envelope. Don't come back. You'll come back."),
 ("heat", "weary", "Heatstroke on the third floor. The old men are dropping like flies in this."), ("brownout", "urgent", "Generator's on! Generator's on! Keep bagging!")])

# ------------------------------------------------------------------ bail-out dialogue (each directed pair of leads)
LEADS = {"t": "char.teddy_arce", "d": "char.delphine_moore", "n": "char.nick_varelas"}
BAIL = {
 ("t", "d"): [("t", "dry", "Rule one, Delphine. Don't get caught."), ("d", "cold", "That's my rule, collector. Pay the man and walk me out."), ("t", "warm", "Paid. You owe me a pie.")],
 ("t", "n"): [("t", "flat", "Mr. Varelas. In a cell. In a suit."), ("n", "tired", "Everybody gets paid. Apparently today it's you."), ("t", "dry", "I'll put it on the Corwin's tab.")],
 ("d", "t"): [("d", "dry", "Officer Arce, back behind bars. The wrong side this time."), ("t", "tired", "Don't. Just sign."), ("d", "warm", "Signed. Rule six: nobody gives money back. Remember?")],
 ("d", "n"): [("d", "cool", "Mr. Varelas. The landlord, in the lockup. I'll want a discount on rent."), ("n", "humble", "You'll have it. And my gratitude, which is cheaper."), ("d", "dry", "I'll take the discount.")],
 ("n", "t"): [("n", "charming", "Teodoro! I paid the sergeant. He was very reasonable. Too reasonable."), ("t", "cold", "That's the problem with you, Nick. Everybody's reasonable."), ("n", "dry", "You're welcome.")],
 ("n", "d"): [("n", "warm", "Miss Moore. Bail and a car. I'll drive you to the Arden."), ("d", "cool", "Penn South. I don't sleep where I work."), ("n", "surprised", "…Neither do I, it turns out. Penn South.")]}
for (a, b), lines in BAIL.items():
    d = {"id": f"dlg.sys_bail_{a}_{b}", "context": f"Bail-out: {LEADS[a]} bails out {LEADS[b]} at a precinct desk (CORE_SYSTEMS arrest flow). Remembered: relationship +1 both ways.",
         "lines": [{"id": f"l{i + 1}", "speaker": LEADS[s], "emotion": e, "text": t} for i, (s, e, t) in enumerate(lines)]}
    d["lines"][-1]["setRelationships"] = {f"{LEADS[a]}/{LEADS[b]}": 1, f"{LEADS[b]}/{LEADS[a]}": 1}
    (C / "dialogue" / f"sys_bail_{a}_{b}.json").write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n")
for k, lead in LEADS.items():
    d = {"id": f"dlg.sys_lawyer_{k}", "context": f"Arrested {lead} calls Maureen Kehoe from the precinct payphone.",
         "lines": [{"id": "l1", "speaker": "char.maureen_kehoe", "emotion": "brisk", "text": "Kehoe. Don't say anything. Not even 'hello'. Which precinct?"},
                   {"id": "l2", "speaker": lead, "emotion": "tired", "text": {"t": "Midtown Central. Kearney's desk. He's pretending not to know me.", "d": "Thirty-First Street. Brannock's here, grinning.", "n": "I don't know. One with a very rude sergeant."}[k]},
                   {"id": "l3", "speaker": "char.maureen_kehoe", "emotion": "dry", "text": "Fifty now, fifty when you're out. Sit. Look bored. I'll be there in twenty."}]}
    (C / "dialogue" / f"sys_lawyer_{k}.json").write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n")
print("systems content written")
