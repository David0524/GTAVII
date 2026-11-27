"""Chase and traversal pass (docs/briefs/MOVEMENT.md, user decision 27 Nov 2026: "Make sure we have character physics
like climbing, stepping on a curb without having to jump... Also reference 1970s NYC.").

Adds `traversal` beats (key `traversal`; `route` is already used for vehicle routes) to chase/evade objectives: each beat is a traversal move from MOVEMENT.md's required set, placed at a
real 1970s Midtown fixture. Markers (tv.*) are traversal markup requests for Interiors/engine data (ENGINE_REQUESTS 15).
Mobile rules on every route: one context button, auto-aligned; no precise timing; a missed roof jump catches a ledge or
drops to the fire-escape landing below (never instant death); the quarry rubber-bands so a slow player isn't failed by a
timer; a checkpoint at the route's midpoint."""

MOVES = {"vault", "climb", "fence_climb", "drop_ladder", "fire_escape", "windowsill", "roof_jump", "hang_drop", "ladder",
         "scaffold", "subway_stairs", "turnstile_vault", "car_hood", "crowd_push", "cellar_doors", "stoop"}
MOBILE = ("One context button (climb/vault), auto-aligned. No precise timing. A missed roof jump catches the ledge or drops to "
          "the fire-escape landing below. The quarry rubber-bands (never more than ~40 m ahead), so no timer fails the player.")


def b(move, at, marker, note=""):
    assert move in MOVES, move
    d = {"move": move, "at": at, "marker": marker}
    if note: d["note"] = note
    return d


ROUTES = {
 # M8: Delphine escapes Brannock over the Arden's rear fire escape and the W 38th St roofs.
 ("mission.back_stairs", "o4"): {
   "text": "Up the Arden fire escape, over the roofs",
   "route": [
     b("crowd_push", "8th Ave & W 38th St, the Saturday-night sidewalk", "tv.8th_38_sidewalk", "Shoulder through; Brannock bulls through behind."),
     b("vault", "a garbage-can row at the alley mouth, W 38th St", "tv.w38_alley_cans"),
     b("drop_ladder", "the Arden's rear fire escape: jump and pull the counterweighted ladder down", "tv.arden_fe_ladder"),
     b("fire_escape", "the Arden's fire escape, four landings up, past lit windows (an argument; a card game; a radio)", "tv.arden_fe_stairs"),
     b("roof_jump", "the Arden's parapet to the lower walk-up next door, over a 2 m air shaft", "tv.w38_airshaft_gap", "Ledge grab on a near miss."),
     b("climb", "a water-tank platform, to break line of sight", "tv.w38_watertank"),
     b("hang_drop", "into the back stairwell bulkhead: the Arden's back stairs", "tv.arden_bulkhead", "Brannock is too heavy for the gap; he shouts from the far roof.")],
   "checkpointAfter": "tv.arden_fe_stairs",
   "barks": "barks.traversal"},
 # M9: Teddy loses Lonnie's crew down Eighth Ave into Penn Station.
 ("mission.independence_day", "o9"): {
   "text": "Lose them down Eighth, into Penn Station",
   "route": [
     b("car_hood", "a double-parked Fareway cab (Garrity) on Eighth Ave at 34th", "tv.8th_34_cab"),
     b("vault", "a shuttered newsstand counter at 33rd & Eighth", "tv.8th_33_newsstand"),
     b("scaffold", "a sidewalk shed on the Eighth Ave side of the Penn Square Garden block: up and along the plank deck", "tv.psg_sidewalk_shed"),
     b("hang_drop", "off the shed's end, into the crowd leaving the fireworks", "tv.psg_shed_end"),
     b("subway_stairs", "down the Eighth Ave entrance at 33rd into the concourse", "tv.penn_8th_stairs", "Run the stairs; the crew loses you in the holiday crowd.")],
   "checkpointAfter": "tv.8th_33_newsstand",
   "barks": "barks.traversal"},
 # M23: Delphine at the Herald Square turnstiles; Brannock at the token booth.
 ("mission.shoebox", "o5"): {
   "text": "Over the turnstile, into 33rd St passage",
   "route": [
     b("turnstile_vault", "the IND turnstiles. Vault (fare evasion: +1 heat if a transit cop sees) or pay the 35¢ token and lose three seconds", "tv.herald_turnstiles",
       "Both work. It's the player's choice of risk; neither is a fail.")],
   "barks": "barks.traversal"},
 ("mission.shoebox", "o6"): {
   "route": [
     b("vault", "a fallen 'PASSAGE CLOSED' sawhorse at the 33rd St gate", "tv.passage_gate"),
     b("climb", "over a heap of dumped display fixtures from the shuttered shops", "tv.passage_fixtures"),
     b("crowd_push", "through a sleeping-bag row by the dead lights (walk; don't run anyone over)", "tv.passage_sleepers", "Running here is a choice with a reputation cost."),
     b("cellar_doors", "a service hatch into the Penn IND mezzanine", "tv.passage_hatch")],
   "checkpointAfter": "tv.passage_fixtures",
   "barks": "barks.traversal"},
}

INSERTS = {
 # M26: after the firefight the firebug bolts up a fire escape and over the W 31st St roofs.
 ("mission.fire_watch", "o8b"): {"id": "o8c", "type": "chase", "target": "npc.hired_firebug", "catchDistanceM": 3,
   "text": "Catch the firebug on the W 31st roofs", "finish": "tackle", "lawful": True,
   "then": {"restrain": True, "noBolt": True, "walkTo": "Prentiss's car (o9)", "doneOn": "restrained, then o9 begins at the car"},
   "route": [
     b("drop_ladder", "a dry-cleaner's rear fire escape off W 31st, ladder already down (he used it)", "tv.w31_fe_ladder"),
     b("fire_escape", "five landings up, past a window where an old man is watching the ballgame", "tv.w31_fe_stairs"),
     b("vault", "over a skylight frame on the roof (don't step on the glass)", "tv.w31_skylight"),
     b("roof_jump", "across a 1.5 m gap to the next walk-up, the firebug's gas can bouncing ahead", "tv.w31_gap", "He drops the can; it rolls, leaking. Don't fire near it."),
     b("ladder", "down a steel roof ladder to a lower setback roof", "tv.w31_setback"),
     b("climb", "up onto a billboard catwalk, where he's cornered", "tv.w31_billboard", "Nowhere left to run: the catch.")],
   "checkpointAfter": "tv.w31_fe_stairs", "barks": "barks.traversal"},
}

SIDE = {
 # Purse snatch: a quick Herald Square chase over street furniture.
 ("mission.side_purse_snatch", "o2"): {
   "route": [
     b("crowd_push", "the W 34th St shoppers outside Lacy's", "tv.w34_crowd"),
     b("vault", "a hot-dog cart at Broadway", "tv.w34_hotdog_cart"),
     b("car_hood", "a stalled bus on 34th", "tv.w34_bus"),
     b("stoop", "up and over a stoop rail on W 35th", "tv.w35_stoop")],
   "catchDistanceM": 3, "finish": "tackle", "lawful": True},
 # Tar beach: a rooftop chase over the W 30s walk-ups.
 ("mission.side_tar_beach", "o3"): {
   "route": [
     b("vault", "over the sunbather's folding chairs and tar-paper blankets", "tv.w32_tarbeach"),
     b("roof_jump", "a plank laid across the gap to the next roof (it bounces)", "tv.w32_plank"),
     b("ladder", "up the steel ladder of a water tank, to see where he went", "tv.w33_watertank"),
     b("roof_jump", "a short gap to a lower roof with a pigeon coop (the birds explode upward)", "tv.w34_coop_gap"),
     b("fire_escape", "down a fire escape to the W 35th St side", "tv.w35_fe"),
     b("drop_ladder", "drop from the lowest platform; the ladder is rusted up", "tv.w35_fe_drop", "Hang-drop instead: a 2.5 m fall, a roll on landing.")],
   "checkpointAfter": "tv.w33_watertank", "finish": "tackle", "lawful": True},
 # Skip board: the skip runs through a vacant lot.
 ("mission.side_skip_board", "o5"): {
   "preChase": True,
   "route": [
     b("cellar_doors", "he bolts out through the sidewalk cellar doors of the pool hall", "tv.w41_cellar"),
     b("fence_climb", "a chain-link fence into a rubble lot off W 41st", "tv.w41_lot_fence"),
     b("vault", "a burned-out car hulk in the lot", "tv.w41_lot_car"),
     b("fence_climb", "the lot's back fence, onto W 40th", "tv.w40_fence")],
   "checkpointAfter": "tv.w41_lot_fence", "finish": "tackle", "lawful": True,
   "then": {"restrain": True, "loadIntoCar": True, "doneOn": "notice quarryLoaded (Gameplay 67724f1)"}},
}


def _apply(spec, table):
    for (sid, oid), r in table.items():
        if spec["id"] != sid:
            continue
        for o in spec["objectives"]:
            if o["id"] != oid:
                continue
            o["traversal"] = r["route"]
            o["traversalMobile"] = MOBILE
            if r.get("text"): o["text"] = r["text"]
            if r.get("catchDistanceM"): o["catchDistanceM"] = r["catchDistanceM"]
            if r.get("finish"): o["finish"] = r["finish"]; o["lawful"] = r.get("lawful", True)
            if r.get("then"): o["then"] = r["then"]
            if r.get("barks"): o["barks"] = r["barks"]
            if r.get("preChase"): o["note"] = (o.get("note", "") + " The skip runs first: chase him on foot (route), then take him down.").strip()
            cp = r.get("checkpointAfter")
            if cp:
                o["checkpointAfterMarker"] = cp


def apply_mission(m):
    _apply(m, ROUTES)
    for (sid, after), r in INSERTS.items():
        if m["id"] != sid or any(o["id"] == r["id"] for o in m["objectives"]):
            continue
        idx = next(i for i, o in enumerate(m["objectives"]) if o["id"] == after)
        o = {k: v for k, v in r.items() if k not in ("route", "checkpointAfter")}
        o["traversal"] = r["route"]; o["traversalMobile"] = MOBILE; o["checkpointAfterMarker"] = r["checkpointAfter"]
        m["objectives"].insert(idx + 1, o)


def apply_side(s):
    _apply(s, SIDE)


def markers():
    out = []
    for t in (ROUTES, SIDE, INSERTS):
        for (sid, oid), r in t.items():
            for x in r["route"]:
                out.append((x["marker"], x["move"], x["at"], sid))
    return out
