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
];
