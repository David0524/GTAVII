/**
 * Characters workstream public API (see docs/briefs/CHARACTERS_BRIEF.md, "Integration contract").
 *
 *   const factory = await createCharacterFactory({ quality: 'high' });
 *   const ch = factory.spawn(scene, { seed: 42, archetype: 'commuter' });
 *   // each frame: ch.object.position.copy(controllerFeet); ch.setLocomotion({...}); ch.update(dt);
 *   const crowd = factory.createCrowdRenderer(400); scene.add(crowd.object); crowd.setAgents(sim.peds);
 *
 * Extensions beyond the contract (all optional): factory.setGround(fn) for foot IK and footstep
 * surfaces, Character.setHandTarget(), Character.stop(), Character.jointWorld().
 */
import * as THREE from 'three/webgpu';
import { BodyModel } from './body/BodyModel';
import { AnimLibrary } from './anim/AnimLibrary';
import { registerAuthored } from './anim/authored';
import { Character, type CharacterDesc, type GroundFn } from './Character';
import { HEROES } from './heroes';
import { CrowdRenderer, type AgentView } from './crowd/CrowdRenderer';
import { charUniforms, setFabricMaps } from './render/materials';
import { ArchetypeRegistry, type ArchetypeDef } from './archetypes';
import { castBuild, type CastEntry } from './cast';
import { HeadLibrary, type HeadAsset } from './heads/rocketbox';
export type { CastEntry } from './cast';
export type { ArchetypeDef } from './archetypes';

export type { CharacterDesc, GroundFn } from './Character';
export { Character } from './Character';
export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export interface CharacterFactory {
  spawn(scene: THREE.Object3D, desc: CharacterDesc): Character;
  createCrowdRenderer(maxInstances: number): { setAgents(list: readonly AgentView[]): void; object: THREE.Object3D; update?(dt: number, camera: THREE.Camera): void; dispose?(): void };
  setGround(fn: GroundFn | null): void;
  /** Narrative archetypes (content/npc_archetypes/*.json): palette, wardrobe and props drive generation. */
  registerArchetypes(defs: ArchetypeDef[]): void;
  /** Narrative cast sheets (content/cast/*.json); spawn them with { hero: 'char.x' }. */
  registerCast(entries: CastEntry[]): void;
  /** Heat 0..1 (sweat, slumped idles) and wetness 0..1 (rain): set from time of day / weather. */
  setClimate(c: { heat?: number; wetness?: number }): void;
  readonly quality: Quality;
  readonly body: BodyModel;
  readonly anims: AnimLibrary;
  /** Rocketbox head library (null on Low). */
  readonly heads: HeadLibrary | null;
}

export async function createCharacterFactory(opts: { quality: Quality; baseUrl?: string }): Promise<CharacterFactory> {
  const base = (opts.baseUrl ?? import.meta.env.BASE_URL) + 'characters/';
  // mobile Low loads a reduced body (≈1 MB: far LOD vertices only, 32 shape components)
  const bodyFile = opts.quality === 'low' ? 'body_low.bin' : 'body.bin';
  const [body, anims] = await Promise.all([BodyModel.load(base + bodyFile), AnimLibrary.load(base + 'anims.bin')]);
  registerAuthored(anims);
  // fabric detail maps (≈70 KB Low / 270 KB High; relief stays flat if they fail)
  const tag = opts.quality === 'low' ? 'lo' : 'hi', tl = new THREE.TextureLoader();
  await Promise.all([tl.loadAsync(`${base}fabric_a_${tag}.webp`), tl.loadAsync(`${base}fabric_b_${tag}.webp`)]).then(([a, b]) => setFabricMaps(a, b)).catch((e) => console.warn('characters: fabric maps', e));
  // Rocketbox heads (Medium and above): the leads' altered heads are preloaded; the near-ring pool
  // loads on demand. Low keeps our generated heads everywhere.
  const heads = opts.quality === 'low' ? null : await new HeadLibrary(base + 'rb/').init();
  const leadHeads = new Map<string, HeadAsset>();
  if (heads) await Promise.all(['teddy', 'delphine', 'nick'].map(async (n) => { const e = heads.lead(`lead_${n}`); if (e) leadHeads.set(n, await heads.load(e.id)); })).catch((e) => console.warn('characters: lead heads', e));
  const leadOf = (hero: string) => (/teddy/.test(hero) ? 'teddy' : /delphine/.test(hero) ? 'delphine' : /nick/.test(hero) ? 'nick' : '');
  let ground: GroundFn | null = null;
  const archetypes = new ArchetypeRegistry();
  const cast = new Map<string, CastEntry>();
  const heroLod = opts.quality === 'low' ? 2 : 0, pedLod = opts.quality === 'low' ? 2 : 1;
  return {
    quality: opts.quality, body, anims, heads,
    spawn(scene, desc) {
      const hero = desc.hero ? HEROES[desc.hero] ?? (cast.has(desc.hero) ? () => castBuild(cast.get(desc.hero!)!) : undefined) : undefined;
      if (desc.hero && !hero) console.warn(`characters: unknown hero ${desc.hero}`);
      const build = hero?.();
      // leads wear their Rocketbox-based heads unless a scene opts out (overrides.rbHead === false)
      const lh = desc.hero ? leadHeads.get(leadOf(desc.hero)) : undefined;
      // the leads keep our strand-card hair (it follows their sheets) over the head
      if (lh && desc.overrides?.rbHead === undefined) desc = { ...desc, overrides: { ourHair: true, ...desc.overrides, rbHead: lh } };
      if (desc.overrides?.rbHead === false) { const { rbHead: _x, ...rest } = desc.overrides; void _x; desc = { ...desc, overrides: rest }; }
      const ch = new Character(body, anims, desc, { lod: hero ? heroLod : pedLod, build, heat: charUniforms.heat.value, outfitCtx: archetypes.outfitContext(desc.archetype) });
      if (build && desc.act) ch.setWardrobe(`act${desc.act}`);
      ch.setGround(ground);
      scene.add(ch.object);
      return ch;
    },
    createCrowdRenderer(max) { return new CrowdRenderer(body, anims, { max, quality: opts.quality, ground: () => ground, archetypes, bodyUrl: base + bodyFile, nearLod: pedLod }); },
    registerArchetypes(defs) { archetypes.register(defs); },
    registerCast(entries) { for (const e of entries) cast.set(e.id, e); },
    setGround(fn) { ground = fn; },
    setClimate(c) { if (c.heat !== undefined) charUniforms.heat.value = c.heat; if (c.wetness !== undefined) charUniforms.wetness.value = c.wetness; },
  };
}
export { describeOutfit, type OutfitDescription } from './wardrobe/describe';
