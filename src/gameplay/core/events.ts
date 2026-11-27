/** Tiny typed event bus used by every gameplay system. Listeners may unsubscribe while firing. */
export type Listener<T> = (e: T) => void;

export class Emitter<M extends Record<string, unknown>> {
  private map = new Map<keyof M, Set<Listener<any>>>();
  on<K extends keyof M>(type: K, cb: Listener<M[K]>): () => void {
    let s = this.map.get(type);
    if (!s) this.map.set(type, (s = new Set()));
    s.add(cb);
    return () => s!.delete(cb);
  }
  emit<K extends keyof M>(type: K, e: M[K]) {
    const s = this.map.get(type);
    if (!s) return;
    for (const cb of [...s]) cb(e);
  }
  listenerCount(type: keyof M) { return this.map.get(type)?.size ?? 0; }
}
