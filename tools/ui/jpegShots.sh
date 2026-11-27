#!/usr/bin/env bash
# Rigs write PNGs under shots/ (git-ignored). For commits, convert to JPEG: quality 85, at most 1600 px wide
# (oversight policy: about 300 KB each, only the shots a review needs).  tools/ui/jpegShots.sh [dir ...]
set -euo pipefail
for d in "${@:-shots}"; do
  find "$d" -name '*.png' | while read -r f; do
    convert "$f" -resize '1600x>' -quality 85 "${f%.png}.jpg"
  done
done
