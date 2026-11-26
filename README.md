# Tenderloin '74

A browser open-world engine and city set in Manhattan's Tenderloin in summer 1974. It's built
with Three.js (WebGPU, falling back to WebGL2) from real NYC open data and OpenStreetMap. It
runs on desktop, and on phones and tablets in landscape.

```bash
npm install
npm run dev               # http://localhost:5173 ; ?quality=low|medium|high|ultra ?webgl=1 ?touch=1
npm run data              # re-fetch raw data + rebuild public/data (already committed)
npm run build && npm run shots -- --phase phase1 --webgl   # headless screenshots + frame times
```

Controls:
- **Desktop:** WASD moves, Q/E go down/up, Shift is fast, the wheel changes speed, click to
  mouse-look, F3 toggles the HUD.
- **Touch (landscape):** the left thumb is the move stick, the right thumb drags to look, and
  there are buttons on the right edge.

- `PROGRESS.md` covers status, decisions and known issues.
- `DATA_SOURCES.md` covers sources, licenses and the 1974 corrections.
- `NARRATIVE_BRIEF.md` is the brief for the story team.

Map data © OpenStreetMap contributors (ODbL). It includes NYC Open Data.
