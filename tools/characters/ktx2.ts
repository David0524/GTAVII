/**
 * Head textures -> KTX2 (Basis ETC1S, mipmapped) for GPU memory: a 2048² RGBA8 map with mips is
 * ~22 MB of VRAM; ETC1S transcodes to BC1/BC3/ETC2 at 0.5-1 byte/px (~3-6 MB).
 *   npx tsx tools/characters/ktx2.ts <id> [maps=c,o]      (public/characters/rb/<id>_<map>.webp -> .ktx2)
 * Compressed textures can't be flipped on upload, so the image is flipped here (the runtime sets
 * flipY=false, as KTX2Loader does). Colour maps are tagged sRGB; data maps (n, o's packed RGB) linear.
 * Marks the head's index entry with ktx2: [maps]; the runtime falls back to WebP without a renderer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { encodeToKTX2 } from 'ktx2-encoder';

const [id, mapsArg] = process.argv.slice(2);
const maps = (mapsArg ?? 'c,o').split(',');
const DIR = path.resolve(import.meta.dirname, '../../public/characters/rb');
const TMP = path.resolve(import.meta.dirname, 'scratch/ktx2'); fs.mkdirSync(TMP, { recursive: true });
for (const m of maps) {
  const src = path.join(DIR, `${id}_${m}.webp`), raw = path.join(TMP, `${id}_${m}.raw`);
  // decode + flip vertically with Pillow (no image decoder in Node)
  const dims = execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA').transpose(Image.FLIP_TOP_BOTTOM)
open(sys.argv[2], 'wb').write(im.tobytes()); print(im.size[0], im.size[1])`, src, raw]).toString().trim().split(' ').map(Number);
  const data = new Uint8Array(fs.readFileSync(raw));
  const out = await encodeToKTX2(new Uint8Array(1), {
    isUASTC: false, qualityLevel: 255, generateMipmap: true, isSetKTX2SRGBTransferFunc: m === 'c',
    imageDecoder: async () => ({ data, width: dims[0], height: dims[1] }),
  } as any);
  fs.writeFileSync(path.join(DIR, `${id}_${m}.ktx2`), out);
  console.log(`${id}_${m}.ktx2`, out.length, 'bytes', dims.join('x'));
}
const idxFile = path.join(DIR, 'index.json');
const index = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
for (const h of index.heads) if (h.id === id) h.ktx2 = maps;
fs.writeFileSync(idxFile, JSON.stringify(index, null, 1));
