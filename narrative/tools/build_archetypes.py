#!/usr/bin/env python3
"""Authoring source for content/npc_archetypes/*.json (N5). Contract shape from NARRATIVE_BRIEF.md:
id, behaviour, palette, wardrobe, props, schedule, density, barks. Extras: 'scripted' for
story-only roles, 'note'. Wardrobe is 1974-plausible, with no real brands or logos."""
import json
from pathlib import Path
OUT = Path(__file__).resolve().parents[2] / "content" / "npc_archetypes"
OUT.mkdir(parents=True, exist_ok=True)
DAY = [{"from": "07:00", "to": "19:00", "area": "{area}", "activity": "work"}]
A = []
def a(id, beh, pal, ward, props, sched, dday, dnight, barks, scripted=False, note=""):
    A.append({"id": id, "behaviour": beh, "palette": pal, "wardrobe": ward, "props": props, "schedule": sched,
              "density": {"day": dday, "night": dnight}, "barks": barks, "scripted": scripted, "note": note})
def s(*rows): return [{"from": f, "to": t, "area": ar, "activity": ac} for f, t, ar, ac in rows]

GARMENT = "Garment District (W 35th–40th, 6th–9th Aves)"
a("npc.garment_pushboy", "worker", ["#D2691E", "#F5F5DC", "#2F4F4F"], "T-shirt or short-sleeve work shirt, canvas apron, jeans or work trousers, high-tops or work boots, cap.",
  ["garment rack", "hand truck"], s(("07:00", "18:00", GARMENT, "work")), 0.6, 0.05, "barks.garment")
a("npc.garment_cutter", "worker", ["#FFFFFF", "#708090", "#8B4513"], "White short-sleeve shirt, grey trousers, tape measure round the neck, sleeve garters on older men.",
  ["tape measure", "paper pattern roll"], s(("07:30", "16:30", GARMENT, "work"), ("12:00", "12:45", "7th Ave lunch counters", "eat")), 0.3, 0.02, "barks.garment")
a("npc.fur_worker", "worker", ["#F5F5F5", "#8B7D6B", "#2F4F4F"], "White work smock dusted with fur, flat cap, grey trousers. Older Greek-American and Jewish craftsmen, younger Greek arrivals.",
  ["pelts over the shoulder", "garment bag"], s(("07:00", "15:30", "Fur District (W 27th–30th, 6th–8th Aves)", "work")), 0.3, 0.02, "barks.garment")
a("npc.sro_resident", "loiterer", ["#708090", "#F5DEB3", "#556B2F"], "Older men in undershirts and suspenders, cardigans despite heat; women in house dresses; a few younger mothers placed by welfare.",
  ["folding chair", "paper bag", "transistor radio"], s(("08:00", "21:00", "SRO hotel lobbies and stoops (Broadway & Fifth, 28th–32nd; 8th Ave)", "socialize")), 0.4, 0.15, "barks.sro")
a("npc.strip_worker", "loiterer", ["#8B0000", "#F5DEB3", "#000000", "#FF69B4"], "Period street clothes: wrap dresses, halters with slacks, denim, platform sandals, light jackets at dawn. Mixed ages (all adults) and backgrounds. Content rule: never costume, never sexualised framing.",
  ["shoulder bag", "cigarette", "umbrella"], s(("20:00", "04:00", "8th Ave, W 37th–42nd St", "work")), 0.0, 0.35, "barks.strip",
  note="Adults only. Background mix must vary (N2 critique). Camera rule: never leering.")
a("npc.club_waitress", "commuter", ["#FFFFFF", "#4682B4", "#000000"], "Diner waitress uniform under a light coat after shift.", ["handbag"],
  s(("06:00", "15:00", "8th Ave diners", "work")), 0.1, 0.05, "barks.service", note="A club member (Walk Her Home); not a sex worker.")
a("npc.club_newcomer", "walker", ["#FFE4E1", "#696969"], "A young woman (adult) in a cheap summer dress, one suitcase.", ["suitcase"],
  s(("18:00", "02:00", "8th Ave & W 41st St (bus terminal)", "loiter")), 0.0, 0.02, "barks.strip", scripted=True,
  note="New arrival the club looks after (Walk Her Home). Adult; written as protected, not prey.")
a("npc.beat_cop", "beat_cop", ["#1C2541", "#FFFFFF", "#000000"], "NYPD-style summer patrol uniform, short sleeves, eight-point cap, nightstick, whistle (generic insignia, no real patches).",
  ["nightstick", "memo book", "whistle"], s(("00:00", "24:00", "Fixed posts: Herald Sq, Penn Station, Times Square, Madison Sq", "work")), 0.15, 0.1, "barks.beat_cop")
a("npc.plainclothes", "loiterer", ["#7F1D1D", "#D9C9A3", "#FFFFFF"], "Knit polos or open-collar shirts, windbreakers or leather car coats, slacks, white sneakers (the giveaway), aviator sunglasses at night.",
  ["unmarked sedan keys", "rolled newspaper"], s(("19:00", "03:00", "8th Ave, the Deuce, Bryant Park", "work")), 0.0, 0.08, "barks.plainclothes",
  note="Act 2 density +50% (N3 §7).")
a("npc.off_duty_cop", "loiterer", ["#556B2F", "#F5F5DC", "#2B2B2B"], "Sport shirt, slacks, crepe-soled shoes, a short haircut that says cop.", ["beer glass"],
  s(("16:00", "02:00", "The Shamrock Rail and nearby bars", "drink")), 0.05, 0.1, "barks.plainclothes")
a("npc.office_lunch_crowd", "commuter", ["#2F4F4F", "#FFFFFF", "#8B4513", "#B0C4DE"], "Men in short-sleeve dress shirts and wide ties, jackets over arms; women in A-line dresses, shirtwaists, pantsuits.",
  ["briefcase", "newspaper", "paper lunch bag"], s(("08:00", "18:00", "Fifth Ave, Madison Sq, Herald Sq, Madison Ave", "work"), ("12:00", "13:30", "lunch counters", "eat")), 0.7, 0.05, "barks.office")
a("npc.lunch_counter_regular", "loiterer", ["#FFFFFF", "#000080"], "Office clothes, a hat on the next stool.", ["coffee cup"],
  s(("11:30", "14:30", "Lunch counters (Herald Sq store, Fifth Ave)", "eat")), 0.3, 0.0, "barks.office")
a("npc.trade_dinner_guest", "loiterer", ["#000000", "#FFFFFF", "#DAA520"], "Dinner jackets and cocktail dresses, period formal.", ["cocktail glass"],
  s(("19:00", "23:00", "Hotel Pennsylvanian ballroom", "socialize")), 0.0, 0.2, "barks.office", scripted=True)
a("npc.deuce_crowd", "walker", ["#FF4500", "#2F2F2F", "#FFD700", "#4B0082"], "The whole city in one block: sailors on leave, students, drifters, couples, hustlers (implied), office workers cutting through. Flares, denim, leisure suits.",
  ["hot dog", "movie ticket"], s(("10:00", "04:00", "W 42nd St (7th–8th Aves), Times Square", "loiter")), 0.6, 0.6, "barks.deuce")
a("npc.arcade_patron", "loiterer", ["#2F2F2F", "#FF8C00"], "Young men in T-shirts and jackets; old men in fedoras.", ["roll of quarters"],
  s(("12:00", "03:00", "Arcades on 42nd St and 8th Ave", "loiter")), 0.3, 0.4, "barks.deuce")
a("npc.hotel_bar_regular", "loiterer", ["#800000", "#F5F5DC"], "Business shirts gone limp; a few women in going-out dresses.", ["highball glass"],
  s(("17:00", "02:00", "Hotel bars (the Arden, the Pennsylvania)", "drink")), 0.1, 0.3, "barks.deuce")
a("npc.bus_terminal_crowd", "commuter", ["#696969", "#F5DEB3", "#1E90FF"], "Travellers with suitcases, soldiers, families from out of town.", ["suitcase", "duffel"],
  s(("00:00", "24:00", "8th Ave & W 40th–42nd St", "commute")), 0.5, 0.3, "barks.commuter")
a("npc.evening_commuter", "commuter", ["#2F4F4F", "#C0C0C0"], "Office clothes, jacket over the shoulder, folded paper.", ["newspaper", "briefcase"],
  s(("16:30", "20:00", "Broadway, 7th Ave, Penn Station approaches", "commute")), 0.5, 0.2, "barks.commuter")
a("npc.rain_pedestrian", "walker", ["#2F4F4F", "#F0E68C", "#000000"], "Raincoats, plastic rain bonnets, newspapers over heads, umbrellas that turn inside out.", ["umbrella", "newspaper"],
  s(("00:00", "24:00", "Anywhere (rain weather only)", "commute")), 0.4, 0.2, "barks.commuter")
a("npc.penn_porter", "worker", ["#B22222", "#000000"], "Red cap, porter's jacket.", ["luggage cart"],
  s(("06:00", "23:00", "Penn Station concourse", "work")), 0.2, 0.1, "barks.service")
a("npc.shopper", "walker", ["#FF6347", "#FFFACD", "#4682B4"], "Summer dresses, shopping bags, sun hats, tourists' cameras.", ["shopping bags"],
  s(("10:00", "19:00", "Herald Square, 34th St", "errand")), 0.7, 0.05, "barks.shopper")
a("npc.holiday_stroller", "walker", ["#FF0000", "#FFFFFF", "#0000CD"], "Holiday casual: short sleeves, sunglasses.", ["paper flag", "ice-cream cone"],
  s(("10:00", "23:00", "Anywhere (holidays: 4 Jul, Labor Day)", "socialize")), 0.3, 0.2, "barks.shopper")
a("npc.wholesaler", "vendor", ["#8B4513", "#F5F5DC", "#2F4F4F"], "Shirt sleeves, vest, cigar, keys on a chain.", ["roll-gate hook", "hand truck"],
  s(("07:00", "18:00", "Broadway wholesale strip (24th–31st St)", "work")), 0.3, 0.02, "barks.wholesaler")
a("npc.florist_wholesaler", "vendor", ["#228B22", "#FFFFFF", "#000000"], "Rubber apron, rolled sleeves, rubber boots.", ["pail", "shears", "potted palm"],
  s(("04:30", "13:00", "W 28th St, 6th–7th Aves", "work")), 0.4, 0.05, "barks.wholesaler")
a("npc.cab_driver", "driver", ["#FFD700", "#2F4F4F"], "Cabbie cap, short-sleeve plaid shirt, toothpick.", ["cab (vehicle_role.cab)"],
  s(("00:00", "24:00", "All avenues", "drive")), 0.5, 0.5, "barks.cab_driver", note="Driver archetype for ambient yellow cabs.")
a("npc.truck_driver", "driver", ["#556B2F", "#A0522D", "#FFFFFF"], "Work shirt with name patch, cap, cigarette behind ear.", ["box truck"],
  s(("05:00", "15:00", GARMENT + " and avenues", "drive")), 0.4, 0.05, "barks.truck_driver")
a("npc.flower_truck_driver", "driver", ["#228B22", "#FFFFFF"], "Green work jacket, cap.", ["flower truck"],
  s(("04:00", "09:00", "W 28th St and deliveries", "drive")), 0.1, 0.05, "barks.truck_driver")
a("npc.ice_house_worker", "worker", ["#B0C4DE", "#FFFFFF", "#000000"], "Rubber apron, heavy gloves, ice tongs.", ["ice tongs", "ice block"],
  s(("06:00", "22:00", "Ice house, W 37th St & 9th Ave", "work")), 0.05, 0.05, "barks.truck_driver")
a("npc.park_sleeper", "loiterer", ["#696969", "#8B7D6B"], "Layers despite the heat, worn shoes, a coat as a pillow.", ["paper bag", "coat"],
  s(("19:00", "08:00", "Madison Square Park, Bryant Park", "sleep")), 0.1, 0.2, "barks.park")
a("npc.park_dealer", "loiterer", ["#556B2F", "#2F2F2F"], "Army-surplus jacket, sneakers.", ["paperback"],
  s(("15:00", "04:00", "Bryant Park west terrace", "loiter")), 0.05, 0.15, "barks.park", note="No drug detail or use gameplay (content rule 6).")
a("npc.night_reader", "loiterer", ["#8B4513", "#F5DEB3"], "Cardigan, glasses, a library book.", ["book"],
  s(("09:00", "22:00", "Bryant Park benches, the Library steps", "loiter")), 0.1, 0.05, "barks.park")
a("npc.penn_south_neighbor", "loiterer", ["#2E5E4E", "#F0E6D2", "#B22222"], "House dresses, guayaberas, undershirts, slippers on the plaza.", ["domino set", "folding chair"],
  s(("09:00", "22:00", "Penn South plaza, W 23rd–29th, 8th–9th Aves", "socialize")), 0.4, 0.2, "barks.neighbor")
a("npc.hotel_bellhop", "worker", ["#800000", "#DAA520"], "Bellhop jacket with brass buttons, pillbox cap.", ["luggage cart"],
  s(("07:00", "23:00", "Hotel Pennsylvanian lobby", "work")), 0.2, 0.1, "barks.service")
a("npc.office_cleaner", "worker", ["#708090", "#FFFFFF"], "Grey work dress or coveralls.", ["mop bucket"],
  s(("19:00", "03:00", "Office buildings, Fifth Ave", "work")), 0.0, 0.1, "barks.service")
a("npc.night_watchman", "worker", ["#2F4F4F", "#C0C0C0"], "Guard uniform, cap, flashlight, time clock on a strap.", ["flashlight", "watchman's clock"],
  s(("19:00", "07:00", "Lisle's building and similar", "work")), 0.0, 0.05, "barks.service", note="M21: fixed loop shown on a radio clock.")
a("npc.bank_teller", "worker", ["#000080", "#FFFFFF"], "Neat blouse or shirt and tie, name plate.", ["rubber stamp"],
  s(("09:00", "15:00", "Ashgrove Trust", "work")), 0.1, 0.0, "barks.service")
a("npc.rental_agent", "worker", ["#556B2F", "#F5F5DC"], "Cheap suit, clip-on tie, a ring of keys.", ["ring of keys", "clipboard"],
  s(("10:00", "17:00", "W 37th St storefronts", "work")), 0.0, 0.0, "barks.office", scripted=True)
a("npc.marcher", "walker", ["#FFFFFF", "#4B0082", "#B22222"], "Sunday clothes, union T-shirts, church hats, aprons straight from work.", ["placard", "bedsheet banner", "flowers"],
  s(("10:00", "13:00", "Broadway, W 31st–34th St (23 Aug only)", "socialize")), 0.0, 0.0, "barks.marcher", scripted=True)
a("npc.radio_crowd", "loiterer", ["#696969", "#F5F5DC"], "Whoever is out on a summer night.", ["transistor radio"],
  s(("20:30", "00:30", "42nd St, Corwin lobby, bars (8 Aug only)", "socialize")), 0.0, 0.0, "barks.radio_crowd", scripted=True)
a("npc.brownout_crowd", "loiterer", ["#2F2F2F", "#F5DEB3"], "Stoop sitters, people with candles and transistor radios.", ["candle", "transistor radio"],
  s(("20:00", "03:00", "Brownout areas (power dim or off)", "socialize")), 0.0, 0.0, "barks.brownout_street", scripted=True)
a("npc.lonnie_crew", "loiterer", ["#2F2F2F", "#8B0000"], "Leather jackets, wide collars, hats.", [], s(("20:00", "04:00", "8th Ave", "loiter")), 0.0, 0.0, "barks.street_tough", scripted=True,
  note="No combat required (mobile rule). Escapes are solved by routes.")
a("npc.hired_firebug", "walker", ["#2F2F2F", "#696969"], "Work clothes, cap pulled low.", ["two cans (unlabelled)"], s(("01:00", "04:00", "W 31st St (M26 only)", "loiter")), 0.0, 0.0, None, scripted=True,
  note="M26 only. No method shown (content rule 6).")
a("npc.editor_brother_in_law", "loiterer", ["#000080", "#FFFFFF"], "An expensive blazer and a club tie.", ["cocktail glass"], s(("20:00", "23:00", "Hotel Pennsylvanian bar (M27 only)", "drink")), 0.0, 0.0, None, scripted=True)
a("npc.firefighter", "worker", ["#000000", "#FFD700", "#B22222"], "Turnout coat, helmet (generic, no real insignia).", ["axe", "hose"], s(("00:00", "24:00", "Scripted scenes only", "work")), 0.0, 0.0, "barks.emergency", scripted=True)
for pid, desc, area in [("npc.landlord_absentee", "Leisure suit, a car too nice for the block.", "W 29th St & 8th Ave"),
                        ("npc.claimant", "Neck brace by day, handball shorts by evening.", "W 26th St & 9th Ave"),
                        ("npc.fence", "Overcoat in July with pockets full of radios.", "W 39th St & 9th Ave"),
                        ("npc.bookie_runner", "Porkpie hat, racing form, quick walk.", "Penn Station cab line"),
                        ("npc.contractor", "Hard hat that's never been on a site; a clipboard.", "E 37th St & Madison Ave")]:
    a(pid, "loiterer", ["#8B4513", "#F5DEB3"], desc, [], s(("10:00", "18:00", area, "loiter")), 0.0, 0.0, "barks.deuce", scripted=True, note="Photo Jobs subject; keeps a fixed routine.")
a("npc.cab_fare_businessman", "commuter", ["#2F4F4F", "#FFFFFF"], "Suit, briefcase.", ["briefcase"], s(("18:00", "04:00", "Cab pickups", "commute")), 0.0, 0.0, "barks.cab_fare", scripted=True)
a("npc.cab_fare_tourist", "commuter", ["#FF6347", "#FFFACD"], "Sun hat, camera, map.", ["camera", "street map"], s(("18:00", "04:00", "Cab pickups", "commute")), 0.0, 0.0, "barks.cab_fare", scripted=True)
a("npc.cab_fare_night_worker", "commuter", ["#FFFFFF", "#4682B4"], "Nurse's whites under a cardigan, or a waiter's jacket.", ["handbag"], s(("18:00", "04:00", "Cab pickups", "commute")), 0.0, 0.0, "barks.cab_fare", scripted=True)
a("npc.wholesaler_gate", "vendor", ["#8B4513", "#F5DEB3"], "Shirt sleeves and vest.", ["roll-gate hook"], s(("18:00", "20:00", "Broadway wholesale strip", "work")), 0.2, 0.0, "barks.wholesaler",
  note="Variant used by the M1 overheard trigger (closing gates).")

for pid, desc, area, pal in [("npc.club_maid", "Hotel chambermaid's grey uniform and apron; a cardigan after work.", "Hotel Pennsylvanian", ["#808080", "#FFFFFF"]),
                             ("npc.club_hatcheck", "Black dress, white collar, a hat-check stub book.", "W 40th St supper clubs", ["#000000", "#FFFFFF"]),
                             ("npc.kafeneio_widow", "Black dress and cardigan, worry beads, a handbag held in both hands.", "Kafeneio Kastoria", ["#000000", "#696969"]),
                             ("npc.parish_priest", "Clerical black, a straw hat, a roof-fund envelope.", "The church on W 31st St", ["#000000", "#FFFFFF"])]:
    a(pid, "loiterer", pal, desc, [], s(("09:00", "20:00", area, "socialize")), 0.0, 0.0, None, scripted=True, note="Side-activity speaker (N5).")

for pid, desc, beh, props, note in [
    ("npc.stickup_man", "An out-of-work man in a cheap jacket with a cheap gun (adult). Desperate, not a monster.", "walker", ["street-tier handgun"], "M1 and M7 stick-ups. Can be disarmed and let go."),
    ("npc.prentiss_mover", "A 'mover' in a work shirt who doesn't move furniture.", "worker", ["dolly", "crowbar"], "M2 brawl."),
    ("npc.fare_runner", "A laid-off man in a short-sleeve shirt who bolts from the cab.", "walker", ["cash box"], "M3 chase."),
    ("npc.carrier_muscle", "Truck-driver muscle: work shirt, tyre iron.", "worker", ["tire iron"], "M4 brawl."),
    ("npc.lisle_driver", "Lisle's driver: dark suit, chauffeur's cap in his pocket, a weightlifter's neck.", "driver", ["sedan keys"], "M5 escape.")]:
    a(pid, beh, ["#2F2F2F", "#8B4513"], desc, props, s(("00:00", "24:00", "Scripted scenes only", "loiter")), 0.0, 0.0, "barks.street_tough", scripted=True, note=note)

a("npc.brownout_looter", "walker", ["#2F2F2F", "#696969"], "Opportunists in the dark (adults): T-shirts, bandanas, crowbars.", ["crowbar"], s(("20:00", "03:00", "Brownout areas", "loiter")), 0.0, 0.0, "barks.street_tough", scripted=True, note="M15 only.")
a("npc.kallis_driver", "driver", ["#FFFFF0", "#000000"], "Kallis's man in a cream sedan, sunglasses.", ["sedan"], s(("09:00", "18:00", "Fur District", "drive")), 0.0, 0.0, "barks.street_tough", scripted=True, note="M16 chase.")
a("npc.subway_rider", "commuter", ["#696969", "#F5DEB3", "#2F4F4F"], "Straphangers: office clothes, work clothes, a sleeping man, a guitar case.", ["newspaper", "strap"], s(("05:00", "01:00", "Subway platforms and cars", "commute")), 0.6, 0.2, "barks.commuter")
a("npc.token_clerk", "worker", ["#1C2541", "#FFFFFF"], "Transit clerk in a booth behind scratched glass.", ["token tray"], s(("00:00", "24:00", "Token booths", "work")), 0.1, 0.1, "barks.service")
a("npc.rat_swarm", "critter", ["#3B3B3B"], "Rats: a skittering swarm that scatters from light and footsteps. Startle, never damage.", [], s(("00:00", "24:00", "Subway passages, alleys, trash at night", "loiter")), 0.1, 0.4, None, note="User: 'Definitely should be some pigeons and rats.' Non-human ambient.")
a("npc.pigeon_flock", "critter", ["#8C8C8C", "#4B0082"], "Pigeons: flocks that burst up when you run through them.", [], s(("05:00", "21:00", "Parks, squares, ledges, rooftops", "loiter")), 0.5, 0.0, None, note="User: 'Definitely should be some pigeons and rats.' Non-human ambient.")

a("npc.film_ad", "worker", ["#000000", "#FFD700"], "Film crew first A.D.: headset, bullhorn, clipboard, sunburn.", ["bullhorn", "clipboard"], s(("16:00", "05:00", "NIGHT RATE shoot, W 41st St", "work")), 0.0, 0.1, "barks.film_pa", scripted=True)
a("npc.ticker_editor", "worker", ["#FFFFFF", "#696969"], "Tabloid night photo editor: rolled sleeves, green eyeshade, a phone in each hand.", ["phone"], s(("20:00", "06:00", "The Daily Ticker bureau, W 26th St", "work")), 0.0, 0.0, None, scripted=True)

for x in A:
    (OUT / f"{x['id'].split('.', 1)[1]}.json").write_text(json.dumps(x, ensure_ascii=False, indent=2) + "\n")
print(len(A), "archetypes")
