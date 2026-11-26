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
import { norm, type V3 } from './core/vec';
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
import { Police, type SuspectCtx, type UnitKind } from './police/police';
import type { Crime, CrimeKind } from './police/crime';
import type { Appearance } from './police/description';
import type { AgentCommand, AgentPort, PedSnapshot } from './police/ports';
import { Outcomes } from './outcomes';
import { migrate, SAVE_VERSION, type SaveV3 } from './save';
import { vehicleLook, type PlayerVehicle } from './appearance';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export type GameplayEventType = 'wasted' | 'arrested' | 'crimeWitnessed' | 'reportFiled' | 'shot' | 'hit' | 'propBroken'
  | 'impact' | 'bark' | 'radio' | 'witness' | 'police' | 'melee' | 'money' | 'pickup' | 'ring' | 'call' | 'wear' | 'geyser' | 'tyreShot' | 'notice';

/** Per-quality budgets (brief: 12 combatants on High within 1.5 ms; 6 on mobile Low). */
export const COMBAT_BUDGET: Record<Quality, { combatants: number; witnesses: number }> = {
  low: { combatants: 6, witnesses: 4 }, medium: { combatants: 9, witnesses: 5 }, high: { combatants: 12, witnesses: 6 }, ultra: { combatants: 16, witnesses: 8 },
};

export interface PlayerBinding { id: string; lead: string; position(): [number, number, number]; aim(): { origin: [number, number, number]; dir: [number, number, number] } }
export interface SimBinding { on(type: string, cb: (e: any) => void): void; emit(e: any): void; peds: readonly unknown[]; vehicles: readonly unknown[]; command?(id: string, c: AgentCommand): void }
export interface VehiclesBinding { on(type: 'impact' | 'destroyed', cb: (e: any) => void): void }

interface Actor { id: string; kind: 'player' | 'npc' | 'ped' | 'cop'; team: 'player' | 'enemy' | 'civilian' | 'police'; pos: () => V3; yaw: () => number; stance: () => 'stand' | 'crouch' | 'down'; vehicleId?: string }

export interface PlayerCombatState {
  weapon: string; aiming: boolean; firing: boolean; cover: CoverPoint | null; peek: boolean; blind: boolean;
  surrendered: boolean; vehicle: PlayerVehicle | null; indoors: boolean; subway: boolean; atHome: boolean; speed: number;
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
  readonly pc: PlayerCombatState = {
    weapon: 'weapon.fists', aiming: false, firing: false, cover: null, peek: false, blind: false, surrendered: false, vehicle: null,
    indoors: false, subway: false, atHome: false, speed: 0, lockLimb: 'torso', device: 'mouse', assist: 'standard',
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
    this.port = this.nullPort();
    this.policeSys = new Police(this.reg.precincts, this.world, this.rng);
    this.policeSys.bribeSkill = (id) => (id === this.player?.id ? this.reg.leads.get(this.player.lead)?.bribeSkill ?? 0 : 0);
    this.witnesses = new Witnesses({ peds: () => this.port.peds(), ped: (id) => this.port.ped(id), command: (id, cmd) => this.port.command(id, cmd) }, this.world, this.rng,
      (x, z) => this.light(x, z),
      () => [...this.policeSys.units.values()].filter((u) => u.kind !== 'helicopter' && u.kind !== 'roadblock').map((u) => ({ id: u.id, x: u.x, z: u.z, available: u.state === 'search' || u.state === 'enroute' })));
    this.outcomes = new Outcomes(this.reg, this.inv, this.healthSys, this.policeSys, this.rng);
    this.outcomes.flag = (f) => this.flags.has(f);
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
    this.port = {
      peds: () => (sim.peds as readonly any[]).map(pedSnap),
      ped: (id) => { const raw = (sim.peds as readonly any[]).find((q) => `${q.id}` === id || `ped:${q.id}` === id); return raw ? pedSnap(raw) : undefined; },
      command: (id, cmd) => (sim.command ? sim.command(id, cmd) : sim.emit({ type: 'agentCommand', id, cmd })),
    };
    sim.on('collision', (e) => this.onSimCollision(e));
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
    if (type === 'phone_booth') { this.phones.add({ id, x, z, broken: false }); this.witnesses.addPoint({ id, kind: 'payphone', x, z, broken: false }); }
    if (type === 'newsstand' || type === 'mailbox' || type === 'phone_booth' || type === 'trash_can') this.cover.add({ id, c: [x, y + d.h[1], z], half: d.h as [number, number, number], yaw, height: type === 'newsstand' || type === 'phone_booth' ? 'high' : 'low' });
  }
  addReportPoint(p: ReportPoint) { this.witnesses.addPoint(p); if (p.kind === 'payphone') this.phones.add({ id: p.id, x: p.x, z: p.z, broken: p.broken }); }
  /** A static cover piece (stoop, planter, low wall, crate) with its collision box. */
  addCover(id: string, c: V3, half: [number, number, number], yaw: number, material: 'brick' | 'concrete' | 'wood' | 'metal_thick' = 'concrete') {
    this.world.add({ id, c, h: half, yaw, material });
    this.cover.add({ id, c, half, yaw, height: half[1] * 2 > 1.35 ? 'high' : 'low' });
  }
  /** A parked/driven car: hollow thin-metal body, solid engine block, four tyres, cover all round. */
  addCar(id: string, x: number, y: number, z: number, yaw: number, size: { length: number; width: number; height: number } = { length: 5.4, width: 2.0, height: 1.38 }) {
    const hl = size.length / 2, hw = size.width / 2;
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
  lockOn() { if (!this.player) return null; const a = this.player.aim(); return this.aimer.lock(a.origin, a.dir, this.aimTargets()); }
  cycleLock(dir: 1 | -1) { if (!this.player) return null; const a = this.player.aim(); return this.aimer.cycle(a.origin, a.dir, this.aimTargets(), dir); }
  setLimb(l: Limb) { this.aimer.limb = l; this.pc.lockLimb = l; }
  meleeAttack(kind: AttackKind) { if (!this.player) return false; this.syncPlayerFighter(); return this.melee.attack(this.player.id, kind); }
  block(held: boolean) { if (this.player) { this.syncPlayerFighter(); this.melee.block(this.player.id, held); } }
  dodge(dir: [number, number]) { if (!this.player) return false; this.syncPlayerFighter(); return this.melee.dodge(this.player.id, dir); }
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
  setContext(c: Partial<Pick<PlayerCombatState, 'vehicle' | 'indoors' | 'subway' | 'atHome' | 'device' | 'assist' | 'speed'>>) { Object.assign(this.pc, c); }
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
    const ok = this.witnesses.pay(pedId, cents);
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
    this.healthSys.treat(this.player.id, { heal: def.heal ?? 0, stopBleeding: !!def.stopsBleeding, wearRelief: def.stopsBleeding ? (itemId === 'item.blue_plate' ? 0.5 : 0.3) : 0 });
    return true;
  }
  /** Diner counter: buy and eat in one go. */
  eatAt(shop: string, itemId: string) { if (!this.player) return false; const r = this.shops.buy(this.player.lead, shop, itemId); return r.ok && this.use(itemId); }
  changeOutfit(outfit: string, justBought = false) { return this.player ? this.wardrobe.change(this.player.lead, outfit, { atHome: this.pc.atHome, justBought }) : false; }
  /** Chop shop: new plates for the lead's car (breaks the plate part of descriptions). */
  swapPlates() { if (!this.player || !this.inv.take(this.player.lead, 'item.plates')) return false; this.inv.ensure(this.player.lead).plates++; return true; }

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
      this.policeSys.witnessedByUnit(kind, this.suspect()!, c.at);
      if (ws.length) this.emit('crimeWitnessed', { crime: c, witnesses: ws.map((w) => ({ ped: w.ped, saw: w.saw })) });
    }
    // gunfire scatters the street (sim flee)
    if (kind === 'shots_fired' || kind === 'shooting' || kind === 'homicide') this.sim?.emit({ type: 'threat', x: at[0], z: at[2], radius: (o.noise ?? 60) * 0.6 });
    return c;
  }

  // ------------------------------------------------------------------ frame
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
    this.props.update(dt, [pp[0], pp[2]]);
    if (p) this.phones.update(dt, p.lead, pp[0], pp[2], this.busy());
    this.timings.totalMs = now() - T0;
  }

  private updatePlayer(dt: number, p: PlayerBinding) {
    const lead = p.lead;
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
        const inCover = !!this.pc.cover && !this.pc.peek;
        const blind = inCover && this.pc.blind;
        if (inCover && !blind) return; // must peek or blind-fire from cover
        if (blind) origin = [origin[0], this.pc.cover!.y + (this.pc.cover!.height === 'low' ? 1.25 : 1.7), origin[2]];
        const rays = g.fire({ origin, dir, aiming: this.pc.aiming, moveFrac: Math.min(1, this.pc.speed / 3.4), mods: { ...this.mods(), swayDeg: fx.swayDeg, aimMul: this.mods().aimMul * fx.aimMul }, blind, rng: this.rng });
        for (const r of rays) this.pendingShots.push({ shooter: p.id, ray: r });
        this.inv.ensure(lead).loaded.set(g.def.id, g.loaded);
        this.emit('shot', { shooter: p.id, weapon: g.def.id, origin, dir, player: true, blind });
        if (this.time - this.lastShotsCrime > 3) { this.lastShotsCrime = this.time; this.crime('shots_fired', { noise: g.def.noise }); }
        if (!g.def.auto) this.pc.firing = false;
      }
    }
    // brandishing near civilians: a gun out and aimed in the street is menacing (rate limited)
    if (this.pc.aiming && g && this.time - this.lastMenace > 8) {
      const pp = p.position();
      for (const q of this.port.peds()) if (q.alive && Math.hypot(q.x - pp[0], q.z - pp[2]) < 10) { this.lastMenace = this.time; this.crime('menacing', { victim: q.id }); break; }
    }
    // keep the player's melee fighter in sync
    this.syncPlayerFighter();
  }

  private applyShot(r: ShotResult) {
    const shooter = this.actors.get(r.shooter);
    const byPlayer = r.shooter === this.player?.id;
    for (const h of r.actorHits) {
      const target = this.actors.get(h.actorId);
      const res = this.applyDamage(h.actorId, { amount: h.damage, region: h.region, source: r.shooter, type: 'bullet', power: r.shot.power });
      this.emit('hit', { target: h.actorId, region: h.region, damage: res?.dealt ?? 0, point: h.point, shooter: r.shooter, killed: res?.killed, through: h.through });
      if (byPlayer && target) {
        const kind: CrimeKind = target.kind === 'cop' || this.policeSys.units.has(target.id) ? (res?.killed ? 'officer_down' : 'assault_officer') : res?.killed ? 'homicide' : 'shooting';
        this.crime(kind, { victim: target.id, noise: this.reg.weapon(r.shot.weapon).noise });
      }
    }
    for (const n of r.nearMiss) { this.ai.suppress(n.actorId, 1); if (n.actorId === this.player?.id) this.emit('notice', { kind: 'nearMiss', dist: n.dist }); }
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
        this.outcomes.wasted(this.player.lead, [p[0], p[2]], e.source);
        return;
      }
      this.ai.onDied(e.id);
      const u = this.policeSys.units.get(e.id); if (u) u.state = 'down';
      if (a?.kind === 'ped') this.port.command(e.id, { type: 'anim', name: 'die' });
      this.melee.remove(e.id);
    });
    this.healthSys.on('injured', (e) => this.emit('notice', { kind: 'injured', ...e }));
    this.melee.on('hit', (h) => {
      const t = this.actors.get(h.target);
      const res = this.applyDamage(h.target, { amount: h.damage, region: h.region, source: h.attacker, type: 'melee', bleed: h.bleed });
      this.emit('hit', { target: h.target, region: h.region, damage: res?.dealt ?? 0, melee: h.kind, blocked: h.blocked, counter: h.counter, shooter: h.attacker, killed: res?.killed });
      this.emit('melee', { ...h, attack: h.kind, kind: 'hit' });
      if (h.attacker === this.player?.id && t && !h.blocked) {
        const armed = this.reg.weapon(this.pc.weapon).class === 'melee' && this.pc.weapon !== 'weapon.fists';
        this.crime(t.kind === 'cop' ? 'assault_officer' : res?.killed ? 'homicide' : armed ? 'assault_weapon' : 'assault', { victim: t.id });
        if (t.kind === 'ped') this.port.command(t.id, { type: 'flee', fromX: this.player!.position()[0], fromZ: this.player!.position()[2] });
      }
    });
    for (const k of ['windup', 'parried', 'guardBroken', 'stagger', 'knockdown', 'dodge', 'grab', 'release', 'whiff'] as const) this.melee.on(k, (e: any) => this.emit('melee', { kind: k, ...e }));
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
    this.props.on('coins', (e) => { if (this.player) { this.inv.addMoney(this.player.lead, e.cents, 'coins'); this.emit('pickup', { kind: 'coins', ...e }); } });
    this.witnesses.on('witnessed', (e) => this.emit('witness', { kind: 'witnessed', ...e }));
    this.witnesses.on('heading', (e) => this.emit('witness', { kind: 'heading', ...e }));
    this.witnesses.on('calling', (e) => this.emit('witness', { kind: 'calling', ...e }));
    this.witnesses.on('silenced', (e) => this.emit('witness', { kind: 'silenced', ...e }));
    this.witnesses.on('panicked', (e) => this.emit('witness', { kind: 'panicked', ...e }));
    this.policeSys.on('reportFiled', (e) => this.emit('reportFiled', { precinct: e.report.precinct, severity: e.report.heat, description: e.report.description, lastKnown: e.report.lastKnown, via: e.via, merged: e.merged, id: e.report.id }));
    this.policeSys.on('radio', (e) => this.emit('radio', e));
    this.policeSys.on('dispatched', (e) => { this.registerCop(e.unit.id); this.emit('police', { kind: 'dispatched', unit: e.unit.id, unitKind: e.unit.kind, report: e.report.id }); });
    for (const k of ['spotted', 'stop', 'pursuit', 'lost', 'bribe', 'roadblock', 'standDown', 'cleared'] as const) this.policeSys.on(k, (e: any) => this.emit('police', { kind: k, ...e }));
    this.policeSys.on('engage', (e) => this.copEngage(e.unit));
    this.policeSys.on('arrested', (e) => {
      if (!this.player || e.suspect !== this.player.id) return;
      this.cover.release(e.suspect); this.pc.cover = null; this.pc.surrendered = false; this.aimer.release();
      this.outcomes.arrested(this.player.lead, e.precinct, e.heat, e.kinds);
    });
    this.outcomes.on('wasted', (e) => this.emit('wasted', e));
    this.outcomes.on('arrested', (e) => { this.equip('weapon.fists'); this.emit('arrested', e); });
    this.outcomes.on('propertyReturned', (e) => this.emit('notice', { kind: 'propertyReturned', ...e }));
    this.inv.on('money', (e) => this.emit('money', e));
    this.wardrobe.on('wear', (e) => this.emit('wear', e));
    this.phones.on('ring', (e) => this.emit('ring', e));
    for (const k of ['answered', 'placed', 'message', 'ringStop'] as const) this.phones.on(k, (e: any) => this.emit('call', { kind: k, ...e }));
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
    return { aimMul: p.aim[fam] ?? p.aim.default, recoilMul: p.recoilControl, reloadMul: p.reloadSpeed, swayDeg: 0 };
  }
  profileOf(lead: string, npc: boolean): FighterProfile { const m = this.reg.lead(lead).melee; return { damage: m.damage, speed: m.speed, parryWindow: m.parryWindow, dodgeIframes: m.dodgeIframes, npc }; }
  private syncPlayerFighter() { if (!this.player) return; const f = this.melee.fighters.get(this.player.id); if (f) { f.pos = this.player.position(); f.yaw = yawOf(this.player.aim().dir); } }
  private playerStance(): 'stand' | 'crouch' | 'down' { const c = this.pc.cover; return c && !this.pc.peek && c.height === 'low' ? 'crouch' : 'stand'; }
  /** Movement multiplier for the engine's controller (limp, crouch in cover). */
  moveMul() { if (!this.player) return 1; const e = this.healthSys.effects(this.player.id); return e.speedMul * this.reg.lead(this.player.lead).sprint; }
  canSprint() { return this.player ? this.healthSys.effects(this.player.id).canSprint : true; }

  appearance(): Appearance {
    const p = this.player!;
    const prof = this.reg.lead(p.lead);
    const armed = this.reg.weapon(this.pc.weapon).class !== 'melee' && (this.pc.aiming || this.pc.firing);
    return { subject: prof.description, sex: prof.sex, build: prof.build, look: this.wardrobe.look(p.lead), vehicle: vehicleLook(this.pc.vehicle, this.inv.ensure(p.lead).plates), armed };
  }
  suspect(): SuspectCtx | null {
    const p = this.player; if (!p) return null;
    const h = this.healthSys.state(p.id);
    return {
      id: p.id, pos: p.position(), appearance: this.appearance(), speed: this.pc.speed, weaponDrawn: this.pc.aiming && this.reg.weapon(this.pc.weapon).class !== 'melee',
      bleeding: !!h && h.bleeds.length > 0, indoors: this.pc.indoors, subway: this.pc.subway, inVehicle: !!this.pc.vehicle, surrendered: this.pc.surrendered,
    };
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
    if (p && !this.healthSys.state(p.id)?.dead && !this.pc.surrendered) out.push({ id: p.id, pos: p.position(), vel: [0, 0], team: 'player', alive: true, inCover: !!this.pc.cover, stance: this.playerStance() });
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
    return { v: SAVE_VERSION as 3, inventory: this.inv.serialize(), health, police: this.policeSys.serialize(), shops: this.shops.serialize(), phones: this.phones.serialize(), props: this.props.serialize(), outcomes: this.outcomes.serialize(), activeLead: this.player?.lead };
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
