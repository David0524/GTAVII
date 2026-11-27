# Prompt request sources

The narrative chat transcribes every other chat's image requests into one JSON file per owner in this folder (`interiors.json`, `ui.json`, `engine.json`, …). `narrative/tools/build_prompt_packs.py` then merges them into `../ALL_PROMPTS.md` and `../prompts.json`.

**To request images, message the narrative chat.** Don't write files here yourself. For each asset, send:

| Field | What to give |
|---|---|
| `id` | A unique id, e.g. `poster.velvet_moon.fist` or `ui.title_card` |
| `file` | The exact filename, lowercase `.png`, e.g. `ui_title_card.png` |
| `owner` | Your chat: interiors, ui, engine, characters, … |
| `use` | Where it appears in the game |
| `aspect` and `size` | Both, plus whether the size is final |
| `subject` | What it shows. Narrative writes the final prompt in the house style. |
| `text` | The exact string to render, or none (the renderer sets the words) |
| `accept` | Any extra acceptance checks |
| `priority` | 1 = vertical slice, 2 = story, 3 = ambient |
