/**
 * Rapier collision groups shared by every stream (engine-owned contract). Rapier packs
 * (membership << 16) | filter into a 32-bit interaction group.
 *   WORLD      static city: buildings, ground, curbs, street furniture
 *   PLAYER     the player capsule
 *   NPC        pedestrian / police bodies (characters, sim)
 *   VEHICLE    car chassis (vehicles)
 *   PROP       breakable / dynamic props (gameplay)
 *   PROJECTILE thrown objects, physical projectiles (gameplay); hitscan uses ray queries with HITSCAN_FILTER
 *   TRIGGER    sensors: mission volumes, call-box zones, interior portals
 */
export const G = { WORLD: 1 << 0, PLAYER: 1 << 1, NPC: 1 << 2, VEHICLE: 1 << 3, PROP: 1 << 4, PROJECTILE: 1 << 5, TRIGGER: 1 << 6 } as const;
export const groups = (member: number, collidesWith: number) => ((member & 0xffff) << 16) | (collidesWith & 0xffff);
const SOLID = G.WORLD | G.PLAYER | G.NPC | G.VEHICLE | G.PROP;
export const GROUPS = {
  world: groups(G.WORLD, SOLID | G.PROJECTILE),
  player: groups(G.PLAYER, SOLID | G.TRIGGER),
  npc: groups(G.NPC, SOLID | G.PROJECTILE),
  vehicle: groups(G.VEHICLE, SOLID | G.PROJECTILE),
  prop: groups(G.PROP, SOLID | G.PROJECTILE),
  projectile: groups(G.PROJECTILE, G.WORLD | G.NPC | G.VEHICLE | G.PROP),
  trigger: groups(G.TRIGGER, G.PLAYER | G.NPC | G.VEHICLE),
} as const;
/** Ray-query filter for bullets: hits world, people, vehicles, props; ignores triggers. */
export const HITSCAN_FILTER = groups(0xffff, G.WORLD | G.NPC | G.VEHICLE | G.PROP | G.PLAYER);
