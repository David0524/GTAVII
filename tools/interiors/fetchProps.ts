/**
 * Free prop models for interiors (FREE_ASSETS.md, $0): downloads Poly Haven glTF models (CC0, https://polyhaven.com/license),
 * downsizes the textures for the web, packs each model into one GLB under public/models/interiors/, writes the manifest
 * src/interiors/props/manifest.json (key, file, tris, local bounds, licence) and the ledger rows in docs/licenses/ASSETS.md.
 *   npx tsx tools/interiors/fetchProps.ts [--tex 512]
 * Needs ImageMagick `convert`. KTX2 compression comes later with the engine's texture toolchain (ENGINE_REQUESTS 9).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'public/models/interiors');
const TMP = path.join(process.env.TMPDIR ?? '/tmp', 'interiors-props'); // downloads stay out of the repo
const UA = 'Tenderloin74AssetFetch/0.1 (CC0 game props; one request per second)';
const TEX = +(process.argv[process.argv.indexOf('--tex') + 1] || 512) || 512;

/** prop key -> Poly Haven id (PROP_CANDIDATES.md top picks; hero rooms first). */
export const PROPS: Record<string, { ph: string; note: string }> = {
  kitchen_chair: { ph: 'painted_wooden_chair_02', note: 'ladder-back kitchen chair, chipped paint' },
  kitchen_chair_b: { ph: 'painted_wooden_chair_01', note: 'slat-back chair, peeling (mismatched sets)' },
  kitchen_table: { ph: 'painted_wooden_table', note: 'painted trestle table' },
  cloth_table: { ph: 'dining_table', note: 'table with a gingham cloth' },
  kitchen_cabinet: { ph: 'painted_wooden_cabinet', note: 'enamelled kitchen cabinet' },
  club_sofa: { ph: 'sofa_02', note: 'tufted leather loveseat (lobby/club)' },
  parlour_armchair: { ph: 'ArmChair_01', note: 'bergere armchair (old parlour)' },
  settle_bench: { ph: 'painted_wooden_bench', note: 'high-back settle bench' },
  cafe_table: { ph: 'round_wooden_table_01', note: 'pedestal cafe table' },
  bar_stool: { ph: 'metal_stool_01', note: 'wood-top ring stool' },
  steel_desk: { ph: 'metal_office_desk', note: 'grey steel tanker desk' },
  steel_rack: { ph: 'worn_metal_rack', note: 'green painted steel shelving' },
  barber_chair: { ph: 'BarberShopChair_01', note: 'tufted leather barber chair' },
  bulb_socket: { ph: 'pull_chain_light_socket', note: 'porcelain pull-chain socket' },
  bulb: { ph: 'lightbulb_01', note: 'clear filament bulb' },
  enamel_pendant: { ph: 'hanging_industrial_lamp', note: 'enamel warehouse pendant' },
  suitcase: { ph: 'vintage_suitcase', note: 'hard suitcase (check sticker text)' },
  toolbox: { ph: 'metal_toolbox', note: 'steel toolbox' },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function get(url: string): Promise<Buffer> {
  const w = last + 1000 - Date.now(); if (w > 0) await sleep(w); last = Date.now();
  for (let k = 0; k < 4; k++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } }).catch(() => null);
    if (r?.ok) return Buffer.from(await r.arrayBuffer());
    await sleep(2000 * (k + 1));
  }
  throw new Error(`failed ${url}`);
}

/** Pack a .gltf with external buffers/images into a GLB (images become bufferViews). */
function packGlb(gltf: any, files: Map<string, Buffer>): Buffer {
  const chunks: Buffer[] = []; let off = 0;
  const pushBuf = (b: Buffer) => { const start = off; chunks.push(b); off += b.length; const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; } return start; };
  // existing buffers -> one
  const bufStarts: number[] = [];
  for (const b of gltf.buffers ?? []) { const data = files.get(b.uri); if (!data) throw new Error(`missing ${b.uri}`); bufStarts.push(pushBuf(data)); }
  for (const bv of gltf.bufferViews ?? []) { bv.byteOffset = (bv.byteOffset ?? 0) + bufStarts[bv.buffer]; bv.buffer = 0; }
  for (const img of gltf.images ?? []) {
    const data = files.get(img.uri); if (!data) throw new Error(`missing ${img.uri}`);
    const start = pushBuf(data);
    gltf.bufferViews.push({ buffer: 0, byteOffset: start, byteLength: data.length });
    img.bufferView = gltf.bufferViews.length - 1; img.mimeType = 'image/jpeg'; delete img.uri;
  }
  const bin = Buffer.concat(chunks);
  gltf.buffers = [{ byteLength: bin.length }];
  let json = Buffer.from(JSON.stringify(gltf)); const jp = (4 - (json.length % 4)) % 4; if (jp) json = Buffer.concat([json, Buffer.alloc(jp, 0x20)]);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, json, bh, bin]);
}

/** Local bounds: the 8 corners of each POSITION accessor box through the full node TRS hierarchy. */
type Mat4 = number[];
const mul = (a: Mat4, b: Mat4): Mat4 => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
function trs(n: any): Mat4 {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0, 2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
function bounds(gltf: any): [number, number, number, number, number, number] {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  const visit = (ni: number, parent: Mat4) => {
    const n = gltf.nodes[ni], m = mul(parent, trs(n));
    if (n.mesh !== undefined) for (const p of gltf.meshes[n.mesh].primitives) {
      const a = gltf.accessors[p.attributes.POSITION];
      for (let c = 0; c < 8; c++) {
        const v = [c & 1 ? a.max[0] : a.min[0], c & 2 ? a.max[1] : a.min[1], c & 4 ? a.max[2] : a.min[2]];
        for (let k = 0; k < 3; k++) { const w = m[k] * v[0] + m[4 + k] * v[1] + m[8 + k] * v[2] + m[12 + k]; b[k] = Math.min(b[k], w); b[k + 3] = Math.max(b[k + 3], w); }
      }
    }
    for (const ch of n.children ?? []) visit(ch, m);
  };
  for (const r of gltf.scenes[gltf.scene ?? 0].nodes) visit(r, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return b.map((v) => +v.toFixed(3)) as [number, number, number, number, number, number];
}

async function main() {
  if (process.argv.includes('--rebounds')) {
    // recompute manifest bounds from the packed GLBs (no network)
    const mf = path.join(ROOT, 'src/interiors/props/manifest.json'), man = JSON.parse(fs.readFileSync(mf, 'utf8'));
    for (const [key, e] of Object.entries(man as Record<string, { file: string; bounds: number[] }>)) {
      const buf = fs.readFileSync(path.join(ROOT, 'public', e.file)), jl = buf.readUInt32LE(12);
      e.bounds = bounds(JSON.parse(buf.subarray(20, 20 + jl).toString())); console.log(key, e.bounds.join(' '));
    }
    fs.writeFileSync(mf, JSON.stringify(man, null, 1)); return;
  }
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
  const manifest: Record<string, unknown> = {};
  const ledger: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const [key, { ph, note }] of Object.entries(PROPS)) {
    const info = JSON.parse((await get(`https://api.polyhaven.com/info/${ph}`)).toString());
    const files = JSON.parse((await get(`https://api.polyhaven.com/files/${ph}`)).toString());
    const g = files.gltf['1k'].gltf;
    const gltf = JSON.parse((await get(g.url)).toString());
    const blobs = new Map<string, Buffer>();
    for (const [rel, f] of Object.entries(g.include as Record<string, { url: string }>)) {
      let data = await get(f.url);
      if (/\.(jpe?g|png)$/i.test(rel)) {
        const src = path.join(TMP, path.basename(rel)), dst = src.replace(/\.(png|jpe?g)$/i, `_${TEX}.jpg`);
        fs.writeFileSync(src, data);
        execFileSync('convert', [src, '-resize', `${TEX}x${TEX}>`, '-strip', '-quality', '86', dst]);
        data = fs.readFileSync(dst);
      }
      blobs.set(rel, data);
    }
    for (const img of gltf.images ?? []) img.uri = decodeURIComponent(img.uri);
    const glb = packGlb(gltf, blobs);
    const file = `models/interiors/${key}.glb`;
    fs.writeFileSync(path.join(ROOT, 'public', file), glb);
    manifest[key] = { file, source: `https://polyhaven.com/a/${ph}`, name: info.name, tris: info.polycount ?? null, bounds: bounds(gltf), licence: 'CC0-1.0', authors: Object.keys(info.authors ?? {}), note, bytes: glb.length };
    ledger.push(`| ${key} | ${info.name} | https://polyhaven.com/a/${ph} | CC0 1.0 (https://polyhaven.com/license) | ${today} | public/${file} | ${Object.keys(info.authors ?? {}).join(', ')} (no attribution required) |`);
    console.log(key, ph, `${(glb.length / 1024).toFixed(0)} KiB`, info.polycount);
  }
  fs.mkdirSync(path.join(ROOT, 'src/interiors/props'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'src/interiors/props/manifest.json'), JSON.stringify(manifest, null, 1));
  // ledger: replace the interiors section
  const L = path.join(ROOT, 'docs/licenses/ASSETS.md');
  let txt = fs.existsSync(L) ? fs.readFileSync(L, 'utf8') : '# Third-party assets ledger (FREE_ASSETS.md licence gate)\n\nOne section per workstream. Every shipped third-party file is listed with its source, licence, date checked, files and attribution.\n';
  const head = '## Interiors: prop models (tools/interiors/fetchProps.ts)';
  const sect = `${head}\n\n| Key | Asset | Source | Licence | Checked | Files | Authors / attribution |\n|---|---|---|---|---|---|---|\n${ledger.join('\n')}\n`;
  const i = txt.indexOf(head);
  if (i >= 0) { const j = txt.indexOf('\n## ', i + head.length); txt = txt.slice(0, i) + sect + (j >= 0 ? txt.slice(j + 1) : ''); } else txt = txt.trimEnd() + '\n\n' + sect;
  fs.mkdirSync(path.dirname(L), { recursive: true }); fs.writeFileSync(L, txt);
}
main().catch((e) => { console.error(e); process.exit(1); });
