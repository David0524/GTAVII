"""Mission payouts (user decision 26 Nov 2026, verbatim: "Yes, but in GTA VI you can really rack up money.
Like 10s of thousands"). Ordinary jobs pay hundreds to low thousands; big jobs and heists $10k-$50k+;
story beats may cost money or pay nothing, as exceptions. Everyday 1974 prices stay real (token 35c, coffee 20c).

rewards.money        = total of the base payouts (for back-compat and the economy sim)
rewards.moneyByLead  = who gets paid (each lead keeps a separate wallet)
rewards.moneyIf      = branch adjustments: [{flag, lead, money, why}] applied at completion if the flag is set
rewards.payNote      = where the money comes from in the fiction (so nobody is paid by nothing)
Figures are a proposal to Gameplay (economy owner) and may be tuned by their simulation."""
T, D, N = "char.teddy_arce", "char.delphine_moore", "char.nick_varelas"

PAY = {
 "mission.dusk_on_broadway": ({}, [], "Exception: Teddy refuses the offer. Nothing is paid."),
 "mission.night_desk": ({T: 120}, [], "A week's wages at the night desk, in an envelope from Prentiss."),
 "mission.hack": ({T: 180}, [], "Delroy's cab: fares and tips, after Delroy's cut."),
 "mission.surcharge": ({T: 250}, [], "Feld's day rate, plus what Augie slips him to keep quiet."),
 "mission.contact_sheet": ({T: 400}, [], "Navarro pays for the prints of Lisle."),
 "mission.the_club": ({D: 450}, [], "Delphine's own week. The club's pot isn't hers and is never counted as income."),
 "mission.yes": ({T: 1000}, [{"flag": "flag.mayhew_saw_photo", "lead": T, "money": 500, "why": "Mayhew pays more to make the photograph go away"}],
                 "Mayhew's first week and the start-up cash for the round. The dialogue's '$200 a week' is the salary; the rest is float to keep."),
 "mission.back_stairs": ({D: 600}, [], "Delphine sells a print of Brannock collecting to a scandal sheet, with no name attached."),
 "mission.independence_day": ({T: 2000, D: 600}, [], "Teddy's cut of the holiday envelopes; Delphine keeps what Lonnie's crew dropped."),
 "mission.five_am": ({T: 1500}, [], "The bagman's skim on the dawn collections."),
 "mission.tax_day": ({D: 1000}, [], "Bauer's fee for keeping his name out of it."),
 "mission.lunch_counter": ({}, [{"flag": "flag.branch_a_wire", "lead": T, "money": 1000, "why": "Calloway's witness expenses"}],
                           "No pay unless Teddy wears the wire (Branch A)."),
 "mission.contact_prints": ({D: 1200}, [], "Ricky's leak is paid for; Earl's ledger copies are sold to the Dispatch's morgue."),
 "mission.cold_room": ({T: 2000}, [], "Fur District collections: the biggest week of the round."),
 "mission.brownout": ({N: -6000}, [], "Exception: Nick pays the ice trucks, the favours and Teddy's envelope out of his own pocket."),
 "mission.margin_call": ({N: 4000}, [], "Kallis's bridge money, with strings that M24 pulls."),
 "mission.the_lease": ({D: 1500}, [], "Nick's agent's goodwill deposit for the W 37th St shop, if Delphine signs."),
 "mission.cold_storage": ({N: 25000, T: 5000, D: 3500}, [],
                          "THE HEIST. Nick's insurance claim on the 'missing' coats; Teddy's cut as the collector who saw it; Delphine's price for the negatives."),
 "mission.rewiring": ({}, [], "Exception: grief. Nothing is paid."),
 "mission.partners_meeting": ({N: 6000}, [], "Lisle's 'fee' for Nick's name on every hotel: the dirtiest money in the game."),
 "mission.carbon_copy": ({T: 2500, N: 1500}, [{"flag": "flag.branch_a_burned", "lead": T, "money": 2500, "why": "the stolen ledger's cash drawer"}],
                         "Mayhew's last envelope to Teddy; Nick's kickback from Marjorie's carbons."),
 "mission.the_address": ({T: 2000, D: 1500, N: 3000}, [], "Resignation night panic: Mayhew's grab bag, the club's emergency fee, Nick's liquidated furs."),
 "mission.shoebox": ({D: 3000}, [], "Delphine's fee for carrying the club money underground. The club's $18,000 is moved, not earned."),
 "mission.flip": ({N: 8000}, [], "Calloway's deal and Augie's buy-out of the trucking contract."),
 "mission.the_car": ({}, [], "Exception: the truth about 1971. Nothing is paid."),
 "mission.fire_watch": ({T: 2000, D: 1500}, [], "The tenants' collection and the Corwin's fire insurer's reward."),
 "mission.exposure": ({D: 4000, N: 5000}, [], "Wurtz's locker cash, split."),
 "mission.the_march": ({}, [], "Exception: the march. Nothing is paid."),
 "mission.the_ledger": ({}, [
     {"flag": "flag.ledger_to_prosecutor", "lead": T, "money": 7500, "why": "witness relocation stipend"},
     {"flag": "flag.ledger_to_press", "lead": T, "money": 10000, "why": "the Dispatch buys the story"},
     {"flag": "flag.ledger_kept", "lead": T, "money": 35000, "why": "the pad's first month, run by Teddy"},
     {"flag": "flag.ledger_burned", "lead": T, "money": 0, "why": "nothing: that's the point"}],
     "Branch B sets the payout: Testimony $7.5k, Public $10k, New Pad $35k, Ashes $0."),
 "mission.closing": ({}, [
     {"flag": "flag.corwin_sold_on", "lead": N, "money": 40000, "why": "Lisle's people pay over the odds"},
     {"flag": "flag.corwin_kept", "lead": N, "money": -10000, "why": "real wiring and fans on eleven"},
     {"flag": "flag.corwin_to_council", "lead": N, "money": -1, "why": "a dollar the wrong way, on purpose"}],
     "The Corwin's fate sets Nick's payout."),
 "mission.lease": ({D: 4000}, [{"flag": "flag.delphine_shop", "lead": D, "money": -3000, "why": "the shop's first quarter's rent"}],
                   "The club's count settles and Delphine's share is paid out."),
 "mission.labor_day": ({T: 6000, D: 6000, N: 6000}, [], "THE FINALE. The last load: an even split, as promised at the prow."),
}


def apply_one(m):
    if m["id"] not in PAY:
        return
    by, cond, note = PAY[m["id"]]
    r = m["rewards"]
    r["money"] = sum(by.values())
    if by: r["moneyByLead"] = dict(by)
    else: r.pop("moneyByLead", None)
    if cond: r["moneyIf"] = cond
    else: r.pop("moneyIf", None)
    r["payNote"] = note


def totals():
    leads = {T: 0, D: 0, N: 0}
    for by, cond, _ in PAY.values():
        for k, v in by.items(): leads[k] += v
    return leads
