/**
 * UI lab (uilab.html): every UI surface against MockHost, optionally over the real city.
 *   ?screen=hud|map|...   ?city=1 (real 3D city backdrop)   ?touch=1   ?discover=none|some|all
 *   ?heat=pursuit|searching   ?quality=low|high
 * window.__UI exposes the live objects for the screenshot/perf rig (tools/ui/shots.ts).
 */
import '../../ui/theme.css';
import '../ui.css';
import { Input } from '../../input/Input';
import { PROMPT_CSS } from '../Prompts';
import { MockHost } from '../host/MockHost';
import { MapModel } from '../map/MapModel';
import { createUi, type UiRoot } from '../index';
import type { StreetRec } from '../map/grid';
import type { HeatView } from '../host/types';

async function main() {
  const q = new URLSearchParams(location.search);
  const base = import.meta.env.BASE_URL;
  const [streets, world] = await Promise.all([
    fetch(`${base}data/streets.json`).then((r) => r.json() as Promise<StreetRec[]>),
    fetch(`${base}data/world.json`).then((r) => r.json()),
  ]);
  const app = document.getElementById('app')!;
  const input = new Input(app);
  if (q.get('touch') === '1') { input.isTouch = true; document.body.classList.add('touch'); }
  if (q.get('pad') === '1') (input as unknown as { activeDevice: string }).activeDevice = 'xbox';
  const st = document.createElement('style'); st.textContent = PROMPT_CSS; document.head.appendChild(st);
  const host = new MockHost(input, streets, base, world.heroes);
  const tm = q.get('touchmode'); if (tm) host.touchMode = tm as typeof host.touchMode;
  const heat = q.get('heat'); if (heat) host.heatPhase = heat as HeatView['phase'];
  // mock player starts at the Flatiron prow facing up Broadway
  host.pos = { x: Number(q.get('x') ?? 4), z: Number(q.get('z') ?? -52), yaw: Number(q.get('yaw') ?? 0.21) };

  const model = await MapModel.load(base, streets);
  const ui: UiRoot = createUi(host, { model, heroes: world.heroes, lab: true });
  const disc = q.get('discover') ?? 'some';
  model.discovery.start(['char.teddy_arce']);
  if (disc === 'some' || disc === 'all') {
    // a believable first evening: walk Broadway from 23rd to 31st, plus a few tips
    for (let z = -40; z > -700; z -= 20) { model.discovery.now = 20 * 60 + 40 + (-z / 80) | 0; model.discovery.tick(18 - z * 0.03, z); }
    for (const id of ['loc.cop_bar', 'loc.penn_hack_stand', 'ui.crime.0', 'ui.job.0', 'loc.kafeneio']) model.discovery.reveal(id, 'tip');
    for (const p of [...model.discovery.known()].slice(0, Math.floor(model.discovery.counts.known * 0.6))) model.discovery.markSeen([p.id]);
  }
  if (disc === 'all') for (const p of model.discovery.all) model.discovery.reveal(p.id, 'mission', true);
  if (q.get('waypoint') !== '0') model.setWaypoint({ x: -205, z: -640 }, { x: host.pos.x, z: host.pos.z, inVehicle: false });

  let backdrop: Awaited<ReturnType<typeof import('./cityBackdrop').cityBackdrop>> | null = null;
  if (q.get('city') === '1') {
    const { cityBackdrop } = await import('./cityBackdrop');
    backdrop = await cityBackdrop(app, (q.get('quality') as 'low' | 'high') ?? 'high');
    document.getElementById('backdrop')!.remove();
  }
  // ?bg=frame: a clean captured game frame (tools/ui/frameCapture.ts) behind everything, to judge menus over the real world
  if (q.get('bg') === 'frame') { const b = document.getElementById('backdrop'); if (b) b.style.background = `#111 url(/shots/ui/frame_${innerWidth < 1000 ? 'phone' : 'desktop'}.png) center / cover`; }
  const screen = q.get('screen') ?? 'hud';
  ui.show(screen, Object.fromEntries(q));

  let last = performance.now(), walk = q.get('walk') === '1';
  const samples: number[] = []; const spin = q.get('spin') === '1';
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    input.poll(dt);
    if (walk) { host.pos.z -= dt * 1.4 * Math.cos(host.pos.yaw); host.pos.x -= dt * 1.4 * Math.sin(host.pos.yaw); }
    host.minutes += dt / 2;
    if (spin) host.pos.yaw += dt * 0.6;
    backdrop?.frame(host.pos);
    const u0 = performance.now();
    ui.update(dt);
    samples.push(performance.now() - u0); if (samples.length > 4000) samples.shift();
    input.endFrame();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  (window as unknown as Record<string, unknown>).__UI = { ui, host, model, input, backdrop, ready: backdrop ? backdrop.whenIdle() : Promise.resolve(), samples };
}
main().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;position:fixed;top:0">${String(e?.stack ?? e)}</pre>`); });
