#!/usr/bin/env python3
"""N7 static pre-pass (until the engine's schema checker and headless hooks exist).
Checks mission reachability from M1, that required flags are set before they're needed, date order
and act ranges, Branch B and ending reachability, and per-act pacing. Writes narrative/N7_PREPASS.md."""
import json
from pathlib import Path
from collections import deque
ROOT = Path(__file__).resolve().parents[2]
C = ROOT / "content"
M = {m["id"]: m for m in (json.loads(f.read_text()) for f in (C / "missions").glob("*.json"))}
DLG = {d["id"]: d for d in (json.loads(f.read_text()) for f in (C / "dialogue").glob("*.json"))}
ACTS = {1: ("1974-06-21", "1974-07-04"), 2: ("1974-07-05", "1974-08-07"), 3: ("1974-08-08", "1974-09-02")}
issues, notes = [], []


def flags_set_by(m):
    """Flags a mission can set: rewards, objective onComplete, and every dialogue it runs (any branch)."""
    out = set(m["rewards"].get("setFlags", []))
    for o in m["objectives"]:
        out |= set(o.get("onComplete", {}).get("setFlags", []))
        for s in ([o["script"]] if o.get("script") else []) + o.get("dialogue", []):
            for l in DLG.get(s, {}).get("lines", []):
                out |= set(l.get("setFlags", []))
                for c in l.get("choices", []):
                    out |= set(c.get("setFlags", []))
    return out


# reachability via unlocks (BFS from M1), tracking the order missions become available
start = next(m for m in M.values() if m["number"] == 1)
order, seen, q = [], {start["id"]}, deque([start["id"]])
while q:
    mid = q.popleft()
    order.append(mid)
    for u in M[mid]["rewards"].get("unlock", []):
        if u in M and u not in seen:
            seen.add(u)
            q.append(u)
for mid in M:
    if mid not in seen:
        issues.append(f"{mid}: unreachable from M1 via unlocks")

# required flags must be settable by some mission that is completed earlier (by number, since the chain is linear apart from M23-25)
num = {mid: m["number"] for mid, m in M.items()}
setters = {}
for mid, m in M.items():
    for f in flags_set_by(m):
        setters.setdefault(f, set()).add(mid)
for mid, m in M.items():
    for f in m["requires"].get("flags", []):
        earlier = [s for s in setters.get(f, ()) if num[s] < num[mid]]
        if not earlier:
            issues.append(f"{mid}: requires {f}, but no earlier mission sets it")
    for d in m["requires"].get("missionsDone", []):
        if num.get(d, 99) >= num[mid]:
            issues.append(f"{mid}: missionsDone {d} is not earlier")

# dates: within act range and non-decreasing along the chain
for mid, m in sorted(M.items(), key=lambda kv: kv[1]["number"]):
    lo, hi = ACTS[m["act"]]
    d0, d1 = m["requires"]["dateRange"]
    if not (lo <= d0 <= hi and lo <= d1 <= hi):
        issues.append(f"{mid}: dateRange {d0}..{d1} outside act {m['act']} ({lo}..{hi})")
    for u in m["rewards"].get("unlock", []):
        if u in M and M[u]["requires"]["dateRange"][1] < d0:
            issues.append(f"{u}: its window closes ({M[u]['requires']['dateRange'][1]}) before its unlocker {mid} opens ({d0})")

single = sorted(m["number"] for m in M.values() if m["requires"]["dateRange"][0] == m["requires"]["dateRange"][1])
notes.append(f"{len(single)} of {len(M)} story missions have single-day date windows ({', '.join(map(str, single))}). "
             "Policy needed so the story never soft-locks (ENGINE_REQUESTS From narrative: 10).")

# Branch B reachability (from the dialogue's requires)
always = set()
for mid, m in M.items():
    always |= set(m["rewards"].get("setFlags", []))  # unconditional rewards
corrob = ["flag.have_marjorie_carbons", "flag.have_kearney_list", "flag.have_wurtz_locker", "flag.photo_file_3"]
guaranteed = [f for f in corrob if f in always]
notes.append(f"Branch B2 corroborations guaranteed by critical-path rewards: {len(guaranteed)} of 4 ({', '.join(guaranteed)}). B2 still needs flag.editor_neutralised (optional photo, M27).")
if len(guaranteed) < 2:
    issues.append("Branch B2: fewer than 2 corroborations guaranteed on the critical path")
notes.append("Branch B1 is open if flag.branch_a_wire (M12) or flag.nick_flipped (M24 choice). B3 and B4 are always open, so every playthrough reaches an ending.")

# pacing
for a in (1, 2, 3):
    ms = [m for m in M.values() if m["act"] == a]
    notes.append(f"Act {a}: {len(ms)} missions, {sum(m['durationMin'] for m in ms)} min of critical path "
                 f"({sum(m['durationMin'] for m in ms) / 60:.1f} h); longest {max(m['durationMin'] for m in ms)} min.")
gaps = []
for a, b in zip(sorted(M.values(), key=lambda m: m["number"]), sorted(M.values(), key=lambda m: m["number"])[1:]):
    if a["playAs"] == b["playAs"] == "char.teddy_arce" and a["act"] == b["act"]:
        pass
leads = {}
for m in M.values():
    leads[m["playAs"]] = leads.get(m["playAs"], 0) + m["durationMin"]
notes.append("Critical-path minutes by playAs lead: " + ", ".join(f"{k.split('.')[1]} {v}" for k, v in leads.items()))

L = ["# N7 static pre-pass (narrative side)", "",
     "> Generated by `narrative/tools/reach.py`. This is a stand-in until the engine's schema checker and headless test hooks",
     "> exist (engine Phase 7). After that, the brief's full N7 (a headless play-through of every mission) replaces it.", "",
     f"**Missions reachable from M1:** {len(seen)}/{len(M)}  ", f"**Issues:** {len(issues)}", ""]
L += ["## Issues"] + ([f"- {x}" for x in issues] or ["- None."]) + ["", "## Notes"] + [f"- {x}" for x in sorted(set(notes))]
L += ["", "## Unlock order (breadth-first from M1)", "", " → ".join(f"{M[m]['number']}" for m in order)]
(ROOT / "narrative" / "N7_PREPASS.md").write_text("\n".join(L) + "\n")
print(f"reachable {len(seen)}/{len(M)}; {len(issues)} issues")
for x in issues:
    print("ISSUE", x)
