/**
 * Parametric description of a vehicle. Lengths in metres. Longitudinal coordinate `s` runs
 * from the front of the sheet metal (s = 0) rearwards; it maps to local z = s - sMid, so the
 * vehicle faces -Z (same convention as the engine camera: yaw 0 looks up -Z).
 * x = right, y = up, ground at y = 0 with the suspension at its static ride height.
 */
import type { Slot } from './builder';

export type GlassKind = 'glass' | 'pillar' | 'opera' | 'door' | 'blank';

export interface GreenhouseSpec {
  /** s of windshield base, windshield top (roof front), roof rear, backlight base. */
  sA0: number; sA1: number; sC1: number; sC0: number;
  roofY: number;
  /** Greenhouse half-width at the belt is body half-width minus this. */
  beltInset: number;
  roofHalfW: number;
  crown: number;
  /** Forward bow of the windshield / rearward bow of the backlight at the centre (plan view). */
  bow: number;
  /** Side bands along u (0 = A-pillar edge, 1 = C edge): band i spans u[i]..u[i+1]. */
  bands: { u: number; k: GlassKind }[];
  /** Side glass spans v (0 = belt, 1 = roof edge). */
  winV: [number, number];
  /** Windshield / backlight glass inset from their edges (fraction). */
  wsFrame?: number;
  backlight?: 'glass' | 'blank' | 'twoWindows';
  vinyl?: 'none' | 'full' | 'landau';
  /** Chrome strip along the roof edge (drip rail) and around the side glass. */
  drip?: boolean;
  /** Divide windshield in two (buses, trucks). */
  splitWindshield?: boolean;
  /** Front sign band at the top of the windshield (buses): v range. */
  signBand?: [number, number];
}

export interface CargoSpec {
  kind: 'box' | 'packer';
  s0: number; s1: number; y0: number; y1: number; hw: number;
  slot: Slot;
  ribs?: number;
}

export interface ModelSpec {
  id: string;
  cls: 'sedan' | 'police' | 'coupe' | 'compact' | 'wagon' | 'taxi' | 'bus' | 'boxtruck' | 'stepvan' | 'garbage';
  displayName: string;
  /** Loft (body/cab) length and width. */
  L: number; W: number;
  sF: number; wheelbase: number;
  wheelR: number; tireW: number; track: number; trackR?: number;
  dualRear?: boolean;
  sillY: number; beltY: number;
  /** Top-surface height profile over s: [[s, y], ...]. */
  top: [number, number][];
  crown: number;
  cornerF: number; cornerR: number;
  noseRake: number; tailRake: number;
  /** 0..1 height of the body-side character line (max width). */
  crease: number;
  archGap: number;
  skirts?: boolean;
  hood: [number, number] | null;
  gh: GreenhouseSpec;
  cargo?: CargoSpec[];
  frameRails?: { s0: number; s1: number; y: number };
  grille: { kind: 'egg' | 'vert' | 'horiz' | 'bus' | 'truck'; hw: number; y0: number; y1: number; bars: number; prow?: number };
  headlamps: { kind: 'quadRound' | 'dualRound' | 'quadRect' | 'dualRect'; y: number; xOut: number; size: number; housing?: Slot };
  taillamps: { kind: 'band' | 'corner' | 'block' | 'vertical' | 'truck'; y0: number; y1: number };
  bumper: { kind: 'chrome' | '5mph' | 'painted' | 'rubber'; y: number; h: number; depth: number; wrap: number };
  rearBumper?: { kind: 'chrome' | '5mph' | 'painted' | 'rubber'; y: number; h: number; depth: number; wrap: number };
  trim: { side?: { y: number; kind: 'chrome' | 'rubber' }; rocker?: boolean; belt?: boolean; wheelLip?: boolean };
  /** Lower-body region in the second colour (two-tone / livery): (s, y, side) -> true. */
  twoTone?: (s: number, y: number) => boolean;
  /** Stripe band in paint2 (bus belt stripe). */
  stripe?: [number, number];
  wood?: { s0: number; s1: number; y0: number; y1: number };
  wheelStyle: 'fullcover' | 'hubcap' | 'dogdish' | 'truck' | 'wire';
  whitewall: boolean;
  extras: ('taxiLight' | 'bubble' | 'roofRack' | 'destSign' | 'mirrorL' | 'mirrorsBoth' | 'spotlight' | 'busDoor' | 'stepDoor' | 'antenna' | 'hoodPrism')[];
  /** Seats relative to the vehicle origin. */
  seats: { driver: [number, number, number]; passenger: [number, number, number] };
  /** Paint palette (sRGB hex) for variants; paint2/roof colours when fixed. */
  palette: number[];
  paint2?: number;
  /** Roof / pillar colour: same as body, the second colour, or a fixed sRGB hex. */
  roofColor?: 'paint' | 'paint2' | number;
  metallicChance: number;
  vinylChance: number;
  physics: PhysicsSpec;
}

export interface PhysicsSpec {
  mass: number;
  /** Centre of mass height above ground. */
  comY: number;
  /** Fraction of static weight on the front axle. */
  frontWeight: number;
  /** Suspension: bump travel above static (m), natural frequency (Hz), damping ratio. */
  travel: number; freqF: number; freqR: number; zeta: number;
  antiRoll: number;
  /** Tyre peak/sliding friction, cornering stiffness shape. */
  muPeak: number; muSlide: number; tyreB: number; tyreC: number;
  /** Engine: peak torque (Nm), peak rpm, redline. 3-speed automatic. */
  torque: number; peakRpm: number; redline: number;
  gears: number[]; finalDrive: number; reverseRatio: number;
  brakeForce: number; brakeBias: number;
  maxSteer: number; steerRate: number;
  cdA: number;
  drive: 'rwd';
}

export function sMid(m: ModelSpec) { return m.sF + m.wheelbase / 2; }
