"""Skin-tone fidelity check: face vs neck vs hand on rendered shots.
    python3 tools/characters/tone-check.py shots/characters/27_rocketbox_ab [more shot basenames...]
Reads <shot>.jpg|png and <shot>.json (report.toneProbes: screen positions of a cheek, the side of
the neck and the back of the right hand per character, written by the test scenes), samples a
median patch at each probe and compares them in CIELAB:
  (hand: the best skin match in a small window around the probe, since hands are a few px wide)
  dE00      CIEDE2000 between the patches (includes lighting: cheek and hand face different ways)
  dC        chroma/hue distance (a*, b* only): a tone or undertone mismatch, mostly lighting-free
  dL        lightness difference
Fails (exit 1) when face-vs-hand dC > 8 (the tone test: same light direction class, no beard or
jaw shadow) or face-vs-neck dC > 20 (gross seam breaks only: the neck probe sits in the jaw's
shadow and in stubble on bearded heads, so it reads 15-20 even on matching heads). Lightness isn't gated: under a
key light from above the neck sits in the jaw's shadow (our own heads measure dL -9 to -15 too). It also writes
<shot>_tone.jpg with the probes drawn, so you can check that each probe landed on skin.
"""
import json, math, os, sys
from PIL import Image, ImageDraw

def srgb_to_lab(rgb):
    def lin(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(float(c)) for c in rgb)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = (0.2126 * r + 0.7152 * g + 0.0722 * b)
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(x), f(y), f(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))

def de00(l1, l2):
    L1, a1, b1 = l1; L2, a2, b2 = l2
    C1, C2 = math.hypot(a1, b1), math.hypot(a2, b2)
    Cm = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360
    h2p = math.degrees(math.atan2(b2, a2p)) % 360
    dLp, dCp = L2 - L1, C2p - C1p
    dh = h2p - h1p
    if C1p * C2p == 0: dh = 0
    elif dh > 180: dh -= 360
    elif dh < -180: dh += 360
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dh / 2))
    Lpm, Cpm = (L1 + L2) / 2, (C1p + C2p) / 2
    hs = h1p + h2p
    if C1p * C2p == 0: hpm = hs
    elif abs(h1p - h2p) <= 180: hpm = hs / 2
    else: hpm = (hs + 360) / 2 if hs < 360 else (hs - 360) / 2
    T = 1 - 0.17 * math.cos(math.radians(hpm - 30)) + 0.24 * math.cos(math.radians(2 * hpm)) + 0.32 * math.cos(math.radians(3 * hpm + 6)) - 0.20 * math.cos(math.radians(4 * hpm - 63))
    Sl = 1 + 0.015 * (Lpm - 50) ** 2 / math.sqrt(20 + (Lpm - 50) ** 2)
    Sc, Sh = 1 + 0.045 * Cpm, 1 + 0.015 * Cpm * T
    Rt = -2 * math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7)) * math.sin(math.radians(60 * math.exp(-((hpm - 275) / 25) ** 2)))
    return math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))

def patch(im, p, r):
    x, y = int(p[0] * im.width), int(p[1] * im.height)
    px = [im.getpixel((min(im.width - 1, max(0, x + dx)), min(im.height - 1, max(0, y + dy)))) for dx in range(-r, r + 1) for dy in range(-r, r + 1)]
    return tuple(sorted(c[i] for c in px)[len(px) // 2] for i in range(3))

fail = False
for base in sys.argv[1:]:
    img = next((base + e for e in ('.jpg', '.png') if os.path.exists(base + e)), None)
    rep = json.load(open(base + '.json'))
    probes = rep.get('toneProbes') or []
    if not img or not probes:
        print(f'{base}: no image or no toneProbes'); fail = True; continue
    im = Image.open(img).convert('RGB')
    r = max(2, im.width // 400)
    out = im.copy(); d = ImageDraw.Draw(out)
    print(f'\n{os.path.basename(base)}')
    for i, pr in enumerate(probes):
        if not all(0 < pr[k][0] < 1 and 0 < pr[k][1] < 1 for k in ('cheek', 'neck', 'hand')): continue
        lab = {k: srgb_to_lab(patch(im, pr[k], r)) for k in ('cheek', 'neck')}
        # hands are a few pixels wide on full-figure shots: search a small window around the probe
        # for the small patch closest in chroma to the cheek (it can only *hide* a mismatch if
        # clothing happens to match the face; the annotated image shows what was sampled)
        best = None
        for dx in range(-3 * r, 3 * r + 1, max(1, r // 2)):
            for dy in range(-3 * r, 3 * r + 1, max(1, r // 2)):
                p = (pr['hand'][0] + dx / im.width, pr['hand'][1] + dy / im.height)
                l = srgb_to_lab(patch(im, p, 1))
                dc = math.hypot(l[1] - lab['cheek'][1], l[2] - lab['cheek'][2]) + abs(l[0] - lab['cheek'][0]) * 0.25
                if best is None or dc < best[0]: best = (dc, l, p)
        lab['hand'] = best[1]; pr = {**pr, 'hand': list(best[2])}
        for k, col in (('cheek', 'yellow'), ('neck', 'cyan'), ('hand', 'magenta')):
            x, y = pr[k][0] * im.width, pr[k][1] * im.height
            d.rectangle((x - r, y - r, x + r, y + r), outline=col)
        res = {}
        for a, b in (('cheek', 'neck'), ('cheek', 'hand')):
            la, lb = lab[a], lab[b]
            res[b] = (de00(la, lb), math.hypot(la[1] - lb[1], la[2] - lb[2]), lb[0] - la[0])
        hid = bool(pr.get('handHidden'))
        bad = res['neck'][1] > 20 or (res['hand'][1] > 8 and not hid)
        fail |= bad
        who = pr.get('hero') or f"seed {pr.get('seed')}"
        print(f"  {who:<22} head={pr.get('rb') or 'ours':<16} tone={pr.get('tone')}  face-neck dE00 {res['neck'][0]:5.1f} dC {res['neck'][1]:4.1f} dL {res['neck'][2]:+5.1f} | face-hand dE00 {res['hand'][0]:5.1f} dC {res['hand'][1]:4.1f} dL {res['hand'][2]:+5.1f}{' (hand hidden: not gated)' if hid else ''}  {'FAIL' if bad else 'ok'}")
    out.save(base + '_tone.jpg', quality=85)
sys.exit(1 if fail else 0)
