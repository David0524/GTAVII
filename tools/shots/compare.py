"""Side-by-side composites of Phase 3 shots with their period reference frames + lookmetrics summary.
python3 tools/shots/compare.py shots/phase3"""
import os, subprocess, sys
from PIL import Image, ImageDraw
d = sys.argv[1]
REFS = {'A': 'documerica_554297', 'B': 'documerica_554293', 'C': 'documerica_549867', 'D': 'documerica_549869'}
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
for k, ref in REFS.items():
    shots = sorted(f for f in os.listdir(d) if f.startswith(k + '_') and f.endswith(('.png', '.jpg')))
    if not shots: continue
    refim = Image.open(os.path.join(root, 'references/img', ref + '.jpg')).convert('RGB')
    W, H = 640, 360
    sheet = Image.new('RGB', (W * 3, H * 2), 'black'); dr = ImageDraw.Draw(sheet)
    r = refim.copy(); r.thumbnail((W, H)); sheet.paste(r, (0, 0)); dr.text((6, 6), f'REF {k}: {ref} (DOCUMERICA, public domain)', fill='yellow')
    for i, f in enumerate(shots[:4]):
        im = Image.open(os.path.join(d, f)).convert('RGB'); im.thumbnail((W, H))
        x, y = ((i + 1) % 3) * W, ((i + 1) // 3) * H
        sheet.paste(im, (x, y)); dr.text((x + 6, y + 6), f, fill='yellow')
    sheet.save(os.path.join(d, f'compare_{k}.jpg'), quality=88)
pngs = sorted(os.path.join(d, f) for f in os.listdir(d) if f.endswith(('.png', '.jpg')))
out = subprocess.run([sys.executable, os.path.join(root, 'tools/refs/lookmetrics.py'), *pngs], capture_output=True, text=True).stdout
open(os.path.join(d, 'lookmetrics.txt'), 'w').write(out)
print(out)
