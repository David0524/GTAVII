/**
 * `?gameplay=1&content=narrative`: run the scene on narrative's systems content (via the adapter).
 * Prefers the real files under /content (present once narrative's branch is merged), else the snapshot
 * gameplay keeps for its tests. Both are lazy chunks, so the default scene doesn't pay for them.
 */
import { adaptNarrative, type NarrativeFiles } from '../data/narrativeAdapter';
import type { GameplayContent } from '../data/schema';

const NAMES = ['ammo', 'consumables', 'weapons', 'keys', 'evidence', 'precincts', 'shops'] as const;
const real = import.meta.glob(['/content/items/{ammo,consumables,weapons,keys,evidence}.json', '/content/police/precincts.json', '/content/shops.json'], { import: 'default' });
const snapshot = import.meta.glob('../tests/fixtures/narrative/*.json', { import: 'default' });

export async function loadNarrativeContent(): Promise<{ content: GameplayContent; source: 'content' | 'snapshot'; warnings: string[] }> {
  const useReal = Object.keys(real).length > 0;
  const src = useReal ? real : snapshot;
  const files: NarrativeFiles = {};
  for (const [path, load] of Object.entries(src)) {
    const name = path.split('/').pop()!.replace('.json', '') as (typeof NAMES)[number];
    if ((NAMES as readonly string[]).includes(name)) (files as Record<string, unknown>)[name] = await load();
  }
  const warnings: string[] = [];
  const content = adaptNarrative(files, (m) => warnings.push(m));
  return { content, source: useReal ? 'content' : 'snapshot', warnings };
}
