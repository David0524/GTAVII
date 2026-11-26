import type { Rng } from '../core/rng';
import type { Look } from '../items/wardrobe';

/**
 * What a witness remembers, and how the police match it against what they see now.
 * Every field carries a confidence 0..1. Matching weighs fields by how distinctive they are:
 * clothes and the car carry most of it, so changing outfit and ditching the car breaks a description,
 * while the person themselves (sex/age/build phrase) keeps a floor that never reaches the stop threshold.
 */
export interface VehicleLook { id: string; vclass: string; colour: string; plate: string }
export interface Appearance {
  /** lead description phrase, e.g. "male, thirties, medium build" */
  subject: string;
  sex: 'male' | 'female';
  build: string;
  look: Look;
  vehicle: VehicleLook | null;
  armed: boolean;
}
export interface Field<T> { v: T; c: number }
export interface Description {
  subject?: Field<string>;
  sex?: Field<string>;
  clothes: Field<string>[];         // "tan leisure suit", "orange print shirt"
  hat?: Field<string>;
  vehicle?: { vclass?: Field<string>; colour?: Field<string>; plate?: Field<string>; id: string };
  armed?: Field<boolean>;
}

export const WEIGHTS = { subject: 0.18, sex: 0.07, clothes: 0.38, hat: 0.07, vclass: 0.08, vcolour: 0.1, plate: 0.12 } as const;

/** A witness forms a description. `clarity` 0..1 (distance, light, how long they looked, lead evasion). */
export function observe(a: Appearance, clarity: number, rng: Rng): Description {
  const roll = (bias: number) => rng.next() < Math.min(0.98, clarity + bias);
  const conf = (bias: number) => Math.max(0.15, Math.min(1, clarity + bias + rng.range(-0.1, 0.1)));
  const d: Description = { clothes: [] };
  if (roll(0.35)) d.sex = { v: a.sex, c: conf(0.3) };
  if (roll(0.05)) d.subject = { v: a.subject, c: conf(0) };
  a.look.words.forEach((w, i) => { if (i < 3 && roll(0.15 - i * 0.3)) d.clothes.push({ v: w, c: conf(-i * 0.15) }); });
  const hat = a.look.pieces.find((p) => p.slot === 'hat');
  if (hat && roll(-0.05)) d.hat = { v: `${hat.colour} ${hat.noun}`, c: conf(-0.1) };
  if (a.vehicle) {
    d.vehicle = { id: a.vehicle.id };
    if (roll(0.25)) d.vehicle.vclass = { v: a.vehicle.vclass, c: conf(0.1) };
    if (roll(0.2)) d.vehicle.colour = { v: a.vehicle.colour, c: conf(0.1) };
    const chars = Math.floor(clarity * 4.5 * rng.range(0.6, 1.1));
    if (chars >= 2) d.vehicle.plate = { v: a.vehicle.plate.slice(0, Math.min(chars, a.vehicle.plate.length)), c: conf(0) };
  }
  if (a.armed && roll(0.4)) d.armed = { v: true, c: conf(0.2) };
  return d;
}

/** Combine two accounts: agreeing fields gain confidence, conflicts keep the more confident one. */
export function merge(a: Description, b: Description): Description {
  const f = <T>(x?: Field<T>, y?: Field<T>): Field<T> | undefined => {
    if (!x) return y; if (!y) return x;
    if (x.v === y.v) return { v: x.v, c: Math.min(1, 1 - (1 - x.c) * (1 - y.c)) };
    return x.c >= y.c ? { v: x.v, c: x.c - y.c * 0.3 } : { v: y.v, c: y.c - x.c * 0.3 };
  };
  const clothes = new Map<string, number>();
  for (const c of [...a.clothes, ...b.clothes]) clothes.set(c.v, clothes.has(c.v) ? Math.min(1, 1 - (1 - clothes.get(c.v)!) * (1 - c.c)) : c.c);
  const out: Description = {
    subject: f(a.subject, b.subject), sex: f(a.sex, b.sex), hat: f(a.hat, b.hat), armed: f(a.armed, b.armed),
    clothes: [...clothes].map(([v, c]) => ({ v, c })).sort((p, q) => q.c - p.c).slice(0, 4),
  };
  if (a.vehicle || b.vehicle) {
    const va = a.vehicle, vb = b.vehicle;
    out.vehicle = { id: va?.id ?? vb!.id, vclass: f(va?.vclass, vb?.vclass), colour: f(va?.colour, vb?.colour), plate: longerPlate(va?.plate, vb?.plate) };
  }
  return out;
}
function longerPlate(a?: Field<string>, b?: Field<string>) {
  if (!a) return b; if (!b) return a;
  if (a.v.startsWith(b.v) || b.v.startsWith(a.v)) return a.v.length >= b.v.length ? { v: a.v, c: Math.max(a.c, b.c) } : { v: b.v, c: Math.max(a.c, b.c) };
  return a.c >= b.c ? a : b;
}

/**
 * How well the person in front of a cop fits the description, 0..1. Only fields the description has
 * count, normalised by the weight available, then shrunk toward 0 when the description is thin
 * (a lone "male" matches half the city, so it can't justify a stop on its own).
 */
export function match(d: Description, a: Appearance): number {
  let got = 0, avail = 0;
  const add = (w: number, c: number, ok: boolean) => { avail += w * c; if (ok) got += w * c; };
  if (d.subject) add(WEIGHTS.subject, d.subject.c, d.subject.v === a.subject);
  if (d.sex) add(WEIGHTS.sex, d.sex.c, d.sex.v === a.sex);
  if (d.clothes.length) {
    const w = WEIGHTS.clothes / d.clothes.length;
    for (const c of d.clothes) add(w, c.c, a.look.words.includes(c.v));
  }
  if (d.hat) { const hat = a.look.pieces.find((p) => p.slot === 'hat'); add(WEIGHTS.hat, d.hat.c, !!hat && `${hat.colour} ${hat.noun}` === d.hat.v); }
  if (d.vehicle) {
    const v = a.vehicle;
    // On foot vs. a vehicle description: the car fields simply don't apply (neither help nor hurt).
    if (v) {
      if (d.vehicle.vclass) add(WEIGHTS.vclass, d.vehicle.vclass.c, d.vehicle.vclass.v === v.vclass);
      if (d.vehicle.colour) add(WEIGHTS.vcolour, d.vehicle.colour.c, d.vehicle.colour.v === v.colour);
      if (d.vehicle.plate) add(WEIGHTS.plate, d.vehicle.plate.c, v.plate.startsWith(d.vehicle.plate.v));
    }
  }
  if (avail <= 0) return 0;
  const richness = Math.min(1, avail / 0.35);
  return (got / avail) * richness;
}

/** Radio / overheard phrasing: "…male, thirties, medium build, tan leisure suit, green sedan, plate starting 4K…" */
export function describeText(d: Description, minConf = 0.3): string {
  const parts: string[] = [];
  if (d.subject && d.subject.c >= minConf) parts.push(d.subject.v);
  else if (d.sex && d.sex.c >= minConf) parts.push(d.sex.v);
  for (const c of d.clothes) if (c.c >= minConf) parts.push(c.v);
  if (d.hat && d.hat.c >= minConf) parts.push(d.hat.v);
  if (d.vehicle) {
    const v = d.vehicle, car = [(v.colour?.c ?? 0) >= minConf ? v.colour!.v : '', v.vclass && v.vclass.c >= minConf ? v.vclass.v : ''].filter(Boolean).join(' ');
    if (car) parts.push(car);
    if (v.plate && v.plate.c >= minConf) parts.push(`plate starting ${v.plate.v}`);
  }
  if (d.armed?.v && d.armed.c >= minConf) parts.push('may be armed');
  return parts.length ? `…${parts.join(', ')}…` : '…no description…';
}
