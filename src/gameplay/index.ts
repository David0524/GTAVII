/**
 * Gameplay systems for Tenderloin '74: health and damage, combat and weapons, the police response
 * (witnesses → call boxes → precinct reports → response → bribes), items, money, shops, wardrobe,
 * payphones and breakable props. Integration contract: docs/briefs/GAMEPLAY_BRIEF.md. Everything is
 * event-based; no other stream's internals are imported. The core runs headless (tests) and in the
 * `?gameplay=1` test scene.
 *
 * Units: metres, seconds, world frame of src/shared/geo.ts; MONEY IS INTEGER CENTS everywhere here.
 */
import { BoxWorld } from './core/boxworld';
import { Emitter } from './core/events';
import { Rng } from './core/rng';
import { norm, wrapAngle, type V3 } from './core/vec';
import type { WorldQuery } from './core/world';
import { DEFAULT_CONTENT } from './data/defaults';
import type { GameplayContent, ItemDef, ShopDef, WeaponDef } from './data/schema';
import { HealthSystem, pedestrianImpactDamage, occupantImpactDamage, fallDamage, type DamageType, type Region } from './health/Health';
import { Registry } from './items/registry';
import { Inventory } from './items/inventory';
import { Shops } from './items/shop';
import { Wardrobe } from './items/wardrobe';
import { Phones } from './items/phone';
import { Props, type PropType } from './props/props';
import { MeleeSystem, type AttackKind, type FighterProfile } from './combat/melee';
import { CoverSystem, type CoverPoint } from './combat/cover';
import { Aim, type AimTarget, type AssistLevel, type Limb } from './combat/aim';
import { CombatAI, type Faction, type CombatTarget } from './combat/ai';
import { Gun, NEUTRAL_MODS, type ShooterMods, type ShotRay } from './combat/weapons';
import { humanoidHitbox, resolveShots, type ActorHitbox, type ShotResult, type TyreShape } from './combat/ballistics';
import { Witnesses, type ReportPoint } from './police/witnesses';
import { Police, expectedBribe as expectedBribeOf, type SuspectCtx, type UnitKind } from './police/police';
import { radiusOf as radiusOfCrime, type Crime, type CrimeKind } from './police/crime';
import type { Appearance } from './police/description';
import type { AgentCommand, AgentPort, PedSnapshot } from './police/ports';
import { Outcomes, type Release } from './outcomes';
import { conceal, rollShot, TIERS, JAM_CLEAR, DEFAULT_GUN, lootGun, type Concealment } from './items/guns';
import { stepStamina } from './player/stamina';
import { learn, effects as skillFx } from './player/skills';
import { migrate, SAVE_VERSION, type SaveV3 } from './save';
import { vehicleLook, type PlayerVehicle } from './appearance';
import { TimeKeeper, restQuality, type CantSleep } from './time';
import { Cars, type EntryMethod } from './cars/theft';
import { FireSystem } from './props/fire';
import { Ownership } from './cars/ownership';
import { Stats } from './meta/stats';
import { simAgentPort, type SimLike } from './integration/simAdapter';
import { Economy } from './economy';
import { cabFare, cabTip, rideMinutes, TOKEN, SUBWAY_KMH } from './meta/travel';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export type GameplayEventType = 'wasted' | 'arrested' | 'crimeWitnessed' | 'reportFiled' | 'shot' | 'hit' | 'propBroken'
  | 'impact' | 'bark' | 'radio' | 'witness' | 'police' | 'melee' | 'money' | 'pickup' | 'ring' | 'call' | 'wear' | 'geyser' | 'tyreShot' | 'notice'
  | 'copKilled' | 'essentialKilled' | 'cleared' | 'released' | 'fire' | 'context' | 'cab';

/** Per-quality budgets (brief: 12 combatants on High within 1.5 ms; 6 on mobile Low). */
/** How much a drink goes to your head (0..1 scale; effects stay modest and wear off in a few minutes). */
/** Home upgrades, 1974 prices (cents): a window air conditioner, a floor safe, a police lock. */
export const HOME_UPGRADES: Record<string, number> = { ac: 18900, safe: 12000, lock: 3500 };
export const DRINK: Record<string, number> = { 'item.beer': 0.18, 'item.whiskey': 0.3 }, SOBER_PER_S = 1 / 240;
/** 1974 barber prices (cents) and the boxing gym. */
export const BARBER: Record<string, number> = { 'clean-shaven': 150, moustache: 300, sideburns: 300, beard: 300, 'short hair': 300, 'long hair': 300 }, GYM_SESSION = 100, BOUT_PURSE = 2000;
/** Side-window arc (radians off the car's nose) and spread penalty when shooting from a car. */
export const DRIVEBY_ARC = [Math.PI / 6, (5 * Math.PI) / 6] as const, DRIVEBY_SPREAD = 1.6;
/** Seconds before an unanswered radio check turns into an officer-down report. */
export const RADIO_SILENCE = 45;
export const COMBAT_BUDGET: Record<Quality, { combatants: number; witnesses: number }> = {
  low: { combatants: 6, witnesses: 4 }, medium: { combatants: 9, witnesses: 5 }, high: { combatants: 12, witnesses: 6 }, ultra: { combatants: 16, witnesses: 8 },
};

export interface PlayerBinding { id: string; lead: string; position(): [number, number, number]; aim(): { origin: [number, number, number]; dir: [number, number, number] } }
/** Crimes that leave someone needing an ambulance once they're called in. */
const HURT_KINDS: ReadonlySet<string> = new Set(['shooting', 'homicide', 'assault_weapon', 'officer_down', 'assault_officer', 'hit_and_run']);
export interface SimBinding { on(type: string, cb: (e: any) => void): void; emit(e: any): void; peds: readonly unknown[]; vehicles: readonly unknown[]; command?(id: string, c: AgentCommand): void }
/** Interiors' door list (INTERIORS_BRIEF `doorsForChunk`); chunk (i,j) covers [i*S,(i+1)*S) × [j*S,(j+1)*S). */
export interface DoorInfo { id: string; x: number; z: number; yaw: number; kind: string; locked: boolean; hours?: [string, string] }
export interface DoorsBinding { doorsForChunk(i: number, j: number): readonly DoorInfo[]; chunkSize?: number; open?(id: string): void }
/** Engine mission/trigger runtime (ENGINE_REQUESTS 15): named characters and givers the player can talk to. */
export interface TalkBinding { nearestTalkable(x: number, z: number, radius: number): { id: string; name: string; x: number; z: number } | null; talk(id: string): void }
export interface VehiclesBinding { on(type: 'impact' | 'destroyed', cb: (e: any) => void): void }

interface Actor { id: string; kind: 'player' | 'npc' | 'ped' | 'cop'; team: 'player' | 'enemy' | 'civilian' | 'police'; pos: () => V3; yaw: () => number; stance: () => 'stand' | 'crouch' | 'down'; vehicleId?: string }

export interface PlayerCombatState {
  weapon: string; aiming: boolean; firing: boolean; cover: CoverPoint | null; peek: boolean; blind: boolean;
  surrendered: boolean; vehicle: PlayerVehicle | null; indoors: boolean; subway: boolean; atHome: boolean; speed: number;
  sprinting: boolean; tempF: number; raining: boolean; unlimitedSprint: boolean; jamClear: number;
  /** heading of the car the player sits in (drive-by arcs) */
  vehicleYaw: number;
  /** crouched / sneaking (stealth) */
  crouch: boolean;
  /** touch fire mode (TOUCH_CONTROLS.md): 'auto' fires when the reticle is on a locked target; 'tap' and 'button' wait for input */
  fireMode: 'auto' | 'tap' | 'button'; gyro: boolean;
  /** Interiors: inside a public place (diner, shop, lobby) / in a hiding spot marker */
  indoorsPublic: boolean; hiding: boolean;
  lockLimb: Limb; device: 'touch' | 'pad' | 'mouse'; assist: AssistLevel;
}

export class Gameplay {
  readonly reg: Registry;
  readonly rng = new Rng(0x1974);
  readonly world: BoxWorld;
  readonly healthSys = new HealthSystem();
  readonly inv: Inventory;
  readonly shops: Shops;
  readonly wardrobe: Wardrobe;
  readonly phones: Phones;
  readonly props = new Props();
  readonly melee: MeleeSystem;
  readonly cover = new CoverSystem();
  readonly aimer = new Aim();
  readonly ai: CombatAI;
  readonly witnesses: Witnesses;
  readonly policeSys: Police;
  readonly outcomes: Outcomes;
  readonly budget: { combatants: number; witnesses: number };
  /** gameplay's side of the clock: sleep / wait rules and world effects (TIME.md) */
  readonly clock = new TimeKeeper();
  /** car records: theft, hot cars, plates, trunks (CORE_SYSTEMS §5) */
  readonly cars: Cars;
  /** fires: molotovs, car fires, arson, spread, engines */
  readonly fire: FireSystem;
  /** owned cars: buying, haggling, titles, tickets, the boot, the pound, garages */
  readonly ownership: Ownership;
  /** stats and completion feed for the UI chat */
  readonly stats = new Stats();
  /** free-roam money: jobs, crime, fences, chop list, gambling, property, loans (ECONOMY.md) */
  readonly economy: Economy;
  private lastPos: V3 | null = null;
  private fireTick = 0;
  /** a car waiting on a hot-wire before it will start */
  hotwiring: string | null = null;
  private bus = new Emitter<Record<GameplayEventType, any>>();
  private actors = new Map<string, Actor>();
  private tyres: TyreShape[] = [];
  private pendingShots: { shooter: string; ray: ShotRay }[] = [];
  private crimeSeq = 1;
  private lastShotsCrime = -1e9;
  private lastMenace = -1e9;
  private time = 0;
  private player: PlayerBinding | null = null;
  private guns = new Map<string, Gun>();
  private sim: SimBinding | null = null;
  private port: AgentPort;
  private flags = new Set<string>();
  /** Story-critical NPCs: their death fails the mission (essentialKilled). Narrative clears them at arc end. */
  readonly essential = new Set<string>();
  private wasClear = true;
  private pendingDiscoveries: { at: number; perp: string; where: [number, number] }[] = [];
  readonly pc: PlayerCombatState = {
    weapon: 'weapon.fists', aiming: false, firing: false, cover: null, peek: false, blind: false, surrendered: false, vehicle: null,
    indoors: false, subway: false, atHome: false, speed: 0, lockLimb: 'torso', device: 'mouse', assist: 'standard',
    sprinting: false, tempF: 84, raining: false, unlimitedSprint: false, jamClear: 0, vehicleYaw: 0, crouch: false, indoorsPublic: false, hiding: false, fireMode: 'auto', gyro: false,
  };
  /** Last frame's shot results (debug overlay tracers). */
  lastShots: ShotResult[] = [];
  timings = { combatMs: 0, policeMs: 0, totalMs: 0, ballisticsMs: 0 };
  /** Light provider for witness/cop perception (engine clock). */
  light = (_x: number, _z: number) => 1;

  constructor(opts: { quality: Quality; content: { items: unknown; shops: unknown; weapons: unknown } & Partial<Record<'outfits' | 'garments' | 'precincts' | 'leads', unknown>> }) {
    const c = opts.content ?? ({} as any);
    const content: GameplayContent = {
      items: Array.isArray(c.items) && c.items.length ? (c.items as ItemDef[]) : DEFAULT_CONTENT.items,
      weapons: Array.isArray(c.weapons) && c.weapons.length ? (c.weapons as WeaponDef[]) : DEFAULT_CONTENT.weapons,
      shops: Array.isArray(c.shops) && c.shops.length ? (c.shops as ShopDef[]) : DEFAULT_CONTENT.shops,
      outfits: (c.outfits as GameplayContent['outfits']) ?? DEFAULT_CONTENT.outfits,
      garments: (c.garments as GameplayContent['garments']) ?? DEFAULT_CONTENT.garments,
      precincts: (c.precincts as GameplayContent['precincts']) ?? DEFAULT_CONTENT.precincts,
      leads: (c.leads as GameplayContent['leads']) ?? DEFAULT_CONTENT.leads,
    };
    this.reg = new Registry(content);
    this.budget = COMBAT_BUDGET[opts.quality] ?? COMBAT_BUDGET.high;
    this.world = new BoxWorld();
    this.inv = new Inventory(this.reg);
    this.shops = new Shops(this.reg, this.inv);
    this.shops.flag = (f) => this.flags.has(f);
    this.wardrobe = new Wardrobe(this.reg, this.inv);
    this.phones = new Phones(this.inv);
    this.melee = new MeleeSystem(this.rng, this.world);
    this.ai = new CombatAI(this.rng);
    this.cars = new Cars(this.rng);
    this.fire = new FireSystem(this.rng);
    this.ownership = new Ownership(this.inv, this.cars);
    // crimes from economy activities go through the same witness system as everything else
    this.economy = new Economy({ inv: this.inv, time: this.clock, crime: (kind, o) => { this.crime(kind, o); }, rng: this.rng, flags: (f) => this.flags.has(f) });
    this.clock.on('timeAdvanced', (e) => { this.ownership.advance(e.fromDay, e.fromMinutes, e.toDay, e.toMinutes); this.ownership.restockWeek(Math.floor(e.toDay / 7)); });
    this.port = this.nullPort();
    this.policeSys = new Police(this.reg.precincts, this.world, this.rng);
    this.policeSys.bribeSkill = (id) => (id === this.player?.id ? this.reg.leads.get(this.player.lead)?.bribeSkill ?? 0 : 0);
    this.witnesses = new Witnesses({ peds: () => this.port.peds(), ped: (id) => this.port.ped(id), command: (id, cmd) => this.port.command(id, cmd) }, this.world, this.rng,
      (x, z) => this.light(x, z),
      () => [...this.policeSys.units.values()].filter((u) => u.kind !== 'helicopter' && u.kind !== 'roadblock').map((u) => ({ id: u.id, x: u.x, z: u.z, available: u.state === 'search' || u.state === 'enroute' })));
    this.witnesses.maxReporters = this.budget.witnesses;
    this.witnesses.maxCandidates = this.budget.witnesses * 4;
    this.outcomes = new Outcomes(this.reg, this.inv, this.healthSys, this.policeSys, this.rng);
    this.outcomes.flag = (f) => this.flags.has(f);
    this.policeSys.payroll = (id) => id === this.player?.id && this.hasAbility('payroll');
    this.policeSys.priorsOf = (perp, pct) => (perp === this.player?.id ? this.outcomes.priors(this.player.lead, pct) : 0);
    this.wire();
  }

  // ------------------------------------------------------------------ contract: events
  on(type: GameplayEventType, cb: (e: any) => void) { return this.bus.on(type, cb); }
  private emit(type: GameplayEventType, e: any) { this.bus.emit(type, e); }

  // ------------------------------------------------------------------ contract: bindings
  bindPlayer(p: PlayerBinding) {
    const prev = this.player;
    if (prev && prev.id !== p.id) { this.healthSys.remove(prev.id); this.melee.remove(prev.id); this.actors.delete(prev.id); }
    this.player = p;
    const prof = this.reg.lead(p.lead);
    const inv = this.inv.ensure(p.lead);
    if (!this.healthSys.state(p.id)) this.healthSys.register(p.id, { maxHp: prof.maxHp, regenCeiling: prof.regenCeiling, isPlayer: true, armor: inv.armor });
    this.pc.weapon = inv.equipped;
    this.guns.clear();
    this.actors.set(p.id, { id: p.id, kind: 'player', team: 'player', pos: () => p.position(), yaw: () => yawOf(p.aim().dir), stance: () => this.playerStance() });
    this.melee.remove(p.id);
    this.melee.add(p.id, { pos: p.position(), yaw: 0, weapon: this.meleeWeapon(), profile: this.profileOf(p.lead, false), team: 'player' });
  }
  bindSim(sim: SimBinding) {
    this.sim = sim;
    if (typeof (sim as any).setGoal === 'function') { this.port = simAgentPort(sim as unknown as SimLike); this.simLike = sim as unknown as SimLike; this.bindSimServices(this.simLike); sim.on('collision', (e) => this.onSimCollision(e)); return; }
    this.port = {
      peds: () => (sim.peds as readonly any[]).map(pedSnap),
      ped: (id) => { const raw = (sim.peds as readonly any[]).find((q) => `${q.id}` === id || `ped:${q.id}` === id); return raw ? pedSnap(raw) : undefined; },
      command: (id, cmd) => (sim.command ? sim.command(id, cmd) : sim.emit({ type: 'agentCommand', id, cmd })),
    };
    sim.on('collision', (e) => this.onSimCollision(e));
  }
  private doors: DoorsBinding | null = null;
  private talkers: TalkBinding | null = null;
  private doorOpenNow(d: DoorInfo) {
    if (!d.hours) return false;
    const m = this.clock.clock.minutes; const [a, b] = d.hours.map((h) => { const [H, M] = h.split(':').map(Number); return H * 60 + (M || 0); });
    return a <= b ? m >= a && m < b : m >= a || m < b;
  }
  bindDoors(d: DoorsBinding) { this.doors = d; }
  bindTalk(t: TalkBinding) { this.talkers = t; }
  /** Nearest door within r metres (searches the player's chunk and its neighbours). */
  nearestDoor(x: number, z: number, r = 1.8): DoorInfo | null {
    if (!this.doors) return null;
    const S = this.doors.chunkSize ?? 200, ci = Math.floor(x / S), cj = Math.floor(z / S);
    let best: DoorInfo | null = null, bd = r;
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const d of this.doors.doorsForChunk(i, j)) { const k = Math.hypot(d.x - x, d.z - z); if (k <= bd) { bd = k; best = d; } }
    return best;
  }
  /** Who the context button would talk to: engine talkables first; fallback, any sim ped within 2 m (a bark). */
  nearestTalkable(x: number, z: number, r = 2): { id: string; name: string; ped: boolean } | null {
    const t = this.talkers?.nearestTalkable(x, z, r); if (t) return { id: t.id, name: t.name, ped: false };
    let best: PedSnapshot | null = null, bd = r;
    for (const p of this.port.peds()) { if (!p.alive) continue; const k = Math.hypot(p.x - x, p.z - z); if (k <= bd) { bd = k; best = p; } }
    return best ? { id: best.id, name: 'passer-by', ped: true } : null;
  }
  bindVehicles(v: VehiclesBinding) {
    v.on('impact', (e) => this.onVehicleImpact(e));
    v.on('destroyed', (e) => this.emit('notice', { kind: 'vehicleDestroyed', ...e }));
  }
  /** Static world (engine Rapier city). The dynamic layer (props, vehicles, cover pieces) stays in `world`. */
  bindWorld(q: WorldQuery) { this.world.fallback = q; }
  setFlags(flags: Iterable<string>) { this.flags = new Set(flags); }

  // ------------------------------------------------------------------ contract: health
  readonly health = {
    get: (id: string) => this.healthSys.get(id),
    damage: (id: string, d: { amount: number; region?: string; source?: string; type: DamageType }) => { this.applyDamage(id, d); },
  };

  // ------------------------------------------------------------------ contract: police
  readonly police: { readonly reports: ReturnType<Police['view']>; bribe(copId: string, cents: number): 'accepted' | 'refused' | 'insulted' } = (() => {
    const g = this;
    return {
      get reports() { return g.policeSys.view(); },
      bribe: (copId: string, cents: number) => g.bribe(copId, cents),
    };
  })();
  /** Offer a cop a bribe in cents (money is taken only if accepted). */
  bribe(copId: string, cents: number) {
    cents = Math.max(0, Math.round(cents));
    {
      const s = this.suspect();
      const lead = this.player?.lead;
      const near = this.witnesses.active(this.player?.id).length;
      return this.policeSys.bribe(copId, cents, s, (c) => !!lead && this.inv.spend(lead, c, 'bribe'), near);
    }
  }

  // ------------------------------------------------------------------ contract: inventory
  readonly inventory = {
    of: (lead: string) => this.inv.of(lead),
    give: (lead: string, id: string, qty = 1) => { this.inv.give(lead, id, qty); },
    take: (lead: string, id: string, qty = 1) => this.inv.take(lead, id, qty),
  };

  // ------------------------------------------------------------------ world setup (scene / engine)
  addProp(id: string, type: PropType, x: number, y: number, z: number, yaw = 0) {
    this.props.add({ id, type, x, y, z, yaw });
    const d = this.props.boxes().find((b) => b.id === id)!;
    this.world.add(d);
    if (type === 'call_box') this.witnesses.addPoint({ id, kind: 'callbox', x, z, broken: false });
    if (type === 'newsstand' || type === 'trash_can') this.fire.addFlammable(id, x, z, 'paper');
    if (type === 'phone_booth') { this.phones.add({ id, x, z, broken: false }); this.witnesses.addPoint({ id, kind: 'payphone', x, z, broken: false }); }
    if (type === 'newsstand' || type === 'mailbox' || type === 'phone_booth' || type === 'trash_can') this.cover.add({ id, c: [x, y + d.h[1], z], half: d.h as [number, number, number], yaw, height: type === 'newsstand' || type === 'phone_booth' ? 'high' : 'low' });
  }
  addReportPoint(p: ReportPoint) { this.witnesses.addPoint(p); if (p.kind === 'payphone') this.phones.add({ id: p.id, x: p.x, z: p.z, broken: p.broken }); }
  /** A static cover piece (stoop, planter, low wall, crate) with its collision box. */
  addCover(id: string, c: V3, half: [number, number, number], yaw: number, material: 'brick' | 'concrete' | 'wood' | 'metal_thick' = 'concrete') {
    this.world.add({ id, c, h: half, yaw, material });
    this.cover.add({ id, c, half, yaw, height: half[1] * 2 > 1.35 ? 'high' : 'low' });
    if (material === 'wood') this.fire.addFlammable(id, c[0], c[2], 'wood');
  }
  /** A parked/driven car: hollow thin-metal body, solid engine block, four tyres, cover all round. */
  addCar(id: string, x: number, y: number, z: number, yaw: number, size: { length: number; width: number; height: number } = { length: 5.4, width: 2.0, height: 1.38 }) {
    const hl = size.length / 2, hw = size.width / 2;
    this.fire.addFlammable(id, x, z, 'car');
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const bodyY = y + 0.3 + (size.height - 0.3) / 2;
    this.world.add({ id, c: [x, bodyY, z], h: [hw, (size.height - 0.3) / 2, hl], yaw, material: 'metal_thin', hollow: true });
    this.world.add({ id: `${id}:engine`, c: [x + fx * (hl - 0.9), y + 0.7, z + fz * (hl - 0.9)], h: [hw * 0.7, 0.35, 0.55], yaw, material: 'metal_thick' });
    this.cover.add({ id, c: [x, bodyY, z], half: [hw, (size.height - 0.3) / 2 + 0.15, hl], yaw, height: 'low', vehicle: true });
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    this.tyres = this.tyres.filter((t) => t.vehicleId !== id);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([f, s], i) => this.tyres.push({ vehicleId: id, wheel: i, c: [x + fx * f * (hl - 1.05) + rx * s * (hw - 0.05), y + 0.36, z + fz * f * (hl - 1.05) + rz * s * (hw - 0.05)], r: 0.36 }));
  }
  removeCar(id: string) { this.world.remove(id); this.world.remove(`${id}:engine`); this.cover.remove(id); this.tyres = this.tyres.filter((t) => t.vehicleId !== id); }

  /** Spawn an NPC combatant (mission enemies, hired muscle). Respects the quality budget. */
  spawnCombatant(o: { id: string; faction: Faction; squad: string; pos: V3; yaw?: number; weapon?: string | null; melee?: string; ammo?: number; leader?: boolean; hp?: number }) {
    const live = [...this.ai.agents.values()].filter((a) => a.alive).length;
    if (live >= this.budget.combatants) return null;
    const gun = o.weapon ? this.reg.weapon(o.weapon) : null;
    const melee = this.reg.weapon(o.melee ?? 'weapon.fists');
    const a = this.ai.spawn({ id: o.id, faction: o.faction, squad: o.squad, pos: o.pos, yaw: o.yaw, gun, melee, ammo: o.ammo, leader: o.leader });
    this.healthSys.register(o.id, { maxHp: o.hp ?? 100 });
    this.melee.add(o.id, { pos: a.pos, yaw: a.yaw, weapon: melee, profile: { damage: 1, speed: 1, parryWindow: 0.1, dodgeIframes: 0.15, npc: true }, team: o.faction === 'muscle' ? 'player' : `squad:${o.squad}` });
    const team = o.faction === 'muscle' ? 'player' : o.faction === 'police' ? 'police' : 'enemy';
    this.actors.set(o.id, { id: o.id, kind: o.faction === 'police' ? 'cop' : 'npc', team, pos: () => a.pos, yaw: () => a.yaw, stance: () => (a.state === 'surrender' ? 'stand' : a.stance) });
    return a;
  }
  /** Hire muscle (Nick): costs cents, spawns an allied combatant that follows the player. */
  hireMuscle(lead: string, cents = 5000): string | null {
    if (!this.reg.lead(lead).hiresMuscle || !this.player) return null;
    if (!this.inv.spend(lead, cents, 'muscle')) return null;
    const p = this.player.position();
    const id = `muscle${this.crimeSeq++}`;
    return this.spawnCombatant({ id, faction: 'muscle', squad: 'player', pos: [p[0] + 1.5, p[1], p[2] + 1.5], weapon: 'weapon.pistol', melee: 'weapon.pipe', ammo: 40, hp: 120 }) ? id : null;
  }
  /** Register an ambient pedestrian body for hits (sim peds are registered automatically each frame). */
  private ensurePed(p: PedSnapshot) {
    if (this.actors.has(p.id)) return;
    this.healthSys.register(p.id, { maxHp: 70 });
    const port = this.port;
    this.actors.set(p.id, { id: p.id, kind: 'ped', team: 'civilian', pos: () => { const q = port.ped(p.id); return q ? [q.x, q.y, q.z] : [p.x, p.y, p.z]; }, yaw: () => port.ped(p.id)?.yaw ?? 0, stance: () => 'stand' });
    this.melee.add(p.id, { pos: [p.x, p.y, p.z], yaw: p.yaw, weapon: this.reg.weapon('weapon.fists'), profile: { damage: 0.6, speed: 0.8, parryWindow: 0, dodgeIframes: 0, npc: true }, team: 'civilian' });
  }

  // ------------------------------------------------------------------ player commands (input layer → gameplay)
  equip(weaponId: string) { if (!this.player) return false; if (!this.inv.equip(this.player.lead, weaponId)) return false; this.pc.weapon = weaponId; this.melee.setWeapon(this.player.id, this.meleeWeapon()); this.aimer.release(); return true; }
  cycleWeapon(dir: 1 | -1) { if (!this.player) return; const ws = this.inv.weapons(this.player.lead); const i = ws.indexOf(this.pc.weapon); this.equip(ws[(i + dir + ws.length) % ws.length]); }
  setAiming(on: boolean) { this.pc.aiming = on; if (!on && this.pc.device !== 'touch') this.aimer.release(); if (on && this.pc.cover) this.pc.peek = true; if (!on) this.pc.peek = false; }
  setFiring(on: boolean) { this.pc.firing = on; }
  reload() { const g = this.currentGun(); if (g && this.player) g.startReload(this.inv.reserve(this.player.lead, g.def.id), this.mods()); }
  /** Touch lock-on. */
  /** Touch lock-on: needs no precise aim. Searches a wide cone around where the camera faces (pitch
   *  ignored), then falls back to the best visible threat anywhere in range. */
  lockOn() {
    if (!this.player) return null;
    const a = this.player.aim(), ts = this.aimTargets();
    const L = Math.hypot(a.dir[0], a.dir[2]);
    const flat: V3 = L > 0.05 ? [a.dir[0] / L, 0, a.dir[2] / L] : [-Math.sin(this.melee.fighters.get(this.player.id)?.yaw ?? 0), 0, -Math.cos(this.melee.fighters.get(this.player.id)?.yaw ?? 0)];
    const cur = this.aimer.locked && ts.find((t) => t.id === this.aimer.locked && t.alive && t.visible);
    if (cur) return cur;
    const c = this.aimer.candidates(a.origin, flat, ts, 160);
    const best = c[0] ?? this.aimer.candidates(a.origin, flat, ts, 360)[0];
    this.aimer.locked = best?.t.id ?? null;
    return best?.t ?? null;
  }
  cycleLock(dir: 1 | -1) { if (!this.player) return null; const a = this.player.aim(); const L = Math.hypot(a.dir[0], a.dir[2]) || 1; return this.aimer.cycle(a.origin, [a.dir[0] / L, 0, a.dir[2] / L], this.aimTargets(), dir); }
  /** Tap an enemy on screen: lock exactly that one (the UI picks the id from its screen hit test). */
  lockTarget(id: string) { const t = this.aimTargets().find((x) => x.id === id && x.alive && x.hostile); this.aimer.locked = t ? t.id : null; if (t) this.pc.aiming = true; return !!t; }
  /** For the UI's tap hit test: hostile targets with world points (the UI projects them). */
  lockables() { return this.aimTargets().filter((t) => t.hostile && t.visible).map((t) => ({ id: t.id, chest: t.chest, head: t.head, legs: t.legs, threat: t.threat })); }
  /** Assist strength setting (off | low | standard | strong); gyro aim forces it off. */
  setAssist(level: AssistLevel) { this.pc.assist = this.pc.gyro ? 'off' : level; }
  setLimb(l: Limb) { this.aimer.limb = l; this.pc.lockLimb = l; }
  meleeAttack(kind: AttackKind) { if (!this.player) return false; this.syncPlayerFighter(); return this.melee.attack(this.player.id, kind); }
  block(held: boolean) { if (this.player) { this.syncPlayerFighter(); this.melee.block(this.player.id, held); } }
  dodge(dir: [number, number]) {
    if (!this.player) return false; this.syncPlayerFighter();
    const ok = this.melee.dodge(this.player.id, dir);
    if (ok && this.healthSys.state(this.player.id)?.burning) this.healthSys.treat(this.player.id, { extinguish: this.rng.chance(0.7) }); // stop, drop and roll
    return ok;
  }
  grappleAction(how: 'shove' | 'knee' | 'throw', dir?: [number, number]) { return this.player ? this.melee.grappleAction(this.player.id, how, dir) : false; }
  struggle() { return this.player ? this.melee.struggle(this.player.id) : false; }
  /** Toggle cover: enter the nearest point in the move direction, or leave. */
  toggleCover(moveDir: [number, number] | null) {
    if (!this.player) return null;
    if (this.pc.cover) { this.cover.release(this.player.id); this.pc.cover = null; this.pc.peek = false; return null; }
    const p = this.player.position();
    const c = this.cover.near(p[0], p[2], moveDir);
    if (c) { this.cover.claim(c, this.player.id); this.pc.cover = c; }
    return c;
  }
  setBlindFire(on: boolean) { this.pc.blind = on; }
  surrender(on: boolean) { this.pc.surrendered = on; }
  setContext(c: Partial<Pick<PlayerCombatState, 'vehicle' | 'indoors' | 'subway' | 'atHome' | 'device' | 'assist' | 'speed' | 'sprinting' | 'tempF' | 'raining' | 'unlimitedSprint' | 'vehicleYaw' | 'crouch' | 'indoorsPublic' | 'hiding' | 'fireMode' | 'gyro'>>) { Object.assign(this.pc, c); if (c.gyro) this.pc.assist = 'off'; }
  /** Take the gun and rounds off a downed enemy within reach. Guns come in random condition and tier. */
  loot(): { weapon: string | null; rounds: number } | null {
    if (!this.player) return null;
    const p = this.player.position(), lead = this.player.lead;
    for (const a of this.ai.agents.values()) {
      if (a.alive || !a.gun || a.looted || Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]) > 2.5) continue;
      a.looted = true;
      const item = this.reg.itemForWeapon(a.gun.def.id);
      const state = lootGun(this.rng, a.faction);
      const inv = this.inv.ensure(lead);
      if (item && this.inv.give(lead, item.id) > 0) inv.guns.set(a.gun.def.id, state);
      else if (item) { const cur = inv.guns.get(a.gun.def.id); if (cur && state.condition > cur.condition) inv.guns.set(a.gun.def.id, state); }
      const rounds = a.gun.def.ammo ? this.inv.give(lead, a.gun.def.ammo, Math.min(30, a.ammo + a.gun.loaded)) : 0;
      this.emit('pickup', { kind: 'gun', weapon: a.gun.def.id, rounds, at: a.pos, cents: 0 });
      return { weapon: a.gun.def.id, rounds };
    }
    return null;
  }
  hasAbility(a: string) { return !!this.player && (this.reg.lead(this.player.lead).abilities ?? []).includes(a as any); }
  /** Delphine's instant camera on a cop who just took money (needs film). */
  photographCop(unitId: string) {
    if (!this.player || !this.hasAbility('evidence') || !this.inv.take(this.player.lead, 'item.film_pack')) return false;
    const ok = this.policeSys.evidence(unitId, this.player.id);
    if (ok) this.inv.give(this.player.lead, 'item.photo_evidence');
    this.emit('notice', { kind: ok ? 'evidencePhoto' : 'photoNothing', unit: unitId });
    return ok;
  }
  private oldBeatDay = -1;
  /** Teddy's word at the desk: once a game day, if the desk sergeant thinks well of him (relationship flag). */
  oldBeat(precinct: string) {
    if (!this.player || !this.hasAbility('old_beat') || this.oldBeatDay === this.clock.clock.day) return false;
    if (!this.flags.has(`rel.desk.${precinct}`) && !this.flags.has('rel.kearney_2')) return false;
    const ok = this.policeSys.oldBeat(precinct, this.player.id);
    if (ok) this.oldBeatDay = this.clock.clock.day;
    return ok;
  }
  /** One tap clears a jam (JAM_CLEAR s). */
  clearJam() { const gs = this.gunState(); if (gs?.jammed && this.pc.jamClear <= 0) { this.pc.jamClear = JAM_CLEAR; this.emit('notice', { kind: 'clearingJam' }); return true; } return false; }
  /** Put the gun away (it's concealed again if the outfit allows). */
  holster() { this.equip('weapon.fists'); }
  /** Clean every gun the lead owns (safehouse action). */
  cleanGuns() { if (!this.player || !this.pc.atHome) return false; for (const gs of this.inv.ensure(this.player.lead).guns.values()) { gs.condition = 1; gs.jammed = false; } return true; }
  concealment(): Concealment | null {
    if (!this.player) return null;
    const lead = this.player.lead;
    const carried = this.inv.weapons(lead).map((w) => this.reg.weapon(w));
    return conceal(this.wardrobe.look(lead), carried, this.pc.weapon, this.inv.has(lead, 'item.bag'), this.pc.tempF);
  }
  gunState() { if (!this.player) return null; const w = this.reg.weapon(this.pc.weapon); return w.class === 'melee' ? null : this.inv.ensure(this.player.lead).guns.get(w.id) ?? null; }
  /** Custody: how the lead gets out (desk | lawyer | bail by another lead | night). */
  release(how: Release, by?: string) { return this.outcomes.release(how, by); }
  /** Point a gun at / get in a witness's face. */
  intimidate(pedId: string) {
    if (!this.player) return 'none' as const;
    const p = this.player.position(), q = this.port.ped(pedId); if (!q) return 'none' as const;
    const armed = this.reg.weapon(this.pc.weapon).class !== 'melee';
    const r = this.witnesses.intimidate(pedId, { armed, dist: Math.hypot(q.x - p[0], q.z - p[2]) });
    if (r !== 'none') this.crime('menacing', { victim: pedId, visible: true });
    this.emit('witness', { kind: 'intimidate', ped: pedId, result: r });
    return r;
  }
  payWitness(pedId: string, cents: number) {
    if (!this.player || this.inv.ensure(this.player.lead).money < cents) return false;
    const ok = this.witnesses.pay(pedId, cents, this.hasAbility('payroll'));
    if (ok) this.inv.spend(this.player.lead, cents, 'witness');
    this.emit('witness', { kind: 'pay', ped: pedId, cents, result: ok });
    return ok;
  }
  /** Eat/drink/bandage. Diners heal and stop bleeding when eaten at the counter. */
  use(itemId: string) {
    if (!this.player) return false;
    const def = this.reg.items.get(itemId); if (!def) return false;
    const lead = this.player.lead;
    if (def.kind === 'armor') { if (!this.inv.take(lead, itemId)) return false; this.healthSys.setArmor(this.player.id, def.armor ?? 0); this.inv.ensure(lead).armor = def.armor ?? 0; this.emit('notice', { kind: 'vest' }); return true; }
    if (def.kind !== 'consumable' || !this.inv.take(lead, itemId)) return false;
    if (DRINK[itemId]) { const li = this.inv.ensure(lead); li.intox = Math.min(1, li.intox + DRINK[itemId]); this.emit('notice', { kind: 'drink', intox: li.intox }); return true; }
    this.healthSys.treat(this.player.id, { heal: def.heal ?? 0, stopBleeding: !!def.stopsBleeding, wearRelief: def.stopsBleeding ? (itemId === 'item.blue_plate' ? 0.5 : 0.3) : 0 });
    return true;
  }
  /** Diner counter: buy and eat in one go. */
  eatAt(shop: string, itemId: string) { if (!this.player) return false; const r = this.shops.buy(this.player.lead, shop, itemId); return r.ok && this.use(itemId); }
  changeOutfit(outfit: string, justBought = false) { return this.player ? this.wardrobe.change(this.player.lead, outfit, { atHome: this.pc.atHome, justBought }) : false; }
  /** Chop shop: new plates on the car you're in (breaks the plate part of descriptions and reports). */
  swapPlates() {
    if (!this.player || !this.inv.take(this.player.lead, 'item.plates')) return false;
    const v = this.pc.vehicle; if (v && this.cars.cars.has(v.id)) this.cars.swapPlates(v.id); else this.inv.ensure(this.player.lead).plates++;
    return true;
  }
  /** Get into a car by a given method. Crimes go through the witness system with the method's noise. */
  enterCar(carId: string, method: EntryMethod, timing?: number) {
    if (!this.player) return null;
    const lead = this.player.lead, sk = skillFx(this.inv.ensure(lead).skills);
    const c = this.cars.cars.get(carId);
    const driver = c?.driver ?? null;
    const res = this.cars.enter(carId, lead, method, { lockMul: sk.lockTime, tempF: this.pc.tempF, timing });
    if (!res.ok) { if (res.failed) this.emit('notice', { kind: 'slimjimFailed' }); return res; }
    for (const k of res.crimes) this.crime(k, { noise: Math.max(res.noise, 8), victim: driver ?? undefined, visible: true });
    if (method === 'slimjim' || method === 'hotwire') learn(this.inv.ensure(lead).skills, method === 'slimjim' ? 'lockPicked' : 'hotwired');
    if (res.needsHotwire) { this.hotwiring = carId; return res; }
    this.drive(carId);
    return res;
  }
  /** Under the dash. Call after enterCar returned needsHotwire. */
  hotwire() {
    if (!this.hotwiring || !this.player) return null;
    const id = this.hotwiring;
    const res = this.cars.enter(id, this.player.lead, 'hotwire', { lockMul: skillFx(this.inv.ensure(this.player.lead).skills).lockTime, tempF: this.pc.tempF });
    if (res.ok) { this.hotwiring = null; learn(this.inv.ensure(this.player.lead).skills, 'hotwired'); this.drive(id); }
    else this.emit('notice', { kind: 'stalled' });
    return res;
  }
  private drive(carId: string) { const c = this.cars.cars.get(carId); if (c) this.setContext({ vehicle: { id: c.id, vclass: c.vclass, colour: c.colour } }); }
  exitCar() { const v = this.pc.vehicle; if (v && this.player) { const c = this.cars.cars.get(v.id); const p = this.player.position(); if (c) { c.x = p[0]; c.z = p[2]; } } this.setContext({ vehicle: null }); }

  // ------------------------------------------------------------------ crimes
  /** Report a crime by the player (or any perp). Perception runs immediately. */
  crime(kind: CrimeKind, o: { perp?: string; at?: V3; victim?: string; noise?: number; visible?: boolean } = {}): Crime | null {
    const perp = o.perp ?? this.player?.id; if (!perp) return null;
    const actor = this.actors.get(perp);
    const at = o.at ?? actor?.pos() ?? [0, 0, 0];
    const c: Crime = { id: this.crimeSeq++, kind, perp, at: [at[0], at[1], at[2]], time: this.time, noise: o.noise, victim: o.victim, visible: o.visible ?? true };
    if (perp === this.player?.id) {
      const app = this.appearance();
      const ev = this.reg.lead(this.player.lead).evasion;
      const ws = this.witnesses.crime(c, { ...app, evasion: ev, pos: [at[0], at[1] + 1.2, at[2]] });
      const saw = this.policeSys.witnessedByUnit(kind, this.suspect()!, c.at);
      if (!saw && radiusOfCrime(c) > 30) this.policeSys.heard(c.at, radiusOfCrime(c) * 0.8);
      if (ws.length) this.emit('crimeWitnessed', { crime: c, witnesses: ws.map((w) => ({ ped: w.ped, saw: w.saw })) });
    }
    // gunfire scatters the street (sim flee)
    if (kind === 'shots_fired' || kind === 'shooting' || kind === 'homicide') this.sim?.emit({ type: 'threat', x: at[0], z: at[2], radius: (o.noise ?? 60) * 0.6 });
    return c;
  }

  // ------------------------------------------------------------------ time (TIME.md)
  /** Engine clock feed (minutes since midnight, game day, temperature). */
  setClock(c: { day?: number; minutes?: number; tempF?: number; heatwave?: boolean; date?: string }) {
    this.clock.setClock(c); if (c.tempF !== undefined) this.pc.tempF = c.tempF;
    this.outcomes.day = this.clock.clock.day; this.shops.clock = () => this.clock.clock.minutes;
  }
  canSleep(): CantSleep {
    if (this.clock.inMission) return 'mission';
    const ph = this.player ? this.policeSys.phase(this.player.id) : 'none';
    if (ph === 'pursuit' || ph === 'spotted') return 'pursuit';
    if (ph === 'lost' || ph === 'searching') return 'police';
    if (!this.pc.atHome) return 'notHome';
    return null;
  }
  /** Buy a home upgrade for the active lead's place. AC improves rest in the heatwave; the safe and lock are kept for home-security hooks. */
  buyHomeUpgrade(u: 'ac' | 'safe' | 'lock') {
    if (!this.player) return false;
    const li = this.inv.ensure(this.player.lead);
    if (li.home.has(u) || !this.inv.spend(this.player.lead, HOME_UPGRADES[u], `home:${u}`)) return false;
    li.home.add(u); return true;
  }
  /** Sleep in your bed until `hour` (7 morning, 19 evening, or any). Restores, clears injury carry-over, autosaves, advances the world. */
  sleep(hour: number, o: { hasAC?: boolean } = {}): { ok: boolean; reason?: CantSleep; hours?: number; quality?: number } {
    const why = this.canSleep(); if (why) return { ok: false, reason: why };
    const hours = this.clock.until(hour) / 60;
    const q = restQuality(this.clock.clock.heatwave, o.hasAC ?? (!!this.player && this.inv.ensure(this.player.lead).home.has('ac')));
    this.passTime(hours, 'sleep');
    if (this.player) {
      const id = this.player.id, li = this.inv.ensure(this.player.lead);
      this.healthSys.clearPenalty(id);
      this.healthSys.treat(id, { stopBleeding: true, wearRelief: 0.6 * q, heal: 999 * q });
      li.stamina.value = li.stamina.max * q; li.stamina.exhausted = false;
      this.clock.emit('rested', { lead: this.player.lead, quality: q });
    }
    this.clock.emit('autosave', { reason: 'sleep', day: this.clock.clock.day });
    return { ok: true, hours, quality: q };
  }
  /** Wait 1–2 h at a diner counter, bench or lobby: no save, no healing. Not with police searching or in pursuit. */
  wait(hours: number) {
    const why = this.canSleep(); if (why && why !== 'notHome') return { ok: false, reason: why };
    this.passTime(Math.max(0.25, Math.min(2, hours)), 'wait');
    return { ok: true };
  }
  /** Shared world advance for any skipped time (sleep, wait, custody, hospital). */
  passTime(hours: number, how: 'sleep' | 'wait' | 'custody' | 'hospital' | 'mission') {
    const secs = hours * 3600;
    this.policeSys.elapse(secs, how === 'sleep' || how === 'custody' ? 2 : 1);
    this.props.update(secs, [1e9, 1e9]);
    if (how !== 'wait' || this.clock.clock.minutes + hours * 60 >= 24 * 60) this.shops.restock();
    this.clock.advance(hours, how);
    this.outcomes.day = this.clock.clock.day;
  }

  // ------------------------------------------------------------------ fast travel
  // ------------------------------------------------------------------ sim services: responders and the real cab ride
  private simLike: SimLike | null = null;
  /** The cab the player called or is riding: board point for the meter, destination. */
  cab: { id: number; state: 'called' | 'ready' | 'riding'; kerb?: [number, number]; from?: [number, number]; dest?: [number, number] } | null = null;
  private bindSimServices(sim: SimLike) {
    // engines for fires; an ambulance for a shooting or a stabbing once someone has called it in
    this.fire.on('engines', (e: any) => sim.dispatch?.('fire', e.at[0], e.at[1]));
    this.policeSys.on('reportFiled', ({ report: r }) => {
      if (!r.kinds.some((k) => HURT_KINDS.has(k))) return;
      const [x, z] = r.crimeAt;
      if (this.ambulanceAt.some((q) => Math.hypot(q[0] - x, q[1] - z) < 80)) return; // one bus per scene
      this.ambulanceAt.push([x, z]); if (this.ambulanceAt.length > 8) this.ambulanceAt.shift();
      sim.dispatch?.('ambulance', x, z);
    });
    for (const k of ['dispatched', 'responderArrived', 'responderLeft'] as const) sim.on(k, (e) => this.emit('notice', { kind: k, ...e }));
    sim.on('cabReady', (e) => { const c = this.cab; if (c && c.id === e.cabId) { c.state = 'ready'; c.kerb = [e.x, e.z]; this.emit('cab', { kind: 'ready', ...e }); } });
    sim.on('cabTurnAhead', (e) => { if (this.cab?.id === e.cabId) this.emit('cab', { kind: 'turn', ...e }); });
    sim.on('cabGaveUp', (e) => { if (this.cab?.id === e.cabId) { this.cab = null; this.emit('cab', { kind: 'gaveUp', ...e }); } });
    sim.on('cabRideArrived', (e) => { if (this.cab?.id === e.cabId) this.arriveCab(e.x, e.z); });
  }
  private ambulanceAt: [number, number][] = [];
  /** Phone or whistle for a cab (sim picks the free cab with the shortest legal drive). False when no sim cab or none free. */
  hailCab() {
    if (!this.player || !this.simLike?.callCab || this.cab) return false;
    const p = this.player.position(); const id = this.simLike.callCab(p[0], p[2]);
    if (id < 0) return false;
    this.cab = { id, state: 'called' }; this.emit('cab', { kind: 'called', cabId: id }); return true;
  }
  /** Get in and give the address. The meter runs from here; the fare is paid on arrival. */
  boardCab(x: number, z: number) {
    if (!this.player || !this.cab || this.cab.state !== 'ready' || !this.simLike?.boardCab) return false;
    const p = this.player.position();
    if (!this.simLike.boardCab(this.cab.id, { x, z })) return false;
    Object.assign(this.cab, { state: 'riding', from: [p[0], p[2]], dest: [x, z] });
    this.setContext({ vehicle: { id: `cab:${this.cab.id}`, kind: 'cab', seat: 'passenger' } as any });
    this.emit('cab', { kind: 'boarded', cabId: this.cab.id }); return true;
  }
  /** Get out early (or on arrival): pay the meter for the distance driven. Stiffing the cabbie is a witnessed fare_evasion. */
  leaveCabNow() { if (this.cab?.state === 'riding' && this.player) { const p = this.player.position(); this.arriveCab(p[0], p[2]); } else if (this.cab) { this.simLike?.leaveCab?.(this.cab.id); this.cab = null; } }
  private arriveCab(x: number, z: number) {
    const c = this.cab!; const from = c.from ?? [x, z]; const lead = this.player!.lead;
    const fare = cabFare(Math.abs(x - from[0]) + Math.abs(z - from[1])), tip = cabTip(fare);
    const tipped = this.inv.spend(lead, fare + tip, 'cab'); const paid = tipped || this.inv.spend(lead, fare, 'cab');
    this.setContext({ vehicle: null });
    if (!paid) this.crime('fare_evasion', { noise: 25 });
    this.simLike?.leaveCab?.(c.id); this.cab = null;
    this.emit('cab', { kind: 'arrived', cabId: c.id, fare, tip: tipped ? tip : 0, paid, x, z });
  }
  /** Ride a cab to (x,z): pay the meter + tip, advance the clock by the ride (the engine teleports or plays it). */
  cabTo(x: number, z: number, skip = true) {
    if (!this.player) return null;
    const p = this.player.position(), meters = Math.abs(x - p[0]) + Math.abs(z - p[2]);
    const fare = cabFare(meters), total = fare + cabTip(fare);
    if (!this.inv.spend(this.player.lead, total, 'cab')) return { ok: false as const, reason: 'broke' as const, fare };
    const minutes = rideMinutes(p[0], p[2], x, z);
    if (skip) this.passTime(minutes / 60, 'wait');
    return { ok: true as const, fare, tip: total - fare, minutes };
  }
  /** Through the turnstile: a token, or jump it (a crime if the token clerk or a transit cop sees). */
  enterSubway(jump = false) {
    if (!this.player) return false;
    if (!jump && !this.inv.spend(this.player.lead, TOKEN, 'token')) return false;
    if (jump) this.crime('fare_evasion', { noise: 10 });
    this.setContext({ subway: true });
    return true;
  }
  /** Ride to a station at (x,z) and come up: contact with the police is broken; the clock moves on. */
  rideSubwayTo(x: number, z: number) {
    if (!this.player || !this.pc.subway) return null;
    const p = this.player.position(), minutes = rideMinutes(p[0], p[2], x, z, SUBWAY_KMH) + 4;
    this.passTime(minutes / 60, 'wait');
    for (const u of this.policeSys.units.values()) if (['pursuit', 'approach', 'encounter', 'suspicious'].includes(u.state)) { u.state = 'search'; u.lostFor = 99; u.recog = 0; }
    this.setContext({ subway: false });
    return { minutes };
  }

  // ------------------------------------------------------------------ one context button (TOUCH_CONTROLS.md)
  /** What the single context button would do right now, highest priority first. The UI shows `label`. */
  contextAction(): { kind: 'surrender' | 'payOff' | 'pickUp' | 'enterVehicle' | 'exitVehicle' | 'answerPhone' | 'usePhone' | 'openHydrant' | 'takedown' | 'cover' | 'leaveCover' | 'talk' | 'door'; label: string; target?: string } | null {
    if (!this.player) return null;
    const p = this.player.position();
    const enc = [...this.policeSys.units.values()].find((u) => u.state === 'encounter' && Math.hypot(u.x - p[0], u.z - p[2]) < 6);
    if (enc) return this.inv.ensure(this.player.lead).money >= 1000 && enc.corrupt !== undefined ? { kind: 'payOff', label: 'Pay off', target: enc.id } : { kind: 'surrender', label: 'Hands up', target: enc.id };
    if (this.pc.vehicle) return { kind: 'exitVehicle', label: 'Get out' };
    for (const a of this.ai.agents.values()) if (!a.alive && a.gun && !a.looted && Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]) < 2.5) return { kind: 'pickUp', label: `Pick up ${this.shortName(a.gun.def.id)}`, target: a.id };
    for (const a of this.ai.agents.values()) if (this.ai.unaware(a.id) && Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]) < 1.4) return { kind: 'takedown', label: 'Takedown', target: a.id };
    const ring = this.phones.pending.find((c) => c.ringing); if (ring) { const ph = this.phones.phones.get(ring.ringing!); if (ph && Math.hypot(ph.x - p[0], ph.z - p[2]) < 3) return { kind: 'answerPhone', label: 'Answer', target: ph.id }; }
    for (const c of this.cars.cars.values()) if (Math.hypot(c.x - p[0], c.z - p[2]) < 3) { const m = this.cars.methods(c.id, this.player.lead); if (m.length) return { kind: 'enterVehicle', label: m[0] === 'keys' || m[0] === 'unlocked' ? 'Get in' : m[0] === 'carjack' ? 'Carjack' : 'Steal car', target: c.id }; }
    const ph = this.phones.nearest(p[0], p[2], 2.5); if (ph) return { kind: 'usePhone', label: 'Phone 10¢', target: ph.id };
    if (this.reg.weapon(this.pc.weapon).family === 'blunt') for (const pr of this.props.list.values()) if (pr.type === 'hydrant' && !this.props.isBroken(pr.id) && Math.hypot(pr.x - p[0], pr.z - p[2]) < 1.6) return { kind: 'openHydrant', label: 'Open hydrant', target: pr.id };
    const t = this.nearestTalkable(p[0], p[2]);
    if (t && !t.ped) return { kind: 'talk', label: `Talk`, target: t.id };
    const d = this.nearestDoor(p[0], p[2]);
    if (d) return { kind: 'door', label: d.locked ? (this.doorOpenNow(d) ? 'Knock' : 'Locked') : 'Go in', target: d.id };
    if (this.pc.cover) return { kind: 'leaveCover', label: 'Leave cover' };
    if (this.cover.near(p[0], p[2], null, 2)) return { kind: 'cover', label: 'Take cover' };
    if (t) return { kind: 'talk', label: 'Talk', target: t.id };
    return null;
  }
  /** Do the context action (the bribe amount for payOff is the cop's expected price; the UI may offer more). */
  doContextAction(moveDir: [number, number] | null = null) {
    const a = this.contextAction(); if (!a || !this.player) return null;
    switch (a.kind) {
      case 'surrender': this.surrender(true); break;
      case 'payOff': { const r = this.policeSys.reportFor(this.player.id); this.bribe(a.target!, expectedBribeOf(r?.heat ?? 1)); break; }
      case 'pickUp': this.loot(); break;
      case 'takedown': this.takedown(); break;
      case 'answerPhone': this.phones.answer(this.player.lead, a.target!); break;
      case 'enterVehicle': { const m = this.cars.methods(a.target!, this.player.lead)[0]; this.enterCar(a.target!, m); break; }
      case 'exitVehicle': this.exitCar(); break;
      case 'usePhone': this.phones.place(this.player.lead, a.target!, 'service'); break;
      case 'openHydrant': this.openHydrant(); break;
      case 'cover': case 'leaveCover': this.toggleCover(moveDir); break;
      case 'door': { const d = this.nearestDoor(this.player.position()[0], this.player.position()[2]); if (d && !d.locked) this.doors?.open?.(d.id); this.emit('notice', { kind: 'door', id: a.target, locked: d?.locked ?? false }); break; }
      case 'talk': {
        if (this.talkers && this.talkers.nearestTalkable(this.player.position()[0], this.player.position()[2], 2)?.id === a.target) this.talkers.talk(a.target!);
        else { this.port.command(a.target!, { type: 'face', x: this.player.position()[0], z: this.player.position()[2] }); this.emit('bark', { who: a.target, line: 'greet' }); }
        break;
      }
    }
    return a;
  }

  /** Mission "lose the police" gate: no open report on the player and no unit with eyes on / closing on them. */
  heatClear(): boolean {
    const id = this.player?.id; if (!id) return true;
    if (this.policeSys.reports.some((r) => r.perp === id)) return false;
    for (const u of this.policeSys.units.values()) if (['pursuit', 'approach', 'encounter', 'suspicious', 'combat'].includes(u.state)) return false;
    return true;
  }
  setEssential(id: string, on = true) { if (on) this.essential.add(id); else this.essential.delete(id); }

  // ------------------------------------------------------------------ frame
  private ctxTimer = 0; private ctxKey = '';
  // ------------------------------------------------------------------ UiHost.touch helpers (UI chat, claude/ui-cinematics 425f04e)
  private lastThreatAt = -1e9; private lastGun = '';
  /** Short display name for button labels: "Pick up .38" rather than the full model name. */
  private shortName(weaponId: string) { const w = this.reg.weapon(weaponId); const cal = w.ammo?.replace(/^item\.ammo_/, ''); return cal ? (/^\d/.test(cal) && !cal.includes('ga') && cal.length <= 2 ? '.' + cal : cal) : w.name.split(' ').at(-1)!.toLowerCase(); }
  /** Which control set the touch layer shows. "Under fire" = shot at or hit in the last 6 s, or a hostile in sight within 35 m. */
  touchMode(): 'combat' | 'drive' | 'foot' {
    if (this.pc.vehicle) return 'drive';
    if (this.pc.weapon !== 'weapon.fists' || this.time - this.lastThreatAt < 6) return 'combat';
    if (this.player) { const p = this.player.position(); if (this.aimTargets().some((t) => t.hostile && t.alive && t.visible && Math.hypot(t.chest[0] - p[0], t.chest[2] - p[2]) < 35)) return 'combat'; }
    return 'foot';
  }
  /** The player owns a weapon other than fists. */
  armed() { return !!this.player && this.inv.weapons(this.player.lead).some((w) => w !== 'weapon.fists'); }
  /** For the weapon wheel: owned weapons with rounds loaded/reserve. */
  weaponList() {
    if (!this.player) return [];
    const lead = this.player.lead;
    return this.inv.weapons(lead).map((id) => { const w = this.reg.weapon(id); return { id, name: w.name, short: this.shortName(id), loaded: this.inv.ensure(lead).loaded.get(id) ?? 0, reserve: this.inv.reserve(lead, id), equipped: id === this.pc.weapon }; });
  }
  /** Swipe on the reload button: next/previous owned weapon (fists included). */
  swapWeapon(dir: 1 | -1) {
    if (!this.player) return null;
    const ws = this.inv.weapons(this.player.lead); if (!ws.length) return null;
    const i = Math.max(0, ws.indexOf(this.pc.weapon)); const next = ws[(i + dir + ws.length) % ws.length];
    this.equip(next); if (next !== 'weapon.fists') this.lastGun = next; return next;
  }
  /** Tap: draw the last weapon used (or the first owned), or put it away. */
  drawWeapon() {
    if (!this.player) return null;
    if (this.pc.weapon !== 'weapon.fists') { this.lastGun = this.pc.weapon; this.holster(); return 'weapon.fists'; }
    const ws = this.inv.weapons(this.player.lead).filter((w) => w !== 'weapon.fists');
    const pick = ws.includes(this.lastGun) ? this.lastGun : ws[0]; if (!pick) return null;
    this.equip(pick); return pick;
  }
  coverLabel(): 'Cover' | 'Leave' | 'Roll' {
    if (this.pc.cover) return 'Leave';
    if (this.player) { const p = this.player.position(); if (this.cover.near(p[0], p[2], null, 2)) return 'Cover'; }
    return 'Roll';
  }
  /** One button: take or leave cover when there is some, otherwise a dodge roll in moveDir (backwards if none). */
  coverOrRoll(moveDir: [number, number] | null) {
    const l = this.coverLabel();
    if (l === 'Roll') return this.dodge(moveDir ?? [0, 1]) ? 'Roll' : null;
    this.toggleCover(moveDir); return l;
  }
  /** Swipe on the lock reticle: +1 right / −1 left (same as cycleLock). */
  swipeLock(dir: 1 | -1) { return this.cycleLock(dir); }
  update(dt: number) {
    const T0 = now();
    this.time += dt;
    const p = this.player;
    // register sim peds as hittable bodies
    for (const q of this.port.peds()) if (q.alive) this.ensurePed(q);
    // player gun timers and firing
    const ct0 = now();
    if (p) this.updatePlayer(dt, p);
    // AI
    this.cover.rebuild();
    this.ai.update(dt, { world: this.world, cover: this.cover, health: this.healthSys, melee: this.melee, targets: this.combatTargets(), walkable: (ax, az, bx, bz) => !this.world.blocked(ax, az, bx, bz, this.world.ground(ax, az) + 0.5) });
    // sync police units that are fighting
    for (const u of this.policeSys.units.values()) { const a = this.ai.agents.get(u.id); if (a && u.state === 'combat') { u.x = a.pos[0]; u.z = a.pos[2]; u.yaw = a.yaw; } }
    this.melee.update(dt);
    // shots: resolve the whole frame's batch
    const bt = now();
    this.lastShots = this.pendingShots.length ? resolveShots(this.pendingShots, this.hitboxes(), this.world, this.tyres) : [];
    this.pendingShots = [];
    this.timings.ballisticsMs = now() - bt;
    for (const r of this.lastShots) this.applyShot(r);
    this.healthSys.update(dt);
    this.timings.combatMs = now() - ct0;
    // police + witnesses
    const pt0 = now();
    const s = this.suspect();
    const perps = new Map<string, { pos: V3; appearance: Appearance; evasion: number }>();
    if (s && p) perps.set(s.id, { pos: [s.pos[0], s.pos[1] + 1.2, s.pos[2]], appearance: s.appearance, evasion: this.reg.lead(p.lead).evasion });
    this.witnesses.update(dt, perps, (r) => this.policeSys.file(r));
    this.policeSys.update(dt, s ? [s] : []);
    this.timings.policeMs = now() - pt0;
    // props, phones
    const pp = p?.position() ?? [0, 0, 0];
    if (p && this.lastPos) { const d = Math.hypot(pp[0] - this.lastPos[0], pp[2] - this.lastPos[2]); if (d < 50) this.stats.add(p.lead, this.pc.vehicle ? 'distanceDriven' : 'distanceOnFoot', d); }
    this.lastPos = [pp[0], pp[1], pp[2]];
    this.props.update(dt, [pp[0], pp[2]]);
    this.cars.update(dt);
    this.updateFire(dt);
    if (this.pc.vehicle && this.player) { const c = this.cars.cars.get(this.pc.vehicle.id); if (c) { c.x = pp[0]; c.z = pp[2]; } }
    if (p) this.phones.update(dt, p.lead, pp[0], pp[2], this.busy());
    for (const d of [...this.pendingDiscoveries]) if (this.time >= d.at) {
      this.pendingDiscoveries.splice(this.pendingDiscoveries.indexOf(d), 1);
      this.policeSys.file({ witness: 'radio', perp: d.perp, kinds: ['officer_down'], desc: { clothes: [] }, lastKnown: d.where, crimeAt: d.where, via: 'unit', time: this.time });
    }
    const clear = this.heatClear();
    if (clear && !this.wasClear) this.emit('cleared', { at: this.time });
    this.wasClear = clear;
    // the context button's label changes at most 4×/s; UI listens for 'context' instead of polling
    if ((this.ctxTimer -= dt) <= 0) { this.ctxTimer = 0.25; const c = this.contextAction(); const k = c ? c.kind + ':' + (c.target ?? '') : ''; if (k !== this.ctxKey) { this.ctxKey = k; this.emit('context', c ?? { kind: null }); } }
    this.timings.totalMs = now() - T0;
  }

  private updatePlayer(dt: number, p: PlayerBinding) {
    const lead = p.lead;
    // touch auto-fire: on a locked, visible target with a gun out, it fires by itself (TOUCH_CONTROLS.md)
    if (this.pc.device === 'touch' && this.pc.fireMode === 'auto' && this.aimer.locked && this.currentGun() && !this.pc.surrendered) {
      const t = this.aimTargets().find((x) => x.id === this.aimer.locked);
      this.pc.firing = !!t && t.visible && t.alive;
    }
    // stamina and fitness
    const li = this.inv.ensure(lead);
    const mode = this.pc.sprinting ? 'sprint' : this.pc.speed > 2.5 ? 'run' : this.pc.speed > 0.3 ? 'walk' : 'idle';
    if (!stepStamina(li.stamina, dt, mode, this.pc.tempF, this.pc.unlimitedSprint)) this.pc.sprinting = false;
    if (mode === 'sprint') learn(li.skills, 'sprintSecond', dt);
    if (li.intox > 0) li.intox = Math.max(0, li.intox - SOBER_PER_S * dt);
    if (this.pc.jamClear > 0) { this.pc.jamClear -= dt; if (this.pc.jamClear <= 0) { const gs = this.gunState(); if (gs) gs.jammed = false; this.emit('notice', { kind: 'jamCleared' }); } }
    const fx = this.healthSys.effects(p.id);
    const g = this.currentGun();
    if (g) {
      const ev = g.update(dt, (n) => this.inv.takeRounds(lead, g.def.id, n));
      if (ev) { this.inv.ensure(lead).loaded.set(g.def.id, g.loaded); this.emit('notice', { kind: ev === 'reloaded' ? 'reloaded' : 'round' }); }
      if (g.empty && this.pc.firing && !g.reloading) this.reload();
      if (this.pc.firing && g.canFire && !this.pc.surrendered) {
        const a = p.aim();
        let dir: V3 = a.dir, origin: V3 = a.origin;
        if (this.pc.device === 'touch') { const ld = this.aimer.lockedDir(origin, this.aimTargets()); if (ld) dir = ld; }
        // from a car: drive-by weapons only, out of the side windows (30°–150° off the nose either side)
        if (this.pc.vehicle) {
          if (!g.def.driveBy) { this.pc.firing = false; this.emit('notice', { kind: 'noDriveBy', weapon: g.def.id }); return; }
          const off = Math.abs(wrapAngle(Math.atan2(-dir[0], -dir[2]) - this.pc.vehicleYaw));
          if (off < DRIVEBY_ARC[0] || off > DRIVEBY_ARC[1]) return;
        }
        const inCover = !!this.pc.cover && !this.pc.peek;
        const blind = inCover && this.pc.blind;
        if (inCover && !blind) return; // must peek or blind-fire from cover
        if (blind) origin = [origin[0], this.pc.cover!.y + (this.pc.cover!.height === 'low' ? 1.25 : 1.7), origin[2]];
        const gs = this.gunState();
        if (this.pc.jamClear > 0) return;
        if (gs && !rollShot(gs, this.rng, this.pc.raining)) { this.pc.firing = false; g.cooldown = g.def.interval; this.emit('notice', { kind: 'jammed', weapon: g.def.id }); this.emit('shot', { shooter: p.id, weapon: g.def.id, origin, dir, player: true, jammed: true }); return; }
        const drunk = this.inv.ensure(lead).intox;
        const rays = g.fire({ origin, dir, aiming: this.pc.aiming, moveFrac: Math.min(1, this.pc.speed / 3.4), mods: { ...this.mods(), swayDeg: fx.swayDeg + drunk * 3, aimMul: (1 + drunk * 0.8) * this.mods().aimMul * fx.aimMul * (this.pc.vehicle ? DRIVEBY_SPREAD : 1) }, blind, rng: this.rng });
        for (const r of rays) this.pendingShots.push({ shooter: p.id, ray: r });
        this.inv.ensure(lead).loaded.set(g.def.id, g.loaded);
        this.emit('shot', { shooter: p.id, weapon: g.def.id, origin, dir, player: true, blind });
        if (this.time - this.lastShotsCrime > 3) { this.lastShotsCrime = this.time; this.crime('shots_fired', { noise: g.def.noise }); }
        if (!g.def.auto) this.pc.firing = false;
      }
    }
    // visible weapons (in hand, or too big for the outfit) and aiming in the street are menacing (rate limited)
    const cc = this.concealment();
    const shows = (this.pc.aiming && !!g) || (!!cc && cc.visible.some((w) => this.reg.weapon(w).class !== 'melee' || w !== 'weapon.fists'));
    if (shows && !this.pc.indoors && this.time - this.lastMenace > 8) {
      const pp = p.position();
      // pointing it at people is menacing; just having it on show is a gun seen
      for (const q of this.port.peds()) if (q.alive && Math.hypot(q.x - pp[0], q.z - pp[2]) < 10) { this.lastMenace = this.time; this.crime(this.pc.aiming ? 'menacing' : 'weapon_seen', { victim: q.id }); break; }
    }
    // keep the player's melee fighter in sync
    this.syncPlayerFighter();
  }

  private applyShot(r: ShotResult) {
    const shooter = this.actors.get(r.shooter);
    const byPlayer = r.shooter === this.player?.id;
    for (const h of r.actorHits) {
      const target = this.actors.get(h.actorId);
      if (byPlayer && this.player) learn(this.inv.ensure(this.player.lead).skills, h.region === 'head' ? 'headshot' : 'shotHit');
      const res = this.applyDamage(h.actorId, { amount: h.damage, region: h.region, source: r.shooter, type: 'bullet', power: r.shot.power });
      if (h.actorId === this.player?.id) this.lastThreatAt = this.time;
      this.emit('hit', { target: h.actorId, region: h.region, damage: res?.dealt ?? 0, point: h.point, shooter: r.shooter, killed: res?.killed, through: h.through });
      if (byPlayer && target) {
        const kind: CrimeKind = target.kind === 'cop' || this.policeSys.units.has(target.id) ? (res?.killed ? 'officer_down' : 'assault_officer') : res?.killed ? 'homicide' : 'shooting';
        this.crime(kind, { victim: target.id, noise: this.reg.weapon(r.shot.weapon).noise });
      }
    }
    for (const n of r.nearMiss) { this.ai.suppress(n.actorId, 1); if (n.actorId === this.player?.id) { this.lastThreatAt = this.time; this.emit('notice', { kind: 'nearMiss', dist: n.dist }); } }
    for (const s of r.surfaces) {
      this.emit('impact', { point: s.point, material: s.material, id: s.id, penetrated: s.penetrated, weapon: r.shot.weapon });
      if (this.props.get(s.id)) this.damageProp(s.id, r.shot.damage, 'bullet', r.shooter);
      // rounds into cover next to someone suppress them
      for (const a of this.ai.agents.values()) if (a.alive && Math.hypot(a.pos[0] - s.point[0], a.pos[2] - s.point[2]) < 1.5) this.ai.suppress(a.id, 0.6);
    }
    for (const t of r.tyres) this.emit('tyreShot', { vehicleId: t.vehicleId, wheel: t.wheel, shooter: r.shooter });
    void shooter;
  }

  private applyDamage(id: string, d: { amount: number; region?: string; source?: string; type: DamageType; bleed?: number; power?: number }) {
    const before = this.healthSys.state(id);
    if (!before || before.dead) return null;
    if (id === this.ringOpponent && before.hp - d.amount * 1.5 <= 0) d = { ...d, amount: Math.max(0, (before.hp - 5) / 1.5) }; // never lethal in the ring
    const res = this.healthSys.damage(id, { ...d, region: d.region as Region | undefined });
    const src = d.source ? this.actors.get(d.source) : null;
    const sp = src?.pos();
    this.ai.onDamaged(id, res.dealt, before.maxHp, sp ? [sp[0], sp[2]] : null, d.source ?? null);
    // cops shot at by the player become combatants
    const u = this.policeSys.units.get(id);
    if (u && d.source === this.player?.id && u.state !== 'combat' && !res.killed) this.copEngage(u.id);
    return res;
  }

  private damageProp(id: string, amount: number, cause: 'bullet' | 'melee' | 'impact', by: string | null) {
    this.props.damage(id, amount, cause, by);
  }

  // ------------------------------------------------------------------ wiring
  private wire() {
    this.healthSys.on('died', (e) => {
      const a = this.actors.get(e.id);
      if (e.id === this.player?.id) {
        const p = this.player.position();
        this.cover.release(e.id); this.pc.cover = null; this.aimer.release();
        this.outcomes.wasted(this.player.lead, [p[0], p[2]], e.source, this.player.id);
        return;
      }
      this.ai.onDied(e.id);
      const u = this.policeSys.units.get(e.id); if (u) u.state = 'down';
      if (a?.kind === 'cop' || u) {
        const at = a?.pos() ?? [u!.x, 0, u!.z];
        this.emit('copKilled', { id: e.id, by: e.source, at, precinct: u?.precinct ?? null });
        // a downed officer is always found: his radio goes quiet. Unwitnessed, the report has no description.
        if (e.source) this.pendingDiscoveries.push({ at: this.time + RADIO_SILENCE, perp: e.source, where: [at[0], at[2]] });
      }
      if (this.essential.has(e.id)) this.emit('essentialKilled', { id: e.id, by: e.source, reason: `${e.id} was killed` });
      if (a?.kind === 'ped') this.port.command(e.id, { type: 'anim', name: 'die' });
      this.melee.remove(e.id);
    });
    this.healthSys.on('injured', (e) => this.emit('notice', { kind: 'injured', ...e }));
    this.melee.on('hit', (h) => {
      const t = this.actors.get(h.target);
      const res = this.applyDamage(h.target, { amount: h.damage, region: h.region, source: h.attacker, type: 'melee', bleed: h.bleed });
      this.emit('hit', { target: h.target, region: h.region, damage: res?.dealt ?? 0, melee: h.kind, blocked: h.blocked, counter: h.counter, shooter: h.attacker, killed: res?.killed });
      this.emit('melee', { ...h, attack: h.kind, kind: 'hit' });
      if (h.attacker === this.player?.id && t && !h.blocked && !this.sanctioned) {
        const armed = this.reg.weapon(this.pc.weapon).class === 'melee' && this.pc.weapon !== 'weapon.fists';
        this.crime(t.kind === 'cop' ? 'assault_officer' : res?.killed ? 'homicide' : armed ? 'assault_weapon' : 'assault', { victim: t.id });
        if (t.kind === 'ped') this.port.command(t.id, { type: 'flee', fromX: this.player!.position()[0], fromZ: this.player!.position()[2] });
      }
    });
    for (const k of ['windup', 'parried', 'guardBroken', 'stagger', 'knockdown', 'dodge', 'grab', 'release', 'whiff'] as const) this.melee.on(k, (e: any) => this.emit('melee', { ...e, attack: e.kind, kind: k }));
    this.melee.on('slam', (e) => { if (this.props.get(e.surface)) this.damageProp(e.surface, e.damage * 2, 'melee', e.attacker); this.emit('melee', { kind: 'slam', ...e }); });
    this.melee.on('weaponBroken', (e) => { if (e.id === this.player?.id) { const item = this.reg.itemForWeapon(e.weapon); if (item) this.inv.take(this.player.lead, item.id); this.equip('weapon.fists'); } this.emit('melee', { kind: 'weaponBroken', ...e }); });
    this.ai.on('fire', (e) => {
      const rays = e.gun.fire({ origin: e.origin, dir: e.dir, aiming: true, moveFrac: 0, mods: NEUTRAL_MODS, rng: this.rng });
      for (const r of rays) this.pendingShots.push({ shooter: e.id, ray: r });
      this.emit('shot', { shooter: e.id, weapon: e.gun.def.id, origin: e.origin, dir: e.dir, player: false });
    });
    this.ai.on('bark', (e) => this.emit('bark', e));
    this.ai.on('surrendered', (e) => this.emit('notice', { kind: 'surrendered', id: e.id }));
    this.ai.on('fled', (e) => this.emit('notice', { kind: 'fled', id: e.id }));
    this.props.on('broken', (e) => {
      this.emit('propBroken', e);
      if (e.type === 'call_box' || e.type === 'phone_booth') { this.witnesses.setBroken(e.id, true); this.phones.setBroken(e.id, true); }
      if (e.by === this.player?.id) this.crime(e.type === 'storefront_glass' ? 'vandalism' : 'vandalism', { at: e.at, noise: e.type === 'storefront_glass' ? 60 : e.type === 'hydrant' ? 45 : undefined });
      const b = this.world.get(e.id); if (b && (e.type === 'storefront_glass' || e.type === 'trash_can')) b.enabled = false;
    });
    this.props.on('reset', (e) => { const b = this.world.get(e.id); if (b) b.enabled = true; if (e.type === 'call_box' || e.type === 'phone_booth') { this.witnesses.setBroken(e.id, false); this.phones.setBroken(e.id, false); } });
    this.props.on('geyser', (e) => this.emit('geyser', e));
    for (const k of ['ignited', 'spread', 'out', 'engines'] as const) this.fire.on(k, (e: any) => this.emit('fire', { kind: k, ...e }));
    for (const k of ['bought', 'sold', 'ticket', 'booted', 'towed', 'released'] as const) this.ownership.on(k, (e: any) => this.emit('notice', { kind: `car_${k}`, ...e }));
    this.props.on('coins', (e) => { if (this.player) { this.inv.addMoney(this.player.lead, e.cents, 'coins'); this.emit('pickup', { kind: 'coins', ...e }); } });
    this.witnesses.on('witnessed', (e) => this.emit('witness', { kind: 'witnessed', ...e }));
    this.witnesses.on('heading', (e) => this.emit('witness', { kind: 'heading', ...e }));
    this.witnesses.on('calling', (e) => this.emit('witness', { kind: 'calling', ...e }));
    this.witnesses.on('silenced', (e) => this.emit('witness', { kind: 'silenced', ...e }));
    this.witnesses.on('panicked', (e) => this.emit('witness', { kind: 'panicked', ...e }));
    this.policeSys.on('reportFiled', (e) => this.emit('reportFiled', { precinct: e.report.precinct, severity: e.report.heat, description: e.report.description, lastKnown: e.report.lastKnown, via: e.via, merged: e.merged, id: e.report.id }));
    this.policeSys.on('radio', (e) => this.emit('radio', e));
    this.policeSys.on('dispatched', (e) => { this.registerCop(e.unit.id); this.emit('police', { kind: 'dispatched', unit: e.unit.id, unitKind: e.unit.kind, report: e.report.id }); });
    for (const k of ['spotted', 'stop', 'pursuit', 'lost', 'bribe', 'roadblock', 'standDown', 'cleared', 'investigate', 'checkInterior'] as const) this.policeSys.on(k, (e: any) => this.emit('police', { kind: k, ...e }));
    this.policeSys.on('engage', (e) => this.copEngage(e.unit));
    this.policeSys.on('arrested', (e) => {
      if (!this.player || e.suspect !== this.player.id) return;
      this.cover.release(e.suspect); this.pc.cover = null; this.pc.surrendered = false; this.aimer.release();
      this.outcomes.arrested(this.player.lead, e.precinct, e.heat, e.kinds);
    });
    this.cars.on('ownerReport', (e) => {
      const c = this.cars.cars.get(e.car); if (!c?.stolenBy) return;
      const perp = c.stolenBy === this.player?.lead ? this.player.id : c.stolenBy;
      this.policeSys.file({ witness: `owner:${e.car}`, perp, kinds: ['theft'], crimeIds: [-1000 - this.crimeSeq++], desc: { clothes: [], vehicle: { id: e.car, vclass: { v: e.vclass, c: 0.95 }, colour: { v: e.colour, c: 0.95 }, plate: { v: e.plate, c: 0.95 } } }, lastKnown: e.at, crimeAt: e.at, via: 'payphone', time: this.time });
      this.emit('police', { kind: 'carReported', car: e.car, plate: e.plate });
    });
    this.cars.on('stolen', (e) => this.emit('notice', { kind: 'stolen', ...e }));
    this.cars.on('driverReacts', (e) => { if (e.reaction === 'flee' || e.reaction === 'callbox') this.port.command(e.driver, { type: 'flee', fromX: this.player?.position()[0] ?? 0, fromZ: this.player?.position()[2] ?? 0 }); this.emit('notice', { kind: 'driverReacts', ...e }); });
    this.wireStats();
    this.outcomes.on('wasted', (e) => this.emit('wasted', e));
    this.outcomes.on('arrested', (e) => { this.equip('weapon.fists'); this.emit('arrested', e); });
    this.outcomes.on('released', (e) => this.emit('released', e));
    this.outcomes.on('propertyReturned', (e) => this.emit('notice', { kind: 'propertyReturned', ...e }));
    this.inv.on('money', (e) => this.emit('money', e));
    this.wardrobe.on('wear', (e) => this.emit('wear', e));
    this.phones.on('ring', (e) => this.emit('ring', e));
    for (const k of ['answered', 'placed', 'message', 'ringStop'] as const) this.phones.on(k, (e: any) => this.emit('call', { kind: k, ...e }));
  }

  private wireStats() {
    const L = () => this.player?.lead ?? '';
    const me = () => this.player?.id;
    this.bus.on('shot', (e) => { if (e.player && !e.jammed) this.stats.add(L(), 'shotsFired'); });
    this.bus.on('hit', (e) => { if (e.shooter !== me()) return; if (e.melee) this.stats.add(L(), 'meleeHits'); else { this.stats.add(L(), 'shotsHit'); if (e.region === 'head') this.stats.add(L(), 'headshots'); } if (e.killed) this.stats.add(L(), 'kills'); });
    this.bus.on('copKilled', (e) => { if (e.by === me()) this.stats.add(L(), 'copsKilled'); });
    this.bus.on('melee', (e) => { if (e.kind === 'parried' && e.defender === me()) this.stats.add(L(), 'parries'); if (e.kind === 'takedown' && !e.lethal) this.stats.add(L(), 'knockouts'); });
    this.bus.on('wasted', (e) => { this.stats.add(e.lead, 'timesWasted'); this.stats.add(e.lead, 'hospitalCents', e.paid); });
    this.bus.on('arrested', (e) => this.stats.add(e.lead, 'timesArrested'));
    this.bus.on('police', (e) => { if (e.kind === 'bribe') { if (e.result === 'accepted') { this.stats.add(L(), 'bribesPaid'); this.stats.add(L(), 'bribeCents', e.cents); } else this.stats.add(L(), 'bribesRefused'); } if (e.kind === 'lost') this.stats.add(L(), 'chasesEscaped'); });
    this.bus.on('witness', (e) => { if (e.kind === 'silenced') this.stats.add(L(), 'witnessesSilenced'); });
    this.bus.on('reportFiled', (e) => { if (!e.merged) this.stats.add(L(), 'reportsAgainst'); });
    this.bus.on('notice', (e) => { if (e.kind === 'stolen') this.stats.add(L(), 'carsStolen'); if (e.kind === 'car_bought') this.stats.add(e.lead, 'carsBought'); });
    this.bus.on('propBroken', (e) => { if (e.by === me()) { this.stats.add(L(), 'propsBroken'); if (e.type === 'hydrant') this.stats.add(L(), 'hydrantsOpened'); } });
    this.bus.on('fire', (e) => { if (e.kind === 'ignited' && e.fire.by === me() && e.fire.source === 'molotov') this.stats.add(L(), 'firesStarted'); });
    this.bus.on('money', (e) => this.stats.add(e.lead, e.delta > 0 ? 'moneyEarned' : 'moneySpent', Math.abs(e.delta)));
    this.bus.on('call', (e) => { if (e.kind === 'placed') this.stats.add(e.lead, 'phoneCalls'); });
    this.shops.on('outfitBought', (e) => this.stats.add(e.lead, 'outfitsBought'));
    this.clock.on('timeAdvanced', (e) => { if (e.how === 'sleep' && this.player) this.stats.add(this.player.lead, 'nightsSlept'); });
  }

  /** Cop units become physical: health, melee body and hit capsules. */
  registerCop(id: string) {
    if (this.actors.has(id)) return;
    const u = this.policeSys.units.get(id); if (!u) return;
    if (u.kind === 'helicopter') return;
    this.healthSys.register(id, { maxHp: 110 });
    const P = this.policeSys;
    this.actors.set(id, { id, kind: 'cop', team: 'police', pos: () => { const v = P.units.get(id); return v ? [v.x, this.world.ground(v.x, v.z), v.z] : [0, -100, 0]; }, yaw: () => P.units.get(id)?.yaw ?? 0, stance: () => 'stand', vehicleId: u.kind.endsWith('car') ? id : undefined });
    this.melee.add(id, { pos: [u.x, 0, u.z], yaw: u.yaw, weapon: this.reg.weapon('weapon.nightstick'), profile: { damage: 1, speed: 1, parryWindow: 0.12, dodgeIframes: 0.15, npc: true }, team: 'police' });
  }
  private copEngage(id: string) {
    const u = this.policeSys.units.get(id); if (!u || this.ai.agents.has(id)) return;
    this.registerCop(id);
    u.state = 'combat';
    const a = this.ai.spawn({ id, faction: 'police', squad: `pct:${u.precinct}`, pos: [u.x, this.world.ground(u.x, u.z), u.z], yaw: u.yaw, gun: this.reg.weapon('weapon.service'), melee: this.reg.weapon('weapon.nightstick'), ammo: 18 });
    if (this.player) this.ai.alert(id, [this.player.position()[0], this.player.position()[2]], this.player.id);
    // actor position now follows the AI body
    const act = this.actors.get(id); if (act) { act.pos = () => a.pos; act.yaw = () => a.yaw; }
  }

  registerPolice(kind: UnitKind, pct: string, x: number, z: number, o?: { corrupt?: number; investigator?: boolean }) {
    const u = this.policeSys.addUnit(kind, pct, x, z, o);
    this.registerCop(u.id);
    return u;
  }

  // ------------------------------------------------------------------ queries for UI, scene and engine
  currentGun(): Gun | null {
    const w = this.reg.weapon(this.pc.weapon);
    if (w.class === 'melee' || !this.player) return null;
    let g = this.guns.get(w.id);
    if (!g) { g = new Gun(w, this.inv.ensure(this.player.lead).loaded.get(w.id) ?? 0); this.guns.set(w.id, g); }
    return g;
  }
  meleeWeapon(): WeaponDef { const w = this.reg.weapon(this.pc.weapon); return w.class === 'melee' ? w : this.reg.weapon('weapon.fists'); }
  mods(): ShooterMods {
    if (!this.player) return NEUTRAL_MODS;
    const p = this.reg.lead(this.player.lead), fam = this.reg.weapon(this.pc.weapon).family;
    const t = TIERS[(this.gunState() ?? DEFAULT_GUN).tier], sk = skillFx(this.inv.ensure(this.player.lead).skills);
    return { aimMul: (p.aim[fam] ?? p.aim.default) * t.spread * sk.aimMul, recoilMul: p.recoilControl * t.recoil, reloadMul: p.reloadSpeed * t.reload, swayDeg: 0 };
  }
  profileOf(lead: string, npc: boolean): FighterProfile { const m = this.reg.lead(lead).melee; return { damage: m.damage, speed: m.speed, parryWindow: m.parryWindow, dodgeIframes: m.dodgeIframes, npc }; }
  private syncPlayerFighter() { if (!this.player) return; const f = this.melee.fighters.get(this.player.id); if (f) { f.pos = this.player.position(); f.yaw = yawOf(this.player.aim().dir); } }
  private playerStance(): 'stand' | 'crouch' | 'down' { const c = this.pc.cover; return (c && !this.pc.peek && c.height === 'low') || (this.pc.crouch && !this.pc.aiming) ? 'crouch' : 'stand'; }
  /** Footstep noise radius (m): sneaking 2, walking 6, running 12, sprinting 20, × stealth skill; gunfire is separate. */
  footstepNoise() {
    if (!this.player) return 0;
    const sp = this.pc.speed, sk = skillFx(this.inv.ensure(this.player.lead).skills).sneakNoise;
    const base = sp < 0.2 ? 0 : this.pc.crouch ? 2 : this.pc.sprinting ? 20 : sp > 2.5 ? 12 : 6;
    return base * sk;
  }
  /** Open a hydrant the 1974 way: a wrench or a length of pipe on the nut (any blunt melee weapon). Vandalism if seen. */
  openHydrant(): string | null {
    if (!this.player || this.reg.weapon(this.pc.weapon).family !== 'blunt') return null;
    const p = this.player.position();
    for (const pr of this.props.list.values()) {
      if (pr.type !== 'hydrant' || this.props.isBroken(pr.id) || Math.hypot(pr.x - p[0], pr.z - p[2]) > 1.6) continue;
      this.props.damage(pr.id, 9999, 'melee', this.player.id);
      return pr.id;
    }
    return null;
  }
  /** Throw a firebomb at a point (lock-on target or aim point). Arson: a witnessed crime, and the fire spreads. */
  throwMolotov(at: V3) {
    if (!this.player || !this.inv.take(this.player.lead, 'item.molotov')) return null;
    const p = this.player.position();
    if (Math.hypot(at[0] - p[0], at[2] - p[2]) > 22) { const d = norm([at[0] - p[0], 0, at[2] - p[2]]); at = [p[0] + d[0] * 22, at[1], p[2] + d[2] * 22]; }
    const f = this.fire.start(at[0], at[2], 'molotov', this.player.id);
    this.crime('arson', { noise: 35 });
    return f;
  }
  private updateFire(dt: number) {
    this.fire.update(dt);
    if ((this.fireTick += dt) < 0.5 || !this.fire.fires.size) return;
    this.fireTick = 0;
    for (const a of this.actors.values()) { const q = a.pos(); const f = this.fire.at(q[0], q[2]); if (f) this.applyDamage(a.id, { amount: 4, type: 'fire', source: f.by ?? undefined }); }
    for (const [id, m] of this.fire.fuel) if (m.burning && this.props.get(id)) this.damageProp(id, 999, 'impact', null);
  }
  /** Drunk: 0..1 for the engine's camera sway and control wobble (modest, short). */
  intox() { return this.player ? this.inv.ensure(this.player.lead).intox : 0; }
  /** Barber: a shave or a new look changes what witnesses remember about the face. */
  groom(style: string) {
    if (!this.player || !(style in BARBER) || !this.inv.spend(this.player.lead, BARBER[style], 'barber')) return false;
    this.inv.ensure(this.player.lead).grooming = style; return true;
  }
  /** Boxing gym: an hour's session (a buck) builds strength or wind; time passes. */
  train(kind: 'strength' | 'stamina', hours = 1) {
    if (!this.player || !this.inv.spend(this.player.lead, GYM_SESSION * hours, 'gym')) return false;
    const li = this.inv.ensure(this.player.lead);
    learn(li.skills, kind === 'strength' ? 'meleeHit' : 'sprintSecond', kind === 'strength' ? 12 * hours : 900 * hours);
    if (kind === 'stamina') li.stamina.base = li.stamina.max = Math.max(li.stamina.base, 60 + 0.8 * li.skills.stamina);
    this.passTime(hours, 'wait');
    return true;
  }
  /** An amateur bout: a sanctioned fight (no crime), fists only, a purse for the winner. */
  bout(opponent = 'boxer'): string | null {
    if (!this.player) return null;
    const p = this.player.position();
    this.sanctioned = true;
    this.equip('weapon.fists');
    const a = this.spawnCombatant({ id: opponent, faction: 'hood', squad: 'ring', pos: [p[0], p[1], p[2] - 3], yaw: 0, weapon: null, melee: 'weapon.fists', hp: 90 });
    if (!a) return null;
    this.ai.alert(opponent, [p[0], p[2]], this.player.id);
    this.ringOpponent = opponent;
    const off = this.healthSys.on('damaged', (e) => {
      if (e.id !== opponent) return;
      if (e.hp < 15) { this.sanctioned = false; this.ringOpponent = null; this.ai.knockOut(opponent); if (this.player) this.inv.addMoney(this.player.lead, BOUT_PURSE, 'purse'); this.emit('notice', { kind: 'boutWon', purse: BOUT_PURSE }); off(); }
    });
    return opponent;
  }
  sanctioned = false;
  /** the ring: an amateur bout ends in a knockout, never a death */
  private ringOpponent: string | null = null;
  /** Takedown from behind on an unaware enemy within 1.4 m: a blade kills, anything else knocks out. */
  takedown(): { id: string; lethal: boolean } | null {
    if (!this.player) return null;
    const p = this.player.position();
    for (const a of this.ai.agents.values()) {
      if (!this.ai.unaware(a.id) || Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]) > 1.4) continue;
      const behind = Math.abs(wrapAngle(Math.atan2(-(p[0] - a.pos[0]), -(p[2] - a.pos[2])) - a.yaw)) > Math.PI * 0.55;
      if (!behind) continue;
      const lethal = this.reg.weapon(this.pc.weapon).family === 'blade';
      if (lethal) this.applyDamage(a.id, { amount: 999, region: 'torso', type: 'melee', source: this.player.id });
      else this.ai.knockOut(a.id);
      learn(this.inv.ensure(this.player.lead).skills, 'unseenTakedown');
      this.crime(lethal ? 'homicide' : 'assault', { victim: a.id, noise: 4 });
      this.emit('melee', { kind: 'takedown', id: a.id, lethal });
      return { id: a.id, lethal };
    }
    return null;
  }
  /** Movement multiplier for the engine's controller (limp, crouch in cover). */
  moveMul() { if (!this.player) return 1; const e = this.healthSys.effects(this.player.id); return e.speedMul * this.reg.lead(this.player.lead).sprint; }
  canSprint() { if (!this.player) return true; const st = this.inv.ensure(this.player.lead).stamina; return this.healthSys.effects(this.player.id).canSprint && (this.pc.unlimitedSprint || !st.exhausted); }
  stamina() { if (!this.player) return null; const st = this.inv.ensure(this.player.lead).stamina; return { value: st.value, max: st.max, exhausted: st.exhausted }; }

  appearance(): Appearance {
    const p = this.player!;
    const prof = this.reg.lead(p.lead);
    const armed = this.reg.weapon(this.pc.weapon).class !== 'melee' && (this.pc.aiming || this.pc.firing);
    return { subject: prof.description, sex: prof.sex, build: prof.build, look: this.wardrobe.look(p.lead), vehicle: vehicleLook(this.pc.vehicle, this.pc.vehicle ? this.cars.cars.get(this.pc.vehicle.id)?.plateGen ?? this.inv.ensure(p.lead).plates : 0), armed };
  }
  suspect(): SuspectCtx | null {
    const p = this.player; if (!p) return null;
    const h = this.healthSys.state(p.id);
    return {
      id: p.id, pos: p.position(), appearance: this.appearance(), speed: this.pc.speed, weaponDrawn: (this.pc.aiming && this.reg.weapon(this.pc.weapon).class !== 'melee') || (this.concealment()?.visible.some((w) => this.reg.weapon(w).class !== 'melee') ?? false), oddLook: this.concealment()?.heatLook ?? false, crowd: this.crowdAt(p.position()), indoorsPublic: this.pc.indoorsPublic, hiding: this.pc.hiding,
      bleeding: !!h && h.bleeds.length > 0, indoors: this.pc.indoors, subway: this.pc.subway, inVehicle: !!this.pc.vehicle, surrendered: this.pc.surrendered,
    };
  }
  /** Crowd cover at a point: pedestrians within 6 m (4+ = a crowd) × the lead's blend. */
  crowdAt(pos: V3) {
    if (!this.player) return 0;
    let n = 0; for (const q of this.port.peds()) if (q.alive && Math.hypot(q.x - pos[0], q.z - pos[2]) < 6) n++;
    return Math.min(1, n / 4) * (this.reg.lead(this.player.lead).crowdCover ?? 0.3);
  }
  hitboxes(): ActorHitbox[] {
    const out: ActorHitbox[] = [];
    for (const a of this.actors.values()) {
      const h = this.healthSys.state(a.id); if (h?.dead) continue;
      const u = this.policeSys.units.get(a.id); if (u && (u.kind.endsWith('car') || u.kind === 'roadblock') && u.state !== 'combat') continue; // cops inside cars: the car shell covers them
      out.push(humanoidHitbox(a.id, a.pos(), a.yaw(), a.stance()));
    }
    return out;
  }
  aimTargets(): AimTarget[] {
    const out: AimTarget[] = [];
    if (!this.player) return out;
    const eye = this.player.aim().origin;
    for (const a of this.actors.values()) {
      if (a.id === this.player.id) continue;
      const h = this.healthSys.state(a.id); if (!h || h.dead) continue;
      const ai = this.ai.agents.get(a.id);
      const hostile = (a.team === 'enemy' || (a.team === 'police' && (ai?.state !== undefined))) && ai?.state !== 'surrender' && ai?.state !== 'flee';
      const p = a.pos(), crouch = a.stance() === 'crouch' ? 0.66 : 1;
      const chest: V3 = [p[0], p[1] + 1.2 * crouch, p[2]];
      const vis = (() => { const d = [chest[0] - eye[0], chest[1] - eye[1], chest[2] - eye[2]] as V3, L = Math.hypot(...d); const hit = this.world.ray(eye, norm(d), L - 0.4); return !hit || hit.material === 'glass' || hit.material === 'metal_thin'; })();
      out.push({ id: a.id, chest, head: [p[0], p[1] + 1.66 * crouch, p[2]], legs: [p[0], p[1] + 0.55 * crouch, p[2]], hostile, alive: true, visible: vis, threat: ai?.firing ? 1 : ai ? 0.5 : 0 });
    }
    return out;
  }
  combatTargets(): CombatTarget[] {
    const out: CombatTarget[] = [];
    const p = this.player;
    if (p && !this.healthSys.state(p.id)?.dead && !this.pc.surrendered) { const pp = p.position(); out.push({ id: p.id, pos: pp, vel: [0, 0], team: 'player', alive: true, inCover: !!this.pc.cover, stance: this.playerStance(), noise: this.footstepNoise(), light: this.light(pp[0], pp[2]) }); }
    for (const a of this.ai.agents.values()) if (a.alive && a.faction !== 'muscle' && a.state !== 'surrender' && a.state !== 'flee') out.push({ id: a.id, pos: a.pos, vel: a.vel, team: 'enemy', alive: true, inCover: a.state === 'inCover', stance: a.stance });
    return out;
  }
  busy() { return [...this.ai.agents.values()].some((a) => a.alive && a.faction !== 'muscle' && a.target && a.state !== 'surrender' && a.state !== 'flee') || [...this.policeSys.units.values()].some((u) => u.state === 'pursuit' || u.state === 'encounter' || u.state === 'combat'); }

  /** Everything the HUD needs in one snapshot. */
  hud() {
    const p = this.player; if (!p) return null;
    const h = this.healthSys.state(p.id)!;
    const g = this.currentGun();
    const inv = this.inv.ensure(p.lead);
    const enc = [...this.policeSys.units.values()].find((u) => u.state === 'encounter' || u.state === 'approach');
    return {
      hp: h.hp, maxHp: h.maxHp, armor: h.armor, injuries: this.healthSys.get(p.id).injuries, bleeding: this.healthSys.bleedRate(h), effects: this.healthSys.effects(p.id),
      weapon: this.reg.weapon(this.pc.weapon).name, weaponId: this.pc.weapon, loaded: g?.loaded ?? null, reserve: g ? this.inv.reserve(p.lead, g.def.id) : null, reloading: g?.reloading ? g.reloading.t / g.reloading.dur : null,
      spread: g ? g.spread(this.pc.aiming, Math.min(1, this.pc.speed / 3.4), this.mods()) : 0, recoil: g?.recoil ?? 0,
      lock: this.aimer.locked, limb: this.aimer.limb, cover: this.pc.cover ? { height: this.pc.cover.height, peek: this.pc.peek, blind: this.pc.blind } : null,
      money: inv.money, outfit: this.wardrobe.look(p.lead).headline, witnesses: this.witnesses.active(p.id).map((w) => ({ ped: w.ped, state: w.state, target: w.target })),
      encounter: enc ? { unit: enc.id, state: enc.state, kind: enc.kind, t: enc.t } : null,
      reports: this.policeSys.view(), melee: this.melee.fighters.get(p.id)?.state ?? 'idle',
    };
  }

  // ------------------------------------------------------------------ external events
  private onVehicleImpact(e: { vehicleId?: string; speed?: number; dv?: number; ped?: string; occupant?: string; driver?: string; prop?: string; impulse?: number }) {
    // e.ped: a pedestrian struck at relative speed e.speed; e.occupant: someone inside a car that changed velocity by e.dv
    if (e.ped && e.speed) {
      const res = this.applyDamage(e.ped, { amount: pedestrianImpactDamage(e.speed), type: 'impact', source: e.driver });
      if (e.driver && e.driver === this.player?.id && res && res.dealt > 0) this.crime(res.killed ? 'homicide' : 'hit_and_run', { victim: e.ped });
    }
    if (e.occupant && e.dv) this.applyDamage(e.occupant, { amount: occupantImpactDamage(e.dv), type: 'impact' });
    if (e.prop && e.speed) this.damageProp(e.prop, e.speed * 25, 'impact', e.driver ?? null);
  }
  private onSimCollision(e: { a?: string; b?: string; speed?: number; ped?: string; x?: number; z?: number }) {
    if (e.ped && e.speed) this.applyDamage(`${e.ped}`, { amount: pedestrianImpactDamage(e.speed), type: 'impact' });
  }
  /** The engine reports a fall from height (m) for any actor. */
  fell(id: string, dropM: number) { const d = fallDamage(dropM); if (d > 0) this.applyDamage(id, { amount: d, type: 'fall' }); }

  // ------------------------------------------------------------------ save
  serialize(): SaveV3 {
    const health: Record<string, unknown> = {};
    if (this.player) health[this.player.lead] = this.healthSys.serialize(this.player.id);
    return { v: SAVE_VERSION as 4, economy: this.economy.serialize(), stats: this.stats.serialize(), ownership: this.ownership.serialize(), cars: this.cars.serialize(), inventory: this.inv.serialize(), health, police: this.policeSys.serialize(), shops: this.shops.serialize(), phones: this.phones.serialize(), props: this.props.serialize(), outcomes: this.outcomes.serialize(), activeLead: this.player?.lead };
  }
  deserialize(raw: unknown) {
    const s = migrate(raw);
    this.inv.deserialize(s.inventory);
    // resolve legacy '@first:' outfit placeholders and make sure start outfits are owned
    for (const [lead, l] of this.inv.leads) {
      const prof = this.reg.leads.get(lead); if (!prof) continue;
      for (const o of prof.startOutfits) l.outfits.add(o);
      if (!l.wearing || l.wearing.startsWith('@first:') || !this.reg.outfits.has(l.wearing)) l.wearing = prof.startOutfits[0];
    }
    this.policeSys.deserialize(s.police as any);
    this.shops.deserialize(s.shops);
    this.phones.deserialize(s.phones as any);
    this.props.deserialize(s.props as any);
    this.outcomes.deserialize(s.outcomes as any);
    this.cars.deserialize((s as any).cars ?? []);
    this.ownership.deserialize((s as any).ownership);
    this.stats.deserialize((s as any).stats);
    if ((s as any).economy) this.economy.restore((s as any).economy);
    if (this.player) {
      const h = (s.health as any)?.[this.player.lead]; if (h) this.healthSys.deserialize(this.player.id, h);
      this.pc.weapon = this.inv.ensure(this.player.lead).equipped; this.guns.clear();
    }
  }

  private nullPort(): AgentPort { return { peds: () => [], ped: () => undefined, command: () => {} }; }
  get now() { return this.time; }
}

function yawOf(d: [number, number, number] | V3) { return Math.atan2(-d[0], -d[2]); }
function pedSnap(q: any): PedSnapshot {
  const id = typeof q.id === 'string' ? q.id : `ped:${q.id}`;
  return { id, x: q.x, y: q.y ?? 0, z: q.z, yaw: q.yaw ?? 0, alive: q.alive ?? q.state !== 'dead', nerve: q.nerve, child: q.child ?? q.archetype?.includes?.('child') };
}
const now = () => (globalThis.performance ? globalThis.performance.now() : Date.now());

export { DEFAULT_CONTENT } from './data/defaults';
export type { GameplayContent } from './data/schema';
