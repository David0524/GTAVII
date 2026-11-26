/** Thin wrapper over Clipper (integer, robust) working in metres with 1 cm resolution. */
import ClipperLib from 'clipper-lib';
type P = [number, number];
type Poly = P[][];
const S = 100;
const C = ClipperLib as any;

const toPath = (r: P[]) => r.map(([x, z]) => ({ X: Math.round(x * S), Y: Math.round(z * S) }));
const toPaths = (ps: Poly[]) => ps.flatMap((p) => p.map(toPath));

function treeToPolys(tree: any): Poly[] {
  const out: Poly[] = [];
  const walk = (node: any) => {
    for (const outer of node.Childs()) {
      const poly: Poly = [outer.Contour().map((q: any) => [q.X / S, q.Y / S] as P)];
      for (const hole of outer.Childs()) { poly.push(hole.Contour().map((q: any) => [q.X / S, q.Y / S] as P)); walk(hole); }
      out.push(poly);
    }
  };
  walk(tree);
  return out;
}

function exec(type: number, subj: Poly[], clip: Poly[]): Poly[] {
  const c = new C.Clipper();
  c.AddPaths(toPaths(subj), C.PolyType.ptSubject, true);
  if (clip.length) c.AddPaths(toPaths(clip), C.PolyType.ptClip, true);
  const tree = new C.PolyTree();
  c.Execute(type, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return treeToPolys(tree);
}
export const union = (a: Poly[]) => exec(C.ClipType.ctUnion, a, []);
export const intersect = (a: Poly[], b: Poly[]) => exec(C.ClipType.ctIntersection, a, b);
export const difference = (a: Poly[], b: Poly[]) => exec(C.ClipType.ctDifference, a, b);

/** Buffer open polylines by their half-widths, round joins, square ends; returns unioned polygons. */
export function bufferLines(lines: { pts: P[]; half: number }[]): Poly[] {
  const tree = new C.PolyTree();
  const all: Poly[] = [];
  for (const l of lines) {
    const off = new C.ClipperOffset(2, 0.25 * S);
    off.AddPath(toPath(l.pts), C.JoinType.jtRound, C.EndType.etOpenSquare);
    const t = new C.PolyTree();
    off.Execute(t, l.half * S);
    all.push(...treeToPolys(t));
  }
  void tree;
  return union(all);
}
