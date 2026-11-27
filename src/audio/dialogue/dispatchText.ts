/**
 * Police dispatch text → speakable fragments. Shared by the build-time renderer (tools/audio/voices.ts renders
 * every fragment in DISPATCH_VOCAB with the dispatch voices) and the runtime scanner (world/dispatch.ts), so
 * both normalise text identically and the runtime can stitch any line the vocabulary covers.
 *
 * Why stitched: gameplay's radio calls are free text built at runtime ("Midtown Central, shots fired at West
 * Thirty-First and Eighth. Male, thirties, tan leisure suit…") and narrative's police_radio lines are templates
 * with {placeholders}. Neither can be rendered whole ahead of time, so fragments are (phrases first, words as
 * the fallback, the APCO phonetic alphabet for plates), and anything outside the vocabulary is a burst of
 * radio garble: the subtitle still carries the full text.
 */

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORD1: Record<string, string> = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
export function numberWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numberWords(n % 100) : '');
  return String(n).split('').map((d) => ONES[+d]).join(' ');
}
export function ordinalWords(n: number): string {
  const w = numberWords(n); const parts = w.split(/([ -])/); const last = parts.pop()!;
  const o = ORD1[last] ?? (last.endsWith('y') ? last.slice(0, -1) + 'ieth' : last + 'th');
  return parts.join('') + o;
}
/** APCO phonetic alphabet, as used by US police radio in the 1970s. */
export const PHONETIC: Record<string, string> = { a: 'adam', b: 'boy', c: 'charles', d: 'david', e: 'edward', f: 'frank', g: 'george', h: 'henry', i: 'ida', j: 'john', k: 'king', l: 'lincoln', m: 'mary', n: 'nora', o: 'ocean', p: 'paul', q: 'queen', r: 'robert', s: 'sam', t: 'tom', u: 'union', v: 'victor', w: 'william', x: 'x-ray', y: 'young', z: 'zebra' };

/** Lower-case spoken form: numbers and ordinals as words, plates spelled, abbreviations expanded, pauses as ','. */
export function normalise(text: string): string {
  let s = ' ' + text.replace(/…/g, ' , ').replace(/[{}]/g, '') + ' ';
  s = s.replace(/\bplate starting ([A-Z0-9]{1,8})\b/gi, (_m, p: string) => 'plate starting ' + p.split('').map((c) => (/\d/.test(c) ? ONES[+c] : PHONETIC[c.toLowerCase()] ?? '')).join(' '));
  s = s.replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_m, n: string) => ordinalWords(+n));
  s = s.replace(/\b\d+\b/g, (n) => numberWords(+n));
  s = s.replace(/\bW\.? (?=[a-z])/gi, 'west ').replace(/\bE\.? (?=[a-z])/gi, 'east ').replace(/\bSt\b\.?/g, 'street').replace(/\bAve\b\.?/g, 'avenue').replace(/&/g, ' and ');
  s = s.toLowerCase().replace(/['’]/g, '').replace(/[.;:!?]+/g, ' , ').replace(/,/g, ' , ').replace(/[^a-z\-, ]+/g, ' ');
  return s.replace(/\s+/g, ' ').replace(/( ,)+/g, ' ,').replace(/^[ ,]+|[ ,]+$/g, '');
}
export const tokens = (text: string) => normalise(text).split(' ').filter(Boolean);

/**
 * Split into fragments: the longest phrase (up to 7 tokens) the vocabulary has, else a single word; ',' is a pause.
 * `has` says whether a fragment is rendered. Unknown words come back flagged so the scanner can garble them.
 */
export function segment(text: string, has: (frag: string) => boolean): { frag: string; known: boolean }[] {
  const t = tokens(text); const out: { frag: string; known: boolean }[] = [];
  for (let i = 0; i < t.length;) {
    if (t[i] === ',') { out.push({ frag: ',', known: true }); i++; continue; }
    let took = 0;
    for (let n = Math.min(7, t.length - i); n >= 2; n--) { const sl = t.slice(i, i + n); if (sl.includes(',')) continue; const f = sl.join(' '); if (has(f)) { out.push({ frag: f, known: true }); took = n; break; } }
    if (!took) { out.push({ frag: t[i], known: has(t[i]) }); took = 1; }
    i += took;
  }
  return out;
}

// ------------------------------------------------------------------ vocabulary (rendered at build time)
/** Fixed phrases in gameplay's radio calls (src/gameplay/police/police.ts) and crime words. */
const GAMEPLAY_PHRASES = [
  'all units', 'in pursuit at', 'lost him around', 'need assistance', 'foot pursuit at', 'disregard that last', 'nothing further', 'plate starting', 'may be armed', 'no description',
  'a fare beater', 'a fire set', 'someone with a gun', 'malicious mischief', 'a reckless driver', 'someone menacing people', 'someone resisting', 'a bribery attempt', 'an assault', 'a robbery',
  'an assault with a weapon', 'a car stolen at gunpoint', 'a hit-and-run', 'shots fired', 'a shooting', 'an officer assaulted', 'a homicide', 'officer down', 'someone moving a body',
];
const SUBJECT = ['male', 'female', 'man', 'woman', 'teens', 'twenties', 'thirties', 'forties', 'fifties', 'sixties', 'slim build', 'thin build', 'medium build', 'heavy build', 'heavy-set', 'stocky', 'tall', 'short', 'young', 'older', 'grey hair', 'dark hair', 'blond', 'beard', 'moustache', 'glasses'];
const COLOURS = ['black', 'white', 'grey', 'gray', 'brown', 'tan', 'beige', 'navy', 'blue', 'light blue', 'dark blue', 'green', 'dark green', 'olive', 'red', 'maroon', 'burgundy', 'orange', 'yellow', 'gold', 'cream', 'camel', 'rust', 'purple', 'pink', 'plaid', 'checked', 'striped', 'print', 'dark', 'light', 'silver', 'two-tone'];
const GARMENTS = ['suit', 'leisure suit', 'jacket', 'coat', 'overcoat', 'raincoat', 'trench coat', 'peacoat', 'leather jacket', 'sport coat', 'blazer', 'shirt', 'print shirt', 'turtleneck', 'sweater', 'cardigan', 'vest', 'dress', 'skirt', 'blouse', 'trousers', 'slacks', 'jeans', 'bell-bottoms', 'pants', 'apron', 'uniform', 'hat', 'fedora', 'cap', 'watch cap', 'newsboy cap', 'scarf', 'clothes', 'dark clothes', 'boots', 'sneakers'];
const VEHICLES = ['sedan', 'hardtop', 'wagon', 'station wagon', 'compact', 'taxi', 'cab', 'van', 'step van', 'truck', 'box truck', 'pickup', 'bus', 'motorcycle', 'convertible', 'coupe', 'big black sedan', 'car'];
const DIRECTIONS = ['northbound', 'southbound', 'eastbound', 'westbound', 'uptown', 'downtown', 'crosstown', 'north', 'south', 'east', 'west', 'on foot', 'heading', 'running', 'last seen'];
const ITEMS = ['bag', 'briefcase', 'suitcase', 'package', 'shopping bag', 'gun', 'knife', 'bat', 'pipe', 'paper bag', 'garment bag', 'carrying a'];
const RADIO = ['central', 'car', 'cars', 'units', 'unit', 'sector', 'respond', 'responding', 'copy', 'ten-four', 'roger', 'go ahead', 'on the way', 'on scene', 'checking', 'negative', 'affirmative', 'stand by', 'repeat', 'use caution', 'use extreme caution', 'suspect', 'vehicle', 'witness', 'says', 'description', 'all cars', 'second car', 'armed', 'and', 'at', 'near', 'on', 'in', 'of', 'the', 'a', 'an', 'to', 'with', 'from', 'by', 'him', 'her', 'he', 'she', 'his', 'is', 'was', 'last', 'seen', 'partial plate', 'street', 'avenue', 'roadblock', 'in pursuit', 'on the way', 'disregard', 'all units respond', 'shots fired'];
const PLACES_FIXED = ['broadway', 'park avenue', 'park avenue south', 'madison avenue', 'lexington avenue', 'vanderbilt avenue', 'irving place', 'gramercy park', 'dyer avenue', 'galvin avenue', 'times square', 'herald square', 'penn station', 'grand central', 'bryant park', 'madison square', 'the deuce', 'the garment district', 'the flower district', 'the lincoln tunnel', 'the station', 'the subway', 'the lot on the east side'];

/** Spoken street names from the map's street list ("West 31st Street" → "west thirty-first", also "eighth avenue" and "eighth"). */
export function placeVocab(streetNames: string[]): string[] {
  const out = new Set<string>(PLACES_FIXED);
  for (const n of streetNames) {
    const s = normalise(n); if (!s) continue; out.add(s);
    out.add(s.replace(/ street$/, '')); // "west thirty-first"
    const av = s.match(/^(\S+) avenue$/); if (av) out.add(av[1]); // "eighth"
  }
  return [...out];
}
/** Split narrative templates into their fixed fragments ("Central to all cars: officer down, {street} and {avenue}."). */
export function templateFragments(lines: string[]): string[] {
  const out = new Set<string>();
  for (const l of lines) for (const part of l.split(/\{[^}]*\}/)) for (const seg of normalise(part).split(' , ')) { const f = seg.replace(/^,|,$/g, '').trim(); if (f && f !== ',') out.add(f); }
  return [...out];
}
/** Everything to render: phrases, plus every single word that appears in them (the stitcher's fallback). */
export function dispatchVocab(o: { streets: string[]; precincts: string[]; templates: string[] }): string[] {
  const phrases = new Set<string>();
  for (const p of [...GAMEPLAY_PHRASES, ...SUBJECT, ...COLOURS, ...GARMENTS, ...VEHICLES, ...DIRECTIONS, ...ITEMS, ...RADIO, ...placeVocab(o.streets), ...o.precincts.map(normalise), ...templateFragments(o.templates)]) { const f = normalise(p); if (f) phrases.add(f); }
  for (let i = 0; i < 100; i++) phrases.add(numberWords(i));
  for (const w of Object.values(PHONETIC)) phrases.add(w);
  const words = new Set<string>(); for (const p of phrases) for (const w of p.split(' ')) if (w && w !== ',') words.add(w);
  return [...new Set([...phrases, ...words])].filter((f) => !f.includes(' , '));
}
