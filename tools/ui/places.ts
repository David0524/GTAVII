/**
 * Builds public/data/ui/places.json: every place the map can ever reveal.
 *   npx tsx tools/ui/places.ts
 * Sources, in order:
 *   1. narrative content/places.json + content/cast/leads.json (story places, lead homes). Read from
 *      ./content if present, else from the narrative branch via `git show` (until it merges).
 *   2. subway entrances from the city chunks (public/data/chunks), grouped into stations.
 *   3. generated placeholders for everyday businesses (diners, payphones, call boxes, barbers, fences…)
 *      on real block faces, flagged `placeholder: true` until interiors/narrative supply real ones.
 *      All names are invented (BUSINESS_NAMES rule).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { StreetIndex, shortStreet, normaliseStreet, type StreetRec } from '../../src/ui/map/grid';
import type { Place, PlacesFile, Category } from '../../src/ui/map/places';
import { readChunk } from '../../src/shared/chunkFormat';
import { PLAYABLE, edgeDistance } from '../../src/shared/bounds';

const ROOT = path.resolve(import.meta.dirname, '../..');
const NARRATIVE = 'origin/claude/sharp-maxwell-jnb6hr';
function content(rel: string): string | null {
  const p = path.join(ROOT, 'content', rel);
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  try { return execSync(`git show ${NARRATIVE}:content/${rel}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
}

const streets = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/streets.json'), 'utf8')) as StreetRec[];
const idx = new StreetIndex(streets);
const places: Place[] = [];
const warn: string[] = [];

// deterministic RNG
let seed = 1974_0621;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];

const AVES = ['10th Avenue', '9th Avenue', '8th Avenue', '7th Avenue', '6th Avenue', '5th Avenue', 'Madison Avenue', 'Park Avenue South', 'Lexington Avenue'];
const inside = (x: number, z: number, m = 40) => edgeDistance(x, z) > m;
function addressOf(x: number, z: number): string {
  const s = idx.nearest(x, z, (r) => /Street$/.test(r.n)), a = idx.nearest(x, z, (r) => /Avenue|Broadway/.test(r.n));
  return s.d < a.d ? `${shortStreet(s.name)} nr ${shortStreet(a.name)}` : `${shortStreet(a.name)} nr ${shortStreet(s.name)}`;
}
const tooClose = (x: number, z: number, m: number) => places.some((p) => Math.hypot(p.x - x, p.z - z) < m);

// ------------------------------------------------------------ 1. narrative
const KIND: Record<string, Category> = {
  landmark: 'landmark', sro: 'mission', precinct: 'police', bar: 'bar', residence: 'mission', office: 'mission', diner: 'food',
  garage: 'garage', loft: 'mission', restaurant: 'food', cafe: 'food', shop: 'shop', stand: 'service',
};
const np = content('places.json');
const leads = JSON.parse(content('cast/leads.json') ?? '[]') as { id: string; name: string; home: string }[];
const homes = new Map(leads.map((l) => [l.home, l]));
if (np) {
  for (const p of (JSON.parse(np) as { places: { id: string; name: string; at: string; between?: string[]; side?: string; kind: string; invented: boolean }[] }).places) {
    const at = idx.resolve(p.at, p.between, p.side);
    if (!at) { warn.push(`unresolved narrative place ${p.id} "${p.at}"`); continue; }
    const lead = homes.get(p.id);
    const cat: Category = lead ? 'home' : KIND[p.kind] ?? 'mission';
    const name = p.name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
    places.push({
      id: p.id, name, cat, x: +at[0].toFixed(1), z: +at[1].toFixed(1),
      address: p.between ? `${shortStreet(normaliseStreet(p.at))}, ${shortStreet(normaliseStreet(p.between[0]))}–${shortStreet(normaliseStreet(p.between[1]))}` : p.at.split('&').map((s) => shortStreet(normaliseStreet(s))).join(' & '),
      reveal: lead ? ['start'] : cat === 'landmark' ? ['sight', 'mission'] : ['mission', 'tip', 'enter', 'sight'],
      sightM: 35, lead: lead?.id, source: 'narrative',
      blurb: lead ? `${lead.name.replace(/“.*?”\s*/, '')} lives here.` : undefined,
    });
  }
} else warn.push('narrative places.json not found');

// ------------------------------------------------------------ 2. subway entrances from chunks
const world = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/world.json'), 'utf8'));
const ents: [number, number][] = [];
for (const c of world.chunks as { i: number; j: number }[]) {
  const f = path.join(ROOT, 'public/data/chunks', `${c.i}_${c.j}.bin`);
  if (!fs.existsSync(f)) continue;
  const buf = fs.readFileSync(f);
  const d = readChunk(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const ox = c.i * world.chunkSize, oz = c.j * world.chunkSize;
  for (const p of d.pois) if (p.kind === 2) ents.push([ox + p.x, oz + p.z]);
}
// cluster entrances within 140 m into stations
const stations: { pts: [number, number][] }[] = [];
for (const e of ents) {
  if (!inside(e[0], e[1], 20)) continue;
  const s = stations.find((st) => st.pts.some((q) => Math.hypot(q[0] - e[0], q[1] - e[1]) < 140));
  if (s) s.pts.push(e); else stations.push({ pts: [e] });
}
stations.forEach((st, si) => {
  const cx = st.pts.reduce((s, p) => s + p[0], 0) / st.pts.length, cz = st.pts.reduce((s, p) => s + p[1], 0) / st.pts.length;
  const sn = idx.nearest(cx, cz, (r) => /Street$/.test(r.n)).name;
  const num = sn.match(/(\d+)/)?.[1] ?? '';
  st.pts.forEach((p, k) => places.push({
    id: `ui.subway.${si}.${k}`, name: `${num} St station`, cat: 'subway', x: +p[0].toFixed(1), z: +p[1].toFixed(1), address: addressOf(p[0], p[1]),
    blurb: 'Token 35¢. Stairs down to the mezzanine.', reveal: ['sight', 'enter', 'tip'], sightM: 45, source: 'chunks',
  }));
});

// ------------------------------------------------------------ 3. generated everyday places (placeholders)
function blockFace(): { x: number; z: number; addr: string } | null {
  for (let tries = 0; tries < 40; tries++) {
    const n = 21 + Math.floor(rnd() * 23); // W/E 21st..43rd (story-core bounds)
    const ai = Math.floor(rnd() * (AVES.length - 1));
    const a0 = AVES[ai], a1 = AVES[ai + 1];
    const westSide = ai < 5;
    const st = `${westSide ? 'W' : 'E'} ${n}th St`;
    const p = idx.resolve(st, [a0, a1], rnd() < 0.5 ? 'north' : 'south');
    if (!p) continue;
    // slide along the block face so places don't sit at mid-block exactly
    const dir = idx.direction(normaliseStreet(st), p[0], p[1]);
    const t = (rnd() - 0.5) * 120;
    const x = p[0] + dir[0] * t, z = p[1] + dir[1] * t;
    if (!inside(x, z) || tooClose(x, z, 30)) continue;
    return { x, z, addr: `${shortStreet(normaliseStreet(st))}, ${shortStreet(a0)}–${shortStreet(a1)}` };
  }
  return null;
}
function corner(avenueOnly = true): { x: number; z: number; addr: string } | null {
  for (let tries = 0; tries < 40; tries++) {
    const n = 21 + Math.floor(rnd() * 23);
    const ave = pick(AVES);
    const west = AVES.indexOf(ave) < 6;
    const st = `${west ? 'W' : 'E'} ${n}th St`;
    const p = idx.intersect(normaliseStreet(st), ave);
    if (!p) continue;
    const o = pick([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
    const x = p[0] + o[0] * 11, z = p[1] + o[1] * 11;
    if (!inside(x, z) || tooClose(x, z, avenueOnly ? 60 : 30)) continue;
    return { x, z, addr: `${shortStreet(ave)} & ${shortStreet(normaliseStreet(st))}` };
  }
  return null;
}
type Gen = { cat: Category; names: string[]; n: number; where: 'face' | 'corner'; reveal: Place['reveal']; shady?: boolean; blurb: string[]; hours?: string; sightM?: number };
const GEN: Gen[] = [
  { cat: 'food', n: 14, where: 'corner', reveal: ['sight', 'enter', 'tip', 'news'], hours: '6 AM – midnight', sightM: 30,
    names: ['Acme Luncheonette', 'Olympia Coffee Shop', 'The Parthenon Diner', 'Sal\'s Pizza', 'Hy\'s Deli', 'Lucky Star Coffee Shop', 'Blue Plate Lunch', 'Mike & Gus\'s Grill', 'The Garment Center Cafeteria', 'Rosie\'s Luncheonette', 'Nate\'s Appetizing', 'The Corner Grill', 'Paradise Coffee Shop', 'Joe\'s Hot Dogs', 'Cozy Corner Diner', 'The Silver Spoon'],
    blurb: ['Coffee 25¢, eggs any style 85¢. A plate heals you.', 'Pie under a plastic dome. The counterman knows everybody.', 'Open late. Cops eat here after the four-to-twelve.'] },
  { cat: 'bar', n: 8, where: 'corner', reveal: ['sight', 'enter', 'tip'], hours: '8 AM – 4 AM', sightM: 30,
    names: ['The Blarney Tap', 'Kelly\'s Ale House', 'The Shamrock Inn', 'Jimmy\'s Bar & Grill', 'The Lamplighter', 'The Spigot', 'Murphy\'s Tavern', 'The Last Call'],
    blurb: ['Beer 50¢ a glass. A TV over the bar shows the ball game.', 'Dark wood, a jukebox, a back booth for business.'] },
  { cat: 'clothes', n: 6, where: 'face', reveal: ['sight', 'enter', 'news'], hours: '9 AM – 7 PM', sightM: 30,
    names: ['Weiss Menswear', 'The Fashion Mart', 'Barney Schwartz Clothiers', 'Mod Threads', 'Seventh Ave Outlet', 'Leisure Suit City'],
    blurb: ['Change your look and the witnesses\' description goes stale.', 'Sport coats that hide a revolver. Polyester shirts that don\'t.'] },
  { cat: 'shop', n: 10, where: 'face', reveal: ['sight', 'enter', 'news'], hours: '8 AM – 8 PM', sightM: 30,
    names: ['Kaplan Hardware', 'Midtown Liquors', 'Golden Pawn & Loan', 'The Newsstand at the Corner', 'Ace Records', 'Benny\'s Smoke Shop', 'Lucky Pawnbrokers', 'Sixth Ave Electronics', 'Shapiro Camera Exchange', 'City Drugs'],
    blurb: ['Counter service. Cash only.', 'Everything 1974 money can buy.'] },
  { cat: 'garage', n: 5, where: 'face', reveal: ['sight', 'enter', 'tip'], hours: '24 hours', sightM: 35,
    names: ['Westside Auto Repair', 'Tenth Ave Garage', 'Al\'s Service Station', 'Hudson Motors', 'Midtown Park & Lock'],
    blurb: ['Repairs, tyres and a tune-up. Period parts only.', 'Monthly parking. The attendant doesn\'t ask questions.'] },
  { cat: 'service', n: 10, where: 'face', reveal: ['sight', 'enter', 'tip'], hours: '9 AM – 6 PM', sightM: 30,
    names: ['Tony\'s Barber Shop', 'Master Tailor & Alterations', 'Fifth Avenue Trust (branch)', 'Spin-Kleen Laundromat', 'Ace Locksmith', 'Sid\'s Shoe Repair', 'Rapid Photo Lab', 'Ideal Dry Cleaners', 'Uptown Barbers', 'Garment Center Savings Bank'],
    blurb: ['Haircuts, shaves, sideburns trimmed to the period.', 'A savings account keeps money safe from cops and muggers.'] },
  { cat: 'job', n: 5, where: 'face', reveal: ['tip', 'news', 'card', 'call'], sightM: 0,
    names: ['A-1 Bail Bonds', 'The Night Desk (tabloid)', 'Garment Rush Dispatch', 'Kowalski Towing', 'Lockout Line (locksmith call-outs)'],
    blurb: ['A board of skips with descriptions and rewards.', 'They pay for prints that beat the morning edition.', 'Push racks against the clock.'] },
  { cat: 'crime', n: 8, where: 'face', reveal: ['tip', 'overheard', 'mission', 'card'], shady: true, sightM: 0,
    names: ['The fence (back of a TV repair)', 'Chop shop under the West Side tracks', 'Card game above the laundromat', 'Numbers drop (candy store)', 'Gun seller (car trunk)', 'Loan shark\'s booth', 'Pool-hall back room', 'Second fence (jewellery buyer)'],
    blurb: ['They don\'t ask where it came from. They do ask for a cut.', 'Weekly wanted list pinned behind the door.'] },
  { cat: 'forsale', n: 5, where: 'face', reveal: ['sight', 'news', 'tip'], sightM: 30,
    names: ['Laundromat for sale', 'Parking garage for sale', 'Newsstand lease', 'Pool hall for sale', 'Diner for sale'],
    blurb: ['A FOR SALE sign in the window and a phone number in exchange format.'] },
  { cat: 'stranger', n: 5, where: 'corner', reveal: ['sight', 'tip', 'overheard'], sightM: 30,
    names: ['A man with a lost wallet', 'A woman waiting by a payphone', 'Old man feeding pigeons', 'The street preacher', 'A cabbie with a flat'],
    blurb: ['Someone who might need a hand. Or might be trouble.'] },
  { cat: 'hospital', n: 1, where: 'face', reveal: ['sight', 'tip', 'mission'], sightM: 60,
    names: ['Hospital (name pending, narrative)'], blurb: ['Emergency room. You wake up here when it goes wrong.'] },
  { cat: 'payphone', n: 32, where: 'corner', reveal: ['sight'], sightM: 22, names: ['Payphone'], blurb: ['10¢ a call. Contacts and jobs ring through here.'] },
  { cat: 'callbox', n: 16, where: 'corner', reveal: ['sight'], sightM: 22, names: ['Police call box'], blurb: ['Red post with a handset. Witnesses run to these to report you.'] },
];
for (const g of GEN) {
  for (let k = 0; k < g.n; k++) {
    const at = g.where === 'face' ? blockFace() : corner(g.cat === 'payphone' || g.cat === 'callbox');
    if (!at) { warn.push(`could not place ${g.cat} #${k}`); continue; }
    places.push({
      id: `ui.${g.cat}.${k}`, name: g.names[k % g.names.length], cat: g.cat, x: +at.x.toFixed(1), z: +at.z.toFixed(1), address: at.addr,
      blurb: g.blurb[k % g.blurb.length], reveal: g.reveal, sightM: g.sightM, shady: g.shady, hours: g.hours, source: 'generated', placeholder: true,
    });
  }
}

const out: PlacesFile = { format: 't74-ui-places', version: 1, generatedFrom: ['content/places.json', 'content/cast/leads.json', 'public/data/chunks (subway)', 'generated placeholders'], places };
const dir = path.join(ROOT, 'public/data/ui');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'places.json'), JSON.stringify(out));
const by = places.reduce<Record<string, number>>((m, p) => ((m[p.cat] = (m[p.cat] ?? 0) + 1), m), {});
console.log(`places: ${places.length}`, by, `stations: ${stations.length}`);
for (const w of warn) console.warn('WARN', w);
void PLAYABLE;
