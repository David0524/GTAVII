/**
 * Station definitions. The narrative team owns station identities, DJ text, ads and news
 * (content/radio/stations.json, same shape as below); these PLACEHOLDER stations exist only so the
 * framework can be built and measured. Names are deliberately generic labels, not call signs.
 *
 * Music source is undecided (the user chooses: procedural period-style, commissioned/supplied
 * originals, or CC0/public domain). Until then every track is a placeholder bed rendered by the
 * 't74-music' worklet; a track with `file` set will stream that file instead.
 */
export interface TrackDef { id: string; title: string; artist: string; durationSec: number; style: number; bpm: number; file?: string }
export interface SpeechDef { id: string; speaker: string; text: string }
export interface StationDef {
  id: string; name: string; band: 'AM' | 'FM'; freq: string; format: string; placeholder?: boolean;
  tracks: TrackDef[];
  links: SpeechDef[];
  ads: SpeechDef[];
  /** Top-of-hour bulletins keyed by in-game date (narrative N1); `generic` when no entry for the date. */
  news?: { byDate?: Record<string, SpeechDef[]>; generic: SpeechDef[] };
}

const tracks = (prefix: string, style: number, bpms: number[]): TrackDef[] =>
  bpms.map((bpm, i) => ({ id: `${prefix}.t${i}`, title: `Placeholder track ${i + 1}`, artist: 'placeholder', durationSec: 150 + ((i * 37) % 90), style, bpm }));

export const PLACEHOLDER_STATIONS: StationDef[] = [
  { id: 'station.placeholder_a', name: 'PLACEHOLDER A (FM soul)', band: 'FM', freq: '—', format: 'soul', placeholder: true, tracks: tracks('a', 0, [96, 104, 88, 112, 100, 92]),
    links: [{ id: 'a.l1', speaker: 'dj.placeholder_a', text: '[DJ link placeholder: narrative writes the patter]' }],
    ads: [{ id: 'a.ad1', speaker: 'ad.placeholder', text: '[Ad placeholder: invented business, narrative copy]' }],
    news: { generic: [{ id: 'a.news', speaker: 'news.placeholder', text: '[News placeholder: top-of-hour bulletin for this date]' }] } },
  { id: 'station.placeholder_b', name: 'PLACEHOLDER B (AM pop)', band: 'AM', freq: '—', format: 'pop', placeholder: true, tracks: tracks('b', 1, [120, 126, 116, 132]),
    links: [{ id: 'b.l1', speaker: 'dj.placeholder_b', text: '[DJ link placeholder]' }], ads: [{ id: 'b.ad1', speaker: 'ad.placeholder', text: '[Ad placeholder]' }],
    news: { generic: [{ id: 'b.news', speaker: 'news.placeholder', text: '[News placeholder]' }] } },
  { id: 'station.placeholder_c', name: 'PLACEHOLDER C (FM jazz)', band: 'FM', freq: '—', format: 'jazz', placeholder: true, tracks: tracks('c', 2, [84, 132, 72, 96]),
    links: [{ id: 'c.l1', speaker: 'dj.placeholder_c', text: '[DJ link placeholder]' }], ads: [] },
  { id: 'station.placeholder_d', name: 'PLACEHOLDER D (AM news/talk)', band: 'AM', freq: '—', format: 'news', placeholder: true, tracks: [],
    links: [{ id: 'd.l1', speaker: 'host.placeholder_d', text: '[Talk segment placeholder]' }, { id: 'd.l2', speaker: 'caller.placeholder', text: '[Caller placeholder]' }],
    ads: [{ id: 'd.ad1', speaker: 'ad.placeholder', text: '[Ad placeholder]' }], news: { generic: [{ id: 'd.news', speaker: 'news.placeholder', text: '[News placeholder]' }] } },
];
