/**
 * The 'ui' save section (ENGINE_RESPONSES ui 2, engine E9 sections). Owned by the UI stream:
 * map discovery (a user requirement: it must persist), the pencil waypoint and annotations,
 * newspapers read, achievements unlocked, cutscenes seen (for "skip on replay").
 * RULES as for the whole save: never change a field's meaning in place; bump `version`, add a
 * migration and a fixture tests/save-fixtures/ui.vN.json.
 */
import { registerSection, SaveFormatError } from '../../save/schema';
import type { MapModel } from '../map/MapModel';
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
export const UI_SECTION_VERSION = 1;

export function emptyUi(): UiSaveV1 { return { discovery: {}, waypoint: null, annotations: [], newsRead: [], achievements: {}, cutscenesSeen: [] }; }

export function validateUi(d: UiSaveV1) {
  const fail = (p: string) => { throw new SaveFormatError(`invalid save: sections.ui.${p}`); };
  if (!d || typeof d !== 'object') fail('(not an object)');
  if (!d.discovery || typeof d.discovery !== 'object') fail('discovery');
  for (const [id, e] of Object.entries(d.discovery)) if (typeof e?.at !== 'number' || typeof e.via !== 'string' || typeof e.seen !== 'boolean') fail(`discovery.${id}`);
  if (d.waypoint !== null && !(Number.isFinite(d.waypoint?.x) && Number.isFinite(d.waypoint?.z))) fail('waypoint');
  if (!Array.isArray(d.annotations) || d.annotations.some((a) => !Number.isFinite(a.x) || !Number.isFinite(a.z))) fail('annotations');
  if (!Array.isArray(d.newsRead) || !Array.isArray(d.cutscenesSeen) || typeof d.achievements !== 'object') fail('lists');
}

registerSection<UiSaveV1>({ name: 'ui', version: UI_SECTION_VERSION, migrations: {}, validate: validateUi, empty: emptyUi });

/** The provider the UI hands to SaveManager.provideSection(). */
export function uiSectionProvider(model: MapModel, extra: { newsRead: Set<string>; achievements: Record<string, string>; cutscenesSeen: Set<string> }) {
  return {
    name: 'ui',
    capture: (): UiSaveV1 => ({ ...model.serialize(), newsRead: [...extra.newsRead], achievements: { ...extra.achievements }, cutscenesSeen: [...extra.cutscenesSeen] }),
    restore: (raw: unknown) => {
      const d = (raw ?? emptyUi()) as UiSaveV1;
      model.deserialize(d);
      extra.newsRead.clear(); for (const n of d.newsRead) extra.newsRead.add(n);
      for (const k of Object.keys(extra.achievements)) delete extra.achievements[k]; Object.assign(extra.achievements, d.achievements);
      extra.cutscenesSeen.clear(); for (const c of d.cutscenesSeen) extra.cutscenesSeen.add(c);
    },
  };
}
