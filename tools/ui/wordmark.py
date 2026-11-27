#!/usr/bin/env python3
"""Title wordmark for Tenderloin '74: constructed lettering, not a font.

A tall condensed gothic built on a stroke skeleton (the way a sign painter or title letterer lays
out letters on a grid), drawn with a heavy stroke and an inline stripe cut through it. Original
geometry; it imitates no film title. Writes an SVG with plain paths (stroke + inline), so any
renderer shows it identically.

    python3 tools/ui/wordmark.py [out.svg] [--fill #hex] [--inline #hex] [--bg #hex|none]
"""
import sys

H = 100.0        # cap height
S = 17.0         # stem weight
R = 15.0         # corner radius on the skeleton
GAP = 7.0        # letter spacing
a = S / 2


def cell(w):
    return dict(w=w, b=w - S / 2, top=a, bot=H - a, mid=H * 0.5)


def T(w=50):
    c = cell(w)
    return w, [f"M0,{a} H{w}", f"M{w/2},{a} V{H}"]


def E(w=40):
    c = cell(w)
    return w, [f"M{w},{a} H{a} V{H-a} H{w}", f"M{a},{H*0.48} H{w-5}"]


def N(w=48):
    c = cell(w)
    return w, [f"M{a},{H} V{a} L{c['b']},{H-a} V0"]


def D(w=48):
    c = cell(w); b = c['b']
    return w, [f"M{a},{a} H{b-R} Q{b},{a} {b},{a+R} V{H-a-R} Q{b},{H-a} {b-R},{H-a} H{a} Z"]


def R_(w=48):
    c = cell(w); b = c['b']; m = H * 0.52
    return w, [f"M{a},{H} V{a} H{b-R} Q{b},{a} {b},{a+R} V{m-a-R*0.6} Q{b},{m-a} {b-R*0.6},{m-a} H{a}",
               f"M{w*0.46},{m-a} L{b},{H-a*0.2} V{H}"]


def L(w=40):
    return w, [f"M{a},0 V{H-a} H{w}"]


def O(w=50):
    c = cell(w); b = c['b']; r = R * 1.25
    return w, [f"M{a+r},{a} H{b-r} Q{b},{a} {b},{a+r} V{H-a-r} Q{b},{H-a} {b-r},{H-a} H{a+r} Q{a},{H-a} {a},{H-a-r} V{a+r} Q{a},{a} {a+r},{a} Z"]


def I(w=S):
    return w, [f"M{a},0 V{H}"]


def APOS(w=S * 0.9):
    # a solid wedge (filled, no inline), falling from the cap line
    return w, [f"FILL M{w*0.25},0 H{w} L{w*0.45},{H*0.34} H0 Z"]


def SEVEN(w=46):
    c = cell(w); b = c['b']
    return w, [f"M0,{a} H{b} L{w*0.34},{H}"]


def FOUR(w=50):
    c = cell(w); b = c['b']
    return w, [f"M{w*0.66},{H} V0 L{a*0.6},{H*0.66} H{w}"]


GLYPHS = {'T': T, 'E': E, 'N': N, 'D': D, 'R': R_, 'L': L, 'O': O, 'I': I, "'": APOS, '7': SEVEN, '4': FOUR}


GLYPH_W = {}


def word(text, x0=0.0, y0=0.0, scale=1.0):
    paths, x = [], x0
    for ch in text:
        if ch == ' ':
            x += 26 * scale
            continue
        w, ps = GLYPHS[ch]()
        GLYPH_W[(round(x, 2), round(y0, 2))] = w
        for p in ps:
            paths.append((p, x, y0, scale))
        x += (w + GAP) * scale
    return paths, x - GAP * scale


def svg(fill='#f1e6cf', inline='#16120d', bg='#16120d', rule=True, shadow=None, inline_w=0.14):
    big, wx = word('TENDERLOIN')
    # the year sits right of the name at 70% height, bottom-aligned
    sc = 0.7
    yr, wy = word("'74", wx + 14, H * (1 - sc), sc)
    W = wy + 2
    Ht = H + (34 if rule else 0)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 {W+24:.1f} {Ht+24:.1f}" role="img" aria-label="Tenderloin \'74">']
    if bg != 'none':
        out.append(f'<rect x="-12" y="-12" width="{W+24:.1f}" height="{Ht+24:.1f}" fill="{bg}"/>')
    # every glyph is clipped to its own cell, so joins end in flat cuts on the cap and base lines
    # (painted-letter terminals) instead of miter spikes
    out.append('<defs>')
    cells = {}
    for i, (p, x, y, s) in enumerate(big + yr):
        key = (round(x, 2), round(y, 2), s)
        if key not in cells:
            ch_w = next(w for w in [GLYPH_W[(round(x,2), round(y,2))]])
            cells[key] = f'c{len(cells)}'
            out.append(f'<clipPath id="{cells[key]}"><rect x="{x:.2f}" y="{y:.2f}" width="{ch_w*s:.2f}" height="{H*s:.2f}"/></clipPath>')
    out.append('</defs>')
    def layer(items, sw, col, dx=0, dy=0, inline_pass=False):
        g = [f'<g fill="none" stroke="{col}" stroke-linejoin="miter" stroke-miterlimit="10" stroke-linecap="butt">']
        for p, x, y, s in items:
            cid = cells[(round(x, 2), round(y, 2), s)]
            t = f'translate({x+dx:.2f} {y+dy:.2f}) scale({s})'
            if p.startswith('FILL '):
                if not inline_pass: g.append(f'<g clip-path="url(#{cid})"><path transform="{t}" d="{p[5:]}" fill="{col}" stroke="none"/></g>')
                continue
            g.append(f'<g clip-path="url(#{cid})"><path transform="{t}" d="{p}" stroke-width="{sw/s:.2f}"/></g>')
        g.append('</g>')
        return g
    allp = big + yr
    if shadow:
        out += layer(allp, S, shadow, 5, 5)
    out += layer(allp, S, fill)
    if inline_w:
        out += layer(allp, S * inline_w, inline, inline_pass=True)   # the inline stripe
    if rule:
        # a single heavy rule under the name, broken where the year sits
        out.append(f'<rect x="0" y="{H+16}" width="{wx:.1f}" height="7" fill="{fill}"/>')
        out.append(f'<rect x="{wx+14:.1f}" y="{H+16}" width="{wy-wx-14:.1f}" height="7" fill="{fill}"/>')
    out.append('</svg>')
    return '\n'.join(out)


if __name__ == '__main__':
    args = sys.argv[1:]
    def opt(k, d):
        return args[args.index(k) + 1] if k in args else d
    path = next((x for x in args if x.endswith('.svg')), 'wordmark.svg')
    open(path, 'w').write(svg(opt('--fill', '#f1e6cf'), opt('--inline', '#16120d'), opt('--bg', '#16120d'),
                              shadow=opt('--shadow', None), inline_w=float(opt('--inline-w', '0.14'))))
    print(path)
