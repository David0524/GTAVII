/**
 * Game-loop wiring step 7 (docs/HANDOFF_WIRING.md; audio requests 1 and 3): one AudioSystem for the game.
 *  - load(streets) once; update(dt, listener) every frame from the camera (velocity for Doppler);
 *  - world feeds: setClock(minutes, date), setWeather; the sim for traffic and crowd sound;
 *  - settings: the UI's volume keys onto the buses (squared taper is inside audio);
 *  - suspend while a menu holds the game, resume on play.
 * The context unlocks itself on the first user gesture (iOS); the title's first tap is that gesture.
 */
import * as THREE from 'three/webgpu';
import { AudioSystem, type QualityName } from '../audio';
import { settings } from '../settings/Settings';
import type { Simulation } from '../sim';

export interface AudioGlue {
  audio: AudioSystem;
  update(dt: number, camera: THREE.Camera, world: { minutes: number; date: string; weather: 'clear' | 'overcast' | 'rain' }, held: boolean): void;
  /** interior the listener is in (interiors' inside().kind), or null outdoors; call on change */
  interior(kind: string | null, roomVolume?: number): void;
  /** characters' footstep event (player body) */
  footstep(e: { position: THREE.Vector3; surface: string; speed: number }): void;
}

export function createAudio(o: { quality: QualityName; streets: unknown; sim: Simulation | null }): AudioGlue {
  const audio = new AudioSystem({ quality: o.quality });
  let loaded = false;
  audio.whenReady().then(() => audio.load({ streets: o.streets })).then(() => { loaded = true; if (o.sim) audio.bindSim(o.sim as never); applyVolumes(); })
    .catch((e) => console.warn('audio', e));
  const applyVolumes = () => {
    const s = settings;
    audio.setBusVolume('master', s.get('volMaster'));
    audio.setBusVolume('sfx', s.get('volEffects'));
    audio.setBusVolume('ambience', s.get('volEffects'));
    audio.setBusVolume('dialogue', s.get('volDialogue'));
    audio.setBusVolume('radio', s.get('volRadio'));
    audio.setBusVolume('ui', s.get('volUi'));
  };
  settings.subscribe((_s, k) => { if (loaded && typeof k === 'string' && k.startsWith('vol')) applyVolumes(); });

  const prev = new THREE.Vector3(), fwd = new THREE.Vector3(), up = new THREE.Vector3();
  let first = true, suspended = false, clockT = 0;
  return {
    audio,
    update(dt, camera, w, held) {
      if (!loaded) return;
      if (held !== suspended) { suspended = held; if (held) audio.suspend(); else audio.resume(); }
      if (held) return;
      if ((clockT -= dt) <= 0) { clockT = 1; audio.setClock(w.minutes, w.date); audio.setWeather(w.weather); }
      const p = camera.position;
      camera.getWorldDirection(fwd); up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      const v = first || dt <= 0 ? [0, 0, 0] : [(p.x - prev.x) / dt, (p.y - prev.y) / dt, (p.z - prev.z) / dt];
      // a teleport or camera cut is not a 1000 m/s fly-by
      if (Math.hypot(v[0], v[1], v[2]) > 60) { v[0] = v[1] = v[2] = 0; }
      prev.copy(p); first = false;
      audio.update(dt, { position: [p.x, p.y, p.z], forward: [fwd.x, fwd.y, fwd.z], up: [up.x, up.y, up.z], velocity: v as [number, number, number] });
    },
    interior(kind, roomVolume) { if (loaded) audio.setInterior(kind, roomVolume ? { roomVolume } : {}); },
    footstep(e) { if (loaded) audio.footstep({ position: [e.position.x, e.position.y, e.position.z], surface: e.surface, run: e.speed > 3, who: 'player' }); },
  };
}
