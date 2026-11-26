"""Look metrics: measure screenshots against the Phase 3 look target (PROGRESS.md), using the same
statistics measured from 87 period DOCUMERICA photos (docs/STYLE_GUIDE.md §1).
Usage: python3 tools/refs/lookmetrics.py shot1.png [shot2.png ...]   (crops 8% borders: HUD/letterbox)"""
import colorsys, sys
from PIL import Image

TARGET = {'shadow': (0x2e, 0x17, 0x1d), 'mid': (0x79, 0x4d, 0x44), 'high': (0xd1, 0xb5, 0x9e)}
TOL = {'shadow': 12, 'mid': 20, 'high': 20}

def measure(path):
    im = Image.open(path).convert('RGB'); w, h = im.size
    im = im.crop((int(w * .08), int(h * .08), int(w * .92), int(h * .92))).resize((240, 135))
    S, M, H = [0, 0, 0], [0, 0, 0], [0, 0, 0]; ns = nm = nh = 0; lum = []; warm = cool = sat_n = 0
    for r, g, b in im.getdata():
        l = 0.2126 * r + 0.7152 * g + 0.0722 * b; lum.append(l)
        hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s > 0.45 and v > 0.35:
            sat_n += 1; deg = hh * 360
            if deg <= 60 or deg >= 330: warm += 1
            elif 90 <= deg <= 270: cool += 1
        acc = S if l < 45 else M if l < 150 else H
        for i, c in enumerate((r, g, b)): acc[i] += c
        if l < 45: ns += 1
        elif l < 150: nm += 1
        else: nh += 1
    lum.sort(); n = len(lum)
    avg = lambda a, k: tuple(round(x / k) for x in a) if k else None
    out = {'shadow': avg(S, ns), 'mid': avg(M, nm), 'high': avg(H, nh),
           'p2': round(lum[n // 50]), 'p50': round(lum[n // 2]), 'p98': round(lum[-n // 50]),
           'warmSat': round(warm / sat_n, 2) if sat_n else None, 'coolSat': round(cool / sat_n, 2) if sat_n else None}
    checks = []
    for k in ('shadow', 'mid', 'high'):
        if out[k]: checks.append((k, max(abs(a - b) for a, b in zip(out[k], TARGET[k])) <= TOL[k]))
    checks += [('p2<=20', out['p2'] <= 20), ('p50 50..80', 50 <= out['p50'] <= 80), ('p98 200..235', 200 <= out['p98'] <= 235)]
    if out['warmSat'] is not None: checks += [('warm>=0.70', out['warmSat'] >= 0.7)]
    return out, checks

for p in sys.argv[1:]:
    o, c = measure(p)
    hx = lambda t: '#%02x%02x%02x' % t if t else '-'
    print(f"{p.split('/')[-1]}: shadow {hx(o['shadow'])} mid {hx(o['mid'])} high {hx(o['high'])} | luma p2/p50/p98 {o['p2']}/{o['p50']}/{o['p98']} | sat warm {o['warmSat']} cool {o['coolSat']}")
    print('   ', ' '.join(f"{k}:{'PASS' if ok else 'FAIL'}" for k, ok in c))
