"""Rocketbox head textures → WebP for the runtime (called by build-rocketbox.ts).
   python3 -I rb_tex.py <job.json>
job: { "src": path, "dst": path, "size": int, "alpha": bool, "quality": int,
       "skin": [r,g,b] | null,           # sampled skin colour of the source (sRGB 0..255)
       "skinTarget": [r,g,b] | null,     # recolour skin toward this (Lab shift, detail kept)
       "hairTarget": [r,g,b] | null,     # recolour non-skin dark/greyish regions (hair) toward this
       "uvMask": path | null }           # optional PNG mask (white = skin) made from mesh UVs
Colour transfer works in CIELAB: each pixel's (L, a, b) moves by (target - source) scaled by a soft
skin-likeness weight, so pores, freckles, stubble and wrinkles survive the shift.
"""
import json, sys
import numpy as np
from PIL import Image

def srgb_to_lab(rgb):
    c = rgb / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    L = 116 * f[..., 1] - 16; a = 500 * (f[..., 0] - f[..., 1]); b = 200 * (f[..., 1] - f[..., 2])
    return np.stack([L, a, b], -1)

def lab_to_srgb(lab):
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    fy = (L + 16) / 116; fx = fy + a / 500; fz = fy - b / 200
    f = np.stack([fx, fy, fz], -1)
    xyz = np.where(f ** 3 > 0.008856, f ** 3, (f - 16 / 116) / 7.787) * np.array([0.95047, 1.0, 1.08883])
    Mi = np.array([[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]])
    c = np.clip(xyz @ Mi.T, 0, 1)
    c = np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)
    return np.clip(c * 255 + 0.5, 0, 255)

job = json.load(open(sys.argv[1]))
im = Image.open(job['src'])
im = im.convert('RGBA' if job.get('alpha') else 'RGB').resize((job['size'], job['size']), Image.LANCZOS)
a = np.asarray(im).astype(np.float64)
rgb = a[..., :3]
if job.get('skin') and (job.get('skinTarget') or job.get('hairTarget')):
    lab = srgb_to_lab(rgb)
    src = srgb_to_lab(np.array(job['skin'], dtype=np.float64))
    d = np.linalg.norm((lab - src) * np.array([0.5, 1.0, 1.0]), axis=-1)
    skinW = np.clip(1.0 - (d - 12) / 18, 0, 1)  # soft: full within ~12 ΔE, gone by ~30
    if job.get('uvMask'):
        m = np.asarray(Image.open(job['uvMask']).convert('L').resize((job['size'], job['size']))).astype(np.float64) / 255
        skinW = skinW * (0.25 + 0.75 * m)
    out = lab.copy()
    if job.get('skinTarget'):
        tgt = srgb_to_lab(np.array(job['skinTarget'], dtype=np.float64))
        out = out + (tgt - src)[None, None, :] * skinW[..., None]
    if job.get('hairTarget'):
        # hair: low chroma or dark, and not skin-like
        chroma = np.hypot(lab[..., 1], lab[..., 2])
        hairW = np.clip(1 - skinW * 2, 0, 1) * np.clip((40 - chroma) / 25, 0, 1)
        if job.get('uvMask'):
            hairW = hairW * (1 - 0.8 * m)
        tgt = srgb_to_lab(np.array(job['hairTarget'], dtype=np.float64))
        # keep strand-level variation: move the mean, keep each pixel's offset (compressed for bleaching)
        sel = hairW > 0.5
        if sel.any():
            mean = lab[sel].mean(0)
            moved = tgt[None, None, :] + (lab - mean[None, None, :]) * np.array([0.7, 0.5, 0.5])
            out = out * (1 - hairW[..., None]) + moved * hairW[..., None]
    rgb = lab_to_srgb(out)
res = np.concatenate([rgb, a[..., 3:4]], -1) if job.get('alpha') else rgb
Image.fromarray(res.astype(np.uint8), 'RGBA' if job.get('alpha') else 'RGB').save(job['dst'], 'WEBP', quality=job.get('quality', 86))
print(job['dst'])
