/**
 * Street <-> interior door traffic per interior kind, for the sim's door hand-off (sim branch src/sim/index.ts:
 * setDoors / pedEnteredDoor / pedExitedDoor). exitSec = mean seconds between occupants coming out while open;
 * enterP = chance a passing ped steps in; rush windows override; strangers never walk into residential doors.
 */
export interface DoorRate { exitSec: number; enterP: number; archetypes: string[]; rush?: { from: string; to: string; exitSec: number; enterP?: number }[]; residentsOnly?: boolean }
export const DOOR_RATES: Record<string, DoorRate> = {
  diner: { exitSec: 30, enterP: 0.06, archetypes: ['office_worker', 'garment_worker', 'cabbie'] },
  coffee_shop: { exitSec: 30, enterP: 0.06, archetypes: ['office_worker', 'garment_worker'] },
  deli: { exitSec: 30, enterP: 0.06, archetypes: ['office_worker', 'garment_worker'] },
  bodega: { exitSec: 25, enterP: 0.08, archetypes: ['local', 'kid'] },
  newsstand: { exitSec: 25, enterP: 0.08, archetypes: ['local', 'commuter'] },
  bar: { exitSec: 60, enterP: 0.04, archetypes: ['dockworker', 'union_man', 'regular'], rush: [{ from: '17:00', to: '04:00', exitSec: 25 }] },
  liquor: { exitSec: 70, enterP: 0.03, archetypes: ['local'] },
  pawn: { exitSec: 120, enterP: 0.02, archetypes: ['hustler', 'local'] },
  barber: { exitSec: 150, enterP: 0.015, archetypes: ['local', 'office_worker'] },
  beauty: { exitSec: 150, enterP: 0.015, archetypes: ['local'] },
  laundromat: { exitSec: 90, enterP: 0.03, archetypes: ['local'] },
  shoe_repair: { exitSec: 140, enterP: 0.02, archetypes: ['local'] },
  tailor: { exitSec: 140, enterP: 0.02, archetypes: ['local', 'office_worker'] },
  florist: { exitSec: 140, enterP: 0.02, archetypes: ['local'] },
  hardware: { exitSec: 140, enterP: 0.02, archetypes: ['local', 'super'] },
  clothing: { exitSec: 100, enterP: 0.02, archetypes: ['shopper'] },
  garment_showroom: { exitSec: 100, enterP: 0.02, archetypes: ['buyer', 'garment_worker'] },
  fur_showroom: { exitSec: 100, enterP: 0.02, archetypes: ['buyer'] },
  pool_hall: { exitSec: 120, enterP: 0.02, archetypes: ['young_man'] },
  gym: { exitSec: 120, enterP: 0.02, archetypes: ['boxer', 'young_man'] },
  cinema_lobby: { exitSec: 40, enterP: 0.03, archetypes: ['moviegoer'] },
  tenement: { exitSec: 90, enterP: 0.01, archetypes: ['resident'], residentsOnly: true },
  apartment_lobby: { exitSec: 90, enterP: 0.01, archetypes: ['resident'], residentsOnly: true },
  sro: { exitSec: 70, enterP: 0.01, archetypes: ['sro_resident'], residentsOnly: true },
  hero: { exitSec: 70, enterP: 0.01, archetypes: ['sro_resident'], residentsOnly: true },
  office_lobby: { exitSec: 120, enterP: 0.01, archetypes: ['office_worker'], rush: [{ from: '07:30', to: '09:30', exitSec: 20, enterP: 0.05 }, { from: '17:00', to: '18:30', exitSec: 20, enterP: 0.05 }] },
  hotel_lobby: { exitSec: 60, enterP: 0.02, archetypes: ['traveller'] },
  garage: { exitSec: 180, enterP: 0, archetypes: ['mechanic', 'driver'] },
  church: { exitSec: 300, enterP: 0.01, archetypes: ['parishioner'] },
  union_hall: { exitSec: 200, enterP: 0.01, archetypes: ['union_man'] },
  loft: { exitSec: 80, enterP: 0.01, archetypes: ['garment_worker'], rush: [{ from: '07:00', to: '08:30', exitSec: 30, enterP: 0.04 }, { from: '16:30', to: '18:00', exitSec: 15 }] },
};
