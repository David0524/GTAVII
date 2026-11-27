"""Builds tools/ui/board/board.json and JPEG copies of the lab shots for the board page.  python3 tools/ui/board/build.py"""
import json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(__file__))
from rows import ROWS
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.abspath(os.path.join(here, '../../..'))
img = os.path.join(here, 'img'); os.makedirs(img, exist_ok=True)
out = []
for name, group, title, note, ref in ROWS:
    r = {'group': group, 'title': title, 'note': note, 'ref': ref}
    for v in ('desktop', 'phone'):
        src = os.path.join(root, 'shots/ui', f'{name}_{v}.png')
        if not os.path.exists(src): print('missing', src); continue
        dst = os.path.join(img, f'{name}_{v}.jpg')
        subprocess.run(['convert', src, '-resize', '1600x>', '-quality', '82', dst], check=True)
        r[v] = f'img/{name}_{v}.jpg'
    out.append(r)
json.dump(out, open(os.path.join(here, 'board.json'), 'w'), indent=1)
print(len(out), 'rows')
