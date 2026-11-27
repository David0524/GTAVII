#!/usr/bin/env python3
"""N4b side content (user: 'We need side quests too. These can be the most creative and fun.').
Pillar from the user: 'small map, very interactive' -> the same blocks change by time, act and lead.
Writes content/side/side_content.json (all pieces), content/side/<id>.json (full specs for the top 5)
and narrative/N4B_SIDE_CONTENT.md (ranked catalogue). The user's own example (driving around with an
NPC collecting cash from several places) is deliberately NOT used."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "content" / "side"
OUT.mkdir(parents=True, exist_ok=True)
T, D, N, ANY = "char.teddy_arce", "char.delphine_moore", "char.nick_varelas", "any"
P = []


def piece(rank, id, title, kind, leads, acts, where, hook, twist, systems, reward, mobile, upgrades=None, parts=1):
    P.append({"rank": rank, "id": f"side.{id}", "title": title, "kind": kind, "leads": leads, "acts": acts, "where": where,
              "hook": hook, "twist": twist, "systems": systems, "reward": reward, "mobile": mobile, "parts": parts,
              "upgrades": upgrades, "slice": False})


# kinds: arc (recurring stranger), job (systemic, skill curve and payout ladder), encounter (random street),
# lead (lead-specific line), map (tied to a map feature), collectible (story payoff)
piece(1, "pigeon_commodore", "The Pigeon Commodore", "arc", [ANY], [1, 2, 3], "Rooftop coop over W 29th St & 7th Ave; rooftops across the Fur District",
      "Old Ignatz Hallisey races pigeons from a tar-roof coop and swears someone is stealing his champions mid-race.",
      "Rooftop pursuit by sight: follow a bird's flight line across roofs, fire escapes and stairwells (enterable buildings), photograph its leg band to prove which roof it landed on. In Act 3 his birds carry a message for the march.",
      ["rooftops and interiors", "photo mode", "pigeons (ambient)", "brownout (birds roost early)"], "$20 a race; the final race unlocks a pigeon-post messenger that shows the next story marker",
      "Following is by viewpoint, not aim. Birds pause on landmarks. Every roof route has a stairwell exit.", parts=4)
piece(2, "night_rate_stunts", "Night Rate: Stunt Driver", "map", [ANY], [1, 2], "The NIGHT RATE shoot at W 41st St & the west edge (boundaries.json)",
      "The film's stunt driver quit. The first A.D. bullhorns at anyone who looks like they can drive.",
      "Takes are judged by the director's shot list (hit the mark, skid on cue, miss the camera car). On take 3 a real police car joins the 'chase' and the witness system can't tell film from crime.",
      ["driving", "1974 one-ways", "police witnesses", "the map-edge film shoot"], "$50 a take; a crew jacket (outfit) and the director's thanks in the Act 3 wrap party",
      "Takes are 60–90 s with generous marks. Retakes are free. No precision steering at walking-speed sections.", parts=3)
piece(3, "photo_night_desk", "The Night Desk at the Ticker", "lead", [D], [2, 3], "The Daily Ticker midtown bureau, W 26th St & 7th Ave",
      "The tabloid's night photo editor buys prints by the hour, more if you're first.",
      "Race the police radio: dispatch lines (barks.police_radio) are the clue. Get there before the press car, frame the shot before the cops tape it off. Never the dead, never victims' faces (content rule).",
      ["police radio", "photo mode", "fast on foot / cabs", "heat (cops shoo you)"], "$10–75 a print; first-on-scene bonus; a press-pass outfit that lowers witness heat at scenes",
      "Auto-framing; the 'first' timer is generous and shown on the HUD. Missing it pays less, never fails.", upgrades="activity.photo_jobs", parts=1)
piece(4, "hack_turns", "Hack: Call Your Turns", "job", [T], [1, 2, 3], "Penn Station cab line; anywhere in the core",
      "Cab fares, where the passenger calls the turns the 1974 way.",
      "No GPS: each fare talks you there ('left on Thirty-Fourth, then down Seventh'). Ladder: licensed hack in Act 2 (Maureen Kehoe), rush-hour fares, then regulars with their own little arcs.",
      ["driving", "1974 one-ways", "terrain (Murray Hill)", "dialogue"], "$3–7 a fare + tips (route-knowledge bonus); regulars pay double",
      "Turns are called 6+ seconds early and repeated on the HUD as text. Wrong turns cost tips, never fail.", upgrades="activity.cab_fares", parts=1)
piece(5, "hollis_postcards", "Hollis's Postcards", "collectible", [ANY], [1, 2, 3], "Pawnshops, fences, the Corwin, Earl's stand, the Royal (20 hidden across the core)",
      "Walter Hollis mailed himself a postcard from every port he ever reached. Over the years they ended up all over the district.",
      "Each card is a short scene (the port, the year, one sentence of his voice). After Hollis dies (M19), bringing them to Odessa builds a lobby memorial wall, and the last card answers what he meant by 'shipmate'.",
      ["pawnshops and fences", "interiors", "relationships (Odessa)"], "A memorial in the Corwin lobby; Odessa +1 per five cards; the last card unlocks Hollis's radio station preset",
      "Cards glint at close range; an 'ask around' prompt points to the right block.", parts=1)
for i, x in enumerate(P[:5]):
    x["slice"] = True
piece(6, "the_lost_husband", "Mrs. Cho's Late Husband", "arc", [ANY], [1, 2, 3], "The Velvet Moon and the Deuce's 24-hour cinemas",
      "A widow insists her husband, ten years dead, is alive. She saw him last night at a triple feature on 42nd St.",
      "He's a bit-part actor in an old crime picture still playing the grindhouses. Track which cinema shows which reel by the marquees (street_text), get the projectionist to run the scene, and give her one more evening.",
      ["interiors (cinemas)", "marquee text", "dialogue"], "Her late husband's watch (sell or keep); the Velvet Moon midnight screening unlocked", "No timers; marquees are readable from the sidewalk.", parts=3)
piece(7, "weather_prophet", "The Man Who Sells the Weather", "arc", [ANY], [1, 2], "Herald Square, by the newsstand",
      "A street prophet with a barometer and a sandwich board predicts brownouts and is right twice.",
      "His readings become a free-roam forecast: bring him readings from three rooftop gauges and he tells you which blocks go dark next brownout (lets you prepare).",
      ["brownout", "rooftops", "calendar"], "Brownout warnings on the minimap; a barometer prop for a lead's home", "Short walks; no timers.", parts=3)
piece(8, "four_pianos", "Four Pianos", "arc", [ANY], [1, 2, 3], "Walk-ups across the core; the Varelas apartment",
      "Two brothers move pianos up tenement stairs for a living, and they're one man short and one rope old.",
      "A physics-and-timing job on real stairwells: rope, landings, the piano swinging toward a window. The fourth piano is Nick's, sold in his Act 3 decline (if he sells).",
      ["interiors (stairwells)", "physics props", "Nick's arc"], "$25 a piano; the brothers become muscle Nick can hire", "One held button with a rhythm prompt; generous timing.", parts=4)
piece(9, "telegrams", "The Last Telegrams", "job", [ANY], [1, 2, 3], "A telegraph office on W 34th St (invented); deliveries across the core",
      "Telegraph messengers are a dying trade. The office needs someone fast, on foot or bike.",
      "Each telegram is a tiny story you see delivered (a death, a birth, a winning number). Choose whether to deliver bad news before or after the recipient's shift.",
      ["on foot", "bike", "interiors", "time of day"], "$2–4 a telegram + tips; a 'messenger' outfit that makes you invisible to witnesses", "No timers except a soft 'before 6 p.m.'.", parts=1)
piece(10, "garden_runaway", "The Runaway from the Garden", "encounter", [ANY], [2], "Penn Square Garden / Penn Station / Seventh Ave",
      "During the summer horse show at the Garden (invented), a horse gets loose and trots down Seventh Avenue.",
      "Herd, don't chase: crowds and traffic spook it. Use the 1974 one-ways to get ahead and calm it with sugar from a diner.",
      ["driving", "crowds", "one-ways"], "$40 from the stable; a Garden ticket stub (fight-card access)", "Slow pursuit; the horse waits at corners.", parts=1)
piece(11, "garment_rush", "Garment Rush: Racks and Gridlock", "job", [T, D], [1, 2, 3], "W 35th–39th St, 7th–9th Aves",
      "Pushboys need extra hands, and the trucks won't move.", "Rack-pushing time trials through gridlock, with the hills (terrain on) turning a rack into a runaway. The routes thin out as shops move south in Act 3.",
      ["terrain", "crowds", "garment economy"], "$15 a run; a speed ladder unlocks Dwayne's sketches being seen", "One held button; hills telegraphed.", upgrades="activity.garment_rush")
piece(12, "bulldog_scoop", "Bulldog Edition: The Scoop", "job", [T], [1, 2, 3], "Newsstands across the core", "Deliver the bulldog edition before the rival paper's truck.",
      "The front page (newspapers.json) changes weekly, and some weeks you deliver news you made. Beat the rival truck to six stands with one-ways and short cuts.",
      ["driving", "one-ways", "newspapers"], "$12 a run; 'scoop' bonus", "Soft timer; no fail.", upgrades="activity.bulldog_run")
piece(13, "skip_board", "Abend's Board of Skips", "job", [ANY], [2, 3], "Abend Bail Bonds, W 31st St & 8th Ave", "A wall of mugshots, each with a story and a bail amount.",
      "Every skip has a personality and a weakness (a mother's birthday, a pool habit, a fear of pigeons). Find them by asking around, bring them in breathing. Non-lethal only.",
      ["witness system", "interiors", "combat (non-lethal)", "dialogue"], "10% of bail; regulars give tips", "Investigation by talking; takedowns on soft lock.", parts=1)
piece(14, "chop_list", "The Dukes' Weekly List", "job", [ANY], [2, 3], "The Dyer Avenue Dukes' garage, W 36th St & 9th Ave", "A weekly list of wanted cars, chalked on a board.",
      "Car theft through Gameplay's systems: witnesses, call boxes, descriptions. The twist is choosing whose car: a slumlord's sedan earns respect, a cabbie's livelihood earns enemies.",
      ["car theft", "witnesses", "relationships"], "$100–600 per car", "No precision driving; the garage door is a big target.")
piece(15, "locksmith", "Teddy's Keys: Call-Outs", "lead", [T], [1, 2, 3], "Krause Hardware; doors everywhere", "Locked out, locked in, locked up: the hardware store sends Teddy.",
      "Every call-out is a door with a story behind it (a dead man's flat, a runaway's room (adult), a safe that holds love letters). Teddy's 'Keys' skill opens; his ex-cop eye notices what's wrong.",
      ["keys", "interiors", "Teddy's skills"], "$10–25 a call; one call-out each act feeds a main-story clue", "Lockpicking is a held button with a rhythm, no precision.")
piece(16, "fight_door", "Fight Night at the Garden", "job", [T, N], [1, 2, 3], "Penn Square Garden (invented fight cards)", "The promoter needs a door man, and Nick likes a ringside bet.",
      "Teddy works the door (spot the fake tickets, eject the drunk, non-lethal). Nick bets on invented fighters whose records are in the paper (newspapers.json).",
      ["melee", "betting", "newspapers"], "$30 a night; bets", "Ejections are soft-lock takedowns.")
piece(17, "numbers_runner", "Earl's Runner", "job", [D, T], [2, 3], "Earl's stand and slip spots", "Runner pay, and the street number: the last three digits of the track handle in the paper.", "Pick up slips before noon past plainclothes who know what you're carrying. Ladder: Earl trusts you with the bank on Fridays.",
      ["police heat", "crowds", "newspapers"], "$10 a day; Friday bank bonus", "Soft noon deadline.", upgrades="activity.numbers_slips")
piece(18, "hill_races", "Murray Hill Wagers", "job", [N, T], [1, 2, 3], "Races within the core: Madison Ave hills, the 34th St two-way, Fifth's downhill",
      "Cabbies bet Nick's sedan can't beat them, on a small map.", "Short sprints that use the real relief (terrain on) and the 1974 one-ways. Wrong-way driving forfeits. Each race is a block-scale puzzle, not distance.",
      ["terrain", "one-ways", "driving"], "$20–100 stakes", "Route choice wins, not reflexes; no rubber-banding.", upgrades="activity.gentlemens_wager")
piece(19, "corner_pocket", "Corner Pocket", "job", [ANY], [1, 2, 3], "Corner Pocket Billiards, over a W 41st St storefront (invented)", "A pool hall where the regulars hustle each other.",
      "Read the hustler (Delphine's tells), or be the hustler (Nick's money). Pool itself is a simple aim-assisted shot game.",
      ["interiors", "betting", "Read the Room tells"], "Stakes", "Aim assist on; one-touch shots.")
piece(20, "otb_tips", "The Teletrack Tip", "job", [ANY], [2, 3], "Eighth Avenue Teletrack (invented OTB parlour)", "Cab fares and barflies whisper tips on invented races.",
      "Cross-system: tips overheard in cab fares, bar barks and the subway grates. Bet on them at the Teletrack. Some tips are fixes, and Wurtz's unit knows which.",
      ["overheard dialogue", "betting", "police heat"], "Bets", "Menus only.")
piece(21, "fence_wants", "Marty's Want List", "job", [ANY], [1, 2, 3], "Marty the fence, W 39th St & 9th Ave", "A fence with weekly wants: a radio, a fur (!), a camera.",
      "Find the wanted item in the world (pawnshops, shops, burglaries via Gameplay), or tip off the owner instead and get a reward.",
      ["items", "economy", "interiors"], "30–50% of value", "Inventory menu.")
piece(22, "own_business", "Own a Business", "job", [ANY], [2, 3], "Businesses for sale (economy.json)", "Buy Hanyang House's half share, the Royal, the arcade, the hardware store, or a Ninth Avenue garage.",
      "Weekly income plus 'trouble' events (a health inspector's tip, Lonnie's crew, a skimming night manager) that come as short side jobs.",
      ["economy", "combat", "bribes"], "$40–150 a week", "Trouble events are short and skippable (income dips).")
piece(23, "hydrant_war", "Hydrant War", "encounter", [ANY], [1, 2], "Any hot afternoon, side streets near 9th Ave",
      "The block's grown-ups have opened a hydrant (garment workers on break, the stoop regulars); a cop wants it shut; the block wants it open.", "Choose: fit a spray cap (a block party breaks out), shut it (the cop owes you), or bribe the cop to look away. No child characters (content rule).",
      ["heat", "bribes", "police"], "Relationship and reputation on the block", "A one-choice scene.")
piece(24, "purse_snatch", "Snatch on Thirty-Fourth", "encounter", [ANY], [1, 2, 3], "Herald Square crowds", "A purse thief bolts through the shoppers.",
      "Chase through the department store's two doors. Being seen helping lowers your own heat with witnesses (positive witness system).",
      ["chase", "witness system (positive)", "crowds"], "The owner's thanks; heat reduction", "Generous catch distance.")
piece(25, "stuck_elevator", "Between Floors", "encounter", [ANY], [2], "Office buildings on Fifth Ave during brownouts", "A brownout traps people in an elevator.",
      "Use keys and stairwells to reach the machine room, crank the car down by hand (timing prompt), and meet who was inside (sometimes Lisle's secretary).",
      ["brownout", "interiors", "keys"], "Reward and a story contact", "Rhythm prompt; no fail state.")
piece(26, "baby_cab", "Pennington, Fast", "encounter", [ANY], [1, 2, 3], "Anywhere; ends at Pennington General", "A woman in labour (adult) flags you down.",
      "Drive to the hospital on the one-ways with her calling the turns between breaths. Potholes hurt; the hills help.",
      ["driving", "one-ways", "hospital"], "A name you choose for the baby (it appears in the epilogue paper's birth notices)", "Soft timer, never fails.")
piece(27, "monte", "Three-Card Monte", "encounter", [ANY], [1, 2, 3], "W 42nd St, the Deuce", "A cardboard-box monte game with a crowd.",
      "Spot the shills (Read the Room tells), win once, or bust it and anger the crew. Delphine reads it instantly; Nick loses on purpose to buy information.",
      ["tells", "crews", "betting"], "Cash or information", "Tap-to-pick.")
piece(28, "tar_beach", "Tar Beach Thief", "encounter", [ANY], [1, 2], "Roofs of the W 30s walk-ups", "Someone stole a radio off a tar beach while its owner sunbathed.",
      "A rooftop chase across parapets and over planks between buildings; the thief drops into a stairwell (enterable).", ["rooftops", "chase", "interiors"], "$10 and a cold soda", "Jumps are auto-vaults.")
piece(29, "lost_tourists", "Which Way's Up?", "encounter", [ANY], [1, 2, 3], "Herald Square, Penn Station exits", "A family from Ohio with a folded map.",
      "Reverse no-GPS: you give the directions as choices ('two blocks up, west side of Seventh'), and they walk it. Wrong directions show up later in the paper as a funny letter.",
      ["map knowledge", "dialogue"], "Small tip; map-knowledge stat", "Choice menu.")
piece(30, "bryant_brawl", "Break It Up", "encounter", [ANY], [1, 2, 3], "Bryant Park benches", "Two men fight over a bench at dusk.", "Non-lethal takedowns, or talk them down, or let them fight and pick a winner (betting crowd).",
      ["melee", "dialogue"], "Reputation", "Soft lock.")
piece(31, "runaway_rack", "Runaway Rack", "encounter", [ANY], [1, 2, 3], "W 37th St hill toward 9th Ave (terrain)", "A loaded garment rack gets loose on the slope.", "Catch it before the intersection; use parked trucks as brakes.",
      ["terrain", "physics"], "A thank-you from the shop (a free suit)", "One run; generous.")
piece(32, "three_am_phone", "The Three A.M. Phone", "arc", [ANY], [2, 3], "Payphone at W 33rd St & 8th Ave", "A payphone rings at 3 a.m. every night. Nobody else will answer it.",
      "An anonymous caller feeds tips about the syndicate, each checkable (a truck, a meeting, a stash). The caller is Marjorie Kell (reveal in part 4).",
      ["payphones", "time of day", "photo mode"], "Story intel; corroboration evidence route for Branch B", "Calls are subtitled; tips are marked on the minimap only after you check them.", parts=4)
piece(33, "old_beat", "Old Beat Favours", "lead", [T], [1, 2, 3], "Midtown Central; the old foot posts", "Kearney asks for things he can't do in uniform.",
      "Small off-book favours (find a missing ledger page, sit with a dying informant, return a stolen bike to the right stoop) that build the 'Old Beat' special.",
      ["Teddy's specials", "relationships", "police system"], "Relationship with Kearney (unlocks report downgrades)", "Short walks and talks.")
piece(34, "hack_license", "Getting Licensed", "lead", [T], [2], "Taxi bureau (invented), Kehoe's office, a doctor, a photo booth", "Teddy wants his hack licence back. The city wants seven forms.",
      "A comic bureaucracy crawl across the small map: each office needs something from another. Shortcut with a bribe, or do it straight and earn Kehoe's respect.",
      ["bribes", "interiors", "the clock (office hours)"], "Licensed hack (+50% fares)", "Each step is a short walk.")
piece(35, "club_crisis", "The Club's Emergencies", "lead", [D], [1, 2, 3], "Club members' homes and workplaces", "A member's rent is due, a member's son (adult) is in the Tombs, a member's landlord changed the lock.",
      "Each emergency uses a different system (bail, keys, a bribe, a fight), and how Delphine solves it changes the club's vote in M31.",
      ["bail", "keys", "bribes", "melee"], "Club trust (M31 gates)", "Varied, short.", upgrades="activity.club_rounds")
piece(36, "practice_chair", "The Practice Chair", "lead", [D], [2, 3], "A barbershop on W 38th St (invented)", "Tina wants to learn hair. A barber lets them practise after hours.",
      "A gentle rhythm game (cut, wash, set) with regulars who talk. A rest from the violence; it pays off the shop dream.",
      ["interiors", "relationships"], "Tina +1; the epilogue shop's first customers", "Tap rhythm; no fail.")
piece(37, "rent_day", "Rent Day", "lead", [N], [2, 3], "Nick's properties (the W 29th building, W 37th storefront, the Corwin)", "Rent day at Nick's buildings never goes smoothly.",
      "Trouble events (a burst pipe, a tenant strike, a cop's hand out) where Nick can spend, listen, or fight badly, and each choice shows up in the Corwin's fate.",
      ["economy", "bribes", "relationships"], "Rent income; Odessa trust", "Choice menus with short actions.")
piece(38, "buyers_banquet", "The Buyers' Banquet", "lead", [N], [2], "Hotel Pennsylvanian ballroom", "Nick hosts out-of-town buyers; Kallis sabotages.",
      "A social stealth puzzle: keep buyers happy at the right table while finding Kallis's man spiking the champagne.", ["interiors", "dialogue", "tells"], "Fall orders (Nick's finances)", "Tap-to-talk.", upgrades="activity.buyers_tour")
piece(39, "insomnia_drives", "Nick Can't Sleep", "lead", [N], [2, 3], "Night drives anywhere", "Nick drives at night when he can't sleep.",
      "Map discovery as character: each drive reveals a hidden place (an after-hours club, a garage, a rooftop bar) through a memory Nick tells aloud.",
      ["map discovery", "driving", "time of day"], "Hidden places unlocked on the minimap", "Just drive; nothing to fail.")
piece(40, "projectionist", "The Projectionist's Reels", "collectible", [ANY], [1, 2, 3], "Cinemas, pawnshops and alleys on the Deuce", "A projectionist lost reels of a 1940s New York picture across the Deuce.",
      "Find 12 reels; each restores a scene. With all 12, the Velvet Moon holds a midnight screening of an invented lost film shot on these very streets.",
      ["interiors", "the Deuce", "cinema"], "A screening cutscene; the film's poster for a lead's home", "Reels glint; marquees hint.")
piece(41, "passage_shops", "Behind the Passage Gate", "map", [T], [2, 3], "The old 33rd Street passage", "Teddy's keys open a shuttered gate in the old passage.",
      "Forgotten shopfronts from the 1940s: a shoeshine stand's last customer list, a florist's frozen calendar. A quiet exploration with rats, and a cache of period cash.",
      ["subway", "keys", "rats"], "$ and lore", "Flashlight auto-aims.")
piece(42, "last_train", "Last Train Home", "map", [ANY], [1, 2, 3], "Subway platforms (subway.json)", "A tipsy office worker (adult) asks you to get her home on the last train.",
      "Escort through stations, transfers and a stalled train in a tunnel. Rats, a sermon, a three-piece band. Get off at the right stop.",
      ["subway", "escort", "time of day"], "Her thanks and a business card (a future job)", "Pace-matched escort.")
piece(43, "rizo_147", "RIZO 147", "arc", [D], [2, 3], "Subway cars, the passage, a rooftop", "A graffiti writer wants his best piece photographed before the Transit Authority buffs it.",
      "Find his whole-car piece on a moving train by timing station arrivals, photograph it, and protect his sketchbook from a rival crew. It's about art, not vandalism glamour.",
      ["subway", "photo mode", "time of day"], "His piece on the Ticker's front page; a tag on a lead's home wall", "Train times on the HUD; auto-frame.", parts=3)
piece(44, "water_tank_radio", "The Water-Tank Voice", "map", [ANY], [2, 3], "A rooftop water tank near W 36th St & 9th Ave",
      "Someone is living in a rooftop water tank, and leaving clues about the block on chalked rooftops.",
      "A rooftop clue hunt across the walk-ups: read the chalk, climb the right stairwell, find the man in the tank and hear what he's seen from up there. (Reframed 26 Nov: no radio-station content, per the user.)",
      ["rooftops", "interiors", "map discovery"], "A hidden rooftop place unlocked on the minimap", "Clues are large chalk marks; stairwells are enterable.")
piece(45, "pigeon_bands", "Leg Bands", "collectible", [ANY], [1, 2, 3], "Pigeons across the core", "The Commodore's lost birds still wear his bands.", "Photograph 15 banded pigeons (ambient flocks); each band leads back to a part of his story.",
      ["photo mode", "pigeons"], "The Commodore's final race", "Bands are highlighted when the camera is up.")
piece(46, "wanted_1971", "The Posters of '71", "collectible", [T], [2, 3], "Station-house corridors, post office walls", "Old wanted posters from 1971 are still pinned up.",
      "Collect 8. Together they show who was on the street the night of Mayhew's meet, adding lore to M25.", ["interiors", "Teddy's past"], "Lore; a hidden line in M25", "Tap to read.")
piece(47, "marquee_letters", "Marquee Letters", "collectible", [ANY], [1, 2, 3], "Around the Deuce", "Someone stole the Velvet Moon's marquee letters.",
      "Find 20 letters; the owner spells a message on the marquee chosen by you (from a list), visible for the rest of the game.", ["street text", "the Deuce"], "A marquee message of your choice", "Letters glint.")
piece(48, "club_ious", "The Club's Last IOUs", "collectible", [D], [3], "Bus terminal lockers, a church, a train station", "Women who left the city left IOUs with the club.",
      "Find their last addresses and send their savings home by money order. Bittersweet, and it changes the club's vote.", ["items", "post office"], "Club trust; epilogue postcards", "Short walks.")
piece(49, "fire_escape_gardens", "Fire-Escape Gardens", "collectible", [ANY], [1, 2], "Fire escapes across the core", "Tomato plants on fire escapes all over the West Side.",
      "Photograph 15. Moretti pays for the best, and the last belongs to Carmen.", ["photo mode", "rooftops"], "Moretti flowers for the march; Carmen +1", "Auto-frame.")
piece(50, "collections_marked", "Marked Money", "job", [T], [2], "Collection stops (activity.collections)", "Calloway marks some bills to trace the pad.",
      "Collection rounds with a twist: decide which envelopes carry marked bills (if Teddy wore the wire) or spot them (if he burned it). The stops are moral scenes, not a pickup route.",
      ["the wire branch", "relationships"], "Weekly pay; Branch-B corroboration", "Menus.", upgrades="activity.collections")
piece(51, "desk_requests", "Night Desk Requests", "job", [T], [1, 2, 3], "The Corwin", "Residents ring the desk bell at night.", "Two-block errands that build relationship gates; in Act 3 they become organising tasks.",
      ["interiors", "relationships"], "Relationship gates (M26)", "Short.", upgrades="activity.desk_requests")
piece(52, "brownout_relief", "Brownout Relief", "encounter", [ANY], [2, 3], "Brownout blocks", "Dark blocks need ice, candles and a hand.", "Navigate by lit landmarks only; looters (combat) or bribes.",
      ["brownout", "combat", "items"], "Local reputation", "Lit landmarks on the minimap.", upgrades="activity.brownout_relief")

assert 40 <= len(P) <= 60
(OUT / "side_content.json").write_text(json.dumps({"_note": "N4b side content: all pieces with hook, twist, systems, place, leads, acts, reward, mobile note and rank. Full mission-format specs exist for the 5 slice candidates (content/side/<id>.json). The rest are specced to this level; full specs are N4b part 2.", "pieces": P}, ensure_ascii=False, indent=2) + "\n")

# full specs for the slice top 5 (mission format, 'kind: side')
def O(i, t, text, **k):
    o = {"id": i, "type": t, "text": text}; o.update(k); return o
SPECS = {
 "side.pigeon_commodore": [O("o1", "dialogue", "Meet the Commodore on his roof", script="dlg.side_pigeon_1"),
                           O("o2", "enter_interior", "Up the stairs to the W 29th St roof", marker="interior.pigeon_roof"),
                           O("o3", "follow", "Follow the bird across the roofs", target="npc.pigeon_flock", keepWithinM=60),
                           O("o4", "photo", "Photograph the leg band", subject="npc.pigeon_flock", minScreenFraction=0.05),
                           O("o5", "dialogue", "Tell the Commodore which roof", script="dlg.side_pigeon_2")],
 "side.night_rate_stunts": [O("o1", "dialogue", "The first A.D. needs a driver", script="dlg.side_stunt_1"),
                            O("o2", "enter_vehicle", "Into the picture car", vehicle="vehicle_role.picture_car"),
                            O("o3", "goto", "Hit your mark on W 41st St", to="W 41st St & 9th Ave", radius=8),
                            O("o4", "dialogue", "'Cut! Print it!'", script="dlg.side_stunt_2")],
 "side.photo_night_desk": [O("o1", "dialogue", "The night editor's rates", script="dlg.side_ticker_1"),
                           O("o2", "goto", "Beat the press car to the scene", to="W 34th St & 7th Ave", radius=25),
                           O("o3", "photo", "Get the shot before the tape goes up", subject="npc.beat_cop", minScreenFraction=0.05),
                           O("o4", "goto", "Prints to the Ticker, W 26th St", to="W 26th St & 7th Ave", radius=15)],
 "side.hack_turns": [O("o1", "enter_vehicle", "Into the cab at Penn Station", vehicle="vehicle_role.cab"),
                     O("o2", "goto", "Pick up the fare", to="loc.hotel_pennsylvania", radius=15),
                     O("o3", "goto", "Follow the fare's directions", to="W 23rd St & 8th Ave", radius=20, routeCalledBy="passenger"),
                     O("o4", "dialogue", "Collect the fare", script="dlg.side_hack_fare")],
 "side.hollis_postcards": [O("o1", "deliver", "Bring Mrs. Pruitt the postcards", item="item.hollis_postcard", to="interior.corwin_lobby"),
                           O("o2", "dialogue", "Read them together", script="dlg.side_postcards")]}
DLG = {
 "dlg.side_pigeon_1": [("char.ignatz_hallisey", "conspiratorial", "Somebody's stealing my champions mid-race. Over these roofs. I need young legs."),
                       ("char.ignatz_hallisey", "proud", "That's Admiral Nelson. Blue bar, white band. Follow him. Don't lose him at the tanks.")],
 "dlg.side_pigeon_2": [("char.ignatz_hallisey", "triumphant", "The roof with the green door! I knew it. That's Murphy's coop. He's been at it since '61."),
                       ("char.ignatz_hallisey", "warm", "Twenty dollars and a bird named after you. Don't argue.")],
 "dlg.side_stunt_1": [("npc.film_ad", "bullhorn", "You! You drive? Our stunt man quit. Hundred-dollar day, fifty a take."),
                      ("npc.film_ad", "bullhorn", "Hit the mark, skid on cue, miss the camera car. That's the whole job. Picture's up!")],
 "dlg.side_stunt_2": [("npc.film_ad", "bullhorn", "Cut! Print it! Who are you? Never mind. Same time tomorrow!")],
 "dlg.side_ticker_1": [("npc.ticker_editor", "rapid", "Ten bucks a print. Seventy-five if you beat the press car. Never the dead. I mean it."),
                       ("npc.ticker_editor", "rapid", "Radio's on. Listen to the cops. They'll tell you where the news is.")],
 "dlg.side_hack_fare": [("npc.cab_fare_businessman", "brisk", "Left on Thirty-Fourth. Down Eighth. Here. Keep the change, you know the streets.")],
 "dlg.side_postcards": [("char.odessa_pruitt", "quiet", "'Marseille, 1947. Shipmate: the sea is fine. The coffee is a crime.' That's Walter."),
                        ("char.odessa_pruitt", "moved", "Put it on the wall, Mr. Arce. Next to the radio. He'd like the company.")]}
for x in P:
    if x["id"] in SPECS:
        spec = {"id": x["id"].replace("side.", "mission.side_"), "kind": "side", "title": x["title"], "number": None,
                "leads": x["leads"], "acts": x["acts"], "objectives": SPECS[x["id"]], "fail": [], "checkpoints": [SPECS[x["id"]][1]["id"]],
                "rewards": {"text": x["reward"]}, "where": x["where"], "systems": x["systems"], "mobile": x["mobile"], "rank": x["rank"], "slice": True}
        (OUT / f"{x['id'].split('.', 1)[1]}.json").write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n")
for sid, lines in DLG.items():
    d = {"id": sid, "context": "N4b slice side content.", "lines": [{"id": f"l{i + 1}", "speaker": s, "emotion": e, "text": t} for i, (s, e, t) in enumerate(lines)]}
    (ROOT / "content" / "dialogue" / f"{sid.split('.', 1)[1]}.json").write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n")

kinds = {}
for x in P:
    kinds[x["kind"]] = kinds.get(x["kind"], 0) + 1
L = ["# N4b: Side content (ranked)", "",
     "> Generated from `content/side/side_content.json` by `narrative/tools/build_side.py`. User: *\"We need side quests too. These can be the most creative and fun.\"*",
     "> Pillar: **small map, very interactive**. The same blocks change by time, act and lead. The user's own example (driving with an NPC collecting cash from several places) is **not** used.",
     f"> **{len(P)} pieces:** " + ", ".join(f"{v} {k}" for k, v in kinds.items()) + ". The **top 5 are vertical-slice candidates**, with full specs in `content/side/<id>.json`.", "",
     "| # | Piece | Kind | Lead(s) | Acts | Where | Hook | Twist mechanic | Systems | Reward | Mobile |", "|---|---|---|---|---|---|---|---|---|---|---|"]
for x in sorted(P, key=lambda x: x["rank"]):
    leads = ", ".join(l.split(".")[-1].split("_")[0].title() if l != "any" else "Any" for l in x["leads"])
    star = " ★ slice" if x["slice"] else ""
    up = f" *(upgrades {x['upgrades']})*" if x["upgrades"] else ""
    L.append(f"| {x['rank']} | **{x['title']}**{star}{up} | {x['kind']}{' ×' + str(x['parts']) if x['parts'] > 1 else ''} | {leads} | {', '.join(map(str, x['acts']))} | {x['where']} | {x['hook']} | {x['twist']} | {', '.join(x['systems'])} | {x['reward']} | {x['mobile']} |")
(ROOT / "narrative" / "N4B_SIDE_CONTENT.md").write_text("\n".join(L) + "\n")
print(len(P), "pieces", kinds)

# keep payouts after regenerating slice specs
import side_pay  # noqa: E402,F401  (applies content/side payouts in place)
