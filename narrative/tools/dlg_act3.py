#!/usr/bin/env python3
"""Authoring source for Act 3 mission dialogue (N5): missions 22-32, including Branch B and the endings.
Lines are 90 characters or fewer; choices are 4 or fewer and 40 characters or fewer; untimed; gated choices are greyed with a reason."""
import json
from pathlib import Path
OUT = Path(__file__).resolve().parents[2] / "content" / "dialogue"
T, D, N = "char.teddy_arce", "char.delphine_moore", "char.nick_varelas"
c = lambda n: f"char.{n}"
(MAY, ODE, MAN, RIT, TIN, LIS, AUG, BAU, NOR, MAR, BRA, MIS, CLA, CAL, VIL, KEA, NAV, GUS, INE, PRE, WUR, LON, EAR, BER, ELE, BAE,
 YIA, CAR, MCH, MOR, DWA, DEL, MCK) = map(c, [
 "carl_mayhew", "odessa_pruitt", "manny_soto", "rita_haines", "tina_mercado", "howard_lisle", "augie_lomax", "ray_bauer", "nora_finch",
 "marcus_teague", "jimmy_brannock", "mi_sook_baek", "claudette_bijou", "ruth_calloway", "hector_villalba", "pat_kearney", "luis_navarro",
 "gus_wilkie", "inez_rivera", "vic_prentiss", "dennis_wurtz", "lonnie_gage", "earl_poole", "bernard_ostrow", "eleni_varelas",
 "jung_ho_baek", "yiannis_doukas", "carmen_arce", "mei_lin_chow", "anna_moretti", "dwayne_little", "delroy_tate", "marjorie_kell"])
SCRIPTS = []
CORROB = ["flag.have_marjorie_carbons", "flag.have_kearney_list", "flag.have_wurtz_locker", "flag.photo_file_3"]


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


def C(*choices, cid="c1"):
    return {"id": cid, "choices": list(choices)}


def ch(text, goto, **k):
    d = {"text": text, "goto": goto}
    d.update(k)
    return d


def r(*t):
    return {f"{a}/{b}": n for a, b, n in t}

# ---------------- M22 The Address (8 Aug 1974; the President is never named)
S("dlg.m22_lobby_radio", "M22 o1. Corwin lobby, 21:00. Every resident around Hollis's radio on the desk. Invented narration; no real voice or name.",
  ("npc.radio_crowd", "radio", "(Radio) …the President, speaking tonight from the White House, has announced…"),
  ("npc.radio_crowd", "radio", "(Radio) …that he will resign the office, effective at noon tomorrow…"),
  (ODE, "quiet", "Well. I lived to see that. Walter would've had a speech about it."),
  (BER, "dry", "If a President can be read out of office, Mr. Arce, so can a lawyer."),
  (MAN, "nervous", "Teddy. Phone. It's Mayhew. He sounds like he's underwater."))
S("dlg.m22_mayhew", "M22 o3. The Shamrock Rail. Every cop at the bar staring at the TV. Mayhew grabs Teddy's sleeve.",
  L("l1w", MAY, "panicked", "You wore a wire. Wurtz's man at the DA's office saw your name. A wire, kid!",
    **{"if": "flag.branch_a_wire"}),
  L("l2w", T, "flat", "You drove me to a meet in seventy-one, Carl. I'm just returning the favour.",
    **{"if": "flag.branch_a_wire"}),
  L("l1b", MAY, "panicked", "The book's gone from Lisle's office. Everybody knows it's you. Everybody!",
    **{"if": "flag.branch_a_burned"}),
  L("l2b", T, "cold", "Then everybody knows who to be nice to.", **{"if": "flag.branch_a_burned"}),
  (MAY, "frightened", "He's going down tonight, the President. Everybody's going down. Who's next, kid?"),
  (T, "flat", "Go home, Carl. Sleep. Tomorrow you decide who you are."))
S("dlg.m22_crowd", "M22 o6. (Delphine.) W 45th & Seventh. A crowd around a cab with the radio up. Tina at a payphone nearby.",
  (RIT, "quiet", "Never thought I'd see Times Square this quiet. Listen to that."),
  (D, "noticing", "Tina's on the payphone. Whispering. With her back to us."),
  (TIN, "low", "…I told you, Lonnie, Sunday nights. Leave me alone now. Please."),
  (D, "inner", "Sunday nights. The club. Rule twelve, Tina. There is no rule twelve."),
  (RIT, "grave", "If a President can go down, sugar, anybody can. Anybody."))
S("dlg.m22_lisle_call", "M22 o8. (Nick.) Varelas office, lights low. The phone. Lisle's voice, perfectly calm.",
  (LIS, "soft", "Nicholas. Historic night. People will make rash decisions. Don't."),
  (LIS, "soft", "Come to the Pennsylvania. We'll reassure our partners. Together."),
  (N, "cold", "Reassure them of what, Howard?"),
  (LIS, "soft", "That your signature is still worth what they paid for it."))
S("dlg.m22_lobby_deals", "M22 o10. (Nick.) The Pennsylvania lobby at midnight. Men in clusters. Lisle working them like a host.",
  (AUG, "gruff", "Varelas. Your lawyer's selling lifeboats. You got a seat?"),
  (BAU, "nervous", "Mr. Varelas! Ray Bauer. Legit. Very legit. Is the deal still on? Is anything on?"),
  (NOR, "rapid", "Nora Finch, Evening paper. City's broke and somebody's buying hotels. You?"),
  (N, "low", "Not tonight, Miss Finch."),
  (N, "inner", "Everyone's selling everyone. And my name is the merchandise."))
# ---------------- M23 Shoebox
S("dlg.m23_marcus", "M23 o2. The Arden's boiler room, rain drumming on the street grate above.",
  (MAR, "formal", "Miss Moore. Ricky talked. Brannock knows the box isn't in your room."),
  (MAR, "formal", "He doesn't know it's here. Yet. Ricky's still thinking."),
  (D, "decisive", "Then we move it tonight. To the only other bank on the West Side that's ours."),
  (MAR, "formal", "Back stairs are open, Miss Moore. They're always open for you."))
S("dlg.m23_mi_sook", "M23 o5. Hanyang House, the back room. Mi-sook unlocks a steel cabinet behind the kimchi crocks.",
  (MIS, "sharp", "Kye is twelve families, one pot. Same as your friend's club, Miss Moore."),
  (MIS, "sharp", "Your money sleeps next to ours. Nobody robs twelve Korean grandmothers."),
  (D, "warm", "Rule thirteen: trust a woman who counts faster than you."),
  (MIS, "dry", "There's no thirteen. You made it up just now. I like it."))
S("dlg.m23_tina", "M23 o7. Rita's bar after close. Tina at the end of the bar, makeup off.",
  (TIN, "breaking", "Del. Lonnie's my cousin. My mother's sister's kid. I been telling him things."),
  (TIN, "breaking", "Sunday nights. Where the box was. The eleven hundred went to his lawyer."),
  (D, "quiet", "I covered for that eleven hundred, Tina. Out of my own pocket. Nobody knows."),
  (TIN, "breaking", "I know. That's why I'm telling you. I'm tired of rules. I'm tired of him."),
  C(ch("Forgive her.", "l_forgive", setFlags=["flag.delphine_forgave_tina"], setRelationships=r((D, TIN, 2))),
    ch("Make her tell the club.", "l_confront", setRelationships=r((D, TIN, -1))),
    ch("Pay the club back myself.", "l_pay", setFlags=["flag.club_count_settled"], setRelationships=r((D, CLA, 1)))),
  L("l_forgive", D, "quiet", "Come here. Rule one still stands. Count everything. Including friends.", goto="l_end"),
  L("l_confront", D, "cold", "Sunday you tell the table. All of it. Then they decide. Not me.", goto="l_end"),
  L("l_pay", D, "tired", "I'll put the eleven hundred back. My shop money. The count will be clean.", goto="l_end"),
  L("l_end", TIN, "quiet", "I'm gonna do hair, Del. Hair don't hit you. Hair don't ask for a cut."))
S("dlg.m23_token_booth", "M23 o4. Herald Square station mezzanine. Delphine at the token booth with the shoebox in a shopping bag.",
  (D, "brisk", "One token. And a minute of your time, if anyone asks."),
  ("npc.token_clerk", "flat", "Thirty-five cents, lady. My time's not for sale. Neither's the minute."),
  (D, "inner", "Brannock at the top of the stairs. White sneakers. Rule three."),
  (BRA, "shouting", "Delphine! Hold it right there!"),
  (D, "inner", "The old passage to Penn Station. Half the lights dead. Marcus says the rats own it."))

# ---------------- M24 Flip
S("dlg.m24_calloway", "M24 o2. (Nick.) Herald Square lunch counter. Calloway slides a single typed page across.",
  (CAL, "crisp", "Mr. Varelas. Insurance fraud in a brownout. Lieutenant's men on the corner. Photographs."),
  (CAL, "crisp", "Testify against Lisle, and the insurance matter becomes a misunderstanding."),
  (N, "proud", "You're asking me to sell my lawyer."),
  (CAL, "dry", "I'm asking you to stop being his merchandise. The offer expires in September. So do I."),
  C(ch("Take the deal.", "l_take", confirm="This decides who can testify.", setFlags=["flag.nick_flipped"], setRelationships=r((N, CAL, 2), (N, LIS, -3))),
    ch("Refuse. I'll handle Lisle.", "l_refuse", setRelationships=r((N, CAL, -2)))),
  L("l_take", N, "tired", "Where do I sign? No. Where do I read? This time I read first."),
  L("l_take2", CAL, "crisp", "Every page. I'll wait. I have a budget for coffee.", goto="l_end"),
  L("l_refuse", N, "proud", "I came here with nothing. I'll leave my own way. Good afternoon."),
  L("l_refuse2", CAL, "cold", "Then I'll see you in a courtroom, Mr. Varelas. On the wrong side.", goto="l_end"),
  L("l_end", N, "inner", "Everybody gets paid. Today I found out what I cost."))
S("dlg.m24_augie", "M24 o4. Carriers' garage, dispatch booth. Augie grey in the face, coughing, cigar unlit.",
  (AUG, "gruff", "Varelas. You come to my garage? You never come to my garage."),
  (N, "direct", "Lisle says you're selling the Association. To him."),
  (AUG, "tired", "I'm sick, Varelas. Doctor gives me a year. Who gets my drivers? A lawyer."),
  (AUG, "bitter", "Forty years I fought the old rackets off these streets. Look what I built instead."),
  (N, "honest", "Same as me, Augie. Same as all of us."))
S("dlg.m24_villalba", "M24 o5. Villalba on the dispatch radio, too calm. Augie listening.",
  (VIL, "radio", "Unit one, unit one. Mr. Lisle's office calling for Mr. Varelas. Urgent."),
  (AUG, "stunned", "How does Lisle know you're here? Hector. Hector, how does he know?"),
  (VIL, "radio", "Augie thinks it's his. Lisle thinks it's his. The trucks know whose it is."),
  (N, "low", "Your man sold you before you could sell yourself, Augie. Go home. See a doctor."))
# ---------------- M25 The Car
S("dlg.m25_kearney", "M25 o2. Midtown Central, front desk, near midnight. Kearney opens his bottom drawer.",
  (KEA, "gruff", "Arce. Sit. Not there, that's evidence. There."),
  (KEA, "quiet", "Christmas list. Sixty-nine, seventy, seventy-one. Who paid. Who collected."),
  (KEA, "quiet", "Took a turkey every year. Never a dollar. Kept the list. Never knew why."),
  (KEA, "gruff", "Now I know. Take it before I retire and somebody cleans this desk."),
  (T, "moved", "Thank you, Sarge."),
  (KEA, "gruff", "Don't thank me. Mayhew's car is on Thirty-Fifth. Go finish it."))
S("dlg.m25_the_car", "M25 o4. W 35th St off Eighth, rain on the windshield. Mayhew in the driver's seat. Teddy in the passenger seat. Same as 1971.",
  (MAY, "hollow", "Same spot. Same rain, almost. You remember?"),
  (T, "flat", "I remember a man in a good suit in the back seat. With a briefcase."),
  (MAY, "hollow", "Lisle. A.D.A. then. Case seventy-one forty-four-oh-two. A trucker's assault charge."),
  (MAY, "hollow", "Lisle made it go away. For money. I carried. You drove. You were my alibi, kid."),
  (MAY, "breaking", "Then the Commission came. I gave them six guys so I'd never have to give them you. Or him."),
  (T, "quiet", "You gave them six so they'd never ask about one."),
  C(ch("Get out of the city, Carl.", "l_go", setFlags=["flag.teddy_spared_mayhew"], setRelationships=r((T, MAY, 2))),
    ch("We're driving to Calloway.", "l_cal", setRelationships=r((T, MAY, -2), (T, CAL, 1)))),
  L("l_go", T, "tired", "Take your pension and go to Florida. Fish. Never come back to Thirty-Fifth Street."),
  L("l_go2", MAY, "weeping", "Kid. Teddy. I… Yeah. Florida.", goto="l_end"),
  L("l_cal", T, "cold", "Start the car, Carl. Fifth and Thirty-Sixth. She's always parked there."),
  L("l_cal2", MAY, "hollow", "…Yeah. Okay. I always liked driving you.", goto="l_end"),
  L("l_end", T, "inner", "I waited in this car once and said nothing. Not twice."))
# ---------------- M26 Fire Watch
S("dlg.m26_rumour", "M26 o1. Night desk. Manny stayed late. Inez in the lobby with her laundry.",
  (MAN, "ashamed", "Teddy. Prentiss asked me which rooms are empty on four. Tonight. Why tonight?"),
  (INE, "urgent", "I took his five hundred. He told me 'Leave by Tuesday. For your own good.'"),
  (INE, "firm", "My kids are at my sister's. I'm staying. I want to see his face."),
  (T, "flat", "Buildings burn, old wiring, nobody's fault. I've heard that speech."),
  (T, "decisive", "Nobody sleeps on four tonight. Manny, keep the service door. Inez, wake the floors at two."))
S("dlg.m26_false_alarm", "M26 o7. (Teddy.) 02:40. Fire bells. Engines on W 31st. Tenants on the sidewalk in robes. No smoke.",
  ("npc.firefighter", "annoyed", "Who pulled the box? Somebody pulled the box. Building's fine."),
  (ODE, "steady", "Everybody out. Slowly. Mr. Ostrow, your teeth are in your pocket."),
  (GUS, "panicked", "It wasn't me! I left the door locked! I locked it, Teddy!", {"ifRelationship": {f"{T}/{GUS}": ">-3"}}),
  L("l3b", GUS, "ashamed", "I left the service door open. Prentiss paid me. I'm sorry. I'm sorry.", ifRelationship={f"{T}/{GUS}": "<=-3"}),
  (D, "radio", "(Payphone) Teddy. Your firebug's walking east on Thirty-First. Two cans. Tan jacket."),
  (T, "decisive", "Got him. Delphine, stay with the tenants. I'll find who's paying."))
S("dlg.m26_prentiss", "M26 o9. A parked car on W 31st & Fifth. Prentiss counting cash for the firebug. Teddy opens the passenger door.",
  (PRE, "startled", "Teddy! Ha! What a night! False alarms. Terrible thing. Nobody's fault."),
  (T, "cold", "Your man's two cans are in my lobby. My friend's photograph is in her camera."),
  (PRE, "sweating", "Teddy, Teddy. I'm in the moving business. Moving's healthy. You can't prove—"),
  (T, "cold", "I don't need to prove it, Vic. I need you to never come back to Thirty-First."),
  (PRE, "broken", "…Can I call you Teddy? No. Okay. Okay."))
# ---------------- M27 Exposure
S("dlg.m27_wurtz_club", "M27 o1. (Delphine.) Rita's bar. Wurtz on a stool, mints, smiling. Brannock at the door.",
  (WUR, "smug", "Delphine. Lovely evening. I hear the club moved its money. To Koreans. Clever."),
  (WUR, "smug", "Fifty a week is a tax. All of it is a tax with a smile. Smile."),
  (D, "cold", "Rule fourteen, Lieutenant: never smile at a man who counts your teeth."),
  (WUR, "cold", "Or give me a name. Somebody on this avenue talks downtown. Name, and I go away."),
  C(ch("Give him Bauer's name.", "l_bauer", setFlags=["flag.bauer_burned"], setRelationships=r((D, BAU, -3), (D, RIT, -1))),
    ch("Give him nothing.", "l_nothing", setRelationships=r((D, WUR, -1)))),
  L("l_bauer", D, "low", "Ray Bauer. Since seventy-three. Now get out of Rita's bar."),
  L("l_bauer2", RIT, "cold", "Sugar… that man has three kids. You just sold him for a quiet month.", goto="l_end"),
  L("l_nothing", D, "cold", "I don't know any names, Lieutenant. I don't even own a radio."),
  L("l_nothing2", WUR, "cold", "Then the club pays double till you remember. Good night.", goto="l_end"),
  L("l_end", D, "inner", "His photographs keep him safe. Then I need his photographs."))
S("dlg.m27_wurtz_showroom", "M27 o3. (Nick.) Varelas showroom. Wurtz runs a finger down a mink. Brannock behind him.",
  (WUR, "smug", "Mr. Varelas. Insurance man's been asking about July twenty-sixth. Our night."),
  (WUR, "smug", "My memory's for sale. Five thousand. Seasonal price."),
  (N, "calm", "Everybody gets paid, Lieutenant. You'll have it Friday."),
  (N, "inner", "His man by the door has a skim, Delphine says. A man with a skim has a price."))
S("dlg.m27_brannock_key", "M27 o4. (Nick.) The loading dock. Brannock smoking. Nick holds out an envelope.",
  (N, "charming", "Detective. You keep a little something in your spare tyre, I hear."),
  (BRA, "flat", "Who told you that?"),
  (N, "charming", "Nobody. I'm in a generous mood. The lieutenant's locker key. Penn Station. Yes?"),
  (BRA, "flat", "…Four-eighteen. He checks it Fridays. Today's Thursday. Make it fast."),
  (N, "dry", "I don't break laws, detective. I read them carefully. A lawyer taught me."))
S("dlg.m27_locker", "M27 o7. (Delphine.) Penn Station coin lockers, 8th Ave side. Locker 418. A fat manila folder.",
  (D, "inner", "Photographs. Arrest reports. Dates. Every envelope Wurtz ever took, he wrote down."),
  (D, "inner", "Insurance against Lisle. Now it's mine. Rule fifteen: own the other man's insurance."),
  (CLA, "radio", "(Payphone) Delphine. The paper's man drinks at the Pennsylvania bar. With Lisle. Now."),
  (D, "decisive", "Then I need one more picture tonight."))
S("dlg.m27_tina", "M27 o10. Rita's bar, closing. Tina with a suitcase, or without one.",
  L("l1s", TIN, "warm", "I'm staying, Del. I told Lonnie no. He laughed. Then he stopped laughing.",
    requires={"all": ["flag.delphine_forgave_tina"]}, setFlags=["flag.tina_stays"]),
  L("l2s", TIN, "warm", "Save me the second chair. I'll learn hair at night school.", requires={"all": ["flag.delphine_forgave_tina"]}),
  L("l1g", TIN, "sad", "I'm going, Del. My aunt in Philly. Away from Lonnie. Away from me.",
    requires={"none": ["flag.delphine_forgave_tina"]}, setFlags=["flag.tina_gone"]),
  L("l2g", TIN, "sad", "Rule twelve: there is no rule twelve. Send me a postcard of your shop.", requires={"none": ["flag.delphine_forgave_tina"]}),
  (D, "quiet", "Whatever you do, Tina, count it first."))
# ---------------- M28 The March
S("dlg.m28_lobby", "M28 o1. Corwin lobby, 09:55. Odessa in a white church hat and gloves. A bedsheet banner. Carmen arrives with the operators.",
  (ODE, "proud", "Mr. Arce. Hand me my cane. If they want us out, they can watch us walk."),
  (CAR, "proud", "Mijo! The Local came. Feld owes us. Mei-lin brought the whole floor."),
  (BER, "dry", "I've prepared a statement. Short words only. Like 'no.'"),
  (T, "warm", "Broadway's closed till one. Let's use it."))
S("dlg.m28_walk_a", "M28 escort leg 1: Corwin to Broadway & W 32nd. Marchers fall in behind.",
  (ODE, "steady", "I came up from Savannah in twenty-nine. Walked this street looking for work."),
  (ODE, "steady", "Thirty years washing sheets at the Pennsylvania. Never once walked in the front door."),
  (T, "warm", "Today you're walking down the middle of Broadway, Mrs. Pruitt."),
  (ODE, "dry", "Slowly, Mr. Arce. Slowly. Let them see the hat."))
S("dlg.m28_walk_b", "M28 escort leg 2: Broadway & W 32nd to Herald Square. The crowd swells. Moretti hands out flowers.",
  (MOR, "loud", "Flowers for the marchers! Moretti says take one! Mind the fronds!"),
  (DWA, "cocky", "Used-to-be! You're in front! Look at you, used-to-be!"),
  (BAE, "dry", "We closed the shop for this. Mrs. Baek says it's an investment."),
  (ODE, "proud", "Who owns the Tenderloin, Mr. Arce?"),
  (T, "quiet", "Today? You do."))
S("dlg.m28_operators", "M28 o4. (Delphine.) 34th & Seventh. The garment operators turn the corner with a union banner.",
  (MCH, "flat", "Union lady said wait. Machines don't wait. We came."),
  (CAR, "warm", "You're Teddy's friend. The one he gave the fifty back to. Ay, he told me nothing."),
  (D, "warm", "He tells everyone nothing, Mrs. Arce. It's how I knew he was honest."),
  (CAR, "proud", "Walk with us. Women in front. Men carry the banner. Men are good at carrying."))
S("dlg.m28_owner", "M28 o7. (Nick.) Herald Square. Nick walks through the crowd to Odessa. People recognise him. The noise drops.",
  (N, "uncertain", "Mrs. Pruitt. I'm Nikos Varelas. My name is on your building."),
  (ODE, "cold", "So you're the paper. You're shorter than the paper."),
  (N, "honest", "I bought a building. Nobody told me there were people in it."),
  (ODE, "steady", "Somebody's telling you now. Two hundred people. One radio. One dead seaman."),
  C(ch("Walk with them.", "l_walk", setRelationships=r((N, ODE, 2))),
    ch("Leave. Quietly.", "l_leave", setRelationships=r((N, ODE, -1)))),
  L("l_walk", N, "quiet", "May I walk with you, Mrs. Pruitt? I'm not good at it. I'll learn."),
  L("l_walk2", ODE, "dry", "Slowly, Mr. Varelas. Let them see you.", goto="l_end"),
  L("l_leave", N, "ashamed", "…I'm sorry. I'm sorry for your seaman."),
  L("l_leave2", ODE, "cold", "Sorry is a short word, Mr. Varelas. Try a longer one by Friday.", goto="l_end"),
  L("l_end", "npc.marcher", "proud", "Who owns the Tenderloin? We do!"))
# ---------------- M29 The Ledger (Branch B)
S("dlg.m29_inventory", "M29 o1. Corwin lobby table. Bernard lays out what the leads have gathered, item by item.",
  (BER, "precise", "Exhibit one: the ledger, or its copy. Lisle's voice on every page."),
  L("l2a", BER, "precise", "Exhibit: Miss Kell's carbons. Fifteen years, in a laundry bag.", requires={"all": ["flag.have_marjorie_carbons"]}),
  L("l2b", BER, "precise", "Exhibit: Sergeant Kearney's Christmas list. Sixty-nine to seventy-one.", requires={"all": ["flag.have_kearney_list"]}),
  L("l2c", BER, "precise", "Exhibit: the lieutenant's own locker. His insurance, now ours.", requires={"all": ["flag.have_wurtz_locker"]}),
  L("l2d", BER, "precise", "Exhibit: Miss Moore's photographs. Brannock, Wurtz, the park dealer.", requires={"all": ["flag.photo_file_3"]}),
  L("l2e", BER, "precise", "And a picture of a newspaper editor's brother-in-law drinking with Lisle.", requires={"all": ["flag.editor_neutralised"]}),
  (BER, "grave", "Now the question isn't what you have, Mr. Arce. It's who you give it to."))
S("dlg.m29_choice", "M29 o2. **Branch B.** Untimed. Locked options are shown greyed out with their reason.",
  (T, "inner", "Calloway wants a witness. Finch wants two sources. Lisle wants it back. I want…"),
  C(ch("Calloway. Make it a case.", "l_b1", confirm="This decides the ending.", setFlags=["flag.ledger_to_prosecutor"],
       requires={"any": ["flag.branch_a_wire", "flag.nick_flipped"]}, disabledText="Needs a witness who'll testify."),
    ch("The tenants and the paper.", "l_b2", confirm="This decides the ending.", setFlags=["flag.ledger_to_press"],
       requires={"atLeast": {"n": 2, "of": CORROB}, "all": ["flag.editor_neutralised"]},
       disabledText="Needs two sources and a clean editor."),
    ch("Keep it. Run it fairly.", "l_b3", confirm="This decides the ending.", setFlags=["flag.ledger_kept"]),
    ch("Burn it. End it here.", "l_b4", confirm="This decides the ending.", setFlags=["flag.ledger_burned"])),
  L("l_b1", T, "decided", "Calloway. Courtrooms are slow. Slow is better than never.", goto="l_end"),
  L("l_b2", T, "decided", "Mrs. Pruitt and Miss Finch. Let the whole city read page nine.", goto="l_end"),
  L("l_b3", T, "cold", "Somebody's going to run the pad. Better a man who knows the names.", goto="l_end"),
  L("l_b4", T, "tired", "Nobody gets it. Not them, not me. Bernard, open the boiler."),
  L("l_b4b", BER, "grave", "Notwithstanding everything. Very well.", goto="l_end"),
  L("l_end", BER, "quiet", "Then go. Before you're sensible."))
S("dlg.m29_handover", "M29 o4. The hand-over, with lines keyed to the Branch B flag.",
  L("l1a", CAL, "crisp", "Mr. Arce. You came. I can work with this. You'll have to take the stand.",
    requires={"all": ["flag.ledger_to_prosecutor"]}),
  L("l2a", T, "flat", "I've been in a car long enough. I'll take a chair.", requires={"all": ["flag.ledger_to_prosecutor"]}),
  L("l1b", NOR, "rapid", "Two sources, a dead seaman, a lawyer and a lieutenant's boat. That's a Sunday paper.",
    requires={"all": ["flag.ledger_to_press"]}),
  L("l2b", ODE, "steady", "Print page nine first, Miss Finch. That's us.", requires={"all": ["flag.ledger_to_press"]}),
  L("l1c", LIS, "soft", "Mr. Arce. I'd heard you were sensible. Sit. What would you like to be called?",
    requires={"all": ["flag.ledger_kept"]}),
  L("l2c", T, "cold", "Arce. And the Corwin stays open. Forever, counsel. Notwithstanding.", requires={"all": ["flag.ledger_kept"]}),
  L("l1d", T, "inner", "Forty pages in the Corwin's 1911 boiler. Lisle's voice, going up the chimney.",
    requires={"all": ["flag.ledger_burned"]}),
  L("l2d", GUS, "quiet", "Boiler's from 1911. I'm a priest. I do last rites.", requires={"all": ["flag.ledger_burned"]}))
# ---------------- M30 Closing
S("dlg.m30_eleni", "M30 o1. Varelas office. Eleni's grey travelling suit. A suitcase by the door, or not.",
  (ELE, "dry", "Nikos. Kallis wants the firm. The Baeks want the building. Lisle wants your name."),
  (ELE, "cold", "I want to know what you'll do with the hotel with people in it."),
  (N, "quiet", "I'm going to go inside it. For the first time."),
  (ELE, "softening", "…Then I'll unpack after. If you come back the right man."))
S("dlg.m30_baeks", "M30 o3. Seoul Star Imports. The deed on the counter. Mrs. Baek with a fountain pen.",
  L("l1a", BAE, "dry", "Mr. Varelas. You sold us the building in July. Today you visit as a guest.", requires={"all": ["flag.baek_bought_building"]}),
  L("l1b", MIS, "sharp", "August. You said August. It's August. Sign or don't.", requires={"none": ["flag.baek_bought_building"]}),
  C(ch("Sign the deed.", "l_sign", setFlags=["flag.baek_bought_building"], setRelationships=r((N, BAE, 1), (N, MIS, 1)),
       requires={"none": ["flag.baek_bought_building"]}, disabledText="Already sold in July."),
    ch("Not today.", "l_no")),
  L("l_sign", N, "warm", "Sold. To the optimists. Now the only landlord you fear is you.", goto="l_end"),
  L("l_no", BAE, "dry", "Then we stay tenants. Optimistic tenants.", goto="l_end"),
  L("l_end", MIS, "dry", "Go see your hotel, Mr. Varelas. Bring cookies. Old people like cookies."))
S("dlg.m30_odessa", "M30 o6. Corwin lobby. Nick sits in the chair next to Odessa's. The radio plays. Residents watch from the stairs.",
  (N, "humble", "Mrs. Pruitt. I came inside. It's very hot in here."),
  (ODE, "dry", "It's been hot in here since 1956, Mr. Varelas. You're the new thing."),
  (N, "honest", "I can sell it on, keep it, or give it away to people who'll keep it housing."),
  (ODE, "steady", "And which one are you, Mr. Varelas?"),
  C(ch("Sell it on to Lisle's people.", "l_sell", setFlags=["flag.corwin_sold_on"], setRelationships=r((N, ODE, -3))),
    ch("Keep it. Run it right.", "l_keep", setFlags=["flag.corwin_kept"], setRelationships=r((N, ODE, 1)),
       requires={"any": ["flag.baek_bought_building", "flag.vault_claim_paid"]}, disabledText="You can't afford to keep it."),
    ch("Give it to the council. $1.", "l_give", setFlags=["flag.corwin_to_council"], setRelationships=r((N, ODE, 3)),
       requires={"relationship": {f"{N}/{ODE}": ">=2"}}, disabledText="Mrs. Pruitt doesn't trust you yet.")),
  L("l_sell", N, "ashamed", "I have to sell. The bank. My wife. I'm sorry. October first."),
  L("l_sell2", ODE, "cold", "Then I'll be here October first. In this chair. Bring movers. Bring many.", goto="l_end"),
  L("l_keep", N, "firm", "I keep it. New wiring. Real wiring. And a fan for every room on eleven."),
  L("l_keep2", ODE, "dry", "Fans. We'll see. A landlord who comes inside is a start.", goto="l_end"),
  L("l_give", N, "quiet", "One dollar. The West Midtown Housing Council. It stays housing. Forever."),
  L("l_give2", ODE, "moved", "Mr. Varelas. You're shorter than the paper. You're taller than I thought.", goto="l_end"),
  L("l_end", N, "inner", "Nobody told me there were people in it. Now somebody has."))
# ---------------- M31 Lease
S("dlg.m31_count", "M31 o1. Sunday, the Arden's back table. Claudette with her arms folded. Twenty women.",
  (CLA, "formal", "Delphine. I trust your head. Today I want to count the shoebox."),
  L("l2a", D, "steady", "Count it. Every dollar is there. I put back what was missing. My own.", requires={"all": ["flag.club_count_settled"]}),
  L("l2b", D, "honest", "It's eleven hundred short. Tina's cousin. My mistake. I'll make it good.", requires={"none": ["flag.club_count_settled"]}),
  L("l3b", TIN, "brave", "My mistake, not Del's. I'll pay it back. Every week. You can count it.", requires={"all": ["flag.tina_stays"], "none": ["flag.club_count_settled"]}),
  (RIT, "warm", "Sit down, sugar. Nobody makes a good decision standing up. Vote."))
S("dlg.m31_lease", "M31 o3. The shop on W 37th. A key on a string in Delphine's palm, or an empty hand.",
  C(ch("Take the lease.", "l_shop", setFlags=["flag.delphine_shop"],
       requires={"all": ["flag.club_count_settled"], "relationship": {f"{D}/{N}": ">=1"}},
       disabledText="Needs a clean count and Nick's word."),
    ch("Keep the club moving.", "l_club"),
    ch("Merge with the kye.", "l_kye", setFlags=["flag.club_merged_kye"],
       requires={"relationship": {f"{D}/{MIS}": ">=1"}}, disabledText="Mrs. Baek hasn't agreed.")),
  L("l_shop", D, "quiet", "Two chairs. A sink. A window. Rule one: I don't hold money I can't count."),
  L("l_shop2", D, "warm", "Rule sixteen: sometimes you spend it. On something real.", goto="l_end"),
  L("l_club", D, "steady", "No shop. Not yet. The club's the shop. Twenty women, one table.", goto="l_end"),
  L("l_kye", D, "warm", "Twelve families and twenty women. One pot. Mrs. Baek counts. I count. Nobody steals.", goto="l_end"),
  L("l_end", D, "inner", "The women voted. I didn't decide for them. That's the rule that matters."))
S("dlg.m31_kye", "M31 o4. Hanyang House back room (when there's no shop). Mi-sook and Delphine with two ledgers.",
  (MIS, "sharp", "Your women, my families. Same pot, two books. Fine. I count faster."),
  (D, "dry", "You count faster. I remember longer."),
  (MIS, "dry", "Then nobody cheats us twice."))
# ---------------- M32 Labor Day (finale)
S("dlg.m32_prow", "M32 o8. The Flatiron prow, Labor Day night. Lines keyed to the ending (Branch B) and to each lead's resolution.",
  (D, "breathless", "Made it. Rule seventeen: always end up where you started. Count what changed."),
  (N, "tired", "I parked on the sidewalk. Somebody will give me a ticket. Good. I'll pay it."),
  L("l3a", T, "quiet", "Calloway is moving me somewhere safe till the trial. Months. The desk will miss me.", requires={"all": ["flag.ledger_to_prosecutor"]}),
  L("l3b", T, "quiet", "Sunday paper's out. Page nine's on every stoop. Lisle's not answering his phone.", requires={"all": ["flag.ledger_to_press"]}),
  L("l3c", T, "cold", "Lisle's stool is mine from Monday. Twelve-forty. Tuna on rye.", requires={"all": ["flag.ledger_kept"]}),
  L("l3d", T, "tired", "It's ashes. Nobody gets the Tenderloin. Not even me.", requires={"all": ["flag.ledger_burned"]}),
  L("l4a", D, "warm", "Tina's doing hair Monday. My shop. My two chairs.", requires={"all": ["flag.delphine_shop", "flag.tina_stays"]}),
  L("l4b", D, "warm", "My shop opens Monday. One chair empty. Postcard from Philly on the mirror.", requires={"all": ["flag.delphine_shop", "flag.tina_gone"]}),
  L("l4c", D, "steady", "No shop. The club meets Sunday. Same table. Clean count.", requires={"none": ["flag.delphine_shop"]}),
  L("l5a", N, "warm", "The Corwin belongs to the council now. Mrs. Pruitt sent cookies. Stale.", requires={"all": ["flag.corwin_to_council"]}),
  L("l5b", N, "firm", "The Corwin's mine. New wiring Tuesday. A fan on every floor.", requires={"all": ["flag.corwin_kept"]}),
  L("l5c", N, "ashamed", "The Corwin's sold on. October first. I'll be there when they come. I owe her that.", requires={"all": ["flag.corwin_sold_on"]}),
  (T, "quiet", "Dusk on Broadway. Same corner. I used to stand right here like a fire hydrant."),
  L("l7a", T, "decided", "Walk with me. Downtown, this time.", requires={"all": ["flag.ledger_to_prosecutor"]}),
  L("l7b", T, "decided", "Walk with me. Uptown. Like old times. Except it's ours.", requires={"all": ["flag.ledger_to_press"]}),
  L("l7c", T, "cold", "Car's here. Back seat. I'll find you, Delphine. I find everybody now.", requires={"all": ["flag.ledger_kept"]}),
  L("l7d", T, "tired", "Delroy's cab line is forty deep tonight. I'll take a shift. Goodnight.", requires={"all": ["flag.ledger_burned"]}))

for s in SCRIPTS:
    (OUT / f"{s['id'].split('.', 1)[1]}.json").write_text(json.dumps(s, ensure_ascii=False, indent=2) + "\n")
print(len(SCRIPTS), "scripts,", sum(len([l for l in s['lines'] if 'text' in l]) for s in SCRIPTS), "lines")
