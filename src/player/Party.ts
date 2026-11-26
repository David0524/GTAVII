/**
 * Playable characters (ENGINE_RESPONSES N5): the player controller drives whichever lead is active;
 * every lead keeps its own position, heading, money, inventory and wardrobe, which the save system
 * persists. Lead ids come from the narrative team (`content/cast/leads.json`); these defaults keep the
 * engine runnable before that content is merged.
 */
export interface LeadState {
  id: string;
  displayName: string;
  at: { x: number; y: number; z: number; heading: number };
  money: number;
  inventory: string[];
  wardrobe: string;
}

export const DEFAULT_LEADS: Omit<LeadState, 'at'>[] = [
  { id: 'char.teddy_arce', displayName: 'Teddy', money: 40, inventory: [], wardrobe: 'default' },
  { id: 'char.delphine_moore', displayName: 'Delphine', money: 25, inventory: [], wardrobe: 'default' },
  { id: 'char.nick_varelas', displayName: 'Nick', money: 300, inventory: [], wardrobe: 'default' },
];

export class Party {
  readonly leads = new Map<string, LeadState>();
  activeId: string;
  private listeners = new Set<(from: string, to: string) => void>();

  constructor(spawn: { x: number; y: number; z: number; heading: number }, leads = DEFAULT_LEADS) {
    leads.forEach((l, i) => this.leads.set(l.id, { ...l, inventory: [...l.inventory], at: { ...spawn, x: spawn.x + i * 0.9 } }));
    this.activeId = leads[0].id;
  }
  get active(): LeadState { return this.leads.get(this.activeId)!; }
  onSwitch(cb: (from: string, to: string) => void) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  /** Switch the controlled lead. The caller stores the outgoing lead's live position first. */
  switchTo(id: string) {
    if (!this.leads.has(id) || id === this.activeId) return false;
    const from = this.activeId; this.activeId = id;
    for (const l of this.listeners) l(from, id);
    return true;
  }
}
