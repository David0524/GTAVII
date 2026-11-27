"""Delphine close-up board: the ICT head (front, three-quarter, profile, upper body), her previous
head for comparison, and public-domain 1973-74 DOCUMERICA street photos for era styling (hair,
dress). Not a likeness comparison: the face is a synthesised identity.
    python3 -I tools/characters/board_delphine.py <front> <34> <profile> <body> <previous> <out>
"""
import json, os, sys
from PIL import Image, ImageDraw
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
front, tq, prof, body, prev, out = sys.argv[1:7]
cat = {c['id']: c for c in json.load(open(os.path.join(ROOT, 'references/catalog.json')))}
H = 520
def fit(p, h=H):
    im = Image.open(p).convert('RGB'); return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
row1 = [fit(front), fit(tq), fit(prof)]
row2 = [fit(body), fit(prev)] + [fit(os.path.join(ROOT, 'references', cat[r]['file'])) for r in ('documerica_553822', 'documerica_551687')]
W = max(sum(i.width for i in row1), sum(i.width for i in row2)) + 30
b = Image.new('RGB', (W, 2 * H + 120), (18, 16, 15)); d = ImageDraw.Draw(b)
def paste(row, y, labels):
    x = 10
    for im, lab in zip(row, labels):
        b.paste(im, (x, y)); d.text((x + 6, y + H + 6), lab, fill=(225, 215, 195)); x += im.width + 5
paste(row1, 0, ['ICT head, front (key light from above right)', 'three-quarter', 'profile'])
paste(row2, H + 30, ['in the leads scene', 'before: her MakeHuman head', 'NARA 553822, Aug 1973 (era: hair, coats)', 'NARA 551687, Jun 1973 (era: dresses)'])
d.text((10, 2 * H + 90), "Delphine: synthesised ICT-FaceKit Light identity (MIT), procedural skin/eyes/lashes, skin lighting, coil-shell hair. References are public-domain DOCUMERICA (US National Archives).", fill=(200, 190, 170))
if b.width > 1600: b = b.resize((1600, round(b.height * 1600 / b.width)), Image.LANCZOS)
b.save(out, quality=85, optimize=True); print('wrote', out, b.size)
