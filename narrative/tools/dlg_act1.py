#!/usr/bin/env python3
"""Authoring source for Act 1 mission dialogue (N5): missions 2-9. M1 is in content/dialogue already.
Each line is 90 characters or fewer; choices are 4 or fewer and 40 characters or fewer.
Run, then validate with content.py."""
import json
from pathlib import Path
OUT = Path(__file__).resolve().parents[2] / "content" / "dialogue"

T, D, N = "char.teddy_arce", "char.delphine_moore", "char.nick_varelas"
MAY, ODE, BER, PRE, HOL, INE, GUS, CAR = ("char.carl_mayhew", "char.odessa_pruitt", "char.bernard_ostrow", "char.vic_prentiss",
                                          "char.walter_hollis", "char.inez_rivera", "char.gus_wilkie", "char.carmen_arce")
DEL, NAV, FEL, DWA, BAE, AUG, VIL = ("char.delroy_tate", "char.luis_navarro", "char.sam_feld", "char.dwayne_little",
                                     "char.jung_ho_baek", "char.augie_lomax", "char.hector_villalba")
RIT, TIN, CLA, BRA, LON, MAR, KEA, EAR = ("char.rita_haines", "char.tina_mercado", "char.claudette_bijou", "char.jimmy_brannock",
                                          "char.lonnie_gage", "char.marcus_teague", "char.pat_kearney", "char.earl_poole")
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


def C(*choices):
    return {"id": "c1", "choices": list(choices)}


def ch(text, goto, **k):
    d = {"text": text, "goto": goto}
    d.update(k)
    return d


def rel(lead, who, n):
    return {f"{lead}/{who}": n}

# ------------------------------------------------------------------ M2 Night Desk
S("dlg.m02_notice", "M2 o1. Corwin lobby, Saturday evening. Bernard reads the notice taped over the mailboxes.",
  (BER, "dry", "Mr. Arce. Come, hear literature. 'Notice to all residents of the Corwin Hotel.'"),
  (BER, "dry", "'The premises have been acquired by Corwin Residential Associates.' Capital A."),
  (BER, "wry", "'Inquiries to H. Lisle, counsel.' Counsel. A lawyer who signs with an initial."),
  (ODE, "worried", "What does it mean, Mr. Ostrow? In words a person uses."),
  (BER, "grave", "It means somebody bought us, Mrs. Pruitt. And they haven't said what for."),
  (T, "flat", "Lisle. Who's Lisle?"),
  (BER, "dry", "A man who writes 'notwithstanding.' I'll know more when I've seen him type."))
S("dlg.m02_prentiss", "M2 o2. A man in a plaid sport coat comes through the door with a box of doughnuts.",
  (PRE, "friendly", "Folks! Vic Prentiss. New management. I brought crullers. Who's the desk man?"),
  (T, "flat", "I am. Desk opens at eleven."),
  (PRE, "friendly", "Teddy, right? Can I call you Teddy? Manny told me all about you."),
  (PRE, "friendly", "Big changes coming. Good changes. Anybody wants to move, we help. Cash help."),
  (ODE, "cold", "Nobody here wants to move, Mr. Prentiss."),
  (PRE, "friendly", "Odessa! Can I call you Odessa? Everybody wants something. Here's my card."),
  C(ch("Take his card.", "l_take"),
    ch("Tell him where to put it.", "l_tell", setRelationships=rel(T, PRE, -1))),
  {"id": "l_take", "speaker": T, "emotion": "flat", "text": "I'll keep it by the phone. In case of fire.", "goto": "l_end"},
  {"id": "l_tell", "speaker": T, "emotion": "cold", "text": "Put it with the crullers, Mr. Prentiss. Somewhere you can find it.", "goto": "l_end"},
  {"id": "l_end", "speaker": PRE, "emotion": "friendly", "text": "Ha! I like him. I like you, Teddy. We're gonna be friends."})
S("dlg.m02_hollis", "M2 o4. Room 1112. Hollis in his undershirt, a radio on his knee, the window jammed shut.",
  (HOL, "cheerful", "Shipmate! Close the door, you're letting the heat in. Ha."),
  (T, "warm", "Window still stuck, Mr. Hollis?"),
  (HOL, "cheerful", "Fan's broke. Window's stuck. Otherwise it's a palace."),
  (HOL, "serious", "Odessa says somebody bought the boat. That right?"),
  (T, "honest", "Somebody bought it. I don't know who's steering."),
  (HOL, "cheerful", "Forty years at sea and I die in a hotel? Not this hotel, shipmate."),
  (T, "warm", "I'll bring a fan up from the basement. Gus owes me."))
S("dlg.m02_carmen_phone", "M2 o6. The desk phone rings at 22:50.",
  (CAR, "scolding", "Mijo. It's your mother. You know, the one who fed you for thirty years?"),
  (T, "warm", "Hola, Ma. I'm working."),
  (CAR, "warm", "Tomorrow, Sunday, two o'clock. Arroz con pollo. You come in a clean shirt."),
  (CAR, "probing", "And you tell me why Carl Mayhew was looking for you at the bodega."),
  (T, "evasive", "Old times, Ma. He's lonely."),
  (CAR, "dry", "Lonely men don't buy cigars for the whole counter. Two o'clock."))
# ------------------------------------------------------------------ M3 Hack
S("dlg.m03_delroy", "M3 o1. Penn Station cab line, Seventh Ave side. Delroy leans on his cab.",
  (DEL, "easy", "There he is. The man with no license and all the streets in his head."),
  (T, "dry", "License lapsed, Delroy. The streets didn't."),
  (DEL, "easy", "I got a date with a plate of ribs. Three hours. You drive, you split the meter."),
  (DEL, "teaching", "Rules. Sixth goes up, Seventh comes down, Broadway does what it wants."),
  (DEL, "teaching", "Twenty-Third, Thirty-Fourth, Forty-Second, two-way. Everything else, read the arrows."),
  (DEL, "easy", "Wrong way, the fare yells and the tip dies. Right way, you're a genius."),
  (T, "warm", "Go eat, Delroy. I'll bring her back without a scratch."))
S("dlg.m03_navarro", "M3 o5. Herald Square. Ptl. Navarro steps off the curb and waves the cab down.",
  (NAV, "surprised", "Teddy? In a cab? You can't drive a cab, you don't have a hack license."),
  (T, "dry", "I'm parking it, Luis. Very slowly."),
  (NAV, "earnest", "You taught me never take the coffee, Teddy. I don't even drink coffee now."),
  (NAV, "earnest", "Paperwork is a weapon. Everybody forgets that but me."),
  (T, "warm", "You'll make detective, kid. Wave me through before Sarge sees."),
  (NAV, "earnest", "Go. And get a license. I'm serious. I'll check."))
S("dlg.m03_payout", "M3 o8. Back at the cab line. Delroy counts the meter money on the fender.",
  (DEL, "easy", "Three fares, no dents, and the lady from Chelsea tipped a dollar? You're hired."),
  (DEL, "easy", "Fourteen for you. Come back any night. The cab don't sleep and neither do you."),
  (T, "warm", "Thanks, Delroy."),
  (DEL, "wry", "Hey. Saw Carl Mayhew at the stand Friday. Asking who drives nights. Funny, huh?"))
# ------------------------------------------------------------------ M4 Surcharge
S("dlg.m04_feld", "M4 o1. Feld Frocks, 9th floor, W 37th St. Machines roaring. Carmen waves from row three.",
  (FEL, "weary", "Arce. Your mother says you can carry. My truck didn't come. Can you carry?"),
  (T, "flat", "Why didn't the truck come?"),
  (FEL, "weary", "Surcharge, tax, fee. My grandfather paid the czar less."),
  (FEL, "weary", "Twenty dollars. Two deliveries. Dwayne knows the way. Don't let him show off."),
  (DWA, "cocky", "Mister, I push forty racks a day. You ain't fast, you're in my way."),
  (CAR, "proud", "That's my son! Be nice to him, Dwayne, he used to be police."),
  (DWA, "cocky", "Used to be. Okay. Keep up, used-to-be."))
S("dlg.m04_baek_envelope", "M4 o5. W 29th St. A Carriers' truck idles outside Seoul Star Imports. The driver waits.",
  (VIL, "radio", "Unit four. Collect at twenty-nine and Broadway. Don't take no for an answer."),
  (BAE, "calm", "You want twenty dollars for protection. From what? Please, show me."),
  (BAE, "calm", "I pay for delivery. I pay rent. I pay tax. What is this, the weather?"),
  C(ch("Step in.", "l_in", setFlags=["flag.teddy_stepped_in_baek"], setRelationships={f"{T}/{BAE}": 1, f"{T}/{AUG}": -1}),
    ch("Walk on.", "l_on", setRelationships=rel(T, BAE, -1))),
  {"id": "l_in", "speaker": T, "emotion": "firm", "text": "He's asking a fair question, pal. What's the twenty for?"},
  {"id": "l_in2", "speaker": BAE, "emotion": "dry", "text": "Thank you. Now two of us are confused. Better.", "goto": "l_end"},
  {"id": "l_on", "speaker": BAE, "emotion": "cold", "text": "You see? Nobody sees. Fine. I pay. Give me a receipt."},
  {"id": "l_end", "speaker": DWA, "emotion": "low", "text": "Every truck on Thirty-Seventh got a little envelope on the dash. I see 'em."})
S("dlg.m04_augie", "M4 o7. 37th & Seventh, the morning jam. Augie Lomax steps out of the crowd, cigar in his teeth.",
  (AUG, "gruff", "You're the guy on my driver's case on Twenty-Ninth. Wait. I know you."),
  (AUG, "gruff", "Arce. Christmas list, Midtown. You took a turkey and a fifty. Sixty-nine."),
  (T, "flat", "Seventy. And it was a ham."),
  (AUG, "gruff", "Thirty-Seventh's a parking lot seven to ten. That's not traffic. That's my office."),
  (AUG, "warning", "You carry for Feld, fine. You carry opinions, you carry 'em someplace else."))
# ------------------------------------------------------------------ M5 Contact Sheet
S("dlg.m05_recognition", "M5 o5. Through the luncheonette window, telephoto, Lisle at the counter. Teddy's inner voice.",
  (T, "inner", "Tall. Grey suit. Eats like he's being graded."),
  (T, "inner", "I know that face. Not from a notice. From a back seat."),
  (T, "inner", "Carl's car. Thirty-Fifth Street. Autumn, seventy-one. I waited outside."),
  (T, "inner", "He got in the back with a briefcase. He got out without it."),
  (T, "inner", "H. Lisle, counsel. Okay, counsel. Let's see who you eat with."))
# ------------------------------------------------------------------ M6 The Club
S("dlg.m06_payout_table", "M6 o1. Sunday, the Arden's lobby bar. Rita behind the bar. Four women at the back table.",
  (RIT, "warm", "Sit down, sugar. Nobody makes a good decision standing up."),
  (D, "brisk", "Rule one: I don't hold money I can't count. Rule two: I count everything."),
  (D, "brisk", "Twenty women, five dollars a week, one woman a month takes the pot. Claudette's month."),
  (TIN, "funny", "Del, that cop's so cheap he tips in subway tokens. I'm short this week."),
  (D, "noticing", "You're short and you're wearing powder on your cheek in July. Who did that?"),
  (TIN, "deflecting", "The door. The door did it. Big mean door. Can we do the money?"),
  (D, "brisk", "We do the money. Then we talk about the door."))
S("dlg.m06_claudette", "M6 o3. Hotel Pennsylvanian staff entrance, W 33rd St. Claudette in her uniform.",
  (CLA, "formal", "Delphine. You walked all this way with my month in your bag?"),
  (D, "warm", "Ninety-five dollars. Count it. I'd be insulted if you didn't."),
  (CLA, "formal", "I send forty dollars home each week. The club is how I keep the other ten."),
  (CLA, "formal", "Delphine, I trust your head. I don't trust your shoebox."),
  (D, "dry", "Nobody trusts the shoebox. That's why it works."))
S("dlg.m06_the_tax", "M6 o5. 8th Ave & W 38th St. Brannock's car at the curb, Lonnie leaning on it.",
  (LON, "smooth", "Del, baby. Sunday best. Jimmy wants a word about the new rates."),
  (BRA, "flat", "Tax is due, sweetheart. City's broke, didn't you hear?"),
  (BRA, "flat", "Fifty a week, each girl. Not twenty-five. Inflation. Read the papers."),
  C(ch("Pay the fifty.", "l_pay"),
    ch("Pay. And read his badge.", "l_read")),
  {"id": "l_pay", "speaker": D, "emotion": "cold", "text": "Here. Count it. I know you can count to fifty.", "goto": "l_end"},
  {"id": "l_read", "speaker": D, "emotion": "cold", "text": "Here. Your badge says Brannock and your ring says married. I read both, honey."},
  {"id": "l_read2", "speaker": BRA, "emotion": "amused", "text": "Smile for the camera? Lady, I am the camera.", "goto": "l_end"},
  {"id": "l_end", "speaker": LON, "emotion": "smooth", "text": "Everybody on this avenue works for somebody. You just don't know who."})
S("dlg.m06_marcus_stairs", "M6 o7. The Arden's service corridor. Marcus opens a grey door.",
  (MAR, "formal", "Miss Moore. A minute. I want to show you something you won't need."),
  (MAR, "formal", "Service stairs. Basement to roof. Door on Thirty-Ninth. Door to Rita's bar."),
  (MAR, "formal", "Nobody uses them but me. Back stairs are always open for you."),
  (D, "warm", "Marcus, are you courting me or protecting me?"),
  (MAR, "formal", "Carried luggage forty years. I know what's heavy and what's money. Good night."))
# ------------------------------------------------------------------ M7 Yes
S("dlg.m07_notices", "M7 o1. Corwin, 4th-floor corridor. Prentiss's man slides yellow paper under doors. Hollis watches.",
  (HOL, "angry", "Shipmate! He's mailing us out! Thirty days, it says. Thirty days!"),
  (PRE, "friendly", "Teddy! Just paperwork. Standard. Nobody's evicting anybody."),
  (PRE, "friendly", "Thirty days is a conversation, not a deadline. Five hundred if you go early."),
  (T, "cold", "Take your paper off Mr. Hollis's floor."),
  (PRE, "friendly", "I'm in the moving business, Teddy. Moving's healthy. Ask Inez. She's thinking."))
S("dlg.m07_carmen", "M7 o3. Carmen's kitchen, Penn South. Rice, beans, the fan on high. She sees everything.",
  (CAR, "warm", "Mijo, you look like a man who hasn't eaten since the Korean War. Sit."),
  (T, "tired", "They're putting notices under doors, Ma. Thirty days. Old men, Ma."),
  (CAR, "firm", "The union built this building. Nobody sells it while I live in it."),
  (CAR, "probing", "Your hotel has no union. So who are you going to ask? Carl?"),
  (T, "quiet", "Carl's offering work. Two hundred a week. Carrying."),
  (CAR, "quiet", "Carrying what, Teodoro?"),
  (T, "quiet", "Paper, Ma. Just paper."),
  (CAR, "sad", "In nineteen seventy-one you also told me paper. Eat. You'll do what you do."))
S("dlg.m07_kearney", "M7 o5. Midtown Central front desk. Sgt. Kearney behind the blotter.",
  (KEA, "gruff", "Arce. Front desk is for complaints, son. Yours I've heard. Next."),
  (T, "flat", "Looking for Carl."),
  (KEA, "contempt", "Mayhew sells his own furniture and calls it moving. He's at the Rail."),
  (KEA, "gruff", "Took a turkey every Christmas for twenty years. Never a dollar. Write that."),
  (KEA, "quiet", "Whatever he's selling you, son, check the bottom of the box."))
S("dlg.m07_yes", "M7 o7. The Shamrock Rail, end of the bar. Mayhew alone with a beer and a racing form.",
  (MAY, "warm", "Kid. Sit. Knew you'd come. Nobody says no in July."),
  (T, "flat", "The Corwin. They're giving old men thirty days."),
  (MAY, "serious", "So say yes, and I make a call, and the Corwin stays open through Labor Day."),
  C(ch("Yes. The Corwin stays open.", "l_yes"),
    ch("Yes. For two hundred a week.", "l_money"),
    ch("Show him the photograph.", "l_photo", **{"if": "flag.saw_lisle_mayhew"}, setFlags=["flag.mayhew_saw_photo"])),
  {"id": "l_photo", "speaker": T, "emotion": "cold", "text": "Before I say anything. You and H. Lisle, counsel. Pennsylvania lobby. Friday."},
  {"id": "l_photo2", "speaker": MAY, "emotion": "shaken", "text": "Where'd you get a camera? Put that away. Put it away, Teddy."},
  {"id": "l_photo3", "speaker": MAY, "emotion": "shaken", "text": "He's a lawyer. I know lawyers. Everybody knows lawyers. Yes or no?"},
  {"id": "l_photo4", "speaker": T, "emotion": "flat", "text": "Yes. And the Corwin stays open.", "goto": "l_end"},
  {"id": "l_yes", "speaker": T, "emotion": "flat", "text": "Yes. And the Corwin stays open. Every room.", "goto": "l_end"},
  {"id": "l_money", "speaker": T, "emotion": "flat", "text": "Yes. Two hundred. In advance.", "goto": "l_end"},
  {"id": "l_end", "speaker": MAY, "emotion": "relieved", "text": "Here's the first week and the list. Collect Thursday. Fourth of July, nice and quiet."})
# ------------------------------------------------------------------ M8 Back Stairs
S("dlg.m08_spotted", "M8 o3. 8th & W 38th. The flash goes off. Brannock turns.",
  (BRA, "angry", "Hey! Hey, you with the bag! What was that?"),
  (LON, "alarmed", "That's Del! She's got a camera, Jimmy!"),
  (D, "inner", "Rule three: when they see you, you're already gone."),
  (BRA, "angry", "Stop right there! Police!"))
S("dlg.m08_rita", "M8 o6. Rita's bar. Delphine slides onto a stool, breathing hard. Brannock bursts in a beat later.",
  (RIT, "calm", "Sugar, you've been on that stool an hour. Haven't you?"),
  (D, "breathless", "Hour and a half. Gin and tonic, no gin."),
  (BRA, "angry", "Rita. A woman came in here. Tall. Red dress. Bag."),
  (RIT, "dry", "Officer, every woman in here is tall in the right light. You drinking or leaving?"),
  (BRA, "flat", "I'll find the camera, Delphine. I'll find the film."),
  (D, "cold", "Film? Honey, I don't even own a radio."),
  (RIT, "low", "Twenty years on that avenue. Knees like a trucker, memory like a cop. Show me later."))
# ------------------------------------------------------------------ M9 Independence Day
S("dlg.m09_earl", "M9 o2. 42nd & Seventh, July 4th night, the street nearly empty. Earl closes up his shine stand.",
  (EAR, "slow", "Shine's a dollar. Advice is free. The number today is seven-four-one."),
  (EAR, "slow", "So Carl's got himself a civilian. You know what you are now, Mr. Arce?"),
  (T, "flat", "A courier."),
  (EAR, "slow", "A tax with legs. Every man on this street plays a number. Cops play the biggest."),
  (EAR, "slow", "Here's the envelope. Count it. I already know you won't. You're that kind."),
  (DWA, "cocky", "Used-to-be! You collecting now? That's cold, man. That's cold."))
S("dlg.m09_envelope", "M9 o4. Royal Cafeteria, Eighth & 40th. The woman in the oxblood dress, coffee and pie, waiting.",
  (D, "cool", "You're new. The old collector smelled like aftershave and debt."),
  (T, "flat", "I'm told you have something for Mayhew."),
  (D, "cool", "I have something for whoever Mayhew sends. Tonight, apparently, a gentleman."),
  (D, "cool", "Fifty. In an envelope I'd like back. Rule four: never give them the envelope."),
  C(ch("Count it in front of her.", "l_count", setRelationships=rel(T, D, -1)),
    ch("Take it without counting.", "l_trust", setRelationships=rel(T, D, 1))),
  {"id": "l_count", "speaker": D, "emotion": "cold", "text": "Go ahead. Count. I'll time you.", "goto": "l_end"},
  {"id": "l_trust", "speaker": D, "emotion": "surprised", "text": "You didn't count. Either you're stupid or you're something else.", "goto": "l_end"},
  {"id": "l_end", "speaker": T, "emotion": "tired", "text": "Happy Fourth of July, Miss…"},
  {"id": "l_end2", "speaker": D, "emotion": "cool", "text": "Moore. Delphine Moore. Go on. Your sergeant's waiting."})
S("dlg.m09_ambush", "M9 o7. 8th Ave & W 35th St. Delphine, tailing, sees two men step out of a doorway at Teddy.",
  (D, "inner", "Rule five: know where your money's going. Mine's going to Thirty-First and Eighth."),
  (D, "inner", "Two of Lonnie's boys. In the doorway. That's not police. That's a stickup."),
  (LON, "offscreen", "Make it look bad, fellas. Jimmy says the new man's soft."),
  (D, "shouting", "Collector! Behind you! Run!"),
  (T, "startled", "Penn Station. Eighth Avenue doors. Go!"))
S("dlg.m09_concourse", "M9 o10. Penn Station concourse, under the Garden. Fireworks thud far away. They catch their breath.",
  (T, "breathless", "They came for the envelopes. Your fifty's in here."),
  (D, "breathless", "Lonnie wants your job. Brannock wants you to look weak. Congratulations."),
  (D, "dry", "I followed you. I wanted to see where my money sleeps."),
  (T, "dry", "Now you know. Thirty-First and Eighth, in a sergeant's glove box."),
  C(ch("Give her back her fifty.", "l_give", setFlags=["flag.teddy_returned_tax"], setRelationships=rel(T, D, 2)),
    ch("Keep it. It's not mine to give.", "l_keep")),
  {"id": "l_give", "speaker": T, "emotion": "quiet", "text": "Here. Tell Mayhew I lost it running. He'll believe it."},
  {"id": "l_give2", "speaker": D, "emotion": "moved", "text": "Rule six: nobody gives money back. You're breaking all my rules, Mr. Arce.", "goto": "l_end"},
  {"id": "l_keep", "speaker": T, "emotion": "flat", "text": "It's not mine. That's the whole job. It's never mine."},
  {"id": "l_keep2", "speaker": D, "emotion": "cool", "text": "Honest. In a way that doesn't help anybody. Okay.", "goto": "l_end"},
  {"id": "l_end", "speaker": D, "emotion": "warm", "text": "Delphine. Since we've been shot at together. Well, almost."},
  {"id": "l_end2", "speaker": T, "emotion": "warm", "text": "Teddy. Happy Fourth, Delphine."})

# ---------------- COMBAT REWORK additions (26 Nov 2026)
S("dlg.m01_stickup_after", "M1 o8. After the stick-up at the desk. A resident ran for the police call box on Broadway.",
  (ODE, "shaken", "Mr. Arce. Mr. Lefkowitz ran for the call box. In his slippers."),
  (T, "inner", "Call box on the corner. Somebody gives a description. A report gets written. Mine."),
  (T, "flat", "He was a trucker out of work, Mrs. Pruitt. He'll sleep it off at Midtown Central."),
  (ODE, "dry", "And you'll sleep it off behind the glass. Here. The master keys. Manny forgot them."))
S("dlg.m02_movers_after", "M2 o4c. The 11th-floor corridor after Prentiss's two 'movers' have been thrown down the stairs.",
  (HOL, "cheerful", "Shipmate! Two of 'em! Like the old days in Marseille!"),
  (T, "breathless", "They said they were moving your furniture, Mr. Hollis."),
  (HOL, "cheerful", "My furniture is a chair and a radio. I'm keeping both."))
S("dlg.m03_runner_caught", "M3 o6c. The fare who ran with Delroy's cash box, caught on W 41st St.",
  ("npc.fare_runner", "panicked", "Okay! Okay! It's all there! I got laid off Tuesday, man!"),
  (T, "tired", "So did half the city. Give me the box. Go home."),
  (T, "inner", "Somebody on the corner saw that. A report with my shirt in it. Note to self: new shirt."))
S("dlg.m04_brawl_after", "M4 o5c. The Carriers' men are gone. Baek sits on a crate of wigs, his glasses cracked.",
  (BAE, "dry", "Thank you. Now two of us are bruised. Better than one."),
  (DWA, "cocky", "Used-to-be! You hit like a cop! I mean that nice!"),
  (T, "flat", "They'll be back with friends, Mr. Baek."),
  (BAE, "calm", "Then I'll need more wigs to sit on."))
S("dlg.m06_after_fight", "M6 o5c. W 38th St. Lonnie's boys are on the pavement. Delphine counts the envelope.",
  (D, "breathless", "Rule three: when they see you, you're already gone. Three and a half: unless they grab."),
  (TIN, "awed", "Del. You cut his sleeve off. His whole sleeve."),
  (D, "brisk", "Ninety-five dollars. All there. Walk with me to the Pennsylvania, Tina."))
S("dlg.m07_revolver", "M7 o8. The Shamrock Rail, after the yes. Mayhew slides a paper bag along the bar.",
  (MAY, "low", "Your old service piece. I kept it when they took your shield. Kept it oiled."),
  (T, "cold", "I gave that up, Carl."),
  (MAY, "serious", "You gave up the badge. The streets didn't give up anything. Take it."),
  ("npc.off_duty_cop", "alarmed", "Back door! Somebody's at the back door with a gun!"))
S("dlg.m08_stairwell", "M8 o3b (barks during the stairwell fight).",
  (LON, "smooth", "Del, baby. Give me the film and we're square."),
  (D, "cold", "Rule eleven: nobody's square with you, Lonnie."))

for s in SCRIPTS:
    (OUT / f"{s['id'].split('.', 1)[1]}.json").write_text(json.dumps(s, ensure_ascii=False, indent=2) + "\n")
print(len(SCRIPTS), "scripts,", sum(len([l for l in s['lines'] if 'text' in l]) for s in SCRIPTS), "lines")
