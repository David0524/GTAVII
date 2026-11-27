/**
 * Cuts a piece out of a surface with scalar fields (keep where every field ≥ 0), producing clean
 * iso-line edges (hems, cuffs, necklines) instead of jagged triangle steps. Output vertices are
 * weighted blends of up to 4 compact vertices, so they morph and skin exactly like the body.
 */
export interface PV { ids: number[]; w: number[]; f: number[]; key: string }
export interface ClipResult { verts: PV[]; tris: number[] }
export type Field = (k: number) => number;

export function clipSurface(tris: Uint32Array, fields: Field[], cache?: Map<number, number[]>): ClipResult {
  const fv = cache ?? new Map<number, number[]>();
  const fvOf = (k: number) => { let f = fv.get(k); if (!f) { f = fields.map((fn) => fn(k)); fv.set(k, f); } return f; };
  const verts: PV[] = [];
  const index = new Map<string, number>();
  const outTris: number[] = [];
  const add = (p: PV) => { let i = index.get(p.key); if (i === undefined) { i = verts.length; verts.push(p); index.set(p.key, i); } return i; };
  const orig = (k: number): PV => ({ ids: [k], w: [1], f: fvOf(k), key: `${k}` });
  const lerp = (a: PV, b: PV, t: number, fi: number): PV => {
    const m = new Map<number, number>();
    a.ids.forEach((id, i) => m.set(id, (m.get(id) || 0) + a.w[i] * (1 - t)));
    b.ids.forEach((id, i) => m.set(id, (m.get(id) || 0) + b.w[i] * t));
    let e = [...m.entries()].filter(([, w]) => w > 1e-5);
    if (e.length > 4) { e.sort((x, y) => y[1] - x[1]); e = e.slice(0, 4); const s = e.reduce((x, y) => x + y[1], 0); e = e.map(([id, w]) => [id, w / s]); }
    const ka = a.key < b.key ? a.key : b.key, kb = a.key < b.key ? b.key : a.key;
    return { ids: e.map((x) => x[0]), w: e.map((x) => x[1]), f: a.f.map((v, i) => v + (b.f[i] - v) * t), key: `${ka}~${kb}~${fi}` };
  };
  const nf = fields.length;
  for (let i = 0; i < tris.length; i += 3) {
    const fa = fvOf(tris[i]), fb = fvOf(tris[i + 1]), fc = fvOf(tris[i + 2]);
    let allIn = true, anyAllOut = false;
    for (let f = 0; f < nf; f++) {
      const ia = fa[f] >= 0, ib = fb[f] >= 0, ic = fc[f] >= 0;
      if (!(ia && ib && ic)) allIn = false;
      if (!ia && !ib && !ic) { anyAllOut = true; break; }
    }
    if (anyAllOut) continue;
    if (allIn) { outTris.push(add(orig(tris[i])), add(orig(tris[i + 1])), add(orig(tris[i + 2]))); continue; }
    let poly: PV[] = [orig(tris[i]), orig(tris[i + 1]), orig(tris[i + 2])];
    for (let f = 0; f < nf && poly.length >= 3; f++) {
      const next: PV[] = [];
      for (let j = 0; j < poly.length; j++) {
        const a = poly[j], b = poly[(j + 1) % poly.length];
        const ia = a.f[f] >= 0, ib = b.f[f] >= 0;
        if (ia) next.push(a);
        if (ia !== ib) {
          const t = a.f[f] / (a.f[f] - b.f[f]);
          const p = lerp(a, b, Math.min(1, Math.max(0, t)), f);
          p.f[f] = 0;
          next.push(p);
        }
      }
      poly = next;
    }
    if (poly.length < 3) continue;
    const ids = poly.map(add);
    for (let j = 1; j + 1 < ids.length; j++) if (ids[0] !== ids[j] && ids[j] !== ids[j + 1] && ids[0] !== ids[j + 1]) outTris.push(ids[0], ids[j], ids[j + 1]);
  }
  return { verts, tris: outTris };
}

/** Boundary edges (used by exactly one triangle), as directed pairs following triangle winding. */
export function boundaryEdges(tris: number[]): [number, number][] {
  const count = new Map<string, number>();
  const dir: [number, number][] = [];
  for (let i = 0; i < tris.length; i += 3) for (let c = 0; c < 3; c++) {
    const a = tris[i + c], b = tris[i + (c + 1) % 3];
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    count.set(k, (count.get(k) || 0) + 1);
    dir.push([a, b]);
  }
  return dir.filter(([a, b]) => count.get(a < b ? `${a},${b}` : `${b},${a}`) === 1);
}
