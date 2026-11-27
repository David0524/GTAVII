/**
 * ICT-FaceKit "Light" (USC ICT, MIT; docs/licenses/ASSETS.md) -> our container.
 *   npx tsx tools/characters/build-ict.ts --src <dir with generic_neutral_mesh.obj, identityNNN.obj> [--modes 40]
 * Writes data/raw_ict/ict_basis.bin (dev only, gitignored, served by Vite for the design scene):
 *   neutral positions (metres), split vertices by (position, uv) pair, triangles, uv, part ranges,
 *   and the identity modes as int16 deltas with per-mode scales.
 * The design scene (`?characters=1&scene=ict&c=<coefficients>`) previews a synthesised identity;
 * only the final baked head ships (build-ict.ts --bake), never the basis.
 * Identities are synthesised by hand-chosen coefficients. We never fit the model to photos of
 * real people (licence log: synthesised identities only).
 */
import fs from 'node:fs';
import path from 'node:path';
import { writeContainer } from '../../src/characters/format';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const src = opt('--src')!;
const modes = Number(opt('--modes') ?? 40);
const S = 0.01; // cm -> m

function readObj(file: string, withFaces: boolean) {
  const v: number[] = [], vt: number[] = [], f: [number, number][][] = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('v ')) { const p = line.split(/\s+/); v.push(+p[1] * S, +p[2] * S, +p[3] * S); }
    else if (withFaces && line.startsWith('vt ')) { const p = line.split(/\s+/); vt.push(+p[1], +p[2]); }
    else if (withFaces && line.startsWith('f ')) f.push(line.trim().split(/\s+/).slice(1).map((t) => { const [a, b] = t.split('/'); return [+a - 1, +b - 1] as [number, number]; }));
  }
  return { v, vt, f };
}

const neutral = readObj(path.join(src, 'generic_neutral_mesh.obj'), true);
const nv = neutral.v.length / 3;
// split vertices per (position, uv) pair; triangulate quads
const key = new Map<string, number>();
const splitSrc: number[] = [], uv: number[] = [], idx: number[] = [];
for (const face of neutral.f) {
  const ids = face.map(([p, t]) => { const k = `${p}/${t}`; let o = key.get(k); if (o === undefined) { o = splitSrc.length; key.set(k, o); splitSrc.push(p); uv.push(neutral.vt[t * 2], neutral.vt[t * 2 + 1]); } return o; });
  for (let i = 1; i + 1 < ids.length; i++) idx.push(ids[0], ids[i], ids[i + 1]);
}
// identity modes: absolute meshes -> deltas from the neutral
const deltas = new Int16Array(modes * nv * 3), scales = new Float32Array(modes);
for (let m = 0; m < modes; m++) {
  const id = readObj(path.join(src, `identity${String(m).padStart(3, '0')}.obj`), false).v;
  let mx = 0; for (let i = 0; i < nv * 3; i++) mx = Math.max(mx, Math.abs(id[i] - neutral.v[i]));
  const s = mx / 32767 || 1; scales[m] = s;
  for (let i = 0; i < nv * 3; i++) deltas[m * nv * 3 + i] = Math.round((id[i] - neutral.v[i]) / s);
  process.stdout.write(`\rmode ${m + 1}/${modes} max ${(mx * 1000).toFixed(1)} mm   `);
}
// part ranges from the ICT README (vertex index ranges in the source topology)
const parts = { face: [0, 9409], headNeck: [9409, 11248], mouthSocket: [11248, 13294], eyeSocketL: [13294, 13678], eyeSocketR: [13678, 14062], gums: [14062, 17039], teeth: [17039, 21451], eyeL: [21451, 23021], eyeR: [23021, 24591], irisL: [22221, 23021], irisR: [23791, 24591], lacrimalL: [24591, 24795], lacrimalR: [24795, 24999], eyeBlendL: [24999, 25023], eyeBlendR: [25023, 25047], occlusionL: [25047, 25199], occlusionR: [25199, 25351], lashesL: [25351, 26035], lashesR: [26035, 26719] };
const meta = { source: 'ICT-FaceKit Light (USC ICT, MIT License, Copyright (c) 2020 USC Institute for Creative Technologies)', units: 'm', numSrc: nv, numSplit: splitSrc.length, modes, parts };
const out = writeContainer(meta, { neutral: Float32Array.from(neutral.v), splitSrc: Uint32Array.from(splitSrc), uv: Float32Array.from(uv), idx: Uint32Array.from(idx), deltas, scales }, { deltas: { kind: 'delta3', seg: nv * 3 } });
fs.mkdirSync('data/raw_ict', { recursive: true });
fs.writeFileSync('data/raw_ict/ict_basis.bin', out);
console.log(`\nwrote data/raw_ict/ict_basis.bin ${(out.length / 1048576).toFixed(1)} MiB: ${nv} vertices, ${splitSrc.length} split, ${idx.length / 3} triangles, ${modes} modes`);
