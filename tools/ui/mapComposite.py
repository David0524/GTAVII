#!/usr/bin/env python3
"""Map aerial compositor: stitched colour + height tiles (tools/ui/mapAerial.ts) -> graded full-res composite
and the tile pyramid for the game.

  python3 tools/ui/mapComposite.py [--in shots/map/v2] [--out shots/map/v2/composite.png]
        [--pyramid public/map/aerial] [--l0 0.5] [--quality 78]

Steps: stitch -> decode height (metres) -> hillshade (sun NW, 45 deg) -> ambient occlusion from height
differences (box-blur at several radii; ground beside tall buildings darkens) -> roof-edge rim (height
discontinuities) -> vegetation mask from the colour pass (parks greener) -> restrained 1974 grade (warm,
slightly desaturated, lifted blacks, readable mid-tones) -> composite.png -> pyramid (WebP, 256 px tiles).
Only numpy + Pillow.
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--in', dest='inp', default='shots/map/v2')
ap.add_argument('--out', default=None)
ap.add_argument('--pyramid', default='public/map/aerial')
ap.add_argument('--l0', type=float, default=0.5, help='m/px of pyramid level 0 (0.5; 0.75 if the size budget is blown)')
ap.add_argument('--quality', type=int, default=78)
ap.add_argument('--no-pyramid', action='store_true')
ap.add_argument('--crop', default='', help='px x0,y0,x1,y1 of the stitched image to process (fast tests)')
a = ap.parse_args()
IN = a.inp
OUT = a.out or os.path.join(IN, 'composite.png')
meta = json.load(open(os.path.join(IN, 'bake.json')))
TP, nx, nz, mpp = meta['tilePx'], meta['nx'], meta['nz'], meta['mPerPx']
W, H = nx * TP, nz * TP

# ---------------------------------------------------------------- stitch
col = np.zeros((H, W, 3), np.uint8)
hq = np.zeros((H, W), np.uint16)
have = np.zeros((nz, nx), bool)
for j in range(nz):
    for i in range(nx):
        cf, hf = os.path.join(IN, f'col_{j}_{i}.png'), os.path.join(IN, f'hgt_{j}_{i}.u16')
        if not (os.path.exists(cf) and os.path.exists(hf)): continue
        t = np.asarray(Image.open(cf).convert('RGB'))
        col[j*TP:(j+1)*TP, i*TP:(i+1)*TP] = t[:TP, :TP]
        hq[j*TP:(j+1)*TP, i*TP:(i+1)*TP] = np.fromfile(hf, '<u2').reshape(TP, TP)
        have[j, i] = True
print('tiles present', int(have.sum()), 'of', nz * nx)
hgt = hq.astype(np.float32) / 65535 * meta['hRange'] + meta['hMin']
if a.crop:
    x0, y0, x1, y1 = map(int, a.crop.split(','))
    col, hgt = col[y0:y1], hgt[y0:y1]
    col, hgt = col[:, x0:x1], hgt[:, x0:x1]
    H, W = hgt.shape
rgb = col.astype(np.float32) / 255

# ---------------------------------------------------------------- helpers
def box(img, r):
    """Separable box blur of radius r px (edge-replicated), via cumulative sums."""
    k = 2 * r + 1
    p = np.pad(img, ((r, r), (0, 0)), mode='edge'); c = np.cumsum(p, 0, dtype=np.float64)
    c = np.concatenate([np.zeros((1, c.shape[1])), c], 0); img = ((c[k:] - c[:-k]) / k).astype(np.float32)
    p = np.pad(img, ((0, 0), (r, r)), mode='edge'); c = np.cumsum(p, 1, dtype=np.float64)
    c = np.concatenate([np.zeros((c.shape[0], 1)), c], 1)
    return ((c[:, k:] - c[:, :-k]) / k).astype(np.float32)

def smooth(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t)

# ground level: the typical street height of the surroundings (low percentile via blurred min is costly; the model is
# nearly flat, so use a fixed baseline from the lowest-quantile of the whole image)
ground = np.percentile(hgt[hgt > meta['hMin'] + 1], 5) if (hgt > meta['hMin'] + 1).any() else 0.0
hrel = np.maximum(hgt - ground, 0)
print('ground', round(float(ground), 2), 'height max', round(float(hrel.max()), 1))

# ---------------------------------------------------------------- hillshade (sun from NW, 45 deg), exaggerated z
az, el = np.radians(315), np.radians(45)
# image axes: x east, y south. light direction vector pointing TO the light: NW => (-x, -y)
lx, ly, lz = -np.sin(az) * -1 * 0 + np.cos(el) * -0.7071, np.cos(el) * -0.7071, np.sin(el)
gy, gx = np.gradient(box(hrel, 1), mpp)
Z = 0.6   # vertical exaggeration so flat roofs vs. edges read; roofs themselves stay neutral
nxn, nyn, nzn = -gx * Z, -gy * Z, np.ones_like(gx)
norm = np.sqrt(nxn**2 + nyn**2 + nzn**2)
shade = np.clip((nxn * lx + nyn * ly + nzn * lz) / norm, 0, 1)
flat = lz  # shade of a flat surface
hs = shade / flat  # 1.0 on flat

# cast shadow (from NW at 45): march the height field toward the light; occluded where a taller thing stands NW.
# 8 steps at doubling distance are enough to darken the SE side of towers without the cost of a true ray march.
sh = np.ones_like(hrel)
dxy = np.array([-0.7071, -0.7071])
for d in (3, 6, 10, 16, 24, 36, 52, 76, 110):          # metres toward the sun
    s = int(round(d / mpp / 1.4142))
    shifted = np.pad(hrel, ((s, 0), (s, 0)), mode='edge')[:H, :W]   # value at (y - s, x - s): up-left
    occl = shifted - hrel - d * 1.0                                    # 45 deg: occluder must exceed d metres above us
    sh = np.minimum(sh, 1 - 0.32 * smooth(occl, 0, 8))
sh = box(sh, 1)

# ---------------------------------------------------------------- ambient occlusion from height differences
ao = np.zeros_like(hrel)
wsum = 0
for r_m, w in ((3, 0.35), (8, 0.35), (20, 0.30)):
    r = max(1, int(r_m / mpp))
    m = box(hrel, r)
    d = np.clip(m - hrel, 0, 40)                 # surroundings taller than this pixel
    ao += w * smooth(d, 0, 14)
    wsum += w
ao = ao / wsum                                   # 0 open .. 1 deep canyon
ao_f = 1 - 0.55 * ao

# ---------------------------------------------------------------- roof edge rim (height discontinuities)
dh = np.zeros_like(hrel)
dh[:, 1:] = np.maximum(dh[:, 1:], np.abs(hrel[:, 1:] - hrel[:, :-1]))
dh[1:, :] = np.maximum(dh[1:, :], np.abs(hrel[1:, :] - hrel[:-1, :]))
edge = smooth(dh, 1.5, 6)
roofside = np.zeros_like(edge)                   # only the higher side of the step lights up
up = np.pad(hrel, ((1, 0), (0, 0)), mode='edge')[:H]; lf = np.pad(hrel, ((0, 0), (1, 0)), mode='edge')[:, :W]
dn = np.pad(hrel, ((0, 1), (0, 0)), mode='edge')[1:]; rt = np.pad(hrel, ((0, 0), (0, 1)), mode='edge')[:, 1:]
higher = ((hrel - up > 1.5) | (hrel - lf > 1.5) | (hrel - dn > 1.5) | (hrel - rt > 1.5)).astype(np.float32)
rim = edge * higher
dark_edge = edge * (1 - higher)                  # the foot of a wall: a hair of dark contact line

# ---------------------------------------------------------------- vegetation mask from colour
r_, g_, b_ = rgb[..., 0], rgb[..., 1], rgb[..., 2]
mx = np.maximum(np.maximum(r_, g_), b_); mn = np.minimum(np.minimum(r_, g_), b_)
greenness = (g_ - np.maximum(r_, b_)) / (mx + 0.04)
veg = smooth(greenness, 0.03, 0.14) * smooth(mx, 0.04, 0.12)
veg = box(veg, 1)

# ---------------------------------------------------------------- luminance rebalance
# the bake is dark and low contrast: normalise the colour pass to a target distribution, per class
lin = rgb ** 2.2
Y = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
is_roof = (hrel > 4) & (veg < 0.3)
is_ground = hrel < 0.8

def pctl(x, m, q):
    v = x[m]; return float(np.percentile(v, q)) if v.size else 1.0

# exposure so that the median ground/street lands near 0.50 display, then lift roofs separately (tar is nearly black)
yg = max(pctl(Y, is_ground, 50), 1e-4)
gain_g = (0.36 / yg)
yr = max(pctl(Y, is_roof, 50), 1e-4)
gain_r = (0.17 / yr)
gain = np.where(is_roof, gain_r, gain_g)
gain = box(gain.astype(np.float32), 1)
lin2 = np.clip(lin * gain[..., None], 0, 1.6)
base = lin2 ** (1 / 2.2)

# roofs: add a mid-grey/brown floor so tar never reads black; mix some hue from the colour pass
roof_floor = np.array([0.40, 0.36, 0.32], np.float32)
roof_w = (smooth(hrel, 3, 6) * (1 - veg))[..., None]
lum = base.mean(-1, keepdims=True)
roof_col = roof_floor * (0.8 + 0.6 * lum) * 0.6 + base * 0.4
base = base * (1 - roof_w) + np.clip(roof_col, 0, 1) * roof_w

# height cue: higher roofs a little lighter (tower tops catch the sky), up to ~+22 % at 100 m
base = base * (1 + 0.18 * np.clip(hrel / 100, 0, 1) ** 0.7)[..., None] * roof_w + base * (1 - roof_w)

# parks: push vegetation clearly green but not neon
park_g = np.array([0.26, 0.44, 0.17], np.float32)
vlum = base.mean(-1, keepdims=True)
park = park_g * (0.55 + 1.0 * vlum)
base = base * (1 - 0.9 * veg[..., None]) + np.clip(park, 0, 1) * 0.9 * veg[..., None]

# ---------------------------------------------------------------- apply light
light = (0.40 + 0.60 * hs)                         # hillshade, gentle: flat = 1.0
light = light * (0.5 + 0.5 * np.clip(sh, 0, 1))
light = light * ao_f
light = np.clip(light, 0.2, 1.3)
# AO and cast shadow matter most on the ground; roofs keep their value so towers are never muddy
roof_keep = smooth(hrel, 3, 8) * (1 - veg)
light = light * (1 - 0.5 * roof_keep) + (0.6 + 0.4 * light) * 0.5 * roof_keep
light = light * (1 - 0.7 * veg) + 1.0 * 0.7 * veg   # canopies are lit, not shadowed by their own height
img = base * light[..., None]
img = img + 0.16 * rim[..., None] * (1 - 0.5 * veg[..., None])     # 1 px light rim on roof edges
img = img * (1 - 0.30 * dark_edge[..., None])

# sidewalk vs street separation (contact darkening at kerbs is handled by dark_edge/AO); a faint warm lift on low,
# bright-ish, low-saturation pixels (sidewalk/plaza concrete)
sat = (mx - mn) / (mx + 1e-3)
walk = smooth(Y, 0.02, 0.1) * (1 - smooth(sat, 0.15, 0.3)) * (hrel < 0.8) * (1 - veg)
img = img + 0.03 * walk[..., None] * np.array([1.0, 0.96, 0.88], np.float32)

# ---------------------------------------------------------------- 1974 film grade
img = np.clip(img, 0, 1)
l = img.mean(-1, keepdims=True)
img = l + (img - l) * 0.86                          # slightly desaturated
img = img * np.array([1.05, 1.0, 0.92], np.float32)  # warm
img = 0.05 + img * 0.93                              # lifted blacks / soft whites
# soft S-curve, restrained
img = np.clip(img, 0, 1)
img = img + 0.10 * (img - 0.5) * (1 - np.abs(2 * img - 1))
img = np.clip(img, 0, 1)
out = (img * 255 + 0.5).astype(np.uint8)
Image.fromarray(out).save(OUT, optimize=False)
print('composite', OUT, out.shape[1], 'x', out.shape[0], 'median luma', float(np.median(out.mean(-1))),
      'roof median', pctl(out.mean(-1) / 255, is_roof, 50), 'ground median', pctl(out.mean(-1) / 255, is_ground, 50))
if a.crop or a.no_pyramid:
    sys.exit(0)

# ---------------------------------------------------------------- pyramid
im = Image.fromarray(out)
fill = tuple(int(v) for v in np.median(out[:8, :8].reshape(-1, 3), 0))
levels = []
os.makedirs(a.pyramid, exist_ok=True)
for L, m in enumerate((a.l0, a.l0 * 2, a.l0 * 4, a.l0 * 8)):
    f = mpp / m                                       # scale from the composite
    w, h = max(1, round(W * f)), max(1, round(H * f))
    lv = im if abs(f - 1) < 1e-6 else im.resize((w, h), Image.LANCZOS)
    cols, rows = -(-w // 256), -(-h // 256)
    d = os.path.join(a.pyramid, str(L)); os.makedirs(d, exist_ok=True)
    for fn in os.listdir(d): os.remove(os.path.join(d, fn))
    tot = 0
    for r in range(rows):
        for c in range(cols):
            t = Image.new('RGB', (256, 256), fill); t.paste(lv.crop((c * 256, r * 256, min(w, c * 256 + 256), min(h, r * 256 + 256))), (0, 0))
            p = os.path.join(d, f'{c}_{r}.webp'); t.save(p, 'WEBP', quality=a.quality, method=6); tot += os.path.getsize(p)
    levels.append({'mPerPx': m, 'cols': cols, 'rows': rows})
    print(f'level {L}: {m} m/px {cols}x{rows} tiles, {tot/1024:.0f} KB')
json.dump({'format': 'webp', 'x0': meta['x0'], 'z0': meta['z0'], 'levels': levels, 'tile': 256},
          open(os.path.join(a.pyramid, 'manifest.json'), 'w'))
tot = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(a.pyramid) for f in fs)
print(f'pyramid total {tot/1024/1024:.2f} MB')
