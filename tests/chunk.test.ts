import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeChunk, readChunk, PaintKind } from '../src/shared/chunkFormat';

test('chunk v2 round-trips buildings, wall occlusion and paint', () => {
  const b = [{ id: 7, year: 1931, use: 1, style: 9, floors: 20, flags: 0, height: 80.5, minHeight: 0,
    rings: [[[0, 0], [10, 0], [10, 12], [0, 12]] as [number, number][]], ao: [[[18.5, 60], [127.5, 0], [3, 24], [40, 100]] as [number, number][]] }];
  const paint = [{ kind: PaintKind.Yellow, width: 0.11, pts: [[1, 2], [21, 2]] as [number, number][] }];
  const c = readChunk(writeChunk(3, -4, b, [], [{ kind: 1, x: 1, z: 2, heading: 0 }], paint).buffer as ArrayBuffer);
  assert.equal(c.i, 3); assert.equal(c.j, -4);
  assert.equal(c.buildings[0].height, 80.5);
  assert.deepEqual([...c.buildings[0].ao![0]], [37, 30, 255, 0, 6, 12, 80, 50]);
  assert.equal(c.paint[0].kind, PaintKind.Yellow);
  assert.deepEqual([...c.paint[0].pts], [1, 2, 21, 2]);
  assert.equal(c.pois.length, 1);
});

test('chunks without wall occlusion still read (optional section)', () => {
  const b = [{ id: 1, year: 1900, use: 0, style: 1, floors: 5, flags: 0, height: 18, minHeight: 0, rings: [[[0, 0], [5, 0], [5, 5]] as [number, number][]] }];
  const c = readChunk(writeChunk(0, 0, b, [], []).buffer as ArrayBuffer);
  assert.equal(c.buildings[0].ao, undefined);
  assert.deepEqual(c.paint, []);
});
