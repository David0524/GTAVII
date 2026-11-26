/**
 * One-tap performance report for device testing (phones on preview deploys): GPU adapter, backend,
 * preset, DPR, resolution, frame-time stats, scene counts, input device, user agent.
 * Shown as a button next to the debug HUD (`?hud=1` on phones). Copies plain text to the clipboard.
 */
import type * as THREE from 'three/webgpu';
import type { FrameStats } from './DebugHud';

export function gpuName(renderer: THREE.WebGPURenderer): string {
  const be = renderer.backend as unknown as { isWebGPUBackend?: boolean; adapter?: { info?: Record<string, string> }; device?: { adapterInfo?: Record<string, string> }; gl?: WebGL2RenderingContext };
  if (be.isWebGPUBackend) {
    const info = be.adapter?.info ?? be.device?.adapterInfo;
    if (info) return [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' / ') || 'unknown WebGPU adapter';
    return 'WebGPU adapter (info hidden)';
  }
  const gl = be.gl;
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  }
  return 'unknown';
}

export interface ReportCtx {
  renderer: THREE.WebGPURenderer; backend: string; quality: string; frames: FrameStats;
  world: { stats: Record<string, number> }; device: string; view: string;
}

export function buildReport(c: ReportCtx): string {
  const s = c.frames.summary();
  const r = c.renderer.info.render;
  const canvas = c.renderer.domElement;
  return [
    `T74 perf report · ${new Date().toISOString()}`,
    `build ${import.meta.env.MODE} · ${location.host}${location.pathname}${location.search}`,
    `gpu ${gpuName(c.renderer)}`,
    `backend ${c.backend} · preset ${c.quality} · dpr ${c.renderer.getPixelRatio().toFixed(2)} (device ${window.devicePixelRatio}) · ${canvas.width}x${canvas.height}`,
    `frame avg ${s.avg.toFixed(2)} ms · p95 ${s.p95.toFixed(2)} ms · max ${s.max.toFixed(1)} ms · ${s.fps.toFixed(0)} fps`,
    `draws ${r.drawCalls} · tris ${r.triangles} · chunks lod0 ${c.world.stats.lod0} lod1 ${c.world.stats.lod1}`,
    `view ${c.view} · input ${c.device}`,
    `ua ${navigator.userAgent}`,
  ].join('\n');
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); Object.assign(ta.style, { position: 'fixed', opacity: '0' });
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

/** Button docked under the HUD; visibility follows the HUD. */
export function mountReportButton(getText: () => string): { el: HTMLButtonElement; show(v: boolean): void } {
  const el = document.createElement('button');
  el.textContent = 'COPY PERF REPORT';
  Object.assign(el.style, {
    position: 'fixed', left: '10px', top: '128px', zIndex: '8', padding: '8px 12px', minHeight: '36px',
    background: '#e8b92e', color: '#140a0c', border: '0', borderRadius: '3px', font: '700 11px Archivo, sans-serif', letterSpacing: '.08em',
  });
  el.addEventListener('click', async (e) => {
    e.stopPropagation();
    const text = getText();
    const ok = await copyText(text);
    el.textContent = ok ? 'COPIED ✓' : 'COPY FAILED: SEE CONSOLE';
    if (!ok) console.log(text);
    setTimeout(() => (el.textContent = 'COPY PERF REPORT'), 1800);
  });
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(el);
  return { el, show: (v) => (el.style.display = v ? '' : 'none') };
}
