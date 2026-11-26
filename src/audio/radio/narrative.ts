/**
 * Adapter from the narrative team's `content/radio.json` (invented stations, songs, DJ patter with
 * optional `context` and `date` tags) to the radio framework's StationDef. Songs keep their
 * invented titles/artists for the "now playing" UI; their audio stays a PLACEHOLDER bed until a
 * music source is chosen (a `file` per song will then stream it).
 */
import type { StationDef, TrackDef, SpeechDef } from './stations';

interface NarrativeStation { id: string; name: string; format?: string; dj?: { name?: string; voice?: string }; patter?: { text: string; context?: string; date?: string }[]; songs?: { title: string; artist: string; file?: string; durationSec?: number }[]; ads?: { text: string; id?: string }[]; news?: { text: string; date?: string; id?: string }[] }

function styleOf(format: string): { style: number; bpms: number[] } {
  const f = format.toLowerCase();
  if (/salsa|latin|caribe|mambo|bolero/.test(f)) return { style: 3, bpms: [94, 100, 90, 104] }; // the arranger's 16-step bar is one 2-3 clave half in cut time
  if (/soul|disco|funk|r&b/.test(f)) return { style: 0, bpms: [98, 112, 104, 120, 92] };
  if (/jazz|swing/.test(f)) return { style: 2, bpms: [84, 132, 96] };
  return { style: 1, bpms: [76, 88, 96, 72] }; // easy listening / pop
}

export function stationsFromNarrative(json: { stations?: NarrativeStation[] }): StationDef[] {
  return (json.stations ?? []).map((s) => {
    const { style, bpms } = styleOf(s.format ?? '');
    const songs = s.songs ?? [];
    const speaker = `dj.${s.id}`;
    const patter: SpeechDef[] = (s.patter ?? []).map((p, i) => ({ id: `${s.id}.p${i}`, speaker, text: p.text, context: p.context, date: p.date }));
    const tracks: TrackDef[] = songs.map((t, i) => ({ id: `${s.id}.s${i}`, title: t.title, artist: t.artist, durationSec: t.durationSec ?? 150 + ((i * 53 + s.id.length * 7) % 110), style, bpm: bpms[i % bpms.length], file: t.file }));
    const talk = tracks.length === 0;
    const news = (s.news ?? []).map((n, i) => ({ id: n.id ?? `${s.id}.n${i}`, speaker: `news.${s.id}`, text: n.text, date: n.date }));
    const generic = news.filter((n) => !n.date);
    const byDate: Record<string, SpeechDef[]> = {};
    for (const n of news) if (n.date) (byDate[n.date] ??= []).push(n);
    return {
      id: s.id, name: s.name, band: talk ? 'AM' : 'FM', freq: '', format: s.format ?? '', placeholder: false,
      tracks, links: patter, ads: (s.ads ?? []).map((a, i) => ({ id: a.id ?? `${s.id}.a${i}`, speaker: `ad.${s.id}`, text: a.text })),
      news: talk ? { generic: patter.filter((p) => !p.context), byDate } : generic.length || Object.keys(byDate).length ? { generic: generic.length ? generic : patter.slice(0, 1), byDate } : undefined,
    } satisfies StationDef;
  });
}
