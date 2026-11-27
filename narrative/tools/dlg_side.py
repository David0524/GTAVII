#!/usr/bin/env python3
"""Side-quest dialogue (N4b part 2), written by the lead writer. 'Any lead' pieces avoid fixed lead lines
(NPCs speak; the engine may add a generic lead acknowledgement). Recurring givers are added to
content/cast_side.json. Lines are 90 characters or fewer; choices are 40 or fewer, untimed."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
C = ROOT / "content"
T, D, N = "char.teddy_arce", "char.delphine_moore", "char.nick_varelas"

# ---------------- recurring side givers (service-tier sheets)
def svc(id, name, age, role, at, samples, visual, note=""):
    return {"id": id, "tier": "service", "name": name, "age": age, "role": role, "at": at, "schedule": "per side-quest spec",
            "speech": {"samples": samples}, "visual": visual, "edges": [], "note": note}
CAST = [
 svc("char.albertine_cho", "Albertine Cho", 68, "Widow who sees her late husband on 42nd St screens", "A walk-up on W 39th St",
     ["Harold is alive. I saw him Tuesday. Third feature, second reel.", "He always said he'd be in pictures. Nobody believed him.", "I'm not crazy. I'm a widow. It's different."],
     "Small, neat, a good coat in July, a handbag held like a shield", note="Chinese-American, born in Brooklyn 1906; arc: The Lost Husband."),
 svc("char.obadiah_vane", "Obadiah Vane", 59, "Street weather prophet with a barometer, Herald Square", "Herald Square, by the newsstand",
     ["The glass is falling, friend. The glass never lies. People lie.", "Brownout Thursday, west of Sixth. Write it down.", "Science, my friend. Science and a good nose."],
     "Sandwich board ('THE WEATHER, 10¢'), a brass barometer on a strap, a bowler hat"),
 svc("char.rizo_147", "Ramón “RIZO 147” Ortiz", 20, "Graffiti writer (adult); wants his best piece photographed before it's buffed", "W 147th St (off map); paints in midtown yards and the passage",
     ["It's not vandalism. It's a gallery that moves.", "My piece runs on the downtown local till they buff it. Two days, maybe.", "Shoot it from the platform. Whole car. Nobody does whole cars."],
     "Paint-flecked sneakers, a canvas bag of cans, a sketchbook he guards", note="Adult (20). Art, not glamour; no instructions for anything."),
 svc("char.marty_fence", "Marty Glass", 55, "Fence with a weekly want list", "Back room behind a radio-repair shop, W 39th St & 9th Ave",
     ["This week I want a radio, a camera, and a fur. Don't ask about the fur.", "Thirty percent. Forty if it's clean. Nothing's clean.", "I don't buy from cops, kids, or people who cry."],
     "Cardigan, jeweller's loupe on a cord, a radio always half-assembled on the counter"),
 svc("char.lou_ferraro", "Lou Ferraro", 66, "Projectionist on the Deuce; lost the reels of a 1940s picture", "The Velvet Moon projection booth",
     ["Twelve reels. Nineteen forty-seven. Shot on these streets. I lost them.", "Every grindhouse on the Deuce has had one. Some still do.", "Bring me a reel, I'll show you a city that's gone."],
     "Thick glasses, a cardigan with burn holes, smells of acetate"),
 svc("char.janos_tibor", "János and Laci Tibor", 47, "Piano-moving brothers (Hungarian, 1956 refugees)", "Their truck on W 35th St",
     ["Four pianos, two brothers, one rope. You see the problem.", "Up five flights. The piano doesn't care. Neither should you.", "Laci, the corner! The corner! Ah, the corner."],
     "Two broad men in matching grey work shirts, a coil of rope, leather shoulder straps"),
 svc("char.myrna_pelletier", "Myrna Pelletier", 61, "Owner of the Velvet Moon", "The Velvet Moon box office",
     ["Somebody stole my marquee letters. The whole alphabet.", "Thirty years I've run this house. I've seen worse. Not much.", "Find my letters and I'll put up whatever you want. Within reason."],
     "Platinum wig, cat-eye glasses, a cash-box key on a chain"),
 svc("char.augustus_kitt", "Augustus “Gus” Kitt", 58, "Fight promoter at the Garden (invented cards)", "The Garden's back corridor",
     ["Fight night. I need a door man who knows a fake ticket and a real drunk.", "Mallory's a bum. Okoro's a poet. Bet the poet.", "Ten bucks and a ringside folding chair. Don't sit on it."],
     "Camel coat over a sweat-stained shirt, a cigar the size of a candle"),
 svc("char.ezekiel_barber", "Ezekiel “Zeke” Moss", 72, "Barber on W 38th St; lets Tina practise after hours", "Moss Barbers, W 38th St & 8th Ave",
     ["Chair's yours after eight. Don't cut anybody I like.", "Forty years of heads. Every one tells you something.", "Hair's patient, young lady. People ain't."],
     "White smock, half-glasses, scissors in his breast pocket like a pen"),
 svc("char.otto_krause", "Otto Krause", 64, "Hardware store owner; sends Teddy on lock call-outs", "Krause Hardware, 6th Ave & W 31st St",
     ["Lady on Thirty-Fourth locked out. Dead husband's place. Be gentle.", "You want a key made or a door opened? Opening's extra.", "Fans in stock. Sold out by noon. Every day."],
     "Brown shop coat, a pencil, a ring of key blanks on his belt"),
]
(C / "cast_side.json").write_text(json.dumps({"_note": "Recurring side-quest givers (N4b). Service-tier sheets. Names checked only for famous namesakes.", "characters": CAST}, ensure_ascii=False, indent=2) + "\n")

S = {}
def s(sid, ctx, *lines):
    out = []
    for i, x in enumerate(lines):
        if isinstance(x, dict): out.append(x); continue
        sp, em, tx = x
        out.append({"id": f"l{i + 1}", "speaker": sp, "emotion": em, "text": tx})
    S[sid] = {"id": sid, "context": ctx, "lines": out}
def ch(*opts):
    return {"id": "c1", "choices": [{"text": t, "goto": g} for t, g in opts]}

CHO, OBA, RIZ, MAR, LOU, JAN, MYR, KIT, ZEK, OTT = (c["id"] for c in CAST)
s("dlg.side_baby_cab_1", "Encounter: a woman in labour flags you down.", ("npc.cab_fare_night_worker", "strained", "Pennington General. Now. Not in a minute. Now."), ("npc.cab_fare_night_worker", "strained", "Ninth Avenue. Twenty-Sixth. I'll tell you the turns. Breathe with me. Or don't."))
s("dlg.side_baby_cab_2", "At the hospital. She asks the driver to help name the baby.", ("npc.cab_fare_night_worker", "exhausted", "A girl. She came out yelling. Like this city. Pick a name. You earned it."),
  ch(("Rosa.", "l_r"), ("Grace.", "l_g"), ("Something with a street in it.", "l_s")),
  {"id": "l_r", "speaker": "npc.cab_fare_night_worker", "emotion": "warm", "text": "Rosa. My mother's name. Good.", "goto": "l_e"},
  {"id": "l_g", "speaker": "npc.cab_fare_night_worker", "emotion": "warm", "text": "Grace. God knows we'll need it.", "goto": "l_e"},
  {"id": "l_s", "speaker": "npc.cab_fare_night_worker", "emotion": "laughing", "text": "Madison. Like the square. Fancy. Okay.", "goto": "l_e"},
  {"id": "l_e", "speaker": "char.dr_osei", "emotion": "dry", "text": "Congratulations to whoever you are. Out of my hallway, please."})
s("dlg.side_brownout_relief_1", "Brownout block. Neighbours on the stoop.", ("npc.brownout_crowd", "tired", "Ice for the diabetics on four. Candles for the Royal. Somebody check the elevator."), ("npc.brownout_crowd", "wry", "Hudson Union says an hour. Hudson Union always says an hour."))
s("dlg.side_brownout_relief_2", "The block thanks the helper.", ("npc.brownout_crowd", "warm", "You're all right. Sit. Somebody's got a cold soda left. Somebody always does."))
s("dlg.side_bryant_brawl_1", "Bryant Park benches at dusk; two men over one bench.", ("npc.park_sleeper", "angry", "That's my bench! Since nineteen sixty-nine!"), ("npc.park_sleeper", "angry", "Benches don't have owners! It's a park!"))
s("dlg.side_bryant_brawl_2", "The crowd decides.", ("npc.night_reader", "dry", "Split the bench. Half each. Solomon would be proud. Solomon would be tired."))
s("dlg.side_bulldog_scoop_1", "Before dawn at the paper's loading dock (Teddy).", ("npc.truck_driver", "gruff", "Bulldog edition. Six stands. The other paper's truck leaves the same minute."), (T, "dry", "Then I leave the minute before."))
s("dlg.side_bulldog_scoop_2", "At the bureau after the run (Teddy).", ("char.nora_finch", "rapid", "You beat the Dispatch truck to Herald Square? By how much?"), (T, "flat", "A cup of coffee and a red light."))
s("dlg.side_buyers_banquet_1", "Nick's briefing before the buyers' banquet (Nick).", (N, "expansive", "Ohio at table four, Chicago at table two. Never seat Chicago near Ohio."), ("char.eleni_varelas", "dry", "And Kallis's man is a waiter tonight. I saw his shoes."))
s("dlg.side_buyers_banquet_2", "Seating the buyers (Nick).", ("npc.trade_dinner_guest", "pleased", "Varelas! A window seat. You remembered I like the view of the Garden."), (N, "charming", "I remember everything about my buyers. Especially the size of their orders."))
s("dlg.side_buyers_banquet_3", "Catching the saboteur (Nick).", ("npc.hotel_bellhop", "caught", "It's just salt, Mr. Varelas! Salt in the champagne. Mr. Kallis said it was a joke!"), (N, "cold", "Tell Mr. Kallis the joke is on his account now. Out."))
s("dlg.side_chop_list_1", "The Dukes' garage on W 36th. A chalkboard of wanted cars.", ("npc.stickup_man", "flat", "List's on the board. Colour, make, condition. No cabs. Cabbies are family."), ("npc.stickup_man", "wry", "And no doctors' cars. Bad luck. We tried once."))
s("dlg.side_club_crisis_1", "A club member's emergency (Delphine).", ("npc.club_waitress", "panicked", "Del, the landlord changed my lock. My kid's inside with my sister. My rent's paid!"), (D, "steady", "Rule one: I count everything. Including landlords. Show me the receipt."))
s("dlg.side_club_crisis_2", "Settled (Delphine).", ("npc.club_waitress", "relieved", "You got it open. How did you— Never mind. Thank you. Sunday I pay double."), (D, "warm", "Sunday you pay five. Like everybody. That's the point."))
s("dlg.side_club_ious_1", "Delphine finds the IOUs of women who left the city.", (D, "inner", "Six IOUs. Six women who went home, or somewhere. They paid in. Nobody paid out."), (D, "inner", "Money orders, then. Philadelphia, Wilmington, San Juan. Rule twenty-two: finish the count."))
s("dlg.side_collections_marked_1", "Calloway marks bills for the collection rounds (Teddy, wire branch).", ("char.ruth_calloway", "crisp", "These twenties are marked. Swap them into two envelopes. Which two is your call."), (T, "flat", "And if they find out?"), ("char.ruth_calloway", "dry", "Then you'll be very convincing about how surprised you are."))
s("dlg.side_collections_marked_2", "A stop's quiet scene (Teddy).", ("char.anna_moretti", "tired", "Here. Same as always. You look like you're carrying more than envelopes, collector."), (T, "quiet", "Just the usual, Mrs. Moretti."))
s("dlg.side_collections_marked_3", "Reporting back (Teddy).", ("char.ruth_calloway", "satisfied", "Two marked envelopes went into Mayhew's glove box. They'll come out somewhere interesting."))
s("dlg.side_corner_pocket_1", "Corner Pocket Billiards, smoke and green felt.", ("npc.arcade_patron", "smooth", "Friendly game? Five a rack. I'm terrible. Ask anybody."), ("npc.hotel_bar_regular", "low", "He's not terrible. He's never been terrible in his life."))
s("dlg.side_corner_pocket_2", "Settling up.", ("npc.arcade_patron", "sour", "Okay. Okay. You're not terrible either. Pay you Friday."))
s("dlg.side_desk_requests_1", "The Corwin desk bell (Teddy).", ("npc.sro_resident", "apologetic", "Mr. Arce, I'm sorry, it's late. It's my pills. The drugstore on Thirty-Fourth."), (T, "warm", "Write it down. I'll be back before you're asleep."))
s("dlg.side_desk_requests_2", "Back at the resident's door (Teddy).", ("npc.sro_resident", "grateful", "You're a good boy. Your mother raised you. Tell her I said."))
s("dlg.side_fence_wants_1", "Marty's back room.", (MAR, "flat", "This week I want a radio, a camera, and a fur. Don't ask about the fur."), (MAR, "dry", "I don't buy from cops, kids, or people who cry. You're none of those. Today."))
s("dlg.side_fence_wants_2", "Paying out.", (MAR, "flat", "Thirty percent. Forty if it's clean. It isn't. Thirty."))
s("dlg.side_fight_door_1", "The Garden's back corridor.", (KIT, "rasping", "Fight night. I need a door man who knows a fake ticket and a real drunk."), (KIT, "wry", "Ten bucks and a ringside folding chair. Don't sit on it."))
s("dlg.side_fight_door_2", "At the door.", ("npc.holiday_stroller", "drunk", "This ticket's real, pal! I printed it myself!"), ("npc.holiday_stroller", "drunk", "Okay, okay. I'm going. I'll watch through the window. There's no window?"))
s("dlg.side_fight_door_3", "Ringside (Nick).", (N, "excited", "Okoro to win in six. A poet with a left hook. Put me down for fifty."), (KIT, "rasping", "Mr. Varelas! Fifty on the poet! Now that's a man who reads."))
s("dlg.side_fire_escape_gardens_1", "Moretti's wager about fire-escape tomatoes.", ("char.anna_moretti", "loud", "Every fire escape on the West Side has a tomato plant. Photograph the best fifteen."), ("char.anna_moretti", "proud", "Mine's on Twenty-Eighth. It's the best. Don't argue. Photograph it anyway."))
s("dlg.side_fire_escape_gardens_2", "Judging the shots.", ("char.anna_moretti", "grudging", "Hm. Number nine's better than mine. Whose is it? …Carmen Arce. Of course it is."))
s("dlg.side_four_pianos_1", "The Tibor brothers' truck on W 35th St.", (JAN, "practical", "Four pianos, two brothers, one rope. You see the problem."), (JAN, "practical", "Up five flights. The piano doesn't care. Neither should you. Lift on 'three'."))
s("dlg.side_four_pianos_2", "Paid on the landing.", (JAN, "breathless", "Laci, the corner! …Ah. Good. Twenty-five dollars. And our phone number, for next time."))
s("dlg.side_garden_runaway_1", "Seventh Ave. A horse trots past a stalled bus.", ("npc.ice_house_worker", "panicked", "That's Duchess! From the horse show! Don't chase her, she runs faster when you chase!"), ("npc.ice_house_worker", "panicked", "Get ahead of her. Sugar. She'll do anything for sugar. Like my brother."))
s("dlg.side_garden_runaway_2", "Back at the stable door.", ("npc.ice_house_worker", "relieved", "Duchess. You walked down Seventh Avenue against traffic. You're a New Yorker now."))
s("dlg.side_garment_rush_1", "37th & Seventh, morning gridlock.", ("char.dwayne_little", "cocky", "Racks to the dock on Thirty-Fifth. Gridlock's yours to solve. Side streets, genius."))
s("dlg.side_garment_rush_2", "Pay at the loft door.", ("char.dwayne_little", "impressed", "Under seven minutes. Through that? Okay. You're not a used-to-be. You're a might-be."))
s("dlg.side_hack_license_1", "Taxi-licence bureau, a clerk behind three inches of glass (Teddy).", ("npc.bank_teller", "flat", "Seven forms. Form A needs Form C. Form C needs a doctor. The doctor needs Form A."), (T, "dry", "So nobody gets a license."), ("npc.bank_teller", "flat", "Somebody does. Usually on Thursdays."))
s("dlg.side_hack_license_2", "Kehoe's office (Teddy).", ("char.maureen_kehoe", "brisk", "Seven forms, stamped, in order. You did it straight. I'm almost proud. Sign here."))
s("dlg.side_hill_races_1", "The cabbies' bet at the Iron Gate's back door.", ("npc.cab_driver", "cocky", "Your fancy sedan against my hack. Madison and Thirtieth. Uphill. Twenty bucks."), ("npc.cab_driver", "easy", "Wrong way on a one-way, you lose. That's the only rule. That's the whole city."))
s("dlg.side_hill_races_2", "Settling up at the finish.", ("npc.cab_driver", "sour", "Okay. You know the hill. Who taught you the hill?"))
s("dlg.side_hydrant_war_1", "A hot side street near Ninth: an open hydrant, a cop, a block.", ("npc.beat_cop", "weary", "Hydrant's gotta close. Water pressure's down on the whole block. Fire code."), ("npc.penn_south_neighbor", "pleading", "It's a hundred degrees, officer. Let the block cool off an hour. Just an hour."))
s("dlg.side_hydrant_war_2", "Settled.", ("npc.beat_cop", "relenting", "Spray cap on, pressure's fine, everybody's happy. Even me. Barely."))
s("dlg.side_insomnia_drives_1", "Nick, alone in the sedan at 2 a.m. (Nick).", (N, "inner", "There was a club on Thirty-Ninth. Nineteen fifty-two. I danced with Eleni there once."), (N, "inner", "Left here. Is it still there? Everything closes. Some things just change their name."))
s("dlg.side_insomnia_drives_2", "Nick finds the place (Nick).", (N, "inner", "Still here. Different sign, same door. The doorman's son is the doorman now. Good."))
s("dlg.side_last_train_1", "A tipsy office worker on the platform at 1 a.m.", ("npc.subway_rider", "tipsy", "Is this the last train? To Twenty-Third? I can't miss it. My cat has opinions."))
s("dlg.side_last_train_2", "Her stop.", ("npc.subway_rider", "grateful", "Twenty-Third! Thank you. Here's my card. I'm a secretary. I know everybody's secrets."))
s("dlg.side_locksmith_1", "Krause Hardware (Teddy).", (OTT, "gentle", "Lady on Thirty-Fourth locked out. Dead husband's place. Be gentle."), (T, "quiet", "I'm always gentle with doors."))
s("dlg.side_locksmith_2", "Inside the flat (Teddy).", (T, "inner", "Three locks inside the bedroom door. Not to keep people out. To keep something in."), (T, "inner", "A box of letters. Not mine to read. Hers."))
s("dlg.side_lost_tourists_1", "A family from Ohio with a folded map, Herald Square.", ("npc.cab_fare_tourist", "lost", "Excuse me! The Empire Estate Building? The map says it's here. Here is very big."),
  ch(("Two blocks up, east side of Fifth.", "l_r"), ("Look up.", "l_u"), ("Take the subway. Any one.", "l_w")),
  {"id": "l_r", "speaker": "npc.cab_fare_tourist", "emotion": "happy", "text": "Two blocks up, east side of Fifth. Thank you! New Yorkers are nice!", "goto": "l_e"},
  {"id": "l_u", "speaker": "npc.cab_fare_tourist", "emotion": "startled", "text": "Oh! Oh, there it is. It's right there. I feel foolish. Thank you.", "goto": "l_e"},
  {"id": "l_w", "speaker": "npc.cab_fare_tourist", "emotion": "doubtful", "text": "Any one? Okay… we'll write to the paper about this.", "goto": "l_e"},
  {"id": "l_e", "speaker": "npc.cab_fare_tourist", "emotion": "warm", "text": "Harold, say thank you to the nice… person."})
s("dlg.side_lost_tourists_2", "Their thanks.", ("npc.cab_fare_tourist", "warm", "Here's a dollar. Don't argue, my wife says. My wife's in charge of dollars."))
s("dlg.side_marquee_letters_1", "The Velvet Moon box office.", (MYR, "indignant", "Somebody stole my marquee letters. The whole alphabet."), (MYR, "dry", "Find my letters and I'll put up whatever you want. Within reason. My reason."))
s("dlg.side_marquee_letters_2", "Handing back the first letters.", (MYR, "pleased", "An R, an O and a K. You could spell 'ROCK'. You could spell 'KORO'. I'll take them."))
s("dlg.side_monte_1", "A cardboard box on 42nd St. A crowd. A dealer with fast hands.", ("npc.deuce_crowd", "fast", "Find the lady, find the lady, red wins, black loses, find the lady!"),
  ch(("Play a dollar.", "l_p"), ("Point out the shill.", "l_s"), ("Walk away.", "l_w")),
  {"id": "l_p", "speaker": "npc.deuce_crowd", "emotion": "smug", "text": "Ooh, so close! Again? Again's free. No it isn't.", "goto": "l_e"},
  {"id": "l_s", "speaker": "npc.deuce_crowd", "emotion": "angry", "text": "Hey! That guy works for him! The one in the hat! He wins every time!", "goto": "l_e"},
  {"id": "l_w", "speaker": "npc.deuce_crowd", "emotion": "dry", "text": "Smart. Smartest one here today.", "goto": "l_e"},
  {"id": "l_e", "speaker": "npc.deuce_crowd", "emotion": "fast", "text": "Cops! Box up, box up, see you on Forty-First!"})
s("dlg.side_monte_2", "Aftermath.", ("npc.deuce_crowd", "wry", "Monte's never about the cards, pal. It's about who's standing next to you."))
s("dlg.side_numbers_runner_1", "Earl's stand at 9 a.m.", ("char.earl_poole", "slow", "Slips from the barber, the newsstand, the candy store. Back by noon. Walk, don't run."), ("char.earl_poole", "slow", "Running looks like news. Walking looks like a Tuesday."))
s("dlg.side_old_beat_1", "Kearney at the station-house desk (Teddy).", ("char.pat_kearney", "low", "Son. Old Mrs. Duffy's boy got picked up. He's simple. Wrong place, wrong week."), ("char.pat_kearney", "low", "I can't walk him out in uniform. You can walk him home."))
s("dlg.side_old_beat_2", "The favour's story (Teddy).", ("char.pat_kearney", "quiet", "His father walked a beat with me in '49. Never took a dime. Died poor. That's the story."))
s("dlg.side_otb_tips_1", "A fare whispers a tip.", ("npc.cab_fare_businessman", "low", "Fourth race at Belmar. Brass Token. Don't ask how I know. Don't tell your mother."))
s("dlg.side_otb_tips_2", "The Teletrack window.", ("npc.bank_teller", "flat", "Brass Token, fourth race, win. Ten dollars. Good luck. Nobody here has had any."))
s("dlg.side_otb_tips_3", "Where the tip came from.", ("npc.hotel_bar_regular", "low", "Brass Token was fixed, friend. The lieutenant needs a boat motor. Everybody knew but you."))
s("dlg.side_own_business_1", "The sale terms.", ("char.mi_sook_baek", "sharp", "Half of Hanyang House. Four thousand. You keep the books honest or you keep nothing."))
s("dlg.side_own_business_2", "Signing.", ("char.jung_ho_baek", "dry", "Partners. Now two of us are optimists. Statistically very rare."))
s("dlg.side_passage_shops_1", "The shuttered gate in the old passage (Teddy).", (T, "inner", "Corwin master key. Doesn't fit. The old station key from the footlocker. …It fits."))
s("dlg.side_passage_shops_2", "A dead shoeshine stand behind the gate (Teddy).", (T, "inner", "A customer list from forty-eight. Names, shoe sizes, tips. A whole city, polished."))
s("dlg.side_practice_chair_1", "Moss Barbers after eight (Delphine).", (ZEK, "kind", "Chair's yours after eight. Don't cut anybody I like."), ("char.tina_mercado", "excited", "Del! A real chair! With a pump! Sit. Trust me. Don't look."))
s("dlg.side_practice_chair_2", "The regulars talk while Tina works (Delphine).", ("npc.hotel_bar_regular", "chatty", "Forty years I've come here. Never once a lady barber. I like it. Don't tell my wife."), (ZEK, "dry", "Hair's patient, young lady. People ain't. You'll do fine."))
s("dlg.side_projectionist_1", "The Velvet Moon booth.", (LOU, "wistful", "Twelve reels. Nineteen forty-seven. Shot on these streets. I lost them."), (LOU, "wistful", "Bring me a reel, I'll show you a city that's gone."))
s("dlg.side_rent_day_1", "Nick's rent list (Nick).", ("char.eleni_varelas", "dry", "Twenty-Ninth: a burst pipe. Thirty-Seventh: a cop wants 'inspection money'. Pick one."), (N, "tired", "The pipe. The pipe doesn't lie about what it wants."))
s("dlg.side_rent_day_2", "The burst pipe (Nick).", ("npc.sro_resident", "angry", "Water in my bedroom, Mr. Owner! My bed is a boat!"), (N, "humble", "Then tonight you sleep at my expense, at the Pennsylvania. Tomorrow, a plumber."))
s("dlg.side_rizo_147_1", "RIZO on a platform bench (Delphine).", (RIZ, "intense", "My piece runs on the downtown local till they buff it. Two days, maybe."), (RIZ, "intense", "Shoot it from the platform. Whole car. Nobody does whole cars."))
s("dlg.side_rizo_147_2", "Showing RIZO the print (Delphine).", (RIZ, "moved", "That's it. That's the whole thing. It's not vandalism. It's a gallery that moves."), (D, "warm", "Rule twenty-three: if nobody photographs it, it didn't happen."))
s("dlg.side_runaway_rack_1", "The shop's thanks after the rack is caught on the W 37th hill.", ("char.sam_feld", "relieved", "Forty dresses saved by one lunatic. Take a suit. Take two. Take the one with the lapels."))
s("dlg.side_skip_board_1", "Abend's wall of mugshots.", ("char.bondsman_rizzo", "gruff", "Pick one. Each one's got a weakness. His mother's birthday. A pool habit. Pigeons."), ("char.bondsman_rizzo", "gruff", "Bring 'em in breathing. Breathing pays full."))
s("dlg.side_skip_board_2", "Asking the skip's regulars.", ("npc.hotel_bar_regular", "cagey", "Vinnie? Never heard of him. He plays Tuesdays at the Corner Pocket. Never heard of him."))
s("dlg.side_stuck_elevator_1", "A brownout. An office lobby on Fifth.", ("npc.hotel_bellhop", "frantic", "Elevator's stuck between nine and ten! Machine room's on the roof! The super's in Jersey!"))
s("dlg.side_stuck_elevator_2", "Cranked down. The doors open.", ("char.marjorie_kell", "shaken", "Two hours. Two hours with a man who sells insurance. Thank you. Who are you?"))
s("dlg.side_tar_beach_1", "A tar-beach roof. A sunbather in a folding chair.", ("npc.hotel_bar_regular", "outraged", "My radio! Off the ledge while my eyes were shut! He went over the planks to Thirty-Fifth!"))
s("dlg.side_tar_beach_2", "Returning it.", ("npc.hotel_bar_regular", "delighted", "My radio! Here, cold soda. You want the ballgame? Of course you want the ballgame."))
s("dlg.side_telegrams_1", "A telegraph office on W 34th St.", ("npc.bank_teller", "brisk", "Twelve telegrams. Births, deaths, one horse-race result. Bad news after six p.m. only."), ("npc.bank_teller", "brisk", "Company policy. People take it better after supper."))
s("dlg.side_the_lost_husband_1", "Mrs. Cho at the Velvet Moon's box office.", (CHO, "certain", "Harold is alive. I saw him Tuesday. Third feature, second reel."), (CHO, "proud", "He always said he'd be in pictures. Nobody believed him."), (CHO, "steady", "I'm not crazy. I'm a widow. It's different."))
s("dlg.side_the_lost_husband_2", "The projectionist's booth.", (LOU, "gentle", "Harold Cho? Bit part in 'Pier Seventeen', forty-nine. A waiter. Two lines. Good lines."), (LOU, "gentle", "I'll run the reel for her. Midnight. No charge. Some things you don't charge for."))
s("dlg.side_three_am_phone_1", "The payphone at W 33rd & 8th rings at 3 a.m.", ("npc.office_cleaner", "whisper", "(Payphone) Thirty-Sixth and Ninth. A grey truck. Look at the dashboard. Don't call back."))
s("dlg.side_wanted_1971_1", "A faded poster in a station-house corridor (Teddy).", (T, "inner", "Nineteen seventy-one. I remember these faces. I remember the week they went up."))
s("dlg.side_wanted_1971_2", "The first poster (Teddy).", (T, "inner", "'Wanted: assault, W 35th St, October.' The trucker. The case Lisle made go away."))
s("dlg.side_water_tank_radio_1", "Chalk on a rooftop near W 36th & Ninth.", ("npc.night_reader", "curious", "Somebody chalks the roofs at night. Arrows, numbers, all toward the tank on Thirty-Sixth."))
s("dlg.side_water_tank_radio_2", "The man in the tank.", ("npc.park_sleeper", "serene", "Best view in Manhattan, and dry. Mostly. I watch the block. The block doesn't watch back."), ("npc.park_sleeper", "serene", "Want to know who goes in Lisle's back door at night? Sit. Have some tea. It's cold."))
s("dlg.side_weather_prophet_1", "Herald Square, the man with the barometer.", (OBA, "booming", "The glass is falling, friend. The glass never lies. People lie."), (OBA, "conspiratorial", "Bring me readings from three roof gauges and I'll tell you which blocks go dark."))
s("dlg.side_weather_prophet_2", "Reporting the first reading.", (OBA, "satisfied", "Twenty-nine point six. Brownout Thursday, west of Sixth. Write it down. Science, friend."))

s("dlg.side_pigeon_bands_1", "Banded pigeons around the core; the Commodore's lost birds.", ("char.ignatz_hallisey", "wistful", "Fifteen of my lost birds still wear my bands. Photograph them. I want to know they're fed."))
s("dlg.side_pigeon_bands_2", "Bringing the band photos back.", ("char.ignatz_hallisey", "moved", "Admiral Nelson's granddaughter! On the Library steps! She's fat. Good. Race day, Sunday."))

WF, IL = "char.walter_feeney", "char.ida_lorne"
s("dlg.side_whispering_corner_1", "Grand Central, the information booth under the clock. Evening rush.",
  (WF, "precise", "Track twenty-nine. Next. Oh. You're not asking about a train."),
  (WF, "low", "Thursdays, five-forty, a woman says good night to me across the arches. Eleven years."),
  (WF, "low", "I've never seen her face. That was the arrangement. Three Thursdays now, nothing."),
  (WF, "precise", "She mentioned a switchboard once. And a cane she hated. That's all I have."))
s("dlg.side_whispering_corner_2", "A rooming house on E 41st St. Ida Lorne, ankle in plaster, by the window.",
  (IL, "sharp", "Walter sent you? Walter doesn't send people. Walter answers questions."),
  (IL, "softer", "Broken ankle. Six weeks of stairs I can't do. Tell him the ankle, not the age."),
  (IL, "dry", "Better: stand in my corner Thursday and say it for me. You'll do it badly. Good."))
s("dlg.side_whispering_corner_3", "Thursday, 17:40, the whispering arches. The player faces the tile in Ida's corner and delivers her message (shown as text, not voiced).",
  (WF, "whisper", "That's not Ida. Did she send you? Tell me she's all right."),
  (WF, "whisper", "An ankle. Not the age. Of course she'd say that."),
  (WF, "whisper", "Good night, Ida. Tell her the five fifty-two still runs. Tell her I'll wait."))

for sid, d in S.items():
    (C / "dialogue" / f"{sid.split('.', 1)[1]}.json").write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n")
print(len(S), "scripts,", sum(len([l for l in d['lines'] if 'text' in l]) for d in S.values()), "lines;", len(CAST), "side givers")

