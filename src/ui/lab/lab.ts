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
  const tv = q.get('trav'); if (tv) host.travKind = tv as typeof host.travKind;
  const tm = q.get('touchmode'); if (tm) host.touchMode = tm as typeof host.touchMode;
  const heat = q.get('heat'); if (heat) host.heatPhase = heat as HeatView['phase'];
  // mock player starts at the Flatiron prow facing up Broadway
  host.pos = { x: Number(q.get('x') ?? 4), z: Number(q.get('z') ?? -52), yaw: Number(q.get('yaw') ?? 0.21) };

  const model = await MapModel.load(base, streets);
  // ?saves=1: a believable profile with a few slots, so the Saves screen can be judged in the lab
  if (q.get('saves') === '1') (host as unknown as { saves: unknown }).saves = labSaves();
  const titleMode = q.get('screen') === 'title';
  const ui: UiRoot = createUi(host, { model, heroes: world.heroes, lab: true, title: titleMode });
  const disc = q.get('discover') ?? 'some';
  model.discovery.start(['char.teddy_arce']);
  if (disc === 'some' || disc === 'all') {
    // a believable first evening: walk Broadway from 23rd to 31st, plus a few tips
    for (let z = -40; z > -700; z -= 20) { model.discovery.now = 20 * 60 + 40 + (-z / 80) | 0; model.discovery.tick(18 - z * 0.03, z); }
    for (const id of ['loc.cop_bar', 'loc.penn_hack_stand', 'ui.crime.0', 'ui.job.0', 'loc.kafeneio']) model.discovery.reveal(id, 'tip');
    for (const p of [...model.discovery.known()].slice(0, Math.floor(model.discovery.counts.known * 0.6))) model.discovery.markSeen([p.id]);
  }
  if (disc === 'all') for (const p of model.discovery.all) model.discovery.reveal(p.id, 'mission', true);
  // fog of war for the lab: the ground a player who did the above would have walked (23rd St, up Broadway, Chelsea, Eighth Ave)
  if (disc !== 'none' && model.explored) {
    for (let x = 60; x > -1200; x -= 30) model.explored.mark(x, -10, 130);
    for (let z = 0; z > -720; z -= 30) model.explored.mark(-20 + z * 0.33, z, 120);
    for (let z = 0; z > -820; z -= 30) model.explored.mark(-880, z, 120);
    model.explored.mark(130, -120, 170);
  }
  if (disc === 'all' && model.explored) for (let x = -1300; x < 220; x += 60) for (let z = -1680; z < 100; z += 60) model.explored.mark(x, z, 60);
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
  const mEnd = q.get('mission');
  if (mEnd) setTimeout(() => host.emit('missionEnd', mEnd === 'fail'
    ? { result: 'failed', title: 'Walk with Me', reason: 'Mayhew got into a cab without you.' }
    : { result: 'passed', title: 'Walk with Me', cash: 120, lines: [{ label: 'Time', value: '14:22' }, { label: 'Witnesses', value: 'None' }] }), 300);
  if (titleMode) { if (q.get('load')) ui.titleProgress(Number(q.get('load'))); else ui.titleReady('Fri Jun 21, 8:41 PM · Broadway & W 23 St'); }
  else ui.show(screen, Object.fromEntries(q));

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
/** Lab-only stand-in for SaveManager: two profiles, a few dated slots. */
function labSaves() {
  const at = (d: string) => new Date(`1974-06-${d}`).toISOString();
  const profiles = [{ id: 'p1', name: 'Teddy\'s run', createdAt: at('18T09:00'), lastPlayedAt: at('21T20:41') }, { id: 'p2', name: 'Second try', createdAt: at('19T10:00'), lastPlayedAt: at('20T23:05') }];
  const slots = [
    { slot: 'manual-1', label: 'Hotel Corwin · night desk', savedAt: at('21T20:12'), playtimeSec: 15120, version: 1, bytes: 1 },
    { slot: 'manual-2', label: 'Ozone Downs · after the fifth', savedAt: at('20T16:40'), playtimeSec: 11460, version: 1, bytes: 1 },
    { slot: 'manual-4', label: 'Pier 74 pound · W 38 St', savedAt: at('19T11:05'), playtimeSec: 6420, version: 1, bytes: 1 },
    { slot: 'quick', label: 'Broadway & W 23 St', savedAt: at('21T20:38'), playtimeSec: 15250, version: 1, bytes: 1 },
    { slot: 'auto-1', label: 'Madison Square', savedAt: at('21T20:40'), playtimeSec: 15260, version: 1, bytes: 1 },
    { slot: 'auto-2', label: 'Eighth Avenue', savedAt: at('21T20:31'), playtimeSec: 14710, version: 1, bytes: 1 },
  ];
  const ok = async () => {};
  return {
    store: { kind: 'indexeddb', listProfiles: async () => profiles, listSlots: async () => slots, createProfile: async (name: string) => ({ ...profiles[0], id: 'p3', name }), renameProfile: ok, deleteProfile: ok, touchProfile: ok },
    profile: profiles[0], onSaved: new Set(), switchProfile: ok, save: ok, load: ok, exportSlot: async () => null, importToSlot: ok,
  };
}

main().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;position:fixed;top:0">${String(e?.stack ?? e)}</pre>`); });
