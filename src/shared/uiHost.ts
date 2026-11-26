/**
 * SHARED CONTRACT (proposed by the UI stream, engine-owned once merged; ENGINE_RESPONSES ui 1).
 * UiHost: everything the UI reads from the game, as queries and events (ENGINE_REQUESTS ui 1).
 * The UI never imports gameplay, sim or narrative internals. The engine implements this in main.ts;
 * MockHost implements it with fixed data so every screen runs, and is screenshot-tested, alone.
 * Proposed to move to src/shared/uiHost.ts once the engine accepts it.
 */
import type { Input } from '../input/Input';
import type { SaveManager } from '../save/SaveManager';
import type { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { UiEvents } from './uiEvents';

/** A street centreline from public/data/streets.json. */
export interface StreetRec { n: string; c: string; w: number; o: number; p: number[] }

export type LeadId = string; // char.*

export interface PlayerView {
  x: number; z: number; yaw: number; speed: number; inVehicle: boolean; lead: LeadId; interior?: string;
  /** Who rides with the player (cast id), or the driver when the player is the passenger: picks the route-call voice. */
  companion?: string;
  /** Active side quest id, for quest-specific voices (route_calls.json voiceByPassenger, e.g. side.baby_cab). */
  quest?: string;
}
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

/** A car the lead owns (or has lost to the street, the garage or the pound). */
export interface CarView {
  id: string; name: string; year: number; colour: string; plate: string;
  condition: number; // 0..1
  mileage: number;
  where: { kind: 'street' | 'garage' | 'pound'; x: number; z: number; label: string };
  tickets: { id: string; amount: number; reason: string; date: string }[];
  booted: boolean;
  towed?: { pound: string; fee: number };
  trunk?: string[];
}
/** A used-car lot or a showroom. */
export interface LotView {
  id: string; name: string; kind: 'lot' | 'showroom'; salesman: string; patter: string;
  cars: { id: string; name: string; year: number; colour: string; cls: string; trim: string; condition: number; mileage: number; asking: number; notes?: string }[];
}
export interface ClassifiedAd { id: string; text: string; price: number; phone: string; kind: 'car' | 'room' | 'job' | 'misc'; placeId?: string }
export interface HomeView { id: string; lead: LeadId; name: string; address: string; upgrades: { id: string; name: string; cost: number; owned: boolean; effect: string }[] }
export interface SleepInfo { canSleep: boolean; reason?: string; bed: boolean; restQuality: 'good' | 'poor'; note?: string; nextPinnedDate?: string | null }

export interface StatRow { group: string; label: string; value: string }
export interface CompletionRow { group: string; label: string; done: number; total: number }
export interface Achievement { id: string; name: string; text: string; unlocked?: string; hidden?: boolean }

export interface DialogueChoice { id: string; text: string; disabled?: string }

export interface CameraHost {
  /** Matches src/camera/CameraDirector (shipped): take the real camera; gameplay cameras keep updating a proxy. */
  acquire(owner: string): PerspectiveCamera;
  /** Hand back, blending from the last cinematic pose to the live gameplay pose over blendSeconds. */
  release(blendSeconds?: number): void;
  /** The live gameplay pose (cinematics plan the hand-back from it). */
  gameplayPose(): { position: Vector3; quaternion: Quaternion; fov: number };
  readonly currentOwner: string;
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
  | { kind: 'betNumber'; digits: string; stake: number }
  | { kind: 'wait'; until: string /* 'HH:MM' */ }
  | { kind: 'sleep'; until: string /* 'HH:MM' */ }
  | { kind: 'haggle'; lot: string; car: string; offer: number }
  | { kind: 'buyCar'; lot: string; car: string; price: number }
  | { kind: 'payTicket'; car: string; ticket: string }
  | { kind: 'payPound'; car: string }
  | { kind: 'homeUpgrade'; home: string; upgrade: string };
/** `counter` and `accepted` are set by a haggle: the salesman's counter-offer, or that he took the offer. */
export type ActionResult = { ok: true; text?: string; counter?: number; accepted?: boolean } | { ok: false; text: string };

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
  /** Optional (cars, lots, classifieds, homes, sleeping): screens degrade gracefully without them. */
  cars?(): CarView[];
  carLot?(id: string): LotView | null;
  classifieds?(): ClassifiedAd[];
  homes?(): HomeView[];
  sleepInfo?(): SleepInfo;
  /** Story mission markers available now (map stars; cards show the time window, e.g. "Night only · 9 PM–3 AM"). */
  missionMarkers?(): { id: string; title: string; x: number; z: number; window?: [string, string]; lead?: string; blurb?: string }[];
  on<K extends keyof UiEvents>(k: K, cb: (e: UiEvents[K]) => void): () => void;
  camera?: CameraHost;
  actors?: ActorHost;
  post?: PostHost;
  /** The three.js scene (cinematics add stand-in actors until the characters stream merges). */
  scene?: import('three').Scene;
  /** Stop and resume player control (cutscenes). */
  freezePlayer?(frozen: boolean): void;
  /** Engine performs the state change on a presentation's 'commit' cue (teleport, switch, time skip).
   *  Cinematics also forwards timeline cues here ('audio:<name>' for the audio stream, 'mission.*'). */
  commit?(cue: string, data?: unknown): void;
  /** Hide the player's own body while a cutscene blocks the lead with its own actor. */
  playerVisible?(visible: boolean): void;
  /** Front-end hooks the engine implements: start a new game / continue the latest save. */
  newGame?(): void | Promise<void>;
  continueGame?(): Promise<boolean>;
  /** Context button prompts for the HUD strip: [action, label]. */
  prompts?(): [import('../input/Input').ButtonAction, string][];
  /** Touch controls (docs/briefs/TOUCH_CONTROLS.md). Absent: the touch layer runs on foot only (move, look, jump, use). */
  touch?: TouchHost;
  /** Static map data. */
  readonly heroes: { name: string; x: number; z: number }[];
}


/**
 * What the touch layer needs from gameplay and vehicles (TOUCH_CONTROLS.md). Shapes follow gameplay's
 * "UI contract for TOUCH_CONTROLS.md" and vehicles' DriverAssist notes; the engine adapter forwards.
 * Movement, look, jump and the analog pedals go through Input (touchMove, addLook, touchHeld,
 * touchPedals), so pad and keyboard stay untouched. Everything optional degrades to "not shown".
 */
export type TouchMode = 'foot' | 'combat' | 'drive';
export interface TouchContext { kind: string; label: string }
export interface TouchHost {
  /** Which control state to show. Combat = a weapon drawn or under fire. */
  mode(): TouchMode;
  /** A weapon is available (on-foot weapon button, drive-by button). */
  armed(): boolean;
  /** gameplay.contextAction(): the one context button (null hides it). */
  context(): TouchContext | null;
  /** gameplay.doContextAction(moveDir?). */
  doContext(moveDir?: { x: number; z: number }): void;
  /** gameplay.lockables(): world points the UI projects and hit-tests for tap-to-lock. */
  lockables?(): { id: string; x: number; y: number; z: number; threat?: number }[];
  locked?(): string | null;
  lockTarget?(id: string | null): void;
  swipeLock?(dir: 1 | -1): void;
  /** World point to CSS px (null when behind the camera). */
  project?(x: number, y: number, z: number): { x: number; y: number } | null;
  /** fireMode 'tap' | 'button' (auto fires on its own). */
  setFiring?(on: boolean): void;
  reload?(): void;
  swapWeapon?(dir: 1 | -1): void;
  /** Cover near cover, leave cover, or roll otherwise; the label says which ('Cover' | 'Leave' | 'Roll'). */
  coverLabel?(): string;
  coverOrRoll?(moveDir?: { x: number; z: number }): void;
  /** On foot: tap draws or holsters (gameplay remembers the last gun); hold opens the UI's weapon selector. */
  drawWeapon?(): void;
  handbrake?(on: boolean): void;
  horn?(on: boolean): void;
  driveBy?(on: boolean): void;
  /** Settings the touch layer forwards: gameplay.setContext/setAssist, vehicles' DriverAssist. */
  configure?(c: { fireMode: 'auto' | 'tap' | 'button'; aimAssist: 'off' | 'low' | 'standard' | 'strong'; gyro: 'off' | 'aim' | 'always';
    steerAssist: boolean; steerAssistStrength: number; autoAccelerate: boolean }): void;
}
