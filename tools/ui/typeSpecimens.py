#!/usr/bin/env python3
"""Type-direction specimen sheets (docs/research/TYPE_DIRECTIONS.md). Run from a work dir holding fonts/ (TeX Gyre from
CTAN fonts/tex-gyre.zip; Libre Franklin, News Cycle, Cutive Mono from github.com/google/fonts), crops/, still_title.png and
wm.svg (tools/ui/wordmark.py), plus a render.cjs in ../bin. Renders type_A/B/C.png."""
import json, os, subprocess, html
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = '/home/user/GTAVII'
news = json.load(open(f'{ROOT}/content/newspapers.json'))['pages'][0]
mission = json.load(open(f'{ROOT}/content/missions/dusk_on_broadway.json'))
STREET = f'{ROOT}/references/img/documerica_549323.jpg'

FACES = {
  'Heros': [('texgyreheros-regular.otf', 400), ('texgyreheros-bold.otf', 700)],
  'HerosCn': [('texgyreheroscn-regular.otf', 400), ('texgyreheroscn-bold.otf', 700)],
  'Adventor': [('texgyreadventor-regular.otf', 400), ('texgyreadventor-bold.otf', 700)],
  'Bonum': [('texgyrebonum-regular.otf', 400), ('texgyrebonum-bold.otf', 700), ('texgyrebonum-italic.otf', '400 italic')],
  'Schola': [('texgyreschola-regular.otf', 400), ('texgyreschola-bold.otf', 700), ('texgyreschola-italic.otf', '400 italic')],
  'Cursor': [('texgyrecursor-regular.otf', 400), ('texgyrecursor-bold.otf', 700)],
  'Franklin': [('LibreFranklin[wght].ttf', '100 900')],
  'NewsCycle': [('NewsCycle-Regular.ttf', 400), ('NewsCycle-Bold.ttf', 700)],
  'CutiveMono': [('CutiveMono-Regular.ttf', 400)],
}

def fontface():
    out = []
    for fam, files in FACES.items():
        for f, w in files:
            style = 'italic' if 'italic' in str(w) else 'normal'
            wt = str(w).replace(' italic', '')
            out.append(f"@font-face{{font-family:'{fam}';src:url('fonts/{f}');font-weight:{wt};font-style:{style}}}")
    return '\n'.join(out)

DIRS = [
 dict(key='A', name='Transit Authority',
      pitch='The 1970 NYCTA standard (Unimark): one neo-grotesque for everything you navigate by, white on black plates, one colour per meaning. Newspaper and briefing text in Century, the city\'s workhorse book face. Case files in Courier, the face on every precinct Selectric.',
      ui='Heros', cond='HerosCn', head='Franklin', body='Schola', typed='Cursor',
      faces=[('TeX Gyre Heros', 'Helvetica class: HUD, menus, map, signs', 'GUST Font License (LPPL 1.3c)'),
             ('TeX Gyre Heros Cn', 'Condensed: tabs, street plates, headlines', 'GUST Font License'),
             ('Libre Franklin', 'Franklin Gothic class: newspaper heads', 'SIL OFL 1.1'),
             ('TeX Gyre Schola', 'Century Schoolbook class: body, briefings', 'GUST Font License'),
             ('TeX Gyre Cursor', 'Courier class: typed case files', 'GUST Font License')],
      ink='#111', paper='#f4f1ea', accent='#e8a317', accent2='#c8361f', panel='#111', panelInk='#f5f5f0',
      menuStyle='plate'),
 dict(key='B', name='Madison Avenue ’74',
      pitch='The commercial look of 1974: Avant Garde Gothic on ads, record sleeves and bank windows, Bookman in magazines and menus, News Gothic on tickets and forms. Warmer and more of its moment; the HUD stays plain.',
      ui='NewsCycle', cond='HerosCn', head='Adventor', body='Bonum', typed='CutiveMono',
      faces=[('TeX Gyre Adventor', 'ITC Avant Garde class: titles, menu heads', 'GUST Font License'),
             ('News Cycle', 'News Gothic class: HUD, map, forms', 'SIL OFL 1.1'),
             ('TeX Gyre Bonum', 'Bookman class: body, briefings, newspaper text', 'GUST Font License'),
             ('Cutive Mono', 'IBM-style typewriter: case files', 'SIL OFL 1.1')],
      ink='#2a1d14', paper='#efe6d2', accent='#d9822b', accent2='#8a3b1e', panel='#2a1d14', panelInk='#f3e7cf',
      menuStyle='rule'),
 dict(key='C', name='Tabloid',
      pitch='The Daily News at the newsstand: Franklin Gothic in every weight from the headline down to the HUD, condensed for street names, Bookman for the reading text. Black, white and one tabloid red. Loud where it counts, quiet everywhere else.',
      ui='Franklin', cond='HerosCn', head='Franklin', body='Bonum', typed='Cursor',
      faces=[('Libre Franklin', 'Franklin Gothic class: HUD, menus, headlines', 'SIL OFL 1.1'),
             ('TeX Gyre Heros Cn', 'Condensed: street plates, map labels', 'GUST Font License'),
             ('TeX Gyre Bonum', 'Bookman class: body, briefings', 'GUST Font License'),
             ('TeX Gyre Cursor', 'Courier class: typed case files', 'GUST Font License')],
      ink='#0d0d0d', paper='#f2efe8', accent='#d7261e', kick='#ffffffb0', accent2='#d7261e', panel='#0d0d0d', panelInk='#fff',
      menuStyle='bar'),
]

REFS = [('crops/nycta.jpg', 'NYCTA Graphics Standards Manual, 1970: Standard Medium, the subway\'s sign face'),
        ('crops/hamburgers.jpg', '42nd St subway arcade, July 1974: condensed gothic fascia'),
        ('crops/lottery.jpg', 'Lexington Ave newsstand, April 1974: bold grotesque on a yellow plate'),
        ('crops/freegifts.jpg', 'Herald Square store opening, 1973: brush script on a card sign')]


def page(d):
    e = html.escape
    objectives = [o['text'] for o in mission['objectives']][:5]
    items = news['items']
    css = f"""
{fontface()}
:root{{--ink:{d['ink']};--paper:{d['paper']};--acc:{d['accent']};--acc2:{d['accent2']};--panel:{d['panel']};--pink:{d['panelInk']};--kick:{d.get('kick', d['accent'])};
 --ui:'{d['ui']}';--cond:'{d['cond']}';--head:'{d['head']}';--body:'{d['body']}';--typed:'{d['typed']}'}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{width:1600px;background:#d9d6cf;font-family:var(--ui);color:var(--ink);padding:40px}}
.h{{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid var(--ink);padding-bottom:14px;margin-bottom:22px}}
.h h1{{font:700 54px/1 var(--ui);letter-spacing:-.01em}}
.h .k{{font:700 120px/0.8 var(--cond);color:var(--ink)}}
.pitch{{font:400 19px/1.45 var(--body);max-width:1100px;margin-bottom:22px}}
.faces{{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:26px}}
.faces div{{background:#fff;padding:10px 12px;font:400 13px/1.35 var(--ui)}}
.faces b{{display:block;font-size:15px}}.faces i{{font-style:normal;opacity:.6}}
.lbl{{font:700 12px/1 var(--ui);letter-spacing:.14em;text-transform:uppercase;margin:26px 0 10px;opacity:.7}}
.refs{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}}
.refs figure{{background:#fff;padding:6px}} .refs img{{width:100%;height:170px;object-fit:cover;display:block}}
.refs figcaption{{font:400 12px/1.3 var(--ui);padding:6px 2px 2px}}
.row{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}
.frame{{position:relative;aspect-ratio:16/9;overflow:hidden;background:#000}}
.frame>img.bg{{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:brightness(.55) saturate(.9)}}
/* title */
.title .wm{{position:absolute;left:6%;top:13%;width:60%}}
.title .bg{{transform:scale(1.32);filter:brightness(.42) saturate(.8)!important}}
.menu{{position:absolute;left:6%;top:44%;width:34%}}
.menu div{{font:400 20px/1 var(--ui);color:var(--pink);padding:8px 12px;}}
.plate .menu div.on{{background:var(--pink);color:var(--panel);font-weight:700}}
.plate .menu div.on::before{{content:'';display:inline-block;width:12px;height:12px;border-radius:50%;background:var(--acc);margin-right:10px;vertical-align:1px}}
.rule .menu div{{font-family:var(--head);text-transform:lowercase;font-size:25px;padding-left:0}}
.rule .menu div.on{{color:var(--acc)}}
.rule .menu div.on::after{{content:'';display:block;height:3px;background:var(--acc);width:60px;margin-top:6px}}
.bar .menu div{{text-transform:uppercase;font-weight:600;letter-spacing:.02em;font-size:22px}}
.bar .menu div.on{{border-left:8px solid var(--acc);padding-left:14px;font-weight:800;color:#fff}}
.foot{{position:absolute;left:6%;bottom:5%;font:400 13px/1 var(--ui);color:var(--pink);opacity:.75}}
/* hud */
.clock{{position:absolute;right:3%;top:5%;text-align:right;color:#fff}}
.clock b{{font:700 34px/1 var(--ui);display:block;font-variant-numeric:tabular-nums}} .clock span{{font:400 14px/1.4 var(--ui);letter-spacing:.08em;text-transform:uppercase}}
.cash{{position:absolute;right:3%;top:20%;font:700 24px/1 var(--ui);color:#fff}}
.obj{{position:absolute;left:3%;top:5%;color:#fff;max-width:40%}}
.obj span{{font:700 11px/1 var(--ui);letter-spacing:.16em;text-transform:uppercase;color:var(--kick);display:block;margin-bottom:6px}}
.obj b{{font:400 20px/1.25 var(--ui)}}
.sub{{position:absolute;left:3%;bottom:7%;text-align:left;color:#fff;font:400 22px/1.35 var(--ui);width:52%;text-shadow:0 1px 3px #000}}
.sub i{{font-style:normal;color:var(--acc);font-weight:700}}
.plateSign{{position:absolute;right:3%;bottom:6%;background:#111;color:#fff;padding:10px 16px 12px;border-top:4px solid #fff;outline:2px solid #111}}
.plateSign b{{font:700 30px/1 var(--cond);display:block;letter-spacing:.01em}} .plateSign span{{font:400 13px/1.2 var(--ui)}}
/* map */
.map{{background:var(--paper);position:relative;aspect-ratio:10/11;overflow:hidden}}
.map svg{{position:absolute;inset:0;width:100%;height:100%}}
/* paper */
.paper{{background:var(--paper);padding:26px 30px;aspect-ratio:10/11;overflow:hidden}}
.mast{{font:900 54px/0.95 var(--head);text-align:center;letter-spacing:-.01em;border-bottom:2px solid var(--ink);padding-bottom:8px}}
.dateline{{display:flex;justify-content:space-between;font:400 12px/1 var(--ui);padding:6px 0;border-bottom:5px solid var(--ink);margin-bottom:12px;text-transform:uppercase;letter-spacing:.06em}}
.hl{{font:800 52px/0.92 var(--head);text-transform:uppercase;letter-spacing:-.015em}}
.dek{{font:italic 400 21px/1.25 var(--body);margin:10px 0 12px}}
.cols{{columns:2;column-gap:22px;font:400 14px/1.4 var(--body)}} .cols p{{margin-bottom:6px}} .cols b{{font-family:var(--head);font-weight:700}}
/* brief */
.brief{{background:var(--paper);padding:30px 34px;aspect-ratio:10/11;overflow:hidden;position:relative}}
.brief .kicker{{font:700 13px/1 var(--ui);letter-spacing:.16em;text-transform:uppercase;color:var(--acc2)}}
.brief h2{{font:700 50px/1 var(--head);margin:10px 0 4px}}
.brief .when{{font:400 16px/1 var(--ui);opacity:.75;margin-bottom:18px}}
.brief ol{{list-style:none;counter-reset:o}} .brief li{{counter-increment:o;font:400 19px/1.3 var(--body);padding:7px 0;border-top:1px solid #0002;display:flex;gap:14px}}
.brief li::before{{content:counter(o);font:700 19px/1.3 var(--ui);width:22px;color:var(--acc2)}}
.typed{{margin-top:22px;background:#fff;padding:14px 16px;font:400 14px/1.45 var(--typed);box-shadow:0 1px 0 #0003}}
"""
    sts = ['W 36TH ST','W 35TH ST','W 34TH ST','W 33RD ST','W 32ND ST','W 31ST ST','W 30TH ST','W 29TH ST','W 28TH ST']
    ys = [70 + 92 * k for k in range(len(sts))]
    grid = ''.join(f'<line x1="-10" y1="{y}" x2="810" y2="{y}" stroke-width="10"/>' for y in ys)
    grid += ''.join(f'<line x1="{x}" y1="-10" x2="{x-170}" y2="900" stroke-width="20"/>' for x in (150, 420, 690))
    labels = ''.join(f'<text x="22" y="{y-8}">{t}</text>' for t, y in zip(sts, ys))
    map_svg = f"""<svg viewBox="0 0 800 880" preserveAspectRatio="xMidYMid slice" font-family="{d['cond']}">
 <g stroke="#fff">{grid}<line x1="250" y1="-10" x2="700" y2="900" stroke-width="22"/></g>
 <path d="M426 346 L517 530 L589 530" fill="none" stroke="{d['accent2']}" stroke-width="6"/>
 <circle cx="426" cy="346" r="9" fill="{d['accent2']}"/><rect x="579" y="520" width="20" height="20" fill="{d['accent']}"/>
 <g fill="{d['ink']}" font-size="17" letter-spacing=".02em">{labels}
  <text transform="translate(118 860) rotate(-79.4)">SEVENTH AVE</text><text transform="translate(388 860) rotate(-79.4)">SIXTH AVE</text><text transform="translate(658 860) rotate(-79.4)">FIFTH AVE</text>
  <text transform="translate(285 40) rotate(63.4)" font-weight="700">BROADWAY</text>
 </g>
 <text x="430" y="300" font-family="{d['ui']}" font-size="24" font-weight="700" letter-spacing=".3em" fill="{d['ink']}" opacity=".5">HERALD SQ</text>
 <text x="40" y="580" font-family="{d['ui']}" font-size="20" font-weight="700" letter-spacing=".3em" fill="{d['ink']}" opacity=".45">GARMENT CENTER</text>
 <g font-family="{d['ui']}"><rect x="560" y="30" width="220" height="140" fill="{d['paper']}" stroke="{d['ink']}" stroke-width="1.5"/>
  <text x="576" y="62" font-size="16" font-weight="700" fill="{d['ink']}">MIDTOWN MANHATTAN</text>
  <text x="576" y="84" font-size="13" fill="{d['ink']}">Street guide, 1974 edition</text>
  <circle cx="584" cy="114" r="7" fill="{d['accent2']}"/><text x="600" y="119" font-size="14" fill="{d['ink']}">Your route</text>
  <rect x="577" y="135" width="14" height="14" fill="{d['accent']}"/><text x="600" y="147" font-size="14" fill="{d['ink']}">Job: The Corwin</text></g>
</svg>"""
    faces_html = ''.join(f'<div><b>{e(n)}</b>{e(r)}<br><i>{e(l)}</i></div>' for n, r, l in d['faces'])
    refs = ''.join(f'<figure><img src="{src}"><figcaption>{e(c)}</figcaption></figure>' for src, c in REFS)
    menu = ''.join(f'<div class="{"on" if i == 0 else ""}">{t}</div>' for i, t in enumerate(['Continue', 'New Game', 'Load', 'Settings', 'Credits']))
    return f"""<!doctype html><meta charset="utf-8"><style>{css}</style>
<div class="h"><div><div class="lbl" style="margin:0 0 8px">Type direction</div><h1>{e(d['name'])}</h1></div><div class="k">{d['key']}</div></div>
<p class="pitch">{e(d['pitch'])}</p>
<div class="faces">{faces_html}</div>
<div class="lbl">What was on the street (public domain: DOCUMERICA / NARA; NYCTA manual 1970)</div>
<div class="refs">{refs}</div>
<div class="lbl">Title and HUD (photo: DOCUMERICA, Chambers St 1973, stands in for the game frame)</div>
<div class="row">
 <div class="frame title {d['menuStyle']}"><img class="bg" src="still_title.png"><img class="wm" src="wm.svg"><div class="menu">{menu}</div><div class="foot">A · Select&nbsp;&nbsp;&nbsp;B · Back</div></div>
 <div class="frame"><img class="bg" src="{STREET}">
  <div class="obj"><span>Objective</span><b>{e(objectives[1])}</b></div>
  <div class="clock"><b>8:14 PM</b><span>Fri · June 21</span></div><div class="cash">$212</div>
  <div class="sub"><i>MAYHEW</i>&nbsp; You still walk it like you got a post, Teddy.</div>
  <div class="plateSign"><b>Broadway &amp; W 31 St</b><span>Herald Square · Garment Center</span></div>
 </div>
</div>
<div class="lbl">Map, newspaper, mission briefing</div>
<div class="row" style="grid-template-columns:1fr 1fr 1fr">
 <div class="map">{map_svg}</div>
 <div class="paper"><div class="mast">The Daily Ticker</div><div class="dateline"><span>New York, Friday, June 21, 1974</span><span>15¢</span></div>
  <div class="hl">{e(news['headline'])}</div><div class="dek">{e(news['subhead'])}</div>
  <div class="cols">{''.join(f'<p><b>{e(t)}.</b> The story continues on page {i+3}.</p>' for i, t in enumerate(items))}</div></div>
 <div class="brief"><div class="kicker">Mission 1 · Act One</div><h2>{e(mission['title'])}</h2><div class="when">Friday, June 21, 1974 · 8:30 PM · Madison Square</div>
  <ol>{''.join(f'<li>{e(t)}</li>' for t in objectives[:4])}</ol>
  <div class="typed">COMPLAINT REPORT 61 · PCT 14<br>Subj. MAYHEW, Francis X.<br>Last seen Bway &amp; 31 St, 2030 hrs.</div></div>
</div>
"""


for d in DIRS:
    p = os.path.join(HERE, f"type_{d['key']}.html")
    open(p, 'w').write(page(d))
    subprocess.run(['node', os.path.join(HERE, '..', 'bin', 'render.cjs'), p, os.path.join(HERE, f"type_{d['key']}.png"), '1600', 'full'],
                   env={**os.environ, 'NODE_PATH': subprocess.check_output(['npm', 'root', '-g'], text=True).strip()}, check=True)
    print(p)
