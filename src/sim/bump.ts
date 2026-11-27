/**
 * Bump reactions (MOVEMENT brief: "crowd push-through and bump reactions"). The engine owns the bodies
 * and ragdolls; the sim decides how a pedestrian reacts when the player (an external `player` actor)
 * runs into them, and keeps them on the sidewalk while they do.
 *
 *  - Contact: the player's capsule within reach of a pedestrian. Severity from the closing speed and how
 *    head-on the contact is: a shoulder **brush** (they're nudged aside and keep walking), a **stumble**
 *    (pushed half a metre, lose their step ~1 s) or a **knockdown** (down 2.5–4 s, then get up).
 *  - Response after a stumble or knockdown (and sometimes a hard brush), from nerve and aggression:
 *    **angry** (turn on the player and shout; gameplay decides if it becomes a shove or a fight),
 *    **frightened** (back off quickly) or **annoyed** (a look and a mutter, carry on).
 *  - Events: `pedBumped {id, kind, response, x, z, dirX, dirZ, by}` for animation/ragdoll and barks,
 *    `pedGotUp {id}`. PedView.state shows `stumble`, `down`, `getUp`, `angry`.
 *  - Running players make crowds part earlier (peds.ts actor avoidance looks further ahead with speed).
 */
import type { SimCore, Ped } from './state';

const PED_R = 0.32;
const STANDABLE = new Set(['walk', 'pause', 'waitCross', 'loiter', 'hail', 'waitBus', 'hold', 'queue', 'watch']); // stall vendors are the vendor layer's

export function bumpReactions(S: SimCore, dt: number) {
  for (const a of S.actors) {
    if (a.kind !== 'player') continue;
    const sp = Math.hypot(a.vx, a.vz);
    if (sp < 0.6) continue; // standing still: people walk around you
    const ux = a.vx / sp, uz = a.vz / sp;
    S.pGrid.query(a.x, a.z, a.radius + PED_R + 0.4, (i) => {
      const p = S.peds[i];
      if (!p || !p.alive || p.cop2 || p.onRoad || !STANDABLE.has(p.state) || (p.bumpCd ?? 0) > S.t) return;
      const rx = p.x - a.x, rz = p.z - a.z, d = Math.hypot(rx, rz);
      if (d > a.radius + PED_R + 0.05 || d < 1e-3) return;
      const head = Math.max(0, (rx * ux + rz * uz) / d); // 1 = straight into them, 0 = glancing
      if (head < 0.15) return; // moving away / alongside
      const hit = sp * (0.35 + 0.65 * head);
      const kind = hit < 2.2 ? 'brush' : hit < 4.6 ? 'stumble' : 'knockdown';
      react(S, p, kind, rx / d, rz / d, a.id);
    });
  }
  // timers of the reaction states run in stepPeds (peds.ts → stepBumpState)
  void dt;
}

function react(S: SimCore, p: Ped, kind: 'brush' | 'stumble' | 'knockdown', dirX: number, dirZ: number, by: string) {
  p.bumpCd = S.t + (kind === 'brush' ? 1.5 : 4);
  // push across the walking band (sideways part of the push), never off the sidewalk
  const E = S.net.g.walkEdges[p.edge], n = E.pts.length;
  const ex = E.pts[n - 2] - E.pts[0], ez = E.pts[n - 1] - E.pts[1], el = Math.hypot(ex, ez) || 1;
  const rightX = -ez / el, rightZ = ex / el; // right of the edge direction
  const push = kind === 'brush' ? 0.25 : kind === 'stumble' ? 0.55 : 0.8;
  const side = (dirX * rightX + dirZ * rightZ) * push;
  p.lat = Math.max(-E.half, Math.min(E.half, p.lat + side));
  p.latGoal = p.lat;
  const ag = p.arch.aggression, nerve = p.nerve;
  let response: 'angry' | 'frightened' | 'annoyed' | 'none' = 'none';
  if (kind !== 'brush' || S.rng.chance(0.3)) {
    const r = S.rng.next();
    response = nerve > 0.55 && r < 0.25 + ag * 0.6 ? 'angry' : nerve < 0.4 && r < 0.7 ? 'frightened' : 'annoyed';
  }
  if (kind === 'brush') {
    if (p.state === 'walk') p.v *= 0.5; // a check in their stride
  } else {
    p.bumpPrev = p.state === 'vendor' || p.state === 'loiter' || p.state === 'hail' || p.state === 'waitBus' ? p.state : 'walk';
    p.state = kind === 'stumble' ? 'stumble' : 'down';
    p.timer = kind === 'stumble' ? S.rng.range(0.8, 1.3) : S.rng.range(2.5, 4);
    p.v = 0;
  }
  p.bumpResponse = response;
  p.fleeX = p.x - dirX * 2; p.fleeZ = p.z - dirZ * 2; // where the bump came from
  // only the player's actor bumps people (NPCs avoid each other), so every pedBumped is player-caused
  S.emit('pedBumped', { id: p.id, kind, response, x: p.x, z: p.z, dirX, dirZ, by: 'player', actor: by, byPlayer: true, archetype: p.arch.def.id });
  S.stats.bumps = (S.stats.bumps ?? 0) + 1;
}

/** Advance stumble/down/getUp/angry; returns true when it handled the ped this step. */
export function stepBumpState(S: SimCore, p: Ped, dt: number): boolean {
  if (p.state !== 'stumble' && p.state !== 'down' && p.state !== 'getUp' && p.state !== 'angry') return false;
  p.v = 0;
  if ((p.timer -= dt) > 0) {
    if (p.state === 'angry') p.yaw = Math.atan2(-(p.fleeX - p.x), -(p.fleeZ - p.z)); // face the one who did it
    return true;
  }
  if (p.state === 'down') { p.state = 'getUp'; p.timer = S.rng.range(1.0, 1.6); return true; }
  if (p.state === 'getUp') S.emit('pedGotUp', { id: p.id, x: p.x, z: p.z });
  const resp = p.bumpResponse;
  p.bumpResponse = 'none';
  if ((p.state === 'stumble' || p.state === 'getUp') && resp === 'angry') { p.state = 'angry'; p.timer = S.rng.range(2, 3.5); return true; }
  if (resp === 'frightened') { p.state = 'flee'; p.fleeSpeed = 3.2; p.timer = S.rng.range(1.5, 3); return true; }
  p.state = p.bumpPrev && p.bumpPrev !== 'walk' ? p.bumpPrev : 'walk';
  if (p.state !== 'walk') p.timer = S.rng.range(5, 20);
  return true;
}
