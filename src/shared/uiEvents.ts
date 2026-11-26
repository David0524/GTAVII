/**
 * SHARED CONTRACT (proposed by the UI stream, engine-owned once merged; ENGINE_RESPONSES ui 1).
 * Game events the UI listens to, emitted by engine, gameplay, narrative and sim through UiHost.on().
 */
import type { LeadId, ObjectiveView, HeatView, DialogueChoice } from './uiHost';

export interface UiEvents {
  money: { lead: LeadId; delta: number; cash: number; reason?: string };
  subtitle: { speaker: string; text: string; channel: 'scene' | 'ambient'; seconds?: number };
  objective: ObjectiveView | null;
  /** A map place was introduced: tip, overheard line, newspaper ad, call, card or mission. */
  discover: { placeId: string; via: 'tip' | 'overheard' | 'news' | 'call' | 'card' | 'mission' | 'enter'; from?: string };
  notify: { kind: 'help' | 'toast' | 'saved'; text: string };
  heat: { phase: HeatView['phase']; radio?: string };
  damage: { amount: number; region?: string };
  inventory: { lead: LeadId };
  achievement: { id: string };
  lead: { id: LeadId };
  choices: { prompt?: string; choices: DialogueChoice[]; resolve: (id: string) => void };
}


/** Tiny typed emitter the hosts use. */
export class Emitter<E> {
  private m = new Map<keyof E, Set<(e: never) => void>>();
  on<K extends keyof E>(k: K, cb: (e: E[K]) => void) { const s = this.m.get(k) ?? new Set(); s.add(cb as (e: never) => void); this.m.set(k, s); return () => { s.delete(cb as (e: never) => void); }; }
  emit<K extends keyof E>(k: K, e: E[K]) { for (const cb of this.m.get(k) ?? []) (cb as (e: E[K]) => void)(e); }
}
