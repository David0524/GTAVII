/**
 * Growable vertex/index buffers for one character draw, with the attribute layout the
 * character material reads:
 *   position, normal, skinIndex (u16×4), skinWeight (f32×4), uv,
 *   cA (rgb), cB (rgb), m0 (vec4), m1 (vec4)  — see render/materials.ts for meaning per kind.
 */
export const KIND = { skin: 0, cloth: 1, leather: 2, eye: 3, teeth: 4, lens: 5, metal: 6, hair: 7, hosiery: 8, paper: 9, rubber: 10 } as const;

class F32 { a = new Float32Array(1024); n = 0; push(...v: number[]) { if (this.n + v.length > this.a.length) { const b = new Float32Array(Math.max(this.a.length * 2, this.n + v.length)); b.set(this.a); this.a = b; } for (const x of v) this.a[this.n++] = x; } get() { return this.a.slice(0, this.n); } }
class U32 { a = new Uint32Array(4096); n = 0; push(...v: number[]) { if (this.n + v.length > this.a.length) { const b = new Uint32Array(Math.max(this.a.length * 2, this.n + v.length)); b.set(this.a); this.a = b; } for (const x of v) this.a[this.n++] = x; } get() { return this.a.slice(0, this.n); } }

export interface MatData { cA: [number, number, number]; cB: [number, number, number]; m0: [number, number, number, number]; m1: [number, number, number, number] }

export interface GeoArrays {
  position: Float32Array; normal: Float32Array; uv: Float32Array; uv1: Float32Array;
  skinIndex: Uint16Array; skinWeight: Float32Array;
  cA: Float32Array; cB: Float32Array; m0: Float32Array; m1: Float32Array;
  index: Uint32Array;
  slot: Float32Array;
  vertexCount: number; triangleCount: number;
}

export class MeshBuilder {
  private pos = new F32(); private nrm = new F32(); private uv = new F32();
  private sj = new F32(); private sw = new F32();
  private ca = new F32(); private cb = new F32(); private m0 = new F32(); private m1 = new F32();
  private idx = new U32();
  /** MakeHuman UV + skin-detail layer for skin (u, v, layer; layer −1 = none). */
  private u1 = new F32();
  private sl = new F32();
  /** Garment slot written with each vertex (0 skin/eyes, 1 top, 2 bottom, 3 outer, 4 shoes, 5 accessories, 6 hair); crowds tint per slot. */
  slot = 0;
  /** Whether normals were supplied (else computed at finish). */
  private hasN = true;
  get count() { return this.pos.n / 3; }

  vertex(p: ArrayLike<number>, n: ArrayLike<number> | null, skinJ: ArrayLike<number>, skinW: ArrayLike<number>, m: MatData, uv: [number, number] = [0, 0], uv1?: [number, number, number]): number {
    const i = this.count;
    this.pos.push(p[0], p[1], p[2]);
    if (n) this.nrm.push(n[0], n[1], n[2]); else { this.nrm.push(0, 0, 0); this.hasN = false; }
    this.uv.push(uv[0], uv[1]);
    if (uv1) this.u1.push(uv1[0], uv1[1], uv1[2]); else this.u1.push(0, 0, -1);
    this.sj.push(skinJ[0], skinJ[1], skinJ[2], skinJ[3]); this.sw.push(skinW[0], skinW[1], skinW[2], skinW[3]);
    this.ca.push(...m.cA); this.cb.push(...m.cB); this.m0.push(...m.m0); this.m1.push(...m.m1);
    this.sl.push(this.slot);
    return i;
  }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c); }

  /** Recompute normals for vertices in [from, to) from the triangles that use them (area-weighted). */
  computeNormals(fromVertex: number, toVertex: number, fromIndex: number) {
    const P = this.pos.a, N = this.nrm.a, I = this.idx.a;
    for (let v = fromVertex; v < toVertex; v++) N[v * 3] = N[v * 3 + 1] = N[v * 3 + 2] = 0;
    for (let i = fromIndex; i < this.idx.n; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const o of [a, b, c]) if (o >= fromVertex * 3 && o < toVertex * 3) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; }
    }
    for (let v = fromVertex; v < toVertex; v++) { const o = v * 3; const l = Math.hypot(N[o], N[o + 1], N[o + 2]) || 1; N[o] /= l; N[o + 1] /= l; N[o + 2] /= l; }
  }
  get indexCount() { return this.idx.n; }
  /** Translate a vertex range (e.g. lift everything by the shoe sole). */
  translate(dy: number) { for (let i = 1; i < this.pos.n; i += 3) this.pos.a[i] += dy; }

  finish(): GeoArrays {
    void this.hasN;
    const n = this.count;
    const sj = new Uint16Array(n * 4); for (let i = 0; i < n * 4; i++) sj[i] = this.sj.a[i];
    return {
      position: this.pos.get(), normal: this.nrm.get(), uv: this.uv.get(), uv1: this.u1.get(), skinIndex: sj, skinWeight: this.sw.get(),
      cA: this.ca.get(), cB: this.cb.get(), m0: this.m0.get(), m1: this.m1.get(), index: this.idx.get(), slot: this.sl.get(),
      vertexCount: n, triangleCount: this.idx.n / 3,
    };
  }
}

/** Blend up to 8 weighted skin influences down to the 4 largest (renormalised). */
export function mergeSkin(js: number[], ws: number[], outJ: number[], outW: number[]) {
  const m = new Map<number, number>();
  for (let i = 0; i < js.length; i++) if (ws[i] > 0) m.set(js[i], (m.get(js[i]) || 0) + ws[i]);
  const e = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const s = e.reduce((a, b) => a + b[1], 0) || 1;
  for (let i = 0; i < 4; i++) { outJ[i] = e[i]?.[0] ?? 0; outW[i] = e[i] ? e[i][1] / s : 0; }
}
