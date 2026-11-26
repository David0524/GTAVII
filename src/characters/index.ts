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

export type { CharacterDesc, GroundFn } from './Character';
export { Character } from './Character';
export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export interface CharacterFactory {
  spawn(scene: THREE.Object3D, desc: CharacterDesc): Character;
  createCrowdRenderer(maxInstances: number): { setAgents(list: readonly AgentView[]): void; object: THREE.Object3D; update?(dt: number, camera: THREE.Camera): void; dispose?(): void };
  setGround(fn: GroundFn | null): void;
  /** Heat 0..1 (sweat, slumped idles) and wetness 0..1 (rain): set from time of day / weather. */
  setClimate(c: { heat?: number; wetness?: number }): void;
  readonly quality: Quality;
  readonly body: BodyModel;
  readonly anims: AnimLibrary;
}

export async function createCharacterFactory(opts: { quality: Quality; baseUrl?: string }): Promise<CharacterFactory> {
  const base = (opts.baseUrl ?? import.meta.env.BASE_URL) + 'characters/';
  const [body, anims] = await Promise.all([BodyModel.load(base + 'body.bin'), AnimLibrary.load(base + 'anims.bin')]);
  registerAuthored(anims);
  let ground: GroundFn | null = null;
  const heroLod = 0, pedLod = opts.quality === 'low' ? 2 : 1;
  return {
    quality: opts.quality, body, anims,
    spawn(scene, desc) {
      const hero = desc.hero ? HEROES[desc.hero] : undefined;
      if (desc.hero && !hero) console.warn(`characters: unknown hero ${desc.hero}`);
      const build = hero?.();
      const ch = new Character(body, anims, desc, { lod: hero ? heroLod : pedLod, build, heat: charUniforms.heat.value });
      if (build && desc.act) ch.setWardrobe(`act${desc.act}`);
      ch.setGround(ground);
      scene.add(ch.object);
      return ch;
    },
    createCrowdRenderer(max) { return new CrowdRenderer(body, anims, { max, quality: opts.quality, ground: () => ground }); },
    setGround(fn) { ground = fn; },
    setClimate(c) { if (c.heat !== undefined) charUniforms.heat.value = c.heat; if (c.wetness !== undefined) charUniforms.wetness.value = c.wetness; },
  };
}
