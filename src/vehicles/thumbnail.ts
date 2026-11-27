import * as THREE from 'three/webgpu';
import { MODEL_BY_ID } from './models';
import { getAsset, variantOf } from './assets';
import { createMaterialSet, type Quality } from './gen/materials';

export type ThumbAngle = 'side' | 'three-quarter';
export interface ThumbOptions { width?: number; height?: number; variant?: number; quality?: Quality }

const cache = new Map<string, Promise<ImageBitmap>>();

/**
 * Studio render of a vehicle for the UI (Cars screen, used-car lot, Switch): transparent
 * background, neutral three-point light, the real generated mesh (LOD0) in the given paint.
 * Renders off-screen with the game's renderer, then reads the pixels back. Cached per
 * model / paint / angle / size; call lazily when a screen opens.
 *
 *   const bmp = await renderThumbnail(renderer, 'bancroft', 0x8a2b20, 'three-quarter');
 *
 * `paint` = sRGB hex, or null for the model's own palette colour of `variant`.
 */
export function renderThumbnail(renderer: THREE.WebGPURenderer, modelId: string, paint: number | null, angle: ThumbAngle, opts: ThumbOptions = {}): Promise<ImageBitmap> {
  const w = opts.width ?? 640, h = opts.height ?? 280, variant = opts.variant ?? 0;
  const key = `${modelId}|${paint ?? 'v' + variant}|${angle}|${w}x${h}`;
  let p = cache.get(key);
  if (!p) {
    p = render(renderer, modelId, paint, angle, w, h, variant, opts.quality ?? 'high');
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

async function render(renderer: THREE.WebGPURenderer, modelId: string, paint: number | null, angle: ThumbAngle, w: number, h: number, variant: number, q: Quality): Promise<ImageBitmap> {
  const spec = MODEL_BY_ID.get(modelId);
  if (!spec) throw new Error(`unknown vehicle model ${modelId}`);
  const v = variantOf(spec, variant);
  const asset = getAsset(spec, v);
  const g = asset.lod0;
  const mats = createMaterialSet(q, { paint: paint ?? v.paint, paint2: spec.paint2, roof: spec.roofColor ?? 'paint', metallic: v.metallic, vinyl: v.vinylColor, dirt: 0.05 });

  // ---- the car (body, hood, wheels) in its own scene
  const scene = new THREE.Scene();
  const car = new THREE.Group();
  car.add(new THREE.Mesh(g.body, mats.array));
  if (g.hood) car.add(new THREE.Mesh(g.hood, mats.array));
  for (const bg of [g.bumperF, g.bumperR, ...g.doors.map((d) => d.geo), g.steering?.geo ?? null]) if (bg) car.add(new THREE.Mesh(bg, mats.array));
  if (g.beacon) car.add(new THREE.Mesh(g.beacon, mats.array));
  for (const wm of g.wheels) {
    const m = new THREE.Mesh(wm.side > 0 ? g.wheelR : g.wheelL, mats.wheelArray);
    m.position.set(wm.x, wm.y, wm.z);
    car.add(m);
    if (wm.dual) { const m2 = m.clone(); m2.position.x -= wm.side * (spec.tireW + 0.04); car.add(m2); }
  }
  scene.add(car);
  // neutral studio light: soft sky/ground, key from front-left above, rim from behind
  scene.add(new THREE.HemisphereLight(0xf4f2ee, 0x5a5650, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-4, 6, -5);
  const rim = new THREE.DirectionalLight(0xdfe6ff, 1.4); rim.position.set(3, 3, 6);
  const fill = new THREE.DirectionalLight(0xfff4e6, 0.6); fill.position.set(6, 1.5, -1);
  scene.add(key, rim, fill);
  if (renderer instanceof THREE.WebGPURenderer) {
    // a small studio reflection environment so paint and chrome read
    try {
      const env = new THREE.Scene();
      env.background = new THREE.Color(0x3a3a3c);
      const panel = (y: number, z: number, s: number, c: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 0.4), new THREE.MeshBasicNodeMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(0, y, z); m.lookAt(0, 0, 0); env.add(m); };
      panel(6, -2, 12, 0xffffff); panel(2, 8, 10, 0xc8ccd4); panel(-1, -8, 8, 0x8a8680);
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(env, 0.04).texture;
      scene.environmentIntensity = 0.8;
      pm.dispose();
    } catch { /* lights alone are fine */ }
  }

  // ---- camera framing the bounding box
  const box = new THREE.Box3().setFromObject(car);
  const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(22, w / h, 0.1, 200);
  const dir = angle === 'side' ? new THREE.Vector3(1, 0.06, 0) : new THREE.Vector3(0.72, 0.28, -0.64);
  dir.normalize();
  // distance so the longest projected extent fills ~88% of the frame
  const halfFovV = THREE.MathUtils.degToRad(cam.fov / 2), halfFovH = Math.atan(Math.tan(halfFovV) * cam.aspect);
  const extentH = angle === 'side' ? size.z : Math.hypot(size.x, size.z) * 0.92;
  const dist = Math.max((extentH / 2) / Math.tan(halfFovH), (size.y / 2) / Math.tan(halfFovV)) / 0.88 + Math.max(size.x, size.z) / 2;
  cam.position.copy(centre).addScaledVector(dir, dist);
  cam.lookAt(centre);
  cam.updateMatrixWorld();

  // ---- render off-screen with a transparent clear, read back, flip
  const rt = new THREE.RenderTarget(w, h, { samples: 4, type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace });
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  try {
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    const px = (await renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h)) as Uint8Array;
    const img = new ImageData(w, h);
    const row = w * 4;
    // WebGL reads bottom-up; WebGPU top-down
    const flip = !(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend;
    for (let y = 0; y < h; y++) img.data.set(px.subarray((flip ? h - 1 - y : y) * row, (flip ? h - 1 - y : y) * row + row), y * row);
    return await createImageBitmap(img);
  } finally {
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    rt.dispose();
    mats.dispose();
    scene.environment?.dispose();
  }
}

/** Same render as a WebP blob (for storage / <img> URLs). */
export async function renderThumbnailBlob(renderer: THREE.WebGPURenderer, modelId: string, paint: number | null, angle: ThumbAngle, opts: ThumbOptions = {}): Promise<Blob> {
  const bmp = await renderThumbnail(renderer, modelId, paint, angle, opts);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/webp', 0.9));
}
