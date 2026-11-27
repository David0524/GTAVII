/**
 * Camera orbit must not turn the player (user camera report 2026-11-27: "the character stays facing up as
 * the camera moves; in GTA the camera circles the player"). GTA/RDR2 on-foot rules:
 *  - standing still, orbiting the camera 360 degrees changes the player's heading by exactly 0;
 *  - moving, input is camera-relative and the body turns toward the MOVEMENT direction (not the camera).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '../src/shared/rapier';
import { Physics } from '../src/physics/Physics';
import { PlayerController } from '../src/player/PlayerController';
import { GROUPS } from '../src/shared/physicsGroups';
import type { Input } from '../src/input/Input';

const fakeInput = (mx: number, my: number) => ({ move: { x: mx, y: my }, isHeld: () => false, pressed: () => false } as unknown as Input);

async function world() {
  const ph = await Physics.create();
  ph.world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setTranslation(0, -0.5, 0).setCollisionGroups(GROUPS.world));
  const p = new PlayerController(ph, 0, 0.05, 0, 0.3); p.active = true;
  return { ph, p };
}

test('orbiting the camera 360 degrees while standing still leaves the heading unchanged', async () => {
  const { ph, p } = await world();
  const h0 = p.heading; const idle = fakeInput(0, 0);
  for (let k = 0; k < 720; k++) { p.fixedUpdate(1 / 60, idle, (k / 720) * Math.PI * 2, false); ph.world.step(); }
  assert.equal(p.heading, h0);
});

test('moving forward relative to the camera turns the body toward the movement direction', async () => {
  const { ph, p } = await world();
  const camYaw = Math.PI / 2; // camera looking along -x
  for (let k = 0; k < 120; k++) { p.fixedUpdate(1 / 60, fakeInput(0, 1), camYaw, false); ph.world.step(); }
  const move = Math.atan2(-p.vel.x, -p.vel.z);
  const d = Math.atan2(Math.sin(p.heading - move), Math.cos(p.heading - move));
  assert.ok(Math.abs(d) < 0.05, `heading ${p.heading.toFixed(3)} vs movement ${move.toFixed(3)}`);
  assert.ok(Math.abs(Math.atan2(Math.sin(move - camYaw), Math.cos(move - camYaw))) < 0.05, 'stick-forward moves along the camera view');
});
