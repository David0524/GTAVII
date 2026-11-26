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
import { charUniforms } from './render/materials';
import { ArchetypeRegistry, type ArchetypeDef } from './archetypes';
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
  /** Heat 0..1 (sweat, slumped idles) and wetness 0..1 (rain): set from time of day / weather. */
  setClimate(c: { heat?: number; wetness?: number }): void;
  readonly quality: Quality;
  readonly body: BodyModel;
  readonly anims: AnimLibrary;
}

export async function createCharacterFactory(opts: { quality: Quality; baseUrl?: string }): Promise<CharacterFactory> {
  const base = (opts.baseUrl ?? import.meta.env.BASE_URL) + 'characters/';
  // mobile Low loads a reduced body (≈1 MB: far LOD vertices only, 32 shape components)
  const bodyFile = opts.quality === 'low' ? 'body_low.bin' : 'body.bin';
  const [body, anims] = await Promise.all([BodyModel.load(base + bodyFile), AnimLibrary.load(base + 'anims.bin')]);
  registerAuthored(anims);
  let ground: GroundFn | null = null;
  const archetypes = new ArchetypeRegistry();
  const heroLod = opts.quality === 'low' ? 2 : 0, pedLod = opts.quality === 'low' ? 2 : 1;
  return {
    quality: opts.quality, body, anims,
    spawn(scene, desc) {
      const hero = desc.hero ? HEROES[desc.hero] : undefined;
      if (desc.hero && !hero) console.warn(`characters: unknown hero ${desc.hero}`);
      const build = hero?.();
      const ch = new Character(body, anims, desc, { lod: hero ? heroLod : pedLod, build, heat: charUniforms.heat.value, outfitCtx: archetypes.outfitContext(desc.archetype) });
      if (build && desc.act) ch.setWardrobe(`act${desc.act}`);
      ch.setGround(ground);
      scene.add(ch.object);
      return ch;
    },
    createCrowdRenderer(max) { return new CrowdRenderer(body, anims, { max, quality: opts.quality, ground: () => ground, archetypes, bodyUrl: base + bodyFile, nearLod: pedLod }); },
    registerArchetypes(defs) { archetypes.register(defs); },
    setGround(fn) { ground = fn; },
    setClimate(c) { if (c.heat !== undefined) charUniforms.heat.value = c.heat; if (c.wetness !== undefined) charUniforms.wetness.value = c.wetness; },
  };
}
export { describeOutfit, type OutfitDescription } from './wardrobe/describe';
