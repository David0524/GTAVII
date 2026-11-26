"""Mission conventions (user, verbatim: "Fully lethal everywhere"; "No you can kill cops during missions.
That's normal. Consider how GTA handles these things"). Applied by both mission builders before writing.
- Cops are ordinary killable targets: killing one feeds heat; it is never a fail state or a story branch.
- Characters the mission needs alive are `essential` (fail with a reason shown), never invulnerable.
- Objectives that need the player clear of police carry requireNoHeat (the engine inserts "Lose the police").
- Fail only for the standard reasons."""
LEADS = {"char.teddy_arce", "char.delphine_moore", "char.nick_varelas"}
STANDARD_FAILS = [
    {"type": "player_down", "note": "Wasted: retry from checkpoint (hospital flow, Gameplay)."},
    {"type": "busted", "note": "Arrested: retry from checkpoint (booking flow, Gameplay)."},
    {"type": "essential_died", "note": "Shown as '<Name> died'. Retry from checkpoint; offer a skip after repeated failures."}]
SAFE_KINDS = ("interior.corwin", "interior.arden", "interior.penn_south", "interior.varelas", "interior.carmen", "interior.hanyang", "interior.lisle")


EXTRA = {"mission.flip": ["char.augie_lomax"], "mission.the_address": ["char.carl_mayhew"]}


def _speakers(script):
    import json
    from pathlib import Path
    f = Path(__file__).resolve().parents[2] / "content" / "dialogue" / f"{script.split('.', 1)[1]}.json"
    if not f.exists():
        return set()
    return {l["speaker"] for l in json.loads(f.read_text())["lines"] if str(l.get("speaker", "")).startswith("char.")}


def apply(missions, dialogue_speakers=None):
    for m in missions:
        combat_idx = [i for i, o in enumerate(m["objectives"]) if o.get("type") in ("combat", "chase", "evade")]
        first_combat = combat_idx[0] if combat_idx else None
        ess = {}
        seen_combat = False
        for o in m["objectives"]:
            for k in ("who", "target", "protect", "character"):
                v = o.get(k)
                if isinstance(v, str) and v.startswith("char.") and v not in LEADS:
                    ess[v] = True
            for tg in o.get("targets", []):
                tg.pop("lethal", None)
                if tg.get("character") and tg["character"] not in LEADS:
                    ess[tg["character"]] = True
            o.pop("lethal", None)
            if o.get("type") == "combat":
                o["note"] = (o.get("note", "") + " Cops among the targets are ordinary killable police (heat only).").strip()
                seen_combat = True
            needs_clear = (o.get("type") == "deliver" or
                           (o.get("type") == "enter_interior" and str(o.get("marker", "")).startswith(SAFE_KINDS)) or
                           (o.get("type") == "dialogue" and seen_combat))
            if needs_clear:
                o["requireNoHeat"] = True
                if o.get("type") == "dialogue":
                    seen_combat = False
        if first_combat is not None:
            for o in m["objectives"][first_combat + 1:]:
                for sc in ([o["script"]] if o.get("script") else []) + o.get("dialogue", []):
                    for sp in _speakers(sc) - LEADS:
                        ess[sp] = True
        for c in EXTRA.get(m["id"], []):
            ess[c] = True
        m["essential"] = [{"character": c, "reason": "died"} for c in sorted(ess)]
        keep = [f for f in m.get("fail", []) if f["type"] not in ("player_down", "caught")]
        m["fail"] = keep + STANDARD_FAILS
        m["conventions"] = "FEATURE_AUDIT 'Mission conventions': cop kills feed heat only; 'Lose the police' gates on requireNoHeat objectives; fail only for standard reasons."
    return missions
