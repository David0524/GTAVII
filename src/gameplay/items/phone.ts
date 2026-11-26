import { Emitter } from '../core/events';
import type { Inventory } from './inventory';

/**
 * Payphones stand in for a cell phone (1974: a dime a call).
 *  - Placing a call: walk up to a working payphone, pay 10¢, pick a contact (narrative's list per lead)
 *    or the lead's answering service (Teddy: the Corwin desk) to hear queued messages.
 *  - Incoming mission calls: narrative queues a call; the nearest working payphone within RING_RADIUS
 *    of the player rings for RING_TIME s (diegetic ring + subtitle "a payphone is ringing"). Unanswered
 *    calls land in the answering service, so nothing is ever missed.
 */
export const CALL_CENTS = 10, RING_RADIUS = 90, RING_TIME = 30;
export interface Payphone { id: string; x: number; z: number; broken: boolean }
export interface PendingCall { id: string; lead: string; from: string; script?: string; ringing: string | null; t: number }
export interface PhoneEvents extends Record<string, unknown> {
  ring: { phone: string; call: string; lead: string; x: number; z: number };
  ringStop: { phone: string; call: string; answered: boolean };
  answered: { call: string; lead: string; from: string; script?: string };
  placed: { lead: string; phone: string; to: string };
  message: { lead: string; call: string; from: string; script?: string };
}

export class Phones extends Emitter<PhoneEvents> {
  readonly phones = new Map<string, Payphone>();
  readonly pending: PendingCall[] = [];
  readonly messages = new Map<string, { call: string; from: string; script?: string }[]>();
  constructor(private inv: Inventory) { super(); }

  add(p: Payphone) { this.phones.set(p.id, p); }
  setBroken(id: string, b: boolean) { const p = this.phones.get(id); if (p) p.broken = b; if (b) this.stopRinging(id); }
  nearest(x: number, z: number, max = Infinity) {
    let best: Payphone | null = null, bd = max;
    for (const p of this.phones.values()) { if (p.broken) continue; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  queueIncoming(call: { id: string; lead: string; from: string; script?: string }) { this.pending.push({ ...call, ringing: null, t: 0 }); }

  /** busy = in combat or being chased: phones don't ring for you then. */
  update(dt: number, lead: string, x: number, z: number, busy: boolean) {
    for (const c of [...this.pending]) {
      if (c.lead !== lead) continue;
      if (c.ringing) {
        c.t += dt;
        const p = this.phones.get(c.ringing);
        if (!p || p.broken || c.t > RING_TIME) { this.toMessages(c); this.emit('ringStop', { phone: c.ringing, call: c.id, answered: false }); }
      } else if (!busy) {
        const p = this.nearest(x, z, RING_RADIUS);
        if (p && ![...this.pending].some((o) => o.ringing === p.id)) { c.ringing = p.id; c.t = 0; this.emit('ring', { phone: p.id, call: c.id, lead, x: p.x, z: p.z }); }
      }
    }
  }
  private toMessages(c: PendingCall) {
    this.pending.splice(this.pending.indexOf(c), 1);
    const m = this.messages.get(c.lead) ?? []; m.push({ call: c.id, from: c.from, script: c.script }); this.messages.set(c.lead, m);
  }
  private stopRinging(phone: string) { for (const c of [...this.pending]) if (c.ringing === phone) { this.toMessages(c); this.emit('ringStop', { phone, call: c.id, answered: false }); } }

  /** Pick up a ringing phone (no dime needed for incoming). */
  answer(lead: string, phone: string): boolean {
    const c = this.pending.find((p) => p.ringing === phone && p.lead === lead);
    if (!c) return false;
    this.pending.splice(this.pending.indexOf(c), 1);
    this.emit('ringStop', { phone, call: c.id, answered: true });
    this.emit('answered', { call: c.id, lead, from: c.from, script: c.script });
    return true;
  }
  /** Place a call: costs a dime. `to` is a contact id or 'service' for the answering service. */
  place(lead: string, phone: string, to: string): { ok: boolean; reason?: 'broken' | 'no_dime' | 'unknown'; messages?: { call: string; from: string; script?: string }[] } {
    const p = this.phones.get(phone); if (!p) return { ok: false, reason: 'unknown' };
    if (p.broken) return { ok: false, reason: 'broken' };
    if (!this.inv.spend(lead, CALL_CENTS, 'payphone')) return { ok: false, reason: 'no_dime' };
    this.emit('placed', { lead, phone, to });
    if (to === 'service') {
      const msgs = this.messages.get(lead) ?? []; this.messages.set(lead, []);
      for (const m of msgs) this.emit('message', { lead, ...m });
      return { ok: true, messages: msgs };
    }
    return { ok: true };
  }
  serialize() { return { pending: this.pending.map((c) => ({ id: c.id, lead: c.lead, from: c.from, script: c.script })), messages: Object.fromEntries(this.messages) }; }
  deserialize(d: ReturnType<Phones['serialize']>) {
    this.pending.length = 0; this.messages.clear();
    for (const c of d?.pending ?? []) this.queueIncoming(c);
    for (const [k, v] of Object.entries(d?.messages ?? {})) this.messages.set(k, v);
  }
}
