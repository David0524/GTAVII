import * as THREE from 'three/webgpu';
import { createRenderer } from '../../engine/renderer';
import { BodyModel } from '../body/BodyModel';
import { buildSkeleton } from '../body/skeleton';
import { DEFAULT_MACRO } from '../body/macro';
import { AnimLibrary, Pose, clearAcc, normalizePose } from '../anim/AnimLibrary';

/** ?characters=1 test scene (grows into lineup / locomotion course / crowd stress test). */
export async function runCharactersTest() {
  const { renderer } = await createRenderer(document.getElementById('app')!, 1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2522);
  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 200);
  camera.position.set(0, 1.2, 9); camera.lookAt(0, 0.95, 0);
  scene.add(new THREE.HemisphereLight(0xcfd6e8, 0x40342c, 1.4));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.5); sun.position.set(3, 5, 6); scene.add(sun);
  const body = await BodyModel.load(import.meta.env.BASE_URL + 'characters/body.bin');
  const lib = await AnimLibrary.load(import.meta.env.BASE_URL + 'characters/anims.bin');
  const qp = new URLSearchParams(location.search);
  const clipName = qp.get('clip');
  const variants = [
    { sex: 0, age: 25 }, { sex: 1, age: 25 }, { sex: 1, age: 70, weight: 0.8 }, { sex: 0, age: 60, weight: 0.75 },
    { sex: 1, age: 35, muscle: 0.9, african: 1, asian: 0, caucasian: 0 }, { sex: 0, age: 30, african: 0, asian: 1, caucasian: 0, height: 0.2 }, { sex: 1, age: 16, weight: 0.3 },
  ];
  variants.forEach((v, n) => {
    const shape = body.evaluate({ macro: { ...DEFAULT_MACRO, ...v } });
    const groups = (new URLSearchParams(location.search).get('groups') ?? 'body,helper-l-eye,helper-r-eye').split(',');
    const idx: number[] = [];
    for (const g of groups) idx.push(...body.indices(g, 0));
    const pos = new Float32Array(body.numSplit * 3), skinI = new Uint16Array(body.numSplit * 4), skinW = new Float32Array(body.numSplit * 4);
    for (let s = 0; s < body.numSplit; s++) {
      const k = body.splitSrc[s];
      for (let c = 0; c < 3; c++) pos[s * 3 + c] = shape.pos[k * 3 + c];
      for (let c = 0; c < 4; c++) { skinI[s * 4 + c] = body.skinJ[k * 4 + c]; skinW[s * 4 + c] = body.skinW[k * 4 + c] / 255; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(skinI, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(skinW, 4));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.SkinnedMesh(g, new THREE.MeshStandardNodeMaterial({ color: 0x9a7a66, roughness: 0.6 }));
    const { skeleton, root } = buildSkeleton(shape.joints);
    m.add(root); m.bind(skeleton);
    if (clipName) {
      const pose = new Pose(); clearAcc(pose); lib.accumulate(lib.get(clipName), +(qp.get('t') ?? 0) + n * 0.11, 1, pose); normalizePose(pose);
      skeleton.bones.forEach((b, j) => b.quaternion.fromArray(pose.q, j * 4));
      const s = (shape.joints[4] - 0) / lib.restPelvisHeight;
      skeleton.bones[1].position.set(pose.pelvis[0] * s, pose.pelvis[1] * s, pose.pelvis[2] * s);
    }
    m.position.x = (n - (variants.length - 1) / 2) * 1.1;
    scene.add(m);
    // joint markers
    for (let j = 0; j < shape.joints.length / 3; j++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.012), new THREE.MeshBasicNodeMaterial({ color: 0xff3020, depthTest: false })); d.position.fromArray(shape.joints, j * 3); d.position.x += m.position.x; d.position.z += 0.3; scene.add(d); }
  });
  (window as any).__CHAR = { ready: true };
  renderer.setAnimationLoop(() => renderer.render(scene, camera));
  document.getElementById('loading')?.remove();
}
