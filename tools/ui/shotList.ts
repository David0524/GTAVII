import type { Shot } from './shots';

export const SHOTS: Shot[] = [
  { name: 'map_before', q: 'screen=map&discover=none&waypoint=0' },
  { name: 'map_after', q: 'screen=map&discover=some' },
  { name: 'hud_flat', q: 'screen=hud&discover=some' },
  { name: 'pockets', q: 'screen=pockets' },
  { name: 'paper', q: 'screen=paper' },
  { name: 'paper_inside', q: 'screen=paper', act: async (p) => { await p.click('.np-pages button[data-p=inside]'); } },
  { name: 'business', q: 'screen=business' },
  { name: 'record', q: 'screen=record' },
  { name: 'shop_fence', q: 'screen=shop&shop=fence' },
  { name: 'leads', q: 'screen=leads' },
  { name: 'weapons', q: 'screen=weapons' },
  { name: 'choices', q: 'screen=choices' },
  { name: 'wait', q: 'screen=wait' },
  { name: 'sleep', q: 'screen=sleep' },
  { name: 'carlot', q: 'screen=carlot&lot=sal' },
  {
    name: 'carlot_haggle', q: 'screen=carlot&lot=sal',
    act: async (p) => {
      await p.click('.car-card >> nth=0');
      await p.waitForTimeout(150);
      await p.click('.car-offer button[data-d="-100"]');
      await p.waitForTimeout(150);
      await p.click('.car-acts .u-btn.primary'); // Make offer: he counters
    },
  },
  { name: 'cars', q: 'screen=cars' },
  {
    name: 'notice', q: 'screen=hud',
    act: async (p) => {
      await p.evaluate(() => (window as unknown as { __UI: { host: { emit(k: string, e: unknown): void } } }).__UI.host.emit('notice', { kind: 'ticket', car: 'car.monarch', text: 'Hydrant, within 15 ft', amount: 25 }));
    },
  },
  { name: 'home', q: 'screen=home' },
  { name: 'paper_classifieds', q: 'screen=paper', act: async (p) => { await p.click('.np-pages button[data-p=classifieds]'); } },
  { name: 'mission_pass', q: 'screen=hud&mission=pass', act: async (p) => { await p.waitForTimeout(2600); } },
  { name: 'mission_fail', q: 'screen=hud&mission=fail', act: async (p) => { await p.waitForTimeout(2000); } },
  { name: 'traversal_prompt', q: 'screen=hud&trav=vault' },
  { name: 'map_mission_card', q: 'screen=map&discover=some', act: async (p) => { await p.evaluate(() => { const w = window as any; const m = w.__UI.ui.mapScreen; const ms = m.map.missions[0]; m.map.centerOn(ms.x, ms.z, 0.7); m.map.onSelect({ mission: ms }); }); } },
  { name: 'hud_city_before', q: 'screen=hud&city=1&quality=low&discover=none&waypoint=0', wait: 2500 },
  { name: 'hud_city_after', q: 'screen=hud&city=1&quality=low&discover=some', wait: 2500 },
  { name: 'saves', q: 'screen=saves&saves=1' },
  { name: 'settings', q: 'screen=settings' },
  { name: 'settings_remap', q: 'screen=settings', act: async (p) => { await p.click('[data-v=remap]'); } },
  { name: 'credits', q: 'screen=credits' },
  { name: 'title', q: 'screen=title' },
  { name: 'title_loading', q: 'screen=title&load=0.64' },
  { name: 'business_forsale', q: 'screen=business', act: async (p) => { await p.click('.bz-item >> nth=-1'); } },
];
