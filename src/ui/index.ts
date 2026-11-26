/**
 * UI entry point (ENGINE_REQUESTS ui 1): `createUi(host)` builds the HUD, minimap, pause hub and
 * every gameplay screen against a UiHost; the engine calls `ui.update(dt)` once a frame.
 * The lab (uilab.html) uses the same entry with MockHost.
 */
import type { UiHost } from './host/types';
import type { MapModel } from './map/MapModel';
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

export interface UiOptions { model: MapModel; heroes: { name: string; x: number; z: number }[]; lab?: boolean }

export interface UiRoot {
  hud: GameHud; hub: PauseHub; model: MapModel; mapScreen: MapScreen;
  /** Open a screen by name (lab + engine): 'hud', 'map', 'pockets', 'paper', 'business', 'record', 'saves', 'settings', 'shop', 'leads', 'weapons', 'choices', 'title', 'credits'. */
  show(name: string, params?: Record<string, string>): void;
  update(dt: number): void;
  readonly paused: boolean;
  toast(text: string): void;
  register(name: string, open: (params: Record<string, string>) => void): void;
}

export function createUi(host: UiHost, o: UiOptions): UiRoot {
  applyGlobalUiSettings(); uiSettings.subscribe(() => applyGlobalUiSettings());
  const hud = new GameHud(host, o.model);
  const hub = new PauseHub(host.input);
  const mapScreen = new MapScreen(host, o.model, o.heroes);
  const toast = (text: string) => {
    const t = el('div', 'u-toast'); t.textContent = text; document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 450); }, 2600);
  };
  mapScreen.onToast = toast;
  const mapTab: Tab = {
    id: 'map', label: 'MAP', el: mapScreen.el, hint: 'Drag to pan · pinch or wheel to zoom · tap a place',
    open: (setNav) => { mapScreen.onNav = (items) => setNav(items); mapScreen.open(); },
    update: (dt) => mapScreen.update(dt),
    back: () => { if (mapScreen.cardOpen) { mapScreen.closeCard(); return true; } return false; },
  };
  hub.add(mapTab);
  const pockets = new Pockets(host); pockets.onToast = toast; hub.add(pockets);
  const paper = new Newspaper(host, o.model); paper.onToast = toast; hub.add(paper);
  const business = new Business(host); business.onToast = toast; hub.add(business);
  hub.add(new RecordTab(host, o.model));
  const savesTab = new SavesTab(host.saves); savesTab.onToast = toast; hub.add(savesTab);
  const settingsTab = new SettingsTab(host.input); settingsTab.onToast = toast; hub.add(settingsTab);
  const creditsTab = new CreditsTab(host.baseUrl); hub.add(creditsTab);
  const shop = new ShopCounter(host.input, host);
  const leads = new LeadPicker(host.input, host);
  const weapons = new WeaponSelect(host.input, host);
  const choices = new Choices(host.input);
  const modals: Modal[] = [shop, leads, weapons, choices];
  host.on('choices', (e) => choices.ask(e.choices, e.resolve, { prompt: e.prompt }));
  const screens = new Map<string, (p: Record<string, string>) => void>([
    ['shop', (p) => shop.openShop(p.shop ?? 'diner')],
    ['leads', (p) => leads.openPicker(p.reason === 'bail' ? 'bail' : 'switch')],
    ['weapons', () => weapons.openSelect()],
    ['choices', () => choices.ask([
      { id: 'a', text: 'Tell him about Lisle.' }, { id: 'b', text: 'Say nothing. Pour the coffee.' },
      { id: 'c', text: '"Not tonight, Carl."' }, { id: 'd', text: 'Ask what he really wants.', disabled: 'He hasn\'t earned it yet' },
    ], () => {}, { prompt: 'Mayhew waits.' })],
  ]);
  const root: UiRoot = {
    hud, hub, model: o.model, mapScreen, toast,
    register: (n, f) => { screens.set(n, f); },
    show(name, params = {}) {
      if (name === 'hud') { hub.hide(); hud.setVisible(true); return; }
      const s = screens.get(name);
      if (s) { s(params); return; }
      hud.setVisible(false); hub.show(name);
    },
    update(dt) {
      if (hub.open) hub.update(dt);
      for (const m of modals) m.update(dt);
      hud.setVisible(!hub.open && !(Modal.current && Modal.current !== weapons && Modal.current !== choices));
      hud.update(dt);
    },
    get paused() { return hub.open; },
  };
  return root;
}
