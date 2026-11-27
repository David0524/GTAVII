/**
 * Mission runtime in the game (docs/HANDOFF_WIRING.md step 6; src/mission/MissionRuntime.ts is the logic).
 * Supplies the MissionHost from engine pieces: player/clock/save state, narrative content (missions, places,
 * interiors, dialogue), UI events (subtitle, choices, objective, notify, discover, missionEnd), audio dialogue,
 * gameplay (missionBegin/missionLines, wasted/arrested → fail, bindTalk for givers), and the characters factory
 * for givers standing at their place.
 */
import * as THREE from 'three/webgpu';
import { Places, type PlaceRec, type StreetRec } from '../mission/places';
import { MissionRuntime, type MissionDef, type MissionHost, type NarrativeState, type DialogueLine } from '../mission/MissionRuntime';
import { speakerName } from '../cinematics/content';
import { readingTime } from '../cinematics/Timeline';
import type { Emitter, UiEvents } from '../shared/uiEvents';
import { heightAt } from '../shared/terrain';

const missionFiles = import.meta.glob('/content/missions/*.json', { eager: true, import: 'default' }) as Record<string, MissionDef>;
const placesFile = import.meta.glob('/content/places.json', { eager: true, import: 'default' }) as Record<string, { places: PlaceRec[] }>;
const interiorsFile = import.meta.glob('/content/interiors.json', { eager: true, import: 'default' }) as Record<string, { interiors: { id: string; address: string; kind?: string }[] }>;
const dialogueFiles = import.meta.glob('/content/dialogue/*.json', { import: 'default' }) as Record<string, () => Promise<{ lines: DialogueLine[] }>>;

export interface MissionGlueDeps {
  streets: StreetRec[]; heroes: { id: string; name: string; x: number; z: number }[];
  ui: Emitter<UiEvents>;
  player: () => { x: number; z: number; lead: string; inCar: boolean; interior: string | null };
  clock: () => { minutes: number; date: string };
  state: () => NarrativeState;
  setObjective: (o: { text: string; target?: { x: number; z: number; label?: string }; mission?: string } | null) => void;
  addMoney: (cents: number) => void;
  waitTo: (hhmm: string) => void;
  audioPlay?: (script: string, lineId: string) => Promise<void> | undefined;
  gameplay: () => { missionBegin(id: string): void; missionLines(): { label: string; value: string }[] } | null;
  /** spawn a cast character standing at x,z facing the street; returns a remover */
  spawnCast?: (castId: string, x: number, y: number, z: number) => (() => void) | null;
}

export function createMissions(d: MissionGlueDeps): MissionRuntime {
  const places = (Object.values(placesFile)[0]?.places ?? []);
  const placeRecs = new Map(places.map((p) => [p.id, p]));
  const P = new Places(d.streets, placeRecs, new Map(d.heroes.map((h) => [h.id, h])));
  const missions = new Map(Object.values(missionFiles).map((m) => [m.id, m]));
  const interiors = Object.values(interiorsFile)[0]?.interiors ?? [];
  const host: MissionHost = {
    player: d.player, clock: d.clock, state: d.state,
    loadDialogue: async (id) => { const k = `/content/dialogue/${id.replace(/^dlg\./, '')}.json`; return dialogueFiles[k] ? await dialogueFiles[k]() : null; },
    say: async (line, script) => {
      const secs = readingTime(line.text ?? '');
      d.ui.emit('subtitle', { speaker: line.speaker ? speakerName(line.speaker) : '', text: line.text ?? '', channel: 'scene', seconds: secs });
      const voiced = d.audioPlay?.(script, line.id);
      await Promise.all([voiced ?? Promise.resolve(), new Promise((r) => setTimeout(r, secs * 1000))]);
    },
    choose: (prompt, choices) => new Promise((resolve) => d.ui.emit('choices', { prompt, choices, resolve })),
    objective: (o) => { d.setObjective(o); d.ui.emit('objective', o); },
    notify: (text) => d.ui.emit('notify', { kind: 'toast', text }),
    discover: (placeId, notify, mission) => d.ui.emit('discover', { placeId, via: 'mission', notify, mission }),
    missionEnd: (e) => d.ui.emit('missionEnd', e),
    addMoney: d.addMoney, waitTo: d.waitTo,
    missionBegin: (id) => d.gameplay()?.missionBegin(id),
    missionLines: () => d.gameplay()?.missionLines() ?? [],
    placeGiver: d.spawnCast ? (castId, x, z) => d.spawnCast!(castId, x, heightAt(x, z) + 0.15, z) ?? (() => {}) : undefined,
  };
  const rt = new MissionRuntime(host, P, missions, interiors, placeRecs);
  if (P.misses.length) console.warn('[missions] unresolved places', P.misses);
  void THREE;
  return rt;
}
