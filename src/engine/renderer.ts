import * as THREE from 'three/webgpu';

export interface RendererInfo { renderer: THREE.WebGPURenderer; backend: 'webgpu' | 'webgl2' }

/** WebGPU first; WebGL2 backend when WebGPU is unavailable or ?webgl=1 is set. */
export async function createRenderer(container: HTMLElement, pixelRatio: number): Promise<RendererInfo> {
  const params = new URLSearchParams(location.search);
  const forceWebGL = params.has('webgl') || !('gpu' in navigator);
  // GPU timestamps for the device perf report (?hud=1 or ?gpu=1); WebGPU only where 'timestamp-query' exists
  const trackTimestamp = params.get('hud') === '1' || params.has('gpu');
  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL, powerPreference: 'high-performance', trackTimestamp });
  await renderer.init();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, matchMedia("(pointer: coarse)").matches ? 1.5 : 2) * pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);
  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';
  return { renderer, backend };
}
