/**
 * Lab-only: renders the real streamed city behind the UI from a third-person camera following the
 * mock player, using the engine's public modules read-only. The game itself never uses this file.
 */
import * as THREE from 'three/webgpu';
import { createRenderer } from '../../engine/renderer';
import { PRESETS } from '../../engine/quality';
import { World } from '../../world/World';
import { Atmosphere } from '../../world/Atmosphere';
import { loadSkyline } from '../../world/Skyline';
import { loadTerrain, heightAt } from '../../shared/terrain';

export interface Backdrop {
  renderer: THREE.WebGPURenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; world: World;
  frame(p: { x: number; z: number; yaw: number }): void;
  whenIdle(): Promise<void>;
  actorGroup: THREE.Group;
}

export async function cityBackdrop(container: HTMLElement, quality: 'low' | 'medium' | 'high' = 'high'): Promise<Backdrop> {
  const q = { ...PRESETS[quality] };
  const { renderer } = await createRenderer(container, Math.min(window.devicePixelRatio || 1, q.pixelRatio * 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.15, 30000);
  new Atmosphere(scene);
  await loadTerrain();
  const world = new World(q); await world.load(); scene.add(world.root);
  scene.add(await loadSkyline(import.meta.env.BASE_URL + 'data/skyline.bin'));
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.2, 4, 10), new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.8 }));
  scene.add(body);
  const actorGroup = new THREE.Group(); actorGroup.name = 'cine-standins'; scene.add(actorGroup);
  const resize = () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); };
  addEventListener('resize', resize); resize();
  let frames = 0;
  const bd: Backdrop = {
    renderer, scene, camera, world, actorGroup,
    frame(p) {
      const y = heightAt(p.x, p.z) + 0.15;
      body.position.set(p.x, y + 0.88, p.z);
      // camera 3.2 m behind, 1.9 m up, looking just over the shoulder; yaw 0 faces -z (north)
      if (!(bd as Backdrop & { cineOwned?: boolean }).cineOwned) {
        const bx = Math.sin(p.yaw) * 3.4, bz = Math.cos(p.yaw) * 3.4;
        camera.position.set(p.x + bx + 0.5, y + 2.0, p.z + bz);
        camera.lookAt(p.x - Math.sin(p.yaw) * 6, y + 1.5, p.z - Math.cos(p.yaw) * 6);
      }
      world.update(camera.position);
      renderer.render(scene, camera);
      frames++;
    },
    whenIdle: () => new Promise((res) => { const t = () => (world.idle && frames > 5 ? res() : setTimeout(t, 60)); t(); }),
  };
  return bd;
}
