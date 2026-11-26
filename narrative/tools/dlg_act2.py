#!/usr/bin/env python3
"""Authoring source for Act 2 mission dialogue (N5): missions 10-21.
Lines are 90 characters or fewer; choices are 4 or fewer and 40 characters or fewer; no timed choices."""
import json
from pathlib import Path
OUT = Path(__file__).resolve().parents[2] / "content" / "dialogue"
T, D, N = "char.teddy_arce", "char.delphine_moore", "char.nick_varelas"
c = lambda n: f"char.{n}"
MAY, MOR, BAE, MIS, RIT, TIN, LON, BAU, CAL, NAV = map(c, ["carl_mayhew", "anna_moretti", "jung_ho_baek", "mi_sook_baek", "rita_haines",
                                                         "tina_mercado", "lonnie_gage", "ray_bauer", "ruth_calloway", "luis_navarro"])
EAR, RIC, WUR, BRA, KAL, YIA, ELE, WHI, LIS, MAR = map(c, ["earl_poole", "ricky_vail", "dennis_wurtz", "jimmy_brannock", "stavros_kallis",
                                                         "yiannis_doukas", "eleni_varelas", "gordon_whitlock", "howard_lisle", "marjorie_kell"])
ODE, GUS, HOL, CAR, MCH, PRE, INE, MAN, BER, DEL, AUG = map(c, ["odessa_pruitt", "gus_wilkie", "walter_hollis", "carmen_arce", "mei_lin_chow",
                                                              "vic_prentiss", "inez_rivera", "manny_soto", "bernard_ostrow", "delroy_tate", "augie_lomax"])
SCRIPTS = []


def S(sid, context, *lines):
    out, n = [], 0
    for x in lines:
        if isinstance(x, dict):
            out.append(x)
            continue
        n += 1
        spk, emo, text, *rest = x
        d = {"id": f"l{n}", "speaker": spk, "emotion": emo, "text": text}
        if rest:
            d.update(rest[0])
        out.append(d)
    SCRIPTS.append({"id": sid, "context": context, "lines": out})


def L(i, spk, emo, text, **k):
    d = {"id": i, "speaker": spk, "emotion": emo, "text": text}
    d.update(k)
    return d


def C(*choices, cid="c1", **k):
    d = {"id": cid, "choices": list(choices)}
    d.update(k)
    return d


def ch(text, goto, **k):
    d = {"text": text, "goto": goto}
    d.update(k)
    return d


def r(*t):
    return {f"{a}/{b}": n for a, b, n in t}

# ---------------- M10 Five A.M.
S("dlg.m10_moretti", "M10 o2. W 28th St at 04:50. Moretti hoses palms on the sidewalk. Her truck sits on two flat tyres.",
  (MOR, "loud", "Five a.m. I've got gladiolus, roses and a cop who wants twenty. One of those wilts."),
  (T, "flat", "I'm not a cop, Mrs. Moretti. I'm the guy they send instead."),
  (MOR, "angry", "My father paid nobody in 1931. I'm not paying in 1974."),
  (MOR, "angry", "And look at my truck. Two tyres, slashed. Third time since June. Who does that?"),
  C(ch("Press her. It's the job.", "l_press", setRelationships=r((T, MOR, -1), (T, MAY, 1))),
    ch("Let it slide this week.", "l_slide", setRelationships=r((T, MOR, 2), (T, MAY, -1)))),
  L("l_press", T, "tired", "Twenty, Mrs. Moretti. Or next week they send somebody who isn't polite."),
  L("l_press2", MOR, "cold", "Take it. Choke on it. Mind the fronds on your way out.", goto="l_end"),
  L("l_slide", T, "quiet", "I'll tell them you weren't open yet. Get your tyres fixed."),
  L("l_slide2", MOR, "surprised", "…Huh. You want to help? Grab a palm. Mind the fronds.", goto="l_end"),
  L("l_end", MOR, "low", "Ask the Carriers' boys about my tyres. Ask the one with the radio voice."))
S("dlg.m10_baek", "M10 o4. Seoul Star Imports, W 29th. Mr. Baek at the counter, pocket calculator out. Mrs. Baek in back.",
  (BAE, "dry", "Again you. Last month a truck. This month a gentleman. Next month, what? A dog?"),
  (MIS, "sharp", "My husband talks. I count. Today we counted wrong."),
  (BAE, "calm", "Twenty dollars. I give you twenty dollars. I want a receipt."),
  (T, "flat", "There's no receipt, Mr. Baek."),
  (BAE, "dry", "Then I make one. 'Twenty dollars, for nothing.' Sign here, please."),
  (MIS, "sharp", "Protection from what? The only thing I fear is the landlord."))
S("dlg.m10_count", "M10 o6. The Shamrock Rail at 07:30, chairs still on tables. Mayhew counts envelopes on the bar.",
  (MAY, "pleased", "Flowers, wigs, Earl. Look at you, kid. A natural."),
  L("l2a", MAY, "suspicious", "Hold on. July Fourth. The Moore woman. Fifty short.", **{"if": "flag.teddy_returned_tax"}),
  L("l2b", T, "flat", "I told you. I lost it running. Lonnie's boys.", **{"if": "flag.teddy_returned_tax"}),
  L("l2c", MAY, "cold", "Lost it. Sure. I'll make it up out of your next week. Like a bank.", **{"if": "flag.teddy_returned_tax"}),
  (MAY, "warm", "Two hundred. And here's the list for next week. The furs are on it. Easy people."),
  (MAY, "serious", "And kid? Wurtz asked about you. Means you're doing fine. Keep doing fine."))
# ---------------- M11 Tax Day
S("dlg.m11_rounds", "M11 o1. Rita's bar, afternoon. Delphine sets out her day.",
  (RIT, "low", "Brannock's car's been on Thirty-Eighth since noon. Watching the door."),
  (D, "brisk", "Then we move the club's money today. While he's watching the wrong door."),
  (RIT, "dry", "Where to? Under the bed? Under my bed?"),
  (D, "brisk", "Boiler room. Marcus's boiler room. Nobody steals from a boiler."),
  (RIT, "warm", "Collect the Royal first. Tina's always late. Today, be early."))
S("dlg.m11_tina", "M11 o3. Royal Cafeteria. Tina picks at pie and won't look up.",
  (TIN, "funny", "Del! Rule twelve: there is no rule twelve. I'm tired of rules."),
  (D, "quiet", "Rule six, then. You're two weeks behind. That's not like you."),
  (TIN, "deflecting", "Family stuff. My cousin. Lawyers cost money. I'll catch up."),
  (D, "noticing", "Your cousin is standing at the window, Tina. Waving at me."),
  (LON, "smooth", "Del, baby. A bank needs a guard. I'm offering to be the guard."),
  (D, "cold", "Rule seven: nobody guards my money but me. Excuse me."))
S("dlg.m11_bauer", "M11 o5. Bauer's office above the arcade. Fluorescent hum. Bauer sweats.",
  (BAU, "nervous", "Del! Ha! Running from Lonnie? Everybody runs from Lonnie. Sit, sit."),
  (BAU, "nervous", "I sell quarters. What people watch for a quarter is between them and God."),
  (D, "cool", "You're sweating, Ray. It's sixty degrees in here."),
  (BAU, "low", "Somebody downtown keeps asking about Wurtz. Asking me. Why me?"),
  (D, "cool", "Maybe because you answer, Ray."),
  (BAU, "nervous", "Legit. That's the word. I'm gonna be so legit you'll be bored."))
# ---------------- M12 Lunch Counter
S("dlg.m12_calloway", "M12 o2. Herald Square lunch counter. Calloway two stools from the end, accordion file at her elbow. **Branch A.**",
  (CAL, "crisp", "Mr. Arce. I've watched you walk past my car four times. Tuna or egg salad?"),
  (T, "flat", "You're the woman in the parked car on Fifth."),
  (CAL, "crisp", "Ruth Calloway. Special Prosecutor's office. Don't look around. Eat."),
  (CAL, "crisp", "You collect for Carl Mayhew. Mayhew collects for a lieutenant. Who collects for a lawyer."),
  (CAL, "crisp", "I'm not asking you to be brave, Mr. Arce. I'm asking you to be audible."),
  (CAL, "crisp", "Wear a wire on your rounds. Your record goes away. And I protect you."),
  (T, "flat", "Protect me how long?"),
  (CAL, "evasive", "As long as it takes."),
  C(ch("Wear the wire.", "l_wire", confirm="This choice can't be undone.",
       setFlags=["flag.branch_a_wire"], setRelationships=r((T, CAL, 2), (T, NAV, 1))),
    ch("Burn it. I'm not a rat.", "l_burn", confirm="This choice can't be undone.",
       setFlags=["flag.branch_a_burned"], setRelationships=r((T, CAL, -3), (T, MAY, 1), (T, WUR, 1)))),
  L("l_wire", T, "quiet", "Give me the thing. Before I finish this sandwich and change my mind."),
  L("l_wire2", CAL, "relieved", "It goes under the undershirt. You'll sweat. Everybody sweats.", goto="l_end"),
  L("l_burn", T, "cold", "I waited in a car once and said nothing. I'm good at it. Find another man."),
  L("l_burn2", CAL, "cold", "Then you're a witness I'll subpoena instead of a witness I protect. Your choice.", goto="l_end"),
  L("l_end", CAL, "dry", "I have a budget for coffee and a budget for you. Guess which is bigger."))
S("dlg.m12_delphine_calloway", "M12 o6. Fifth Ave & W 36th. Delphine knocks on the window of Calloway's parked sedan.",
  (D, "cool", "You bought a man lunch. I'd like to know what's on his bill."),
  (CAL, "crisp", "And you are the woman two stools down with a camera in her bag."),
  (D, "cool", "Rule eight: if you see me, I've already seen you."),
  (CAL, "interested", "Brannock. Wurtz. The tax on Eighth. You've been taking pictures."),
  (D, "cool", "Maybe. They're mine. Not evidence. Not yet."),
  (CAL, "crisp", "Everybody in that district is a witness. Most just don't know it yet."))
# ---------------- M13 Contact Prints
S("dlg.m13_earl", "M13 o2. Earl's stand in the rain under an awning. He opens a small cloth-bound book.",
  (EAR, "slow", "Every man on this street plays a number. Cops play the biggest."),
  (EAR, "slow", "Thirty years I've written down who I pay. Dates. Amounts. Badge numbers."),
  (D, "careful", "Why show me, Earl?"),
  (EAR, "slow", "State's got a lottery and I'm still here. I want to be here when they're not."),
  (EAR, "slow", "Brannock comes at eleven. Stand under the theatre awning. Good light there."))
S("dlg.m13_ricky", "M13 o5. Bryant Park, west terrace, rain on the leaves. Ricky shakes.",
  (RIC, "jittery", "Fifteen to life, man. For a bag. So yeah, I talk to cops. You would too."),
  (D, "gentle", "Who do you talk to, Ricky?"),
  (RIC, "jittery", "The big one. Sneakers. He wants to know where the women keep their money."),
  (D, "cold", "And you told him?"),
  (RIC, "ashamed", "Not yet. I'm not a rat. I'm a guy with a calendar. He's coming now. Hide."))
S("dlg.m13_rita_prints", "M13 o8. Rita's bar after close. Prints laid out on the bar under a lamp.",
  (RIT, "low", "Brannock taking. Wurtz with the park boy. Brannock again. You've got a file, sugar."),
  (D, "tired", "Three pictures. Three men who'd lose everything if I mailed them anywhere."),
  (RIT, "warning", "Or three men who'd make you disappear first. Mail them nowhere. Yet."),
  (D, "dry", "Rule nine: a picture you've never shown is worth more than one you have."))
# ---------------- M14 Cold Room
S("dlg.m14_kallis", "M14 o2. Kallis Fur Salon. White suit, panama hat on the desk. He pays in an envelope already sealed.",
  (KAL, "courtly", "Ah, the new collector. In a hot summer every furrier becomes a philosopher."),
  (KAL, "courtly", "Tell your sergeant Kallis pays early. Unlike some on Thirtieth Street."),
  (T, "flat", "Who's on Thirtieth?"),
  (KAL, "cutting", "Varelas. A great man. Ask his bank how great. Good afternoon."))
S("dlg.m14_yiannis", "M14 o4. Varelas & Co. vaults, the cold room. Breath shows. Racks of stored coats in garment bags.",
  (YIA, "blunt", "Mr. Varelas is at the bank. Again. I pay you. Like every month."),
  (YIA, "blunt", "Four hundred coats from uptown sleep here till October. Mink, fox, persian."),
  (T, "curious", "Lot of money behind one door."),
  (YIA, "blunt", "And one compressor. When the power goes, the coats go. Nobody thinks of that."),
  (YIA, "low", "A skin tells you where it was cut. So does a man. You were police, yes?"))
S("dlg.m14_mayhew", "M14 o6. Kafeneio Kastoria, W 29th & 8th. Backgammon clacks. Mayhew sweats over Greek coffee.",
  (MAY, "warm", "Furs paid? Good. Kallis is a gentleman. Varelas is a gentleman with a bank problem."),
  (T, "flat", "Carl. Who's H. Lisle?"),
  (MAY, "shaken", "Where'd you— He's a lawyer. Everybody's got a lawyer.", {"setRelationships": r((T, MAY, -1))}),
  L("l3b", MAY, "cold", "You showed me his picture once already, kid. Don't make it a habit.", **{"if": "flag.mayhew_saw_photo"}),
  (T, "inner", "He dropped his toothpick. Carl hasn't dropped a toothpick since nineteen sixty-four."),
  (MAY, "forced", "Drink your coffee. Greeks make it like mud. Good mud."))
# ---------------- M15 Brownout (Nick's introduction)
S("dlg.m15_ballroom", "M15 o1. Hotel Pennsylvania ballroom, a furriers' trade dinner. Chandeliers flicker. Nick at the head table.",
  (N, "expansive", "Gentlemen. In Kastoria we say the beaver doesn't ask who wears the coat."),
  (N, "expansive", "I am a beaver. You are all beavers. We work. Somebody else gets warm."),
  (KAL, "cutting", "Niko, the lights. Even the hotel is losing faith in you."),
  (N, "joking", "The lights are applauding, Stavros. In Morse code."),
  (N, "alarmed", "…The lights are applauding all over Thirtieth Street. Excuse me."))
S("dlg.m15_compressors", "M15 o4. Varelas vaults, emergency lantern. Yiannis with a thermometer. Silence where the hum should be.",
  (YIA, "urgent", "Compressors stopped twenty minutes ago. Forty-one degrees. Climbing."),
  (N, "urgent", "How long before damage?"),
  (YIA, "blunt", "Mink, six hours. Fox, less. Customers' coats, Niko. Not ours."),
  (N, "deciding", "Ice. Every block in the city. The ice house on Tenth."),
  (YIA, "blunt", "Ice house wants cash. In a brownout everybody wants cash."),
  (N, "grim", "Everybody gets paid. That's not corruption. That's payroll. Come on."))
S("dlg.m15_ice_house", "M15 o6. The ice house, W 37th St & Tenth. Steam off the blocks. A foreman with a ledger and a smile.",
  (N, "charming", "My friend. I need all the ice you have. All of it."),
  (N, "charming", "Three hundred, cash, and your wife gets a fox stole in October. Wholesale."),
  (N, "low", "Five minutes ago I was at a banquet. Now I'm buying ice. America."))
S("dlg.m15_teddy_at_door", "M15 o8. Vault loading dock, W 30th St, after midnight. Ice steaming. A man in a tan sport coat at the door.",
  (T, "flat", "Mr. Varelas? I'm here for the monthly. Mayhew sent me."),
  (N, "incredulous", "Tonight? Look around you. I'm wet to the elbow, I'm buying ice by the ton."),
  (T, "tired", "Everybody's got a bad night, sir. The envelope doesn't."),
  (N, "weary", "…Yiannis, pay the man. What's your name, collector?"),
  (T, "flat", "Arce. I work nights at the Corwin. On Thirty-First."),
  (N, "startled", "The Corwin. I… I own the Corwin. On paper."),
  (T, "cold", "Then you own two hundred people in a hot building. Good night, Mr. Varelas."),
  (N, "inner", "I bought a building. Nobody told me there were people in it."))
# ---------------- M16 Margin Call
S("dlg.m16_whitlock", "M16 o2. Fifth Avenue Trust, corner office. Whitlock taps a pen on a file.",
  (WHI, "smooth", "Nick, the bank loves you. The bank simply loves you less in July."),
  (N, "charming", "Gordon. Love is seasonal. Fur is seasonal. October, you'll love me again."),
  (WHI, "smooth", "We're not calling the loan. We're inviting it home. By September."),
  (WHI, "cool", "And Nick? Someone suggested your vault is… popular collateral. Rumours."),
  (N, "cold", "Rumours from a man in a white suit, I'd guess."))
S("dlg.m16_kallis", "M16 o4. Kallis Fur Salon. Kallis pours two coffees. Neither drinks.",
  (KAL, "courtly", "Niko. I offer you a fair price. Fair for July."),
  (N, "proud", "You want my firm for the price of a winter coat."),
  (KAL, "cutting", "I want your crew. Yiannis especially. The firm comes with them, sadly."),
  (N, "cold", "I nailed skins for your uncle in forty-eight. I remember your prices."))
S("dlg.m16_baeks", "M16 o6. Seoul Star Imports. The Baeks behind the counter. Mrs. Baek holds an envelope.",
  (BAE, "formal", "Mr. Varelas. You own our building. We would like to own it instead."),
  (MIS, "sharp", "Kye is twelve families, one pot. The pot is here. Cash, today."),
  (N, "surprised", "You'd buy a building in this city, now? Everyone else is leaving."),
  (BAE, "dry", "Everyone else is leaving. Prices are good."),
  C(ch("Sell them the building.", "l_sell", setFlags=["flag.baek_bought_building"], setRelationships=r((N, BAE, 2), (N, MIS, 2))),
    ch("Not yet. Ask me in August.", "l_wait")),
  L("l_sell", N, "warm", "Sold. To the only optimists in Manhattan. Eleni will draw the papers."),
  L("l_sell2", MIS, "satisfied", "Good. Now the only landlord we fear is us.", goto="l_end"),
  L("l_wait", N, "evasive", "Ask me in August. I have… other paper first."),
  L("l_wait2", BAE, "dry", "August. Fine. We will still be optimists in August. Probably.", goto="l_end"),
  L("l_end", N, "inner", "Twelve families and a cigar box. More honest than my bank."))
S("dlg.m16_lisle", "M16 o8. Lisle's office, 11th floor. Marjorie brings papers. Lisle never touches them.",
  (LIS, "soft", "Nicholas. A bridge loan. From investors who admire you. Ninety days."),
  (LIS, "soft", "In exchange, a few more signatures. The hotels on Broadway. Routine."),
  (N, "tired", "What am I signing, Howard?"),
  (LIS, "soft", "Notwithstanding the foregoing, your future. Sign where Marjorie marks."),
  (MAR, "flat", "Here. And here. And here."),
  (N, "inner", "I signed without reading. Like always. The secretary watched me do it."))
# ---------------- M17 The Lease (midpoint)
S("dlg.m17_agent", "M17 o2. The papered window on W 37th. A rental agent with a key ring, smiling too much.",
  (D, "brisk", "Two chairs, a sink, a window. I can pay six months in advance. Cash."),
  ("npc.rental_agent", "smooth", "The owner prefers… established tenants. Bank references."),
  (D, "cool", "I have twenty references. They're women. None of them have banks."),
  ("npc.rental_agent", "smooth", "Then I'm afraid it's no. Have a nice day, miss."),
  (D, "inner", "Rule ten: when the clerk says no, find the man who owns the clerk."))
S("dlg.m17_two_bankers", "M17 o4. Nick's penthouse office. Delphine across the desk. Two bankers, one table.",
  (N, "charming", "Miss Moore. My agent says you're persistent. My agent is right."),
  (D, "brisk", "Twenty women. Five dollars a week. Seven years. Not one default."),
  (N, "impressed", "Seven years without a default. My bank should hire you."),
  (D, "cool", "Your bank wouldn't let me in the door, Mr. Varelas. Neither would your agent."),
  (N, "honest", "Then we have something in common. My bank won't let me in the door either."))
S("dlg.m17_eleni", "M17 o6. (Nick.) Eleni steps out of her glass office with the club's figures, written on a napkin.",
  (ELE, "dry", "Nikos, I read her numbers. They balance. Ours don't."),
  (N, "low", "Eleni, she's a… she works on Eighth Avenue."),
  (ELE, "cold", "And you work on Thirtieth Street and owe the bank nine hundred coats."),
  (ELE, "dry", "In this family I'm the one who reads. Give her the lease after the season."),
  (N, "warm", "After the season. If there's a season."))
S("dlg.m17_shop", "M17 o8. The empty shop, W 37th. Dust, two old chairs, light through the paper.",
  (D, "quiet", "Two chairs. Tina on one. Me on the other. Women on Eighth getting their hair done."),
  (N, "warm", "My first shop on Twenty-Ninth was smaller. I slept under the table."),
  (D, "dry", "You slept under a table and now you own the street."),
  (N, "honest", "I own paper. Paper owns me. Get your shop, Miss Moore. Own something real."),
  (D, "inner", "Rule eleven: don't like the landlord. Too late."))
# ---------------- M18 Cold Storage
S("dlg.m18_plan", "M18 o1. Nick's dark office, second brownout. Eleni, Yiannis and a lantern. Nick explains.",
  (N, "low", "Power's out until three. The compressors stop. We had a failure. Terrible failure."),
  (ELE, "cold", "Half the pledged coats go out the dock. The claim says they spoiled."),
  (YIA, "blunt", "And the lieutenant's men watch the street. For a cut."),
  (N, "low", "Everybody gets paid, Yiannis. That's payroll."),
  (YIA, "blunt", "No. That's theft with a payroll. I'll load the truck. Don't ask me to count."))
S("dlg.m18_teddy", "M18 o5. (Teddy.) W 30th St in the dark. A box truck at the Varelas dock. Plainclothes on the corner.",
  (T, "inner", "Collection night, and the furrier's loading coats at midnight in a blackout."),
  (T, "inner", "Wurtz's green sedan on the corner. Brannock smoking. Watching the dock, not the street."),
  (BRA, "flat", "Collector. Envelope's at the car tonight. Lieutenant's collecting personal."),
  (T, "inner", "Wurtz never collects personal. Unless it's big."))
S("dlg.m18_count", "M18 o10. (Nick.) Back in the vault, 3 a.m. Yiannis holds a clipboard. The ice is melting.",
  L("l1t", YIA, "honest", "You want the true count, Niko? Four hundred and twelve. Not nine hundred. Never nine.",
    ifRelationship={f"{N}/{YIA}": ">=3"}),
  L("l2t", YIA, "honest", "Pledged twice. Bank and lawyer. Now half are 'spoiled.' You're finished either way.",
    ifRelationship={f"{N}/{YIA}": ">=3"}),
  L("l1f", YIA, "flat", "Count is what you want it to be, boss. I didn't see anything.",
    ifRelationship={f"{N}/{YIA}": "<3"}),
  (N, "shaken", "A skin tells you where it was cut. So does a man. I know, Yiannis."),
  (ELE, "quiet", "Summer is when furriers go broke politely. We're not being polite anymore."))
# ---------------- M19 Rewiring
S("dlg.m19_heat", "M19 o1. Corwin lobby, 98 degrees. Residents in chairs with wet towels. The elevator is dead.",
  (ODE, "urgent", "Mr. Arce. The power's off from six to fourteen. Since this morning. Rewiring, they say."),
  (MAN, "ashamed", "Prentiss's order, Teddy. Gus threw the switch. I just hand out the notices."),
  (INE, "angry", "My kids are at camp, thank God. The old men upstairs aren't at camp."),
  (ODE, "worried", "Mr. Hollis hasn't come down. He always comes down for the shipping news."))
S("dlg.m19_gus", "M19 o3. Corwin basement, boiler room. Gus beside the main panel. A letterhead order taped to it.",
  (GUS, "defensive", "Orders come on letterhead. I don't argue with letterhead."),
  (T, "cold", "Turn it back on, Gus."),
  (GUS, "defensive", "Boiler's from 1911. I'm not a super, I'm a priest. I do last rites."),
  (GUS, "breaking", "Prentiss said two days. Upgrade. I turned the switch. That's all."),
  (T, "cold", "Then turn it the other way. Now."))
S("dlg.m19_hollis", "M19 o5. 11th floor, Room 1112. Camera holds on Teddy's face and Odessa behind him. Nothing else is shown.",
  (T, "quiet", "Mr. Hollis? It's Teddy. I'm coming in."),
  (ODE, "quiet", "…Oh. Oh, Walter."),
  (T, "inner", "His radio's still on. Shipping news. Ships leaving for everywhere."),
  (ODE, "steady", "Close his eyes, Mr. Arce. Then call somebody. Then come back and sit with me."))
S("dlg.m19_wake", "M19 o7. Lobby, evening. Folding chairs. Hollis's radio on the desk. Carmen arrives with food. Prentiss arrives with flowers.",
  (ODE, "grieving", "Forty years at sea, and he died in a hotel. He said he wouldn't. He was a liar."),
  (CAR, "gentle", "Mijo. I brought rice. And… Feld left. Last night. The machines are gone."),
  (MCH, "flat", "Cutting table sold. He owes us severance. He sends a postcard. From Ponce."),
  (PRE, "friendly", "Folks. Terrible thing. Terrible. The owners send their condolences. And flowers."),
  (ODE, "cold", "Take your flowers outside, Mr. Prentiss. This room is full."),
  (T, "quiet", "Hollis's radio stays on the desk. Nobody turns it off."))
# ---------------- M20 Partners' Meeting
S("dlg.m20_meeting", "M20 o3. Lisle's conference room. Augie, Villalba, Wurtz in a borrowed suit, Nick. Lisle at the head.",
  (LIS, "soft", "Gentlemen. Our arrangement is simple. Nobody touches cash. Everything is a fee."),
  (AUG, "gruff", "Surcharge comes in, your cut goes out. Same as always. What's new?"),
  (LIS, "soft", "What's new is that it's legal. Nicholas's name is on every hotel. Very clean."),
  (N, "startled", "Every hotel?"),
  (WUR, "amused", "Knapp was weather. Weather passes. Paperwork's climate. Right, counselor?"),
  (LIS, "soft", "Notwithstanding the lieutenant's metaphors. Yes. Every hotel."))
S("dlg.m20_marjorie", "M20 o4. After the meeting. Marjorie leaves the ledger open on her desk and goes to get coffee. She looks back once.",
  (N, "inner", "My name. Corwin. The Broadway hotels. The surcharge 'consultancy'. All me."),
  (N, "inner", "And the first page. October 1971. 'Consideration, case 71-4402. C.M.'"),
  (MAR, "flat", "Mr. Lisle is in conference. Mr. Lisle is always in conference."),
  (MAR, "low", "I typed every word of it, Mr. Varelas. Nobody ever asks the typist."),
  (N, "quiet", "Miss Kell. I'm asking."),
  (MAR, "low", "Carbons. Nothing in this office happens only once. Good afternoon."))
S("dlg.m20_eleni_call", "M20 o6. A booth at the Iron Gate. Nick on the house phone.",
  (N, "low", "Eleni. My name is on everything. The hotels. The trucks. A lieutenant's boat."),
  (ELE, "dry", "Of course it is, Nikos. You sign. That's what you're for."),
  (N, "low", "What do I do?"),
  (ELE, "cold", "Read, for once. Then decide what kind of man owns a building with people in it."))
# ---------------- M21 Carbon Copy
S("dlg.m21_plan", "M21 o1. Corwin lobby table. Bernard with a stopwatch and a floor plan he drew from memory.",
  (BER, "precise", "Mr. Lisle dines at seven-fifteen. He returns for his briefcase at nine-forty. Always."),
  (BER, "dry", "That gives us two hours and twenty-five minutes. Comma. Then disaster. Period."),
  (T, "flat", "And if he doesn't go to dinner?"),
  (BER, "dry", "Then someone must take him to dinner. Someone he can't refuse."),
  (T, "quiet", "Varelas."))
S("dlg.m21_marjorie", "M21 o3 (wire branch). Lisle's building lobby. Marjorie Kell, coat on, keys in hand.",
  (MAR, "low", "Mr. Arce. Miss Calloway said you'd come. Nobody asks the typist. She asked."),
  (MAR, "low", "Office key. Cabinet key. Put everything back exactly. He measures the gaps."),
  (MAR, "low", "And take these. My carbons. Fifteen years. In a laundry bag. Don't ask why laundry.",
   {"setFlags": ["flag.have_marjorie_carbons"]}),
  (T, "grateful", "Why help, Miss Kell?"),
  (MAR, "flat", "He never set up my pension. People forget the people who type."))
S("dlg.m21_delroy", "M21 o3b (burned branch). Delroy's cab idling on W 37th.",
  (DEL, "easy", "Night man's a drinker. Nine-oh-five he goes to the deli for 'coffee.' Twenty minutes."),
  (DEL, "easy", "Freight stairs come out on Thirty-Seventh. I'll be here. Meter off."),
  (T, "warm", "How do you know his habits?"),
  (DEL, "wry", "I drive Lisle on weekends. Car service. Man tips like a tax collector."))
S("dlg.m21_dinner", "M21 o5. (Nick.) The Iron Gate. Lisle checks his watch. Nick orders another course.",
  (N, "charming", "Howard, sit. The cheesecake here is a legal document. Binding."),
  (LIS, "soft", "Nicholas, I have a briefcase waiting. And principles about dessert."),
  (N, "charming", "Principles. Let me tell you about my first shop. Under a table. Nineteen forty-nine…"),
  (LIS, "patient", "You've told me. Twice."),
  (N, "charming", "Then I'll tell it better. Waiter! Two coffees. Greek. It takes a long time."))
S("dlg.m21_copy", "M21 o8 (wire branch). Lisle's office in lamplight. The ledger on a photocopier in the hall.",
  (T, "inner", "Forty pages. The machine is slow. Every page sounds like a gunshot."),
  (T, "inner", "First page: October seventy-one. C.M. Carl. The night I waited in the car."),
  (T, "inner", "Back in the cabinet, exactly. He measures the gaps. Marjorie said so."),
  (T, "inner", "Calloway's wire is hot under my shirt. Everybody sweats."))
S("dlg.m21_steal", "M21 o8b (burned branch). Lisle's office, lamplight. Teddy lifts the whole ledger.",
  (T, "inner", "No copies. No wire. Just the book. He'll know by morning."),
  (T, "inner", "First page: October seventy-one. C.M. Carl. The night I waited in the car."),
  (T, "inner", "Whoever holds this owns the Tenderloin. Tonight that's me."))
S("dlg.m21_bernard", "M21 o10. Corwin lobby, midnight. Bernard reads with a magnifying glass. Hollis's radio plays softly.",
  (BER, "precise", "Notwithstanding. Heretofore. Consideration. It's him. Every page is his voice."),
  (BER, "grave", "Twenty hotels, Mr. Arce. Ours is page nine. Mrs. Pruitt is a 'unit'."),
  (ODE, "steady", "Then we're not a unit. We're a page. Pages can be read in court."),
  (T, "quiet", "And the first page is Carl's. And mine. I was in the car."))

for s in SCRIPTS:
    (OUT / f"{s['id'].split('.', 1)[1]}.json").write_text(json.dumps(s, ensure_ascii=False, indent=2) + "\n")
print(len(SCRIPTS), "scripts,", sum(len([l for l in s['lines'] if 'text' in l]) for s in SCRIPTS), "lines")
