/**
 * UiHost: everything the UI reads from the game, as queries and events (ENGINE_REQUESTS ui 1).
 * The UI never imports gameplay, sim or narrative internals. The engine implements this in main.ts;
 * MockHost implements it with fixed data so every screen runs, and is screenshot-tested, alone.
 * Proposed to move to src/shared/uiHost.ts once the engine accepts it.
 */
import type { Input } from '../../input/Input';
import type { SaveManager } from '../../save/SaveManager';
import type { StreetRec } from '../map/grid';
import type { PerspectiveCamera } from 'three';

export type LeadId = string; // char.*

export interface PlayerView { x: number; z: number; yaw: number; speed: number; inVehicle: boolean; lead: LeadId; interior?: string }
export interface ClockView { date: string; minutes: number; weather: 'clear' | 'overcast' | 'rain'; tempF?: number }

export interface LeadView {
  id: LeadId; name: string; short: string; tagline: string; colour: string;
  cash: number; where: string; available: boolean; reason?: string; // why not switchable right now
  mood?: string;
}

/** What the outfit can hide. The order is the capacity ladder. */
export type Conceal = 'pocket' | 'jacket' | 'longcoat' | 'bag' | 'visible';
export const CONCEAL_ORDER: Conceal[] = ['pocket', 'jacket', 'longcoat', 'bag', 'visible'];
export type ConcealState = 'hidden' | 'printing' | 'visible';

export interface ItemView {
  id: string; name: string; qty: number; kind: 'weapon' | 'ammo' | 'food' | 'tool' | 'key' | 'evidence' | 'paper' | 'valuable' | 'clothing';
  size: Conceal; state: ConcealState; hot?: boolean; condition?: number; // 0..1
  note?: string; value?: number; ammo?: { loaded: number; spare: number }; equipped?: boolean;
}
export interface OutfitView { name: string; hides: Conceal; heatNote?: string; description: string }
export interface InventoryView { lead: LeadId; cash: number; savings: number; outfit: OutfitView; items: ItemView[]; carCapacity?: string }

export interface HealthView { hp: number; max: number; injuries: { region: string; kind: 'graze' | 'wound' | 'bruise' | 'burn'; bandaged: boolean }[]; stamina: number; staminaMax: number; heatExhaustion: number }

/** Police: never a star count. The HUD turns these into radio lines and minimap cones. */
export interface HeatView {
  phase: 'none' | 'spotted' | 'pursuit' | 'lost' | 'searching' | 'cooling';
  cones: { x: number; z: number; dir: number; spread: number; r: number; seeing: boolean }[];
  units: { x: number; z: number; kind: 'foot' | 'car' | 'horse'; seeing: boolean }[];
  searchArea?: { x: number; z: number; r: number; age: number };
  description?: string; // the overheard description
}

export interface ObjectiveView { text: string; target?: { x: number; z: number; label?: string }; mission?: string }

export interface ShopItem { id: string; name: string; price: number; kind: ItemView['kind']; size: Conceal; note?: string; stock?: number; illegal?: boolean }
export interface ShopView { id: string; name: string; kind: 'diner' | 'clothes' | 'pawn' | 'fence' | 'hardware' | 'newsstand' | 'liquor' | 'sporting'; keeper: string; greeting: string; items: ShopItem[]; buys?: string[]; open: boolean }

export interface NewsIssue {
  id: string; date: string; masthead: string; price: string; edition: string;
  headline: string; deck: string; stories: { head: string; body: string }[];
  number: { date: string; digits: string; source: string }; // the daily number from the track handle
  races: { track: string; race: number; winner: string; odds: string }[];
  chopList: { cls: string; colour: string; condition: string; pays: number }[];
  ads: { text: string; placeId?: string }[]; // reading an ad can reveal a map place
}

export interface BusinessView {
  id: string; name: string; kind: string; address: string; owner: LeadId | null;
  price?: number; weeklyIncome: number; trend: number[]; // last 8 weeks
  manager?: string; staff: number; upgrades: { id: string; name: string; cost: number; owned: boolean; effect: string }[];
  trouble: { kind: 'shakedown' | 'protection' | 'brownout' | 'breakin' | 'skimming' | 'inspection'; text: string; due?: string }[];
  ledger: { week: string; gross: number; payroll: number; pad: number; net: number }[];
}

export interface StatRow { group: string; label: string; value: string }
export interface CompletionRow { group: string; label: string; done: number; total: number }
export interface Achievement { id: string; name: string; text: string; unlocked?: string; hidden?: boolean }

export interface DialogueChoice { id: string; text: string; disabled?: string }

/** Game events the UI listens to. */
export interface UiEvents {
  money: { lead: LeadId; delta: number; cash: number; reason?: string };
  subtitle: { speaker: string; text: string; channel: 'scene' | 'ambient'; seconds?: number };
  objective: ObjectiveView | null;
  /** A map place was introduced: tip, overheard line, newspaper ad, call, card or mission. */
  discover: { placeId: string; via: 'tip' | 'overheard' | 'news' | 'call' | 'card' | 'mission' | 'enter'; from?: string };
  notify: { kind: 'help' | 'toast' | 'saved'; text: string };
  heat: { phase: HeatView['phase']; radio?: string };
  damage: { amount: number; region?: string };
  inventory: { lead: LeadId };
  achievement: { id: string };
  lead: { id: LeadId };
  choices: { prompt?: string; choices: DialogueChoice[]; resolve: (id: string) => void };
}

export interface CameraHost {
  /** Take the main camera from gameplay. Gameplay cameras stop writing to it until release(). */
  acquire(owner: string): PerspectiveCamera;
  release(owner: string): void;
  /** Where the gameplay camera wants to be right now (the orbit keeps updating while not owning). */
  gameplayPose(): { position: [number, number, number]; target: [number, number, number]; fov: number };
}
export interface ActorHost {
  spawn(id: string, cast: string, pose: { x: number; y?: number; z: number; heading: number }): void;
  pose(id: string, pose: { x: number; y?: number; z: number; heading: number }, anim?: string): void;
  despawn(id: string): void;
}
export interface PostHost { set(p: { dofFocusM?: number; fStop?: number; focalMm?: number; grain?: number; weave?: number; letterbox?: number }): void }

export type UiAction =
  | { kind: 'buy'; shop: string; item: string; qty?: number }
  | { kind: 'sell'; shop: string; item: string; qty?: number }
  | { kind: 'equip'; item: string | null }
  | { kind: 'drop'; item: string }
  | { kind: 'switchLead'; lead: LeadId }
  | { kind: 'buyBusiness'; id: string }
  | { kind: 'upgrade'; business: string; upgrade: string }
  | { kind: 'payTrouble'; business: string; index: number }
  | { kind: 'waypoint'; at: { x: number; z: number } | null }
  | { kind: 'betNumber'; digits: string; stake: number };
export type ActionResult = { ok: true; text?: string } | { ok: false; text: string };

export interface UiHost {
  readonly input: Input;
  readonly saves: SaveManager | null;
  readonly streets: StreetRec[];
  readonly baseUrl: string;
  player(): PlayerView;
  clock(): ClockView;
  party(): LeadView[];
  health(): HealthView;
  inventory(lead?: LeadId): InventoryView;
  heat(): HeatView;
  objective(): ObjectiveView | null;
  /** Period district and nearest corner ("The Tenderloin", "Broadway & W 26 St"). */
  location(): { district: string; crossing: string };
  shop(id: string): ShopView | null;
  newspaper(): NewsIssue | null;
  businesses(): BusinessView[];
  stats(): StatRow[];
  completion(): CompletionRow[];
  achievements(): Achievement[];
  act(a: UiAction): ActionResult;
  on<K extends keyof UiEvents>(k: K, cb: (e: UiEvents[K]) => void): () => void;
  camera?: CameraHost;
  actors?: ActorHost;
  post?: PostHost;
}

/** Tiny typed emitter the hosts use. */
export class Emitter<E> {
  private m = new Map<keyof E, Set<(e: never) => void>>();
  on<K extends keyof E>(k: K, cb: (e: E[K]) => void) { const s = this.m.get(k) ?? new Set(); s.add(cb as (e: never) => void); this.m.set(k, s); return () => { s.delete(cb as (e: never) => void); }; }
  emit<K extends keyof E>(k: K, e: E[K]) { for (const cb of this.m.get(k) ?? []) (cb as (e: E[K]) => void)(e); }
}
