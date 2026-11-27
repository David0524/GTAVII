"""NPC memory barks (sim 39af2cb: pedGreets {pool, context, mood, recall, archetype}). Adds contexts greet_known, antagonize
and fear to each archetype pool, with `recall` = helped | robbed | violence | (none = just a familiar face).
1974 NYC voice, adults only. Re-applied after build_barks (idempotent). Written by the lead writer."""
import json
from pathlib import Path
B = Path(__file__).resolve().parents[2] / "content" / "barks"

# pool: [(context, recall, emotion, text)]
M = {
 "beat_cop": [
  ("greet_known", None, "easy", "You again. Staying out of trouble? Don't answer that."),
  ("greet_known", "helped", "warm", "Hey, you're the one who caught that purse thief. Coffee's on me."),
  ("greet_known", "robbed", "cold", "I know your face. I'm writing it down. Slowly."),
  ("antagonize", None, "hard", "Move along. I won't say it twice. I'll say it once, with the stick."),
  ("antagonize", "violence", "hard", "You shot up this block and you walk back on it? You got nerve."),
  ("fear", "violence", "tense", "Easy. Easy now. Hands where I can see 'em. Central, I need a car."),
  ("fear", None, "tense", "Don't do nothing stupid, pal. I got a pension coming."),
  ("antagonize", None, "warning", "Keep talking, pal. I got all night and a nightstick."),
  ("cop_stop", None, "stern", "That's it. Hands on the wall. You're coming with me."),
  ("cop_stop", None, "stern", "Alright, wise guy. Turn around. We're taking a ride to the precinct."),
  ("cop_stop", "violence", "stern", "Drop it. Drop it now. You're under arrest. Don't make me draw.")],
 "cab_driver": [
  ("greet_known", None, "easy", "Hey, Mac! Where to? Not Brooklyn, I'm begging you."),
  ("greet_known", "helped", "warm", "You! You pushed my hack out of the intersection. Half fare, today only."),
  ("greet_known", "robbed", "angry", "You! You stiffed me on Eighth! Get outta my cab!"),
  ("antagonize", None, "angry", "Off my fender! What, you want to ride on the hood?"),
  ("antagonize", "violence", "angry", "You're the maniac from the shooting. I seen you. Keep walking."),
  ("fear", "violence", "scared", "Take the cab, take the cab! I got no meter money, I swear!"),
  ("fear", None, "scared", "Whoa, whoa, easy! I'm just a hack! I don't see nothing!")],
 "cab_fare": [
  ("greet_known", None, "brisk", "Oh, it's you. You drove me last week. You took the long way."),
  ("greet_known", "helped", "warm", "You got me to the hospital on time. My sister says God bless."),
  ("antagonize", None, "annoyed", "I'm not paying for the scenic route. Left. Left!"),
  ("fear", "violence", "scared", "Let me out here. Right here. Keep the change. Keep all of it."),
  ("fear", None, "scared", "Is that a gun? Driver, please, I have a family in Queens.")],
 "commuter": [
  ("greet_known", None, "tired", "Morning. Same train, same face. We should form a club."),
  ("greet_known", "helped", "grateful", "You found my wallet on the platform. Every dollar. Who does that?"),
  ("greet_known", "robbed", "angry", "That's him! That's the one who took my briefcase!"),
  ("antagonize", None, "annoyed", "Some of us have a train to catch. Out of the doorway."),
  ("antagonize", "violence", "cold", "I saw what you did on Thirty-Fourth. I'm telling the transit cop."),
  ("fear", "violence", "scared", "Not again. Not on my train. I'll get off. I'll take the next one."),
  ("fear", None, "scared", "Take it, take the watch. It's not even gold.")],
 "deuce": [
  ("greet_known", None, "slick", "Hey, my man's back. You buying or browsing?"),
  ("greet_known", "helped", "warm", "You ran that creep off Forty-Second. You're good on this block."),
  ("greet_known", "robbed", "menacing", "You took from Ray's till. Ray remembers. Ray always remembers."),
  ("antagonize", None, "mocking", "Look at the hero. Go home, hero. This street eats heroes."),
  ("antagonize", "violence", "menacing", "You shot up the Deuce, you don't come back to the Deuce."),
  ("fear", "violence", "scared", "Whoa! Whoa, I got nothing! I'm a businessman! Small business!"),
  ("fear", None, "scared", "Not me, man. I'm just standing here. Standing is legal.")],
 "garment": [
  ("greet_known", None, "cocky", "Hey, it's the guy who keeps walking into my racks."),
  ("greet_known", "helped", "grateful", "You pushed my rack all the way to Thirty-Eighth. You want a job?"),
  ("greet_known", "robbed", "angry", "You! You stole a whole rack of coats! Feld's docking me for it!"),
  ("antagonize", None, "annoyed", "Watch it! These dresses cost more than your shoes!"),
  ("antagonize", "violence", "cold", "After what you did on Seventh, nobody's pushing anything near you."),
  ("fear", "violence", "scared", "Take the rack! Take it! It's all yours, it's polyester!"),
  ("fear", None, "scared", "I don't want trouble. I got a union card and two kids at home.")],
 "marcher": [
  ("greet_known", None, "warm", "Brother! You marched with us. Come on, the front's this way."),
  ("greet_known", "helped", "warm", "You held the line at Herald Square. Everybody saw."),
  ("antagonize", None, "defiant", "Go ahead, shove. We've been shoved by better."),
  ("fear", "violence", "scared", "Everybody down! He's got a gun! Get the old people inside!")],
 "neighbor": [
  ("greet_known", None, "warm", "Ay, look who it is. You eat today? You look thin."),
  ("greet_known", "helped", "warm", "You fixed Mrs. Ortiz's door. The whole building's talking."),
  ("greet_known", "robbed", "cold", "We know what you did on this block. Nobody forgets here."),
  ("antagonize", None, "annoyed", "Hey! This is a stoop, not a racetrack. Respect."),
  ("fear", "violence", "scared", "Inside! Everybody inside! Lock the door, Carmen, lock it!")],
 "office": [
  ("greet_known", None, "polite", "Oh, hello again. You're always around here, aren't you?"),
  ("greet_known", "helped", "grateful", "You caught the man who grabbed my purse. I wrote to the paper."),
  ("greet_known", "robbed", "angry", "You! Security! That's the man from the elevator!"),
  ("antagonize", None, "cold", "Excuse me. Some of us work in this building."),
  ("antagonize", "violence", "cold", "I gave the police your description. Twice."),
  ("fear", "violence", "scared", "Please. I have a typing pool waiting. Please just let me go."),
  ("fear", None, "scared", "Here, take my purse, take it, just don't hurt me.")],
 "park": [
  ("greet_known", None, "easy", "Hey, friend. You again. Bench is free, the pigeons aren't."),
  ("greet_known", "helped", "grateful", "You chased those punks off my bench. I owe you a sandwich."),
  ("antagonize", None, "grumbling", "Find your own bench. This one's spoken for since Eisenhower."),
  ("fear", "violence", "scared", "Not here, not in the park! People sleep here!")],
 "plainclothes": [
  ("greet_known", None, "dry", "Small world. Smaller every time I see you."),
  ("greet_known", "helped", "flat", "You did us a favour on Thirty-Fourth. Don't make it a habit."),
  ("greet_known", "robbed", "hard", "Your face is on a card in my pocket. Want to see it?"),
  ("antagonize", None, "hard", "Keep walking. I'm not working. Yet."),
  ("antagonize", "violence", "hard", "You shot up my sector. That's personal now."),
  ("fear", "violence", "tense", "Don't. Don't even think it. There's two more of us across the street.")],
 "service": [
  ("greet_known", None, "friendly", "Morning, Mr. Regular. The usual? You don't have a usual."),
  ("greet_known", "helped", "warm", "You carried my bags up four floors. Shine's free today."),
  ("greet_known", "robbed", "cold", "Not you. Not in here. I'll call the manager."),
  ("antagonize", None, "annoyed", "Line's back there. Like everybody else."),
  ("fear", "violence", "scared", "Take the register! Take it! I'm just the help!")],
 "shopper": [
  ("greet_known", None, "chatty", "Oh, you're always on Thirty-Fourth. Do you live at Lacy's?"),
  ("greet_known", "helped", "grateful", "You got my bags back! My husband didn't believe me!"),
  ("greet_known", "robbed", "angry", "Thief! That's the thief! Somebody call a policeman!"),
  ("antagonize", None, "indignant", "Do you mind? I was here first. I've been here since ten."),
  ("antagonize", "violence", "cold", "Animal. They should lock you in the zoo with the others."),
  ("fear", "violence", "scared", "Oh my God. Oh my God. Not here. I came for towels."),
  ("fear", None, "scared", "Here, take my bag! There's nothing in it but receipts!")],
 "sro": [
  ("greet_known", None, "easy", "Evening, neighbour. Elevator's out again. Course it is."),
  ("greet_known", "helped", "grateful", "You brought my pills up from the drugstore. God bless you."),
  ("greet_known", "robbed", "cold", "Lock your door. That one's back. You know which one."),
  ("antagonize", None, "grumbling", "Quiet in the hall! Some of us sleep days!"),
  ("antagonize", "violence", "bitter", "You brought guns into this building. Where we live. Shame on you."),
  ("fear", "violence", "scared", "Please, not the hallway. My door don't even lock right."),
  ("fear", None, "scared", "I got nothing. Check. Nothing. Look, it's a hot plate.")],
 "street_tough": [
  ("greet_known", None, "cocky", "Look who's back on our corner. You paying rent now?"),
  ("greet_known", "helped", "grudging", "You helped Manny out. Fine. You walk through. Once."),
  ("antagonize", None, "menacing", "Wrong block, friend. Turn around while you still got legs."),
  ("antagonize", "violence", "menacing", "You shot at my boys. You're a dead man on Ninth."),
  ("fear", "violence", "scared", "Whoa, whoa! No piece, no piece! We was just talking!")],
 "strip": [
  ("greet_known", None, "dry", "You again, sugar. Looking or just looking?"),
  ("greet_known", "helped", "warm", "You ran off that creep who hit Tina. Every girl on Eighth knows."),
  ("greet_known", "robbed", "cold", "You took from one of us. Eighth Avenue don't forget a face."),
  ("antagonize", None, "cold", "Walk on, mister. Nothing here for you tonight."),
  ("antagonize", "violence", "bitter", "Guns on our corner. Like we didn't have enough trouble."),
  ("fear", "violence", "scared", "Get behind the car! Everybody behind the car!"),
  ("fear", None, "scared", "I got eleven dollars and a bus token. Take 'em.")],
 "truck_driver": [
  ("greet_known", None, "gruff", "You again. You gonna help unload or just admire the truck?"),
  ("greet_known", "helped", "grateful", "You got my truck out of the jam on Ninth. Beer's on me."),
  ("greet_known", "robbed", "furious", "You hijacked my load! Off my dock before I get the bar!"),
  ("antagonize", None, "gruff", "Out of the loading zone! You ain't a truck!"),
  ("antagonize", "violence", "hard", "I got a tire iron and a bad memory for faces. Except yours."),
  ("fear", "violence", "scared", "Take the truck! Keys are in it! I just drive it!"),
  ("fear", None, "scared", "Easy, pal. It's dresses back there. Just dresses.")],
 "wholesaler": [
  ("greet_known", None, "shrewd", "My friend! For you, wholesale. For everybody else, also wholesale."),
  ("greet_known", "helped", "grateful", "You stopped the van thief. Pick a suitcase. Any suitcase."),
  ("greet_known", "robbed", "angry", "You! You walked off with a gross of zippers! A gross!"),
  ("antagonize", None, "annoyed", "To the trade only! Are you the trade? You're not the trade."),
  ("antagonize", "violence", "cold", "Since you shot up Broadway, insurance doubled. Thanks a lot."),
  ("fear", "violence", "scared", "Take what you want! It's all insured! Mostly insured!"),
  ("fear", None, "scared", "Please, please, it's a notions store. Buttons. Thread.")],
}


def apply():
    n = 0
    for pool, lines in M.items():
        f = B / f"{pool}.json"
        d = json.loads(f.read_text())
        d["lines"] = [l for l in d["lines"] if l["context"] not in ("greet_known", "antagonize", "fear", "cop_stop")]
        for c, rec, emo, txt in lines:
            assert len(txt) <= 90, txt
            l = {"context": c, "emotion": emo, "text": txt}
            if rec: l["recall"] = rec
            d["lines"].append(l); n += 1
        d["memoryNote"] = "greet_known/antagonize/fear (sim pedGreets 39af2cb). 'recall' = helped | robbed | violence; untagged lines are a familiar face."
        f.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n")
    print(n, "memory barks across", len(M), "pools")

# Player-side greet/antagonize (gameplay 8c27467). context = warm|plain (greet), first|again (antagonize); lead = teddy|delphine|nick.
PLAYER = {
 "barks.player_greet": [
  ("warm", "teddy", "easy", "Evening. Keep your nose clean."), ("warm", "teddy", "warm", "How's the family? Tell 'em Teddy says hello."),
  ("warm", "teddy", "easy", "Good to see you. Stay off the avenue tonight."),
  ("plain", "teddy", "flat", "Evening."), ("plain", "teddy", "flat", "How ya doing."), ("plain", "teddy", "dry", "Hot enough for you?"),
  ("warm", "delphine", "warm", "Hey, baby. You eating? You look thin."), ("warm", "delphine", "easy", "There you are. Tell your sister I said hi."),
  ("warm", "delphine", "dry", "You still owe me a coffee. I'm counting."),
  ("plain", "delphine", "cool", "Evening."), ("plain", "delphine", "cool", "Mm-hm. How you doing."), ("plain", "delphine", "dry", "Nice shoes. Keep 'em out of puddles."),
  ("warm", "nick", "expansive", "My friend! How's business? Good? Good!"), ("warm", "nick", "expansive", "You look well! Eat something, you look well but thin."),
  ("warm", "nick", "warm", "Ah, the neighbourhood. Best people in the city."),
  ("plain", "nick", "polite", "Good afternoon."), ("plain", "nick", "expansive", "A beautiful day! Terrible heat, beautiful day."), ("plain", "nick", "polite", "Hello, hello.")],
 "barks.player_antagonize": [
  ("first", "teddy", "hard", "You got a problem, pal? Because I'm listening."), ("first", "teddy", "dry", "Keep looking at me like that. See what happens."),
  ("first", "teddy", "hard", "Move. I won't ask twice."),
  ("again", "teddy", "hard", "I said move. You deaf or just stupid?"), ("again", "teddy", "cold", "Last chance. I used to be a cop. I remember how."),
  ("first", "delphine", "cold", "Something you want to say to my face, sugar?"), ("first", "delphine", "cool", "Keep walking. Rule two: I don't repeat myself."),
  ("first", "delphine", "cold", "You're in my way. That's a problem for one of us."),
  ("again", "delphine", "cold", "Still here? Huh. Brave or dumb. Let's find out."), ("again", "delphine", "hard", "I've got a razor and a bad week. Pick."),
  ("first", "nick", "haughty", "Do you know who I am? No? Good. Get out of my way."), ("first", "nick", "irritated", "You're blocking a man with a schedule."),
  ("first", "nick", "haughty", "Watch the suit. This suit is worth your month."),
  ("again", "nick", "furious", "Again? In Kastoria we'd settle this behind the church."), ("again", "nick", "furious", "I have lawyers. I have cousins. Which one do you want?")],
}


def apply_player():
    for pid, rows in PLAYER.items():
        for r in rows: assert len(r[3]) <= 90, r
        (B / f"{pid.split('.', 1)[1]}.json").write_text(json.dumps({"id": pid, "core": False,
            "note": "Player greet/antagonize/apologise (gameplay 8c27467, 0a9c708). context: warm|plain (greet), first|again (antagonize), shove|fight (apologise); 'lead' picks the voice. Adults only.",
            "lines": [{"context": c, "lead": ld, "emotion": e, "text": t} for c, ld, e, t in rows]}, ensure_ascii=False, indent=2) + "\n")
    print(sum(len(v) for v in PLAYER.values()), "player greet/antagonize lines")

# Apology beat (gameplay 0a9c708): player context shove|fight; ped accept_apology (grudging) / reject_apology (contemptuous).
PLAYER["barks.player_apologise"] = [
 ("shove", "teddy", "tired", "Okay. Okay. My fault. Long night."), ("shove", "teddy", "flat", "Forget it, pal. I'm out of line."),
 ("fight", "teddy", "breathless", "Hold it, hold it. I'm done. We're done."),
 ("shove", "delphine", "cool", "Fine. My mistake. Rule six: know when to walk."), ("shove", "delphine", "dry", "Alright. I'm sorry. Don't make it a speech."),
 ("fight", "delphine", "breathless", "Enough. I'm not doing this on Eighth Avenue. Sorry."),
 ("shove", "nick", "stiff", "I apologise. Sincerely. I am a gentleman, mostly."), ("shove", "nick", "tired", "Forgive me. It's the heat. And the bank."),
 ("fight", "nick", "breathless", "Stop! Stop. I'm sorry. My heart. My suit. I'm sorry.")]
APOLOGY = {
 "beat_cop": ("Alright. Go home and cool off.", "Sorry don't cover it. Next time it's the wagon."),
 "cab_driver": ("Forget it. Everybody's crazy in July.", "Sorry? Tell it to my fender."),
 "cab_fare": ("Fine. Just let me get my cab.", "Save it. I'm calling a policeman."),
 "commuter": ("Fine. I've got a train anyway.", "Sorry. Sure. Get out of my way."),
 "deuce": ("Cool, cool. No harm done. This time.", "Sorry's for church, man. Beat it."),
 "garment": ("Yeah, yeah. Go push your own rack.", "Sorry? You owe me a dress. Two dresses."),
 "marcher": ("Alright. We're all tired. Walk with us.", "Sorry doesn't build anything. Move."),
 "neighbor": ("Okay, okay. Go eat something.", "Sorry. On my stoop. Unbelievable."),
 "office": ("Apology accepted. Please just go.", "I'm reporting this to building security."),
 "park": ("Sit down, friend. The bench forgives.", "Go apologise to the pigeons."),
 "plainclothes": ("Smart. Stay smart.", "You'll be sorry. That's a promise."),
 "service": ("No problem. Have a nice day. I mean it, mostly.", "Sorry. Right. Next customer, please."),
 "shopper": ("Well. Alright. Manners cost nothing, you know.", "Hmph. Your mother would be ashamed."),
 "sro": ("Alright. We all got our troubles.", "Sorry. Like I ain't heard sorry before."),
 "street_tough": ("Smart move. Walk on.", "Too late for sorry, chief."),
 "strip": ("Sure, honey. Walk it off.", "Save your sorry for somebody who's buying."),
 "truck_driver": ("Forget it. Just stay off my dock.", "Sorry? You'll be sorry. Get out of here."),
 "wholesaler": ("Fine, fine. No charge for the apology.", "Sorry? Sorry I'm not paying for."),
}
PASSERBY = {"id": "barks.passerby", "core": False,
 "note": "Fallback pool for peds gameplay owns mid-fight (sim no longer lists them). Generic adult Midtown passer-by, 1974.",
 "lines": [
  {"context": "accept_apology", "emotion": "grudging", "text": "Alright. Forget it. It's too hot to fight."},
  {"context": "accept_apology", "emotion": "grudging", "text": "Yeah, okay. Just watch where you're going."},
  {"context": "reject_apology", "emotion": "contemptuous", "text": "Sorry? Get lost before I call a cop."},
  {"context": "reject_apology", "emotion": "contemptuous", "text": "Save it. I know your type."},
  {"context": "antagonize", "emotion": "angry", "text": "What's your problem, huh? What's your problem?"},
  {"context": "fear", "emotion": "scared", "text": "I don't want trouble! Please, I don't want trouble!"},
  {"context": "greet", "emotion": "neutral", "text": "Evening."},
  {"context": "greet_known", "emotion": "easy", "text": "Hey, you again. How's it going?"}]}


def apply_apology():
    for pool, (acc, rej) in APOLOGY.items():
        f = B / f"{pool}.json"; d = json.loads(f.read_text())
        d["lines"] = [l for l in d["lines"] if l["context"] not in ("accept_apology", "reject_apology")]
        for c, e, t in (("accept_apology", "grudging", acc), ("reject_apology", "contemptuous", rej)):
            assert len(t) <= 90, t
            d["lines"].append({"context": c, "emotion": e, "text": t})
        f.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n")
    (B / "passerby.json").write_text(json.dumps(PASSERBY, ensure_ascii=False, indent=2) + "\n")
    print(len(APOLOGY) * 2 + len(PASSERBY["lines"]), "apology/passerby lines")


if __name__ == "__main__":
    apply()
    apply_player()
    apply_apology()
