/**
 * UI entry point (ENGINE_RESPONSES ui 1). `bootUi(host, opts)` builds everything on screen that isn't
 * the world: title, HUD and minimap, the pause hub (the folding map is the main menu), gameplay
 * screens and overlays, toasts and notes, and registers the 'ui' save section. The engine calls
 * `ui.update(dt)` once a frame and reads `ui.state` to know when the world is frozen.
 * The lab (uilab.html) uses `createUi` with MockHost.
 */
import type { UiHost } from './host/types';
import { MapModel } from './map/MapModel';
import { GameHud } from './hud/GameHud';
import { PauseHub, type Tab } from './screens/PauseHub';
import { MapScreen } from './screens/MapScreen';
import { applyGlobalUiSettings, uiSettings } from './settings/uiSettings';
import { el } from './util';
import { Pockets } from './screens/Pockets';
import { Newspaper } from './screens/Newspaper';
import { Business } from './screens/Business';
import { Record as RecordTab } from './screens/Record';
import { ShopCounter, LeadPicker, WeaponSelect, Choices } from './screens/Overlays';
import { Modal } from './screens/Modal';
import { SettingsTab } from './screens/SettingsTab';
import { SavesTab, CreditsTab } from './screens/FrontTabs';
import { TitleScreen } from './TitleScreen';
import { PROMPT_CSS } from './Prompts';
import { uiSectionProvider } from './save/uiSection';
import { iosEvictionRisk } from '../save/SaveManager';
import './ui.css';
import { CinematicPlayer, type PlayOptions } from '../cinematics/CinematicPlayer';
import { hasCutscene } from '../cinematics/content';

export type UiState = 'title' | 'play' | 'paused' | 'cutscene';
export interface UiOptions { model: MapModel; heroes?: { name: string; x: number; z: number }[]; lab?: boolean; title?: boolean }

export interface UiRoot {
  hud: GameHud; hub: PauseHub; model: MapModel; mapScreen: MapScreen; title: TitleScreen | null;
  state: UiState;
  /** Open a screen by name: 'hud', 'map', 'pockets', 'paper', 'business', 'record', 'saves', 'settings', 'credits', 'shop', 'leads', 'weapons', 'choices'. */
  show(name: string, params?: Record<string, string>): void;
  update(dt: number): void;
  readonly paused: boolean;
  toast(text: string): void;
  register(name: string, open: (params: Record<string, string>) => void): void;
  /** Title screen: city streaming progress 0..1, then ready with the latest save's label. */
  titleProgress(p: number): void;
  titleReady(continueLabel: string | null): void;
  /** Play an in-engine cutscene (content/cutscenes/<id>.json); resolves when it ends or is skipped. */
  playCutscene(id: string, opts?: PlayOptions): Promise<boolean>;
  readonly cinema: CinematicPlayer;
  /** Persisted extras for the save section. */
  readonly extras: { newsRead: Set<string>; achievements: Record<string, string>; cutscenesSeen: Set<string> };
}

/** Loads the place catalogue, builds the UI and registers the 'ui' save section. */
export async function bootUi(host: UiHost, o: { title: boolean; startLeads?: string[] }): Promise<UiRoot> {
  const model = await MapModel.load(host.baseUrl, host.streets);
  model.discovery.start(o.startLeads ?? [host.player().lead]);
  const ui = createUi(host, { model, heroes: host.heroes, title: o.title });
  host.saves?.provideSection(uiSectionProvider(model, ui.extras));
  return ui;
}

export function createUi(host: UiHost, o: UiOptions): UiRoot {
  applyGlobalUiSettings(); uiSettings.subscribe(() => applyGlobalUiSettings());
  if (!document.getElementById('t74-prompt-css')) { const s = document.createElement('style'); s.id = 't74-prompt-css'; s.textContent = PROMPT_CSS; document.head.appendChild(s); }
  const input = host.input;
  const hud = new GameHud(host, o.model);
  const hub = new PauseHub(input);
  const mapScreen = new MapScreen(host, o.model, o.heroes ?? host.heroes);
  const toast = (text: string) => {
    const t = el('div', 'u-toast'); t.textContent = text; document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 450); }, 2600);
  };
  mapScreen.onToast = toast;
  hub.add({
    id: 'map', label: 'MAP', el: mapScreen.el, hint: 'Drag to pan · pinch or wheel to zoom · tap a place',
    open: (setNav) => { mapScreen.onNav = (items) => setNav(items); mapScreen.open(); },
    update: (dt) => mapScreen.update(dt),
    back: () => { if (mapScreen.cardOpen) { mapScreen.closeCard(); return true; } return false; },
  } satisfies Tab);
  const pockets = new Pockets(host); pockets.onToast = toast; hub.add(pockets);
  const paper = new Newspaper(host, o.model); paper.onToast = toast; hub.add(paper);
  const business = new Business(host); business.onToast = toast; hub.add(business);
  hub.add(new RecordTab(host, o.model));
  const savesTab = new SavesTab(host.saves); savesTab.onToast = toast; hub.add(savesTab);
  const settingsTab = new SettingsTab(input); settingsTab.onToast = toast; hub.add(settingsTab);
  const creditsTab = new CreditsTab(host.baseUrl); hub.add(creditsTab);
  const shop = new ShopCounter(input, host);
  const leads = new LeadPicker(input, host);
  const weapons = new WeaponSelect(input, host);
  const choices = new Choices(input);
  const modals: Modal[] = [shop, leads, weapons, choices];
  host.on('choices', (e) => choices.ask(e.choices, e.resolve, { prompt: e.prompt }));
  const extras = { newsRead: new Set<string>(), achievements: {} as Record<string, string>, cutscenesSeen: new Set<string>() };

  const screens = new Map<string, (p: Record<string, string>) => void>([
    ['shop', (p) => shop.openShop(p.shop ?? 'diner')],
    ['leads', (p) => leads.openPicker(p.reason === 'bail' ? 'bail' : 'switch')],
    ['weapons', () => weapons.openSelect()],
    ['choices', () => choices.ask([
      { id: 'a', text: 'Tell him about Lisle.' }, { id: 'b', text: 'Say nothing. Pour the coffee.' },
      { id: 'c', text: '"Not tonight, Carl."' }, { id: 'd', text: 'Ask what he really wants.', disabled: 'He hasn\'t earned it yet' },
    ], () => {}, { prompt: 'Mayhew waits.' })],
  ]);

  let title: TitleScreen | null = null;
  const cinema = new CinematicPlayer(host);
  cinema.askChoice = (cs, resolve) => choices.ask(cs, resolve);
  const root: UiRoot = {
    hud, hub, model: o.model, mapScreen, title: null, toast, extras, cinema,
    playCutscene(id, opts = {}) {
      return new Promise<boolean>((res) => {
        const prev = root.state === 'cutscene' ? 'play' : root.state;
        root.state = 'cutscene'; hub.hide(); hud.setVisible(false);
        void cinema.play(id, { ...opts, onEnd: (skipped) => { extras.cutscenesSeen.add(id); root.state = prev === 'title' ? 'play' : prev; opts.onEnd?.(skipped); res(skipped); } })
          .catch((e) => { console.error(e); root.state = prev; res(true); });
      });
    },
    state: o.title ? 'title' : 'play',
    register: (n, f) => { screens.set(n, f); },
    show(name, params = {}) {
      if (name === 'hud') { hub.hide(); return; }
      const s = screens.get(name);
      if (s) { s(params); return; }
      hub.show(name, root.state === 'title' ? ['saves', 'settings', 'credits'] : null);
      if (root.state === 'play') root.state = 'paused';
    },
    titleProgress: (p) => title?.progress(p),
    titleReady: (l) => title?.setReady(l),
    update(dt) {
      if (tool) { tool.update(dt); hud.setVisible(false); return; }
      if (root.state === 'cutscene') { cinema.update(dt); choices.update(dt); hud.setVisible(false); return; }
      if (root.state === 'title') { if (hub.open) hub.update(dt); else title?.update(dt); hud.setVisible(false); return; }
      if (hub.open) hub.update(dt);
      else if (root.state === 'paused') root.state = 'play';
      for (const m of modals) m.update(dt);
      if (root.state === 'play' && !Modal.current) {
        if (input.pressed('pause') || input.pressed('map')) root.show('map');
        else if (input.pressed('inventory')) root.show('pockets');
        else if (input.pressed('weaponSelect')) root.show('weapons');
      }
      const blocking = Modal.current && Modal.current !== weapons && Modal.current !== choices;
      hud.setVisible(root.state === 'play' && !hub.open && !blocking && uiSettings.get('hud'));
      if (hud.visible) hud.update(dt);
    },
    get paused() { return root.state !== 'play' || !!(Modal.current && Modal.current !== choices); },
  };
  savesTab.onLoaded = () => { hub.hide(); title?.close(); root.state = 'play'; };
  if (o.title) {
    savesTab.canSave = false;
    title = new TitleScreen(input, async (c) => {
      if (c.kind === 'settings' || c.kind === 'credits' || c.kind === 'load') { hub.show(c.kind === 'load' ? 'saves' : c.kind, ['saves', 'settings', 'credits']); return; }
      if (c.kind === 'continue') { const ok = await host.continueGame?.(); if (ok === false) { toast('Could not load the last save'); return; } }
      else await host.newGame?.();
      savesTab.canSave = true;
      title!.close(); root.state = 'play';
      // New game opens on M1's scene, which blends straight into play on the spawn shot.
      if (c.kind === 'new' && hasCutscene('m01_opening')) void root.playCutscene('m01_opening');
    });
    root.title = title;
  }
  hub.onClose = () => { if (root.state === 'paused') root.state = 'play'; };

  // Desktop: Esc releases pointer lock before any key event reaches the page, so losing the lock in
  // play is the pause signal (standard PC behaviour).
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && root.state === 'play' && !hub.open && !Modal.current && input.activeDevice === 'kbm') root.show('map');
  });
  window.addEventListener('keydown', async (e) => {
    if (!host.saves || root.state === 'title') return;
    if (e.code === 'F5') { e.preventDefault(); const m = await host.saves.save('quick'); toast(`Saved · ${m.label}`); }
    if (e.code === 'F9') { e.preventDefault(); const d = await host.saves.load('quick').catch((err) => { toast(String(err.message ?? err)); return null; }); if (d) { toast(`Loaded · ${d.label}`); hub.hide(); root.state = 'play'; } }
  });
  window.addEventListener('gamepadconnected', () => { toast(`Controller connected · ${input.pad.family === 'playstation' ? 'PlayStation' : input.pad.family === 'xbox' ? 'Xbox' : 'Gamepad'} layout`); input.rumble(0.4, 0.6, 180); });
  window.addEventListener('gamepaddisconnected', () => toast('Controller disconnected'));
  if (host.saves) iosSavesNote(host.saves);
  // ?cine=1 (or ?cine=<scene id>): the in-browser cutscene tool, loaded only when asked for.
  let tool: { update(dt: number): void } | null = null;
  if (new URLSearchParams(location.search).has('cine') && host.camera) {
    root.state = 'cutscene';
    void import('../cinematics/tool/CineTool').then((m) => { tool = new m.CineTool(host); (window as unknown as { __CINE: unknown }).__CINE = tool; });
  }
  const play = new URLSearchParams(location.search).get('play');
  if (play && !o.title) setTimeout(() => void root.playCutscene(play, { paused: new URLSearchParams(location.search).has('cinepause') }), 0);
  return root;
}

/** iOS clears site storage after ~7 days unvisited unless installed: gentle, dismissible, in-world note. */
function iosSavesNote(saves: NonNullable<UiHost['saves']>) {
  const ios = iosEvictionRisk(); if (!ios.atRisk) return;
  let snoozed = false; try { snoozed = Date.now() - Date.parse(localStorage.getItem('t74.iosNoteSnooze') ?? '0') < 3 * 86400000; } catch { /* ignore */ }
  const long = (ios.daysSinceLastVisit ?? 0) > 4;
  if (snoozed && !long) return;
  saves.onSaved.add(function once() {
    saves.onSaved.delete(once);
    const n = el('div', 'u-iosnote', `<b>${long ? 'WELCOME BACK. KEEP YOUR SAVES SAFE' : 'A NOTE ABOUT SAVES'}</b>On iPhone and iPad, saves can be cleared after a week away. Share → <i>Add to Home Screen</i> keeps them for good. <button>Got it</button>`);
    n.querySelector('button')!.addEventListener('click', () => { n.remove(); try { localStorage.setItem('t74.iosNoteSnooze', new Date().toISOString()); } catch { /* ignore */ } });
    document.body.appendChild(n);
  });
}
