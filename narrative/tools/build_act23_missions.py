#!/usr/bin/env python3
"""Authoring source for the Act 2 and Act 3 mission specs (N4, missions 10-32).
Writes content/missions/*.json. Edit here and re-run; validate with content.py."""
import json
from pathlib import Path
OUT = Path(__file__).resolve().parents[2] / "content" / "missions"
T, D, N = "char.teddy_arce", "char.delphine_moore", "char.nick_varelas"


def O(i, t, text, **k):
    o = {"id": i, "type": t, "text": text}
    o.update(k)
    return o


def rel(*triples):
    return {f"{a}/{b}": n for a, b, n in triples}


def mission(num, mid, title, act, ch, play, date, window, wx, mins, pillars, giver, objs, cps, unlock,
            flags=(), rels=None, npcs=(), arch=(), veh=(), locs=(), mobile="", design="", requires_flags=(),
            date_to=None, switch=(), fail=(), start=None, items=(), money=0, extra_req=None, rew_extra=None):
    req = {"flags": list(requires_flags), "notFlags": [], "act": act, "timeWindow": list(window),
           "weather": wx, "dateRange": [date, date_to or date]}
    if extra_req:
        req.update(extra_req)
    m = {"id": mid, "title": title, "number": num, "act": act, "chapter": ch, "playAs": play}
    if switch:
        m["switchPoints"] = list(switch)
    m.update({"date": date, "durationMin": mins, "pillars": list(pillars), "giver": giver, "requires": req,
              "start": start or {"type": "talk", "who": giver, "at": locs[0] if locs else "loc.corwin_hotel"},
              "objectives": objs, "fail": list(fail), "checkpoints": list(cps),
              "rewards": {"money": money, "setFlags": list(flags), "unlock": list(unlock)}})
    if items:
        m["rewards"]["items"] = list(items)
    if rels:
        m["rewards"]["relationships"] = rels
    if rew_extra:
        m["rewards"].update(rew_extra)
    m.update({"npcs": list(npcs), "archetypes": list(arch), "vehicles": list(veh), "locations": list(locs),
              "mobile": mobile, "design": design})
    return m


M = []
# ---------------------------------------------------------------- ACT 2
M.append(mission(10, "mission.five_am", "Five A.M.", 2, 4, T, "1974-07-08", ("04:30", "08:00"), ["any"], 13, ["P3", "P1"],
  "char.carl_mayhew", [
   O("o1", "goto", "Flower District, W 28th St at dawn", to="loc.moretti_flowers", radius=20),
   O("o2", "dialogue", "Collect from Anna Moretti", script="dlg.m10_moretti"),
   O("o3", "goto", "The Baeks' shop, W 29th St", to="loc.baek_wholesale", radius=15),
   O("o4", "dialogue", "Collect from Mr. Baek. Again.", script="dlg.m10_baek"),
   O("o5", "enter_interior", "Bring it to Mayhew, the Shamrock Rail", marker="interior.shamrock_rail"),
   O("o6", "dialogue", "Watch Mayhew count", script="dlg.m10_count")],
  ["o2", "o4", "o5"], ["mission.tax_day", "activity.collections"], money=200,
  rels=rel((T, "char.anna_moretti", -1)),
  npcs=["char.anna_moretti", "char.jung_ho_baek", "char.mi_sook_baek", "char.carl_mayhew"],
  arch=["npc.florist_wholesaler", "npc.flower_truck_driver"], locs=["loc.moretti_flowers", "loc.baek_wholesale", "loc.cop_bar"],
  start={"type": "talk", "who": "char.carl_mayhew", "at": "loc.corwin_hotel", "note": "Phone call to the night desk at 04:15: 'Flowers first. They open early.'"},
  mobile="Walking at dawn, two blocks between stops, no timers. Moretti's sidewalk jungle of potted palms is a soft-collision crowd, so take it slowly. Both collection choices are untimed.",
  design="P3: the Flower District at 5 a.m. Moretti refuses and tells Teddy about her slashed tyres (seeds Villalba). The Baeks pay with their calculator out and ask for a receipt (P1 as comedy). If flag.teddy_returned_tax, Mayhew finds the count short by fifty (handled in dialogue)."))
M.append(mission(11, "mission.tax_day", "Tax Day", 2, 4, D, "1974-07-10", ("12:00", "20:00"), ["any"], 12, ["P1", "P2"],
  "char.tina_mercado", [
   O("o1", "dialogue", "Club business at Rita's bar", script="dlg.m11_rounds"),
   O("o2", "enter_interior", "Dues at the Royal Cafeteria", marker="interior.royal_cafeteria"),
   O("o3", "dialogue", "Tina's late with her dues", script="dlg.m11_tina"),
   O("o4", "evade", "Shake Lonnie: Bauer's arcade, 42nd St", **{"from": ["char.lonnie_gage"]}, breakDistanceM=70, safeZones=["loc.bauer_arcade"],
     fallback="goto loc.bauer_arcade with timeLimitSec 120"),
   O("o5", "dialogue", "Bauer's nervous about something", script="dlg.m11_bauer"),
   O("o6", "deliver", "Hide the money: the Arden boiler room", item="item.club_cash", to="interior.arden_back_stairs")],
  ["o2", "o4", "o5"], ["mission.lunch_counter"],
  rels=rel((D, "char.ray_bauer", 1), (D, "char.tina_mercado", -1)),
  npcs=["char.rita_haines", "char.tina_mercado", "char.lonnie_gage", "char.ray_bauer", "char.jimmy_brannock", "char.marcus_teague"],
  arch=["npc.strip_worker", "npc.arcade_patron", "npc.bus_terminal_crowd"], locs=["loc.arden_hotel", "loc.eighth_ave_cafeteria", "loc.bauer_arcade"],
  start={"type": "talk", "who": "char.rita_haines", "at": "loc.arden_hotel"},
  fail=[{"type": "caught", "note": "Proposed; fallback timer."}],
  mobile="The evade is solved by the arcade's two doors (42nd St and 8th Ave). Lonnie is slower in the crowd. No combat. Day-into-dusk light helps readability.",
  design="Moving cash under surveillance (P1). Tina's lateness and Lonnie's tail are linked, which seeds her secret. Bauer hints that 'somebody downtown' asks about Wurtz."))
M.append(mission(12, "mission.lunch_counter", "Lunch Counter", 2, 4, T, "1974-07-15", ("12:20", "14:00"), ["any"], 14, ["P4", "P2"],
  "char.ruth_calloway", [
   O("o1", "enter_interior", "Herald Square store, lunch counter", marker="interior.herald_lunch_counter"),
   O("o2", "dialogue", "The woman from the parked car", script="dlg.m12_calloway"),
   O("o3", "switch_to", "(Delphine)", character=D, cut="transition"),
   O("o4", "photo", "Photograph who Teddy's talking to", subject="char.ruth_calloway", minScreenFraction=0.06),
   O("o5", "follow", "Follow her to her car, Fifth Ave", target="char.ruth_calloway", keepWithinM=60),
   O("o6", "dialogue", "Ask her what she wants with him", script="dlg.m12_delphine_calloway")],
  ["o2", "o3", "o5"], ["mission.contact_prints"], switch=["o3"],
  npcs=["char.ruth_calloway", "char.luis_navarro"], arch=["npc.lunch_counter_regular", "npc.shopper"],
  locs=["loc.herald_sq_store", "5th Ave & W 36th St"],
  start={"type": "talk", "who": "char.ruth_calloway", "at": "loc.herald_sq_store", "note": "A note at the Corwin desk: 'Lunch counter. 12:30. Bring an appetite. R.C.'"},
  fail=[{"type": "target_lost"}],
  mobile="**Branch A** is an untimed two-option choice with a confirm step ('Are you sure?'), because it persists. Delphine's tail goes down Broadway and Sixth through lunch crowds, so it's generous.",
  design="**Branch A.** Calloway offers the wire. Choices in dlg.m12_calloway set flag.branch_a_wire or flag.branch_a_burned and the N3 §3 relationship changes. Delphine, two stools down because she followed her fifty dollars, learns who Calloway is, which gives her leverage in P4."))
M.append(mission(13, "mission.contact_prints", "Contact Prints", 2, 5, D, "1974-07-17", ("22:00", "03:00"), ["overcast", "rain"], 13, ["P1", "P2"],
  "char.earl_poole", [
   O("o1", "goto", "Earl's stand, 42nd & Seventh", to="loc.poole_shine", radius=15),
   O("o2", "dialogue", "Earl keeps books too", script="dlg.m13_earl"),
   O("o3", "photo", "Photograph Brannock at Earl's stand", subject="char.jimmy_brannock", minScreenFraction=0.06, optional=True,
     onComplete={"items": ["item.print_brannock_2"]}),
   O("o4", "goto", "Find Ricky, Bryant Park west terrace", to="loc.bryant_park", radius=30),
   O("o5", "dialogue", "Ricky wants to talk. Nervously.", script="dlg.m13_ricky"),
   O("o6", "photo", "Photograph Wurtz with Ricky", subject="char.dennis_wurtz", **{"with": "char.ricky_vail"}, minScreenFraction=0.06,
     onComplete={"items": ["item.print_wurtz_ricky"]}),
   O("o7", "enter_interior", "Back to Rita's bar, the Arden", marker="interior.arden_lobby"),
   O("o8", "dialogue", "Lay the prints out for Rita", script="dlg.m13_rita_prints")],
  ["o2", "o5", "o7"], ["mission.cold_room"], flags=["flag.photo_file_3"],
  npcs=["char.earl_poole", "char.jimmy_brannock", "char.ricky_vail", "char.dennis_wurtz", "char.rita_haines", "char.ray_bauer"],
  arch=["npc.park_dealer", "npc.night_reader", "npc.deuce_crowd"], locs=["loc.poole_shine", "loc.bryant_park", "loc.arden_hotel"],
  start={"type": "talk", "who": "char.earl_poole", "at": "loc.poole_shine"},
  fail=[{"type": "spotted", "by": "char.dennis_wurtz", "withinM": 8, "note": "Proposed; fallback target_lost."}],
  mobile="Rain and darkness: photo targets get a subtle rim light (engine photo mode), and the size threshold is generous. Bryant Park's trees and benches give cover. Being spotted is warned twice.",
  design="Delphine's file reaches three prints (Brannock from M8, Wurtz and Ricky now, and Brannock at Earl's stand if taken), which sets flag.photo_file_3, one corroboration for B2. Ricky is drawn with dignity: scared, and counting days."))
M.append(mission(14, "mission.cold_room", "Cold Room", 2, 5, T, "1974-07-18", ("11:00", "15:00"), ["clear"], 12, ["P1", "P3"],
  "char.carl_mayhew", [
   O("o1", "enter_interior", "Collect at Kallis Furs, 29th & 7th", marker="interior.kallis_salon"),
   O("o2", "dialogue", "Mr. Kallis pays like a gentleman", script="dlg.m14_kallis"),
   O("o3", "enter_interior", "Varelas & Co. vaults, W 30th St", marker="interior.varelas_vault"),
   O("o4", "dialogue", "Yiannis shows you the cold room", script="dlg.m14_yiannis"),
   O("o5", "goto", "Meet Mayhew at the kafeneio, 29th & 8th", to="loc.kafeneio", radius=15),
   O("o6", "dialogue", "Say a name and watch Mayhew", script="dlg.m14_mayhew")],
  ["o2", "o4"], ["mission.brownout"],
  npcs=["char.stavros_kallis", "char.yiannis_doukas", "char.carl_mayhew", "char.augie_lomax"],
  arch=["npc.fur_worker", "npc.garment_pushboy"], locs=["loc.kallis_furs", "loc.varelas_loft", "loc.kafeneio"],
  start={"type": "talk", "who": "char.carl_mayhew", "at": "loc.corwin_hotel"},
  mobile="Three short walks within the Fur District with no timers. The vault interior is cold, so breath shows (a visual cue only).",
  design="Maps the vaults for M15 and M18. Seeds Mayhew's secret: if Teddy says 'Lisle', Mayhew drops his toothpick (N3 §6). Nick is absent ('Mr. Varelas is at the bank'), which builds anticipation."))
M.append(mission(15, "mission.brownout", "Brownout", 2, 5, N, "1974-07-19", ("21:00", "01:00"), ["clear"], 15, ["P5", "P3"],
  "char.yiannis_doukas", [
   O("o1", "dialogue", "Trade dinner. The lights flicker.", script="dlg.m15_ballroom"),
   O("o2", "enter_vehicle", "Get to your car on Seventh Ave", vehicle="vehicle_role.nick_sedan"),
   O("o3", "goto", "Drive to the vault, W 30th St", to="loc.varelas_loft", radius=15),
   O("o4", "dialogue", "Yiannis: the compressors stopped", script="dlg.m15_compressors"),
   O("o5", "goto", "Ice house, 37th St & Ninth Ave", to="W 37th St & 9th Ave", radius=20),
   O("o6", "dialogue", "Buy every block of ice they have", script="dlg.m15_ice_house"),
   O("o7", "follow", "Lead the ice truck back to W 30th St", target="vehicle_role.ice_truck", keepWithinM=80, to="loc.varelas_loft"),
   O("o8", "dialogue", "A man at the door. He's collecting.", script="dlg.m15_teddy_at_door")],
  ["o3", "o5", "o7"], ["mission.margin_call"], money=-300,
  rels=rel((N, "char.yiannis_doukas", 1), (N, T, 0)),
  npcs=["char.nick_varelas", "char.yiannis_doukas", "char.teddy_arce", "char.eleni_varelas"],
  arch=["npc.trade_dinner_guest", "npc.ice_house_worker", "npc.brownout_crowd"], veh=["vehicle_role.nick_sedan", "vehicle_role.ice_truck"],
  locs=["loc.hotel_pennsylvania", "loc.varelas_loft", "W 37th St & 9th Ave"],
  start={"type": "auto", "at": "loc.hotel_pennsylvania", "cut": "transition", "note": "Nick's introduction. Title card: NIKOS VARELAS · W 30TH STREET."},
  fail=[{"type": "vehicle_destroyed"}, {"type": "target_lost", "objective": "o7"}],
  mobile="The brownout (set_power, ENGINE N2) darkens W 28th–34th. Dark signals are all-way stops for AI. The ice truck is slow and waits for you. There's no timer, but Yiannis calls the thermometer every minute as urgency flavour. The route uses the 1974 one-ways (west on 37th, back down Ninth or Seventh).",
  design="Introduces Nick through crisis and money (spending is a verb: the ice costs $300). It ends with the first meeting: Teddy at the vault door in his collector's coat, and Nick in a dinner jacket, sleeves rolled, wet to the elbows. Neither knows the other is tied to the Corwin until the last line."))
M.append(mission(16, "mission.margin_call", "Margin Call", 2, 6, N, "1974-07-22", ("09:00", "14:30"), ["any"], 14, ["P1", "P5"],
  "char.eleni_varelas", [
   O("o1", "enter_interior", "Ashgrove Trust, 34th St branch", marker="interior.bank_branch"),
   O("o2", "dialogue", "Whitlock loves you less in July", script="dlg.m16_whitlock"),
   O("o3", "enter_interior", "Kallis wants a word, 29th & Seventh", marker="interior.kallis_salon"),
   O("o4", "dialogue", "Hear Kallis's 'fair' price", script="dlg.m16_kallis"),
   O("o5", "goto", "The Baeks' shop, W 29th St", to="loc.baek_wholesale", radius=15),
   O("o6", "dialogue", "The Baeks want to buy your building", script="dlg.m16_baeks"),
   O("o7", "enter_interior", "Lisle's office, Fifth & 36th", marker="interior.lisle_office"),
   O("o8", "dialogue", "Lisle has paper for you to sign", script="dlg.m16_lisle")],
  ["o2", "o4", "o6", "o7"], ["mission.the_lease"],
  rels=rel((N, "char.gordon_whitlock", -1), (N, "char.stavros_kallis", -1)),
  npcs=["char.gordon_whitlock", "char.stavros_kallis", "char.jung_ho_baek", "char.mi_sook_baek", "char.howard_lisle", "char.marjorie_kell", "char.eleni_varelas"],
  arch=["npc.bank_teller", "npc.office_lunch_crowd"], veh=["vehicle_role.nick_sedan"],
  locs=["loc.bank_branch", "loc.kallis_furs", "loc.baek_wholesale", "loc.lisle_office"],
  start={"type": "talk", "who": "char.eleni_varelas", "at": "loc.varelas_loft"},
  mobile="Four short stops, any order after o2 (the engine can present o3–o8 as a list). Driving is optional because the stops are close. Choices are untimed.",
  design="Shows Nick's world from the top (P1). The Baeks' offer is the first way out. Accepting in dlg.m16_baeks sets flag.baek_bought_building (a resolution that persists to M30). Lisle offers a bridge loan in exchange for more signatures, and Nick signs without reading. Marjorie watches."))
M.append(mission(17, "mission.the_lease", "The Lease", 2, 6, D, "1974-07-24", ("10:00", "19:00"), ["any"], 13, ["P4", "P1"],
  "char.delphine_moore", [
   O("o1", "goto", "The empty shop, W 37th St", to="loc.beauty_shop", radius=15),
   O("o2", "dialogue", "The agent says no. Politely.", script="dlg.m17_agent"),
   O("o3", "enter_interior", "Go over his head: Varelas, W 30th St", marker="interior.varelas_office"),
   O("o4", "dialogue", "Two bankers, one table", script="dlg.m17_two_bankers"),
   O("o5", "switch_to", "(Nick)", character=N, cut="transition"),
   O("o6", "dialogue", "Eleni reads Miss Moore's numbers", script="dlg.m17_eleni"),
   O("o7", "goto", "Drive her to W 37th St. Look at it.", to="loc.beauty_shop", radius=15),
   O("o8", "dialogue", "Stand in the empty shop together", script="dlg.m17_shop")],
  ["o2", "o4", "o5", "o7"], ["mission.cold_storage"], switch=["o5"],
  rels=rel((D, N, 1), (N, D, 1)),
  npcs=["char.nick_varelas", "char.eleni_varelas"], arch=["npc.rental_agent"], veh=["vehicle_role.nick_sedan"],
  locs=["loc.beauty_shop", "loc.varelas_loft"],
  start={"type": "auto", "at": "loc.arden_hotel"},
  mobile="Walk, talk and a short drive (three blocks). The midpoint mission is deliberately calm. No timers.",
  design="**Midpoint: all three leads are playable.** Two people who bank for others meet. Eleni respects the club's books, while Nick is charmed and wary. The lease is promised 'after the season', which ties Delphine's resolution to Nick's survival (M31 gate)."))
M.append(mission(18, "mission.cold_storage", "Cold Storage", 2, 6, N, "1974-07-26", ("22:00", "03:00"), ["overcast"], 20, ["P1", "P5", "P4"],
  "char.eleni_varelas", [
   O("o1", "dialogue", "The plan, in the dark office", script="dlg.m18_plan"),
   O("o2", "enter_vehicle", "Bring the truck round, W 30th St", vehicle="vehicle_role.box_truck"),
   O("o3", "deliver", "Bales to the garage, 39th & Ninth", item="item.fur_bales", to="W 39th St & 9th Ave"),
   O("o4", "switch_to", "(Teddy)", character=T, cut="transition"),
   O("o5", "dialogue", "Collection night. Something's wrong.", script="dlg.m18_teddy"),
   O("o6", "follow", "Follow Wurtz's green sedan", target="char.dennis_wurtz", keepWithinM=90),
   O("o7", "switch_to", "(Delphine)", character=D, cut="transition"),
   O("o8", "photo", "Photograph Wurtz taking Nick's cut", subject="char.dennis_wurtz", **{"with": N}, minScreenFraction=0.06, optional=True,
     onComplete={"items": ["item.print_wurtz_nick"]}),
   O("o9", "switch_to", "(Nick)", character=N, cut="hard"),
   O("o10", "dialogue", "Yiannis has counted the vault", script="dlg.m18_count")],
  ["o2", "o4", "o7", "o9", "o10"], ["mission.rewiring"], switch=["o4", "o7", "o9"], flags=["flag.vault_claim_paid"],
  rels=rel((N, "char.yiannis_doukas", -1), (T, N, 1), (D, N, 0)),
  npcs=["char.eleni_varelas", "char.yiannis_doukas", "char.dennis_wurtz", "char.jimmy_brannock", "char.teddy_arce", "char.delphine_moore"],
  arch=["npc.fur_worker", "npc.plainclothes", "npc.brownout_crowd"], veh=["vehicle_role.box_truck", "vehicle_role.unmarked_sedan"],
  locs=["loc.varelas_loft", "W 39th St & 9th Ave", "W 30th St & 8th Ave"],
  start={"type": "auto", "at": "loc.varelas_loft", "note": "The second brownout: set_power off for W 26th–34th, 6th–8th Aves, 22:00–02:00."},
  fail=[{"type": "vehicle_destroyed"}, {"type": "target_lost", "objective": "o6"}],
  mobile="Five checkpoints across 20 minutes. Switches only at safe beats. The truck drive has no timer; the brownout's dark signals are all-way stops. The tail of Wurtz is generous because his car is slow and lit by its own headlights.",
  design="**First mission with all three leads.** The insurance job: half the pledged coats go 'missing' in the dark. Wurtz's unit protects it for a cut, Teddy is the collector who sees it, and Delphine photographs the cut. In dlg.m18_count Yiannis gives the true count only if his relationship with Nick is +3. Otherwise he gives Nick the number Nick wants, which matters in M30."))
M.append(mission(19, "mission.rewiring", "Rewiring", 2, 7, T, "1974-07-29", ("13:00", "19:00"), ["clear"], 12, ["P5", "P4"],
  "char.odessa_pruitt", [
   O("o1", "dialogue", "Power's off upstairs. Lobby's an oven.", script="dlg.m19_heat"),
   O("o2", "enter_interior", "Find Gus: the Corwin basement", marker="interior.corwin_basement"),
   O("o3", "dialogue", "Who told Gus to throw the switch?", script="dlg.m19_gus"),
   O("o4", "enter_interior", "Up to eleven. Mr. Hollis.", marker="interior.corwin_floor11"),
   O("o5", "dialogue", "Room 1112", script="dlg.m19_hollis"),
   O("o6", "enter_interior", "Back down to the lobby", marker="interior.corwin_lobby"),
   O("o7", "dialogue", "The lobby holds a wake", script="dlg.m19_wake")],
  ["o2", "o4", "o6"], ["mission.partners_meeting"], flags=["flag.hollis_dead", "flag.feld_left"],
  rels=rel((T, "char.gus_wilkie", -2), (T, "char.odessa_pruitt", 1), (T, "char.vic_prentiss", -2)),
  npcs=["char.odessa_pruitt", "char.gus_wilkie", "char.walter_hollis", "char.manny_soto", "char.carmen_arce", "char.mei_lin_chow", "char.inez_rivera", "char.vic_prentiss"],
  arch=["npc.sro_resident"], locs=["loc.corwin_hotel"],
  start={"type": "auto", "at": "loc.corwin_hotel"},
  mobile="Interior only. The stairs (the elevator is dead) are a short climb with fading audio, not a stamina test. No timers.",
  design="Content rule: **the death is off screen.** Teddy opens the door, the camera stays on his face and on Odessa behind him, and Hollis's radio is still playing. Nothing is shown. Afterwards Carmen arrives with the news that Feld has gone south (flag.feld_left), and grief turns into organising. Prentiss appears with condolence flowers, and the room goes silent."))
M.append(mission(20, "mission.partners_meeting", "Partners' Meeting", 2, 7, N, "1974-08-01", ("10:00", "13:00"), ["any"], 12, ["P1", "P4"],
  "char.howard_lisle", [
   O("o1", "goto", "Drive to Lisle's, Fifth & 36th", to="loc.lisle_office", radius=20),
   O("o2", "enter_interior", "Up to the 11th floor", marker="interior.lisle_office"),
   O("o3", "dialogue", "The partners' meeting", script="dlg.m20_meeting"),
   O("o4", "dialogue", "Marjorie leaves the ledger open", script="dlg.m20_marjorie"),
   O("o5", "enter_interior", "Lunch alone at the Iron Gate", marker="interior.iron_gate"),
   O("o6", "dialogue", "Call Eleni from the booth", script="dlg.m20_eleni_call")],
  ["o2", "o4"], ["mission.carbon_copy"],
  rels=rel((N, "char.marjorie_kell", 1), (N, "char.howard_lisle", -2)),
  npcs=["char.howard_lisle", "char.marjorie_kell", "char.augie_lomax", "char.dennis_wurtz", "char.eleni_varelas", "char.hector_villalba"],
  arch=["npc.office_lunch_crowd"], veh=["vehicle_role.nick_sedan"], locs=["loc.lisle_office", "loc.steakhouse"],
  start={"type": "talk", "who": "char.howard_lisle", "at": "loc.varelas_loft", "note": "A telegram-style note from Lisle's office: 'Partners, 11 a.m.'"},
  mobile="Driving is optional (it's five blocks). The meeting is one dialogue with two untimed choices. No timers.",
  design="Nick sees the ledger: his name on every hotel, every surcharge and every 'consideration'. The oldest page is dated autumn 1971, initialled C.M. (Mayhew, N3 §6). Marjorie leaves it open on purpose. That's the first crack in Lisle's office."))
M.append(mission(21, "mission.carbon_copy", "Carbon Copy", 2, 7, T, "1974-08-06", ("19:00", "23:00"), ["any"], 18, ["P1", "P2"],
  "char.bernard_ostrow", [
   O("o1", "dialogue", "Bernard has a plan. And a stopwatch.", script="dlg.m21_plan"),
   O("o2", "goto", "Lisle's building, Fifth & 36th", to="loc.lisle_office", radius=20),
   O("o3", "dialogue", "Marjorie, in the lobby, with keys", script="dlg.m21_marjorie", **{"if": "flag.branch_a_wire"}),
   O("o3b", "dialogue", "Delroy knows the night man's habits", script="dlg.m21_delroy", **{"if": "flag.branch_a_burned"}),
   O("o4", "switch_to", "(Nick)", character=N, cut="transition"),
   O("o5", "dialogue", "Keep Lisle at dinner. Order dessert.", script="dlg.m21_dinner"),
   O("o6", "switch_to", "(Teddy)", character=T, cut="transition"),
   O("o7", "enter_interior", "Into Lisle's office, 11th floor", marker="interior.lisle_office"),
   O("o8", "dialogue", "Copy the ledger. Put it back.", script="dlg.m21_copy", **{"if": "flag.branch_a_wire"}),
   O("o8b", "dialogue", "Take the ledger. All of it.", script="dlg.m21_steal", **{"if": "flag.branch_a_burned"}),
   O("o9", "goto", "Out by the freight stairs, W 37th St", to="W 37th St & 5th Ave", radius=20),
   O("o10", "dialogue", "Bernard reads it on the lobby table", script="dlg.m21_bernard")],
  ["o2", "o4", "o6", "o9"], ["mission.the_address"], flags=["flag.act3_started"],
  npcs=["char.bernard_ostrow", "char.marjorie_kell", "char.delroy_tate", "char.howard_lisle", "char.nick_varelas"],
  arch=["npc.night_watchman", "npc.office_cleaner"], locs=["loc.corwin_hotel", "loc.lisle_office", "loc.steakhouse"],
  start={"type": "talk", "who": "char.bernard_ostrow", "at": "loc.corwin_hotel"},
  fail=[{"type": "spotted", "by": "npc.night_watchman", "withinM": 5, "note": "Proposed; fallback timer."}],
  rew_extra={"act": 3},
  mobile="The infiltration is about timing and doors (the watchman has a fixed loop shown on a radio clock), not stealth reflexes. Being spotted resets to the o7 checkpoint. Nick's dinner is a calm dialogue that the player can stretch with menu choices. Branch variants via `if` (ENGINE_REQUESTS 8).",
  design="**End of Act 2.** Branch A pays off. With the wire, Marjorie lets Teddy in, he copies the ledger and returns it, and she hands over her carbons (flag.have_marjorie_carbons, set in dialogue). Burned, he steals it, and Lisle knows by morning. Either way the oldest page is Mayhew's."))
# ---------------------------------------------------------------- ACT 3
M.append(mission(22, "mission.the_address", "The Address", 3, 8, T, "1974-08-08", ("20:30", "00:30"), ["overcast"], 16, ["P4", "P5", "P2"],
  "char.odessa_pruitt", [
   O("o1", "dialogue", "Every radio in the lobby is on", script="dlg.m22_lobby_radio"),
   O("o2", "enter_interior", "Mayhew's at the Shamrock Rail", marker="interior.shamrock_rail"),
   O("o3", "dialogue", "Mayhew knows. He's sweating.", script="dlg.m22_mayhew"),
   O("o4", "switch_to", "(Delphine)", character=D, cut="transition"),
   O("o5", "goto", "The radio crowd, 42nd & Seventh", to="W 42nd St & 7th Ave", radius=30),
   O("o6", "dialogue", "42nd Street listens to a cab radio", script="dlg.m22_crowd"),
   O("o7", "switch_to", "(Nick)", character=N, cut="transition"),
   O("o8", "dialogue", "Lisle on the phone, very calm", script="dlg.m22_lisle_call"),
   O("o9", "goto", "Drive to the Pennsylvania", to="loc.hotel_pennsylvania", radius=20),
   O("o10", "dialogue", "Everyone's selling everyone", script="dlg.m22_lobby_deals")],
  ["o3", "o4", "o7", "o9"], ["mission.shoebox", "mission.flip", "mission.the_car"],
  npcs=["char.odessa_pruitt", "char.carl_mayhew", "char.tina_mercado", "char.rita_haines", "char.howard_lisle", "char.augie_lomax", "char.ray_bauer", "char.nora_finch"],
  arch=["npc.radio_crowd", "npc.sro_resident", "npc.hotel_bellhop"], veh=["vehicle_role.nick_sedan"],
  locs=["loc.corwin_hotel", "loc.cop_bar", "W 42nd St & 7th Ave", "loc.hotel_pennsylvania"],
  start={"type": "auto", "at": "loc.corwin_hotel", "note": "Real background: the President's televised resignation address (evening of 8 Aug 1974). He's never named or shown. The radio audio is invented narration ('the President, speaking from the Oval Office tonight...')."},
  mobile="Three short scenes, one per lead, with a checkpoint at each switch. The Times Square crowd stays 60 m or more inside the north edge (45th St, not 47th). No timers.",
  design="The Act 3 opener. A real event as weather: in the syndicate, everyone suddenly wonders who'll go down with whom. Mayhew has learned about the wire or the theft (branch-dependent lines). Delphine overhears Tina on a payphone with Lonnie (a seed for M23). Nick watches Lisle work the hotel lobby like a man selling lifeboats."))
M.append(mission(23, "mission.shoebox", "Shoebox", 3, 8, D, "1974-08-12", ("21:00", "02:00"), ["rain"], 14, ["P1", "P4"],
  "char.marcus_teague", [
   O("o1", "enter_interior", "The Arden boiler room", marker="interior.arden_back_stairs"),
   O("o2", "dialogue", "Marcus: Ricky talked. They know.", script="dlg.m23_marcus"),
   O("o3", "deliver", "Club money to Hanyang House, W 32nd", item="item.club_shoebox", to="interior.hanyang_house"),
   O("o4", "evade", "Brannock's on you. Penn Station.", **{"from": ["char.jimmy_brannock"]}, breakDistanceM=80, safeZones=["interior.penn_station_concourse"],
     fallback="goto interior.penn_station_concourse with timeLimitSec 120"),
   O("o5", "dialogue", "Mi-sook opens the back room", script="dlg.m23_mi_sook"),
   O("o6", "enter_interior", "Back to the Arden. Tina's waiting.", marker="interior.arden_lobby"),
   O("o7", "dialogue", "Tina tells you everything", script="dlg.m23_tina")],
  ["o2", "o4", "o5", "o6"], ["mission.fire_watch"],
  rels=rel((D, "char.mi_sook_baek", 1), (D, "char.marcus_teague", 1)),
  npcs=["char.marcus_teague", "char.jimmy_brannock", "char.ricky_vail", "char.mi_sook_baek", "char.tina_mercado", "char.claudette_bijou"],
  arch=["npc.rain_pedestrian", "npc.penn_porter"], locs=["loc.arden_hotel", "loc.penn_station_lockers", "loc.korean_restaurant"],
  start={"type": "auto", "at": "loc.arden_hotel"},
  fail=[{"type": "caught", "note": "Proposed; fallback timer."}],
  mobile="Rain makes the crowds thinner and the streets readable. The escape uses Penn Station's two exits. The shoebox delivery has no timer. Tina's confession has untimed choices: forgive her, confront her, or cover the $1,100 yourself.",
  design="Two credit clubs, side by side: the kye's back room takes in the women's money for safekeeping. Tina confesses that Lonnie is her cousin and that the leak and the $1,100 went to him. Choices set flag.delphine_forgave_tina and/or flag.club_count_settled (in dialogue)."))
M.append(mission(24, "mission.flip", "Flip", 3, 8, N, "1974-08-14", ("11:00", "16:00"), ["any"], 13, ["P4", "P1"],
  "char.ruth_calloway", [
   O("o1", "enter_interior", "Calloway, Herald Square lunch counter", marker="interior.herald_lunch_counter"),
   O("o2", "dialogue", "She has an offer. It expires.", script="dlg.m24_calloway"),
   O("o3", "enter_interior", "Augie's garage, 38th & Ninth", marker="interior.carriers_garage"),
   O("o4", "dialogue", "Augie's selling. To whom?", script="dlg.m24_augie"),
   O("o5", "dialogue", "Villalba, on the radio, too calm", script="dlg.m24_villalba"),
   O("o6", "goto", "Back to the loft before Lisle calls", to="loc.varelas_loft", radius=20)],
  ["o2", "o3", "o5"], ["mission.fire_watch"],
  npcs=["char.ruth_calloway", "char.augie_lomax", "char.hector_villalba", "char.eleni_varelas"],
  arch=["npc.truck_driver", "npc.lunch_counter_regular"], veh=["vehicle_role.nick_sedan"],
  locs=["loc.herald_sq_store", "loc.carriers_garage", "loc.varelas_loft"],
  start={"type": "talk", "who": "char.ruth_calloway", "at": "loc.herald_sq_store"},
  mobile="Calm dialogue plus one cross-town drive (west on 37th, then up Ninth to the garage; back east on 38th, then down Seventh). No timers.",
  design="Calloway's deal: testify against Lisle for immunity on the insurance fraud. Accepting sets flag.nick_flipped (in dialogue), which opens B1 even if Teddy burned the wire. Augie, sick, admits the sale. If Nick's relationship with Villalba is −3, Villalba tips Lisle about Nick's visit."))
M.append(mission(25, "mission.the_car", "The Car", 3, 8, T, "1974-08-16", ("22:00", "01:00"), ["rain"], 14, ["P4", "P2"],
  "char.pat_kearney", [
   O("o1", "enter_interior", "Kearney's desk, W 31st St", marker="interior.station_house_desk"),
   O("o2", "dialogue", "Kearney opens his desk drawer", script="dlg.m25_kearney"),
   O("o3", "goto", "Mayhew's car, 35th St off Eighth", to="W 35th St & 8th Ave", radius=20),
   O("o4", "dialogue", "Get in the car. Same seat as 1971.", script="dlg.m25_the_car"),
   O("o5", "goto", "Walk back to the Corwin in the rain", to="loc.corwin_hotel", radius=20)],
  ["o2", "o3", "o4"], ["mission.fire_watch"], flags=["flag.have_kearney_list"],
  rels=rel((T, "char.pat_kearney", 2)),
  npcs=["char.pat_kearney", "char.carl_mayhew", "char.luis_navarro"], arch=["npc.rain_pedestrian"],
  locs=["loc.station_house", "W 35th St & 8th Ave", "loc.corwin_hotel"],
  start={"type": "talk", "who": "char.pat_kearney", "at": "loc.station_house"},
  mobile="The emotional peak is a dialogue in a parked car. The final walk home in the rain is optional pacing (it can be skipped by fast travel to the desk). No timers.",
  design="Kearney gives Teddy the 1969–71 Christmas list (always, so it's a critical-path corroboration). In the car, Mayhew tells the truth: the 1971 meet was Lisle buying a case, and Teddy was the alibi. The final choice is to let him go or take him to Calloway (flag.teddy_spared_mayhew, in dialogue)."))
M.append(mission(26, "mission.fire_watch", "Fire Watch", 3, 9, T, "1974-08-20", ("23:00", "05:00"), ["overcast"], 18, ["P5", "P4"],
  "char.odessa_pruitt", [
   O("o1", "dialogue", "Night desk. A rumour about tonight.", script="dlg.m26_rumour"),
   O("o2", "wait", "Watch the lobby until 2 a.m.", until="02:00", at="interior.corwin_lobby"),
   O("o3", "switch_to", "(Delphine)", character=D, cut="transition"),
   O("o4", "goto", "Watch the corner, 31st & Sixth", to="W 31st St & 6th Ave", radius=20),
   O("o5", "photo", "Photograph the man with the cans", subject="npc.hired_firebug", minScreenFraction=0.06),
   O("o6", "switch_to", "(Teddy)", character=T, cut="hard"),
   O("o7", "dialogue", "A false alarm empties the lobby", script="dlg.m26_false_alarm"),
   O("o8", "follow", "Follow the firebug to whoever's paying", target="npc.hired_firebug", keepWithinM=70),
   O("o9", "dialogue", "Prentiss, in his car, with the money", script="dlg.m26_prentiss")],
  ["o2", "o3", "o6", "o8"], ["mission.exposure"], flags=["flag.arson_stopped"],
  extra_req={"missionsDone": ["mission.shoebox", "mission.flip", "mission.the_car"]},
  rels=rel((T, "char.manny_soto", 1), (T, "char.inez_rivera", 1), (D, T, 1)),
  npcs=["char.odessa_pruitt", "char.gus_wilkie", "char.manny_soto", "char.inez_rivera", "char.vic_prentiss", "char.delphine_moore", "char.luis_navarro"],
  arch=["npc.hired_firebug", "npc.firefighter", "npc.sro_resident"], veh=["vehicle_role.fire_engine"],
  locs=["loc.corwin_hotel", "W 31st St & 6th Ave"],
  start={"type": "auto", "at": "loc.corwin_hotel"},
  fail=[{"type": "target_lost", "objective": "o8"}],
  mobile="Content rule: **there's no fire.** Failing resets to the checkpoint. The false alarm brings real fire engines (ambience), and the tenants are walked out safely by Inez and Odessa. Inez's children are at her sister's (dialogue says so). Gus helps or hinders based on his relationship with Teddy (−3 means he leaves the service door open). The wait is a skippable time-advance.",
  design="Prentiss's plan, stopped. Delphine's photo plus the tail give Teddy leverage over Prentiss. The relationship gates from N3 §5 pay off visibly: Manny unlocks the service door at +3, and Gus at −3 is the risk."))
M.append(mission(27, "mission.exposure", "Exposure", 3, 9, D, "1974-08-22", ("20:00", "00:30"), ["any"], 15, ["P1", "P4"],
  "char.dennis_wurtz", [
   O("o1", "dialogue", "Wurtz wants the whole club now", script="dlg.m27_wurtz_club"),
   O("o2", "switch_to", "(Nick)", character=N, cut="transition"),
   O("o3", "dialogue", "Wurtz at the showroom, smiling", script="dlg.m27_wurtz_showroom"),
   O("o4", "dialogue", "Buy a locker key from Brannock", script="dlg.m27_brannock_key"),
   O("o5", "switch_to", "(Delphine)", character=D, cut="transition"),
   O("o6", "goto", "Penn Station lockers, Eighth Ave", to="loc.penn_station_lockers", radius=15),
   O("o7", "dialogue", "Open Wurtz's locker", script="dlg.m27_locker"),
   O("o8", "photo", "Photograph Lisle's dinner guest", subject="npc.editor_brother_in_law", **{"with": "char.howard_lisle"}, minScreenFraction=0.06,
     optional=True, onComplete={"setFlags": ["flag.editor_neutralised"], "items": ["item.print_editor_lisle"]}),
   O("o9", "enter_interior", "Back to Rita's. Tina's decided.", marker="interior.arden_lobby"),
   O("o10", "dialogue", "Tina's choice", script="dlg.m27_tina")],
  ["o3", "o5", "o7", "o9"], ["mission.the_march"], flags=["flag.have_wurtz_locker"],
  rels=rel((D, N, 1), (N, D, 1), (N, "char.jimmy_brannock", 0)),
  npcs=["char.dennis_wurtz", "char.jimmy_brannock", "char.howard_lisle", "char.tina_mercado", "char.lonnie_gage", "char.ray_bauer", "char.claudette_bijou", "char.nick_varelas"],
  arch=["npc.penn_porter", "npc.hotel_bar_regular", "npc.editor_brother_in_law"], locs=["loc.arden_hotel", "loc.varelas_loft", "loc.penn_station_lockers", "loc.hotel_pennsylvania"],
  start={"type": "talk", "who": "char.dennis_wurtz", "at": "loc.arden_hotel"},
  mobile="Spending is the solution: Nick buys the key, so there's no lockpicking. The optional photo is signposted ('Claudette says the paper's man drinks at the Pennsylvania') so players know it opens a Branch B option. Two switches, both at calm beats.",
  design="The mirror pays off: Wurtz's photographs (his insurance) become the leads' evidence. The optional photo neutralises the editor's conflict for B2 and is signposted here, as N3 §9 requires. Tina's resolution (flag.tina_stays or flag.tina_gone) and Bauer's fate (flag.bauer_burned if Delphine trades him to save Tina) are set in dlg.m27_tina."))
M.append(mission(28, "mission.the_march", "The March", 3, 9, T, "1974-08-23", ("10:00", "13:00"), ["clear"], 15, ["P5", "P3", "P2"],
  "char.odessa_pruitt", [
   O("o1", "dialogue", "Odessa's in her white hat", script="dlg.m28_lobby"),
   O("o2", "escort", "Walk with Odessa up Broadway", who="char.odessa_pruitt", pace="match", waitRadius=10,
     route=["loc.corwin_hotel", "Broadway & W 32nd St", "Broadway & W 34th St"], dialogue=["dlg.m28_walk_a", "dlg.m28_walk_b"]),
   O("o3", "switch_to", "(Delphine)", character=D, cut="transition"),
   O("o4", "dialogue", "The operators join at 34th & Seventh", script="dlg.m28_operators"),
   O("o5", "switch_to", "(Nick)", character=N, cut="transition"),
   O("o6", "goto", "Herald Square. Walk to Odessa.", to="W 34th St & Broadway", radius=15),
   O("o7", "dialogue", "The owner meets the tenant", script="dlg.m28_owner")],
  ["o2", "o3", "o5", "o7"], ["mission.the_ledger"],
  rels=rel((N, "char.odessa_pruitt", 1), (T, "char.carmen_arce", 1)),
  npcs=["char.odessa_pruitt", "char.carmen_arce", "char.mei_lin_chow", "char.anna_moretti", "char.jung_ho_baek", "char.nora_finch", "char.ruth_calloway", "char.dwayne_little", "char.yiannis_doukas", "char.sam_feld"],
  arch=["npc.marcher", "npc.shopper", "npc.beat_cop"], locs=["loc.corwin_hotel", "Broadway & W 34th St", "W 34th St & 7th Ave"],
  start={"type": "auto", "at": "loc.corwin_hotel", "note": "The Herald Square route is closed 10:00–13:00 (N3 §7)."},
  mobile="Walking pace with the escort matching the player (Odessa uses a cane, so it's slow on purpose). The crowd is dense but passable. No timers. One untimed choice for Nick at the end.",
  design="P5 turned around: the city's working people show up. Every community's sympathetic figure marches: Carmen and Mei-lin, Moretti with flowers, the Baeks, Dwayne. Nick's walk to Odessa builds the non-transactional bond (N3 §3) that gates the council resolution."))
M.append(mission(29, "mission.the_ledger", "The Ledger", 3, 10, T, "1974-08-28", ("18:00", "22:00"), ["any"], 14, ["P4", "P1"],
  "char.bernard_ostrow", [
   O("o1", "dialogue", "Bernard lays out what you have", script="dlg.m29_inventory"),
   O("o2", "dialogue", "Decide who gets the ledger", script="dlg.m29_choice"),
   O("o3a", "goto", "Calloway's car, Fifth & 36th", to="5th Ave & W 36th St", radius=20, **{"if": "flag.ledger_to_prosecutor"}),
   O("o3b", "enter_interior", "Nora Finch, the Shamrock Rail", marker="interior.shamrock_rail", **{"if": "flag.ledger_to_press"}),
   O("o3c", "enter_interior", "Lisle's table, the Iron Gate", marker="interior.iron_gate", **{"if": "flag.ledger_kept"}),
   O("o3d", "enter_interior", "The Corwin boiler. Open the door.", marker="interior.corwin_basement", **{"if": "flag.ledger_burned"}),
   O("o4", "dialogue", "Hand it over. Or don't.", script="dlg.m29_handover")],
  ["o1", "o2", "o4"], ["mission.closing", "mission.lease"],
  npcs=["char.bernard_ostrow", "char.ruth_calloway", "char.nora_finch", "char.howard_lisle", "char.luis_navarro"],
  arch=["npc.office_lunch_crowd", "npc.night_reader"], locs=["loc.corwin_hotel", "5th Ave & W 36th St", "loc.cop_bar", "loc.steakhouse"],
  start={"type": "talk", "who": "char.bernard_ostrow", "at": "loc.corwin_hotel"},
  mobile="**Branch B** is an untimed choice with a confirm step. Unavailable options are shown greyed out, with the reason ('Needs a witness who'll testify'), so the player sees the cost of earlier choices. One short trip afterwards.",
  design="**Branch B** (N3 §3). dlg.m29_choice gates options with `if`: B1 needs flag.branch_a_wire or flag.nick_flipped; B2 needs two corroborations plus flag.editor_neutralised; B3 and B4 are always available. o3c meets Lisle at the Iron Gate because it's dinnertime. In the New Pad epilogue Teddy takes Lisle's luncheonette stool."))
M.append(mission(30, "mission.closing", "Closing", 3, 10, N, "1974-08-30", ("10:00", "15:00"), ["any"], 13, ["P4", "P5"],
  "char.eleni_varelas", [
   O("o1", "dialogue", "Eleni, packed or not", script="dlg.m30_eleni"),
   O("o2", "goto", "The Baeks' shop, W 29th St", to="loc.baek_wholesale", radius=15),
   O("o3", "dialogue", "The deed, if you'll sign it", script="dlg.m30_baeks"),
   O("o4", "goto", "The Corwin, W 31st St", to="loc.corwin_hotel", radius=15),
   O("o5", "enter_interior", "Go inside. For once.", marker="interior.corwin_lobby"),
   O("o6", "dialogue", "Odessa's lobby chair", script="dlg.m30_odessa")],
  ["o2", "o4", "o5"], ["mission.labor_day"],
  npcs=["char.eleni_varelas", "char.jung_ho_baek", "char.mi_sook_baek", "char.odessa_pruitt", "char.bernard_ostrow", "char.manny_soto", "char.stavros_kallis", "char.gordon_whitlock", "char.yiannis_doukas"],
  arch=["npc.sro_resident"], veh=["vehicle_role.nick_sedan"], locs=["loc.varelas_loft", "loc.baek_wholesale", "loc.corwin_hotel"],
  start={"type": "talk", "who": "char.eleni_varelas", "at": "loc.varelas_loft"},
  mobile="Two short drives and a lobby scene. The resolution choice is untimed. Gated options are greyed with a reason.",
  design="Nick's resolution (N3 §3): sell on, keep, or give it to the council. Signing the Baeks' deed sets flag.baek_bought_building if it wasn't already set in M16. 'Nobody told me there were people in it' finally gets its answer from Odessa."))
M.append(mission(31, "mission.lease", "Lease", 3, 10, D, "1974-08-31", ("14:00", "18:00"), ["any"], 12, ["P4", "P1"],
  "char.claudette_bijou", [
   O("o1", "dialogue", "Claudette wants a full count", script="dlg.m31_count"),
   O("o2", "goto", "The shop, W 37th St", to="loc.beauty_shop", radius=15),
   O("o3", "dialogue", "Keys, or no keys", script="dlg.m31_lease"),
   O("o4", "dialogue", "Hanyang House back room", script="dlg.m31_kye", **{"if": "!flag.delphine_shop"})],
  ["o1", "o2", "o3"], ["mission.labor_day"],
  npcs=["char.claudette_bijou", "char.tina_mercado", "char.rita_haines", "char.mi_sook_baek", "char.nick_varelas"],
  arch=["npc.strip_worker"], locs=["loc.arden_hotel", "loc.beauty_shop", "loc.korean_restaurant"],
  start={"type": "talk", "who": "char.claudette_bijou", "at": "loc.arden_hotel"},
  mobile="Walking and talking only. The count is a dialogue, not arithmetic. Untimed choices.",
  design="Delphine's resolution (N3 §3): the shop (needs her relationship with Nick at +1 or more, plus flag.club_count_settled), or merging the club with Mi-sook's kye (needs her relationship with Mi-sook at +1 or more), or carrying on as before. Either way, the women vote. Delphine doesn't decide for them."))
M.append(mission(32, "mission.labor_day", "Labor Day", 3, 10, N, "1974-09-02", ("21:00", "01:00"), ["clear"], 20, ["P1", "P2", "P3", "P4", "P5"],
  "char.teddy_arce", [
   O("o1", "enter_vehicle", "Your car, 37th & Seventh", vehicle="vehicle_role.nick_sedan"),
   O("o2", "goto", "Down Seventh to 23rd. Don't stop.", to="W 23rd St & 7th Ave", radius=25),
   O("o3", "switch_to", "(Delphine)", character=D, cut="transition"),
   O("o4", "evade", "Through Penn Station, out on Seventh", **{"from": ["char.jimmy_brannock"]}, breakDistanceM=80, safeZones=["interior.penn_station_concourse"],
     fallback="goto interior.penn_station_concourse with timeLimitSec 150"),
   O("o5", "goto", "Down Broadway to Madison Square", to="Broadway & W 25th St", radius=25),
   O("o6", "switch_to", "(Teddy)", character=T, cut="transition"),
   O("o7", "goto", "The Flatiron prow", to="loc.flatiron_prow", radius=10),
   O("o8", "dialogue", "Where you started", script="dlg.m32_prow")],
  ["o2", "o3", "o5", "o6", "o7"], [], flags=["flag.epilogue_started"],
  npcs=["char.teddy_arce", "char.delphine_moore", "char.carl_mayhew", "char.dennis_wurtz", "char.jimmy_brannock", "char.ruth_calloway", "char.delroy_tate", "char.howard_lisle"],
  arch=["npc.holiday_stroller", "npc.plainclothes"], veh=["vehicle_role.nick_sedan", "vehicle_role.cab", "vehicle_role.unmarked_sedan"],
  locs=["W 37th St & 7th Ave", "W 23rd St & 7th Ave", "loc.penn_station_lockers", "Broadway & W 25th St", "loc.flatiron_prow"],
  start={"type": "auto", "at": "loc.varelas_loft", "note": "Labor Day night; the Garment District is empty. Ending-specific setup comes from Branch B flags (N3 §4)."},
  fail=[{"type": "vehicle_destroyed"}, {"type": "caught", "note": "Proposed; fallback timer."}],
  rew_extra={"setDate": "1974-10-01"},
  mobile="Five checkpoints across 20 minutes. Each lead's run is 3–5 minutes. Nick's drive follows Seventh's southbound one-way. Pursuers end on the south-edge barricade or in a jam if the player strays (content/boundaries.json). Delroy's cab can block a street if his relationship with Teddy is +2 or more (route knowledge, not reflexes).",
  design="The finale converges three runs on the prow where the game began. The ending-specific content in dlg.m32_prow and the pursuers' presence are keyed to the Branch B flags. The final shot follows N3 §4 ('who stands there, facing which way'). Rewards move the clock to the epilogue (1974-10-01)."))


# ---------------------------------------------------------------- COMBAT REWORK, Acts 2-3 (26 Nov 2026)
# User: "Full open world and missions like a GTA game". Each mission gets an action beat inserted
# after the named objective, or an objective converted ('replace'). Missions at the 20-min cap
# convert rather than add. Cops are ordinary killable police (heat only); characters the plot needs are essential (conventions.py).
def CB(i, mode, text, targets, **k):
    o = {"id": i, "type": "combat", "mode": mode, "targets": targets, "nonLethalAllowed": True, "text": text}
    o.update(k); return o
A_ = lambda n, c=1: {"archetype": n, "count": c}
COMBAT = {
 "mission.five_am": ({"o2": [CB("o2b", "melee", "Catch the tyre-slashers in the palms", [A_("npc.carrier_muscle", 2)], note="Dawn, among Moretti's potted palms (soft collisions)")]}, 15, ["o2", "o2b", "o4", "o5"]),
 "mission.tax_day": ({"o4": [CB("o4b", "melee", "Lonnie's boys corner you in the arcade", [A_("npc.lonnie_crew", 2)], weapons=["item.straight_razor"])]}, 14, ["o2", "o4", "o4b", "o5"]),
 "mission.lunch_counter": ({"o5": [CB("o5b", "defend", "Two of Wurtz's men jump Calloway", [A_("npc.plainclothes", 2)], protect="char.ruth_calloway", note="Plainclothes cops: ordinary killable police (heat only). Calloway is essential.")]}, 16, ["o2", "o3", "o5", "o5b"]),
 "mission.contact_prints": ({"o6": [CB("o6b", "takedown", "Brannock's partner grabs your camera", [A_("npc.plainclothes", 1)])]}, 15, ["o2", "o5", "o6b", "o7"]),
 "mission.cold_room": ({"o4": [CB("o4b", "firefight", "Stick-up crew hits the fur vault", [A_("npc.stickup_man", 3)], weapons=["item.revolver_service"], cover=["garment racks", "vault door"], note="Midday fur-vault robbery. Yiannis's crew hides; Teddy holds the door.")]}, 15, ["o2", "o4", "o4b", "o5"]),
 "mission.brownout": ({"o6": [CB("o6b", "defend", "Looters rush the ice truck in the dark", [A_("npc.brownout_looter", 4)], protect="vehicle_role.ice_truck", note="Nick: poor shot. Hire the ice men as muscle (Payroll) or pay the looters off (bribe).")]}, 18, ["o3", "o5", "o6b", "o7"]),
 "mission.margin_call": ({"o4": [{"id": "o4b", "type": "chase", "target": "npc.kallis_driver", "catchDistanceM": 6, "vehicleAllowed": True, "invert": True,
     "text": "Kallis's men are tailing you. Lose them.", "note": "Inverted chase: shake the pursuer using the 1974 one-ways (west on 29th, up Eighth)."}]}, 17, ["o2", "o4", "o4b", "o6", "o7"]),
 "mission.the_lease": ({"o2": [CB("o2b", "melee", "Lonnie's boys are smashing the shop", [A_("npc.lonnie_crew", 2)], weapons=["item.straight_razor"])]}, 16, ["o2", "o2b", "o4", "o5", "o7"]),
 "mission.cold_storage": ({"replace": {"o6": CB("o6", "firefight", "Villalba's men hijack the bales truck", [A_("npc.carrier_muscle", 4)], weapons=["item.revolver_service"], cover=["box trucks", "loading dock"], note="Converted from the tail (20-min cap). Teddy defends the truck he was sent to collect from.")}}, 20, ["o2", "o4", "o6", "o7", "o9", "o10"]),
 "mission.rewiring": ({"o2": [CB("o2b", "melee", "Prentiss's men guard the panel", [A_("npc.prentiss_mover", 3)], note="Teddy forces his way to the switch. Power returns, but too late for Mr. Hollis.")]}, 15, ["o2", "o2b", "o4", "o6"]),
 "mission.partners_meeting": ({"o5": [{"id": "o5b", "type": "chase", "target": "npc.plainclothes", "catchDistanceM": 6, "vehicleAllowed": True, "invert": True,
     "text": "Wurtz's green sedan is behind you.", "note": "Inverted chase in the sedan; ends at a brownout-dark signal if lost."}]}, 15, ["o2", "o4", "o5b"]),
 "mission.carbon_copy": ({"replace": {"o9": CB("o9", "firefight", "Lisle's security on the freight stairs", [A_("npc.night_watchman", 1), A_("npc.lisle_driver", 2)], weapons=["item.revolver_service"], note="The watchman is non-lethal; the driver's men are hired guns. Converted from the exit goto.", text_override=True)}}, 18, ["o2", "o4", "o6", "o9"]),
 "mission.the_address": ({"o6": [CB("o6b", "melee", "Lonnie's crew moves on Tina in the crowd", [A_("npc.lonnie_crew", 2)], weapons=["item.straight_razor"])]}, 18, ["o3", "o4", "o6b", "o7", "o9"]),
 "mission.flip": ({"o5": [CB("o5b", "firefight", "Villalba's drivers ambush the booth", [A_("npc.carrier_muscle", 4)], cover=["truck bays", "fuel drums"], note="Nick hires muscle beforehand or fights badly; Augie survives (lethal: false).")]}, 16, ["o2", "o3", "o5b", "o6"]),
 "mission.the_car": ({"o4": [CB("o4b", "firefight", "Lisle sent men to clean up Mayhew", [A_("npc.lisle_driver", 3)], protect="char.carl_mayhew", weapons=["item.revolver_service"], cover=["parked cars", "the stoop"], note="Rain, W 35th St. Teddy protects the man he came to confront.")]}, 17, ["o2", "o3", "o4", "o4b"]),
 "mission.fire_watch": ({"o8": [CB("o8b", "firefight", "The firebug's crew turns on you", [A_("npc.hired_firebug", 1), A_("npc.stickup_man", 2)], weapons=["item.revolver_service"], note="In the alley off W 31st; no fire is ever lit (content rule).")]}, 20, ["o2", "o3", "o6", "o8b"]),
 "mission.exposure": ({"o7": [CB("o7b", "survive", "Wurtz's unit corners you at the lockers", [A_("npc.plainclothes", 3)], durationSec=60, note="Survive until Nick's hired muscle arrives (Payroll); then the Disappear exit through the concourse.")]}, 18, ["o3", "o5", "o7b", "o9"]),
 "mission.the_march": ({"o2": [CB("o2b", "defend", "Prentiss's men try to break the march", [A_("npc.prentiss_mover", 4)], protect="char.odessa_pruitt", note="Crowd fight on Broadway; marchers help. Odessa is essential.")]}, 18, ["o2", "o2b", "o3", "o5", "o7"]),
 "mission.the_ledger": ({"o2": [CB("o2b", "firefight", "Wurtz's men want the ledger first", [A_("npc.plainclothes", 2), A_("npc.lisle_driver", 2)], weapons=["item.revolver_service"], note="Whatever Teddy chose, someone tries to take it on W 31st St. Plainclothes are ordinary killable police (heat only).")]}, 17, ["o1", "o2", "o2b", "o4"]),
 "mission.closing": ({"o3": [CB("o3b", "defend", "Kallis's men want the deed unsigned", [A_("npc.carrier_muscle", 2)], protect="char.jung_ho_baek", note="Nick: hire muscle, pay them off, or fight badly.")]}, 15, ["o2", "o3b", "o4", "o5"]),
 "mission.lease": ({"o2": [CB("o2b", "melee", "Lonnie's last try, at the shop door", [{"character": "char.lonnie_gage", "lethal": False}], weapons=["item.straight_razor"])]}, 14, ["o1", "o2", "o2b", "o3"]),
 "mission.labor_day": ({"replace": {"o4": CB("o4", "survive", "Brannock's men in the Penn concourse", [A_("npc.plainclothes", 3), A_("npc.lisle_driver", 2)], durationSec=75, note="Converted from the evade (20-min cap): fight through, then out on Seventh.")}}, 20, ["o2", "o3", "o4", "o5", "o6", "o7"]),
}
for m in M:
    c = COMBAT.get(m["id"])
    if not c: continue
    spec, dur, cps = c
    objs = []
    for o in m["objectives"]:
        rep = spec.get("replace", {}).get(o["id"])
        if rep:
            r = dict(rep); r.pop("text_override", None); objs.append(r)
        else:
            objs.append(o)
        objs.extend(spec.get(o["id"], []))
    m["objectives"] = objs
    m["durationMin"] = dur
    m["checkpoints"] = cps
    if not any(f["type"] == "player_down" for f in m["fail"]):
        m["fail"] = m["fail"] + [{"type": "player_down", "note": "Retry from the last checkpoint; hospital/arrest flow per Gameplay (CORE_SYSTEMS)."}]
    m["design"] += " COMBAT (26 Nov): see COMBAT table in build_act23_missions.py."

# ---------------------------------------------------------------- M23 becomes the subway mission
for m in M:
    if m["id"] != "mission.shoebox": continue
    m["title"] = "Below Thirty-Fourth"
    m["durationMin"] = 18
    m["objectives"] = [
     O("o1", "enter_interior", "The Arden boiler room. Get the box.", marker="interior.arden_back_stairs"),
     O("o2", "dialogue", "Marcus: Ricky talked. They know.", script="dlg.m23_marcus"),
     O("o3", "enter_interior", "Down into Herald Square station", marker="interior.herald_sq_station"),
     O("o4", "dialogue", "A token, a turnstile, and Brannock", script="dlg.m23_token_booth"),
     O("o5", "enter_interior", "Into the old 33rd Street passage", marker="interior.passage_33rd"),
     O("o6", "evade", "Lose them in the dark passage", **{"from": ["char.jimmy_brannock", "npc.plainclothes"]}, breakDistanceM=60,
       safeZones=["interior.penn_ind_platform"], hazards=["rats (swarm, startle)", "flooded section", "dead lights"],
       fallback="goto interior.penn_ind_platform with timeLimitSec 150"),
     CB("o7", "melee", "Brannock catches up on the platform", [{"character": "char.jimmy_brannock", "lethal": False}], weapons=["item.straight_razor"],
        hazards=["platform edge", "an arriving train (timed, telegraphed)"], note="Content rule: no instructional detail about the third rail; it's a visible 'do not' hazard only."),
     O("o8", "goto", "Take the downtown local to 23rd St", to="W 23rd St & 8th Ave", radius=20, note="Ride one stop; the train is a moving set (sway, flickering lights, graffiti cars)."),
     O("o9", "deliver", "Box to Hanyang House, W 32nd St", item="item.club_shoebox", to="interior.hanyang_house"),
     O("o10", "dialogue", "Mi-sook opens the back room", script="dlg.m23_mi_sook"),
     O("o11", "enter_interior", "Back to the Arden. Tina's waiting.", marker="interior.arden_lobby"),
     O("o12", "dialogue", "Tina tells you everything", script="dlg.m23_tina")]
    m["checkpoints"] = ["o3", "o5", "o7", "o9"]
    m["locations"] = ["loc.arden_hotel", "W 34th St & 6th Ave", "8th Ave & W 33rd St", "W 23rd St & 8th Ave", "loc.korean_restaurant"]
    m["archetypes"] = sorted(set(m["archetypes"] + ["npc.subway_rider", "npc.token_clerk", "npc.rat_swarm"]))
    m["mobile"] = ("The underground is navigated by lit signs and the passage's single track of bulbs; route knowledge (the passage links Herald Square to Penn "
                   "Station) is the solution. Rats are a startle, not damage. The train arrival is telegraphed 6+ seconds ahead. Melee on soft lock.")
    m["design"] = ("**The subway story mission** (user: 'Maybe a mission in the subways'). Uses what only the subway has: a token booth and turnstiles, "
                   "a half-abandoned pedestrian passage from Herald Square toward Penn Station (real; sources differ on when it closed, 1970s or c.1990), "
                   "rats, a platform fight with a train coming, and a one-stop ride on a graffiti-covered local. Content rule: the third rail is a "
                   "visible hazard with no instructional detail. Then the kye hand-off and Tina's confession, as before.")


def tod_label(w):
    """Time-of-day label for UI mission cards (TIME.md). Night = window starts 19:00 or later or before 05:00."""
    if not w: return "any"
    h = int(w[0][:2])
    if 4 <= h < 6: return "dawn"
    if 6 <= h < 17: return "day"
    if 17 <= h < 20: return "dusk"
    return "night"
for m in M:
    m["timeOfDay"] = tod_label(m["requires"].get("timeWindow"))
import sys as _sys; _sys.path.insert(0, str(Path(__file__).parent)); import conventions
conventions.apply(M)
for m in M:
    (OUT / f"{m['id'].split('.', 1)[1]}.json").write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n")
print(len(M), "missions written")
