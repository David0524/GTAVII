import * as THREE from 'three/webgpu';
import { createRenderer } from '../../engine/renderer';
import { BodyModel } from '../body/BodyModel';
import { buildSkeleton } from '../body/skeleton';
import { generateAppearance } from '../body/appearance';
import { generateOutfit } from '../wardrobe/outfit';
import { assemble } from '../build/assemble';
import { createSkinnedMeshes } from '../render/meshes';
import { characterMaterial } from '../render/materials';
import { normalGeometry } from 'three/tsl';
import { AnimLibrary, Pose, clearAcc, normalizePose } from '../anim/AnimLibrary';

/** ?characters=1 test scene (grows into lineup / locomotion course / crowd stress test). */
export async function runCharactersTest() {
  const qp = new URLSearchParams(location.search);
  const { renderer } = await createRenderer(document.getElementById('app')!, 1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2522);
  const camera = new THREE.PerspectiveCamera(24, innerWidth / innerHeight, 0.1, 200);
  const n = +(qp.get('n') ?? 8);
  const zoom = qp.get('zoom');
  if (zoom) { camera.position.set(0, 1.55, 1.6); camera.lookAt(0, 1.5, 0); } else { camera.position.set(0, 1.15, n * 1.35); camera.lookAt(0, 0.9, 0); }
  scene.add(new THREE.HemisphereLight(0xcfd6e8, 0x40342c, 1.3));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.6); sun.position.set(3, 5, 6); scene.add(sun);
  const rim = new THREE.DirectionalLight(0xc8d8ff, 1.2); rim.position.set(-4, 3, -5); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardNodeMaterial({ color: 0x4a4440, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  if (qp.get('dbg') === 'n') { const mm = characterMaterial(); mm.colorNode = normalGeometry.mul(0.5).add(0.5); mm.normalNode = null; }
  if (qp.get('dbg') === 'nobump') characterMaterial().normalNode = null;
  const body = await BodyModel.load(import.meta.env.BASE_URL + 'characters/body.bin');
  const lib = await AnimLibrary.load(import.meta.env.BASE_URL + 'characters/anims.bin');
  const clipName = qp.get('clip') ?? 'Idle_Loop';
  const lod = +(qp.get('lod') ?? 0);
  const seed0 = +(qp.get('seed') ?? 1);
  const report: any[] = [];
  for (let i = 0; i < n; i++) {
    const seed = seed0 + i * 7919;
    const app = generateAppearance(seed);
    const outfit = generateOutfit(seed ^ 0x5bd1e995, { sex: app.sex, age: app.age });
    const shape = body.evaluate({ ...app.body, stature: app.stature });
    const asm = assemble(body, shape, app, outfit, lod);
    const { skeleton, root } = buildSkeleton(asm.joints);
    const { main, hair } = createSkinnedMeshes(asm.main, asm.hair, skeleton, root);
    const g = new THREE.Group(); g.add(main); if (hair) g.add(hair);
    g.position.x = zoom ? 0 : (i - (n - 1) / 2) * 1.0;
    if (zoom && i > 0) continue;
    scene.add(g);
    const pose = new Pose(); clearAcc(pose); lib.accumulate(lib.get(clipName), +(qp.get('t') ?? 0.3), 1, pose); normalizePose(pose);
    skeleton.bones.forEach((b, j) => b.quaternion.fromArray(pose.q, j * 4));
    const s = (asm.joints[4] - asm.lift) / lib.restPelvisHeight;
    skeleton.bones[1].position.set(pose.pelvis[0] * s, pose.pelvis[1] * s + asm.lift, pose.pelvis[2] * s);
    report.push({ seed, sex: app.sex, age: app.age, hair: app.hair.style, top: outfit.top.kind, bottom: outfit.bottom.kind, outer: outfit.outer?.kind ?? null, tris: asm.stats.tris, hairTris: asm.stats.hairTris, ms: +asm.stats.ms.toFixed(1) });
  }
  (window as any).__CHAR = { ready: true, report };
  renderer.setAnimationLoop(() => renderer.render(scene, camera));
  document.getElementById('loading')?.remove();
}
