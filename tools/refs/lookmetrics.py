"""Look metrics: measure screenshots against the Phase 3 look target (PROGRESS.md), using the same
statistics measured from 87 period DOCUMERICA photos (docs/STYLE_GUIDE.md §1).
Usage: python3 tools/refs/lookmetrics.py shot1.png [shot2.png ...]   (crops 8% borders: HUD/letterbox)

Bands by time of day, read from the shot name's _HHMM suffix (oversight: one day band for every shot made the
PASS/FAIL lines meaningless at night):
  day   06:00-19:59  the DOCUMERICA bands (tones, p2, p50 50..80, p98 200..235, warm saturation)
  blue  20:00-21:29  civil twilight: p50 20..60, cool fill present (cool >= 10% of saturated pixels) AND warm
                     practicals present (warm >= 30%): the warm/cool split
  night 21:30-05:59  p50 12..40, lit sources visible (p98 >= 120) and not clipped (p98 <= 245), warm >= 50%"""
import colorsys, re, sys
from PIL import Image

TARGET = {'shadow': (0x2e, 0x17, 0x1d), 'mid': (0x79, 0x4d, 0x44), 'high': (0xd1, 0xb5, 0x9e)}
TOL = {'shadow': 12, 'mid': 20, 'high': 20}

def band(path):
    m = re.search(r'_(\d{2})(\d{2})(?:_|\.|$)', path.split('/')[-1])
    if not m: return 'day'
    t = int(m.group(1)) * 60 + int(m.group(2))
    return 'day' if 360 <= t < 1200 else 'blue' if 1200 <= t < 1290 else 'night'

def measure(path):
    im = Image.open(path).convert('RGB'); w, h = im.size
    im = im.crop((int(w * .08), int(h * .08), int(w * .92), int(h * .92))).resize((240, 135))
    S, M, H = [0, 0, 0], [0, 0, 0], [0, 0, 0]; ns = nm = nh = 0; lum = []; warm = cool = sat_n = 0
    for r, g, b in im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata():
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
    checks = []; b = band(path); out['band'] = b
    if b == 'day':
        for k in ('shadow', 'mid', 'high'):
            if out[k]: checks.append((k, max(abs(a - b2) for a, b2 in zip(out[k], TARGET[k])) <= TOL[k]))
        checks += [('p2<=20', out['p2'] <= 20), ('p50 50..80', 50 <= out['p50'] <= 80), ('p98 200..235', 200 <= out['p98'] <= 235)]
        if out['warmSat'] is not None: checks += [('warm>=0.70', out['warmSat'] >= 0.7)]
    elif b == 'blue':
        checks += [('p50 20..60', 20 <= out['p50'] <= 60), ('cool>=0.10', (out['coolSat'] or 0) >= 0.10), ('warm>=0.30', (out['warmSat'] or 0) >= 0.30)]
    else:
        checks += [('p50 12..40', 12 <= out['p50'] <= 40), ('lit p98>=120', out['p98'] >= 120), ('p98<=245', out['p98'] <= 245), ('warm>=0.50', (out['warmSat'] or 0) >= 0.5)]
    return out, checks

for p in sys.argv[1:]:
    o, c = measure(p)
    hx = lambda t: '#%02x%02x%02x' % t if t else '-'
    print(f"{p.split('/')[-1]} [{o['band']}]: shadow {hx(o['shadow'])} mid {hx(o['mid'])} high {hx(o['high'])} | luma p2/p50/p98 {o['p2']}/{o['p50']}/{o['p98']} | sat warm {o['warmSat']} cool {o['coolSat']}")
    print('   ', ' '.join(f"{k}:{'PASS' if ok else 'FAIL'}" for k, ok in c))
