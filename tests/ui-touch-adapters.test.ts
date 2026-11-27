import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameplayTouch, vehiclesTouch, combineTouch, type GameplayTouchLike, type VehiclesTouchLike } from '../src/ui/touch/adapters';

function fakes() {
  const calls: string[] = [];
  const g: GameplayTouchLike = {
    touchMode: () => 'combat', armed: () => true,
    contextAction: () => ({ kind: 'pickUp', label: 'Pick up .38', target: 'gun.1' }),
    doContextAction: (d) => calls.push(`ctx:${d ? 'dir' : 'none'}`),
    lockables: () => [{ id: 'npc.a', chest: [1, 1.3, 2] }], aimer: { locked: 'npc.a' },
    lockTarget: (id) => calls.push(`lock:${id}`), swipeLock: (d) => calls.push(`swipe:${d}`), setFiring: (on) => calls.push(`fire:${on}`),
    reload: () => calls.push('reload'), swapWeapon: (d) => calls.push(`swap:${d}`), coverLabel: () => 'Roll',
    coverOrRoll: (d) => calls.push(`cover:${d ? `${d.x},${d.z}` : 'none'}`), drawWeapon: () => calls.push('draw'),
    setContext: (c) => calls.push(`ctxset:${c.fireMode}/${c.gyro}`), setAssist: (a) => calls.push(`assist:${a}`),
  };
  const v: VehiclesTouchLike = { assist: { configure: (s) => calls.push(`steer:${s.steerAssist}/${s.steerAssistStrength}/${s.autoAccelerate}`) }, setHandbrake: (on) => calls.push(`hb:${on}`), horn: (on) => calls.push(`horn:${on}`) };
  return { g, v, calls };
}

test('gameplay adapter: flattens lockables, passes the context label, forwards every call', () => {
  const { g, calls } = fakes();
  const t = gameplayTouch(g, (x, y) => ({ x: x * 100, y: y * 100 }));
  assert.deepEqual(t.lockables!(), [{ id: 'npc.a', x: 1, y: 1.3, z: 2, threat: undefined }]);
  assert.deepEqual(t.context(), { kind: 'pickUp', label: 'Pick up .38' });
  assert.equal(t.locked!(), 'npc.a');
  t.coverOrRoll!({ x: 1, z: 0 }); t.swipeLock!(-1); t.setFiring!(true); t.doContext();
  assert.deepEqual(calls, ['cover:1,0', 'swipe:-1', 'fire:true', 'ctx:none']);
});

test('gyro forces aim assist off; combined configure reaches gameplay and the driver assist', () => {
  const { g, v, calls } = fakes();
  const t = combineTouch(gameplayTouch(g, () => null), vehiclesTouch(v));
  t.configure!({ fireMode: 'tap', aimAssist: 'strong', gyro: 'aim', steerAssist: true, steerAssistStrength: 0.4, autoAccelerate: false });
  assert.deepEqual(calls, ['ctxset:tap/true', 'assist:off', 'steer:true/0.4/false']);
  t.handbrake!(true); t.horn!(false);
  assert.deepEqual(calls.slice(-2), ['hb:true', 'horn:false']);
  assert.equal(t.mode(), 'combat', 'mode stays gameplay\'s');
});

test('gameplay adapter: the context alt verb (greet / antagonize) passes through and fires doAltContextAction', () => {
  const { g, calls } = fakes();
  g.contextAction = () => ({ kind: 'greet', label: 'Say hello', alt: { kind: 'antagonize', label: 'Mouth off' }, target: 'npc.b' });
  g.doAltContextAction = () => calls.push('alt');
  const t = gameplayTouch(g, () => null);
  assert.deepEqual(t.context(), { kind: 'greet', label: 'Say hello', alt: { kind: 'antagonize', label: 'Mouth off' } });
  t.doAltContext!();
  assert.deepEqual(calls, ['alt']);
});
