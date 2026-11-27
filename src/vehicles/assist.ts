/**
 * Driver assists for touch (and optionally pad): turns raw control values into the vehicle's
 * DriveInput. Design: docs/briefs/TOUCH_CONTROLS.md (gameplay branch). Default touch scheme =
 * analog gas and brake pedals + light steering assist; auto-accelerate is an opt-in setting.
 *
 *   const assist = new DriverAssist({ steerAssist: true });   // per player, from settings
 *   vehicle.setInput(assist.apply(raw, vehicle, dt));         // each physics step
 *
 * Nothing here changes the car's physics; it shapes the inputs the way a good driver's hands would,
 * so the soft 1970s handling stays controllable on a phone.
 */
import type { DriveInput } from './physics';

export interface AssistSettings {
  /** Smoothing + speed-sensitive ratio + counter-steer help. Default on for touch. */
  steerAssist: boolean;
  /** Assist strength 0..1 (UI slider). */
  steerAssistStrength: number;
  /** Throttle held automatically; the brake pedal slows / stops / reverses. Default off. */
  autoAccelerate: boolean;
  /** Auto-accelerate cruise cap (m/s); 0 = none. City default ~35 mph. */
  autoCruise: number;
  /** Pedal response exponents (>1 = finer control at the bottom of the travel). */
  throttleCurve: number;
  brakeCurve: number;
}

export const TOUCH_DEFAULTS: AssistSettings = { steerAssist: true, steerAssistStrength: 0.6, autoAccelerate: false, autoCruise: 15.6, throttleCurve: 1.7, brakeCurve: 1.35 };
/** Keyboard / pad: no shaping beyond what the pad layer does. */
export const PAD_DEFAULTS: AssistSettings = { steerAssist: false, steerAssistStrength: 0, autoAccelerate: false, autoCruise: 0, throttleCurve: 1.2, brakeCurve: 1.1 };

/** The minimum a car must expose for the assist (Vehicle satisfies it). */
export interface AssistTarget {
  speed: number;
  body: { linvel(): { x: number; y: number; z: number }; angvel(): { x: number; y: number; z: number } };
  object: { quaternion: { x: number; y: number; z: number; w: number } };
  /** Steering geometry, so the assist knows how fast the car *should* be rotating. */
  handling: { wheelbase: number; maxSteer: number };
}

export class DriverAssist {
  readonly s: AssistSettings;
  private steer = 0; private extra = 0;
  /** Diagnostics for the HUD / tests. */
  slip = 0; counterSteer = 0;

  constructor(settings: Partial<AssistSettings> = {}) { this.s = { ...TOUCH_DEFAULTS, ...settings }; }
  /** Apply settings changes live (the UI forwards its settings store on every change). */
  configure(settings: Partial<AssistSettings>) { Object.assign(this.s, settings); }

  apply(raw: DriveInput, car: AssistTarget, dt: number): DriveInput {
    const s = this.s;
    const v = car.speed, va = Math.abs(v);
    // ---- pedals: response curves give fine creeping and gentle stops from a thumb slider
    let throttle = Math.sign(raw.throttle) * Math.pow(Math.min(1, Math.abs(raw.throttle)), s.throttleCurve);
    let brake = Math.pow(Math.min(1, Math.max(0, raw.brake)), s.brakeCurve);
    if (s.autoAccelerate) {
      // gas is implicit; any brake lifts it; ease off in tight turns at speed; cruise governor
      throttle = brake > 0.02 ? 0 : 1 - 0.55 * Math.abs(raw.steer) * Math.min(1, va / 12);
      if (s.autoCruise > 0 && v > s.autoCruise) throttle = Math.max(0, throttle * (1 - (v - s.autoCruise) / 2));
    }

    // ---- steering
    let target = raw.steer;
    let extra = 0;
    if (s.steerAssist && s.steerAssistStrength > 0) {
      const k = s.steerAssistStrength;
      // speed-sensitive ratio on top of the physics: calmer at speed, full lock for parking
      target *= 1 / (1 + k * Math.max(0, va - 6) / 14);
      // counter-steer help (yaw stabilisation): compare the actual yaw rate with the rate the
      // player's steering asks for; only EXCESS rotation (oversteer, tail out) is counter-steered,
      // so normal cornering is never fought and there is no feedback loop.
      const h = car.handling;
      const delta = raw.steer * h.maxSteer / (1 + va / 22);
      const wantYaw = -(v * Math.tan(delta)) / h.wheelbase; // Rapier: +y = turning left; steer + = right
      const yaw = car.body.angvel().y;
      const excess = yaw - wantYaw;
      const oversteer = va > 4 && Math.abs(yaw) > Math.abs(wantYaw) + 0.05 && Math.sign(excess) === Math.sign(yaw);
      // rotating left too much -> steer right (+), and vice versa
      const cs = oversteer ? Math.max(-1, Math.min(1, excess * 2.2 * k)) : 0;
      this.counterSteer = cs; this.slip = excess;
      // counter-steer goes straight to the wheels (full authority at speed), and the assist lifts
      // off the throttle while the tail is out: a rear-drive car on power keeps rotating
      extra = cs * h.maxSteer;
      if (oversteer) throttle *= 1 - Math.min(1, Math.abs(excess) * 2.5) * k;
      // smoothing (first-order, faster to centre than away from it)
      const tau = Math.abs(target) < Math.abs(this.steer) ? 0.06 : 0.12;
      this.steer += (target - this.steer) * Math.min(1, dt / tau);
    } else this.steer = target;
    this.extra += (extra - this.extra) * Math.min(1, dt / 0.05);
    return { throttle, brake, steer: Math.max(-1, Math.min(1, this.steer)), handbrake: raw.handbrake, steerExtra: this.extra };
  }
}
