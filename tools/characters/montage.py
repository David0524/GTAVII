"""Lineup vs. reference photos montage (for the CHARACTERS_BRIEF "Done means" comparison).
    python3 tools/characters/montage.py
Reference photos are public domain (US National Archives DOCUMERICA); ids are printed on the image.
"""
from PIL import Image, ImageDraw
import json, os

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
cat = {c['id']: c for c in json.load(open(os.path.join(ROOT, 'references/catalog.json')))}
SETS = {
    '01_lineup_a.png': ['documerica_551651', 'documerica_548399', 'documerica_554312'],
    '02_lineup_b.png': ['documerica_551646', 'documerica_549855', 'documerica_551658'],
}
for shot, refs in SETS.items():
    lineup = Image.open(os.path.join(ROOT, 'shots/characters', shot)).convert('RGB')
    w, h = lineup.size
    lineup = lineup.crop((0, int(h * 0.22), w, int(h * 0.78)))
    row_h = 420
    photos = []
    for rid in refs:
        im = Image.open(os.path.join(ROOT, 'references', cat[rid]['file'])).convert('RGB')
        photos.append(im.resize((int(im.width * row_h / im.height), row_h)))
    row_w = sum(p.width for p in photos) + 10 * (len(photos) - 1)
    W = max(lineup.width, row_w)
    out = Image.new('RGB', (W, lineup.height + row_h + 70), (18, 16, 15))
    out.paste(lineup, ((W - lineup.width) // 2, 0))
    x = (W - row_w) // 2
    d = ImageDraw.Draw(out)
    for rid, p in zip(refs, photos):
        out.paste(p, (x, lineup.height + 10))
        c = cat[rid]
        d.text((x + 4, lineup.height + row_h + 16), f"{rid.split('_')[1]} · {c['date']} · public domain, US National Archives (DOCUMERICA)", fill=(220, 210, 190))
        x += p.width + 10
    d.text((10, lineup.height + row_h + 44), 'Top: generated pedestrians (seeded, ?characters=1&scene=lineup). Bottom: period reference photos the wardrobe tables came from (docs/WARDROBE_1974.md).', fill=(200, 190, 170))
    name = os.path.join(ROOT, 'shots/characters', shot.replace('.png', '_vs_refs.png'))
    out.save(name)
    print('wrote', name, out.size)
