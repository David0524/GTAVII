/**
 * Traversal motion: the characters' side of the root-motion contract (ENGINE_REQUESTS "From
 * characters: 5"). The engine (or the test course's stand-in controller) detects a traversal and
 * sends a TraversalEvent; `traversalMotion()` returns how long it takes and the root path (forward
 * and up offsets from where it started, in metres) that the controller applies to the capsule, plus
 * the hand-contact window for hand IK and the clip to play.
 *
 * Timings are from our own reference study of 1970s street footage and the feel bar in
 * docs/briefs/MOVEMENT.md (weighty, never floaty): a vault at a run keeps most of its speed; a
 * climb is a hand plant, a hop and a knee-up; a chain-link fence is a slower scramble with a drop.
 */
export type TraversalKind = 'vault' | 'climb' | 'fence' | 'ladder' | 'dropLadder' | 'hangDrop' | 'drop' | 'roofJump' | 'turnstile';

export interface TraversalEvent {
  kind: TraversalKind;
  /** Height of the obstacle top (or ladder top) above the feet, m. */
  height: number;
  /** Depth of the obstacle along the motion (0.05 for a rail, 1.6 for a car hood), m. */
  depth: number;
  /** Height of the landing relative to the start (negative = lower), m. */
  landRise: number;
  /** Horizontal speed coming in, m/s. */
  speed: number;
  /** Distance from the feet to the obstacle face when it started, m. */
  approach: number;
}

export interface TraversalMotion {
  duration: number;
  /** Root offset at time t (0..duration): [forward, up] in metres from the start position. */
  root: (t: number) => [number, number];
  /** Normalised windows (0..1) where each hand is planted on the obstacle top (hand IK). */
  hands: { l?: [number, number]; r?: [number, number] };
  /** Exit speed (m/s): vaults keep momentum, climbs end standing. */
  exitSpeed: number;
  /** Clip to play (procedural or library), and whether the landing ends in a roll. */
  clip: string;
  roll?: boolean;
}

const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const G = 9.81;

export function traversalMotion(e: TraversalEvent): TraversalMotion {
  const reach = e.approach;
  switch (e.kind) {
    case 'vault': {
      // one-hand (low) or two-hand speed vault: the hips clear the top by about 0.15 m,
      // ground contact is lost for about 0.35 s, most of the speed is kept
      const v = Math.max(2.2, e.speed * 0.9);
      const across = reach + e.depth + 0.6;
      const duration = Math.max(0.45, across / v);
      const clear = e.height + 0.12;
      return {
        duration,
        root: (t) => {
          const u = t / duration;
          // an arc over the top (hips clear it), blending into the landing height
          const arc = u < 0.8 ? clear * Math.sin(Math.PI * (u / 0.8)) : 0;
          return [across * u, Math.max(arc, e.landRise * ss(0.55, 1, u))];
        },
        hands: e.height < 0.8 ? { l: [0.25, 0.55] } : { l: [0.22, 0.55], r: [0.25, 0.5] },
        exitSpeed: v * 0.85, clip: 'vault',
      };
    }
    case 'turnstile':
      return { ...traversalMotion({ ...e, kind: 'vault' }), clip: 'vault_turnstile', hands: { l: [0.2, 0.5], r: [0.22, 0.5] } };
    case 'climb': {
      // hand plant at the top, hop, knee-up, stand: 0.9-1.4 s depending on height; ends at rest
      const duration = 0.75 + (e.height - 1.2) * 0.6;
      const fwd = reach + 0.45;
      return {
        duration,
        root: (t) => {
          const u = t / duration;
          return [fwd * ss(0.45, 1, u) + reach * 0.3 * ss(0, 0.3, u) * (1 - ss(0.45, 1, u)), e.height * ss(0.1, 0.75, u)];
        },
        hands: { l: [0.12, 0.7], r: [0.15, 0.72] }, exitSpeed: 0, clip: 'climb',
      };
    }
    case 'fence': {
      // chain-link: hands and toes in the mesh, about 0.9 m/s up, swing a leg over, drop the far side
      const upT = e.height / 0.9, overT = 0.55;
      const fallT = Math.sqrt((2 * Math.max(0.3, e.height + e.landRise - 1.0)) / G);
      const duration = 0.25 + upT + overT + fallT + 0.35;
      return {
        duration,
        root: (t) => {
          const a = 0.25, b = a + upT, c = b + overT, d = c + fallT;
          if (t < a) return [reach * ss(0, a, t), 0];
          if (t < b) return [reach, (e.height - 0.9) * ss(a, b, t)];
          if (t < c) return [reach + 0.5 * ss(b, c, t), e.height - 0.9 + 0.15 * Math.sin(Math.PI * (t - b) / overT)];
          if (t < d) { const k = (t - c) / fallT; return [reach + 0.5 + 0.1 * k, e.height - 0.9 - (e.height - 0.9 - e.landRise) * k * k]; }
          return [reach + 0.6, e.landRise];
        },
        hands: { l: [0.1, 0.62], r: [0.12, 0.6] }, exitSpeed: 0, clip: 'fence', roll: false,
      };
    }
    case 'ladder':
    case 'dropLadder': {
      // jump and pull the drop ladder down (fire escapes), then climb at 0.55 m/s, step off at the top
      const pull = e.kind === 'dropLadder' ? 1.1 : 0;
      const climbT = e.height / 0.55;
      const duration = pull + 0.3 + climbT + 0.6;
      return {
        duration,
        root: (t) => {
          if (t < pull + 0.3) return [reach * ss(0, pull + 0.3, t), 0];
          const c = t - pull - 0.3;
          if (c < climbT) return [reach, e.height * (c / climbT)];
          return [reach + 0.5 * ss(0, 0.6, c - climbT), e.height];
        },
        hands: { l: [0, 1], r: [0, 1] }, exitSpeed: 0, clip: e.kind === 'dropLadder' ? 'ladder_pull' : 'ladder',
      };
    }
    case 'hangDrop':
    case 'drop': {
      // hang-drop lowers the body by the arm length first (about 1.9 m less fall); a roll above 2.5 m
      const hang = e.kind === 'hangDrop' ? 0.6 : 0;
      const fall = Math.max(0.2, -e.landRise - (e.kind === 'hangDrop' ? 1.9 : 0));
      const fallT = Math.sqrt((2 * fall) / G);
      const roll = fall > 2.5 && fall < 6;
      const duration = hang + fallT + (roll ? 0.7 : 0.3);
      return {
        duration,
        root: (t) => {
          if (t < hang) return [reach * ss(0, hang, t), -(e.kind === 'hangDrop' ? 1.9 : 0) * ss(hang * 0.4, hang, t)];
          const f = t - hang;
          const y0 = e.kind === 'hangDrop' ? -1.9 : 0;
          if (f < fallT) { const k = f / fallT; return [reach + 0.4 * k, y0 - fall * k * k]; }
          return [reach + 0.4 + (roll ? 1.2 * ss(0, 0.7, f - fallT) : 0), e.landRise];
        },
        hands: e.kind === 'hangDrop' ? { l: [0, 0.35], r: [0, 0.35] } : {},
        exitSpeed: roll ? 2.0 : 0, clip: roll ? 'drop_roll' : 'drop_land', roll,
      };
    }
    case 'roofJump': {
      // run-up jump: ballistic, take-off at speed, a 0.4 m apex
      const v = Math.max(4.5, e.speed);
      const span = reach + e.depth + 0.8;
      const vy = Math.sqrt(2 * G * 0.4);
      const tUp = vy / G, tFlight = tUp + Math.sqrt(Math.max(0.01, 2 * (0.4 - e.landRise) / G));
      const duration = Math.max(span / v, tFlight);
      return {
        duration,
        root: (t) => {
          const u = t / duration;
          const yt = Math.min(t, tFlight);
          return [span * u, Math.max(e.landRise, vy * yt - 0.5 * G * yt * yt)];
        },
        hands: {}, exitSpeed: v * 0.8, clip: 'roof_jump',
      };
    }
  }
}

/** Classify a feature by height (gameplay's MOVEMENT rules: <= 0.4 step, 0.5-1.2 vault, 1.2-2.2 climb). */
export function classifyHeight(h: number): 'step' | 'vault' | 'climb' | 'tooHigh' {
  return h <= 0.4 ? 'step' : h <= 1.2 ? 'vault' : h <= 2.2 ? 'climb' : 'tooHigh';
}
