/**
 * One-tap performance report for device testing (phones on preview deploys): GPU adapter, backend,
 * preset, DPR, resolution, frame-time stats, scene counts, input device, user agent.
 * Shown as a button next to the debug HUD (`?hud=1` on phones). Copies plain text to the clipboard.
 */
import type * as THREE from 'three/webgpu';
import { FrameStats } from './DebugHud';
import { loadReport } from './LoadReport';

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
  extra?: string[];
}

/**
 * Per-frame samples for the device report (oversight, first iPhone report: "pinned at 30 Hz: cap or cost?").
 *   interval: real rAF-to-rAF time (unclamped)   cpu: JS time inside our frame callback
 *   gpu: GPU time per frame from WebGPU timestamp queries (only with ?hud=1 or ?gpu=1, and only where the
 *        adapter exposes 'timestamp-query'; iOS WebKit generally does not -> reported as unavailable)
 */
export const perfSamples = { interval: new FrameStats(), cpu: new FrameStats(), gpu: new FrameStats(), gpuAvailable: null as boolean | null };

/** Why the frame takes as long as it does: a cap (vsync / throttle / Low Power Mode) or real cost. */
export function frameDiagnosis(): string {
  const iv = perfSamples.interval.summary(), cpu = perfSamples.cpu.summary(), gpu = perfSamples.gpu.summary();
  if (!iv.p50) return 'no samples yet';
  const work = Math.max(cpu.p50, perfSamples.gpuAvailable ? gpu.p50 : 0);
  const known = perfSamples.gpuAvailable ? '' : ' (GPU time unknown on this device: headroom is an upper bound)';
  // Vsync quantisation: under a 30 Hz cap (iOS Low Power Mode caps Safari's rAF at 30 Hz) frames land on
  // multiples of 33.3 ms, so a p50 of ~41 ms is a mix of 33 ms and 50 ms frames (missed deadlines), not a 41 ms wait.
  const all = perfSamples.interval.values();
  const onGrid = (period: number) => all.filter((v) => { const m = v / period; return Math.abs(m - Math.round(m)) < 0.12 && Math.round(m) >= 1; }).length / Math.max(1, all.length);
  const g60 = onGrid(1000 / 60), g30 = onGrid(1000 / 30);
  const capped30 = all.length > 30 && Math.min(...all) > 28 && g30 > 0.75;
  const missed = (period: number) => all.filter((v) => v > period * 1.3).length / Math.max(1, all.length);
  if (capped30) return `30 Hz cap (frames on multiples of 33.3 ms; likely iOS Low Power Mode): ${(missed(1000 / 30) * 100).toFixed(0)}% of frames missed the 33 ms deadline; work ~${work.toFixed(1)} ms (p95 js ${cpu.p95.toFixed(1)} / gpu ${perfSamples.gpuAvailable ? gpu.p95.toFixed(1) : '?'} ms)${known}.`;
  if (g60 > 0.75) return `60 Hz vsync: ${(missed(1000 / 60) * 100).toFixed(0)}% of frames missed the 16.7 ms deadline; work ~${work.toFixed(1)} ms${known}.`;
  return `not vsync-locked: interval p50 ${iv.p50.toFixed(1)} ms, work ~${work.toFixed(1)} ms${known}.`;
}

/** Best-guess device class from screen points and DPR (labelled as a guess in the report). */
export function deviceGuess(): string {
  const w = Math.min(screen.width, screen.height), h = Math.max(screen.width, screen.height), d = Math.round(window.devicePixelRatio || 1);
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  if (!ios) return `${w}x${h}@${d}x (non-iOS)`;
  const T: [number, number, number, string][] = [
    [440, 956, 3, 'iPhone 16/17 Pro Max class'], [430, 932, 3, 'iPhone 14/15 Pro Max or 15/16 Plus class'],
    [402, 874, 3, 'iPhone 16/17 Pro class'], [393, 852, 3, 'iPhone 14 Pro/15/15 Pro/16 class'], [390, 844, 3, 'iPhone 12/13/14 class'],
    [428, 926, 3, 'iPhone 12/13 Pro Max or 14 Plus class'], [375, 812, 3, 'iPhone X/XS/11 Pro/mini class'],
    [414, 896, 3, 'iPhone XS Max/11 Pro Max class'], [414, 896, 2, 'iPhone XR/11 class'], [375, 667, 2, 'iPhone SE (2nd/3rd)/8 class'],
  ];
  const hit = T.find(([a, b, c]) => a === w && b === h && c === d);
  return hit ? `${hit[3]} (guess from ${w}x${h}@${d}x)` : `unknown iOS device ${w}x${h}@${d}x`;
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
    `interval p50 ${perfSamples.interval.summary().p50.toFixed(2)} ms · js/frame p50 ${perfSamples.cpu.summary().p50.toFixed(2)} ms p95 ${perfSamples.cpu.summary().p95.toFixed(2)} ms · gpu/frame ${perfSamples.gpuAvailable ? `p50 ${perfSamples.gpu.summary().p50.toFixed(2)} ms p95 ${perfSamples.gpu.summary().p95.toFixed(2)} ms` : perfSamples.gpuAvailable === false ? 'unavailable (no timestamp-query)' : 'off (add ?gpu=1)'}`,
    `diagnosis ${frameDiagnosis()}`,
    `device ${((d) => (d && !/[<>]|model/i.test(d) ? d : deviceGuess()))(new URLSearchParams(location.search).get('device'))} · screen ${screen.width}x${screen.height} · cores ${navigator.hardwareConcurrency ?? '?'} · mem ${(navigator as { deviceMemory?: number }).deviceMemory ?? '?'} GB · standalone ${matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone ? 'yes' : 'no'}`,
    `draws ${r.drawCalls} · tris ${r.triangles} · chunks lod0 ${c.world.stats.lod0} lod1 ${c.world.stats.lod1}`,
    `view ${c.view} · input ${c.device}`,
    ...(c.extra ?? []),
    loadReport.text(),
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
