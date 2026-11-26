/**
 * The roster. Every make and model here is invented (see docs/VEHICLE_REGISTRY.md); the
 * shapes follow 1968–74 American design language, not any specific production vehicle.
 */
import type { ModelSpec, PhysicsSpec, GreenhouseSpec } from './gen/spec';

// Period paint (sRGB). Earth tones dominate; a few brights and plenty of white.
const C = {
  avocado: 0x5b6b2f, harvest: 0xc89a2c, rust: 0x8a3b1e, bronze: 0x6e4a2a, cream: 0xe6dab4, brown: 0x4a2f1d,
  white: 0xe7e4da, forest: 0x2e3d2c, burgundy: 0x5a1c22, powder: 0x8fa6b8, silver: 0xa6a6a1, navy: 0x1f2a40,
  black: 0x121314, tan: 0xb89b6e, orange: 0xc2581e, lime: 0x8c9a3a, red: 0x9b2a20, gold: 0xa8843e, teal: 0x2f5a52,
  copper: 0x8c4b2b, mint: 0x9fb8a0, taxi: 0xe3a92a, aluminium: 0xc9c9c2,
  // docs/STYLE_GUIDE.md §2 tokens
  sgBrown: 0x5a3326, sgMaroon: 0x4a1f22, sgCream: 0xd8cdb4, sgAvocado: 0x6b6b3a, sgHarvest: 0xc79a3c, sgWhite: 0xd9d4c8, truckRed: 0xb2302a,
};

const carPhysics = (o: Partial<PhysicsSpec>): PhysicsSpec => ({
  mass: 1950, comY: 0.56, frontWeight: 0.55,
  travel: 0.11, freqF: 0.95, freqR: 1.05, zeta: 0.2, antiRoll: 0.12,
  muPeak: 0.86, muSlide: 0.66, tyreB: 11, tyreC: 1.45,
  torque: 410, peakRpm: 2400, redline: 4400, gears: [2.45, 1.45, 1.0], finalDrive: 2.73, reverseRatio: 2.2,
  brakeForce: 0.95, brakeBias: 0.68, maxSteer: 0.6, steerRate: 2.0, cdA: 1.0, drive: 'rwd',
  ...o,
});
const truckPhysics = (o: Partial<PhysicsSpec>): PhysicsSpec => carPhysics({
  mass: 6500, comY: 1.05, frontWeight: 0.42, travel: 0.09, freqF: 1.5, freqR: 1.7, zeta: 0.3, antiRoll: 0.4,
  muPeak: 0.8, muSlide: 0.62, tyreB: 9, tyreC: 1.4,
  torque: 900, peakRpm: 1700, redline: 3200, gears: [5.6, 3.1, 1.75, 1.0], finalDrive: 4.6, reverseRatio: 5.4,
  brakeForce: 0.6, brakeBias: 0.6, maxSteer: 0.62, steerRate: 1.5, cdA: 5.5, ...o,
});

/** Standard sedan greenhouse bands (A, front door glass, B, rear door glass, C). */
const sedanBands = (b: number, c: number): GreenhouseSpec['bands'] => [
  { u: 0, k: 'pillar' }, { u: 0.04, k: 'glass' }, { u: b, k: 'pillar' }, { u: b + 0.045, k: 'glass' }, { u: c, k: 'pillar' },
];
const carSeats = (zDriver: number, y = 0.62): ModelSpec['seats'] => ({ driver: [-0.38, y, zDriver], passenger: [0.38, y, zDriver] });

const bancroft: ModelSpec = {
  id: 'bancroft', cls: 'sedan', displayName: 'Ostrander Bancroft 4-Door',
  L: 5.5, W: 2.0, sF: 1.02, wheelbase: 3.07, wheelR: 0.355, tireW: 0.215, track: 1.62,
  sillY: 0.3, beltY: 0.86,
  top: [[0, 0.74], [0.06, 0.78], [0.5, 0.81], [1.95, 0.845], [2.05, 0.86], [4.3, 0.86], [4.42, 0.875], [5.3, 0.865], [5.44, 0.84], [5.5, 0.78]],
  crown: 0.025, cornerF: 0.3, cornerR: 0.3, noseRake: 0.03, tailRake: 0.02, crease: 0.55, archGap: 0.05,
  hood: [0.07, 1.98],
  gh: { sA0: 2.05, sA1: 2.72, sC1: 3.86, sC0: 4.36, roofY: 1.33, beltInset: 0.07, roofHalfW: 0.7, crown: 0.035, bow: 0.05, bands: sedanBands(0.47, 0.86), winV: [0.04, 0.9], drip: true },
  grille: { kind: 'egg', hw: 0.38, y0: 0.5, y1: 0.72, bars: 12 },
  headlamps: { kind: 'quadRound', y: 0.62, xOut: 0.16, size: 0.15 },
  taillamps: { kind: 'band', y0: 0.6, y1: 0.72 },
  bumper: { kind: '5mph', y: 0.3, h: 0.2, depth: 0.16, wrap: 0.3 },
  rearBumper: { kind: 'chrome', y: 0.33, h: 0.18, depth: 0.08, wrap: 0.3 },
  trim: { side: { y: 0.6, kind: 'chrome' }, rocker: true, wheelLip: true, windowFrame: 'chrome', doors: true },
  wheelStyle: 'fullcover', whitewall: true,
  extras: ['mirrorL', 'antenna'],
  seats: carSeats(0.1),
  palette: [C.sgAvocado, C.sgHarvest, C.rust, C.bronze, C.sgCream, C.sgBrown, C.sgWhite, C.forest, C.sgMaroon, C.powder, C.silver, C.navy, C.gold, C.sgBrown, C.sgWhite],
  metallicChance: 0.35, vinylChance: 0.4,
  physics: carPhysics({}),
};

const police: ModelSpec = {
  ...bancroft, id: 'bancroft_patrol', cls: 'police', displayName: 'Ostrander Bancroft Patrol',
  twoTone: (s, y) => s > 2.05 && s < 4.3 && y > 0.36,
  paint2: C.white, roofColor: 'paint2', palette: [C.black],
  trim: { side: { y: 0.6, kind: 'rubber' }, windowFrame: 'trim', doors: true },
  wheelStyle: 'dogdish', whitewall: false,
  extras: ['bubble', 'spotlight', 'mirrorL', 'antenna'],
  metallicChance: 0, vinylChance: 0,
  physics: carPhysics({ torque: 470, freqF: 1.25, freqR: 1.35, zeta: 0.3, antiRoll: 0.4, muPeak: 0.9 }),
};

const bancroftCab: ModelSpec = {
  ...bancroft, id: 'bancroft_cab', cls: 'taxi', displayName: 'Ostrander Bancroft Taxi',
  palette: [C.taxi, 0xdfa328, 0xd99c25, 0xe6ad30],
  trim: { side: { y: 0.6, kind: 'rubber' }, windowFrame: 'chrome', doors: true },
  wheelStyle: 'hubcap', whitewall: false,
  extras: ['taxiLight', 'mirrorL', 'antenna'],
  metallicChance: 0, vinylChance: 0,
  physics: carPhysics({ mass: 2000, freqF: 1.1, freqR: 1.25, zeta: 0.24, antiRoll: 0.18 }),
};

const tiverton: ModelSpec = {
  id: 'tiverton', cls: 'coupe', displayName: 'Delacorte Tiverton Hardtop Coupe',
  L: 5.72, W: 2.0, sF: 1.18, wheelbase: 3.1, wheelR: 0.36, tireW: 0.225, track: 1.62,
  sillY: 0.32, beltY: 0.83,
  top: [[0, 0.8], [0.08, 0.845], [2.25, 0.82], [2.36, 0.83], [4.45, 0.83], [4.55, 0.86], [5.55, 0.86], [5.72, 0.8]],
  crown: 0.02, cornerF: 0.22, cornerR: 0.28, noseRake: -0.02, tailRake: 0.03, crease: 0.6, archGap: 0.05, skirts: true,
  hood: [0.08, 2.3],
  gh: { sA0: 2.36, sA1: 2.98, sC1: 3.82, sC0: 4.5, roofY: 1.32, beltInset: 0.08, roofHalfW: 0.68, crown: 0.03, bow: 0.05, bands: [{ u: 0, k: 'pillar' }, { u: 0.04, k: 'glass' }, { u: 0.56, k: 'opera' }], winV: [0.03, 0.93], drip: true },
  grille: { kind: 'vert', hw: 0.27, y0: 0.44, y1: 0.78, bars: 14, prow: 0.08 },
  headlamps: { kind: 'quadRect', y: 0.6, xOut: 0.15, size: 0.15, housing: 'chrome' },
  taillamps: { kind: 'band', y0: 0.58, y1: 0.74 },
  bumper: { kind: '5mph', y: 0.3, h: 0.21, depth: 0.15, wrap: 0.3 },
  trim: { side: { y: 0.55, kind: 'rubber' }, rocker: true, wheelLip: true, windowFrame: 'chrome', doors: true },
  wheelStyle: 'wire', whitewall: true,
  extras: ['mirrorL', 'antenna'],
  seats: carSeats(0.0, 0.6),
  palette: [C.burgundy, C.bronze, C.cream, C.forest, C.navy, C.white, C.black, C.gold, C.copper],
  metallicChance: 0.6, vinylChance: 0.9,
  physics: carPhysics({ mass: 2150, freqF: 0.95, freqR: 1.05, zeta: 0.2, torque: 480, muPeak: 0.84 }),
};

const ferris: ModelSpec = {
  id: 'ferris', cls: 'compact', displayName: 'Whitcomb Ferris Compact Sedan',
  L: 4.62, W: 1.82, sF: 0.84, wheelbase: 2.76, wheelR: 0.33, tireW: 0.19, track: 1.48,
  sillY: 0.3, beltY: 0.82,
  top: [[0, 0.72], [0.06, 0.76], [1.45, 0.8], [1.56, 0.82], [3.62, 0.82], [3.7, 0.84], [4.5, 0.83], [4.62, 0.76]],
  crown: 0.02, cornerF: 0.22, cornerR: 0.22, noseRake: 0.02, tailRake: 0.02, crease: 0.5, archGap: 0.04,
  hood: [0.06, 1.5],
  gh: { sA0: 1.56, sA1: 2.12, sC1: 3.22, sC0: 3.66, roofY: 1.36, beltInset: 0.06, roofHalfW: 0.64, crown: 0.03, bow: 0.04, bands: sedanBands(0.48, 0.87), winV: [0.04, 0.9], drip: true },
  grille: { kind: 'horiz', hw: 0.5, y0: 0.5, y1: 0.7, bars: 5 },
  headlamps: { kind: 'dualRound', y: 0.6, xOut: 0.14, size: 0.18 },
  taillamps: { kind: 'block', y0: 0.58, y1: 0.72 },
  bumper: { kind: 'chrome', y: 0.3, h: 0.14, depth: 0.07, wrap: 0.2 },
  trim: { side: { y: 0.58, kind: 'chrome' }, windowFrame: 'chrome', doors: true },
  wheelStyle: 'hubcap', whitewall: false,
  extras: ['mirrorL'],
  seats: carSeats(0.0, 0.6),
  palette: [C.lime, C.harvest, C.orange, C.powder, C.white, C.tan, C.red, C.mint, C.brown],
  metallicChance: 0.1, vinylChance: 0.1,
  physics: carPhysics({ mass: 1400, comY: 0.53, torque: 290, peakRpm: 2000, redline: 4400, finalDrive: 2.9, freqF: 1.2, freqR: 1.3, zeta: 0.25, antiRoll: 0.2, cdA: 0.85, steerRate: 2.4 }),
};

const homestead: ModelSpec = {
  ...bancroft, id: 'homestead', cls: 'wagon', displayName: 'Ostrander Homestead Wagon',
  L: 5.62,
  top: [[0, 0.74], [0.06, 0.78], [0.5, 0.81], [1.95, 0.845], [2.05, 0.86], [5.5, 0.86], [5.62, 0.82]],
  gh: { sA0: 2.05, sA1: 2.68, sC1: 5.5, sC0: 5.58, roofY: 1.42, beltInset: 0.06, roofHalfW: 0.7, crown: 0.03, bow: 0.05, wsFrame: 0.05,
    bands: [{ u: 0, k: 'pillar' }, { u: 0.04, k: 'glass' }, { u: 0.33, k: 'pillar' }, { u: 0.355, k: 'glass' }, { u: 0.6, k: 'pillar' }, { u: 0.625, k: 'glass' }, { u: 0.965, k: 'pillar' }],
    winV: [0.04, 0.9], drip: true },
  wood: { s0: 0.15, s1: 5.5, y0: 0.42, y1: 0.8 },
  taillamps: { kind: 'vertical', y0: 0.42, y1: 0.8 },
  rearBumper: { kind: 'chrome', y: 0.3, h: 0.18, depth: 0.08, wrap: 0.3 },
  trim: { rocker: true, wheelLip: true, windowFrame: 'chrome', doors: true },
  extras: ['roofRack', 'mirrorL', 'antenna'],
  palette: [C.harvest, C.avocado, C.white, C.cream, C.brown, C.powder, C.bronze, C.forest],
  vinylChance: 0,
  physics: carPhysics({ mass: 2100, frontWeight: 0.52 }),
};

const fareway: ModelSpec = {
  id: 'fareway', cls: 'taxi', displayName: 'Garrity Fareway Cab',
  L: 5.28, W: 1.98, sF: 0.98, wheelbase: 2.98, wheelR: 0.35, tireW: 0.205, track: 1.6,
  sillY: 0.31, beltY: 0.86,
  top: [[0, 0.7], [0.06, 0.75], [1.82, 0.83], [1.9, 0.86], [4.12, 0.86], [4.2, 0.87], [5.15, 0.86], [5.28, 0.8]],
  crown: 0.02, cornerF: 0.26, cornerR: 0.24, noseRake: 0.02, tailRake: 0.02, crease: 0.5, archGap: 0.05,
  hood: [0.06, 1.85],
  gh: { sA0: 1.9, sA1: 2.38, sC1: 3.8, sC0: 4.15, roofY: 1.45, beltInset: 0.06, roofHalfW: 0.71, crown: 0.03, bow: 0.035, bands: sedanBands(0.5, 0.88), winV: [0.04, 0.9], drip: true },
  grille: { kind: 'egg', hw: 0.5, y0: 0.44, y1: 0.62, bars: 10 },
  headlamps: { kind: 'dualRound', y: 0.54, xOut: 0.14, size: 0.17, housing: 'chrome' },
  taillamps: { kind: 'corner', y0: 0.56, y1: 0.74 },
  bumper: { kind: 'chrome', y: 0.28, h: 0.15, depth: 0.1, wrap: 0.38 },
  trim: { side: { y: 0.5, kind: 'rubber' }, windowFrame: 'chrome', doors: true },
  wheelStyle: 'hubcap', whitewall: false,
  extras: ['taxiLight', 'mirrorL', 'antenna'],
  seats: carSeats(0.05, 0.64),
  palette: [C.taxi, 0xdfa328, 0xd99c25, 0xe6ad30],
  metallicChance: 0, vinylChance: 0,
  physics: carPhysics({ mass: 1850, freqF: 1.15, freqR: 1.3, zeta: 0.25, torque: 360 }),
};

/** Bus side: a driver window, then passenger windows ~1.25 m apart with narrow posts. */
function busBands(): GreenhouseSpec['bands'] {
  const s0 = 0.02, s1 = 12.18, len = s1 - s0;
  const u = (s: number) => (s - s0) / len;
  const out: GreenhouseSpec['bands'] = [{ u: 0, k: 'pillar' }, { u: u(0.12), k: 'glass' }, { u: u(1.5), k: 'pillar' }];
  for (let s = 1.62; s < 11.0; s += 1.26) { out.push({ u: u(s), k: 'glass' }, { u: u(s + 1.14), k: 'pillar' }); }
  return out;
}
const ct40: ModelSpec = {
  id: 'ct40', cls: 'bus', displayName: 'Corrigan CT-40 Transit Coach',
  L: 12.2, W: 2.59, sF: 2.2, wheelbase: 7.2, wheelR: 0.5, tireW: 0.28, track: 2.06, trackR: 1.84, dualRear: true,
  sillY: 0.42, beltY: 1.32,
  top: [[0, 1.32], [12.2, 1.32]],
  crown: 0, cornerF: 0.25, cornerR: 0.2, noseRake: 0, tailRake: 0, crease: 0.5, archGap: 0.06,
  hood: null,
  gh: { sA0: 0.02, sA1: 0.2, sC1: 12.12, sC0: 12.18, roofY: 2.95, beltInset: 0.0, roofHalfW: 1.2, crown: 0.07, bow: 0.06, bands: busBands(),
    winV: [0.06, 0.74], signBand: [0.82, 0.97], splitWindshield: true, backlight: 'twoWindows', wsFrame: 0.04 },
  grille: { kind: 'bus', hw: 0.7, y0: 0.5, y1: 0.78, bars: 4 },
  headlamps: { kind: 'quadRound', y: 0.62, xOut: 0.2, size: 0.15, housing: 'trim' },
  taillamps: { kind: 'block', y0: 0.7, y1: 0.95 },
  bumper: { kind: 'rubber', y: 0.3, h: 0.2, depth: 0.1, wrap: 0.1 },
  trim: {},
  stripe: [1.08, 1.2],
  wheelStyle: 'truck', whitewall: false,
  extras: ['destSign', 'busDoor', 'mirrorsBoth'],
  seats: { driver: [-0.75, 1.55, -4.85], passenger: [0.6, 1.5, -2.5] },
  palette: [C.teal, 0x2c4f60], paint2: C.orange, roofColor: C.cream,
  metallicChance: 0, vinylChance: 0,
  physics: truckPhysics({ mass: 11500, comY: 1.15, frontWeight: 0.34, torque: 1000, peakRpm: 1500, redline: 2400, gears: [3.5, 1.9, 1.0], finalDrive: 5.4, reverseRatio: 4, cdA: 7.5, maxSteer: 0.66, steerRate: 1.2 }),
};

const truckGh = (sA0: number, sC0: number, roofY: number): GreenhouseSpec => ({
  sA0, sA1: sA0 + 0.22, sC1: sC0 - 0.08, sC0, roofY, beltInset: 0.06, roofHalfW: 0.92, crown: 0.04, bow: 0.03,
  bands: [{ u: 0, k: 'pillar' }, { u: 0.05, k: 'glass' }, { u: 0.68, k: 'pillar' }], winV: [0.05, 0.9], backlight: 'twoWindows', splitWindshield: true, drip: true,
});
const b60: ModelSpec = {
  id: 'b60', cls: 'boxtruck', displayName: 'Halloran B-60 Van Body Truck',
  L: 3.05, W: 2.15, sF: 1.05, wheelbase: 4.9, wheelR: 0.5, tireW: 0.25, track: 1.85, trackR: 1.75, dualRear: true,
  sillY: 0.72, beltY: 1.62,
  top: [[0, 1.3], [0.05, 1.38], [1.45, 1.48], [1.56, 1.62], [3.05, 1.62]],
  crown: 0.03, cornerF: 0.2, cornerR: 0.1, noseRake: 0.05, tailRake: 0, crease: 0.6, archGap: 0.06,
  hood: [0.05, 1.5],
  gh: truckGh(1.58, 2.98, 2.42),
  cargo: [{ kind: 'box', s0: 3.15, s1: 8.95, y0: 1.12, y1: 3.55, hw: 1.22, slot: 'paint2', ribs: 9 }],
  frameRails: { s0: 2.6, s1: 8.9, y: 0.92 },
  grille: { kind: 'truck', hw: 0.5, y0: 0.78, y1: 1.3, bars: 5 },
  headlamps: { kind: 'dualRound', y: 1.05, xOut: 0.16, size: 0.18, housing: 'trim' },
  taillamps: { kind: 'truck', y0: 0.95, y1: 1.08 },
  bumper: { kind: 'painted', y: 0.55, h: 0.22, depth: 0.1, wrap: 0.05 },
  rearBumper: { kind: 'painted', y: 0.72, h: 0.12, depth: 0.1, wrap: 0.02 },
  trim: {},
  wheelStyle: 'truck', whitewall: false,
  extras: ['mirrorsBoth'],
  seats: { driver: [-0.48, 1.62, -1.55], passenger: [0.48, 1.62, -1.55] },
  palette: [C.sgWhite, C.truckRed, C.truckRed, C.navy, C.forest, C.orange, C.harvest],
  paint2: C.aluminium, roofColor: 'paint',
  metallicChance: 0, vinylChance: 0,
  physics: truckPhysics({}),
};

const walkin: ModelSpec = {
  id: 'walkin', cls: 'stepvan', displayName: 'Halloran Walk-In 10 Step Van',
  L: 6.3, W: 2.25, sF: 0.8, wheelbase: 3.9, wheelR: 0.42, tireW: 0.23, track: 1.82,
  sillY: 0.55, beltY: 1.25,
  top: [[0, 1.0], [0.05, 1.08], [0.55, 1.18], [0.62, 1.25], [6.3, 1.25]],
  crown: 0.02, cornerF: 0.15, cornerR: 0.08, noseRake: 0.04, tailRake: 0, crease: 0.5, archGap: 0.05,
  hood: [0.05, 0.58],
  gh: { sA0: 0.65, sA1: 0.85, sC1: 6.25, sC0: 6.3, roofY: 2.75, beltInset: 0.01, roofHalfW: 1.08, crown: 0.06, bow: 0.03,
    bands: [{ u: 0, k: 'pillar' }, { u: 0.015, k: 'door' }, { u: 0.12, k: 'blank' }], winV: [0.0, 0.78], backlight: 'twoWindows', splitWindshield: true },
  grille: { kind: 'horiz', hw: 0.45, y0: 0.62, y1: 0.95, bars: 4 },
  headlamps: { kind: 'dualRound', y: 0.82, xOut: 0.17, size: 0.18, housing: 'trim' },
  taillamps: { kind: 'vertical', y0: 0.7, y1: 1.1 },
  bumper: { kind: 'painted', y: 0.42, h: 0.2, depth: 0.1, wrap: 0.05 },
  trim: {},
  wheelStyle: 'truck', whitewall: false,
  extras: ['mirrorsBoth', 'stepDoor'],
  seats: { driver: [-0.55, 1.35, -2.0], passenger: [0.55, 1.35, -2.0] },
  palette: [C.white, C.brown, C.cream, C.powder, C.red, C.harvest],
  metallicChance: 0, vinylChance: 0,
  physics: truckPhysics({ mass: 3600, comY: 0.95, frontWeight: 0.45, torque: 480, peakRpm: 2200, redline: 3800, gears: [2.5, 1.5, 1.0], finalDrive: 4.1, reverseRatio: 2.1, cdA: 4.5, freqF: 1.35, freqR: 1.5, brakeForce: 0.65 }),
};

const b80: ModelSpec = {
  ...b60, id: 'b80', cls: 'garbage', displayName: 'Halloran B-80 Rear-Loader Refuse Truck',
  wheelR: 0.52, wheelbase: 4.6,
  cargo: [{ kind: 'packer', s0: 3.15, s1: 9.0, y0: 1.18, y1: 3.25, hw: 1.24, slot: 'paint2', ribs: 7 }],
  frameRails: { s0: 2.6, s1: 8.6, y: 0.95 },
  palette: [0xe4e2d8, 0xd8d4c4], paint2: 0xd2d0c6,
  extras: ['mirrorsBoth'],
  physics: truckPhysics({ mass: 12500, comY: 1.2, frontWeight: 0.33, torque: 1150, cdA: 6.5, brakeForce: 0.55 }),
};

// ============================================================ emergency & service (original designs)
const FIRE_RED = 0xa8221a, CAB_WHITE = 0xe8e4d8;

const medic: ModelSpec = {
  id: 'medic', cls: 'ambulance', displayName: 'Halloran Medic 3 Modular Ambulance',
  L: 2.55, W: 2.0, sF: 0.75, wheelbase: 3.4, wheelR: 0.4, tireW: 0.22, track: 1.7, trackR: 1.65, dualRear: true,
  sillY: 0.5, beltY: 1.15,
  top: [[0, 0.95], [0.06, 1.02], [0.62, 1.1], [0.7, 1.15], [2.55, 1.15]],
  crown: 0.02, cornerF: 0.18, cornerR: 0.05, noseRake: 0.05, tailRake: 0, crease: 0.5, archGap: 0.05,
  hood: [0.05, 0.65],
  gh: { sA0: 0.72, sA1: 1.05, sC1: 2.45, sC0: 2.5, roofY: 2.1, beltInset: 0.03, roofHalfW: 0.92, crown: 0.04, bow: 0.04,
    bands: [{ u: 0, k: 'pillar' }, { u: 0.05, k: 'glass' }, { u: 0.6, k: 'pillar' }], winV: [0.05, 0.9], backlight: 'blank', splitWindshield: true },
  cargo: [{ kind: 'box', s0: 2.55, s1: 6.0, y0: 0.78, y1: 2.75, hw: 1.1, slot: 'paint', band: [1.15, 1.35, 'paint2'] }],
  grille: { kind: 'horiz', hw: 0.45, y0: 0.55, y1: 0.85, bars: 4 },
  headlamps: { kind: 'dualRound', y: 0.78, xOut: 0.16, size: 0.18, housing: 'trim' },
  taillamps: { kind: 'truck', y0: 0.95, y1: 1.1 },
  bumper: { kind: 'chrome', y: 0.42, h: 0.16, depth: 0.08, wrap: 0.1 },
  rearBumper: { kind: 'painted', y: 0.6, h: 0.14, depth: 0.12, wrap: 0.02 },
  trim: {},
  wheelStyle: 'truck', whitewall: false,
  extras: ['lightBar', 'boxBeacons', 'mirrorsBoth'],
  seats: { driver: [-0.45, 1.25, -0.85], passenger: [0.45, 1.25, -0.85] },
  palette: [0xe8e6de], paint2: 0xd2521e, roofColor: 'paint',
  metallicChance: 0, vinylChance: 0,
  physics: truckPhysics({ mass: 3900, comY: 1.0, frontWeight: 0.45, torque: 520, peakRpm: 2400, redline: 4000, gears: [2.5, 1.5, 1.0], finalDrive: 4.1, reverseRatio: 2.2, cdA: 4.8, freqF: 1.3, freqR: 1.45, brakeForce: 0.75, steerRate: 1.8 }),
};

/** Cab-forward fire-apparatus cab shared by the pumper and the ladder truck. */
const fireCab = (wheelbase: number): Pick<ModelSpec, 'L' | 'W' | 'sF' | 'wheelbase' | 'wheelR' | 'tireW' | 'track' | 'trackR' | 'dualRear' | 'sillY' | 'beltY' | 'top' | 'crown' | 'cornerF' | 'cornerR' | 'noseRake' | 'tailRake' | 'crease' | 'archGap' | 'hood' | 'gh'> => ({
  L: 3.0, W: 2.45, sF: 1.35, wheelbase, wheelR: 0.52, tireW: 0.3, track: 2.0, trackR: 1.85, dualRear: true,
  sillY: 0.62, beltY: 1.55, top: [[0, 1.55], [3.0, 1.55]], crown: 0, cornerF: 0.15, cornerR: 0.05, noseRake: 0, tailRake: 0, crease: 0.5, archGap: 0.06,
  hood: null,
  gh: { sA0: 0.06, sA1: 0.25, sC1: 2.9, sC0: 3.0, roofY: 2.75, beltInset: 0.0, roofHalfW: 1.18, crown: 0.03, bow: 0.04,
    bands: [{ u: 0, k: 'pillar' }, { u: 0.04, k: 'glass' }, { u: 0.38, k: 'pillar' }, { u: 0.43, k: 'glass' }, { u: 0.78, k: 'pillar' }], winV: [0.06, 0.85], splitWindshield: true, backlight: 'blank' },
});
const fireFront: Pick<ModelSpec, 'grille' | 'headlamps' | 'taillamps' | 'bumper' | 'rearBumper' | 'trim' | 'wheelStyle' | 'whitewall' | 'palette' | 'paint2' | 'roofColor' | 'metallicChance' | 'vinylChance'> = {
  grille: { kind: 'truck', hw: 0.55, y0: 0.75, y1: 1.35, bars: 6 },
  headlamps: { kind: 'quadRound', y: 1.05, xOut: 0.18, size: 0.15, housing: 'chrome' },
  taillamps: { kind: 'truck', y0: 0.95, y1: 1.1 },
  bumper: { kind: 'chrome', y: 0.45, h: 0.25, depth: 0.35, wrap: 0.05 },
  rearBumper: { kind: 'painted', y: 0.7, h: 0.14, depth: 0.1, wrap: 0.02 },
  trim: {}, wheelStyle: 'truck', whitewall: false,
  palette: [FIRE_RED, 0x9e1f18], paint2: 0xd8d6cf, roofColor: CAB_WHITE, metallicChance: 0, vinylChance: 0,
};
const pumper: ModelSpec = {
  id: 'pumper', cls: 'fire', displayName: 'Halloran Cab-Forward Pumper',
  ...fireCab(5.0), ...fireFront,
  cargo: [
    { kind: 'box', s0: 3.05, s1: 8.6, y0: 0.95, y1: 2.35, hw: 1.22, slot: 'paint', ribs: 6, ribSlot: 'chrome', band: [1.0, 1.08, 'chrome'] },
    { kind: 'ladder', s0: 3.3, s1: 8.4, y0: 2.42, y1: 2.42, hw: 0.28, slot: 'chrome', dressing: true },
  ],
  extras: ['lightBar', 'bell', 'mirrorsBoth'],
  seats: { driver: [-0.55, 1.75, -2.85], passenger: [0.55, 1.75, -2.85] },
  physics: truckPhysics({ mass: 13500, comY: 1.25, frontWeight: 0.38, torque: 1250, peakRpm: 1800, redline: 2800, gears: [4.5, 2.6, 1.55, 1.0], finalDrive: 4.9, cdA: 7, brakeForce: 0.55, maxSteer: 0.6 }),
};
const ladder: ModelSpec = {
  id: 'ladder', cls: 'ladder', displayName: 'Halloran Rear-Mount Aerial Ladder',
  ...fireCab(5.8), ...fireFront,
  cargo: [
    { kind: 'box', s0: 3.05, s1: 10.0, y0: 0.95, y1: 1.85, hw: 1.22, slot: 'paint', ribs: 8, ribSlot: 'chrome', band: [1.0, 1.08, 'chrome'] },
    { kind: 'turntable', s0: 9.0, s1: 9.6, y0: 1.85, y1: 2.15, hw: 0.55, slot: 'trim', dressing: true },
    { kind: 'ladder', s0: 0.4, s1: 9.4, y0: 2.3, y1: 3.0, hw: 0.45, slot: 'chrome', dressing: true },
  ],
  extras: ['lightBar', 'mirrorsBoth'],
  seats: { driver: [-0.55, 1.75, -3.25], passenger: [0.55, 1.75, -3.25] },
  physics: truckPhysics({ mass: 16500, comY: 1.35, frontWeight: 0.36, torque: 1300, peakRpm: 1800, redline: 2800, gears: [4.5, 2.6, 1.55, 1.0], finalDrive: 5.2, cdA: 7.5, brakeForce: 0.5, maxSteer: 0.62 }),
};

const courier: ModelSpec = {
  id: 'courier', cls: 'mail', displayName: 'Halloran Courier Right-Hand-Drive Mail Van',
  L: 4.4, W: 1.85, sF: 0.65, wheelbase: 2.8, wheelR: 0.36, tireW: 0.2, track: 1.55,
  sillY: 0.45, beltY: 1.05,
  top: [[0, 0.88], [0.05, 0.95], [0.45, 1.02], [0.5, 1.05], [4.4, 1.05]],
  crown: 0.02, cornerF: 0.14, cornerR: 0.06, noseRake: 0.04, tailRake: 0, crease: 0.5, archGap: 0.05,
  hood: [0.05, 0.45],
  gh: { sA0: 0.52, sA1: 0.7, sC1: 4.35, sC0: 4.4, roofY: 2.25, beltInset: 0.01, roofHalfW: 0.88, crown: 0.05, bow: 0.03,
    bands: [{ u: 0, k: 'pillar' }, { u: 0.015, k: 'door' }, { u: 0.17, k: 'blank' }], winV: [0.0, 0.8], backlight: 'twoWindows', splitWindshield: true },
  grille: { kind: 'horiz', hw: 0.38, y0: 0.5, y1: 0.78, bars: 3 },
  headlamps: { kind: 'dualRound', y: 0.68, xOut: 0.14, size: 0.17, housing: 'trim' },
  taillamps: { kind: 'vertical', y0: 0.6, y1: 0.95 },
  bumper: { kind: 'painted', y: 0.35, h: 0.16, depth: 0.08, wrap: 0.05 },
  trim: {}, wheelStyle: 'truck', whitewall: false,
  extras: ['mirrorsBoth', 'stepDoor'],
  // right-hand drive, as period mail vans were
  seats: { driver: [0.45, 1.1, -0.85], passenger: [-0.45, 1.1, -0.85] },
  palette: [0xe4e2da], metallicChance: 0, vinylChance: 0,
  physics: truckPhysics({ mass: 2300, comY: 0.85, frontWeight: 0.5, torque: 300, peakRpm: 2400, redline: 4000, gears: [2.5, 1.5, 1.0], finalDrive: 3.9, reverseRatio: 2.1, cdA: 3.2, freqF: 1.4, freqR: 1.5, brakeForce: 0.7, maxSteer: 0.65, steerRate: 1.8 }),
};

const scoop: ModelSpec = {
  id: 'scoop', cls: 'icecream', displayName: 'Halloran Walk-In Soft-Serve Truck',
  L: 2.2, W: 2.0, sF: 0.75, wheelbase: 3.3, wheelR: 0.4, tireW: 0.22, track: 1.7,
  sillY: 0.5, beltY: 1.15,
  top: [[0, 0.95], [0.05, 1.02], [0.55, 1.1], [0.62, 1.15], [2.2, 1.15]],
  crown: 0.02, cornerF: 0.16, cornerR: 0.05, noseRake: 0.04, tailRake: 0, crease: 0.5, archGap: 0.05,
  hood: [0.05, 0.58],
  gh: { sA0: 0.65, sA1: 0.95, sC1: 2.1, sC0: 2.15, roofY: 2.1, beltInset: 0.03, roofHalfW: 0.9, crown: 0.04, bow: 0.04,
    bands: [{ u: 0, k: 'pillar' }, { u: 0.05, k: 'glass' }, { u: 0.75, k: 'pillar' }], winV: [0.05, 0.9], backlight: 'blank', splitWindshield: true },
  cargo: [{ kind: 'box', s0: 2.22, s1: 5.9, y0: 0.8, y1: 2.6, hw: 1.08, slot: 'paint', band: [1.0, 1.14, 'paint2'] }],
  grille: { kind: 'horiz', hw: 0.42, y0: 0.55, y1: 0.85, bars: 4 },
  headlamps: { kind: 'dualRound', y: 0.78, xOut: 0.16, size: 0.18, housing: 'chrome' },
  taillamps: { kind: 'truck', y0: 0.95, y1: 1.1 },
  bumper: { kind: 'chrome', y: 0.42, h: 0.16, depth: 0.08, wrap: 0.1 },
  rearBumper: { kind: 'chrome', y: 0.6, h: 0.14, depth: 0.1, wrap: 0.02 },
  trim: {}, wheelStyle: 'hubcap', whitewall: false,
  extras: ['coneSign', 'serviceWindow', 'mirrorsBoth'],
  seats: { driver: [-0.45, 1.25, -1.0], passenger: [0.45, 1.25, -1.0] },
  palette: [0xefe6cf, 0xeee9dc], paint2: 0xd98aa6, roofColor: 'paint', metallicChance: 0, vinylChance: 0,
  physics: truckPhysics({ mass: 3600, comY: 1.0, frontWeight: 0.45, torque: 420, peakRpm: 2200, redline: 3800, gears: [2.5, 1.5, 1.0], finalDrive: 4.1, reverseRatio: 2.2, cdA: 4.6, freqF: 1.35, freqR: 1.5, brakeForce: 0.7, steerRate: 1.7 }),
};

export const MODELS: readonly ModelSpec[] = [bancroft, police, bancroftCab, tiverton, ferris, homestead, fareway, ct40, b60, walkin, b80, medic, pumper, ladder, courier, scoop];
export const MODEL_BY_ID = new Map(MODELS.map((m) => [m.id, m]));
