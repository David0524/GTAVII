"""MakeHuman CC0 skins → skin *detail* texture arrays for our body (High and Low).
   python3 -I tools/characters/build-skins.py <makehuman_system_assets_cc0.zip> <out dir>
Source: MakeHuman system assets (CC0; each .mhmat states "explicitly released as CC0 in
september 2020"), the 18 default skins: young / middleage / old × african / asian / caucasian ×
female / male, 2048² diffuse maps on the MakeHuman base-mesh UVs (= our body's UVs).
Each map is divided by its own median colour, so it carries detail only (pores, lips, brows,
freckles, ageing, nail beds); our generator's skin tone keeps setting the colour.
  skins_hi.webp: 18 tiles of 384², stacked vertically (layer = age*6 + sex*3 + ancestry)
  skins_lo.webp:  6 tiles of 256², ancestry-averaged (layer = age*2 + sex)
Stored value = detail / 2 (so 0..2 maps to 0..255).
"""
import io, sys, zipfile
import numpy as np
from PIL import Image

z = zipfile.ZipFile(sys.argv[1]); out = sys.argv[2]
AGES = ['young', 'middleage', 'old']; SEXES = ['female', 'male']; ANC = ['african', 'asian', 'caucasian']

def load(age, sex, anc, size):
    folder = f'skins/{age}_{anc}_{sex}/'
    png = [n for n in z.namelist() if n.startswith(folder) and n.endswith('.png')][0]
    im = Image.open(io.BytesIO(z.read(png))).convert('RGB').resize((size, size), Image.LANCZOS)
    a = np.asarray(im).astype(np.float64)
    med = np.median(a.reshape(-1, 3), axis=0)
    return np.clip(a / med[None, None, :], 0.0, 2.0)

def save(tiles, name, q):
    strip = np.concatenate(tiles, axis=0)
    Image.fromarray((strip / 2 * 255 + 0.5).clip(0, 255).astype(np.uint8)).save(f'{out}/{name}', 'WEBP', quality=q)

hi = [load(a, s, c, 384) for a in AGES for s in SEXES for c in ANC]
save(hi, 'skins_hi.webp', 82)
lo = [np.mean([load(a, s, c, 256) for c in ANC], axis=0) for a in AGES for s in SEXES]
save(lo, 'skins_lo.webp', 80)
import os
print('hi', os.path.getsize(f'{out}/skins_hi.webp'), 'lo', os.path.getsize(f'{out}/skins_lo.webp'))
