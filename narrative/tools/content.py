#!/usr/bin/env python3
"""Validate narrative content (missions, dialogue, triggers, spawns, interiors, flags) against
the brief's rules and against each other, then render content/FLAGS.md.

Usage:  python3 narrative/tools/content.py          # validate + render FLAGS.md
        python3 narrative/tools/content.py --check  # validate only

Errors are rule breaks (text too long, unknown ids, undocumented flags). Warnings are known
gaps (for example dialogue scripts not written until N5). Standard library only.
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
C = ROOT / "content"
OBJ_TEXT_MAX, LINE_MAX, CHOICE_MAX, CHOICES_MAX = 40, 90, 40, 4
OBJ_TYPES = {"goto", "enter_vehicle", "deliver", "follow", "enter_interior", "photo", "wait", "dialogue",
             "escort", "switch_to", "evade"}  # brief contract + accepted engine responses (N4, N5) + request 8
FAIL_TYPES = {"target_lost", "vehicle_destroyed", "timer", "spotted", "caught"}
LEADS = {"char.teddy_arce", "char.delphine_moore", "char.nick_varelas"}
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
WEATHER = {"any", "clear", "overcast", "rain"}


def jl(p):
    return json.loads(p.read_text())


def load():
    cast = {c["id"]: c for f in (C / "cast").glob("*.json") for c in jl(f)}
    places = {p["id"]: p for p in jl(C / "places.json")["places"]}
    flags = {f["id"]: f for f in jl(C / "flags.json")["flags"]}
    missions = {m["id"]: m for m in (jl(f) for f in sorted((C / "missions").glob("*.json")))}
    dialogue = {d["id"]: d for d in (jl(f) for f in sorted((C / "dialogue").glob("*.json")))}
    triggers = {t["id"]: t for t in (jl(f) for f in sorted((C / "triggers").glob("*.json")))}
    spawns = {s["id"]: s for s in jl(C / "spawns.json")["spawns"]}
    interiors = {i["id"]: i for i in jl(C / "interiors.json")["interiors"]}
    planned = dict(re.findall(r"^\|\s*(\d+)\s*\|\s*(mission\.[a-z0-9_]+)\s*\|", (ROOT / "narrative" / "N3_STRUCTURE.md").read_text(), re.M))
    planned = {v: int(k) for k, v in planned.items()}
    return cast, places, flags, missions, dialogue, triggers, spawns, interiors, planned


def main():
    cast, places, flags, missions, dialogue, triggers, spawns, interiors, planned = load()
    errs, warns = [], []
    E, W = errs.append, warns.append

    def loc_ok(where, at):
        if at.startswith("loc."):
            if at not in places: E(f"{where}: unknown place {at}")
        elif at.startswith("interior."):
            if at not in interiors: E(f"{where}: unknown interior {at}")
        elif at.startswith("char."):
            if at not in cast: E(f"{where}: unknown character {at}")
        elif not ("&" in at or re.search(r"\b(St|Ave|Broadway)\b", at)):
            E(f"{where}: '{at}' is not a place id, interior or intersection")

    def flag_ok(where, f):
        if f not in flags: E(f"{where}: flag {f} not documented in content/flags.json")

    def rel_ok(where, rels):
        for k, v in (rels or {}).items():
            a, _, b = k.partition("/")
            if a not in LEADS: E(f"{where}: relationship key '{k}' must start with a lead id")
            if b not in cast: E(f"{where}: relationship target {b} unknown")
            if not -3 <= v <= 3: E(f"{where}: relationship delta {v} outside -3..3")

    # missions
    for mid, m in missions.items():
        w = mid
        if mid not in planned: E(f"{w}: not in the N3 mission chain")
        elif planned[mid] != m.get("number"): E(f"{w}: number {m.get('number')} != N3 #{planned[mid]}")
        if m.get("playAs") not in LEADS: E(f"{w}: playAs must be a lead")
        if not 8 <= m.get("durationMin", 0) <= 20: E(f"{w}: durationMin outside 8-20")
        if len(m.get("pillars", [])) < 2: E(f"{w}: must serve at least two pillars")
        if not m.get("mobile"): E(f"{w}: missing mobile note")
        rq = m["requires"]
        for f in rq.get("flags", []) + rq.get("notFlags", []): flag_ok(w, f)
        tw = rq.get("timeWindow")
        if tw and not all(TIME_RE.match(t) for t in tw): E(f"{w}: bad timeWindow")
        for x in rq.get("weather", []):
            if x not in WEATHER: E(f"{w}: unknown weather {x}")
        if m.get("giver") and m["giver"] not in cast: E(f"{w}: giver unknown")
        st = m["start"]
        if st.get("who") and st["who"] not in cast: E(f"{w}: start.who unknown")
        if st.get("at"): loc_ok(w + " start", st["at"])
        if st.get("marker") and st["marker"] not in interiors: E(f"{w}: start marker unknown")
        if st.get("spawn") and st["spawn"] not in spawns: E(f"{w}: start spawn unknown")
        ids = [o["id"] for o in m["objectives"]]
        if len(ids) != len(set(ids)): E(f"{w}: duplicate objective ids")
        for mdone in rq.get("missionsDone", []):
            if mdone not in planned: E(f"{w}: requires.missionsDone unknown {mdone}")
        for o in m["objectives"]:
            ow = f"{w}.{o['id']}"
            if o.get("if"): flag_ok(ow + " if", o["if"].lstrip("!"))
            for f in o.get("onComplete", {}).get("setFlags", []): flag_ok(ow + " onComplete", f)
            rel_ok(ow, o.get("onComplete", {}).get("relationships"))
            if o["type"] not in OBJ_TYPES: E(f"{ow}: unknown objective type {o['type']}")
            t = o.get("text", "")
            if not t: E(f"{ow}: missing objective text")
            if len(t) > OBJ_TEXT_MAX: E(f"{ow}: objective text {len(t)} chars > {OBJ_TEXT_MAX}: {t}")
            for k in ("to", "at"):
                if isinstance(o.get(k), str): loc_ok(ow, o[k])
            for r in o.get("route", []): loc_ok(ow, r)
            for k in ("who", "target", "subject", "with", "character"):
                v = o.get(k)
                if v and v.startswith("char.") and v not in cast: E(f"{ow}: {k} {v} unknown")
            if o.get("marker") and o["marker"] not in interiors: E(f"{ow}: interior {o['marker']} unknown")
            for z in o.get("safeZones", []): loc_ok(ow, z)
            scripts = ([o["script"]] if o.get("script") else []) + o.get("dialogue", [])
            for s in scripts:
                if s not in dialogue: W(f"{ow}: dialogue {s} not written yet (N5)")
        for cp in m.get("checkpoints", []) + m.get("switchPoints", []):
            if cp not in ids: E(f"{w}: checkpoint/switchPoint {cp} not an objective")
        if m.get("durationMin", 0) > 12 and len(m.get("checkpoints", [])) < 3:
            E(f"{w}: missions over 12 min need 3+ checkpoints (mobile rule)")
        if len(m.get("checkpoints", [])) < max(1, -(-m.get("durationMin", 0) // 5) - 1):
            E(f"{w}: fewer checkpoints than one per 5 minutes")
        for f in m.get("fail", []):
            if f["type"] not in FAIL_TYPES: E(f"{w}: unknown fail type {f['type']}")
        rw = m["rewards"]
        for f in rw.get("setFlags", []): flag_ok(w, f)
        for u in rw.get("unlock", []):
            if u.startswith("mission.") and u not in planned: E(f"{w}: unlocks unknown mission {u}")
        rel_ok(w, rw.get("relationships"))
        for n in m.get("npcs", []):
            if n not in cast: E(f"{w}: npc {n} unknown")
        for t in m.get("triggers", []):
            if t not in triggers: E(f"{w}: trigger {t} unknown")
        for l in m.get("locations", []): loc_ok(w + " locations", l)
    # chain integrity: every written mission (except #1) is unlocked by its predecessor if written
    by_num = {m["number"]: m for m in missions.values()}
    for n, m in by_num.items():
        unlocked_by = [x for x in missions.values() if m["id"] in x["rewards"].get("unlock", [])]
        if n > 1 and not unlocked_by:
            W(f"{m['id']}: not unlocked by any written mission")

    # dialogue
    for did, d in dialogue.items():
        lids = {l["id"] for l in d["lines"]}
        for l in d["lines"]:
            lw = f"{did}.{l['id']}"
            if "choices" in l:
                if len(l["choices"]) > CHOICES_MAX: E(f"{lw}: more than {CHOICES_MAX} choices")
                for c in l["choices"]:
                    if len(c["text"]) > CHOICE_MAX: E(f"{lw}: choice over {CHOICE_MAX} chars: {c['text']}")
                    if c.get("goto") and c["goto"] not in lids: E(f"{lw}: choice goto {c['goto']} missing")
                    for f in c.get("setFlags", []): flag_ok(lw, f)
                    rel_ok(lw, c.get("setRelationships"))
                if l.get("timeoutSec", 99) < 6: E(f"{lw}: timed choice under 6 s")
                continue
            if len(l.get("text", "")) > LINE_MAX: E(f"{lw}: line {len(l['text'])} chars > {LINE_MAX}")
            sp = l.get("speaker", "")
            if sp.startswith("char.") and sp not in cast: E(f"{lw}: speaker {sp} unknown")
            elif not (sp.startswith("char.") or sp.startswith("npc.")): E(f"{lw}: speaker must be char.* or npc.*")
            if l.get("goto") and l["goto"] not in lids: E(f"{lw}: goto {l['goto']} missing")
            if l.get("if") and l["if"].lstrip("!") not in flags: E(f"{lw}: condition flag {l['if']} undocumented")
            for f in l.get("setFlags", []): flag_ok(lw, f)

    # triggers
    for tid, t in triggers.items():
        loc_ok(tid, t["volume"]["at"])
        for f in t.get("when", {}).get("flags", []): flag_ok(tid, f)
        for a in t["do"]:
            if a.get("script") and a["script"] not in dialogue: E(f"{tid}: script {a['script']} missing")

    # flags: documented but never set by written content -> info only
    set_somewhere = {f for m in missions.values() for f in m["rewards"].get("setFlags", [])}
    set_somewhere |= {f for d in dialogue.values() for l in d["lines"] for c in l.get("choices", []) for f in c.get("setFlags", [])}

    for x in warns: print("WARN ", x)
    for x in errs: print("ERROR", x)
    print(f"{len(missions)}/{len(planned)} missions, {len(dialogue)} dialogue scripts, {len(triggers)} triggers, "
          f"{len(spawns)} spawns, {len(interiors)} interiors, {len(flags)} flags ({len(set_somewhere)} set by written content); "
          f"{len(errs)} errors, {len(warns)} warnings")
    if errs:
        sys.exit(1)
    if "--check" not in sys.argv:
        L = ["# FLAGS: narrative flag registry", "",
             "> Generated from `content/flags.json` by `narrative/tools/content.py`. Don't edit by hand.",
             "> The narrative team owns the `flag.` namespace (see NARRATIVE_BRIEF.md). Keep flags minimal.", "",
             "| Flag | Set by | Read by | What changes in the world | Notes |", "|---|---|---|---|---|"]
        for f in flags.values():
            L.append(f"| `{f['id']}` | {', '.join(f['setBy'])} | {', '.join(f['readBy'])} | {f['world']} | {f['notes']} |")
        (C / "FLAGS.md").write_text("\n".join(L) + "\n")
        print("wrote content/FLAGS.md")


if __name__ == "__main__":
    main()
