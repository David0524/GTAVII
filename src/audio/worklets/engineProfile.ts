/**
 * Combustion engine profiles for the procedural engine synth (worklet 't74-engine').
 * Engine *types* of the era (crossplane big-block V8, worn inline six, two-stroke bus diesel,
 * four-stroke truck diesel). No real product is modelled: values are physical ballparks
 * (pipe lengths, idle and redline rpm, firing orders) tuned for character, not copied.
 */
export interface EngineProfile {
  id: string;
  cylinders: number;
  strokes: 2 | 4;
  /** Firing offsets within one cycle (0..1), sorted, one per cylinder. */
  firing: number[];
  /** Exhaust pipe (0 or 1) each firing in `firing` feeds. Separate banks make the V8 burble. */
  bank: number[];
  /** Effective pipe lengths (m) of the two exhaust paths. */
  pipeLen: [number, number];
  pipeFb: number;
  /** Muffler cutoff (Hz) at zero and full load. */
  muffler: [number, number];
  /** Body/exhaust resonances [Hz, Q, dB]. */
  resonances: [number, number, number][];
  pulseWidth: number; pulseNoise: number;
  rough: number; lope: number; misfire: number;
  intake: number; mech: number; knock: number;
  blower: number; blowerRatio: number;
  idle: number; redline: number;
  drive: number; level: number; overrun: number;
}

const even = (n: number) => Array.from({ length: n }, (_, k) => k / n);

export const ENGINE_PROFILES: Record<string, EngineProfile> = {
  /** Crossplane big-block V8 with true duals: banks fire L R R L R L L R, hence the burble. */
  v8_big: {
    id: 'v8_big', cylinders: 8, strokes: 4, firing: even(8), bank: [0, 1, 1, 0, 1, 0, 0, 1],
    pipeLen: [2.9, 3.15], pipeFb: 0.55, muffler: [380, 1700], resonances: [[95, 1.2, 4], [230, 2, 3], [520, 3, -3]],
    pulseWidth: 0.55, pulseNoise: 0.35, rough: 0.07, lope: 0.22, misfire: 0, intake: 0.18, mech: 0.05, knock: 0,
    blower: 0, blowerRatio: 0, idle: 620, redline: 4800, drive: 1.6, level: 0.9, overrun: 0.05,
  },
  /** Small-block V8 (cabs, step vans, police) - single collector, smoother, a little tappety. */
  v8_small: {
    id: 'v8_small', cylinders: 8, strokes: 4, firing: even(8), bank: [0, 1, 1, 0, 1, 0, 0, 1],
    pipeLen: [2.6, 2.6], pipeFb: 0.5, muffler: [450, 2000], resonances: [[120, 1.3, 3], [300, 2, 2]],
    pulseWidth: 0.5, pulseNoise: 0.3, rough: 0.06, lope: 0.1, misfire: 0.002, intake: 0.2, mech: 0.09, knock: 0,
    blower: 0, blowerRatio: 0, idle: 680, redline: 4600, drive: 1.4, level: 0.8, overrun: 0.03,
  },
  /** Worn inline six: even firing, single pipe, uneven compression and the odd miss. */
  i6_worn: {
    id: 'i6_worn', cylinders: 6, strokes: 4, firing: even(6), bank: [0, 0, 0, 0, 0, 0],
    pipeLen: [2.3, 2.3], pipeFb: 0.45, muffler: [520, 2300], resonances: [[160, 1.5, 3], [410, 2.5, 2]],
    pulseWidth: 0.45, pulseNoise: 0.45, rough: 0.16, lope: 0.08, misfire: 0.012, intake: 0.25, mech: 0.16, knock: 0,
    blower: 0, blowerRatio: 0, idle: 600, redline: 4200, drive: 1.3, level: 0.7, overrun: 0.02,
  },
  /** Compact four/six - buzzier and thinner. */
  i4_compact: {
    id: 'i4_compact', cylinders: 4, strokes: 4, firing: even(4), bank: [0, 0, 0, 0],
    pipeLen: [1.9, 1.9], pipeFb: 0.42, muffler: [650, 2800], resonances: [[210, 1.5, 3], [600, 2, 2]],
    pulseWidth: 0.4, pulseNoise: 0.4, rough: 0.09, lope: 0.04, misfire: 0.004, intake: 0.3, mech: 0.14, knock: 0,
    blower: 0, blowerRatio: 0, idle: 800, redline: 5600, drive: 1.5, level: 0.6, overrun: 0.02,
  },
  /** Two-stroke V6 city-bus diesel with a Roots blower: the howl comes from the blower and firing rate. */
  diesel_bus: {
    id: 'diesel_bus', cylinders: 6, strokes: 2, firing: even(6), bank: [0, 1, 0, 1, 0, 1],
    pipeLen: [3.8, 3.9], pipeFb: 0.5, muffler: [600, 2600], resonances: [[140, 1.4, 4], [880, 3, 3], [1750, 4, 2]],
    pulseWidth: 0.35, pulseNoise: 0.55, rough: 0.05, lope: 0.03, misfire: 0, intake: 0.15, mech: 0.12, knock: 0.35,
    blower: 0.32, blowerRatio: 1.95 * 6, idle: 520, redline: 2150, drive: 1.8, level: 0.85, overrun: 0,
  },
  /** Four-stroke inline-six truck diesel: clatter at idle, deep at load. */
  diesel_truck: {
    id: 'diesel_truck', cylinders: 6, strokes: 4, firing: even(6), bank: [0, 0, 0, 0, 0, 0],
    pipeLen: [3.5, 3.5], pipeFb: 0.52, muffler: [420, 1900], resonances: [[110, 1.2, 4], [650, 2.5, 3]],
    pulseWidth: 0.38, pulseNoise: 0.5, rough: 0.06, lope: 0.04, misfire: 0, intake: 0.2, mech: 0.1, knock: 0.5,
    blower: 0.04, blowerRatio: 9, idle: 600, redline: 2600, drive: 1.7, level: 0.85, overrun: 0,
  },
  /** Gasoline truck V8 (box trucks): low revving, heavy flywheel. */
  v8_truck: {
    id: 'v8_truck', cylinders: 8, strokes: 4, firing: even(8), bank: [0, 1, 1, 0, 1, 0, 0, 1],
    pipeLen: [3.4, 3.4], pipeFb: 0.55, muffler: [350, 1500], resonances: [[85, 1.2, 4], [260, 2, 2]],
    pulseWidth: 0.55, pulseNoise: 0.35, rough: 0.08, lope: 0.12, misfire: 0.003, intake: 0.12, mech: 0.1, knock: 0,
    blower: 0, blowerRatio: 0, idle: 560, redline: 3800, drive: 1.5, level: 0.85, overrun: 0.02,
  },
};

/** Vehicle class -> default engine profile. */
export const CLASS_ENGINE: Record<string, string> = {
  sedan: 'v8_small', hardtop: 'v8_big', compact: 'i4_compact', wagon: 'i6_worn', taxi: 'i6_worn', police: 'v8_big',
  bus: 'diesel_bus', box_truck: 'v8_truck', step_van: 'v8_small', garbage: 'diesel_truck',
};
