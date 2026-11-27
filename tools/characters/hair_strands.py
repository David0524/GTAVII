"""Hair-card strand texture (our own procedural work): 4 card variants side by side, 128 px each,
root at the top (v=1 in three's flipped UVs -> image row 0), tip at the bottom.
    python3 -I tools/characters/hair_strands.py public/characters/hair_strands.png
R: per-strand brightness (the shader multiplies the hair colour by it), G: root-to-tip shading,
A: coverage. Strands are 1-2.5 px wide, tapered, gently waved, with length jitter so tips break up;
a dense under-layer keeps the card's middle opaque. Saved as PNG (alpha kept exactly); three makes
the mip chain, so coverage averages out at distance instead of aliasing into noise.
"""
import sys
import numpy as np
from PIL import Image

W, H, V = 512, 512, 4
rng = np.random.default_rng(1974)
img = np.zeros((H, W, 4))
ys = np.arange(H)[:, None] / (H - 1)            # 0 root .. 1 tip
for var in range(V):
    x0 = var * (W // V); cw = W // V
    cov = np.zeros((H, cw)); bri = np.zeros((H, cw))
    n = 34 + var * 4
    for s in range(n):
        cx = rng.uniform(0.06, 0.94) * cw
        # strands near the card edges are shorter (the card's silhouette tapers)
        edge = 1 - abs(cx / cw - 0.5) * 2
        length = rng.uniform(0.55, 1.0) * (0.75 + 0.25 * edge)
        width = rng.uniform(0.9, 2.4)
        amp = rng.uniform(0.5, 3.0) * (1 + var * 0.6); freq = rng.uniform(1.5, 4.0); ph = rng.uniform(0, 6.28)
        drift = rng.uniform(-6, 6)
        b = rng.uniform(0.6, 1.25)
        xs = np.arange(cw)[None, :]
        centre = cx + amp * np.sin(ph + freq * 6.28 * ys) + drift * ys
        wv = width * (1 - 0.7 * np.clip(ys / length, 0, 1))      # taper to the tip
        d = np.abs(xs - centre)
        a = np.clip(wv + 0.5 - d, 0, 1) * (ys <= length)
        a *= np.clip((length - ys) / 0.06, 0, 1) ** 0.7               # soft tip
        cov = np.maximum(cov, a); bri = np.where(a > 0.05, np.maximum(bri, b * a), bri)
    # under-layer: the card's core stays fairly opaque near the root
    core = np.exp(-((np.arange(cw)[None, :] / cw - 0.5) / 0.28) ** 2) * np.clip(1 - ys / 0.7, 0, 1) * 0.55
    cov = np.maximum(cov, core)
    bri = np.where(bri > 0, bri, 0.8)
    img[:, x0:x0 + cw, 0] = np.clip(bri / 1.25, 0, 1)
    img[:, x0:x0 + cw, 1] = np.clip(1 - 0.5 * ys, 0, 1) * np.ones((1, cw))
    img[:, x0:x0 + cw, 3] = np.clip(cov, 0, 1)
Image.fromarray((img * 255 + 0.5).astype(np.uint8), 'RGBA').save(sys.argv[1], optimize=True)
print('wrote', sys.argv[1])
