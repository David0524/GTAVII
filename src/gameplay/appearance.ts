import type { VehicleLook } from './police/description';

/** 1974 New York passenger plates: three letters, three digits ("ABC-123"), gold on blue. Invented per vehicle. */
const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
export function plateFor(vehicleId: string, generation = 0): string {
  let h = 2166136261;
  const s = `${vehicleId}#${generation}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h >>>= 0;
  const a = L[h % 23], b = L[(h >>> 5) % 23], c = L[(h >>> 10) % 23];
  const n = String((h >>> 15) % 1000).padStart(3, '0');
  return `${a}${b}${c}-${n}`;
}
export interface PlayerVehicle { id: string; vclass: string; colour: string }
export function vehicleLook(v: PlayerVehicle | null, plates: number): VehicleLook | null {
  return v ? { id: v.id, vclass: v.vclass, colour: v.colour, plate: plateFor(v.id, plates) } : null;
}
