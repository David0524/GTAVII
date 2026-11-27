"""Procedural textures for a baked ICT-FaceKit head (called by bake-ict.ts).
   python3 -I ict_tex.py <job.json>
Writes <out>_c.webp (albedo, sRGB) and <out>_n.webp (tangent-space normal, OpenGL +Y).

ICT Light ships no textures, so every texel here is ours: the mesh is rasterised into the atlas,
carrying each texel's 3D position (noise is sampled in 3D, so it runs continuously across UV
seams) and its original ICT UV (the face tile is a frontal layout, so regional masks such as lips,
brows, eye surrounds, cheeks and the hairline are drawn as shapes in that space).
Atlas cells (u0, v0, size): face 0,.5,.5 | scalp+sockets .5,.5,.5 | eye 0,.25,.25 |
teeth .25,.25,.25 | gums .5,.25,.25 | lashes .75,.25,.25.
"""
import json, sys
import numpy as np
from PIL import Image

job = json.load(open(sys.argv[1]))
W = job['size']
uv = np.array(job['uv'], np.float64).reshape(-1, 2)
orig = np.array(job['orig'], np.float64).reshape(-1, 2)
reg = np.array(job['region'], np.int16)
pos = np.array(job['pos'], np.float64).reshape(-1, 3)
tris = np.array(job['tris'], np.int64).reshape(-1, 3)
FACE, SCALP, EYE, TEETH, GUMS, LASH, MOUTH, SOCKET = range(8)

def lin(h):
    c = np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float64) / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

# --- rasterise -------------------------------------------------------------------------------
R = np.full((W, W), -1, np.int16)
P3 = np.zeros((W, W, 3)); O2 = np.zeros((W, W, 2))
px = np.stack([uv[:, 0] * W - 0.5, (1 - uv[:, 1]) * W - 0.5], 1)
for t in tris:
    a, b, c = px[t[0]], px[t[1]], px[t[2]]
    x0, x1 = int(np.floor(min(a[0], b[0], c[0]))), int(np.ceil(max(a[0], b[0], c[0])))
    y0, y1 = int(np.floor(min(a[1], b[1], c[1]))), int(np.ceil(max(a[1], b[1], c[1])))
    x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, W - 1), min(y1, W - 1)
    if x1 < x0 or y1 < y0: continue
    ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1]
    d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(d) < 1e-12: continue
    l0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / d
    l1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / d
    l2 = 1 - l0 - l1
    m = (l0 >= -0.02) & (l1 >= -0.02) & (l2 >= -0.02)
    if not m.any(): continue
    yy, xx = ys[m], xs[m]
    L = np.stack([l0[m], l1[m], l2[m]], 1)
    R[yy, xx] = reg[t[0]]
    P3[yy, xx] = L @ pos[t]
    O2[yy, xx] = L @ orig[t]

filled = R >= 0
ii = np.nonzero(filled)
p = P3[ii]; o = O2[ii]; r = R[ii]
N = len(r)
print(f'texels {N} ({N / W / W:.0%} of the atlas)')

# --- noise -----------------------------------------------------------------------------------
rng_seed = float(job.get('seed', 7))
def hash3(ix, iy, iz):
    h = np.sin(ix * 127.1 + iy * 311.7 + iz * 74.7 + rng_seed * 17.13) * 43758.5453
    return h - np.floor(h)
def vnoise(q):
    i = np.floor(q); f = q - i; f = f * f * (3 - 2 * f)
    x, y, z = i[:, 0], i[:, 1], i[:, 2]
    def c(dx, dy, dz): return hash3(x + dx, y + dy, z + dz)
    a = c(0, 0, 0) * (1 - f[:, 0]) + c(1, 0, 0) * f[:, 0]
    b = c(0, 1, 0) * (1 - f[:, 0]) + c(1, 1, 0) * f[:, 0]
    cc = c(0, 0, 1) * (1 - f[:, 0]) + c(1, 0, 1) * f[:, 0]
    d = c(0, 1, 1) * (1 - f[:, 0]) + c(1, 1, 1) * f[:, 0]
    e = a * (1 - f[:, 1]) + b * f[:, 1]; g = cc * (1 - f[:, 1]) + d * f[:, 1]
    return e * (1 - f[:, 2]) + g * f[:, 2]
def fbm(q, freq, oct=3):
    s, amp, tot = 0, 1, 0
    for k in range(oct):
        s = s + amp * vnoise(q * freq * (2 ** k) + k * 13.7); tot += amp; amp *= 0.5
    return s / tot
def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def blob(u, v, cu, cv, ru, rv): return np.exp(-(((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2))

u, v = o[:, 0], o[:, 1]
isF = r == FACE; isS = r == SCALP
skinMask = isF | isS

# --- face-tile masks (ICT frontal UV) --------------------------------------------------------
EYE_V = 0.7175
eyeM = np.maximum(blob(u, v, 0.35, EYE_V + 0.004, 0.068, 0.042), blob(u, v, 0.65, EYE_V + 0.004, 0.068, 0.042)) * isF
# brows: arcs above each eye, thick at the inner end, tapering to the tail
def brow(side):
    cu = 0.3475 if side < 0 else 0.6525
    t = ((cu - u) if side < 0 else (u - cu)) / 0.0775
    vb = 0.769 + 0.011 * (1 - np.clip(t, -1, 1) ** 2) - 0.004 * np.clip(-t, 0, 1)
    th = 0.012 + 0.006 * np.clip(-t, 0, 1) - 0.005 * np.clip(t, 0, 1)
    along = ss(-1.08, -0.92, t) * (1 - ss(0.9, 1.05, t))
    return along * (1 - ss(th * 0.6, th, np.abs(v - vb))), t, vb
bL, tL, vbL = brow(-1); bR, tR, vbR = brow(1)
browM = np.maximum(bL, bR) * isF
# lips: vermilion above/below the mouth line, cupid's bow on the upper lip
MV = 0.4313
x = (u - 0.5) / 0.066
inX = np.clip(1 - x * x, 0, 1)
hu = 0.027 * inX ** 0.5 * (1 - 0.22 * np.exp(-(x / 0.12) ** 2)) + 0.0035 * np.exp(-((np.abs(x) - 0.22) / 0.12) ** 2) * inX
hl = 0.038 * inX ** 0.7
dv = v - MV
lipU = ss(-0.002, 0.0015, dv) * (1 - ss(hu - 0.0025, hu + 0.0015, dv))
lipL = ss(0.002, -0.0015, dv) * (1 - ss(hl - 0.0025, hl + 0.0015, -dv))
lipM = np.maximum(lipU, lipL) * isF * (np.abs(x) < 1.05)
lipInner = np.exp(-(dv / 0.008) ** 2) * lipM  # wet inner lip is lighter and pinker
perioral = blob(u, v, 0.5, 0.43, 0.095, 0.075) * (1 - lipM) * isF
cheekM = np.maximum(blob(u, v, 0.33, 0.58, 0.08, 0.07), blob(u, v, 0.67, 0.58, 0.08, 0.07)) * isF
noseM = blob(u, v, 0.5, 0.6, 0.04, 0.04) * isF
alarM = np.maximum(blob(u, v, 0.452, 0.566, 0.014, 0.012), blob(u, v, 0.548, 0.566, 0.014, 0.012)) * isF
earM = ss(0.12, 0.09, np.minimum(u, 1 - u)) * ss(0.44, 0.48, v) * ss(0.71, 0.67, v) * isF
# hairline on the face tile (close crop): forehead line, receding at the temples, down to the sideburns
au = np.abs(u - 0.5)
hl_v = np.where(au < 0.3, 0.912 - 0.028 * (au / 0.2) ** 2, 0.849 - (au - 0.3) * 1.35)
hairF = ss(hl_v - 0.004, hl_v + 0.008, v + 0.004 * (fbm(p, 400, 2) - 0.5)) * isF
hairF *= 1 - earM
# scalp tile: hair above the nape line (3D, head space)
eyeY = job['eyeY']
nape = eyeY - 0.072 + 0.006 * (fbm(p, 300, 2) - 0.5)
hairS = ss(nape - 0.004, nape + 0.008, p[:, 1]) * isS
hairM = np.maximum(hairF, hairS)

# --- albedo (linear) -------------------------------------------------------------------------
base = lin(job['tone'])
col = np.tile(base, (N, 1))
# large-scale and mid mottling (luminance and a little hue), sampled in 3D
m1 = fbm(p, 22, 3) - 0.5; m2 = fbm(p + 3.1, 80, 3) - 0.5; m3 = fbm(p + 7.3, 260, 2) - 0.5
col *= (1 + 0.16 * m1 + 0.09 * m2 + 0.05 * m3)[:, None]
col *= np.stack([1 + 0.05 * m2, 1 - 0.01 * m2, 1 - 0.04 * m2], 1)
def mulc(mask, c): return col * (1 + mask[:, None] * (np.array(c) - 1))
col = mulc(eyeM, (0.9, 0.87, 0.92))
col = mulc(perioral, (0.88, 0.86, 0.88))
col = mulc(cheekM, (1.07, 0.98, 0.96))
col = mulc(noseM, (1.05, 0.99, 0.97))
col = mulc(alarM, (0.82, 0.78, 0.78))
col = mulc(earM * ss(0.01, 0.06, np.minimum(u, 1 - u)), (0.9, 0.84, 0.84))
# lips
lipOuter = base * np.array([0.66, 0.5, 0.56])
lipIn = lin(job['lip']) if job.get('lip') else base * np.array([1.05, 0.66, 0.66])
lipC = lipOuter[None] * (1 - lipInner[:, None]) + lipIn[None] * lipInner[:, None]
lipC *= (1 + 0.12 * (fbm(p + 1.7, 900, 2) - 0.5))[:, None]
col = col * (1 - lipM[:, None]) + lipC * lipM[:, None]
# brows: strands along the arc
sl = np.where(u < 0.5, tL, tR)
strand = vnoise(np.stack([sl * 70 + v * 900, (v - np.where(u < 0.5, vbL, vbR)) * 260 + sl * 6, np.zeros_like(u)], 1))
bd = browM * np.clip(0.45 + 0.75 * strand, 0, 1)
col = col * (1 - 0.92 * bd[:, None]) + lin(job['brow'])[None] * 0.92 * bd[:, None]
# close-cropped hair: dark stipple over a shadowed scalp
stip = vnoise(p * 1800)
hd = hairM * np.clip(0.55 + 0.6 * (stip - 0.4), 0, 1)
col = col * (1 - hairM[:, None] * 0.35) * (1 - hd[:, None]) + lin(job['brow'])[None] * hd[:, None]

# pore-level albedo (pits read slightly darker), uneven pigmentation (darker forehead band and
# temples, lighter cheek centres), a few small dark macules
pr_ = vnoise(p * 1100)
col *= (1 - 0.1 * np.maximum(0, pr_ - 0.62) / 0.38 * skinMask * (1 - lipM))[:, None]
fh = blob(u, v, 0.5, 0.875, 0.24, 0.035) * isF + np.maximum(blob(u, v, 0.2, 0.75, 0.06, 0.08), blob(u, v, 0.8, 0.75, 0.06, 0.08)) * isF
col *= (1 - 0.1 * fh)[:, None]
col *= (1 + 0.05 * np.maximum(blob(u, v, 0.36, 0.6, 0.05, 0.04), blob(u, v, 0.64, 0.6, 0.05, 0.04)) * isF)[:, None]
mac = ss(0.86, 0.9, vnoise(p * 260 + 11.3)) * ss(0.5, 0.7, vnoise(p * 40 + 2.1)) * isF * (1 - lipM) * (1 - hairM)
col *= (1 - 0.3 * mac)[:, None]

# other regions
def setc(mask, c, var=0.08, f=300):
    global col
    k = np.nonzero(mask)[0]
    if len(k): col[k] = np.array(c)[None] * (1 + var * (fbm(p[k], f, 2) - 0.5))[:, None]
setc(r == SOCKET, lin('#5e2e2c'))
setc(r == MOUTH, lin('#3a1614'), 0.2)
setc(r == GUMS, base * np.array([1.25, 0.62, 0.62]) * 0.9 + lin('#5a1e1e') * 0.25, 0.25, 500)
setc(r == LASH, lin('#0e0b0a'), 0.1)
k = np.nonzero(r == TEETH)[0]
if len(k):
    t = np.abs(p[k, 1] - job['mouthY'])
    col[k] = lin('#d6c9ae')[None] * (1 - 0.35 * ss(0.006, 0.011, t))[:, None] * (1 + 0.06 * (fbm(p[k], 600, 2) - 0.5))[:, None]
# eyes: sclera, limbus, iris fibres, pupil (the ICT shell's UV is polar about the cornea pole)
k = np.nonzero(r == EYE)[0]
if len(k):
    eu, ev = o[k, 0] - 0.5, o[k, 1] - 0.5
    rr = np.hypot(eu, ev); ang = np.arctan2(ev, eu)
    scl = lin('#bcae9b')[None] * np.ones((len(k), 1))
    red = ss(0.15, 0.3, rr)
    scl *= (1 - red[:, None] * (1 - np.array([0.96, 0.84, 0.8])[None]))
    vein = vnoise(np.stack([ang * 9, rr * 40, np.zeros_like(rr)], 1))
    scl *= 1 - (0.12 * red * ss(0.62, 0.8, vein))[:, None] * np.array([0, 1, 1])[None]
    iris = lin(job['iris'])[None] * np.ones((len(k), 1))
    fib = vnoise(np.stack([ang * 38, rr * 18, np.zeros_like(rr)], 1)) - 0.5
    fib2 = vnoise(np.stack([ang * 90, rr * 6 + 3, np.zeros_like(rr)], 1)) - 0.5
    iris *= (1 + 0.55 * fib + 0.3 * fib2)[:, None]
    iris *= (1 + 0.45 * np.exp(-((rr - 0.052) / 0.011) ** 2))[:, None]  # lighter collarette
    iris *= (1 - 0.65 * ss(0.108, 0.132, rr))[:, None]  # limbal ring
    pupil = 1 - ss(0.028, 0.034, rr)
    iris = iris * (1 - pupil[:, None]) + np.array([0.006, 0.005, 0.005])[None] * pupil[:, None]
    wI = 1 - ss(0.129, 0.138, rr)
    col[k] = scl * (1 - wI[:, None]) + iris * wI[:, None]
    # lid contact shadow (what ICT's occlusion film does): darken the eye under the upper lid
    # margin (~3 mm) and, less, above the lower one; lid heights by x from the lid contour
    ek = p[k]
    shade = np.ones(len(k))
    for side, ec in (('L', job['eyes']['L']), ('R', job['eyes']['R'])):
        pts = np.array(job['lids'][side])
        if not len(pts): continue
        sel = (np.abs(ek[:, 0] - ec[0]) < 0.02) & (ek[:, 2] > ec[2])
        up = pts[pts[:, 1] > ec[1] - 0.002]; lo = pts[pts[:, 1] <= ec[1] - 0.002]
        def lidY(src, x, pick):
            o = np.argsort(src[:, 0]); return np.interp(x, src[o, 0], src[o, 1])
        x = ek[sel, 0]
        uY = lidY(up, x, max) if len(up) > 1 else np.full(len(x), ec[1] + 0.01)
        lY = lidY(lo, x, min) if len(lo) > 1 else np.full(len(x), ec[1] - 0.01)
        y = ek[sel, 1]
        sh = 1 - 0.72 * ss(0.0045, 0.0, uY - y) - 0.35 * ss(0.0028, 0.0, y - lY)
        # corners: the canthi sit in shadow
        span = np.maximum(1e-4, (np.max(pts[:, 0]) - np.min(pts[:, 0])) / 2); cx = (np.max(pts[:, 0]) + np.min(pts[:, 0])) / 2
        sh *= 1 - 0.35 * ss(0.7, 1.0, np.abs(x - cx) / span)
        shade[np.nonzero(sel)[0]] = np.clip(sh, 0.25, 1)
    col[k] *= shade[:, None]

# --- height field -> normals -----------------------------------------------------------------
H = np.zeros(N)
pores = vnoise(p * 1100) ; pores2 = vnoise(p * 1700 + 5)
poreDen = (0.55 + 0.6 * np.maximum(noseM, cheekM * 0.8) + 0.2 * blob(u, v, 0.5, 0.86, 0.2, 0.05)) * (1 - lipM) * (1 - 0.7 * eyeM) * (1 - hairM) * skinMask
H -= poreDen * (0.9 * np.maximum(0, pores - 0.62) + 0.35 * np.maximum(0, pores2 - 0.6))
H += 0.06 * (fbm(p + 2.2, 700, 2) - 0.5) * skinMask
lipLines = np.sin(2 * np.pi * (u - 0.5) / 0.0022 + 3 * vnoise(p * 600)) * lipM * (0.6 + 0.4 * ss(0.002, 0.015, np.abs(dv)))
H += 0.12 * lipLines
H += 0.05 * np.sin(2 * np.pi * v / 0.011 + 2 * vnoise(p * 150)) * ss(0.8, 0.83, v) * (1 - ss(0.87, 0.9, v)) * isF
H += 0.15 * (stip - 0.5) * hairM
Himg = np.zeros((W, W)); Himg[ii] = H
# gradients only between filled texels (cells never see each other)
gx = np.zeros((W, W)); gy = np.zeros((W, W))
okx = filled[:, 1:] & filled[:, :-1]; oky = filled[1:, :] & filled[:-1, :]
dxs = np.where(okx, Himg[:, 1:] - Himg[:, :-1], 0); dys = np.where(oky, Himg[1:, :] - Himg[:-1, :], 0)
gx[:, 1:] += dxs * 0.5; gx[:, :-1] += dxs * 0.5; gy[1:, :] += dys * 0.5; gy[:-1, :] += dys * 0.5
k_s = 1.4 * (W / 2048)
nx, ny = -gx * k_s, gy * k_s  # image y runs down = -v
nz = np.ones_like(nx)
l = np.sqrt(nx * nx + ny * ny + nz * nz)
nmap = np.stack([nx / l, ny / l, nz / l], -1) * 0.5 + 0.5

def dilate(img, mask, it=12):
    img = img.copy(); m = mask.copy()
    for _ in range(it):
        acc = np.zeros_like(img); cnt = np.zeros(m.shape)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sm = np.roll(m, (dy, dx), (0, 1)); si = np.roll(img, (dy, dx), (0, 1))
            acc += si * sm[..., None]; cnt += sm
        new = (~m) & (cnt > 0)
        img[new] = acc[new] / cnt[new][:, None]; m = m | new
    return img
# --- packed surface data (the card texture's RGB on non-lash texels): roughness, cavity, skin weight
rough = np.full(N, 0.6)
tzone = np.maximum(blob(u, v, 0.5, 0.84, 0.12, 0.06), blob(u, v, 0.5, 0.62, 0.05, 0.1)) * isF
rough -= 0.06 * tzone
rough += 0.04 * cheekM
rough = rough * (1 - lipM) + (0.42 - 0.12 * lipInner) * lipM
rough += 0.06 * (fbm(p + 9.1, 120, 2) - 0.5) * skinMask
rough = np.where(hairM > 0.5, 0.6, rough)
rough[r == EYE] = 0.06
rough[r == TEETH] = 0.22; rough[r == GUMS] = 0.28; rough[r == MOUTH] = 0.35; rough[r == SOCKET] = 0.25
cav = np.ones(N)
cav -= 0.25 * alarM
cav[r == MOUTH] = 0.45; cav[r == SOCKET] = 0.7
skw = np.where(skinMask | (r == GUMS) | (r == MOUTH) | (r == SOCKET), 1.0, 0.0)
pk = np.zeros((W, W, 3)); pk[ii] = np.stack([rough, cav, skw], 1)
pk = dilate(pk, filled)

# --- write (with gutter dilation so mips and bilinear never pull in empty texels) -------------
cimg = np.zeros((W, W, 3)); cimg[ii] = col
cimg = dilate(cimg, filled); nimg = dilate(nmap, filled)
nimg[~filled & (nimg.sum(-1) == 0)] = [0.5, 0.5, 1]
srgb = np.where(cimg <= 0.0031308, 12.92 * cimg, 1.055 * np.clip(cimg, 0, None) ** (1 / 2.4) - 0.055)
Image.fromarray(np.clip(srgb * 255 + 0.5, 0, 255).astype(np.uint8)).save(job['out'] + '_c.webp', 'WEBP', quality=88)
Image.fromarray(np.clip(nimg * 255 + 0.5, 0, 255).astype(np.uint8)).save(job['out'] + '_n.webp', 'WEBP', quality=90)

# --- lash opacity (cards): ICT's lash strips are six bands per eye in v (upper three, lower three),
# u runs along the lid; root at the band's top edge. Individual hairs, tapered, with length jitter.
oimg = np.zeros((W, W, 4))
c0, s0 = 0.75, 0.25
ys, xs = np.mgrid[0:W, 0:W]
U_ = (xs + 0.5) / W; V_ = 1 - (ys + 0.5) / W
fu = ((U_ - c0) / s0 - 0.006) / 0.988; fv = ((V_ - 0.25) / s0 - 0.006) / 0.988
inC = (fu >= 0) & (fu <= 1) & (fv >= 0) & (fv <= 1)
band = np.clip(np.floor(fv * 6), 0, 5); t = fv * 6 - band          # t: 0 tip .. 1 root
upper = band >= 3
NH = np.where(upper, 110.0, 70.0)
lean = np.where(upper, 0.6, -0.4) * (1 - t)                        # hairs fan toward the outer corner
ph = fu * NH + lean * (fu - 0.5) * 2
i = np.floor(ph)
def h1(a): x = np.sin(a * 91.7 + band * 13.1) * 43758.5; return x - np.floor(x)
jit = h1(i) - 0.5
d = np.abs(ph - i - 0.5 - 0.35 * jit)
length = np.where(upper, 0.55, 0.35) + np.where(upper, 0.45, 0.4) * h1(i + 0.37)
length *= 0.45 + 0.55 * np.sin(np.pi * np.clip(fu, 0, 1)) ** 0.5   # shorter at the corners
width = 0.22 * (0.25 + 0.75 * t)
a = (1 - ss(width * 0.6, width, d)) * ss(1 - length - 0.05, 1 - length + 0.05, t) * inC
a *= (h1(i + 0.71) > np.where(upper, 0.08, 0.35))                 # gaps, more on the lower lid
oimg[..., :3] = np.where(inC[..., None], lin(job['brow'])[None, None] * 0.6, pk)
oimg[..., 3] = np.clip(a * 1.15, 0, 1)
srgbO = np.where(oimg[..., :3] <= 0.0031308, 12.92 * oimg[..., :3], 1.055 * oimg[..., :3] ** (1 / 2.4) - 0.055)
Image.fromarray(np.clip(np.concatenate([srgbO, oimg[..., 3:]], -1) * 255 + 0.5, 0, 255).astype(np.uint8), 'RGBA').save(job['out'] + '_o.webp', 'WEBP', quality=90, exact=True)
print('wrote', job['out'] + '_c.webp', job['out'] + '_n.webp', job['out'] + '_o.webp')

# --- per-vertex hair weight (runtime coil shells grow from the scalp where this is > 0) -------
vu, vv = orig[:, 0], orig[:, 1]
vF = reg == FACE; vS = reg == SCALP
au_ = np.abs(vu - 0.5)
hlv = np.where(au_ < 0.3, 0.912 - 0.028 * (au_ / 0.2) ** 2, 0.849 - (au_ - 0.3) * 1.35)
earV = ss(0.12, 0.09, np.minimum(vu, 1 - vu)) * ss(0.44, 0.48, vv) * ss(0.71, 0.67, vv)
hwF = ss(hlv - 0.002, hlv + 0.03, vv) * (1 - earV) * vF
# nape: a soft, slightly V-shaped line (lower at the middle), jittered, fading over ~3 cm
napeY = eyeY - 0.07 - 0.012 * np.exp(-(pos[:, 0] / 0.03) ** 2) + 0.006 * (vnoise(pos * 180) - 0.5)
hwS = ss(napeY, napeY + 0.03, pos[:, 1]) * vS
hw = np.maximum(hwF, hwS)
# brows (same arcs as the albedo, on vertices): short shells grow there at runtime
def browV(side):
    cu = 0.3475 if side < 0 else 0.6525
    t = ((cu - vu) if side < 0 else (vu - cu)) / 0.0775
    vb = 0.769 + 0.011 * (1 - np.clip(t, -1, 1) ** 2) - 0.004 * np.clip(-t, 0, 1)
    th = 0.012 + 0.006 * np.clip(-t, 0, 1) - 0.005 * np.clip(t, 0, 1)
    return ss(-1.1, -0.9, t) * (1 - ss(0.88, 1.06, t)) * (1 - ss(th * 0.5, th * 1.15, np.abs(vv - vb)))
bw = np.maximum(browV(-1), browV(1)) * vF
json.dump({'hair': [int(round(x * 255)) for x in hw], 'brow': [int(round(x * 255)) for x in bw]}, open(job['out'] + '_hair.json', 'w'))
print('brow vertices', int((bw > 0.01).sum()))
print('hair vertices', int((hw > 0.01).sum()))
