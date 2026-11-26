#!/usr/bin/env bash
# Reports new/changed ENGINE_REQUESTS.md on every remote branch since the last run.
# State (last seen blob per branch) lives in .git/t74-requests-seen, so it is local and never committed.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
STATE=.git/t74-requests-seen; touch "$STATE"
git fetch -q --prune origin
changed=0
for b in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin | grep -v '/HEAD$'); do
  blob=$(git rev-parse -q --verify "$b:ENGINE_REQUESTS.md" 2>/dev/null || true)
  [ -z "$blob" ] && continue
  prev=$(grep "^$b " "$STATE" | awk '{print $2}' || true)
  if [ "$blob" != "$prev" ]; then
    changed=1
    echo "=== $b  ($(git log -1 --format='%h %cr: %s' "$b" -- ENGINE_REQUESTS.md))"
    if [ -n "$prev" ]; then git diff --no-color "$prev" "$blob" | sed -n '5,400p'; else git show "$blob"; fi
    grep -v "^$b " "$STATE" > "$STATE.tmp" || true; echo "$b $blob" >> "$STATE.tmp"; mv "$STATE.tmp" "$STATE"
  fi
done
[ "$changed" = 0 ] && echo "No new engine requests."
exit 0
