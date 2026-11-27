/**
 * Per-instance vehicle state: trim tier, condition, upgrades, engine systems (heat, fuel,
 * failure modes), components, security, plates, trunk, mileage. Pure TypeScript (no three.js,
 * no Rapier) so it is unit-testable in Node and serialises cleanly into the save.
 *
 * Design: docs/briefs/CORE_SYSTEMS.md §5–6 and docs/briefs/HOMES_AND_CARS.md §2 (gameplay branch).
 */
import type { PhysicsSpec, ModelSpec } from './gen/spec';
import { rng } from './gen/rng';
import { Condition as Grade } from '../shared/condition';

// ============================================================================ trim tiers
export type TrimTier = 'economy' | 'standard' | 'luxury' | 'police' | 'commercial';

interface TrimMods { power: number; mass: number; brake: number; freq: number; zeta: number; mu: number; steer: number; redline: number; cooling: number; antiRoll: number }
/** Sets power, weight, braking, suspension and steering feel. Police beat the average civilian car. */
export const TRIM: Record<TrimTier, TrimMods> = {
  economy: { power: 0.82, mass: 0.96, brake: 0.95, freq: 0.95, zeta: 0.95, mu: 0.97, steer: 0.9, redline: 1, cooling: 0.95, antiRoll: 0.8 },
  standard: { power: 1, mass: 1, brake: 1, freq: 1, zeta: 1, mu: 1, steer: 1, redline: 1, cooling: 1, antiRoll: 1 },
  luxury: { power: 1.18, mass: 1.06, brake: 1.02, freq: 0.92, zeta: 0.9, mu: 1, steer: 0.95, redline: 1, cooling: 1.05, antiRoll: 0.9 },
  // heavy-duty package: big engine, stiff springs and dampers, sintered brake linings, HD cooling
  police: { power: 1.38, mass: 1.04, brake: 1.15, freq: 1.22, zeta: 1.35, mu: 1.04, steer: 1.15, redline: 1.12, cooling: 1.4, antiRoll: 1.8 },
  // fleet / commercial: HD suspension and cooling, governed engines
  commercial: { power: 0.95, mass: 1.03, brake: 1.05, freq: 1.1, zeta: 1.15, mu: 1, steer: 1, redline: 0.95, cooling: 1.25, antiRoll: 1.2 },
};

/** Default trim for a model, with a seeded mix where a class spans tiers. */
export function trimFor(spec: ModelSpec, r: () => number): TrimTier {
  switch (spec.cls) {
    case 'police': return 'police';
    case 'coupe': return 'luxury';
    case 'compact': return 'economy';
    case 'taxi': case 'bus': case 'boxtruck': case 'stepvan': case 'garbage':
    case 'ambulance': case 'fire': case 'ladder': case 'mail': case 'icecream': return 'commercial';
    case 'sedan': { const x = r(); return x < 0.25 ? 'economy' : x < 0.8 ? 'standard' : 'luxury'; }
    case 'wagon': return r() < 0.7 ? 'standard' : 'economy';
    default: return 'standard';
  }
}

// ============================================================================ condition
/** Wear values are 0 (new) .. 1 (shot). alignment is a signed pull (-1 left .. 1 right). */
export interface Condition {
  mileage: number; // miles
  shocks: number; tyres: number; alignment: number; brakes: number; engine: number; radiator: number; battery: number;
  /** Bias-ply (period default) or radial tyres. */
  tyreType: 'bias' | 'radial';
}

/** Condition from the variant seed: correlated with mileage; cabs and trucks run high miles. */
export function deriveCondition(spec: ModelSpec, r: () => number): Condition {
  const heavyUse = !['sedan', 'police', 'coupe', 'compact', 'wagon'].includes(spec.cls);
  const police = spec.cls === 'police' || spec.cls === 'fire' || spec.cls === 'ladder' || spec.cls === 'ambulance'; // fleet-maintained
  const age = Math.pow(r(), heavyUse ? 0.6 : 1.1); // 0 new .. 1 old
  const mileage = Math.round((heavyUse ? 40000 + age * 210000 : 4000 + age * 120000) / 100) * 100;
  const wear = (k: number) => Math.min(1, Math.max(0, age * k * (0.55 + r() * 0.9) - (police ? 0.25 : 0)));
  return {
    mileage,
    shocks: wear(0.9), tyres: wear(0.8), alignment: (r() - 0.5) * 2 * wear(0.7), brakes: wear(0.7),
    engine: wear(0.75), radiator: wear(0.65), battery: wear(0.6),
    tyreType: 'bias',
  };
}

/**
 * The shared 0–4 condition scale (src/shared/condition.ts: derelict, worn, lived-in, kept,
 * pristine), so a car parked outside a building reads with the same vocabulary as the building.
 * From average wear plus body damage.
 */
export function conditionGrade(c: Condition, damage = 0): Grade {
  const wear = (c.shocks + c.tyres + Math.abs(c.alignment) + c.brakes + c.engine + c.radiator + c.battery) / 7;
  const score = 4 - wear * 4.5 - damage * 3;
  return Math.max(0, Math.min(4, Math.round(score))) as Grade;
}

// ============================================================================ upgrades (period only)
export type Upgrade = 'radialTyres' | 'hdSuspension' | 'fourBarrel' | 'policeEngine';
export const UPGRADES: Record<Upgrade, { label: string; note: string }> = {
  radialTyres: { label: 'Steel-belted radial tyres', note: 'more grip, sharper turn-in, far better in rain' },
  hdSuspension: { label: 'Heavy-duty suspension', note: 'stiffer springs, firmer shocks, thicker sway bar' },
  fourBarrel: { label: 'Four-barrel carburettor', note: 'more power, thirstier' },
  policeEngine: { label: 'Police-package engine', note: 'big power, higher redline, HD cooling (from a fence)' },
};

/** Effective physics for this instance: base x trim x upgrades x static condition. */
export function effectivePhysics(base: PhysicsSpec, trim: TrimTier, cond: Condition, upgrades: readonly Upgrade[]): PhysicsSpec {
  const t = TRIM[trim];
  const up = new Set(upgrades);
  const radial = up.has('radialTyres') || cond.tyreType === 'radial';
  let torque = base.torque * t.power * (1 - 0.25 * cond.engine);
  let redline = base.redline * t.redline;
  if (up.has('fourBarrel')) torque *= 1.12;
  if (up.has('policeEngine')) { torque *= 1.3; redline *= 1.1; }
  const tyreGrip = (radial ? 1.1 : 1) * (1 - 0.12 * cond.tyres);
  return {
    ...base,
    mass: base.mass * t.mass,
    torque, redline,
    brakeForce: base.brakeForce * t.brake * (1 - 0.1 * cond.brakes),
    freqF: base.freqF * t.freq * (up.has('hdSuspension') ? 1.2 : 1),
    freqR: base.freqR * t.freq * (up.has('hdSuspension') ? 1.2 : 1),
    zeta: base.zeta * t.zeta * (1 - 0.55 * cond.shocks) * (up.has('hdSuspension') ? 1.4 : 1),
    antiRoll: base.antiRoll * t.antiRoll * (up.has('hdSuspension') ? 1.8 : 1),
    muPeak: base.muPeak * t.mu * tyreGrip,
    muSlide: base.muSlide * t.mu * tyreGrip,
    tyreB: base.tyreB * (radial ? 1.25 : 1),
    steerRate: base.steerRate * t.steer,
  };
}

// ============================================================================ components
export type GlassPane = 'front' | 'rear' | 'left' | 'right';
/** 0 intact, 1 cracked, 2 shattered (open). */
export type GlassState = 0 | 1 | 2;
export interface Components {
  tyresFlat: boolean[]; // per wheel, same order as the physics wheels
  glass: Record<GlassPane, GlassState>;
  radiator: number; // health 1..0 (0 = holed: coolant gone)
  engine: number; // health 1..0
  fuelTank: number; // health 1..0 (< 1 leaks)
  headlamps: boolean; taillamps: boolean; // broken?
}
export function newComponents(wheels: number): Components {
  return { tyresFlat: Array(wheels).fill(false), glass: { front: 0, rear: 0, left: 0, right: 0 }, radiator: 1, engine: 1, fuelTank: 1, headlamps: false, taillamps: false };
}

// ============================================================================ security, plates, trunk
export interface Security { locked: boolean; keysIn: boolean; hotwired: boolean }
export interface TrunkItem { id: string; qty: number; meta?: Record<string, unknown> }
export interface Trunk { capacity: number; items: TrunkItem[] }

export function trunkCapacity(spec: ModelSpec): number {
  switch (spec.cls) {
    case 'wagon': return 20;
    case 'boxtruck': case 'stepvan': return 60;
    case 'bus': case 'garbage': return 0;
    case 'mail': return 80; case 'ambulance': return 30; case 'fire': case 'ladder': return 40; case 'icecream': return 20;
    case 'compact': return 8;
    default: return 12;
  }
}
export function trunkAdd(t: Trunk, item: TrunkItem): boolean {
  const used = t.items.reduce((a, i) => a + i.qty, 0);
  if (used + item.qty > t.capacity) return false;
  const same = !item.meta ? t.items.find((i) => i.id === item.id && !i.meta) : undefined;
  if (same) same.qty += item.qty; else t.items.push({ ...item, meta: item.meta ? { ...item.meta } : undefined });
  return true;
}
export function trunkRemove(t: Trunk, id: string, qty = 1): number {
  let left = qty;
  for (let k = t.items.length - 1; k >= 0 && left > 0; k--) {
    const i = t.items[k];
    if (i.id !== id) continue;
    const n = Math.min(i.qty, left); i.qty -= n; left -= n;
    if (i.qty <= 0) t.items.splice(k, 1);
  }
  return qty - left;
}

/** 1974-style plate: 3 letters, 3 digits (commercial: digits then letters). Invented, random. */
export function plateFor(spec: ModelSpec, r: () => number): string {
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ', D = '0123456789';
  const l = () => L[Math.floor(r() * L.length)], d = () => D[Math.floor(r() * 10)];
  void spec; void d;
  // 1973–80 New York base: 12-ABC / 123-ABC, numbers 51–999
  const n = 51 + Math.floor(r() * 949);
  return `${n}-${l()}${l()}${l()}`;
}

// ============================================================================ engine systems
export type EngineEventType = 'crank' | 'start' | 'noStart' | 'stall' | 'misfire' | 'backfire' | 'overheat' | 'steam' | 'cooled' | 'flooded' | 'deadBattery' | 'outOfFuel' | 'vapourLock';
export type FailureKind = 'overheat' | 'vapourLock' | 'flood' | 'deadBattery' | 'stall' | 'outOfFuel';

export interface EngineSnapshot {
  running: boolean; temp: number; fuel: number; flooded: boolean; batteryCharge: number;
  vapourLockT: number; crankFails: number; hotSoakT: number; brakeTemp: number; coolant: number;
}

/**
 * Engine temperature (°C), fuel, ignition and the 1974 failure modes. Deterministic given its
 * RNG, so behaviour is testable and missions can force or suppress failures.
 *
 * Calibrated so a healthy car idling in 32 °C August traffic sits near 100 °C; a weak radiator
 * (wear 0.8) or a holed one boils over within a few minutes of stop-and-go.
 */
export class EngineSystems {
  running = false;
  temp: number;
  fuel: number; // litres
  readonly tankL: number;
  flooded = false;
  batteryCharge = 1; // 0..1
  coolant = 1; // 0..1 (radiator leaks drain it)
  brakeTemp = 40; // °C, drives fade
  /** Seconds after a hot stop during which vapour lock can bite. */
  hotSoakT = 0;
  vapourLockT = 0;
  crankFails = 0;
  /** Missions: 0 = never fail on its own; 1 = default rarity. */
  failureRate = 1;
  fuelEnabled = true;
  ambient = 30;
  private crankT = 0;
  private misfireT = 0;
  private r: () => number;
  private listeners: ((type: EngineEventType, info?: Record<string, number>) => void)[] = [];
  /** Power multiplier from heat, misfire and fuel starvation (read by physics). */
  power = 1;
  overheating = false;

  constructor(private cond: Condition, opts: { tankL: number; fuel: number; cooling: number; seed: number }) {
    this.tankL = opts.tankL; this.fuel = opts.fuel;
    this.cooling = opts.cooling;
    this.temp = this.ambient;
    this.r = rng(opts.seed >>> 0);
  }
  cooling: number;

  on(cb: (type: EngineEventType, info?: Record<string, number>) => void) { this.listeners.push(cb); }
  private emit(t: EngineEventType, info?: Record<string, number>) { for (const l of this.listeners) l(t, info); }

  /** Turn the key / connect the hot-wire. Returns immediately; cranking resolves in update(). */
  crank(throttle = 0) {
    if (this.running || this.crankT > 0) return;
    this.crankT = 0.9 + this.r() * 0.6;
    this.crankThrottle = throttle;
    this.emit('crank');
  }
  private crankThrottle = 0;
  stop() { if (this.running) { this.running = false; if (this.temp > 100) this.hotSoakT = 600; } }

  /** Mission control: force a failure now (ignores failureRate). */
  force(kind: FailureKind) {
    switch (kind) {
      case 'overheat': this.temp = Math.max(this.temp, 121); this.coolant = Math.min(this.coolant, 0.3); break;
      case 'vapourLock': this.hotSoakT = 600; this.temp = Math.max(this.temp, 110); this.vapourLockT = 8; if (this.running) this.stall('vapourLock'); break;
      case 'flood': this.flooded = true; if (this.running) this.stall('stall'); break;
      case 'deadBattery': this.batteryCharge = 0.05; if (this.running) this.stall('stall'); break;
      case 'stall': this.stall('stall'); break;
      case 'outOfFuel': this.fuel = 0; break;
    }
  }
  private stall(reason: EngineEventType) {
    if (!this.running) return;
    this.running = false;
    if (this.temp > 100) this.hotSoakT = 600;
    this.emit('stall');
    if (reason !== 'stall') this.emit(reason);
  }

  /**
   * Advance one step. rpm/load from the drivetrain, speed (m/s) for airflow, damage inputs.
   * Returns nothing; read running/power/temp.
   */
  update(dt: number, s: { rpm: number; load: number; speed: number; throttle: number; brakePower: number; radiatorHealth: number; engineHealth: number; fuelTankHealth: number }) {
    const c = this.cond;
    // ---------------------------------------------------- cranking
    if (this.crankT > 0) {
      this.crankT -= dt;
      if (this.crankT <= 0) this.resolveCrank();
    }
    // ---------------------------------------------------- coolant & temperature
    if (s.radiatorHealth < 1) this.coolant = Math.max(0, this.coolant - (1 - s.radiatorHealth) * 0.012 * dt);
    const heatIn = this.running ? 9 + 55 * s.load * (s.rpm / 4000) : 0; // kW-ish units
    const airflow = 0.35 + Math.min(1.6, s.speed / 12); // fan + ram air
    const capacity = this.cooling * (1 - 0.45 * Math.pow(c.radiator, 1.5)) * (0.15 + 0.85 * this.coolant);
    const thermostat = this.temp > 88 ? 1 : 0.15;
    const heatOut = capacity * airflow * thermostat * Math.max(0, this.temp - this.ambient) * 0.41;
    this.temp += (heatIn - heatOut) * dt * 0.03 + (this.running ? 0 : -(this.temp - this.ambient) * 0.0015 * dt);
    if (this.temp > 118 && !this.overheating) { this.overheating = true; this.emit('overheat', { temp: this.temp }); this.emit('steam'); }
    if (this.overheating && this.temp < 104) { this.overheating = false; this.emit('cooled', { temp: this.temp }); }
    if (this.temp > 128 && this.running) this.stall('stall');
    if (!this.running && this.hotSoakT > 0) this.hotSoakT -= dt;

    // ---------------------------------------------------- brakes heat (fade)
    this.brakeTemp += (s.brakePower * 0.0009 - (this.brakeTemp - this.ambient) * (0.02 + s.speed * 0.002)) * dt * 10;

    // ---------------------------------------------------- fuel
    if (this.running && this.fuelEnabled) {
      // ~12 mpg full-size cruising; idle ~1.6 L/h
      const lph = 1.6 + 42 * s.load * (s.rpm / 4000);
      this.fuel = Math.max(0, this.fuel - (lph / 3600) * dt);
      if (s.fuelTankHealth < 1) this.fuel = Math.max(0, this.fuel - (1 - s.fuelTankHealth) * 0.05 * dt);
      if (this.fuel <= 0) { this.stall('outOfFuel'); }
    } else if (s.fuelTankHealth < 1) this.fuel = Math.max(0, this.fuel - (1 - s.fuelTankHealth) * 0.05 * dt);

    // ---------------------------------------------------- running effects
    let power = 1;
    if (this.running) {
      // vapour lock after a hot restart: fuel boils in the line, engine starves and dies
      if (this.vapourLockT > 0) {
        this.vapourLockT -= dt; power *= 0.35 + 0.3 * Math.sin(this.vapourLockT * 13);
        if (this.vapourLockT <= 0.2) this.stall('vapourLock');
      }
      if (this.temp > 112) power *= Math.max(0.35, 1 - (this.temp - 112) * 0.04);
      if (this.fuelEnabled && this.fuel < 1.5) power *= 0.5 + 0.5 * (this.r() > 0.3 ? 1 : 0); // starving: sputter
      // tired or damaged engine misfires
      const mis = (c.engine * 0.6 + (1 - s.engineHealth)) * this.failureRate;
      this.misfireT -= dt;
      if (mis > 0.05 && this.misfireT <= 0 && this.r() < mis * dt * (0.4 + s.load * 2.5)) {
        this.misfireT = 0.12 + this.r() * 0.2; this.emit(this.r() < 0.25 && s.throttle < 0.1 ? 'backfire' : 'misfire');
      }
      if (this.misfireT > 0) power *= 0.4;
      power *= 0.35 + 0.65 * s.engineHealth;
      if (s.engineHealth <= 0.02) this.stall('stall');
      // stall at idle with a very tired engine in the heat (rare)
      if (s.rpm < 750 && s.speed < 0.5 && this.temp > 108 && this.r() < 0.0008 * this.failureRate * dt * 60 * (0.3 + c.engine)) this.stall('stall');
      this.batteryCharge = Math.min(1, this.batteryCharge + 0.002 * dt);
    }
    this.power = this.running ? power : 0;
  }

  private resolveCrank() {
    const c = this.cond;
    const f = this.failureRate;
    if (this.fuelEnabled && this.fuel <= 0.05) { this.crankFails++; this.emit('noStart'); this.emit('outOfFuel'); return; }
    // weak battery: each attempt drains it; enough attempts and it's dead
    const batteryOk = this.batteryCharge > 0.15 && this.r() > c.battery * c.battery * 0.6 * f;
    this.batteryCharge = Math.max(0, this.batteryCharge - (0.08 + c.battery * 0.12));
    if (!batteryOk) { this.crankFails++; this.emit('noStart'); if (this.batteryCharge <= 0.15) this.emit('deadBattery'); return; }
    // flooded: pumping the throttle on a hot or failed start floods the carb; flooring it clears it
    if (this.flooded) {
      if (this.crankThrottle > 0.9 && this.r() < 0.6) this.flooded = false;
      else { this.crankFails++; this.emit('noStart'); this.emit('flooded'); return; }
    } else if (this.crankFails >= 2 && this.crankThrottle > 0.2 && this.crankThrottle < 0.9 && this.r() < 0.35 * f) {
      this.flooded = true; this.crankFails++; this.emit('noStart'); this.emit('flooded'); return;
    }
    this.running = true; this.crankFails = 0;
    this.emit('start');
    // vapour lock: a hot-soaked engine restarted in the summer heat may die within seconds
    if (this.hotSoakT > 0 && this.temp > 100 && this.r() < 0.35 * f * Math.min(1, (this.temp - 100) / 15)) this.vapourLockT = 3 + this.r() * 4;
  }

  /** Brake fade factor (1 = full braking) from brake temperature and lining wear. */
  get brakeFade() { return 1 - Math.min(0.45, Math.max(0, (this.brakeTemp - 280) / 300) * (0.6 + this.cond.brakes)); }
  /** Push start: rolling in gear at > 3 m/s with a dead battery. */
  pushStart(speed: number) {
    if (this.running || speed < 3 || (this.fuelEnabled && this.fuel <= 0)) return false;
    this.running = true; this.flooded = false; this.crankFails = 0; this.emit('start'); return true;
  }

  snapshot(): EngineSnapshot {
    return { running: this.running, temp: this.temp, fuel: this.fuel, flooded: this.flooded, batteryCharge: this.batteryCharge, vapourLockT: this.vapourLockT, crankFails: this.crankFails, hotSoakT: this.hotSoakT, brakeTemp: this.brakeTemp, coolant: this.coolant };
  }
  restore(s: EngineSnapshot) { Object.assign(this, s); }
}

/** Default tank size (litres) by class. */
export function tankLitres(spec: ModelSpec) {
  switch (spec.cls) { case 'compact': return 60; case 'bus': return 300; case 'boxtruck': case 'garbage': case 'fire': case 'ladder': return 190; case 'stepvan': case 'ambulance': case 'icecream': case 'mail': return 110; default: return 85; }
}

// ============================================================================ save format
export const VEHICLE_SAVE_VERSION = 1;
export interface VehicleSave {
  v: 1;
  id: string;
  modelId: string; variant: number;
  /** Shared traffic class (src/shared/traffic.ts) for the engine's garage section (E10). */
  vclass: string;
  /** Shared 0–4 condition grade (derelict .. pristine). */
  grade: number;
  trim: TrimTier; condition: Condition; upgrades: Upgrade[];
  /** Body-shop respray (sRGB hex) or null for the factory paint. */
  paint: number | null;
  dirt: number;
  plate: string;
  zones: { front: number; rear: number; left: number; right: number };
  damage: number;
  stage: string;
  burnT: number;
  components: Components;
  engine: EngineSnapshot;
  security: Security;
  trunk: Trunk;
  pose: { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number };
}

/** Fresh per-instance state from (spec, variant). Deterministic. */
export function initialState(spec: ModelSpec, variant: number) {
  const r = rng(((variant + 1) * 2246822519) ^ 0x9e3779b9);
  const trim = trimFor(spec, r);
  const condition = deriveCondition(spec, r);
  const plate = plateFor(spec, r);
  const tank = tankLitres(spec);
  const fuel = Math.round(tank * (0.15 + r() * 0.8) * 10) / 10;
  // 1974: many cars left unlocked; keys left in idling trucks and cabs at a coffee stop
  const locked = r() < (spec.cls === 'police' ? 0.9 : 0.45);
  const keysIn = (spec.cls === 'stepvan' || spec.cls === 'boxtruck' || spec.cls === 'taxi') ? r() < 0.2 : r() < 0.04;
  return { trim, condition, plate, fuel, security: { locked, keysIn, hotwired: false } as Security };
}
