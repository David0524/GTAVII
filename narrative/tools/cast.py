#!/usr/bin/env python3
"""Validate content/cast/*.json against the brief, then render narrative/N2_CAST.md.

Usage:  python3 narrative/tools/cast.py          # validate and render
        python3 narrative/tools/cast.py --check  # validate only (exit 1 on errors)

Narrative-team tooling (not engine code). Uses the standard library only.
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CAST = ROOT / "content" / "cast"
PLACES = ROOT / "content" / "places.json"
OUT = ROOT / "narrative" / "N2_CAST.md"
STORY_YEAR = 1974
MAX_LINE = 90
MISSIONS = range(1, 33)
ID_RE = re.compile(r"^char\.[a-z0-9_]+$")
HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
ACTIVITIES = {"sleep", "home", "work", "eat", "drink", "errand", "socialize", "commute", "drive", "loiter"}
TIER_LIMITS = {"lead": (3, 3), "principal": (8, 14), "secondary": (20, 40)}
REQUIRED = ["id", "tier", "name", "age", "born", "origin", "occupation", "want", "need", "secret",
            "speech", "home", "haunts", "schedule", "edges", "arc", "visual", "missions"]


def load():
    chars = []
    for f in sorted(CAST.glob("*.json")):
        for c in json.loads(f.read_text()):
            c["_file"] = f.name
            chars.append(c)
    places = {p["id"]: p for p in json.loads(PLACES.read_text())["places"]}
    return chars, places


def minutes(t):
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def check_at(at, places):
    if at == "off_map":
        return None
    if at.startswith("loc."):
        return None if at in places else f"unknown place id {at}"
    if "&" in at or re.search(r"\b(St|Ave|Broadway)\b", at):
        return None
    return f"location '{at}' is not a loc id, intersection or address"


def validate(chars, places):
    errs, warns = [], []
    ids = {}
    for c in chars:
        cid = c.get("id", "?")
        for k in REQUIRED:
            if k not in c:
                errs.append(f"{cid}: missing field '{k}'")
        if not ID_RE.match(cid):
            errs.append(f"{cid}: id must be char.snake_case")
        if cid in ids:
            errs.append(f"{cid}: duplicate id")
        ids[cid] = c
    by_tier = {}
    for c in chars:
        by_tier.setdefault(c.get("tier"), []).append(c)
    for tier, (lo, hi) in TIER_LIMITS.items():
        n = len(by_tier.get(tier, []))
        if not lo <= n <= hi:
            errs.append(f"tier '{tier}' has {n} characters; brief asks for {lo}-{hi}")
    for c in chars:
        cid = c["id"]
        if STORY_YEAR - c["born"] not in (c["age"], c["age"] + 1):
            errs.append(f"{cid}: born {c['born']} doesn't fit age {c['age']} in {STORY_YEAR}")
        sp = c["speech"]
        if len(sp.get("samples", [])) != 3:
            errs.append(f"{cid}: needs exactly 3 sample lines")
        for s in sp.get("samples", []):
            if len(s) > MAX_LINE:
                errs.append(f"{cid}: sample over {MAX_LINE} chars ({len(s)}): {s}")
        for loc in [c["home"]] + [h["at"] for h in c["haunts"]]:
            e = check_at(loc, places)
            if e:
                errs.append(f"{cid}: {e}")
        # schedule: contiguous circular cover of 24h
        sched = c["schedule"]
        total = 0
        for i, s in enumerate(sched):
            if not (TIME_RE.match(s["from"]) and TIME_RE.match(s["to"])):
                errs.append(f"{cid}: bad time in schedule entry {i}")
                continue
            if s["activity"] not in ACTIVITIES:
                errs.append(f"{cid}: unknown activity '{s['activity']}'")
            e = check_at(s["at"], places)
            if e:
                errs.append(f"{cid}: schedule {e}")
            total += (minutes(s["to"]) - minutes(s["from"])) % 1440
            nxt = sched[(i + 1) % len(sched)]
            if s["to"] != nxt["from"]:
                errs.append(f"{cid}: schedule gap/overlap {s['to']} -> {nxt['from']}")
        if total != 1440:
            errs.append(f"{cid}: schedule covers {total} min, not 1440")
        for e in c["edges"]:
            if e["to"] not in ids:
                errs.append(f"{cid}: edge to unknown {e['to']}")
            if e["to"] == cid:
                errs.append(f"{cid}: edge to self")
            if not -3 <= e["weight"] <= 3:
                errs.append(f"{cid}: edge weight out of -3..3")
        for col in c["visual"]["palette"]:
            if not HEX_RE.match(col):
                errs.append(f"{cid}: bad palette colour {col}")
        for m in c["missions"]:
            if m not in MISSIONS:
                errs.append(f"{cid}: mission {m} outside 1-32")
        if not c["edges"]:
            warns.append(f"{cid}: no relationship edges")
    # every character should be connected to someone (in- or out-edge)
    linked = {e["to"] for c in chars for e in c["edges"]} | {c["id"] for c in chars if c["edges"]}
    for cid in ids:
        if cid not in linked:
            warns.append(f"{cid}: isolated in the relationship graph")
    # each lead should be reachable from each other lead via edges (convergence)
    return errs, warns


def label(at, places):
    if at == "off_map":
        return "off map"
    if at in places:
        p = places[at]
        loc = p["at"] + (f" ({p['between'][0]}–{p['between'][1]})" if "between" in p else "")
        return f"{p['name']}, {loc}"
    return at


def render(chars, places):
    ids = {c["id"]: c for c in chars}
    nm = lambda i: ids[i]["name"] if i in ids else i
    L = []
    w = L.append
    w("# Tenderloin '74: Cast (Phase N2)")
    w("")
    w("> **Generated file. Don't edit by hand.** The source of truth is `content/cast/*.json` (with")
    w("> `content/places.json`). Regenerate with `python3 narrative/tools/cast.py`, which also")
    w("> validates sample-line length (90 characters or fewer), 24-hour schedules, ids, places,")
    w("> relationship edges and tier counts.")
    w("")
    tiers = [("lead", "Leads (playable)"), ("principal", "Principal characters"), ("secondary", "Secondary characters")]
    w("## Roster")
    for t, title in tiers:
        group = [c for c in chars if c["tier"] == t]
        w("")
        w(f"### {title} ({len(group)})")
        w("")
        w("| Id | Name | Age | Occupation | Home | Missions |")
        w("|---|---|---|---|---|---|")
        for c in group:
            occ = c["occupation"].split(";")[0]
            w(f"| `{c['id']}` | {c['name']} | {c['age']} | {occ} | {label(c['home'], places)} | {', '.join(map(str, c['missions']))} |")
    w("")
    w("## Relationship edges")
    w("")
    w("Weights run from −3 (hostile) to +3 (devoted), from the first character's point of view. They seed")
    w("`relationships` in save state for the leads. P4 (“Owed, not owned”) moves them.")
    w("")
    w("| From | Kind | To | Weight | Note |")
    w("|---|---|---|---|---|")
    for c in chars:
        for e in c["edges"]:
            w(f"| {c['name']} | {e['kind'].replace('_', ' ')} | {nm(e['to'])} | {e['weight']:+d} | {e.get('note', '')} |")
    for t, title in tiers:
        w("")
        w(f"## {title}")
        for c in [c for c in chars if c["tier"] == t]:
            w("")
            w(f"### {c['name']}  `{c['id']}`")
            w("")
            w(f"- **Age:** {c['age']} (born {c['born']}) · **Origin:** {c['origin']}")
            w(f"- **Occupation:** {c['occupation']}")
            w(f"- **Want:** {c['want']}")
            w(f"- **Need:** {c['need']}")
            w(f"- **Secret:** {c['secret']}")
            w(f"- **Speech:** {c['speech']['pattern']}")
            for s in c["speech"]["samples"]:
                w(f"  - “{s}”")
            w(f"- **Home:** {label(c['home'], places)}")
            w("- **Haunts:** " + "; ".join(f"{label(h['at'], places)} ({h['why']})" for h in c["haunts"]))
            w("- **Daily schedule (weekday):**")
            for s in c["schedule"]:
                note = f" — {s['note']}" if s.get("note") else ""
                w(f"  - {s['from']}–{s['to']} · {s['activity']} · {label(s['at'], places)}{note}")
            w("- **Relationships:** " + "; ".join(
                f"{nm(e['to'])} ({e['kind'].replace('_', ' ')}, {e['weight']:+d})" for e in c["edges"]))
            arc = c["arc"]
            if isinstance(arc, dict):
                w("- **Arc:**")
                for k in ("act1", "act2", "act3"):
                    w(f"  - *Act {k[-1]}:* {arc[k]}")
            else:
                w(f"- **Arc:** {arc}")
            v = c["visual"]
            w(f"- **Visual:** palette {' '.join('`' + p + '`' for p in v['palette'])}. *Silhouette:* {v['silhouette']}")
            w(f"  *Wardrobe:* {v['wardrobe']} *Props:* {', '.join(v['props'])}.")
            w(f"- **Missions:** {', '.join(map(str, c['missions']))}")
    w("")
    return "\n".join(L)


def main():
    chars, places = load()
    errs, warns = validate(chars, places)
    for x in warns:
        print("WARN ", x)
    for x in errs:
        print("ERROR", x)
    counts = {t: sum(c["tier"] == t for c in chars) for t in TIER_LIMITS}
    print(f"{len(chars)} characters {counts}; {sum(len(c['edges']) for c in chars)} edges; "
          f"{len(errs)} errors, {len(warns)} warnings")
    if errs:
        sys.exit(1)
    if "--check" not in sys.argv:
        OUT.write_text(render(chars, places))
        print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
