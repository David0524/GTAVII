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
