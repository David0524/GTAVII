#!/usr/bin/env python3
"""Builds the UI's self-hosted fonts (type direction A, chosen by the user): Latin WOFF2 subsets.
TeX Gyre subsets are renamed "T74 <family>" (the GUST Font License asks modified versions to carry new
names; a subset counts as modified). Libre Franklin is OFL without a Reserved Font Name: name kept.
Sources: CTAN fonts/tex-gyre.zip (opentype/), github.com/google/fonts ofl/librefranklin.
    python3 tools/fonts/build_fonts.py <tex-gyre opentype dir> <LibreFranklin[wght].ttf>
"""
import sys, os
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib import instancer

GYRE, FRANKLIN = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'fonts')
UNICODES = 'U+0000-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2122,U+2190-2193,U+2212,U+2215'
FILES = [  # (source, family, style name, weight, italic, output)
  ('texgyreheros-regular.otf', 'T74 Heros', 'Regular', 400, False, 'T74Heros-400.woff2'),
  ('texgyreheros-bold.otf', 'T74 Heros', 'Bold', 700, False, 'T74Heros-700.woff2'),
  ('texgyreheroscn-regular.otf', 'T74 Heros Cn', 'Regular', 400, False, 'T74HerosCn-400.woff2'),
  ('texgyreheroscn-bold.otf', 'T74 Heros Cn', 'Bold', 700, False, 'T74HerosCn-700.woff2'),
  ('texgyreschola-regular.otf', 'T74 Schola', 'Regular', 400, False, 'T74Schola-400.woff2'),
  ('texgyreschola-italic.otf', 'T74 Schola', 'Italic', 400, True, 'T74Schola-400i.woff2'),
  ('texgyreschola-bold.otf', 'T74 Schola', 'Bold', 700, False, 'T74Schola-700.woff2'),
  ('texgyrecursor-regular.otf', 'T74 Cursor', 'Regular', 400, False, 'T74Cursor-400.woff2'),
]

def opts():
    o = subset.Options(); o.flavor = 'woff2'; o.layout_features = ['kern', 'liga', 'tnum', 'lnum', 'case']; o.name_IDs = ['*']; o.notdef_outline = True
    return o

def rename(f, family, style):
    n = f['name']
    for rec in list(n.names):
        if rec.nameID in (1, 3, 4, 6, 16, 17): n.removeNames(nameID=rec.nameID)
    full = f'{family} {style}'.replace(' Regular', '')
    ps = full.replace(' ', '')
    for nid, val in ((1, family), (2, style), (3, f'{ps};T74 subset of TeX Gyre'), (4, full), (6, ps)):
        n.setName(val, nid, 3, 1, 0x409); n.setName(val, nid, 1, 0, 0)

uni = subset.parse_unicodes(UNICODES)
for src, fam, style, _w, _i, out in FILES:
    f = TTFont(os.path.join(GYRE, src))
    s = subset.Subsetter(opts()); s.populate(unicodes=uni); s.subset(f)
    rename(f, fam, style)
    f.flavor = 'woff2'; f.save(os.path.join(OUT, out)); print(out, os.path.getsize(os.path.join(OUT, out)))

f = TTFont(FRANKLIN, lazy=False)
s = subset.Subsetter(opts()); s.populate(unicodes=uni); s.subset(f)
f = instancer.instantiateVariableFont(f, {'wght': (500, 900)})
f.flavor = 'woff2'; f.save(os.path.join(OUT, 'LibreFranklin-500-900.woff2')); print('LibreFranklin-500-900.woff2', os.path.getsize(os.path.join(OUT, 'LibreFranklin-500-900.woff2')))
