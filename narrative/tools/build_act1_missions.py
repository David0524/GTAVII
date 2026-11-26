#!/usr/bin/env python3
"""One-off authoring script for the Act 1 mission specs (N4). Writes content/missions/*.json.
Kept in the repo so specs can be regenerated consistently; edit here, not in the JSON."""
import json
from pathlib import Path
OUT = Path(__file__).resolve().parents[2] / "content" / "missions"
T, D, N = "char.teddy_arce", "char.delphine_moore", "char.nick_varelas"

def R(lead, other, n): return {f"{lead}/{other}": n}
def merge(*ds):
    o = {}
    for d in ds: o.update(d)
    return o

M = []
M.append({
 "id": "mission.dusk_on_broadway", "title": "Dusk on Broadway", "number": 1, "act": 1, "chapter": 1,
 "playAs": T, "date": "1974-06-21", "durationMin": 12, "pillars": ["P2", "P4"],
 "giver": "char.carl_mayhew",
 "requires": {"flags": [], "notFlags": [], "act": 1, "timeWindow": ["20:15", "21:45"], "weather": ["clear"], "dateRange": ["1974-06-21", "1974-06-21"]},
 "start": {"type": "auto", "who": "char.carl_mayhew", "at": "loc.flatiron_prow", "spawn": "spawn.player_start",
           "note": "New-game start. The player spawns at the prow facing up Broadway at dusk; Mayhew approaches from the Fifth Ave side."},
 "objectives": [
  {"id": "o1", "type": "dialogue", "script": "dlg.m01_prow", "text": "Meet Mayhew at the Flatiron"},
  {"id": "o2", "type": "escort", "who": "char.carl_mayhew", "pace": "match", "waitRadius": 12,
   "route": ["loc.flatiron_prow", "Broadway & W 26th St", "Broadway & W 28th St", "Broadway & W 30th St", "Broadway & W 31st St"],
   "dialogue": ["dlg.m01_walk_a", "dlg.m01_walk_b", "dlg.m01_walk_c"],
   "fallback": "Chain of goto objectives at each route point, each starting its leg's dialogue on arrival (ENGINE_REQUESTS 4)",
   "text": "Walk up Broadway with Mayhew"},
  {"id": "o3", "type": "dialogue", "script": "dlg.m01_offer", "text": "Hear him out, Broadway & 31st"},
  {"id": "o4", "type": "enter_interior", "marker": "interior.corwin_lobby", "text": "Get to the Corwin, W 31st St"},
  {"id": "o5", "type": "dialogue", "script": "dlg.m01_lobby", "text": "Talk to Mrs. Pruitt in the lobby"},
  {"id": "o6", "type": "wait", "until": "23:00", "at": "interior.corwin_lobby", "text": "Take the night desk at 11 p.m."}
 ],
 "triggers": ["trigger.m01_gates_overheard"],
 "fail": [],
 "checkpoints": ["o2", "o4"],
 "rewards": {"money": 0, "setFlags": [], "unlock": ["mission.night_desk"]},
 "npcs": ["char.carl_mayhew", "char.odessa_pruitt"], "archetypes": ["npc.wholesaler", "npc.park_sleeper", "npc.evening_commuter"], "vehicles": [],
 "locations": ["loc.flatiron_prow", "Broadway & W 26th St", "Broadway & W 28th St", "Broadway & W 31st St", "loc.corwin_hotel"],
 "mobile": "No fail states. The escort matches the player's pace and waits, so there's no exact pacing on touch. Dialogue segments are gated by route leg. Objective text names real corners. One untimed choice (3 options). Long dusk light keeps the walk readable on small screens.",
 "design": "Earns the spawn shot. The streetlights come on as the pair walk north (the engine dusk cycle at 20:31 sunset). Mayhew's 'Not anymore' about W 35th St seeds the 1971 secret."
})
M.append({
 "id": "mission.night_desk", "title": "Night Desk", "number": 2, "act": 1, "chapter": 1,
 "playAs": T, "date": "1974-06-22", "durationMin": 10, "pillars": ["P3", "P5"], "giver": "char.odessa_pruitt",
 "requires": {"flags": [], "notFlags": [], "act": 1, "timeWindow": ["21:00", "23:30"], "weather": ["any"], "dateRange": ["1974-06-22", "1974-07-04"]},
 "start": {"type": "enter_interior", "marker": "interior.corwin_lobby", "at": "loc.corwin_hotel"},
 "objectives": [
  {"id": "o1", "type": "dialogue", "script": "dlg.m02_notice", "text": "Read the notice on the mailboxes"},
  {"id": "o2", "type": "dialogue", "script": "dlg.m02_prentiss", "text": "Meet the 'new management'"},
  {"id": "o3", "type": "enter_interior", "marker": "interior.corwin_floor11", "text": "Check on Mr. Hollis, 11th floor"},
  {"id": "o4", "type": "dialogue", "script": "dlg.m02_hollis", "text": "Talk to Mr. Hollis, room 1112"},
  {"id": "o5", "type": "enter_interior", "marker": "interior.corwin_lobby", "text": "Back to the desk, lobby"},
  {"id": "o6", "type": "dialogue", "script": "dlg.m02_carmen_phone", "text": "Answer the desk phone"},
  {"id": "o7", "type": "wait", "until": "23:00", "at": "interior.corwin_lobby", "text": "Take the night desk at 11 p.m."}
 ],
 "fail": [], "checkpoints": ["o3", "o5"],
 "rewards": {"money": 0, "setFlags": ["flag.corwin_sold"], "unlock": ["mission.hack"],
             "relationships": merge(R(T, "char.odessa_pruitt", 1), R(T, "char.vic_prentiss", -1))},
 "npcs": ["char.odessa_pruitt", "char.bernard_ostrow", "char.vic_prentiss", "char.walter_hollis", "char.inez_rivera", "char.gus_wilkie", "char.carmen_arce"],
 "archetypes": ["npc.sro_resident"], "vehicles": [],
 "locations": ["loc.corwin_hotel"],
 "mobile": "Interior-only hub tutorial: big USE prompts on the desk, the mailboxes, the elevator and room 1112. The elevator ride is a 3-second cut, not a control. No timers.",
 "design": "Teaches the hub: desk ledger (save), room-key board (fast travel to floors), phone (calls from cast). Prentiss's first friendly offer establishes P5. Bernard reads the notice aloud and names 'Corwin Residential Associates, H. Lisle, counsel'."
})
M.append({
 "id": "mission.hack", "title": "Hack", "number": 3, "act": 1, "chapter": 1,
 "playAs": T, "date": "1974-06-24", "durationMin": 14, "pillars": ["P2", "P3"], "giver": "char.delroy_tate",
 "requires": {"flags": [], "notFlags": [], "act": 1, "timeWindow": ["19:00", "23:00"], "weather": ["any"], "dateRange": ["1974-06-24", "1974-07-04"]},
 "start": {"type": "talk", "who": "char.delroy_tate", "at": "loc.penn_hack_stand"},
 "objectives": [
  {"id": "o1", "type": "dialogue", "script": "dlg.m03_delroy", "text": "Talk to Delroy, Penn Station cab line"},
  {"id": "o2", "type": "enter_vehicle", "vehicle": "vehicle_role.cab", "text": "Get in Delroy's cab"},
  {"id": "o3", "type": "goto", "to": "W 23rd St & 7th Ave", "radius": 20, "text": "Fare: down Seventh to 23rd St",
   "hint": "Seventh runs downtown. Straight shot."},
  {"id": "o4", "type": "goto", "to": "W 34th St & 6th Ave", "radius": 20, "text": "Fare: up Sixth to Herald Square",
   "hint": "Sixth runs uptown. Cut over on 23rd, it's two-way."},
  {"id": "o5", "type": "dialogue", "script": "dlg.m03_navarro", "text": "Navarro's waving you down"},
  {"id": "o6", "type": "goto", "to": "W 42nd St & 8th Ave", "radius": 20, "text": "Fare: up Eighth to 42nd St",
   "hint": "Eighth runs uptown. Don't try Seventh."},
  {"id": "o7", "type": "goto", "to": "loc.penn_hack_stand", "radius": 15, "text": "Bring the cab back to Penn Station"},
  {"id": "o8", "type": "dialogue", "script": "dlg.m03_payout", "text": "Square up with Delroy"}
 ],
 "fail": [{"type": "vehicle_destroyed"}], "checkpoints": ["o3", "o5", "o7"],
 "rewards": {"money": 14, "setFlags": [], "unlock": ["mission.surcharge", "activity.cab_fares"],
             "relationships": merge(R(T, "char.delroy_tate", 1), R(T, "char.luis_navarro", 1))},
 "npcs": ["char.delroy_tate", "char.luis_navarro"], "archetypes": ["npc.cab_fare_businessman", "npc.cab_fare_tourist", "npc.cab_fare_night_worker"],
 "vehicles": ["vehicle_role.cab"],
 "locations": ["loc.penn_hack_stand", "W 23rd St & 7th Ave", "W 34th St & 6th Ave", "W 42nd St & 8th Ave"],
 "mobile": "No timers on fares (the meter is flavour). Wrong-way driving is allowed but honked at, and the fare complains, which teaches the one-ways without punishing. Hints are written as a 1974 New Yorker would give directions. The fare to 42nd St shows the Deuce's marquees for the first time.",
 "design": "P2 tutorial. Each fare follows one avenue's 1974 direction. On the last fare, Teddy passes a woman in an oxblood dress at 8th & W 40th (Delphine, unnamed). It's foreshadowing only, with no interaction."
})
M.append({
 "id": "mission.surcharge", "title": "Surcharge", "number": 4, "act": 1, "chapter": 2,
 "playAs": T, "date": "1974-06-26", "durationMin": 15, "pillars": ["P1", "P3"], "giver": "char.sam_feld",
 "requires": {"flags": [], "notFlags": [], "act": 1, "timeWindow": ["07:00", "15:00"], "weather": ["clear", "overcast"], "dateRange": ["1974-06-25", "1974-07-04"]},
 "start": {"type": "talk", "who": "char.sam_feld", "at": "loc.feld_loft", "note": "Carmen set it up: twenty dollars for a day's carrying."},
 "objectives": [
  {"id": "o1", "type": "dialogue", "script": "dlg.m04_feld", "text": "See Mr. Feld, W 37th St loft"},
  {"id": "o2", "type": "follow", "target": "char.dwayne_little", "keepWithinM": 40, "text": "Follow Dwayne and the racks"},
  {"id": "o3", "type": "deliver", "item": "item.feld_sample_racks", "to": "W 35th St & 7th Ave", "text": "Racks to the store dock, W 35th St",
   "note": "Loading dock of the Herald Square department store (generic until N6 names it)."},
  {"id": "o4", "type": "deliver", "item": "item.feld_sample_bags", "to": "loc.baek_wholesale", "text": "Sample bags to W 29th St"},
  {"id": "o5", "type": "dialogue", "script": "dlg.m04_baek_envelope", "text": "Watch the truck at the Baeks'",
   "note": "A Carriers' driver demands the surcharge from Baek. Choice: step in, or walk on."},
  {"id": "o6", "type": "goto", "to": "W 37th St & 7th Ave", "radius": 20, "text": "Back to 37th & Seventh"},
  {"id": "o7", "type": "dialogue", "script": "dlg.m04_augie", "text": "Augie Lomax wants a word"}
 ],
 "fail": [{"type": "target_lost"}], "checkpoints": ["o2", "o3", "o5", "o6"],
 "rewards": {"money": 20, "setFlags": ["flag.saw_surcharge"], "unlock": ["mission.contact_sheet"],
             "relationships": merge(R(T, "char.dwayne_little", 1), R(T, "char.augie_lomax", -1))},
 "npcs": ["char.sam_feld", "char.dwayne_little", "char.jung_ho_baek", "char.augie_lomax", "char.hector_villalba", "char.carmen_arce"],
 "archetypes": ["npc.garment_pushboy", "npc.garment_cutter", "npc.truck_driver"],
 "vehicles": ["vehicle_role.box_truck"],
 "locations": ["loc.feld_loft", "W 35th St & 7th Ave", "loc.baek_wholesale", "W 37th St & 7th Ave"],
 "mobile": "Following is generous (40 m) through rush-hour crowds, and losing Dwayne only fails after 30 s out of range with a 'Dwayne's at 36th & Seventh' hint. Pushing a rack is one held button. The step-in choice is untimed.",
 "design": "The surcharge is shown, not explained: envelopes on dashboards, the Baeks' refusal, Augie's 'I remember you from the Christmas list'. The choice sets relationships only (Baek +1 and Augie −1 if Teddy steps in; Baek −1 if he walks on). Those are applied in the dialogue's setRelationships."
})
M.append({
 "id": "mission.contact_sheet", "title": "Contact Sheet", "number": 5, "act": 1, "chapter": 2,
 "playAs": T, "date": "1974-06-28", "durationMin": 13, "pillars": ["P1", "P2"], "giver": "char.bernard_ostrow",
 "requires": {"flags": ["flag.corwin_sold"], "notFlags": [], "act": 1, "timeWindow": ["12:20", "14:30"], "weather": ["clear", "overcast"], "dateRange": ["1974-06-27", "1974-07-04"]},
 "start": {"type": "talk", "who": "char.bernard_ostrow", "at": "loc.corwin_hotel",
           "note": "Bernard: 'Lisle eats at twelve-forty. Men like that always eat at twelve-forty.' He lends Teddy his late brother's camera."},
 "objectives": [
  {"id": "o1", "type": "goto", "to": "5th Ave & W 36th St", "radius": 25, "text": "Get to Fifth Ave & 36th St"},
  {"id": "o2", "type": "wait", "until": "12:40", "text": "Watch Lisle's door, Fifth & 36th"},
  {"id": "o3", "type": "follow", "target": "char.howard_lisle", "keepWithinM": 60, "text": "Tail Lisle to lunch"},
  {"id": "o4", "type": "photo", "subject": "char.howard_lisle", "minScreenFraction": 0.08, "text": "Photograph Lisle at the counter"},
  {"id": "o5", "type": "dialogue", "script": "dlg.m05_recognition", "text": "Remember where you've seen him"},
  {"id": "o6", "type": "follow", "target": "char.howard_lisle", "keepWithinM": 70, "text": "Tail Lisle to the Hotel Pennsylvania"},
  {"id": "o7", "type": "photo", "subject": "char.carl_mayhew", "with": "char.howard_lisle", "minScreenFraction": 0.06, "text": "Photograph who he's meeting"}
 ],
 "fail": [{"type": "target_lost"}, {"type": "spotted", "by": "char.howard_lisle", "withinM": 6, "note": "Proposed fail type (ENGINE_REQUESTS 8). Fallback: target_lost only."}],
 "checkpoints": ["o3", "o5", "o6"],
 "rewards": {"money": 0, "setFlags": ["flag.saw_lisle_mayhew"], "unlock": ["mission.the_club"], "items": ["item.photo_lisle_counter", "item.photo_lisle_mayhew"]},
 "npcs": ["char.howard_lisle", "char.marjorie_kell", "char.carl_mayhew", "char.ruth_calloway", "char.bernard_ostrow"],
 "archetypes": ["npc.office_lunch_crowd", "npc.hotel_bellhop"], "vehicles": [],
 "locations": ["loc.lisle_office", "loc.lisle_luncheonette", "loc.hotel_pennsylvania"],
 "mobile": "The photo objectives auto-frame when the subject is in view and the shutter button is held, so precise aim isn't needed. The size threshold is generous. The tail follows a fixed, learnable route (Lisle walks W 36th → 6th Ave → W 33rd → 7th Ave), so a player who knows it can wait ahead. Lunch-crowd density gives cover.",
 "design": "Lisle's routine (cast schedule 12:40) becomes gameplay. Calloway sits in a parked car across Fifth Ave and Teddy notices her (one line), seeding M12. The photo with Mayhew sets up M7's choice."
})
M.append({
 "id": "mission.the_club", "title": "The Club", "number": 6, "act": 1, "chapter": 2,
 "playAs": D, "date": "1974-06-30", "durationMin": 12, "pillars": ["P1", "P3", "P4"], "giver": "char.rita_haines",
 "requires": {"flags": [], "notFlags": [], "act": 1, "timeWindow": ["18:00", "22:30"], "weather": ["any"], "dateRange": ["1974-06-30", "1974-06-30"],
              "weekday": ["sun"]},
 "start": {"type": "auto", "at": "loc.arden_hotel", "cut": "transition",
           "note": "Delphine's introduction: the first reel-change cut (ENGINE N5). Title card: DELPHINE MOORE · EIGHTH AVENUE."},
 "objectives": [
  {"id": "o1", "type": "dialogue", "script": "dlg.m06_payout_table", "text": "Run the club meeting, Rita's bar"},
  {"id": "o2", "type": "deliver", "item": "item.club_payout_claudette", "to": "loc.hotel_pennsylvania", "text": "Pay Claudette, Hotel Pennsylvania",
   "note": "Staff entrance on W 33rd St. On foot down Eighth Ave."},
  {"id": "o3", "type": "dialogue", "script": "dlg.m06_claudette", "text": "Hand Claudette her month"},
  {"id": "o4", "type": "goto", "to": "8th Ave & W 38th St", "radius": 20, "text": "Back up Eighth to 38th St"},
  {"id": "o5", "type": "dialogue", "script": "dlg.m06_the_tax", "text": "Brannock's waiting at 38th St"},
  {"id": "o6", "type": "enter_interior", "marker": "interior.arden_lobby", "text": "Get back to the Arden, W 39th St"},
  {"id": "o7", "type": "dialogue", "script": "dlg.m06_marcus_stairs", "text": "Marcus has something to show you"}
 ],
 "fail": [], "checkpoints": ["o2", "o5"],
 "rewards": {"money": 0, "setFlags": ["flag.tax_raised"], "unlock": ["mission.yes"],
             "relationships": merge(R(D, "char.claudette_bijou", 1), R(D, "char.jimmy_brannock", -1), R(D, "char.marcus_teague", 1))},
 "npcs": ["char.rita_haines", "char.tina_mercado", "char.claudette_bijou", "char.jimmy_brannock", "char.lonnie_gage", "char.marcus_teague"],
 "archetypes": ["npc.strip_worker", "npc.bus_terminal_crowd", "npc.hotel_bar_regular"], "vehicles": [],
 "locations": ["loc.arden_hotel", "loc.hotel_pennsylvania", "8th Ave & W 38th St"],
 "mobile": "Walking only, with no timers. The Brannock scene's choice ('Pay the fifty' or 'Pay, and read his badge') is untimed and both options pay. It teaches that Delphine's power is noticing. Large USE prompt for the handover.",
 "design": "Shows the women's club as an institution: a table, a book in her head, a Sunday ritual. Sex work is present as context (where the money comes from; the corner) with nothing sexual on screen. Tina's bruise is visible and unexplained. Marcus shows the back stairs, which teaches M8's escape route."
})
M.append({
 "id": "mission.yes", "title": "Yes", "number": 7, "act": 1, "chapter": 3,
 "playAs": T, "date": "1974-07-01", "durationMin": 11, "pillars": ["P4", "P5"], "giver": "char.carmen_arce",
 "requires": {"flags": ["flag.corwin_sold"], "notFlags": [], "act": 1, "timeWindow": ["16:00", "21:00"], "weather": ["any"], "dateRange": ["1974-07-01", "1974-07-03"]},
 "start": {"type": "auto", "at": "loc.corwin_hotel", "note": "Teddy wakes to vacate notices being slid under doors. Prentiss is in the corridor."},
 "objectives": [
  {"id": "o1", "type": "dialogue", "script": "dlg.m07_notices", "text": "Find out who's sliding the notices"},
  {"id": "o2", "type": "goto", "to": "loc.penn_south", "radius": 25, "text": "Dinner at Ma's, Penn South"},
  {"id": "o3", "type": "dialogue", "script": "dlg.m07_carmen", "text": "Sit down. Eat. Talk to Ma"},
  {"id": "o4", "type": "enter_interior", "marker": "interior.station_house_desk", "text": "Find Mayhew: station house, W 31st"},
  {"id": "o5", "type": "dialogue", "script": "dlg.m07_kearney", "text": "Ask Kearney at the front desk"},
  {"id": "o6", "type": "enter_interior", "marker": "interior.shamrock_rail", "text": "The Shamrock Rail, 31st & Eighth"},
  {"id": "o7", "type": "dialogue", "script": "dlg.m07_yes", "text": "Tell Mayhew yes"}
 ],
 "fail": [], "checkpoints": ["o2", "o4", "o6"],
 "rewards": {"money": 200, "setFlags": ["flag.vacate_notices", "flag.teddy_collector"], "unlock": ["mission.back_stairs"],
             "items": ["item.collection_list_week1"],
             "relationships": merge(R(T, "char.carmen_arce", 1), R(T, "char.pat_kearney", 1))},
 "npcs": ["char.vic_prentiss", "char.walter_hollis", "char.carmen_arce", "char.pat_kearney", "char.carl_mayhew"],
 "archetypes": ["npc.sro_resident", "npc.penn_south_neighbor", "npc.off_duty_cop"], "vehicles": [],
 "locations": ["loc.corwin_hotel", "loc.penn_south", "loc.station_house", "loc.cop_bar"],
 "mobile": "Three walking legs of under two blocks each, with a checkpoint at each. The decisive choice is untimed. If the player has the M5 photo, it adds a fourth option ('Show him the photograph').",
 "design": "Teddy says yes to buy the Corwin time, and Mayhew promises it stays open through Labor Day (a lie). Showing the photo sets flag.mayhew_saw_photo (applied in the dialogue). The $200 advance is the first week's pay, and P1 makes it feel heavy."
})
M.append({
 "id": "mission.back_stairs", "title": "Back Stairs", "number": 8, "act": 1, "chapter": 3,
 "playAs": D, "date": "1974-07-02", "durationMin": 10, "pillars": ["P1", "P2"], "giver": "char.marcus_teague",
 "requires": {"flags": ["flag.tax_raised"], "notFlags": [], "act": 1, "timeWindow": ["21:00", "01:00"], "weather": ["any"], "dateRange": ["1974-07-02", "1974-07-03"]},
 "start": {"type": "auto", "at": "loc.arden_hotel", "cut": "transition"},
 "objectives": [
  {"id": "o1", "type": "goto", "to": "8th Ave & W 38th St", "radius": 25, "text": "Find Brannock's car, Eighth & 38th"},
  {"id": "o2", "type": "photo", "subject": "char.jimmy_brannock", "with": "char.lonnie_gage", "minScreenFraction": 0.06,
   "text": "Photograph the handoff"},
  {"id": "o3", "type": "dialogue", "script": "dlg.m08_spotted", "text": "Brannock saw the flash"},
  {"id": "o4", "type": "evade", "from": ["char.jimmy_brannock"], "breakDistanceM": 80, "safeZones": ["interior.arden_back_stairs", "loc.bauer_arcade"],
   "fallback": "goto interior.arden_back_stairs with timeLimitSec 90 (timer fail = caught)", "text": "Lose him: the Arden's back stairs"},
  {"id": "o5", "type": "enter_interior", "marker": "interior.arden_lobby", "text": "Sit at Rita's bar like nothing happened"},
  {"id": "o6", "type": "dialogue", "script": "dlg.m08_rita", "text": "Let Rita cover for you"}
 ],
 "fail": [{"type": "caught", "note": "Proposed (ENGINE_REQUESTS 8). Fallback: timer."}], "checkpoints": ["o2", "o4"],
 "rewards": {"money": 0, "setFlags": ["flag.photo_file_started"], "unlock": ["mission.independence_day"],
             "items": ["item.print_brannock_1"],
             "relationships": merge(R(D, "char.rita_haines", 1), R(D, "char.jimmy_brannock", -1))},
 "npcs": ["char.jimmy_brannock", "char.lonnie_gage", "char.marcus_teague", "char.rita_haines", "char.ray_bauer", "char.dennis_wurtz"],
 "archetypes": ["npc.strip_worker", "npc.plainclothes", "npc.arcade_patron"], "vehicles": ["vehicle_role.unmarked_sedan"],
 "locations": ["8th Ave & W 38th St", "loc.arden_hotel", "loc.bauer_arcade"],
 "mobile": "The chase is on foot and solved by route knowledge (M6 taught the back stairs). Brannock is slower than Delphine and loses her at any door with two exits. There's no aiming; the photo auto-frames. Generous break distance.",
 "design": "Delphine's power is witnessing. Bauer's arcade is a second safe zone, which seeds his double life. Wurtz is glimpsed in the car, not confronted."
})
M.append({
 "id": "mission.independence_day", "title": "Independence Day", "number": 9, "act": 1, "chapter": 3,
 "playAs": T, "switchPoints": ["o5", "o8"], "date": "1974-07-04", "durationMin": 18, "pillars": ["P1", "P4"], "giver": "char.carl_mayhew",
 "requires": {"flags": ["flag.teddy_collector", "flag.photo_file_started"], "notFlags": [], "act": 1, "timeWindow": ["20:00", "23:30"], "weather": ["clear"], "dateRange": ["1974-07-04", "1974-07-04"]},
 "start": {"type": "auto", "at": "loc.corwin_hotel", "note": "Holiday quiet; fireworks thud from the rivers (audio). The district is almost empty."},
 "objectives": [
  {"id": "o1", "type": "goto", "to": "loc.poole_shine", "radius": 15, "text": "First collection: Earl, 42nd & Seventh"},
  {"id": "o2", "type": "dialogue", "script": "dlg.m09_earl", "text": "Collect from Earl Poole"},
  {"id": "o3", "type": "enter_interior", "marker": "interior.royal_cafeteria", "text": "Next: Royal Cafeteria, Eighth & 40th"},
  {"id": "o4", "type": "dialogue", "script": "dlg.m09_envelope", "text": "Collect from the woman in oxblood"},
  {"id": "o5", "type": "switch_to", "character": D, "cut": "transition", "text": "(Delphine)"},
  {"id": "o6", "type": "follow", "target": T, "keepWithinM": 70, "avoidSpottedM": 10, "text": "Follow your money down Eighth"},
  {"id": "o7", "type": "dialogue", "script": "dlg.m09_ambush", "text": "Lonnie's men, 35th & Eighth"},
  {"id": "o8", "type": "switch_to", "character": T, "cut": "hard", "text": "(Teddy)"},
  {"id": "o9", "type": "evade", "from": ["npc.lonnie_crew"], "breakDistanceM": 90, "safeZones": ["interior.penn_station_concourse"],
   "fallback": "goto interior.penn_station_concourse with timeLimitSec 120", "text": "Lose them in Penn Station, Eighth Ave"},
  {"id": "o10", "type": "dialogue", "script": "dlg.m09_concourse", "text": "Catch your breath with Delphine"}
 ],
 "fail": [{"type": "caught", "note": "Proposed. Fallback: timer."}, {"type": "target_lost", "objective": "o6"}],
 "checkpoints": ["o3", "o5", "o8", "o10"],
 "rewards": {"money": 0, "setFlags": ["flag.act2_started"], "unlock": ["mission.five_am"], "act": 2,
             "relationships": merge(R(T, D, 1), R(D, T, 1), R(T, "char.earl_poole", 1))},
 "npcs": ["char.earl_poole", "char.dwayne_little", "char.carl_mayhew", "char.lonnie_gage", "char.tina_mercado", "char.jimmy_brannock"],
 "archetypes": ["npc.lonnie_crew", "npc.holiday_stroller", "npc.penn_porter"], "vehicles": [],
 "locations": ["loc.poole_shine", "loc.eighth_ave_cafeteria", "8th Ave & W 35th St", "loc.penn_station_lockers"],
 "mobile": "Four checkpoints. Switches only at the safe beats (o5 after the handover, o8 at the ambush). The tail is generous; 'spotted' is warned twice before it fails. The escape is solved by Penn Station's two entrances (Eighth Ave and Seventh Ave), so it's route knowledge, not speed. No fighting.",
 "design": "End of Act 1. The first two-lead mission makes P1 literal: Delphine follows her own money. Lonnie's ambush, arranged with Brannock to make the civilian bagman look weak, forces the two together. In the concourse dialogue Teddy chooses whether to hand back her fifty (flag.teddy_returned_tax, applied in the dialogue). Mayhew finds the count short in M10."
})

for m in M:
    (OUT / f"{m['id'].split('.',1)[1]}.json").write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n")
print(len(M), "missions written")
