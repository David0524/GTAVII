#!/usr/bin/env python3
"""Authoring source for side-activity dialogue (N5): the dlg.act_* scripts referenced by content/activities.json.
Short, repeatable scenes. Lines are 90 characters or fewer; choices are 40 characters or fewer."""
import json
from pathlib import Path
OUT = Path(__file__).resolve().parents[2] / "content" / "dialogue"
T, D, N = "char.teddy_arce", "char.delphine_moore", "char.nick_varelas"
c = lambda n: f"char.{n}"
MAY, MOR, BAE, KAL, EAR, FEL, BAU, ODE, HOL, INE, RIT, TIN, CLA, MIS, CAR, DEL, ELE, BER, YIA = map(c, [
 "carl_mayhew", "anna_moretti", "jung_ho_baek", "stavros_kallis", "earl_poole", "sam_feld", "ray_bauer", "odessa_pruitt",
 "walter_hollis", "inez_rivera", "rita_haines", "tina_mercado", "claudette_bijou", "mi_sook_baek", "carmen_arce",
 "delroy_tate", "eleni_varelas", "bernard_ostrow", "yiannis_doukas"])
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


def ch(text, goto, **k):
    d = {"text": text, "goto": goto}
    d.update(k)
    return d


def r(*t):
    return {f"{a}/{b}": n for a, b, n in t}


# ---- Collections (Teddy, Act 2): collect or let it slide (P1, P4)
for key, who, emo, open_line, slide_line in [
    ("moretti", MOR, "loud", "You again. Gladiolus, roses, and you. One of those wilts.", "Next week, then. Go fix your truck."),
    ("baek", BAE, "dry", "Twenty dollars. For nothing. I wrote you a receipt. Sign it.", "Keep your twenty, Mr. Baek. Tear up the receipt."),
    ("kallis", KAL, "courtly", "Kallis pays early, collector. Tell your sergeant who's a gentleman.", "Keep it this week. Buy Mr. Varelas some ice."),
    ("earl", EAR, "slow", "Shine's a dollar. Envelope's what it is. Number today's two-oh-six.", "Hold it, Earl. Pay your runners first this week."),
    ("feld", FEL, "weary", "Surcharge, tax, fee, envelope. My grandfather paid the czar less.", "Pay your cutters first, Mr. Feld. Mayhew can wait."),
    ("bauer", BAU, "nervous", "Teddy! Envelope's ready! Very legit envelope! Ha!", "Keep it, Ray. You look like you need it more.")]:
    S(f"dlg.act_collection_{key}", f"Collections activity, {key}. Untimed choice: press or let it slide.",
      (who, emo, open_line),
      {"id": "c1", "choices": [ch("Collect.", "l_press", setRelationships=r((T, who, -1), (T, MAY, 1))),
                               ch("Let it slide this week.", "l_slide", setRelationships=r((T, who, 1), (T, MAY, -1)))]},
      L("l_press", T, "flat", "Thanks. See you next week.", goto="l_end"),
      L("l_slide", T, "quiet", slide_line),
      L("l_end", T, "inner", "Every envelope's a person. I keep forgetting that on purpose."))

# ---- Night desk requests (Teddy)
S("dlg.act_desk_medicine", "Desk request: medicine run.",
  ("npc.sro_resident", "worried", "Mr. Arce, my pills ran out. The all-night place on Thirty-Fourth has them."),
  (T, "warm", "Write it down. I'll go on my break. Lock your door."))
S("dlg.act_desk_fan", "Desk request: a fan for a hot room.",
  ("npc.sro_resident", "tired", "Room's a hundred degrees. Window's painted shut. Anything, Mr. Arce."),
  (T, "warm", "Hardware store on Sixth has fans. I'll bring one up. Don't pay me back."))
S("dlg.act_desk_letter", "Desk request: reading a letter (changes after Hollis's death).",
  L("l1", HOL, "cheerful", "Shipmate! Letter from my old bosun. Eyes are bad. Read it to me?", requires={"none": ["flag.hollis_dead"]}),
  L("l2", T, "warm", "Come down to the desk, Mr. Hollis. I'll read it slow.", requires={"none": ["flag.hollis_dead"]}),
  L("l3", ODE, "quiet", "A letter came for Walter. From his ship. Will you read it to me, Mr. Arce?", requires={"all": ["flag.hollis_dead"]}),
  L("l4", T, "quiet", "Sit, Mrs. Pruitt. 'Dear Walt. The reunion's in October…'", requires={"all": ["flag.hollis_dead"]}))
S("dlg.act_desk_locked_out", "Desk request: Inez locked out.",
  (INE, "annoyed", "Locked out. Key's at the laundromat on Thirtieth, in my other pants. Probably."),
  (T, "dry", "Probably. I'll go. You watch the desk. Don't rent any rooms."))
S("dlg.act_desk_phone", "Desk request: a payphone call for Odessa.",
  (ODE, "formal", "My sister calls the payphone on Thirty-Second at eleven. My knees say no."),
  (T, "warm", "I'll take the call and bring the message. Word for word."))

# ---- Tenant canvass (Teddy, Act 3)
for key, place, lines in [
    ("corwin", "the Corwin", [("npc.sro_resident", "proud", "Sign? I'll sign twice. Once for me, once for Walter."),
                              ("npc.sro_resident", "worried", "If I sign, does Prentiss see my name? …Okay. Okay, I'll sign.")]),
    ("h32", "the hotel on 32nd", [("npc.sro_resident", "wary", "Corwin? Never heard. Same owner as us? …Give me the pen."),
                                  ("npc.sro_resident", "tired", "They emptied six floors here already. Six. Who's left to sign?")]),
    ("h29", "the hotel on 29th", [("npc.sro_resident", "angry", "They turned off our hot water in June. It's August. Yes, I'll sign."),
                                  ("npc.sro_resident", "sad", "My neighbor took the money and a bus ticket. Sign for him too?")]),
    ("h8th", "an Eighth Ave hotel", [("npc.sro_resident", "suspicious", "You were police. I remember you. …You're asking, not taking? Huh."),
                                     ("npc.sro_resident", "proud", "Merchant seaman, thirty years. Ships to everywhere. I'll sign.")])]:
    S(f"dlg.act_canvass_{key}", f"Tenant canvass at {place} (Act 3).",
      (T, "earnest", "Tenants' petition. The march is the twenty-third. Will you sign?"), *lines,
      (T, "warm", "Thank you. Bring a chair on the twenty-third."))

# ---- Club rounds (Delphine): collect, advance, or forgive
for key, who, open_line in [
    ("waitress", "npc.club_waitress", "Del! Tips were good this week. Here's five. And here's a pie, for the table."),
    ("maid", "npc.club_maid", "Five dollars, Delphine. Convention of shoe salesmen. They tip in shoelaces."),
    ("tina", TIN, "Del! I'm short again. Don't look at me like that. I'm short, not dead."),
    ("terminal", "npc.strip_worker", "I'm short this week. My kid's sick. Can I pay double next Sunday?"),
    ("hatcheck", "npc.club_hatcheck", "Five dollars and a hat nobody claimed. Want a hat? It's a nice hat.")]:
    target = who if who.startswith("char.") else RIT
    S(f"dlg.act_club_{key}", f"Club rounds, {key}. Untimed choice.",
      (who, "friendly", open_line),
      {"id": "c1", "choices": [ch("Collect.", "l_col"),
                               ch("Advance her next week's.", "l_adv", setRelationships=r((D, target, 1))),
                               ch("Forgive it this week.", "l_fgv", setRelationships=r((D, target, 2)))]},
      L("l_col", D, "brisk", "Five dollars. Counted. Rule one.", goto="l_end"),
      L("l_adv", D, "warm", "Pay me next week. I'll carry it. I always carry it.", goto="l_end"),
      L("l_fgv", D, "warm", "Not this week. The club's for weeks like this.", goto="l_end"),
      L("l_end", D, "inner", "Twenty women, twenty weeks a year that go wrong. The club's for those."))

# ---- Walk her home (Delphine)
for key, who, dest, lines in [
    ("claudette", CLA, "the 34th St subway", [(CLA, "formal", "In Port-au-Prince my mother walked me home. Now you do. Strange world."),
                                             (D, "warm", "Rule eighteen: nobody walks Eighth Avenue alone after two.")]),
    ("waitress", "npc.club_waitress", "her building", [("npc.club_waitress", "tired", "Car slowed down back there. Did you see?"),
                                                       (D, "cold", "New Jersey plates, KXR, something. He saw me read it. He drove on.")]),
    ("tina", TIN, "the bus terminal", [(TIN, "funny", "You walk like a cop, Del. Shoulders back, eyes everywhere."),
                                       (D, "dry", "A cop walks like he owns the street. I walk like I'm watching who does.")]),
    ("newcomer", "npc.club_newcomer", "the women's residence", [("npc.club_newcomer", "nervous", "I just got off the bus Tuesday. Everybody's so fast here."),
                                                                (D, "warm", "Here's a token and a number. Rita's bar. Ask for me. Don't ask for anybody else.")])]:
    S(f"dlg.act_walkhome_{key}", f"Walk Her Home: to {dest}.", *lines,
      (D, "quiet", "Goodnight. Lock the door. Count your money in the morning."))

# ---- Read the room (Delphine): spot the plainclothes cop by a tell
ROUNDS = {
    "arden_1": ("the Arden bar", ["The sailor with the tattoo", "The man in white sneakers", "The salesman with the samples", "The old man with the racing form"], 1),
    "arden_2": ("the Arden bar", ["The couple fighting quietly", "The man who orders club soda", "The woman with the poodle", "The trumpet player on break"], 1),
    "pennsylvania_1": ("the Pennsylvania bar", ["The convention man in the fez", "The bellhop on his break", "The man reading yesterday's paper", "The widow with the sherry"], 2),
    "pennsylvania_2": ("the Pennsylvania bar", ["The fellow with the wedding ring in his pocket", "The quiet man who faces the door", "The two nurses", "The man with the cello case"], 1),
    "shamrock_1": ("the Shamrock Rail", ["Every man at the bar", "The bartender", "The man asleep in the booth", "The pay phone"], 0),
}
TELLS = {
    "arden_1": "White sneakers in a bar. Good for standing all night. Nobody does that for fun.",
    "arden_2": "Club soda on duty, and a wedding-ring tan. He's married to the job.",
    "pennsylvania_1": "Yesterday's paper, same page for an hour. He's not reading. He's listening.",
    "pennsylvania_2": "Faces the door, back to the wall, never checks the mirror. That's a cop.",
    "shamrock_1": "It's the Shamrock Rail. They're all cops. That was a joke round.",
}
for key, (place, options, correct) in ROUNDS.items():
    choices = []
    for i, opt in enumerate(options):
        good = i == correct
        choices.append(ch(opt[:40], "l_right" if good else "l_wrong", **({"setRelationships": r((D, RIT, 1))} if good else {})))
    S(f"dlg.act_read_room_{key}", f"Read the Room at {place}. Tap patrons for their tell lines first (engine), then choose.",
      (RIT, "low", "Somebody in here is a cop. Which one, sugar?"),
      {"id": "c1", "choices": choices},
      L("l_right", RIT, "pleased", TELLS[key], goto="l_end"),
      L("l_wrong", RIT, "dry", "No, sugar. " + TELLS[key], goto="l_end"),
      L("l_end", D, "inner", "Rule nineteen: the cop is the one who isn't enjoying himself."))
S("dlg.act_read_room_answer", "Read the Room wrap-up.",
  (RIT, "warm", "Five dollars from the tip jar. Don't tell Bauer. Bauer can't count anyway."))

# ---- Patronage (Nick): buying goodwill from people who notice
S("dlg.act_patronage_widow", "Patronage: a union widow at the kafeneio.",
  ("npc.kafeneio_widow", "proud", "Kyrie Varelas. My husband cut for you twelve years. The pension is small."),
  {"id": "c1", "choices": [ch("Pay her rent this month.", "l_pay", setRelationships=r((N, YIA, 1))),
                           ch("Promise to look into it.", "l_promise")]},
  L("l_pay", N, "warm", "This month and next. Tell nobody. Especially Kallis.", goto="l_end"),
  L("l_promise", N, "evasive", "I'll talk to the union. And the bank. And God."),
  L("l_end", "npc.kafeneio_widow", "dry", "In Kastoria we say: a promise is a coat with no lining."))
S("dlg.act_patronage_retirement", "Patronage: a cop's retirement party at the Shamrock Rail.",
  ("npc.off_duty_cop", "friendly", "Mr. Varelas! You're buying the round? Everybody, Mr. Varelas is buying!"),
  (N, "charming", "Everybody gets paid. Tonight it's whiskey."),
  (N, "inner", "Somebody's taking pictures by the door. Tall woman. I'd know that bag anywhere."))
S("dlg.act_patronage_church", "Patronage: the church roof fund.",
  ("npc.parish_priest", "hopeful", "The roof, Mr. Varelas. Rain comes in over the Sacred Heart. And the Greeks."),
  (N, "warm", "My church is uptown, Father. But rain is ecumenical. Two hundred."),
  ("npc.parish_priest", "dry", "God bless you. Your name goes on the plaque. Small letters, if you prefer."))
S("dlg.act_patronage_tenants", "Patronage: the Corwin lobby, with a box of fans.",
  (N, "awkward", "Fans. For the hot floors. From the owner. From me."),
  (ODE, "cold", "Fans are nice, Mr. Varelas. Wiring is nicer. Leases are nicest."),
  (N, "humble", "One thing at a time, Mrs. Pruitt."),
  (ODE, "dry", "That's what we've been saying for eighteen years.", {"setRelationships": r((N, ODE, 1))}))
S("dlg.act_patronage_kye", "Patronage: Hanyang House back room.",
  (N, "charming", "Mrs. Baek. A donation. For the kye. For the optimists."),
  (MIS, "sharp", "Kye doesn't take donations. Kye takes members. Five dollars a week. Join or go."),
  (N, "amused", "…Five dollars. Put me down."))

# ---- Buyers' tour (Nick)
for key, sight, lines in [
    ("empire", "the Empire State", [("npc.trade_dinner_guest", "awed", "That's the tallest building in the world?"),
                                    (N, "charming", "Was. Downtown they built two taller. New York is never satisfied.")]),
    ("garment", "the Garment District", [("npc.trade_dinner_guest", "alarmed", "Why is everyone pushing racks in the street?"),
                                         (N, "proud", "That's the factory floor. Three miles long, one block wide.")]),
    ("times", "Times Square", [("npc.trade_dinner_guest", "uneasy", "It's… livelier than the brochure."),
                               (N, "dry", "The brochure was printed in 1955. The neon is from 1974.")]),
    ("flatiron", "the Flatiron", [("npc.trade_dinner_guest", "charmed", "It's so thin! How do people work in the point?"),
                                  (N, "warm", "Very carefully. Like furriers in summer.")])]:
    S(f"dlg.act_buyers_{key}", f"Buyers' Tour: {sight}.", *lines,
      (N, "inner", "Sell them the city. The city's going broke. Sell it anyway. It's beautiful."))

# ---- Payphone calls (any lead)
S("dlg.act_payphone_carmen", "Payphone: Carmen.",
  (CAR, "scolding", "Mijo! My prescription. The botanica on Twenty-Fifth. You know which."),
  (CAR, "warm", "And eat something. You sound thin on the phone."))
S("dlg.act_payphone_delroy", "Payphone: Delroy.",
  (DEL, "easy", "Cab line's forty deep and I need a coffee. Watch my place? Ten minutes."))
S("dlg.act_payphone_tina", "Payphone: Tina.",
  (TIN, "funny", "Del, I'm at the Royal and I got no dime and no coffee. Rescue me."))
S("dlg.act_payphone_eleni", "Payphone: Eleni.",
  (ELE, "dry", "Nikos. The green ledger. It's in your car. Where you put it. Where you always put it."))
S("dlg.act_payphone_bernard", "Payphone: Bernard.",
  (BER, "precise", "My library book is due. Comma. I am seventy. Period. Would you, kindly?"))

for s in SCRIPTS:
    (OUT / f"{s['id'].split('.', 1)[1]}.json").write_text(json.dumps(s, ensure_ascii=False, indent=2) + "\n")
print(len(SCRIPTS), "scripts,", sum(len([l for l in s['lines'] if 'text' in l]) for s in SCRIPTS), "lines")
