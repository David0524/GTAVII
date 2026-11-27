"""Lineup vs. reference photos montage (for the CHARACTERS_BRIEF "Done means" comparison).
    python3 tools/characters/montage.py
Reference photos are public domain (US National Archives DOCUMERICA); ids are printed on the image.
"""
from PIL import Image, ImageDraw
import json, os

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
cat = {c['id']: c for c in json.load(open(os.path.join(ROOT, 'references/catalog.json')))}
SETS = {
    '01_lineup_a.jpg': ['documerica_551651', 'documerica_548399', 'documerica_554312'],
    '02_lineup_b.jpg': ['documerica_551646', 'documerica_551696'],
    '04_leads_act1.jpg': ['documerica_551651', 'documerica_554312'],
}
for shot, refs in SETS.items():
    lineup = Image.open(os.path.join(ROOT, 'shots/characters', shot)).convert('RGB')
    w, h = lineup.size
    # leads are judged head to toe; the lineups only need the band the people stand in
    top, bot = (0.04, 0.96) if 'leads' in shot else (0.22, 0.78)
    lineup = lineup.crop((0, int(h * top), w, int(h * bot)))
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
        d.text((x + 4, lineup.height + row_h + 16), f"NARA {rid.split('_')[1]}, {c['date']}", fill=(220, 210, 190))
        x += p.width + 10
    d.text((10, lineup.height + row_h + 44), 'Top: generated pedestrians (seeded, ?characters=1&scene=lineup). Bottom: public-domain DOCUMERICA photos (US National Archives) the wardrobe tables came from (docs/WARDROBE_1974.md).', fill=(200, 190, 170))
    name = os.path.join(ROOT, 'shots/characters', shot.replace('.jpg', '_vs_refs.jpg'))
    if out.width > 1600: out = out.resize((1600, round(out.height * 1600 / out.width)), Image.LANCZOS)
    out.save(name, quality=85, optimize=True)
    print('wrote', name, out.size)

# movement course frame strip (31a-31j): one board, chronological, labelled with the sim state
import glob
frames = sorted(glob.glob(os.path.join(ROOT, 'shots/characters/31?_move_t*.jpg')))
if frames:
    W, H = 400, 225
    cols = 5
    board = Image.new('RGB', (W * cols, H * ((len(frames) + cols - 1) // cols) + 30), (18, 16, 15))
    d = ImageDraw.Draw(board)
    for i, fpath in enumerate(frames):
        im = Image.open(fpath).convert('RGB').resize((W, H))
        x, y = (i % cols) * W, (i // cols) * H
        board.paste(im, (x, y))
        rep = fpath[:-4] + '.json'
        lab = os.path.basename(fpath)[4:-4]
        if os.path.exists(rep):
            st = json.load(open(rep)).get('state', {})
            tr = st.get('traversal')
            lab = f"t={st.get('t')}s x={st.get('x')} " + (f"{tr['label']} {int(tr['u'] * 100)}%" if tr else f"{st.get('speed')} m/s")
        d.text((x + 6, y + 6), lab, fill=(240, 230, 200))
    d.text((8, board.height - 22), 'Movement course (?characters=1&scene=move): stand-in controller, traversal root curves; poses are placeholders until the authored traversal clips (M4).', fill=(200, 190, 170))
    out = os.path.join(ROOT, 'shots/characters/31_move_strip.jpg')
    board.save(out, quality=85, optimize=True)
    print('wrote', out, board.size)
