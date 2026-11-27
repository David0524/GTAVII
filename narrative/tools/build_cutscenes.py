#!/usr/bin/env python3
"""Key-scene cutscene scripts (shot lists). Format proposed to the UI & cinematics chat (see m01_opening.json).
Dialogue refs point at content/dialogue lines. Written by the lead writer (not delegated)."""
import json
from pathlib import Path
OUT = Path(__file__).resolve().parents[2] / "content" / "cutscenes"


def shot(id, type_, lens, move, frame, blocking, beats, dur, dlg=None, audio=None, light=None, film=None):
    s = {"id": id, "type": type_, "lensMm": lens, "move": move, "framing": frame, "blocking": blocking, "beats": beats, "durationSec": dur}
    for k, v in (("dialogue", dlg), ("audio", audio), ("lighting", light), ("film", film)):
        if v: s[k] = v
    return s


CUTS = [
 {"id": "cut.m09_concourse", "mission": "mission.independence_day", "before": "o10", "time": "22:40", "date": "1974-07-04", "skippable": True,
  "logline": "Under Penn Square Garden, after the fight: two strangers who were on opposite sides of an envelope an hour ago.",
  "shots": [
   shot("s1", "wide", 24, "static", "The 1968 concourse: low ceiling, fluorescent strips, a shuttered newsstand", "Teddy and Delphine burst through the Eighth Ave doors and slow to a walk", ["Fireworks thud far above, through concrete"], 5,
        audio=["distant fireworks", "a train announcement, muffled"], light="cold fluorescent; one tube flickering", film=["grain", "slight overexposure on the tubes"]),
   shot("s2", "two-shot", 35, "handheld, settling", "Both against a tiled pillar, breathing", "Teddy pats his jacket for the envelopes", ["l1–l2"], 8, dlg=["dlg.m09_concourse#l1", "dlg.m09_concourse#l2"]),
   shot("s3", "close", 85, "static", "Delphine, half-smile, eyes on the stairs behind him", "", ["l3: she followed him"], 4, dlg=["dlg.m09_concourse#l3"]),
   shot("s4", "close", 85, "static", "Teddy, a laugh that doesn't make it out", "", ["l4"], 4, dlg=["dlg.m09_concourse#l4"]),
   shot("s5", "insert", 100, "static", "The envelope with her fifty, in his hand between them", "", ["The choice c1 is untimed; the envelope holds frame"], 0, dlg=["dlg.m09_concourse#c1"]),
   shot("s6", "two-shot", 40, "slow dolly back", "The two of them small in the long concourse", "They walk toward the Seventh Ave exit together", ["l_end–l_end2: names exchanged"], 7,
        dlg=["dlg.m09_concourse#l_end", "dlg.m09_concourse#l_end2"], film=["fade to the Act 2 title card: HEAT"])]},
 {"id": "cut.m15_vault_door", "mission": "mission.brownout", "before": "o8", "time": "00:35", "date": "1974-07-20", "skippable": True,
  "logline": "A dark loading dock on W 30th St. Ice steaming, a rich man soaked to the elbows, and a collector in a cheap tan coat.",
  "shots": [
   shot("s1", "wide", 28, "slow crane down from the dark loft windows", "W 30th St in the brownout: no streetlights, the ice truck's headlights the only light", "Men hand ice blocks down a chain into the vault", ["Steam rises off the ice in the headlights"], 6,
        audio=["dripping", "a compressor not running (silence)", "a distant siren"], light="headlights only; deep shadow", film=["grain heavy", "lifted blacks"]),
   shot("s2", "medium", 50, "static", "Nick in a dinner jacket, bow tie loose, sleeves rolled, lifting ice like a nailer", "Teddy steps into the headlight beam from the street", ["l1"], 4, dlg=["dlg.m15_teddy_at_door#l1"]),
   shot("s3", "over-the-shoulder", 50, "static", "Over Teddy's shoulder: Nick, incredulous", "", ["l2–l3"], 7, dlg=["dlg.m15_teddy_at_door#l2", "dlg.m15_teddy_at_door#l3"]),
   shot("s4", "two-shot", 40, "slow push in", "Profile, the truck lights between them", "Yiannis hands Teddy an envelope without looking at either man", ["l4–l5"], 7, dlg=["dlg.m15_teddy_at_door#l4", "dlg.m15_teddy_at_door#l5"]),
   shot("s5", "close", 85, "static", "Nick's face, the steam behind him", "", ["l6: 'I own the Corwin. On paper.'"], 4, dlg=["dlg.m15_teddy_at_door#l6"]),
   shot("s6", "close", 85, "static", "Teddy, cold", "He turns and walks back into the dark", ["l7"], 4, dlg=["dlg.m15_teddy_at_door#l7"]),
   shot("s7", "medium", 40, "static, long hold", "Nick alone in the headlights, water dripping off his cuffs", "", ["l8 (inner)"], 5, dlg=["dlg.m15_teddy_at_door#l8"])]},
 {"id": "cut.m18_the_count", "mission": "mission.cold_storage", "before": "o10", "time": "03:05", "date": "1974-07-27", "skippable": True,
  "logline": "3 a.m. in a half-empty vault. The truth about the coats, depending on whether Yiannis still believes in Nick.",
  "shots": [
   shot("s1", "wide", 24, "static", "The vault: half the racks bare, melting ice on the floor, one bulb", "Yiannis with a clipboard; Nick and Eleni at the door", ["The bare racks are the reveal"], 5, light="single bulb, hard shadows", film=["grain", "slight gate weave"]),
   shot("s2", "close", 85, "static", "Yiannis's hands on the clipboard", "", ["Variant A (relationship +3): l1t–l2t, the true count", "Variant B: l1f, the number Nick wants"], 8,
        dlg=["dlg.m18_count#l1t", "dlg.m18_count#l2t", "dlg.m18_count#l1f"]),
   shot("s3", "close", 85, "static", "Nick, shaken", "", ["l1"], 4, dlg=["dlg.m18_count#l1"]),
   shot("s4", "medium", 50, "slow drift", "Eleni in the doorway", "", ["l2"], 5, dlg=["dlg.m18_count#l2"], film=["fade to black on the bulb"])]},
 {"id": "cut.m22_the_address", "mission": "mission.the_address", "before": "o1", "time": "21:00", "date": "1974-08-08", "skippable": True,
  "logline": "The Corwin lobby, every resident around a dead man's radio. History on a three-inch speaker. No real person seen or named.",
  "shots": [
   shot("s1", "wide", 24, "slow push in", "The lobby in folding chairs, facing the desk; Hollis's radio as the altar", "Odessa centre front in her hat", ["The ACT 3 title card fades: RESIGNATION"], 6, audio=["the radio narration (invented, never a real voice)"], light="warm lamps, a fan turning"),
   shot("s2", "insert", 100, "static", "The radio's dial glow", "", ["l1–l2 (Radio)"], 7, dlg=["dlg.m22_lobby_radio#l1", "dlg.m22_lobby_radio#l2"]),
   shot("s3", "medium close", 50, "static", "Odessa, still", "", ["l3"], 4, dlg=["dlg.m22_lobby_radio#l3"]),
   shot("s4", "medium", 40, "static", "Bernard beside her, a newspaper on his knee", "", ["l4"], 4, dlg=["dlg.m22_lobby_radio#l4"]),
   shot("s5", "two-shot", 35, "handheld", "Manny at the desk holding the phone out over the glass; Teddy", "", ["l5"], 4, dlg=["dlg.m22_lobby_radio#l5"])]},
 {"id": "cut.m25_the_car", "mission": "mission.the_car", "before": "o4", "time": "23:30", "date": "1974-08-16", "skippable": True,
  "logline": "W 35th St in the rain. The same car, the same seat, three years later. The truth about 1971.",
  "shots": [
   shot("s1", "wide", 32, "static", "Rain on W 35th St; one parked sedan, wipers off", "Teddy walks to the passenger door and gets in", ["Echo of 1971: framed exactly like the flashback still"], 6, audio=["rain on the roof", "a subway train rumbling under the street"], light="sodium through rain-streaked glass"),
   shot("s2", "two-shot", 28, "static, interior", "From the back seat: two silhouettes, the windshield running with water", "Nobody looks at anybody", ["l1–l2"], 7, dlg=["dlg.m25_the_car#l1", "dlg.m25_the_car#l2"]),
   shot("s3", "close", 85, "static", "Mayhew, profile, lit by a passing car", "", ["l3–l4"], 9, dlg=["dlg.m25_the_car#l3", "dlg.m25_the_car#l4"]),
   shot("s4", "close", 85, "slow push", "Mayhew breaking", "", ["l5"], 5, dlg=["dlg.m25_the_car#l5"]),
   shot("s5", "close", 85, "static", "Teddy", "", ["l6"], 4, dlg=["dlg.m25_the_car#l6"]),
   shot("s6", "two-shot", 35, "static", "Both men, wipers suddenly on", "The choice c1 (untimed)", ["c1"], 0, dlg=["dlg.m25_the_car#c1"]),
   shot("s7", "wide", 32, "crane up", "The car on the empty street", "", ["l_end (inner)"], 5, dlg=["dlg.m25_the_car#l_end"], film=["rain streaks", "halation"])]},
 {"id": "cut.m32_prow", "mission": "mission.labor_day", "before": "o8", "time": "20:30", "date": "1974-09-02", "skippable": False,
  "logline": "Dusk on Broadway again. Three people at the Flatiron's prow, and whoever is facing which way.",
  "shots": [
   shot("s1", "establishing aerial (crane down)", 40, "the same crane as cut.m01_opening s1, mirrored", "Madison Sq Park at Labor Day dusk; the lights coming on", "", ["Visual rhyme with the opening"], 8, audio=["holiday quiet", "a single cab horn"]),
   shot("s2", "wide", 28, "static", "The prow; Nick's sedan parked on the sidewalk; Delphine arriving on foot", "", ["l1–l2"], 7, dlg=["dlg.m32_prow#l1", "dlg.m32_prow#l2"]),
   shot("s3", "medium close", 85, "static", "Teddy, where he stood in the first shot of the game", "", ["l3a/l3b/l3c/l3d by ending"], 5,
        dlg=["dlg.m32_prow#l3a", "dlg.m32_prow#l3b", "dlg.m32_prow#l3c", "dlg.m32_prow#l3d"]),
   shot("s4", "two-shot", 50, "static", "Delphine and Nick", "", ["l4a/l4b/l4c and l5a/l5b/l5c by resolution"], 8,
        dlg=["dlg.m32_prow#l4a", "dlg.m32_prow#l4b", "dlg.m32_prow#l4c", "dlg.m32_prow#l5a", "dlg.m32_prow#l5b", "dlg.m32_prow#l5c"]),
   shot("s5", "medium", 40, "slow push", "Teddy, the line from the opening", "", ["l3: 'like a fire hydrant'"], 4, dlg=["dlg.m32_prow#l3"]),
   shot("s6", "final", 28, "Testimony: camera stays as Teddy walks downtown. Public: he walks uptown, as at the start. New Pad: a car pulls up and he gets in the back. Ashes: the prow empty, seen from a cab window.", "Per N3 §4", "", ["l7a/l7b/l7c/l7d by ending", "FADE OUT; credits over the dusk"], 10,
        dlg=["dlg.m32_prow#l7a", "dlg.m32_prow#l7b", "dlg.m32_prow#l7c", "dlg.m32_prow#l7d"], film=["grain", "end-of-reel flare"])]},
]

def br(choice, opt):
    """Branch shot: shown only when choice `choice` resolved to option index `opt` (0-based). Proposed to UI as showIf."""
    return {"choice": choice, "option": opt}


CUTS += [
 {"id": "cut.m06_payout_table", "mission": "mission.the_club", "before": "o1", "time": "18:20", "date": "1974-06-30", "skippable": True,
  "logline": "Delphine's first scene. Sunday at the Arden's lobby bar: twenty women's savings on one table, and one bruise nobody will name.",
  "shots": [
   shot("s1", "wide", 28, "slow dolly along the bar", "The Arden's lobby bar on a Sunday: ceiling fans, a jukebox unplugged, four women at the back table", "Rita wipes the bar; Delphine at the table with a cash box and a ledger", ["Introduce Delphine by her hands: counting, squaring bills, writing"], 6,
        audio=["fans", "street noise through the open door", "a Spanish-language ballgame on a kitchen radio"], light="late sun through venetian blinds, hard stripes", film=["grain", "warm cast"]),
   shot("s2", "medium", 40, "static", "Rita leaning over the bar toward the table", "", ["l1"], 3, dlg=["dlg.m06_payout_table#l1"]),
   shot("s3", "close", 85, "static", "Delphine, not looking up from the money", "", ["l2–l3: her rules, the club in one line"], 7, dlg=["dlg.m06_payout_table#l2", "dlg.m06_payout_table#l3"]),
   shot("s4", "two-shot", 50, "slow push in", "Tina across the table; Delphine finally looks up", "Tina turns her cheek away from the window light", ["l4–l5: the powder is noticed, never shown up close"], 8, dlg=["dlg.m06_payout_table#l4", "dlg.m06_payout_table#l5"]),
   shot("s5", "close", 85, "static", "Tina, a joke held up like a hand", "", ["l6"], 4, dlg=["dlg.m06_payout_table#l6"]),
   shot("s6", "medium", 40, "static", "Delphine squares the stack and opens the ledger", "The other women lean in", ["l7; title card: DELPHINE MOORE"], 4, dlg=["dlg.m06_payout_table#l7"], film=["name card in period type, lower left"])]},
 {"id": "cut.m07_yes", "mission": "mission.yes", "before": "o7", "time": "20:30", "date": "1974-07-01", "skippable": True,
  "logline": "The Shamrock Rail. Mayhew has been waiting with a beer and a racing form. Teddy says yes; the only question is what he says it for.",
  "shots": [
   shot("s1", "wide", 28, "static", "A long narrow bar, a TV with the ballgame, Mayhew alone at the far end", "Teddy walks the length of the bar toward him", ["The walk is the decision; nobody looks up"], 5, audio=["ballgame on TV", "glasses", "a fan"], light="neon beer signs, green and red"),
   shot("s2", "over-the-shoulder", 50, "static", "Over Teddy's shoulder: Mayhew, not surprised", "", ["l1"], 3, dlg=["dlg.m07_yes#l1"]),
   shot("s3", "two-shot", 40, "static", "Side by side at the bar, both facing the mirror", "They talk to each other's reflections", ["l2–l3"], 7, dlg=["dlg.m07_yes#l2", "dlg.m07_yes#l3"]),
   shot("s4", "close", 85, "static", "Teddy in the bar mirror", "", ["c1 (untimed)"], 0, dlg=["dlg.m07_yes#c1"]),
   dict(shot("s5a", "insert", 100, "static", "The photograph slid along the bar under Teddy's palm", "Mayhew's hand covers it fast", ["Branch: the photograph"], 8,
        dlg=["dlg.m07_yes#l_photo", "dlg.m07_yes#l_photo2", "dlg.m07_yes#l_photo3", "dlg.m07_yes#l_photo4"]), showIf=br("dlg.m07_yes#c1", 2)),
   dict(shot("s5b", "close", 85, "static", "Teddy, to the mirror", "", ["Branch: the Corwin"], 3, dlg=["dlg.m07_yes#l_yes"]), showIf=br("dlg.m07_yes#c1", 0)),
   dict(shot("s5c", "close", 85, "static", "Teddy, to Mayhew's face this time", "", ["Branch: the money"], 3, dlg=["dlg.m07_yes#l_money"]), showIf=br("dlg.m07_yes#c1", 1)),
   shot("s6", "insert", 100, "static", "An envelope and a folded list on the bar between two beers", "", ["l_end"], 5, dlg=["dlg.m07_yes#l_end"], film=["hold on the envelope; cut to black"])]},
 {"id": "cut.m12_lunch_counter", "mission": "mission.lunch_counter", "before": "o2", "time": "12:40", "date": "1974-07-15", "skippable": True,
  "logline": "Branch A. A prosecutor with an egg-salad sandwich asks a bagman to be audible. Delphine, two stools down, hears all of it.",
  "shots": [
   shot("s1", "wide", 28, "slow track along the counter", "Lacy's lunch counter at the lunch rush: shoppers, a cook at the griddle, a long chrome counter", "Calloway two stools from the end, accordion file at her elbow; Delphine two stools further, a coffee and a newspaper", ["Plant Delphine in the background before Teddy sits"], 6,
        audio=["griddle", "cash register", "a store announcement for the fur sale"], light="flat fluorescent, chrome highlights"),
   shot("s2", "two-shot", 50, "static", "Calloway and Teddy at the counter, eyes forward", "", ["l1–l3"], 9, dlg=["dlg.m12_calloway#l1", "dlg.m12_calloway#l2", "dlg.m12_calloway#l3"]),
   shot("s3", "close", 85, "static", "Calloway, quiet and exact", "", ["l4–l6"], 10, dlg=["dlg.m12_calloway#l4", "dlg.m12_calloway#l5", "dlg.m12_calloway#l6"]),
   shot("s4", "rack focus", 85, "rack from Teddy (foreground) to Delphine (background)", "Teddy asks; behind him Delphine's newspaper lowers an inch", "", ["l7–l8"], 5, dlg=["dlg.m12_calloway#l7", "dlg.m12_calloway#l8"]),
   shot("s5", "insert", 100, "static", "Half a sandwich on a plate; Teddy's hand beside it", "", ["c1 (untimed). Branch A."], 0, dlg=["dlg.m12_calloway#c1"]),
   dict(shot("s6a", "close", 85, "static", "Teddy pushes the plate away", "", ["Branch: wire"], 6, dlg=["dlg.m12_calloway#l_wire", "dlg.m12_calloway#l_wire2"]), showIf=br("dlg.m12_calloway#c1", 0)),
   dict(shot("s6b", "close", 85, "static", "Teddy finishes the sandwich", "", ["Branch: burned"], 7, dlg=["dlg.m12_calloway#l_burn", "dlg.m12_calloway#l_burn2"]), showIf=br("dlg.m12_calloway#c1", 1)),
   shot("s7", "medium", 50, "static", "Calloway leaves money on the counter and goes", "Delphine folds her newspaper", ["l_end"], 4, dlg=["dlg.m12_calloway#l_end"])]},
 {"id": "cut.m17_two_bankers", "mission": "mission.the_lease", "before": "o4", "time": "17:10", "date": "1974-07-24", "skippable": True,
  "logline": "Midpoint. Nick's penthouse office on Madison. A fur king and a woman from Eighth Avenue discover they're both locked out of the same bank.",
  "shots": [
   shot("s1", "wide", 24, "static", "A corner office: windows on Madison, a desk the size of a car, a fox stole on a dress form", "Delphine seated across the desk, ledger on her knee; Nick standing at the window", ["Two worlds in one frame: let the space sit"], 5, light="late afternoon, gold through tall windows", film=["clean; less grain than the street scenes"]),
   shot("s2", "medium", 50, "static", "Nick turns from the window", "", ["l1"], 3, dlg=["dlg.m17_two_bankers#l1"]),
   shot("s3", "close", 85, "static", "Delphine, ledger open", "She sets the ledger on the desk and turns it to face him", ["l2"], 4, dlg=["dlg.m17_two_bankers#l2"]),
   shot("s4", "over-the-shoulder", 50, "slow push", "Over Delphine: Nick reading the columns, impressed despite himself", "", ["l3"], 3, dlg=["dlg.m17_two_bankers#l3"]),
   shot("s5", "close", 85, "static", "Delphine", "", ["l4"], 4, dlg=["dlg.m17_two_bankers#l4"]),
   shot("s6", "two-shot", 40, "static", "Both, the desk between them, for the first time level", "Nick sits down", ["l5: the midpoint lands"], 5, dlg=["dlg.m17_two_bankers#l5"], film=["hold two beats after the line"])]},
 {"id": "cut.m20_the_meeting", "mission": "mission.partners_meeting", "before": "o3", "time": "11:00", "date": "1974-08-01", "skippable": True,
  "logline": "Lisle's conference room. Nick learns what his name is for.",
  "shots": [
   shot("s1", "wide", 24, "slow push down the table", "A long walnut table: Augie, Villalba, Wurtz in a borrowed suit, Nick; Lisle at the head; Marjorie at a side desk", "Nobody has a drink; everybody has a folder", ["Respectability as menace"], 6, audio=["air conditioner", "a fountain pen"], light="cool office light, drawn blinds"),
   shot("s2", "medium", 50, "static", "Lisle, hands folded", "", ["l1"], 3, dlg=["dlg.m20_meeting#l1"]),
   shot("s3", "medium", 40, "static", "Augie, sleeves rolled, the only one sweating", "", ["l2"], 3, dlg=["dlg.m20_meeting#l2"]),
   shot("s4", "medium close", 50, "static", "Lisle", "", ["l3"], 4, dlg=["dlg.m20_meeting#l3"]),
   shot("s5", "close", 85, "slow push", "Nick", "", ["l4"], 2, dlg=["dlg.m20_meeting#l4"]),
   shot("s6", "medium", 40, "static", "Wurtz, tie loosened, enjoying himself", "", ["l5"], 4, dlg=["dlg.m20_meeting#l5"]),
   shot("s7", "two-shot", 50, "static", "Lisle and, behind him, Marjorie looking straight at Nick", "", ["l6; Marjorie's look sets up o4"], 4, dlg=["dlg.m20_meeting#l6"])]},
 {"id": "cut.m29_the_choice", "mission": "mission.the_ledger", "before": "o2", "time": "20:15", "date": "1974-08-28", "skippable": False,
  "logline": "Branch B. The Corwin boiler room. One ledger, four hands that want it, and a man who has to choose whose.",
  "shots": [
   shot("s1", "wide", 24, "static", "The boiler room: the cold boiler, a work table, the ledger under a hanging bulb", "Bernard in a chair by the boiler door; Teddy standing over the table", ["The boiler door is visible in every shot"], 5, audio=["pipes ticking", "the building above"], light="one bulb; the boiler a dark mass"),
   shot("s2", "close", 85, "slow push", "Teddy, looking at the ledger", "", ["l1"], 5, dlg=["dlg.m29_choice#l1"]),
   shot("s3", "insert", 100, "static", "The ledger under the bulb", "", ["c1 (untimed; locked options greyed with reasons)"], 0, dlg=["dlg.m29_choice#c1"]),
   dict(shot("s4a", "close", 85, "static", "Teddy closes the ledger", "", ["Branch: Testimony"], 4, dlg=["dlg.m29_choice#l_b1"]), showIf=br("dlg.m29_choice#c1", 0)),
   dict(shot("s4b", "close", 85, "static", "Teddy tucks the ledger under his arm", "", ["Branch: Ledger Goes Public"], 4, dlg=["dlg.m29_choice#l_b2"]), showIf=br("dlg.m29_choice#c1", 1)),
   dict(shot("s4c", "close", 85, "static", "Teddy weighs it in one hand", "", ["Branch: New Pad"], 4, dlg=["dlg.m29_choice#l_b3"]), showIf=br("dlg.m29_choice#c1", 2)),
   dict(shot("s4d", "two-shot", 40, "static", "Bernard opens the boiler door; orange light on both faces", "", ["Branch: Ashes"], 6, dlg=["dlg.m29_choice#l_b4", "dlg.m29_choice#l_b4b"]), showIf=br("dlg.m29_choice#c1", 3)),
   shot("s5", "medium", 50, "static", "Bernard, from his chair", "", ["l_end"], 3, dlg=["dlg.m29_choice#l_end"])]},
 {"id": "cut.m30_lobby_chair", "mission": "mission.closing", "before": "o6", "time": "14:00", "date": "1974-08-30", "skippable": True,
  "logline": "The owner finally comes inside. Nick sits in the chair beside Odessa's and decides what the Corwin is for.",
  "shots": [
   shot("s1", "wide", 24, "slow push in", "The Corwin lobby at midday: residents on the stairs, the radio on the desk, two armchairs by the window", "Nick in a good suit, crossing the lobby to the empty chair", ["Residents watching from the stairs: the jury"], 6, audio=["the radio, low", "a fan", "street noise"], light="hot white daylight from the street"),
   shot("s2", "two-shot", 40, "static", "Nick and Odessa side by side, facing the street, not each other", "", ["l1–l2"], 7, dlg=["dlg.m30_odessa#l1", "dlg.m30_odessa#l2"]),
   shot("s3", "close", 85, "static", "Nick", "", ["l3"], 5, dlg=["dlg.m30_odessa#l3"]),
   shot("s4", "close", 85, "static", "Odessa turns her head toward him for the first time", "", ["l4"], 3, dlg=["dlg.m30_odessa#l4"]),
   shot("s5", "medium", 50, "static", "Nick's hands on his knees", "", ["c1 (untimed)"], 0, dlg=["dlg.m30_odessa#c1"]),
   dict(shot("s6a", "two-shot", 40, "static", "Nick stands; Odessa doesn't", "", ["Branch: sell"], 8, dlg=["dlg.m30_odessa#l_sell", "dlg.m30_odessa#l_sell2"]), showIf=br("dlg.m30_odessa#c1", 0)),
   dict(shot("s6b", "two-shot", 40, "static", "Nick loosens his tie and stays seated", "", ["Branch: keep"], 8, dlg=["dlg.m30_odessa#l_keep", "dlg.m30_odessa#l_keep2"]), showIf=br("dlg.m30_odessa#c1", 1)),
   dict(shot("s6c", "two-shot", 40, "static", "Odessa puts her hand on his arm", "", ["Branch: give"], 8, dlg=["dlg.m30_odessa#l_give", "dlg.m30_odessa#l_give2"]), showIf=br("dlg.m30_odessa#c1", 2)),
   shot("s7", "wide", 28, "slow crane up toward the stairs", "The lobby from above: the two chairs, the residents", "", ["l_end (inner)"], 4, dlg=["dlg.m30_odessa#l_end"])]},
]
import glob as _g
_DL = {}
for _f in _g.glob(str(OUT.parent / "dialogue" / "*.json")):
    _d = json.loads(open(_f).read()); _DL[_d["id"]] = {l["id"]: l for l in _d["lines"]}


def fix_shot(s):
    """UI chat format: free text goes to notes; choice holds wait for the choice; durations meet reading pace."""
    notes = []
    for k in ("audio", "lighting", "film"):
        if k in s:
            v = s.pop(k); notes.append(f"{k}: " + ("; ".join(v) if isinstance(v, list) else v))
    if notes: s["notes"] = " | ".join(notes)
    ch = [r for r in s.get("dialogue", []) if "#c" in r]
    if s.get("durationSec") == 0 and ch:
        s["type"] = "choice hold"; s["waitFor"] = "choice"; s["choices"] = ch[0]; s.pop("durationSec", None); return
    groups = {}
    for r in s.get("dialogue", []):
        sid, _, lid = r.partition("#"); l = _DL.get(sid, {}).get(lid)
        if l and "text" in l:
            key = re.sub(r"[a-z]$", "", lid) if re.search(r"\d[a-z]$", lid) else lid  # ending variants: count once
            groups[key] = max(groups.get(key, 0), max(1.6, 0.32 * len(l["text"].split())))
    s["durationSec"] = round(max(s.get("durationSec", 0), sum(groups.values()) + 0.4), 1)


import re
for c in CUTS:
    for sh in c["shots"]: fix_shot(sh)
for c in CUTS:
    (OUT / f"{c['id'].split('.', 1)[1]}.json").write_text(json.dumps(c, ensure_ascii=False, indent=2) + "\n")
print(len(CUTS), "cutscenes")
