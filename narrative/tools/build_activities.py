#!/usr/bin/env python3
"""Authoring source for content/activities.json (N4 side activities). Edit here and re-run."""
import json
from pathlib import Path
OUT = Path(__file__).resolve().parents[2] / "content" / "activities.json"
T, D, N = "char.teddy_arce", "char.delphine_moore", "char.nick_varelas"
KEY = {"goto": "to", "dialogue": "script", "enter_vehicle": "vehicle", "enter_interior": "marker", "deliver": "to"}

def O(i, t, text, target=None, **k):
    o = {"id": i, "type": t, "text": text}
    if target is not None:
        o[KEY[t]] = target
    o.update(k)
    return o

A = []
def act(id, title, lead, unlock, pillars, window, wx, start, loop, pool, payout, cooldown, mobile, design, acts=(1, 2, 3), veh=()):
    A.append({"id": id, "title": title, "lead": lead, "unlockedBy": unlock, "acts": list(acts), "pillars": pillars,
              "when": {"time": list(window), "weather": wx}, "start": start, "loop": loop, "pool": pool, "payout": payout,
              "cooldownMin": cooldown, "vehicles": list(veh), "mobile": mobile, "design": design})

# --- Teddy
act("activity.cab_fares", "Hack: Cab Fares", T, "mission.hack", ["P2", "P3"], ("18:00", "04:00"), ["any"],
 {"type": "enter_vehicle", "vehicle": "vehicle_role.cab", "at": "loc.penn_hack_stand", "note": "Delroy's leased cab, nights only."},
 [O("o1", "goto", "Pick up the fare", "{pickup}", radius=15), O("o2", "goto", "Fare to {dropName}", "{drop}", radius=20)],
 {"pickup": ["loc.penn_hack_stand", "loc.hotel_pennsylvania", "W 42nd St & 7th Ave", "W 34th St & Broadway", "W 23rd St & 7th Ave", "Park Ave S & E 28th St"],
  "drop": [["W 23rd St & 8th Ave", "the Chelsea"], ["W 34th St & 6th Ave", "Herald Square"], ["W 42nd St & 8th Ave", "the Deuce"], ["5th Ave & W 41st St", "the Library"],
           ["Madison Ave & E 24th St", "Madison Square"], ["W 28th St & 6th Ave", "the Flower District"], ["W 46th St & 9th Ave", "Hell's Kitchen"], ["Lexington Ave & E 30th St", "Lexington"]]},
 {"perFare": [3, 7], "tipBonus": "Tips scale with taking the 1974 one-way route. Wrong-way driving halves the tip, and the fare complains."},
 0, "No timer on fares; tips reward route knowledge, not speed. Five fares per shift, then Delroy wants his cab back.",
 "The core P2 loop. Fare chatter (N5 barks.cab_fare) teaches landmarks. About 30% of fares carry a rumour that hints at the next story beat.", veh=["vehicle_role.cab"])
act("activity.collections", "Collections", T, "mission.five_am", ["P1", "P4"], ("04:30", "20:00"), ["any"],
 {"type": "talk", "who": "char.carl_mayhew", "at": "loc.cop_bar", "note": "A weekly list arrives at the desk on Mondays."},
 [O("o1", "goto", "Collect at {stopName}", "{stop}", radius=15), O("o2", "dialogue", "Collect, count, or let it slide", "dlg.act_collection_{stopKey}")],
 {"stop": [["loc.moretti_flowers", "Moretti's, W 28th", "moretti"], ["loc.baek_wholesale", "the Baeks', W 29th", "baek"], ["loc.kallis_furs", "Kallis Furs", "kallis"],
           ["loc.poole_shine", "Earl's stand", "earl"], ["loc.feld_loft", "Feld's loft", "feld"], ["loc.bauer_arcade", "Bauer's arcade", "bauer"]]},
 {"weekly": 200, "note": "Teddy can let a stop slide (payer +1, Mayhew -1, short count) or press (payer -1, Mayhew +1)."},
 1440, "Walking rounds in any order, with no timer. Each stop is a short untimed choice.",
 "P1 made repeatable and morally loaded: every envelope is a person. Act 2 only (by Act 3 there's no pad left to collect for).", acts=(2,))
act("activity.desk_requests", "Night Desk Requests", T, "mission.night_desk", ["P3", "P4"], ("23:00", "07:00"), ["any"],
 {"type": "talk", "at": "interior.corwin_lobby", "note": "The desk phone or the bell: a resident needs something."},
 [O("o1", "dialogue", "Answer the desk bell", "dlg.act_desk_{requestKey}"), O("o2", "goto", "{errandText}", "{errand}", radius=15),
  O("o3", "enter_interior", "Back to the desk", "interior.corwin_lobby")],
 {"request": [["medicine", "All-night pharmacy, 34th & 7th", "W 34th St & 7th Ave"], ["fan", "Fan from the hardware store", "6th Ave & W 31st St"],
              ["letter", "Read Mr. Hollis a letter", "interior.corwin_floor11"], ["locked_out", "Inez's key, the laundromat", "Broadway & W 30th St"],
              ["phone", "Payphone call for Odessa, 32nd", "Broadway & W 32nd St"]]},
 {"money": 0, "relationships": "+1 with the resident (gates in N3 §5)"},
 60, "Two-block errands from the hub, with no timers. Never the same resident twice in a row.",
 "P3/P4: the Corwin's residents become people you owe and who owe you. This builds the +3 gates that pay off in M26.")
act("activity.bulldog_run", "Bulldog Edition Run", T, "mission.hack", ["P2", "P3"], ("05:00", "07:30"), ["any"],
 {"type": "talk", "at": "W 34th St & 7th Ave", "note": "A newspaper truck driver who's a man short after Teddy's shift."},
 [O("o1", "enter_vehicle", "Into the newspaper truck", "vehicle_role.news_truck"),
  O("o2", "deliver", "Bundles to the {standName} stand", "{stand}", item="item.paper_bundle")],
 {"stand": [["W 34th St & Broadway", "Herald Square"], ["7th Ave & W 33rd St", "Penn Station"], ["W 42nd St & 7th Ave", "42nd St"],
            ["Broadway & W 23rd St", "Flatiron"], ["8th Ave & W 40th St", "bus terminal"], ["5th Ave & W 41st St", "Library"]]},
 {"perRun": 12}, 720, "Six drops. The dawn schedule is generous, and being late only shrinks the tip.",
 "The weekly front page (N6) is printed on every bundle, so this is how the player reads the news as the story moves.", veh=["vehicle_role.news_truck"])
act("activity.garment_rush", "Garment Rush", T, "mission.surcharge", ["P2", "P3", "P1"], ("07:00", "15:00"), ["clear", "overcast"],
 {"type": "talk", "who": "char.dwayne_little", "at": "W 37th St & 7th Ave"},
 [O("o1", "deliver", "Racks to {buyerName}", "{buyer}", item="item.garment_racks", timeLimitSec=420)],
 {"buyer": [["W 35th St & 7th Ave", "the store dock"], ["Broadway & W 30th St", "a Broadway jobber"], ["W 38th St & 8th Ave", "a dye house"], ["W 36th St & 9th Ave", "the Jersey bus"]]},
 {"perRun": 15, "surcharge": "If Teddy uses a Carriers' truck, $3 goes to the envelope on the dash (P1)."},
 120, "Hand truck or box truck. The timer is generous, and missing it only cuts the pay. Rush-hour gridlock on 37th is the challenge; side streets are the answer.",
 "The brief's 'deliveries for the garment trade'. In Act 3 the routes thin out (runaway shops) and Dwayne says why.", veh=["vehicle_role.box_truck"])
act("activity.flower_dawn", "Flower Truck at Dawn", T, "mission.five_am", ["P3", "P2"], ("04:30", "07:00"), ["any"],
 {"type": "talk", "who": "char.anna_moretti", "at": "loc.moretti_flowers", "note": "Unlocked once Teddy has let Moretti's envelope slide at least once."},
 [O("o1", "enter_vehicle", "Moretti's flower truck", "vehicle_role.flower_truck"), O("o2", "deliver", "Arrangements to {destName}", "{dest}", item="item.flower_order")],
 {"dest": [["loc.hotel_pennsylvania", "the Pennsylvania"], ["W 31st St & 7th Ave", "the church on 31st"], ["W 34th St & Broadway", "the Herald Sq store"], ["W 23rd St & 9th Ave", "the funeral home"]]},
 {"perRun": 10, "relationships": "+1 Moretti per 3 runs"}, 720,
 "Dawn light, no timer. In Act 2 the sabotage shows up as a slow puncture: drive gently (holding the throttle down is the mechanic).",
 "Turns an enemy (Moretti) into an ally through work (P3). The sabotage clue pays off in M24 (Villalba).", acts=(2, 3), veh=["vehicle_role.flower_truck"])
act("activity.tenant_canvass", "Tenant Canvass", T, "mission.the_address", ["P5", "P4"], ("10:00", "20:00"), ["any"],
 {"type": "talk", "who": "char.odessa_pruitt", "at": "loc.corwin_hotel"},
 [O("o1", "goto", "Canvass {hotelName}", "{hotel}", radius=15), O("o2", "dialogue", "Knock. Ask. Listen.", "dlg.act_canvass_{hotelKey}")],
 {"hotel": [["loc.corwin_hotel", "the Corwin", "corwin"], ["Broadway & W 32nd St", "the hotel on 32nd", "h32"], ["Broadway & W 29th St", "the hotel on 29th", "h29"],
            ["8th Ave & W 37th St", "an Eighth Ave hotel", "h8th"]]},
 {"money": 0, "note": "Every 10 signatures adds marchers in M28 (crowd size only)."},
 240, "Door-to-door dialogue with short choices, no timers.",
 "Act 3 organising turns P5 around. Residents of other SROs get named lines (N5), which widens the world beyond the Corwin.", acts=(3,))
# --- Delphine
act("activity.club_rounds", "Club Rounds", D, "mission.the_club", ["P1", "P4"], ("14:00", "20:00"), ["any"],
 {"type": "talk", "who": "char.rita_haines", "at": "loc.arden_hotel"},
 [O("o1", "goto", "Dues from {memberName}", "{member}", radius=15), O("o2", "dialogue", "Collect, advance, or forgive", "dlg.act_club_{memberKey}")],
 {"member": [["loc.eighth_ave_cafeteria", "a waitress, 40th & 8th", "waitress"], ["loc.hotel_pennsylvania", "a maid at the Pennsylvania", "maid"],
             ["8th Ave & W 38th St", "Tina, 38th & Eighth", "tina"], ["8th Ave & W 41st St", "a woman at the terminal", "terminal"], ["W 46th St & 8th Ave", "the hat-check girl, 46th", "hatcheck"]]},
 {"money": 0, "note": "The club balance is an inventory count. Forgiving dues helps relationships and hurts the count (the M31 gate)."},
 1440, "Walking, untimed. Each member has a short scene (N5).",
 "The women's club as a daily institution: rent day, a sick child, a lost job. Sex work is context, never content.")
act("activity.photo_jobs", "Photo Jobs", D, "mission.contact_prints", ["P1", "P2"], ("10:00", "02:00"), ["any"],
 {"type": "talk", "who": "char.rita_haines", "at": "loc.arden_hotel", "note": "Rita's jobs board: envelopes left at the bar by people who need a picture taken."},
 [O("o1", "goto", "Find {subjectName}", "{subjectAt}", radius=30), O("o2", "photo", "Get the picture", subject="{subject}", minScreenFraction=0.06)],
 {"job": [["W 29th St & 8th Ave", "the absentee landlord", "npc.landlord_absentee"], ["W 28th St & 10th Ave", "the 'disabled' claimant", "npc.claimant"],
          ["W 39th St & 9th Ave", "the radio fence", "npc.fence"], ["loc.penn_hack_stand", "the bookie's runner", "npc.bookie_runner"],
          ["Lexington Ave & E 37th St", "the trench contractor", "npc.contractor"]]},
 {"perJob": [15, 40]}, 180, "Auto-framing photo mode with generous thresholds. Subjects keep schedules, so patience beats reflexes.",
 "The brief's 'photo assignments' in Delphine's terms: P1 as evidence. Nothing voyeuristic. Every subject is a petty fraud tied to the city's money troubles (P5).")
act("activity.walk_her_home", "Walk Her Home", D, "mission.back_stairs", ["P2", "P4"], ("23:00", "05:00"), ["any"],
 {"type": "talk", "at": "loc.arden_hotel", "note": "A club member asks for company to the subway or her building."},
 [O("o1", "escort", "Walk {name} home", who="{npc}", pace="match", waitRadius=10, route=["loc.arden_hotel", "{dest}"]),
  O("o2", "dialogue", "Say goodnight", "dlg.act_walkhome_{key}")],
 {"walk": [["Claudette", "the 34th St subway", "W 34th St & 7th Ave", "char.claudette_bijou", "claudette"], ["a waitress", "her building", "W 46th St & 9th Ave", "npc.club_waitress", "waitress"],
           ["Tina", "the bus terminal", "8th Ave & W 41st St", "char.tina_mercado", "tina"], ["the new girl", "the women's residence", "W 38th St & 9th Ave", "npc.club_newcomer", "newcomer"]]},
 {"money": 0, "relationships": "+1 club member"}, 120,
 "Walking with a pace-matching companion. If a car slows alongside, Delphine reads the plate aloud (dialogue) and it drives off. No combat.",
 "Safety as solidarity. The danger is real and implied, never shown as violence against the women.")
act("activity.numbers_slips", "Numbers Slips", D, "mission.contact_prints", ["P1", "P3"], ("09:00", "13:00"), ["any"],
 {"type": "talk", "who": "char.earl_poole", "at": "loc.poole_shine"},
 [O("o1", "goto", "Pick up slips: {spotName}", "{spot}", radius=12), O("o2", "deliver", "Slips back to Earl by noon", "loc.poole_shine", item="item.slips", timeLimitSec=900)],
 {"spot": [["W 45th St & 9th Ave", "barber, 45th & 9th"], ["8th Ave & W 40th St", "newsstand, 40th & 8th"], ["W 36th St & 9th Ave", "candy store, 36th"], ["W 37th St & 7th Ave", "Dwayne's rack route"]]},
 {"perRun": 10}, 1440, "A generous noon deadline; missing it only cuts the pay. No gambling mechanics for the player.",
 "The period numbers game as a neighbourhood economy (Earl's 'the state can't shine shoes'). Non-functional: no odds, no instructions.", acts=(2, 3))
act("activity.read_the_room", "Read the Room", D, "mission.tax_day", ["P4", "P3"], ("20:00", "02:00"), ["any"],
 {"type": "enter_interior", "marker": "interior.arden_lobby", "note": "Rita: 'Somebody in here is a cop. Which one?'"},
 [O("o1", "dialogue", "Watch the bar. Who's the cop?", "dlg.act_read_room_{round}"), O("o2", "dialogue", "Tell Rita", "dlg.act_read_room_answer")],
 {"round": ["arden_1", "arden_2", "pennsylvania_1", "pennsylvania_2", "shamrock_1"]},
 {"money": 5, "relationships": "+1 Rita for a correct read"}, 240,
 "Observation: tap NPCs to see a 'tell' line (shoes, a ring, a newspaper folded wrong). No timers.",
 "Delphine's power, noticing, as a parlour game. The tells foreshadow how the plainclothes behave in later missions.", acts=(2, 3))
# --- Nick
act("activity.fur_deliveries", "Coats Out of Storage", N, "mission.brownout", ["P1", "P3"], ("09:00", "18:00"), ["any"],
 {"type": "talk", "who": "char.yiannis_doukas", "at": "loc.varelas_loft"},
 [O("o1", "enter_vehicle", "The delivery sedan", "vehicle_role.nick_sedan"), O("o2", "deliver", "Coat to {clientName}", "{client}", item="item.stored_coat")],
 {"client": [["loc.hotel_pennsylvania", "a guest at the Pennsylvania"], ["W 34th St & Broadway", "the Herald Sq fur salon"], ["W 45th St & 8th Ave", "an agent on 45th St"], ["Park Ave S & E 27th St", "a widow, Park Ave S"]]},
 {"perRun": 20, "note": "After M18 some coats are 'missing', and the client scene becomes a lie Nick has to sell (P4)."},
 240, "Short drives, untimed, with one choice in the client conversation.",
 "Nick personally delivering a coat in August is the joke and the point: he does it so clients don't ask for an inventory.", acts=(2, 3), veh=["vehicle_role.nick_sedan"])
act("activity.gentlemens_wager", "Gentlemen's Wager", N, "mission.margin_call", ["P2", "P1"], ("22:00", "03:00"), ["clear", "overcast"],
 {"type": "talk", "at": "loc.steakhouse", "note": "A cabbie at the Iron Gate's back door bets Nick his sedan can't beat a hack to a corner."},
 [O("o1", "enter_vehicle", "Your sedan, 36th & Seventh", "vehicle_role.nick_sedan"),
  O("o2", "goto", "Race to {finishName}", "{finish}", radius=20, race={"rival": "vehicle_role.cab", "oneWaysEnforced": True})],
 {"finish": [["loc.flatiron_prow", "the Flatiron"], ["W 34th St & Broadway", "Herald Square"], ["W 42nd St & 8th Ave", "the Deuce"], ["W 26th St & 8th Ave", "Penn South"], ["Lexington Ave & E 30th St", "Lexington and 30th"]]},
 {"stake": [20, 100], "note": "Wrong-way driving forfeits the bet. Rivals obey the 1974 directions and know the shortcuts."},
 60, "Won by route choice (one-ways; 23rd, 34th and 42nd are two-way), not by drifting. No rubber-banding; rivals race fair. The bet can be declined.",
 "The brief's 'street races obeying 1974 one-ways'. A rich man racing working men for money is its own commentary (P1).", veh=["vehicle_role.nick_sedan"])
act("activity.patronage", "Patronage", N, "mission.the_lease", ["P1", "P4"], ("10:00", "20:00"), ["any"],
 {"type": "talk", "at": "loc.varelas_loft", "note": "Requests arrive at the office: a union widow, a cop's retirement party, a church roof."},
 [O("o1", "dialogue", "Read the request", "dlg.act_patronage_{reqKey}"), O("o2", "goto", "In person: {whereName}", "{where}", radius=15)],
 {"req": [["widow", "the kafeneio", "loc.kafeneio"], ["retirement", "the Shamrock Rail", "loc.cop_bar"], ["church", "the church on 31st", "W 31st St & 7th Ave"],
          ["tenants", "the Corwin lobby", "loc.corwin_hotel"], ["kye", "Hanyang House", "loc.korean_restaurant"]]},
 {"cost": [25, 200], "relationships": "Varies: buying goodwill from people who can tell when it's bought."},
 720, "Spending is a dialogue choice. No timers.",
 "Nick's verb, money, put to the test. Some recipients are grateful, some are insulted, and the cop's party puts him in a photo Delphine might take (a cross-lead consequence).", acts=(2, 3))
act("activity.buyers_tour", "The Buyers' Tour", N, "mission.margin_call", ["P2", "P3"], ("10:00", "17:00"), ["any"],
 {"type": "talk", "at": "loc.hotel_pennsylvania", "note": "Out-of-town buyers in the lobby want to see the district."},
 [O("o1", "enter_vehicle", "Your sedan on Seventh", "vehicle_role.nick_sedan"), O("o2", "goto", "Show them {sightName}", "{sight}", radius=25),
  O("o3", "dialogue", "Sell them the city", "dlg.act_buyers_{sightKey}")],
 {"sight": [["5th Ave & W 34th St", "the Empire State", "empire"], ["W 37th St & 7th Ave", "the Garment District", "garment"], ["W 45th St & 7th Ave", "Times Square", "times"], ["loc.flatiron_prow", "the Flatiron", "flatiron"]]},
 {"perTour": 30}, 1440, "Short drives with a talkative back seat. No timers.",
 "A guided tour that teaches landmarks (P2) while Nick sells a city that's going broke. The buyers' barks (N5) carry period small talk.", acts=(2, 3), veh=["vehicle_role.nick_sedan"])
# --- any lead
act("activity.postcards", "Postcards", [T, D, N], "mission.contact_sheet", ["P2", "P3"], ("06:00", "21:00"), ["clear", "overcast"],
 {"type": "talk", "at": "W 34th St & Broadway", "note": "A postcard printer on Broadway buys photographs of landmarks taken in good light."},
 [O("o1", "photo", "Photograph {landmarkName}", subject="{landmark}", minScreenFraction=0.25)],
 {"landmark": [["loc.flatiron_prow", "the Flatiron"], ["5th Ave & W 34th St", "the Empire State"], ["8th Ave & W 33rd St", "the Garden"], ["loc.hotel_pennsylvania", "the Pennsylvania"],
               ["W 34th St & Broadway", "Herald Square"], ["loc.bryant_park", "Bryant Park"], ["W 45th St & 7th Ave", "Times Square"], ["W 23rd St & 8th Ave", "the Chelsea"],
               ["W 23rd St & 7th Ave", "the towers from 23rd St"]]},
 {"perPhoto": 5, "bonus": "Golden hour pays double."}, 0, "Photo mode with auto-framing. Landmarks are big. No timers.",
 "Photo mode as map teaching. The 'towers from 23rd St' card uses the skyline layer (the World Trade Center).")
act("activity.brownout_relief", "Brownout Relief", [T, D, N], "mission.brownout", ["P5", "P4"], ("20:00", "03:00"), ["any"],
 {"type": "auto", "note": "Only on dim or off power nights (ENGINE N2). Someone on the street needs help."},
 [O("o1", "goto", "{needText}", "{needAt}", radius=20), O("o2", "deliver", "Bring the {itemName}", "{needAt}", item="{item}")],
 {"need": [["Ice for the Corwin's diabetics", "loc.corwin_hotel", "ice", "item.ice"], ["Candles for the Royal Cafeteria", "loc.eighth_ave_cafeteria", "candles", "item.candles"],
           ["Flashlights for the kafeneio", "loc.kafeneio", "flashlights", "item.flashlights"], ["Water to a stuck elevator", "W 30th St & 6th Ave", "water", "item.water"]]},
 {"money": 0, "relationships": "+1 with locals"}, 0, "Short walks or drives in the dark, steering by lit landmarks. No timers.",
 "P5 at street level, for any lead. Each lead's version has its own lines (N5).", acts=(2, 3))
act("activity.payphone_calls", "Payphone Calls", [T, D, N], "mission.night_desk", ["P3", "P4"], ("08:00", "02:00"), ["any"],
 {"type": "auto", "note": "A payphone rings as the lead walks past. Cast members call with small asks."},
 [O("o1", "dialogue", "Answer the payphone", "dlg.act_payphone_{callerKey}"), O("o2", "goto", "{askText}", "{askAt}", radius=15)],
 {"caller": [["carmen", "Ma's prescription, 8th & 25th", "8th Ave & W 25th St"], ["delroy", "Meet Delroy at the cab line", "loc.penn_hack_stand"],
             ["tina", "Bring Tina a coffee", "loc.eighth_ave_cafeteria"], ["eleni", "Eleni needs the ledger", "loc.varelas_loft"], ["bernard", "Bernard's library book", "loc.nypl_main"]]},
 {"money": 0, "relationships": "+1 caller"}, 90, "One tap to answer, then a short errand. Ignoring it costs nothing.",
 "Keeps the cast present between missions, and teaches the phone as the 1974 way to reach someone.")
act("activity.hot_pavement", "Hot Pavement", [T, D, N], "mission.margin_call", ["P3", "P5"], ("13:00", "18:00"), ["clear"],
 {"type": "talk", "at": "W 26th St & 8th Ave", "note": "An ice-cream driver's helper quit in the heat, and the Penn South kids are waiting."},
 [O("o1", "enter_vehicle", "Into the ice-cream truck", "vehicle_role.ice_cream_truck"), O("o2", "goto", "Next stop: {stopName}", "{stop}", radius=20)],
 {"stop": [["W 26th St & 8th Ave", "Penn South plaza"], ["W 27th St & 9th Ave", "Chelsea Park"], ["W 29th St & 9th Ave", "the hydrant on 29th"], ["Madison Ave & E 24th St", "Madison Square"]]},
 {"perRun": 8}, 720,
 "Slow, gentle driving through a playful crowd, with no timers. Content rule: children are ambient customers only and never in traffic danger (the truck is limited to walking speed near crowds).",
 "Summer texture and a breather from the crime plot (P3).", veh=["vehicle_role.ice_cream_truck"])

# Field names for each pool's rows: the keys match the {placeholders} in the objective templates.
FIELDS = {
 "activity.cab_fares": {"pickup": ["pickup"], "drop": ["drop", "dropName"]},
 "activity.collections": {"stop": ["stop", "stopName", "stopKey"]},
 "activity.desk_requests": {"request": ["requestKey", "errandText", "errand"]},
 "activity.bulldog_run": {"stand": ["stand", "standName"]},
 "activity.garment_rush": {"buyer": ["buyer", "buyerName"]},
 "activity.flower_dawn": {"dest": ["dest", "destName"]},
 "activity.tenant_canvass": {"hotel": ["hotel", "hotelName", "hotelKey"]},
 "activity.club_rounds": {"member": ["member", "memberName", "memberKey"]},
 "activity.photo_jobs": {"job": ["subjectAt", "subjectName", "subject"]},
 "activity.walk_her_home": {"walk": ["name", "destName", "dest", "npc", "key"]},
 "activity.numbers_slips": {"spot": ["spot", "spotName"]},
 "activity.read_the_room": {"round": ["round"]},
 "activity.fur_deliveries": {"client": ["client", "clientName"]},
 "activity.gentlemens_wager": {"finish": ["finish", "finishName"]},
 "activity.patronage": {"req": ["reqKey", "whereName", "where"]},
 "activity.buyers_tour": {"sight": ["sight", "sightName", "sightKey"]},
 "activity.postcards": {"landmark": ["landmark", "landmarkName"]},
 "activity.brownout_relief": {"need": ["needText", "needAt", "itemName", "item"]},
 "activity.payphone_calls": {"caller": ["callerKey", "askText", "askAt"]},
 "activity.hot_pavement": {"stop": ["stop", "stopName"]},
}
for a in A:
    spec = FIELDS[a["id"]]
    new = {}
    for pool, rows in a["pool"].items():
        f = spec[pool]
        new[pool] = [dict(zip(f, r if isinstance(r, list) else [r])) for r in rows]
    a["pool"] = new

OUT.write_text(json.dumps({"_note": "Repeatable side activities (N4). Objective templates use {placeholders} filled from the pool entries. The schema is proposed in ENGINE_REQUESTS (From narrative: 9). content.py checks every objective after substituting the longest pool value (40-character limit).", "activities": A}, ensure_ascii=False, indent=2) + "\n")
print(len(A), "activities")
