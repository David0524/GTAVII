/**
 * Quadric-error mesh simplification by half-edge collapse (Garland & Heckbert 1997), our own
 * implementation. Vertices are only ever removed, never moved, so every LOD is an index subset
 * of the full mesh and morph targets / skin weights / limb params carry over unchanged.
 *
 * Works on the welded topology (one vertex per position). Seam and boundary vertices can be
 * locked. Per-vertex importance scales the quadrics (faces and hands keep more detail).
 */
export interface SimplifyInput {
  pos: Float32Array;            // welded positions (xyz)
  tris: Uint32Array;            // welded triangle indices
  locked?: Uint8Array;          // 1 = never remove this vertex
  importance?: Float32Array;    // quadric multiplier per vertex (default 1)
  targetTris: number;
  maxError?: number;            // stop early above this quadric error (m²)
}

class Heap {
  k: Float64Array = new Float64Array(1024); a: Int32Array = new Int32Array(1024); b: Int32Array = new Int32Array(1024); v: Int32Array = new Int32Array(1024); n = 0;
  push(key: number, a: number, b: number, ver: number) {
    if (this.n === this.k.length) { const g = <T extends Float64Array | Int32Array>(x: T): T => { const y = new (x.constructor as any)(x.length * 2); y.set(x); return y; }; this.k = g(this.k); this.a = g(this.a); this.b = g(this.b); this.v = g(this.v); }
    let i = this.n++;
    while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] <= key) break; this.k[i] = this.k[p]; this.a[i] = this.a[p]; this.b[i] = this.b[p]; this.v[i] = this.v[p]; i = p; }
    this.k[i] = key; this.a[i] = a; this.b[i] = b; this.v[i] = ver;
  }
  pop(): [number, number, number, number] | null {
    if (!this.n) return null;
    const out: [number, number, number, number] = [this.k[0], this.a[0], this.b[0], this.v[0]];
    const n = --this.n; const key = this.k[n], a = this.a[n], b = this.b[n], v = this.v[n];
    let i = 0;
    for (;;) { let c = i * 2 + 1; if (c >= n) break; if (c + 1 < n && this.k[c + 1] < this.k[c]) c++; if (this.k[c] >= key) break; this.k[i] = this.k[c]; this.a[i] = this.a[c]; this.b[i] = this.b[c]; this.v[i] = this.v[c]; i = c; }
    this.k[i] = key; this.a[i] = a; this.b[i] = b; this.v[i] = v;
    return out;
  }
}

/** Returns the surviving triangles (welded indices) after simplification. */
export function simplify(inp: SimplifyInput): Uint32Array {
  const { pos } = inp;
  const nv = pos.length / 3;
  const tris = Array.from(inp.tris);
  const nt = tris.length / 3;
  const alive = new Uint8Array(nt).fill(1);
  const vtris: number[][] = Array.from({ length: nv }, () => []);
  for (let t = 0; t < nt; t++) for (let c = 0; c < 3; c++) vtris[tris[t * 3 + c]].push(t);
  const locked = new Uint8Array(nv);
  if (inp.locked) locked.set(inp.locked);
  // Boundary vertices (edges used by exactly one triangle) are locked.
  const edgeCount = new Map<number, number>();
  const ek = (a: number, b: number) => (a < b ? a * nv + b : b * nv + a);
  for (let t = 0; t < nt; t++) for (let c = 0; c < 3; c++) { const k = ek(tris[t * 3 + c], tris[t * 3 + (c + 1) % 3]); edgeCount.set(k, (edgeCount.get(k) || 0) + 1); }
  for (const [k, n] of edgeCount) if (n !== 2) { locked[Math.floor(k / nv)] = 1; locked[k % nv] = 1; }

  // Quadrics (10 floats each).
  const Q = new Float64Array(nv * 10);
  const triNormal = (t: number, out: number[]) => {
    const a = tris[t * 3] * 3, b = tris[t * 3 + 1] * 3, c = tris[t * 3 + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    out[0] = uy * vz - uz * vy; out[1] = uz * vx - ux * vz; out[2] = ux * vy - uy * vx;
    const l = Math.hypot(out[0], out[1], out[2]); out[3] = l;
    if (l > 0) { out[0] /= l; out[1] /= l; out[2] /= l; }
  };
  const n4 = [0, 0, 0, 0];
  for (let t = 0; t < nt; t++) {
    triNormal(t, n4);
    const [nx, ny, nz, area2] = n4;
    const a = tris[t * 3] * 3;
    const d = -(nx * pos[a] + ny * pos[a + 1] + nz * pos[a + 2]);
    const w = area2 * 0.5;
    const q = [nx * nx, nx * ny, nx * nz, nx * d, ny * ny, ny * nz, ny * d, nz * nz, nz * d, d * d];
    for (let c = 0; c < 3; c++) { const v = tris[t * 3 + c]; const im = inp.importance ? inp.importance[v] : 1; for (let k = 0; k < 10; k++) Q[v * 10 + k] += q[k] * w * im; }
  }
  const err = (q: number, x: number, y: number, z: number) => {
    const o = q * 10;
    return Q[o] * x * x + 2 * Q[o + 1] * x * y + 2 * Q[o + 2] * x * z + 2 * Q[o + 3] * x + Q[o + 4] * y * y + 2 * Q[o + 5] * y * z + 2 * Q[o + 6] * y + Q[o + 7] * z * z + 2 * Q[o + 8] * z + Q[o + 9];
  };
  /** Cost of collapsing u into v (u removed). */
  const cost = (u: number, v: number) => err(u, pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) + err(v, pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) * 0;
  const ver = new Int32Array(nv);
  const heap = new Heap();
  const pushEdges = (u: number) => {
    if (locked[u]) return;
    const seen = new Set<number>();
    for (const t of vtris[u]) if (alive[t]) for (let c = 0; c < 3; c++) { const v = tris[t * 3 + c]; if (v !== u && !seen.has(v)) { seen.add(v); heap.push(cost(u, v), u, v, ver[u]); } }
  };
  for (let v = 0; v < nv; v++) if (vtris[v].length) pushEdges(v);

  let live = nt;
  const neighbours = (u: number) => { const s = new Set<number>(); for (const t of vtris[u]) if (alive[t]) for (let c = 0; c < 3; c++) s.add(tris[t * 3 + c]); s.delete(u); return s; };
  const nb = [0, 0, 0, 0], na = [0, 0, 0, 0];
  while (live > inp.targetTris) {
    const top = heap.pop(); if (!top) break;
    const [key, u, v, vv] = top;
    if (vv !== ver[u] || locked[u]) continue;
    if (inp.maxError !== undefined && key > inp.maxError) break;
    // Link condition: shared neighbours must be exactly the edge's opposite vertices.
    const Nu = neighbours(u); if (!Nu.has(v)) continue;
    const Nv = neighbours(v);
    let shared = 0; for (const x of Nu) if (Nv.has(x)) shared++;
    let edgeTris = 0; for (const t of vtris[u]) if (alive[t] && (tris[t * 3] === v || tris[t * 3 + 1] === v || tris[t * 3 + 2] === v)) edgeTris++;
    if (shared !== edgeTris) continue;
    // No flips and no slivers among triangles that keep u→v.
    let ok = true;
    for (const t of vtris[u]) {
      if (!alive[t]) continue;
      const o = t * 3; if (tris[o] === v || tris[o + 1] === v || tris[o + 2] === v) continue;
      triNormal(t, nb);
      const c = tris[o] === u ? 0 : tris[o + 1] === u ? 1 : 2;
      tris[o + c] = v; triNormal(t, na); tris[o + c] = u;
      if (na[3] < 1e-12 || nb[0] * na[0] + nb[1] * na[1] + nb[2] * na[2] < 0.3) { ok = false; break; }
    }
    if (!ok) continue;
    // Collapse.
    for (const t of vtris[u]) {
      if (!alive[t]) continue;
      const o = t * 3;
      if (tris[o] === v || tris[o + 1] === v || tris[o + 2] === v) { alive[t] = 0; live--; continue; }
      for (let c = 0; c < 3; c++) if (tris[o + c] === u) tris[o + c] = v;
      vtris[v].push(t);
    }
    vtris[u] = [];
    for (let k = 0; k < 10; k++) Q[v * 10 + k] += Q[u * 10 + k];
    ver[u]++; ver[v]++;
    pushEdges(v);
    for (const x of Nv) { ver[x]++; pushEdges(x); }
    for (const x of Nu) if (!Nv.has(x)) { ver[x]++; pushEdges(x); }
  }
  const out: number[] = [];
  for (let t = 0; t < nt; t++) if (alive[t]) out.push(tris[t * 3], tris[t * 3 + 1], tris[t * 3 + 2]);
  return Uint32Array.from(out);
}
