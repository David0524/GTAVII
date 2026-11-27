/**
 * The playable area as a canvas path (engine's PLAYABLE_OUTLINE: the union of the core and the Grand Central annex),
 * for the maps' out-of-bounds shading and the regional frame. Containment is bounds.inPlayable; PLAYABLE is only a box.
 */
import { PLAYABLE_OUTLINE } from '../../shared/bounds';

/** Appends the outline as a closed subpath (call between beginPath and fill/clip/stroke). */
export function playablePath(g: CanvasRenderingContext2D, X: (x: number) => number, Y: (z: number) => number) {
  PLAYABLE_OUTLINE.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
  g.closePath();
}
