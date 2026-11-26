/**
 * ?audio=1 — the audio workstream's own test scene (no renderer needed).
 *
 * A top-down map of the real footprints and streets. Drive the listener along any street
 * (WASD/arrows + Q/E to turn, Shift to run, click/tap the map to jump; on touch, the pad at
 * bottom-left), and watch the bus meters, voice counts, canyon rays and live emitters.
 * Buttons: rain, brownout, siren, passing car (pick an engine), horns, impacts, time of day,
 * interiors, radio, dialogue (scene / overheard / phone), UI sounds, loudness profile,
 * suspend/resume. Also the harness for the real-device checklist (docs/AUDIO_DEVICE_CHECKLIST.md).
 */
import { AudioSystem } from '../index';
import { MockSim } from './mockSim';
import { SCENARIOS } from './scenarios';
import { CityMap } from '../world/cityMap';
import { ENGINE_PROFILES } from '../worklets/engineProfile';
import { INTERIORS } from '../acoustics/canyon';
import type { StreetRec } from '../acoustics/geometry';
import type { QualityName, Vec3 } from '../config';

const SCENE_CSS = `
#ats{position:fixed;inset:0;display:grid;grid-template-columns:1fr 340px;background:#0c0b0a;color:#e6dcc6;font:12px/1.35 ui-monospace,Menlo,Consolas,monospace}
#ats canvas{width:100%;height:100%;display:block;touch-action:none}
#ats .side{overflow:auto;padding:10px 12px;border-left:1px solid #2a251f;background:#13110f}
#ats h3{margin:12px 0 6px;font:600 11px Archivo,sans-serif;letter-spacing:.12em;color:#e8b92e;text-transform:uppercase}
#ats button,#ats select{background:#221e19;color:#efe6d0;border:1px solid #3a332a;border-radius:4px;padding:7px 9px;margin:2px;font:12px ui-monospace,monospace;min-height:34px}
#ats button.on{background:#e8b92e;color:#111;border-color:#e8b92e}
#ats .row{display:flex;flex-wrap:wrap;align-items:center}
#ats input[type=range]{width:100%}
#ats .meter{display:grid;grid-template-columns:70px 1fr 48px;gap:6px;align-items:center;margin:2px 0}
#ats .bar{height:9px;background:#221e19;position:relative;overflow:hidden}
#ats .bar i{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#6fae5c 0 70%,#e8b92e 70% 88%,#d4503c 88%)}
#ats .bar b{position:absolute;top:0;bottom:0;width:2px;background:#fff}
#ats pre{margin:0;white-space:pre-wrap;color:#cfc5ae}
#ats-sub{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);max-width:70vw;text-align:center;pointer-events:none;z-index:5}
#ats-sub div{display:inline-block;margin:3px;padding:5px 10px;background:#000c;color:#fff;font:15px Archivo,sans-serif;border-radius:3px}
#ats-sub div.ambient{color:#d9d0bb;font-style:italic}
#ats-sub div.radio{color:#9fd0ff}
#ats-gate{position:fixed;inset:0;display:grid;place-items:center;background:#0c0b0acc;z-index:20;font:600 18px Archivo,sans-serif;letter-spacing:.1em;color:#efe6d0;cursor:pointer}
#ats-pad{position:fixed;left:16px;bottom:16px;display:grid;grid-template-columns:repeat(3,56px);grid-template-rows:repeat(3,56px);gap:4px;z-index:6}
#ats-pad button{background:#221e19cc;color:#efe6d0;border:1px solid #3a332a;border-radius:8px;font-size:18px}
@media (max-width:900px){#ats{grid-template-columns:1fr 46vw}#ats .side{font-size:11px}}
`;

export async function startScene(params: URLSearchParams) {
  document.getElementById('loading')?.remove();
  const style = document.createElement('style'); style.textContent = SCENE_CSS; document.head.appendChild(style);
  const root = document.createElement('div'); root.id = 'ats'; document.body.appendChild(root);
  const canvas = document.createElement('canvas'); root.appendChild(canvas);
  const side = document.createElement('div'); side.className = 'side'; root.appendChild(side);
  const subs = document.createElement('div'); subs.id = 'ats-sub'; document.body.appendChild(subs);
  const gate = document.createElement('div'); gate.id = 'ats-gate'; gate.textContent = 'LOADING AUDIO…'; document.body.appendChild(gate);
  const quality = (params.get('quality') as QualityName) || (matchMedia('(pointer: coarse)').matches ? 'low' : 'high');

  const audio = new AudioSystem({ quality });
  const streets: StreetRec[] = await fetch(import.meta.env.BASE_URL + 'data/streets.json').then((r) => r.json());
  await audio.load({ streets });
  const map = new CityMap(streets);
  const geo = audio.debug.geo;
  const sim = new MockSim(streets, 1974, quality === 'low' ? 40 : 150, quality === 'low' ? 120 : 400);
  let simOn = params.get('sim') !== '0';
  audio.bindSim({ on: (t, cb) => sim.on(t, cb), get vehicles() { return simOn ? sim.vehicles : []; }, get peds() { return simOn ? sim.peds : []; } });
  gate.textContent = 'TAP TO START AUDIO';
  gate.onclick = async () => { await audio.unlock(); gate.remove(); };

  // ---------------------------------------------------------------- listener
  const sc = SCENARIOS[0]; const s0 = sc.start(map);
  const L = { x: s0.x, z: s0.z, yaw: Math.atan2(s0.dx, -s0.dz), vx: 0, vz: 0 };
  let minutes = sc.clock.minutes, date = sc.clock.date, timeScale = 1;
  audio.setClock(minutes, date);
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => { keys.add(e.key.toLowerCase()); });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  // ---------------------------------------------------------------- UI
  const el = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; side.appendChild(d); return d; };
  const btn = (parent: HTMLElement, label: string, fn: (b: HTMLButtonElement) => void, toggle = false) => {
    const b = document.createElement('button'); b.textContent = label; b.onclick = () => { if (toggle) b.classList.toggle('on'); fn(b); }; parent.appendChild(b); return b;
  };
  el(`<h3>Tenderloin '74 · audio test · ${quality}</h3><div style="opacity:.7">WASD/arrows move · Q/E turn · Shift run · click map to jump</div>`);
  const sceneRow = el('<h3>Scenarios</h3>').appendChild(document.createElement('div')); sceneRow.className = 'row';
  for (const s of SCENARIOS) btn(sceneRow, s.id, () => { const p = s.start(map); L.x = p.x; L.z = p.z; L.yaw = Math.atan2(p.dx, -p.dz); minutes = s.clock.minutes; date = s.clock.date; audio.setWeather(s.weather); rainBtn.classList.toggle('on', s.weather === 'rain'); sim.density = s.traffic; sim.pedDensity = s.peds; sim.vehicles.length = 0; sim.peds.length = 0; });
  const world = el('<h3>World</h3>').appendChild(document.createElement('div')); world.className = 'row';
  const rainBtn = btn(world, 'rain', (b) => audio.setWeather(b.classList.contains('on') ? 'rain' : 'clear'), true);
  btn(world, 'overcast', (b) => audio.setWeather(b.classList.contains('on') ? 'overcast' : 'clear'), true);
  btn(world, 'brownout', (b) => audio.setPower('all', b.classList.contains('on') ? 'off' : 'on'), true);
  btn(world, 'dim', (b) => audio.setPower('all', b.classList.contains('on') ? 'dim' : 'on'), true);
  btn(world, 'siren', () => audio.play('siren'));
  btn(world, 'thunder', () => audio.play('thunder', undefined, { near: 1 }));
  btn(world, 'traffic', (b) => { simOn = !b.classList.contains('on'); }, true);
  const timeD = el('<h3>Time</h3><input type=range min=0 max=1439 step=1><div class=row></div>');
  const timeIn = timeD.querySelector('input')!; timeIn.value = String(minutes); timeIn.oninput = () => { minutes = +timeIn.value; };
  const tRow = timeD.querySelector('.row') as HTMLElement;
  for (const [lab, sc2] of [['x1', 1], ['x60', 60], ['x600', 600]] as const) btn(tRow, lab, () => { timeScale = sc2; });
  const dateSel = document.createElement('select'); for (const d of ['1974-06-21', '1974-06-22', '1974-06-23', '1974-07-04']) dateSel.add(new Option(d, d)); dateSel.onchange = () => { date = dateSel.value; }; tRow.appendChild(dateSel);

  const veh = el('<h3>Vehicles</h3>').appendChild(document.createElement('div')); veh.className = 'row';
  const engSel = document.createElement('select'); for (const k of Object.keys(ENGINE_PROFILES)) engSel.add(new Option(k, k)); veh.appendChild(engSel);
  btn(veh, 'passing car', () => passingCar(engSel.value));
  btn(veh, 'horn car', () => audio.play('horn', ahead(25), { kind: 0, duration: 0.8 }));
  btn(veh, 'horn taxi', () => audio.play('horn', ahead(15), { kind: 1, duration: 0.3 }));
  btn(veh, 'horn bus', () => audio.play('horn', ahead(30), { kind: 2, duration: 1.2 }));
  btn(veh, 'air horn', () => audio.play('horn', ahead(40), { kind: 3, duration: 1.5 }));
  btn(veh, 'skid', () => audio.play('skid', ahead(20), { intensity: 1 }));
  btn(veh, 'crash', () => audio.play('impact', ahead(20), { impulse: 14000 }));
  btn(veh, 'door', () => audio.play('door.slam', ahead(6)));
  btn(veh, 'bus door', () => audio.play('bus.door', ahead(8)));
  btn(veh, 'compactor', () => audio.play('truck.compactor', ahead(20)));

  const inter = el('<h3>Interior</h3>').appendChild(document.createElement('div')); inter.className = 'row';
  const intSel = document.createElement('select'); intSel.add(new Option('(outside)', '')); for (const k of Object.keys(INTERIORS)) intSel.add(new Option(k, k)); intSel.onchange = () => audio.setInterior(intSel.value || null); inter.appendChild(intSel);
  btn(inter, 'step', () => audio.footstep({ position: [L.x, 0.15, L.z], who: 'player' }));

  const radioRow = el('<h3>Radio (placeholder beds)</h3>').appendChild(document.createElement('div')); radioRow.className = 'row';
  btn(radioRow, 'off', () => audio.radio.setStation(null));
  for (const s of audio.radio.stations) btn(radioRow, s.name.replace('PLACEHOLDER ', ''), () => audio.radio.setStation(s.id));

  audio.dialogue.registerScript({ id: 'dlg.audio_test', lines: [
    { id: 'l1', speaker: 'char.test_a', emotion: 'wry', text: 'Placeholder test line. The words are not spoken; timing is.' },
    { id: 'l2', speaker: 'char.test_b', emotion: 'urgent', text: 'Second test line, a little faster, ending on a question?' },
    { id: 'l3', speaker: 'char.test_a', emotion: 'tired', text: 'Third line, slower. Walk away and it should cut with an ellipsis.' },
  ] });
  const dlg = el('<h3>Dialogue (placeholder voice)</h3>').appendChild(document.createElement('div')); dlg.className = 'row';
  btn(dlg, 'scene', async () => { for (const l of ['l1', 'l2', 'l3']) await audio.dialogue.play('dlg.audio_test', l); });
  let oh: { stop(): void } | null = null;
  btn(dlg, 'overhear here', (b) => { oh?.stop(); oh = null; if (b.classList.contains('on')) oh = audio.dialogue.overhear({ script: 'dlg.audio_test', at: [L.x + 4, 1.6, L.z], radius: 12, loop: true }); }, true);
  btn(dlg, 'phone', () => audio.dialogue.play('dlg.audio_test', 'l2', undefined, { filter: 'phone' }));
  btn(dlg, 'bark', () => audio.dialogue.bark('Placeholder bark.', ahead(5), 'npc.test', true));

  const ui = el('<h3>UI</h3>').appendChild(document.createElement('div')); ui.className = 'row';
  for (const k of ['ui.move', 'ui.select', 'ui.back', 'ui.map', 'ui.switch', 'ui.pickup', 'ui.coins', 'phone.ring']) btn(ui, k.replace('ui.', ''), () => audio.play(k));

  const sys = el('<h3>System</h3>').appendChild(document.createElement('div')); sys.className = 'row';
  btn(sys, 'home theatre', (b) => audio.setLoudnessProfile(b.classList.contains('on') ? 'homeTheatre' : 'mobile'), true);
  btn(sys, 'suspend', (b) => { if (b.classList.contains('on')) audio.suspend(); else audio.resume(); }, true);
  btn(sys, 'ignore silent switch', (b) => audio.setIgnoreSilentSwitch(b.classList.contains('on')), true);
  const vols = el('<h3>Bus volumes</h3>');
  for (const b of ['master', 'ambience', 'sfx', 'dialogue', 'radio', 'ui'] as const) {
    const r = document.createElement('div'); r.className = 'meter'; r.innerHTML = `<span>${b}</span><input type=range min=0 max=1 step=0.01 value=1><span></span>`;
    (r.querySelector('input') as HTMLInputElement).oninput = (e) => audio.setBusVolume(b, +(e.target as HTMLInputElement).value); vols.appendChild(r);
  }
  const meterD = el('<h3>Meters</h3>');
  const meterRows: Record<string, HTMLElement> = {};
  for (const b of ['master', 'ambience', 'sfx', 'dialogue', 'radio', 'ui', 'reverb']) { const r = document.createElement('div'); r.className = 'meter'; r.innerHTML = `<span>${b}</span><div class=bar><i></i><b></b></div><span></span>`; meterD.appendChild(r); meterRows[b] = r; }
  const statsPre = el('<h3>Stats</h3><pre></pre>').querySelector('pre')!;
  const logPre = el('<h3>Lifecycle log</h3><pre></pre>').querySelector('pre')!;

  // Subtitles (the engine UI owns the real ones; this proves timing).
  const showSub = (e: { id: string; speaker: string; text: string; duration: number; channel: string }) => {
    const d = document.createElement('div'); d.className = e.channel; d.textContent = `${e.channel === 'ambient' ? '(overheard) ' : ''}${e.speaker.replace(/^char\./, '')}: ${e.text}`; d.dataset.id = e.id; subs.appendChild(d);
    setTimeout(() => d.remove(), e.duration * 1000 + 300);
  };
  audio.dialogue.on('subtitle', showSub);
  audio.dialogue.on('subtitleEnd', (e) => { const d = subs.querySelector(`[data-id="${CSS.escape(e.id)}"]`) as HTMLElement | null; if (d && e.cut) { d.textContent = (d.textContent ?? '').slice(0, Math.max(10, Math.round((d.textContent ?? '').length * 0.6))) + '…'; setTimeout(() => d.remove(), 900); } });
  audio.on('radioSubtitle', showSub);
  let flash = 0; audio.on('lightning', (e) => { setTimeout(() => { flash = 1; }, 0); void e; });

  // Touch pad.
  if (matchMedia('(pointer: coarse)').matches || params.has('touch')) {
    const pad = document.createElement('div'); pad.id = 'ats-pad'; document.body.appendChild(pad);
    const map2: [string, string][] = [['', ''], ['▲', 'w'], ['', ''], ['◀', 'q'], ['▼', 's'], ['▶', 'e'], ['', ''], ['', ''], ['', '']];
    for (const [lab, k] of map2) { const b = document.createElement('button'); b.textContent = lab; if (!k) b.style.visibility = 'hidden'; b.onpointerdown = (e) => { e.preventDefault(); keys.add(k); }; b.onpointerup = b.onpointerleave = () => keys.delete(k); pad.appendChild(b); }
  }

  // ---------------------------------------------------------------- passing car
  const ahead = (d: number): Vec3 => [L.x + Math.sin(L.yaw) * d, 1, L.z - Math.cos(L.yaw) * d];
  function passingCar(profile: string) {
    const c = audio.canyonRays.length ? audio.debug.env.canyon.state : { ax: 1, az: 0 } as { ax: number; az: number };
    const ax = c.ax, az = c.az, side = 4; const start = performance.now(); const speed = profile.startsWith('diesel') ? 11 : 16;
    const prof = ENGINE_PROFILES[profile];
    const pos = (): Vec3 => { const t = (performance.now() - start) / 1000; const s = -130 + speed * t; return [L.x + ax * s - az * side, 0.6, L.z + az * s + ax * side]; };
    const rpm = () => { const t = (performance.now() - start) / 1000; const v = Math.min(speed, 4 + t * 3.5); const g = v < 7 ? 2.45 : v < 13 ? 1.45 : 1; return Math.max(prof.idle, v / (2 * Math.PI * 0.36) * 60 * 3 * g); };
    const load = () => { const t = (performance.now() - start) / 1000; return t < 4 ? 0.8 : 0.35; };
    const detach = audio.attachVehicle({ id: `test${start}`, rpm, load, position: pos, speed: () => speed }, profile);
    setTimeout(detach, (260 / speed) * 1000);
  }

  // ---------------------------------------------------------------- draw
  const ctx2 = canvas.getContext('2d')!;
  let scale = 1.6;
  canvas.addEventListener('wheel', (e) => { scale *= e.deltaY < 0 ? 1.15 : 1 / 1.15; scale = Math.max(0.3, Math.min(8, scale)); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('click', (e) => { const r = canvas.getBoundingClientRect(); L.x += (e.clientX - r.left - r.width / 2) / scale; L.z += (e.clientY - r.top - r.height / 2) / scale; });
  const CAT: Record<string, string> = { vehicle: '#e8b92e', horn: '#ff7a3d', siren: '#ff3d6e', tyre: '#ff9a7a', impact: '#ff4040', footstep: '#9fd0ff', voice: '#ffffff', crowd: '#c8a0ff', emitter: '#6fae5c', subway: '#3dd6c8', radio: '#9fd0ff', animal: '#b0e070', weather: '#888', bed: '#666', ui: '#888' };
  const draw = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (canvas.width !== w * devicePixelRatio) { canvas.width = w * devicePixelRatio; canvas.height = h * devicePixelRatio; }
    ctx2.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx2.fillStyle = flash > 0 ? `rgba(220,230,255,${flash * 0.5})` : '#0c0b0a'; ctx2.fillRect(0, 0, w, h); flash = Math.max(0, flash - 0.08);
    const X = (x: number) => w / 2 + (x - L.x) * scale, Z = (z: number) => h / 2 + (z - L.z) * scale;
    const R = Math.max(w, h) / scale / 2 + 50;
    ctx2.strokeStyle = '#2a251f'; ctx2.lineWidth = 1;
    for (const s of streets) { ctx2.beginPath(); for (let k = 0; k < s.p.length; k += 2) { const f = k ? 'lineTo' : 'moveTo'; ctx2[f](X(s.p[k]), Z(s.p[k + 1])); } ctx2.lineWidth = s.w * scale; ctx2.stroke(); }
    ctx2.lineWidth = 1;
    for (const p of geo.parks) { ctx2.beginPath(); for (let k = 0; k < p.ring.length; k += 2) ctx2[k ? 'lineTo' : 'moveTo'](X(p.ring[k]), Z(p.ring[k + 1])); ctx2.fillStyle = '#1f3320'; ctx2.fill(); }
    for (const b of geo.buildings) {
      if (Math.abs(b.x - L.x) > R || Math.abs(b.z - L.z) > R) continue;
      ctx2.beginPath(); for (let k = 0; k < b.ring.length; k += 2) ctx2[k ? 'lineTo' : 'moveTo'](X(b.ring[k]), Z(b.ring[k + 1])); ctx2.closePath();
      const t = Math.min(1, b.h / 120); ctx2.fillStyle = `rgb(${50 + t * 60},${45 + t * 50},${40 + t * 40})`; ctx2.fill();
    }
    // canyon rays
    ctx2.strokeStyle = '#e8b92e33';
    for (const r of audio.canyonRays) { ctx2.beginPath(); ctx2.moveTo(X(L.x), Z(L.z)); ctx2.lineTo(X(L.x + Math.cos(r.a) * r.d), Z(L.z + Math.sin(r.a) * r.d)); ctx2.stroke(); }
    // gratings and trains
    const sw = audio.debug.ambience!.subway;
    ctx2.fillStyle = '#3dd6c855'; for (const g of sw.gratings) if (Math.abs(g.x - L.x) < R && Math.abs(g.z - L.z) < R) ctx2.fillRect(X(g.x) - 1.5, Z(g.z) - 1.5, 3, 3);
    ctx2.strokeStyle = '#3dd6c8'; ctx2.lineWidth = 4;
    for (const t of sw.trains) { const [x1, z1] = sw.at(t.line, t.s), [x2, z2] = sw.at(t.line, t.s - t.dir * 155); ctx2.beginPath(); ctx2.moveTo(X(x1), Z(z1)); ctx2.lineTo(X(x2), Z(z2)); ctx2.stroke(); }
    ctx2.lineWidth = 1;
    // sim agents
    if (simOn) { ctx2.fillStyle = '#8a7f6a'; for (const v of sim.vehicles) ctx2.fillRect(X(v.x) - 2, Z(v.z) - 2, 4, 4); ctx2.fillStyle = '#5a5246'; for (const p of sim.peds) ctx2.fillRect(X(p.x) - 1, Z(p.z) - 1, 2, 2); }
    // voices
    for (const v of audio.debug.vm.voices) {
      const p = v.pos(); if (!p) continue;
      ctx2.fillStyle = CAT[v.o.category] ?? '#fff'; ctx2.globalAlpha = v.src ? 1 : 0.3;
      const r = v.src ? 3 + Math.min(6, v.audibility * 20) : 2; ctx2.beginPath(); ctx2.arc(X(p[0]), Z(p[2]), r, 0, 7); ctx2.fill();
      if (v.src && v.occGain < 0.99) { ctx2.strokeStyle = '#ff4040'; ctx2.beginPath(); ctx2.arc(X(p[0]), Z(p[2]), r + 2, 0, 7); ctx2.stroke(); }
    }
    ctx2.globalAlpha = 1;
    // listener
    ctx2.save(); ctx2.translate(X(L.x), Z(L.z)); ctx2.rotate(L.yaw); ctx2.fillStyle = '#fff'; ctx2.beginPath(); ctx2.moveTo(0, -9); ctx2.lineTo(6, 7); ctx2.lineTo(-6, 7); ctx2.closePath(); ctx2.fill(); ctx2.restore();
  };

  // ---------------------------------------------------------------- loop
  const meters = audio.meters; const buf = new Float32Array(1024);
  let last = performance.now(), statT = 0;
  const frame = () => {
    const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const run = keys.has('shift') ? 3.5 : 1.4; let f = 0, st = 0;
    if (keys.has('w') || keys.has('arrowup')) f += 1; if (keys.has('s') || keys.has('arrowdown')) f -= 1;
    if (keys.has('a')) st -= 1; if (keys.has('d')) st += 1;
    if (keys.has('q') || keys.has('arrowleft')) L.yaw -= dt * 1.8; if (keys.has('e') || keys.has('arrowright')) L.yaw += dt * 1.8;
    const fx = Math.sin(L.yaw), fz = -Math.cos(L.yaw);
    L.vx = (fx * f - fz * st) * run; L.vz = (fz * f + fx * st) * run; L.x += L.vx * dt; L.z += L.vz * dt;
    minutes = (minutes + (dt * timeScale) / 60) % 1440; if (document.activeElement !== timeIn) timeIn.value = String(Math.floor(minutes));
    audio.setClock(minutes, date);
    if (simOn) sim.update(dt, { x: L.x, z: L.z }, minutes / 60);
    audio.update(dt, { position: [L.x, 1.65, L.z], forward: [fx, 0, fz], up: [0, 1, 0], velocity: [L.vx, 0, L.vz] });
    draw();
    for (const [k, an] of Object.entries(meters)) {
      const row = meterRows[k]; if (!row || !an) continue; an.getFloatTimeDomainData(buf);
      let pk = 0, ss = 0; for (const v of buf) { pk = Math.max(pk, Math.abs(v)); ss += v * v; }
      const rms = 20 * Math.log10(Math.sqrt(ss / buf.length) + 1e-9), pdb = 20 * Math.log10(pk + 1e-9);
      (row.querySelector('i') as HTMLElement).style.width = `${Math.max(0, (rms + 60) / 60 * 100)}%`;
      (row.querySelector('b') as HTMLElement).style.left = `${Math.max(0, (pdb + 60) / 60 * 100)}%`;
      (row.lastChild as HTMLElement).textContent = rms > -59 ? rms.toFixed(0) : '-∞';
    }
    if ((statT -= dt) <= 0) {
      statT = 0.25; const s = audio.stats; const c = s.canyon!; const hh = Math.floor(minutes / 60), mm = Math.floor(minutes % 60);
      statsPre.textContent =
        `state ${s.state}  out latency ${(s.outputLatency * 1000).toFixed(0)} ms  base ${(s.baseLatency * 1000).toFixed(0)} ms\n` +
        `${date} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  ${c.street}\n` +
        `voices real ${s.voices.real}/${audio.quality.voices}  virtual ${s.voices.virtual}  peak ${s.voices.peakReal}\n` +
        `update ${audio.timing.updateMs.toFixed(2)} ms  (mean ${(audio.timing.sumMs / Math.max(1, audio.timing.frames)).toFixed(2)})\n` +
        `canyon ${c.kind}  L ${c.dL.toFixed(0)}m/${c.hL.toFixed(0)}m  R ${c.dR.toFixed(0)}m/${c.hR.toFixed(0)}m  open ${(c.openness * 100).toFixed(0)}%\n` +
        `  RT60 ${c.rt60.toFixed(2)} s  wet ${c.wet.toFixed(2)}  flutter ${c.flutter.toFixed(2)}\n` +
        `limiter GR ${s.mixer.limiterGrDb.toFixed(1)} dB  duck ${s.mixer.duckRadioDb.toFixed(1)} dB\n` +
        `bank ${(s.bank.decodedBytes / 1048576).toFixed(1)}/${((s.bank.budget ?? 0) / 1048576).toFixed(0)} MB  codec ${s.bank.codec}  streamed ${s.bank.streamed}\n` +
        `emitters live ${s.ambience?.activeEmitters}  trains ${sw().trains.length}  radio feeds ${s.radioFeeds}\n` +
        `traffic near ${audio.debug.env.traffic.near.toFixed(2)}  peds ${audio.debug.env.peds.near.toFixed(2)}`;
      logPre.textContent = audio.runtime.log.slice(-8).join('\n');
    }
    requestAnimationFrame(frame);
  };
  const sw = () => audio.debug.ambience!.subway;
  requestAnimationFrame(frame);
  (window as unknown as { __audio: AudioSystem }).__audio = audio;
}
