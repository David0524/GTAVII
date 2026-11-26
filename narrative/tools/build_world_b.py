#!/usr/bin/env python3
"""Authoring source for N6 part 2: radio, graffiti and posters, overheard subway-grating talk,
and interior dressing per act. All names, songs, artists and films are invented.
Writes content/radio.json, content/street_text.json, content/interior_dressing.json,
content/dialogue/amb_grate_*.json and content/triggers/grate_*.json."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
C = ROOT / "content"

# ------------------------------------------------------------------ radio
radio = {"_note": "Invented stations with no call letters or dial frequencies (real NYC frequencies all belong to real stations). Every song and artist is invented. DJ lines are 90 characters or fewer, and each one also appears as an '(Radio)' subtitle.",
 "stations": [
  {"id": "radio.night_owl", "name": "Night Owl Radio", "format": "Soul, Philly-style strings and the first disco mixes, midnight to six",
   "period": "Disco was emerging from NYC and Philadelphia clubs in 1974 [S19].",
   "dj": {"name": "Vernon “Velvet” Gale", "voice": "Low, unhurried, talks to night-shift workers by trade"},
   "patter": [
     {"text": "Night Owl Radio. Cabbies, nurses, night desks: this one's for you."},
     {"text": "Ninety-one degrees at two a.m. I'm not complaining. I'm reporting."},
     {"text": "To the man behind the glass on Thirty-First: you know who you are. Stay awake, brother."},
     {"text": "Lights out on the West Side? Turn me up. Batteries are cheaper than heartbreak.", "context": "brownout"},
     {"text": "Tonight we're not playing records for a while. Tonight we listen to the man in Washington.", "date": "1974-08-08"},
     {"text": "Four a.m. Pie at the Royal, coffee at the Penn Station counter. I'll meet you in the song."},
     {"text": "Something new from a club downtown. Mixed long, so you dance till sunrise."},
     {"text": "Night Owl Radio. If you're up, you're family."}],
   "songs": [
     {"title": "Sodium Light Serenade", "artist": "The Marquee Five"}, {"title": "Don't Let the Meter Run", "artist": "Lorraine Pettaway"},
     {"title": "Night Desk Blues", "artist": "Calvin Rook & the Midnights"}, {"title": "Four A.M. Pie", "artist": "Sister Vee"},
     {"title": "Long Mix for a Short Summer", "artist": "The Velour Strings"}, {"title": "Steam From the Street", "artist": "Darnell Coates"},
     {"title": "Keep the Change, Baby", "artist": "The Glass Elevators"}, {"title": "Brownout Love", "artist": "Gloria Mae Trent"}]},
  {"id": "radio.caribe", "name": "Radio Caribe Nueva York", "format": "Salsa, boogaloo, bolero, bilingual",
   "period": "Salsa was at a creative peak in early-1970s New York [S19].",
   "dj": {"name": "Ramón “El Tigre” Ferrer", "voice": "Fast, bilingual, shout-outs to blocks and bodegas"},
   "patter": [
     {"text": "¡Radio Caribe Nueva York! From the Bronx to Penn South, ¡todo el mundo a bailar!"},
     {"text": "Saludos to the ladies at the machines on Thirty-Seventh. Forty years. ¡Respeto!"},
     {"text": "Hydrant's open on Twenty-Seventh. Kids are happy. Turn it up for the kids."},
     {"text": "Se fue la luz on the West Side. Radio Caribe on batteries. ¡No se apaga!", "context": "brownout"},
     {"text": "From Mayagüez to Manhattan, this bolero is for every mother who fed us. Mamá, te quiero."},
     {"text": "March on Herald Square Friday. Bring your flag, bring your chair, bring your abuela.", "dateRange": ["1974-08-19", "1974-08-23"]},
     {"text": "Radio Caribe. Second hour. The trombones are coming. Step back."}],
   "songs": [
     {"title": "Calle Treinta y Uno", "artist": "Orquesta Brisa Nueva"}, {"title": "El Hombre del Sobre", "artist": "Tito Almeyda y su Conjunto"},
     {"title": "Boogaloo en la Ocho", "artist": "Los Hermanos Quintero"}, {"title": "Máquina de Coser", "artist": "Celia Rubio"},
     {"title": "Bolero para Carmen", "artist": "Trio Malecón"}, {"title": "Hydrant Mambo", "artist": "Johnny Pabón Sextet"},
     {"title": "La Ciudad Sin Plata", "artist": "Orquesta Brisa Nueva"}, {"title": "Trombones in the Heat", "artist": "Los Hermanos Quintero"}]},
  {"id": "radio.hourly", "name": "The Hourly", "format": "All-news and talk; headlines track the weekly front pages",
   "dj": {"name": "Harold Vance (anchor) and a rotating 'Man on the Street'", "voice": "Clipped, worried, municipal"},
   "patter": [
     {"text": "The Hourly. The city's borrowing again. The comptroller says, quote, 'again.'"},
     {"text": "Hudson Union asks you to set your air-conditioner to seventy-eight. Or off."},
     {"text": "Traffic: Thirty-Seventh is a parking lot. Thirty-Seventh is always a parking lot."},
     {"text": "Signals are dark from Twenty-Sixth to Thirty-Fourth. Treat every crossing as a stop.", "context": "brownout"},
     {"text": "We interrupt: the President will address the nation from the White House at nine.", "date": "1974-08-08"},
     {"text": "Tenants and workers are expected on Broadway this morning. Avoid Herald Square till one.", "date": "1974-08-23"},
     {"text": "The Hourly. Weather: hot. Tomorrow: hotter. Your rent: higher."}],
   "songs": []},
  {"id": "radio.easy", "name": "Easy Seventy", "format": "Easy listening and standards (Nick's car radio)",
   "dj": {"name": "Gil Ormsby", "voice": "Smooth and avuncular; restaurant recommendations"},
   "patter": [
     {"text": "Easy Seventy. Strings for the drive home, wherever home is tonight."},
     {"text": "A gentleman never hurries. Especially on Seventh Avenue at five o'clock."},
     {"text": "Storm warnings for this evening. Close the sunroof, sir."},
     {"text": "Power's out downtown, they tell me. Our generator thanks you for listening.", "context": "brownout"},
     {"text": "For the furriers' banquet at the Pennsylvania tonight: something cool."}],
   "songs": [
     {"title": "Moonlight Over Madison Square", "artist": "The Percy Lyle Orchestra"}, {"title": "A Coat for October", "artist": "Della Fairmont"},
     {"title": "Sunroof", "artist": "The Ormsby Strings"}, {"title": "Penthouse Waltz", "artist": "The Percy Lyle Orchestra"},
     {"title": "Thirtieth Street Rain", "artist": "Della Fairmont"}, {"title": "Everybody Gets Paid", "artist": "Monty Carvell"}]}]}

# ------------------------------------------------------------------ graffiti and posters
street = {"_note": "Graffiti tags (invented writers; real 1970s writers' tags avoided), slogans by act, posters and handbills. Placement is by area; the engine picks walls.",
 "tags": [{"tag": t, "style": s, "areas": a} for t, s, a in [
   ("RIZO 147", "subway-car tag, bubble letters", ["subway cars", "W 34th St station"]), ("NOVA 33", "marker, tall letters", ["8th Ave", "Penn Station"]),
   ("KITO 29", "spray, arrow tails", ["W 28th–29th Sts", "roll gates"]), ("LUZ 106", "small and neat, a star over the Z", ["Penn South", "W 26th St"]),
   ("TOMBO 52", "big outline", ["W 30s near 9th Ave", "W 30s near 10th"]), ("SPIN 8", "drips", ["8th Ave", "the Deuce"]),
   ("DOC GREEN", "one colour, green", ["Bryant Park", "6th Ave"]), ("MOTOR 1", "fast tag", ["truck doors", "Garment District"])]],
 "slogans": [
   {"act": 1, "text": "BUY A COP A COFFEE (THEY CAN'T)", "where": "Station-house block, chalk", "note": "A joke about the post-Commission era, half scrubbed."},
   {"act": 1, "text": "CITY BROKE — WE KNEW", "where": "Broadway hoardings"},
   {"act": 1, "text": "VOTE (torn)", "where": "Old 1973 campaign posters, faded and unreadable"},
   {"act": 2, "text": "WE LIVE HERE", "where": "Corwin windows, other SROs", "requires": {"all": ["flag.vacate_notices"]}},
   {"act": 2, "text": "NO VACATE", "where": "SRO doors on Broadway"},
   {"act": 2, "text": "LIGHTS OUT — RENT STILL DUE", "where": "W 28th–34th Sts after a brownout"},
   {"act": 2, "text": "WALTER HOLLIS 1900–1974 SHIPMATE", "where": "Corwin lobby window, hand-painted", "requires": {"all": ["flag.hollis_dead"]}},
   {"act": 3, "text": "WHO OWNS THE TENDERLOIN?", "where": "Stencils from Broadway to 8th Ave"},
   {"act": 3, "text": "WE STAYED UP", "where": "Corwin bedsheet banner", "requires": {"all": ["flag.arson_stopped"]}},
   {"act": 3, "text": "FELD OWES US", "where": "W 37th St loft door", "requires": {"all": ["flag.feld_left"]}, "note": "Painted by the operators."},
   {"act": "epilogue", "text": "CORWIN STAYS", "where": "Corwin facade banner", "requires": {"any": ["flag.corwin_to_council", "flag.corwin_kept"]}},
   {"act": "epilogue", "text": "FOR CONVERSION — LUXURY RESIDENCES", "where": "Hoardings on the Corwin", "requires": {"all": ["flag.corwin_sold_on"]}},
   {"act": "epilogue", "text": "PAGE NINE", "where": "Stencil, all over midtown", "requires": {"all": ["flag.ledger_to_press"]}}],
 "posters": [
   {"title": "TENANTS' MEETING — CORWIN LOBBY — SUNDAY 7 P.M. — BRING A CHAIR", "acts": [1, 2, 3], "where": "Corwin, Broadway SROs"},
   {"title": "THE LOCAL — OPERATORS' MEETING — SEVERANCE IS A RIGHT", "acts": [2, 3], "where": "Garment District lampposts"},
   {"title": "OPEN CALL! KETTLE & CRANE PICTURES SEEKS 'NEW YORK FACES' FOR NIGHT RATE", "acts": [1, 2], "where": "Hell's Kitchen, 8th Ave"},
   {"title": "VELVET MOON: 'FIST OF THE PAPER TIGER' · 'HOUSE OF THE WAX SAINT' · 'THUNDER OF THE SILVER FIST'", "acts": [1, 2, 3], "where": "W 42nd St marquee and one-sheets",
    "note": "Invented grindhouse titles. The engine rotates triple bills weekly."},
   {"title": "MADISON SQUARE GARDEN — FRIDAY: 'IRON' EDDIE MALLORY vs. BENNY 'THE BELL' OKORO — 10 ROUNDS", "acts": [1, 2], "where": "Penn Station, 8th Ave", "note": "Invented boxers."},
   {"title": "BLOCK PARTY — W 46TH ST — SAT & SUN — BAND, RAFFLE, FAN PRIZE", "acts": [1, 2, 3], "where": "Hell's Kitchen (matches the boundaries blocker)"},
   {"title": "CONSERVE! TURN IT OFF — HUDSON UNION", "acts": [1, 2], "where": "Subway cars, bus shelters"},
   {"title": "LOST: ORANGE CAT 'COMMISSIONER'. ANSWERS TO NOTHING. REWARD.", "acts": [1, 2, 3], "where": "Penn South lampposts"},
   {"title": "ROOF FUND — SACRED HEART AND ALL SAINTS — GIVE WHAT YOU CAN", "acts": [2, 3], "where": "W 31st St church doors"},
   {"title": "한국어 교실 — KOREAN CLASSES FOR CHILDREN — SATURDAYS — HANYANG HOUSE", "acts": [1, 2, 3], "where": "W 32nd St"},
   {"title": "ΧΟΡΟΣ — GREEK DANCE — KASTORIAN SOCIETY — AUGUST 15", "acts": [2], "where": "Fur District"},
   {"title": "ROOMS — WEEKLY — NO QUESTIONS — INQUIRE DESK", "acts": [1, 2, 3], "where": "8th Ave hotel doors"},
   {"title": "MARCH! FRIDAY AUG 23 — CORWIN TO HERALD SQ — WHO OWNS THE TENDERLOIN?", "acts": [3], "where": "Everywhere on Broadway"},
   {"title": "NOTICE — CORWIN RESIDENTIAL ASSOCIATES — 'RELOCATION ASSISTANCE AVAILABLE'", "acts": [1, 2], "where": "Corwin mailboxes", "requires": {"all": ["flag.corwin_sold"]}}]}

# ------------------------------------------------------------------ overheard subway-grating talk (ambient channel)
GRATES = [
  ("herald", "W 34th St & 6th Ave", "Herald Square subway grate. Two voices rise with the warm air.",
   [("npc.evening_commuter", "weary", "Twenty minutes in the tunnel. Lights out. Somebody sang."), ("npc.evening_commuter", "wry", "Was he good?"), ("npc.evening_commuter", "weary", "No. But it helped.")]),
  ("penn", "8th Ave & W 33rd St", "Penn Station grate. Porters on a break below.",
   [("npc.penn_porter", "low", "Garden's got a fight Friday. Tips go up on fight nights."), ("npc.penn_porter", "wry", "Tips go up. Bags go up. My back goes up.")]),
  ("deuce", "W 42nd St & 7th Ave", "42nd St grate under the marquees.",
   [("npc.deuce_crowd", "wry", "Three features for a dollar, and I slept through all three."), ("npc.deuce_crowd", "dry", "Best hotel in the city.")]),
  ("chelsea", "W 23rd St & 7th Ave", "23rd St grate near Seventh.",
   [("npc.office_lunch_crowd", "worried", "My firm's moving to Stamford. Says the city's finished."), ("npc.office_lunch_crowd", "dry", "The city's been finished since I was born. Still here.")]),
  ("garment", "W 34th St & 7th Ave", "Seventh Avenue grate, the garment shift change.",
   [("npc.garment_cutter", "weary", "Feld's gone south, Kaplan's going south. Who's left? The pigeons."), ("npc.garment_cutter", "low", "Pigeons don't pay dues.")]),
  ("park", "6th Ave & W 42nd St", "Bryant Park side grate.",
   [("npc.night_reader", "quiet", "Library closes at nine. Then the park changes."), ("npc.night_reader", "quiet", "Read faster.")]),
]
for key, at, ctx, lines in GRATES:
    d = {"id": f"dlg.amb_grate_{key}", "context": ctx, "channel": "ambient",
         "lines": [{"id": f"l{i + 1}", "speaker": s, "emotion": e, "text": t} for i, (s, e, t) in enumerate(lines)]}
    (C / "dialogue" / f"amb_grate_{key}.json").write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n")
    t = {"id": f"trigger.grate_{key}", "volume": {"at": at, "radius": 10}, "when": {"flags": [], "time": ["07:00", "02:00"], "weather": ["any"]},
         "once": False, "cooldownMin": 240,
         "do": [{"type": "overhear", "script": f"dlg.amb_grate_{key}", "at": at, "radius": 10, "falloff": "soft"}]}
    (C / "triggers" / f"grate_{key}.json").write_text(json.dumps(t, ensure_ascii=False, indent=2) + "\n")

# ------------------------------------------------------------------ interior dressing per act (3-4 per act)
dress = {"_note": "Dressing and ambient text for enterable interiors, per act. 'tells' are the per-NPC lines for the Read the Room activity. The engine owns the geometry; narrative owns contents and text.",
 "acts": {
  "1": [
   {"interior": "interior.corwin_lobby", "props": ["bulletproof glass desk", "room-key board with brass tags", "18 mailboxes", "lobby chairs (Odessa's by the radiator)", "a dead rubber plant", "pay phone"],
    "text": ["NO VISITORS AFTER 11 P.M. — MGMT", "RENT DUE FRIDAYS", "NOTICE — CORWIN RESIDENTIAL ASSOCIATES (from M2)"],
    "people": ["char.odessa_pruitt", "char.walter_hollis", "char.bernard_ostrow", "npc.sro_resident"], "sound": "Fan ticking, radio shipping news, the elevator's cable groan"},
   {"interior": "interior.royal_cafeteria", "props": ["tray rails", "steam table", "pie case with a turning light", "mirror wall", "coat hooks"],
    "text": ["PIE 30¢ · COFFEE 20¢", "NO LOITERING (ignored)", "MANAGEMENT NOT RESPONSIBLE FOR HATS"], "people": ["npc.strip_worker", "npc.bus_terminal_crowd", "npc.club_waitress"],
    "sound": "Cutlery, a cashier's bell, rain on the plate glass"},
   {"interior": "interior.station_house_desk", "props": ["high front desk", "blotter", "wanted board", "radiator with a coffee pot on it", "bench for complainants"],
    "text": ["ALL VISITORS REPORT TO DESK", "PATROLMEN'S BENEVOLENT — DANCE (generic flyer)", "WANTED (faded sketches)"], "people": ["char.pat_kearney", "npc.beat_cop"],
    "sound": "Teletype, radio crackle, a typewriter two rooms away"},
   {"interior": "interior.shamrock_rail", "props": ["long rail", "TV on a bracket", "framed badges and a hurling stick", "jukebox (invented songs only)"],
    "text": ["CASH ONLY", "NO BOOKMAKING (handwritten, ironic)"], "people": ["npc.off_duty_cop", "char.carl_mayhew"],
    "tells": [{"who": "npc.off_duty_cop", "text": "Everyone's a cop here. The bartender's tell is pity."}],
    "sound": "Ballgame on TV, ice, men laughing too loud"}],
  "2": [
   {"interior": "interior.varelas_vault", "props": ["vault door with a wheel", "garment bags in rows", "thermometer on a nail", "compressor housing", "ice blocks (after M15)"],
    "text": ["BONDED STORAGE — NO ADMITTANCE", "TEMP: 38°F (chalk, crossed out on brownout nights)"], "people": ["char.yiannis_doukas", "npc.fur_worker"],
    "sound": "Compressor hum (silent during brownouts), dripping ice"},
   {"interior": "interior.arden_lobby", "props": ["horseshoe bar", "two booths", "porter's stool", "service door to the back stairs", "tip jar"],
    "text": ["ARDEN BAR · COCKTAILS", "NO CREDIT — RITA"], "people": ["char.rita_haines", "char.marcus_teague", "npc.hotel_bar_regular", "npc.strip_worker"],
    "tells": [{"who": "npc.hotel_bar_regular", "text": "White sneakers. Nobody wears white sneakers to a bar."},
              {"who": "npc.hotel_bar_regular", "text": "Club soda, a wedding-ring tan, and he never looks at the door."},
              {"who": "npc.hotel_bar_regular", "text": "Sailor's tattoo, sailor's laugh. Just a sailor."}],
    "sound": "Jukebox (Night Owl Radio playlist), a fan, Rita's towel"},
   {"interior": "interior.feld_loft", "props": ["rows of sewing machines", "cutting tables", "racks", "a time clock", "Carmen's machine with a saint card"],
    "text": ["NO SMOKING — FIRE LAW", "PIECE RATES POSTED MONDAY"], "people": ["char.carmen_arce", "char.mei_lin_chow", "char.sam_feld", "npc.garment_cutter"],
    "afterFlag": {"flag.feld_left": "Empty loft: unplugged machines, bare tables, a postcard from Ponce tacked to the time clock"},
    "sound": "Fifty machines, a radio on Radio Caribe, the freight elevator bell"},
   {"interior": "interior.velvet_moon_lobby", "props": ["ticket booth", "faded red carpet", "popcorn machine (broken)", "a sleeping man by the radiator", "one-sheets in cracked frames"],
    "text": ["3 FEATURES · CONTINUOUS · $1", "NO RE-ENTRY", "POSITIVELY NO SLEEPING (ignored)"], "people": ["npc.deuce_crowd", "npc.park_sleeper"],
    "sound": "Muffled kung-fu sound effects through the doors, the projector's whir"}],
  "3": [
   {"interior": "interior.corwin_lobby", "props": ["folding chairs in rows (committee)", "Hollis's radio on the desk", "a bedsheet banner being painted", "petition clipboards"],
    "text": ["WE LIVE HERE", "TENANTS' COMMITTEE — MEETING TONIGHT", "WALTER HOLLIS 1900–1974 (if flag.hollis_dead)"],
    "people": ["char.odessa_pruitt", "char.bernard_ostrow", "char.inez_rivera", "npc.sro_resident"], "sound": "The radio never off; chairs scraping; Odessa's cane tap"},
   {"interior": "interior.hanyang_house", "props": ["low tables", "kimchi crocks along the back wall", "steel cabinet (the kye pot)", "calendar from a Seoul bank"],
    "text": ["한양집 HANYANG HOUSE", "KYE MEETING — SUNDAY (Korean and English)"], "people": ["char.mi_sook_baek", "char.jung_ho_baek"],
    "sound": "Sizzling, Korean radio, a calculator's beep"},
   {"interior": "interior.lisle_office", "props": ["walnut desk", "ledger cabinet", "Marjorie's typewriter and carbon trays", "a view of the Corwin's water tank"],
    "text": ["LISLE & ASSOCIATES", "(If B1) SEALED — BY ORDER OF THE SPECIAL PROSECUTOR"], "people": ["char.howard_lisle", "char.marjorie_kell"],
    "sound": "A ticking clock, the typewriter, then silence"},
   {"interior": "interior.herald_lunch_counter", "props": ["U-shaped counter", "chrome stools", "pie stands", "the fur salon sign upstairs"],
    "text": ["BAXTER & LOWE — LUNCH COUNTER", "TODAY: TUNA MELT 95¢"], "people": ["char.ruth_calloway", "npc.lunch_counter_regular", "npc.shopper"],
    "sound": "Store announcements, cash registers, a milkshake mixer"}]}}
(C / "radio.json").write_text(json.dumps(radio, ensure_ascii=False, indent=2) + "\n")
(C / "street_text.json").write_text(json.dumps(street, ensure_ascii=False, indent=2) + "\n")
(C / "interior_dressing.json").write_text(json.dumps(dress, ensure_ascii=False, indent=2) + "\n")
print("radio:", len(radio["stations"]), "stations,", sum(len(s["songs"]) for s in radio["stations"]), "songs,",
      sum(len(s["patter"]) for s in radio["stations"]), "DJ lines; tags", len(street["tags"]), "slogans", len(street["slogans"]),
      "posters", len(street["posters"]), "; grates", len(GRATES), "; interiors dressed", sum(len(v) for v in dress["acts"].values()))
