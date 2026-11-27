/**
 * The 'ui' save section (ENGINE_RESPONSES ui 2, engine E9 sections). Owned by the UI stream:
 * map discovery (a user requirement: it must persist), the pencil waypoint and annotations,
 * newspapers read, achievements unlocked, cutscenes seen (for "skip on replay").
 * RULES as for the whole save: never change a field's meaning in place; bump `version`, add a
 * migration and a fixture tests/save-fixtures/ui.vN.json.
 */
import { registerSection, SaveFormatError } from '../../save/schema';
import type { MapModel } from '../map/MapModel';
import { Explored } from '../map/Explored';
import type { DiscoveryState } from '../map/Discovery';
import type { Annotation } from '../map/MapModel';

export interface UiSaveV1 {
  discovery: DiscoveryState;
  waypoint: { x: number; z: number } | null;
  annotations: Annotation[];
  newsRead: string[];
  achievements: Record<string, string>;
  cutscenesSeen: string[];
}
/** v2 adds the explored grid (fog of war): a string from Explored.serialize(), or null on a freshly migrated v1 save (seeded on load). */
export interface UiSaveV2 extends UiSaveV1 { explored: string | null }
export const UI_SECTION_VERSION = 2;

export function emptyUi(): UiSaveV2 { return { explored: new Explored().serialize(), discovery: {}, waypoint: null, annotations: [], newsRead: [], achievements: {}, cutscenesSeen: [] }; }

export function validateUi(d: UiSaveV2) {
  const fail = (p: string) => { throw new SaveFormatError(`invalid save: sections.ui.${p}`); };
  if (!d || typeof d !== 'object') fail('(not an object)');
  if (!d.discovery || typeof d.discovery !== 'object') fail('discovery');
  for (const [id, e] of Object.entries(d.discovery)) if (typeof e?.at !== 'number' || typeof e.via !== 'string' || typeof e.seen !== 'boolean') fail(`discovery.${id}`);
  if (d.explored !== null) { if (typeof d.explored !== 'string') fail('explored'); try { Explored.deserialize(d.explored); } catch { fail('explored'); } }
  if (d.waypoint !== null && !(Number.isFinite(d.waypoint?.x) && Number.isFinite(d.waypoint?.z))) fail('waypoint');
  if (!Array.isArray(d.annotations) || d.annotations.some((a) => !Number.isFinite(a.x) || !Number.isFinite(a.z))) fail('annotations');
  if (!Array.isArray(d.newsRead) || !Array.isArray(d.cutscenesSeen) || typeof d.achievements !== 'object') fail('lists');
}

/** v1 -> v2: seeding needs the place catalogue and the player's position, so it happens when the model loads (restoreExplored). */
export function migrateUiV1(d: UiSaveV1): UiSaveV2 { return { ...d, explored: null }; }

registerSection<UiSaveV2>({ name: 'ui', version: UI_SECTION_VERSION, migrations: { 1: migrateUiV1 }, validate: validateUi, empty: emptyUi });

/** The provider the UI hands to SaveManager.provideSection(). */
export function uiSectionProvider(model: MapModel, extra: { newsRead: Set<string>; achievements: Record<string, string>; cutscenesSeen: Set<string> }, playerAt?: () => { x: number; z: number } | null) {
  return {
    name: 'ui',
    capture: (): UiSaveV2 => ({ ...model.serialize(), explored: model.explored.serialize(), newsRead: [...extra.newsRead], achievements: { ...extra.achievements }, cutscenesSeen: [...extra.cutscenesSeen] }),
    restore: (raw: unknown) => {
      const d = (raw ?? emptyUi()) as UiSaveV2;
      const at = playerAt?.(); if (at) model.lastPos = at;
      model.deserialize(d);
      extra.newsRead.clear(); for (const n of d.newsRead) extra.newsRead.add(n);
      for (const k of Object.keys(extra.achievements)) delete extra.achievements[k]; Object.assign(extra.achievements, d.achievements);
      extra.cutscenesSeen.clear(); for (const c of d.cutscenesSeen) extra.cutscenesSeen.add(c);
    },
  };
}
