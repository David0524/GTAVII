/**
 * Police heat as dispatch radio (the user's rule: no stars; heat reads through the radio and the
 * minimap only). The audio stream voices these; the HUD prints them, because no information may be
 * audio-only (narrative mobile rule). Line pools are placeholders until narrative supplies
 * police-radio lines (CORE_SYSTEMS "Narrative: police radio lines and descriptions").
 */
import type { HeatView } from '../host/types';

const POOL: Record<HeatView['phase'], string[]> = {
  none: [],
  spotted: ['Unit on foot reports a possible, {d}. Checking it out.', 'Central, a man matching {d}. Taking a look.'],
  pursuit: ['Ten-thirteen, in pursuit, {d}. All units in the vicinity.', 'Unit in pursuit, {d}. Requesting assistance.'],
  lost: ['Lost him. Last seen {d}. Units, set up on the avenues.', 'Central, we lost contact. {d}.'],
  searching: ['Units are canvassing. Subject described as {d}.', 'Check the doorways and the parked cars. {d}.'],
  cooling: ['Central to all units, resume patrol. Keep an eye out for {d}.', 'Disregard, disregard. Report stays on file.'],
};

let n = 0;
export function radioLine(h: HeatView): string | null {
  const pool = POOL[h.phase]; if (!pool.length) return null;
  const line = pool[n++ % pool.length];
  return line.replace('{d}', (h.description ?? 'a male, on foot').replace(/^./, (c) => c.toLowerCase()));
}
