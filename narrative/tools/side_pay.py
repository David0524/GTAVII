#!/usr/bin/env python3
"""Side-content payouts (user decision: "Like 10s of thousands"; scale agreed with Gameplay 26 Nov 2026).
Writes rewards.money (paid to whoever plays it, unless moneyByLead), durationMin (for the economy sim) and heat (0-3)
into content/side/*.json in place (idempotent). Missions stay the best earner: $5k+ jobs take 20+ min and carry real heat.
Per-run rates of repeatable activities stay in content/activities.json; 'money' here is the completion payout of the piece."""
import json
from pathlib import Path
SIDE = Path(__file__).resolve().parents[2] / "content" / "side"
# id: (money on completion, durationMin, heat 0-3, note)
P = {
 "baby_cab": (0, 8, 1, "Kindness: no pay. The reward is the name in the epilogue paper."),
 "brownout_relief": (150, 15, 0, "A block collection, pressed on you."),
 "bryant_brawl": (60, 6, 1, "A grateful vendor's till."),
 "bulldog_scoop": (400, 18, 1, "Per-run $12; the scoop bonus on completion."),
 "buyers_banquet": (3500, 25, 0, "Nick's fall orders: a deposit up front."),
 "chop_list": (6000, 35, 3, "BIG JOB: the full weekly list delivered in one night. Per car $100–600 on top."),
 "club_crisis": (0, 15, 1, "Club trust only."),
 "club_ious": (0, 20, 0, "Bittersweet: the money goes home, not to you."),
 "collections_marked": (1500, 20, 2, "Marked bills skimmed and swapped."),
 "corner_pocket": (800, 15, 0, "The big table's stake."),
 "desk_requests": (120, 15, 0, "Tips from the floors."),
 "fence_wants": (5500, 30, 3, "BIG JOB: the top item on Marty's list (a fur coat from a bonded vault). 30–50% of value on smaller items."),
 "fight_door": (900, 20, 1, "$30 a night; the bets on the last card."),
 "fire_escape_gardens": (0, 15, 0, "Kindness: flowers for the march."),
 "four_pianos": (400, 25, 0, "$25 a piano, and the brothers' bonus."),
 "garden_runaway": (40, 15, 1, "$40 from the stable, as written."),
 "garment_rush": (300, 15, 0, "Speed-ladder bonus on top of $15 a run."),
 "hack_license": (-25, 10, 0, "A cost: the licence fee. Pays back as +50% fares."),
 "hack_turns": (200, 15, 0, "Regulars' bonus on top of fares."),
 "hill_races": (5000, 25, 3, "BIG JOB: the last race's pot against a Murray Hill heir. Earlier stakes $20–100."),
 "hollis_postcards": (0, 20, 0, "Memorial: no pay."),
 "hydrant_war": (0, 10, 1, "Reputation only."),
 "insomnia_drives": (0, 20, 0, "Places, not money."),
 "last_train": (250, 12, 1, "Her thanks, in cash and a business card."),
 "locksmith": (300, 20, 0, "$10–25 a call; completion bonus."),
 "lost_tourists": (20, 5, 0, "A small tip, as written."),
 "marquee_letters": (100, 20, 0, "The manager's thanks."),
 "monte": (700, 10, 2, "Cash, or information instead."),
 "night_rate_stunts": (1200, 20, 1, "$50 a take; the wrap bonus."),
 "numbers_runner": (500, 20, 2, "$10 a day; the Friday bank bonus."),
 "old_beat": (0, 15, 0, "Favours, not money."),
 "otb_tips": (2500, 15, 0, "The tip's payout if you bet it (stake required)."),
 "own_business": (0, 10, 0, "The business pays weekly ($40–150) through Gameplay's property system."),
 "passage_shops": (1500, 20, 1, "What's behind the gate."),
 "photo_night_desk": (600, 20, 1, "$10–75 a print; the first-on-scene bonus."),
 "pigeon_bands": (300, 25, 0, "The final race's purse."),
 "pigeon_commodore": (200, 20, 0, "$20 a race; completion purse."),
 "practice_chair": (0, 15, 0, "Tina +1: no pay."),
 "projectionist": (0, 20, 0, "A screening, not money."),
 "purse_snatch": (50, 5, 1, "The owner's thanks."),
 "platform_dip": (40, 5, 1, "The commuter's tip; keep the wallet instead for about $60 and +1 heat if seen."),
 "coop_thief": (75, 8, 0, "Hallisey pays in cash and a race tip."),
 "whispering_corner": (0, 20, 0, "Kindness: no pay. Feeney's track-change tips instead."),
 "rent_day": (2000, 20, 0, "A month's rent roll (Nick)."),
 "rizo_147": (0, 20, 1, "The front page, not money."),
 "runaway_rack": (0, 8, 0, "A free suit instead of cash."),
 "skip_board": (7500, 35, 3, "BIG JOB: the board's top skip (a bonded fur thief, $75,000 bail, 10%). Smaller skips 10% of bail."),
 "stuck_elevator": (150, 12, 0, "Reward and a contact."),
 "tar_beach": (10, 8, 0, "$10 and a cold soda, as written."),
 "telegrams": (150, 20, 0, "Tips on the last round."),
 "the_lost_husband": (0, 30, 0, "The watch (sellable for about $300 at the pawnshop) instead of cash."),
 "three_am_phone": (0, 25, 1, "Story intel."),
 "wanted_1971": (0, 15, 0, "Lore."),
 "water_tank_radio": (0, 15, 0, "A place, not money."),
 "weather_prophet": (50, 15, 0, "Pays for the barometer, and then some."),
}
n = 0
for f in sorted(SIDE.glob("*.json")):
    if f.name == "side_content.json": continue
    d = json.loads(f.read_text()); key = d["id"].split(".")[-1].removeprefix("side_")
    if key not in P: raise SystemExit(f"no pay row for {key}")
    money, dur, heat, note = P[key]
    d["rewards"].update(money=money, payNote=note); d["durationMin"] = dur; d["heat"] = heat
    import traversal; traversal.apply_side(d)
    f.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n"); n += 1
big = {k: v for k, v in P.items() if v[0] >= 5000}
assert all(v[1] >= 20 and v[2] >= 2 for v in big.values()), "big side jobs must be 20+ min with real heat"
print(n, "side pieces priced; total", sum(v[0] for v in P.values()), "; big:", sorted(big))
