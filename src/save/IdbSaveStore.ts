/**
 * IndexedDB save backend.
 *
 * Object stores:
 *   profiles : Profile (key id)
 *   blobs    : { key, json }       (key `${profile}/${slot}/${generation}`): immutable save payloads
 *   pointers : { key, blob, meta } (key `${profile}/${slot}`): which blob is the live save for a slot
 *
 * Write = ONE readwrite transaction over blobs+pointers: put the new blob, flip the pointer, delete the
 * previous blob. IndexedDB transactions are atomic and durable on commit, so a tab killed mid-save
 * (common on mobile when backgrounded) leaves either the old save or the new one, never a torn one.
 * Durability is 'strict' where supported so the commit is flushed before we report success.
 */
import type { SaveData } from './schema';
import type { Profile, SaveStore, SlotMeta } from './SaveStore';
import { newId } from './SaveStore';

const DB = 't74-saves', VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
function done(tx: IDBTransaction): Promise<void> { return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error ?? new Error('transaction aborted')); }); }

export class IdbSaveStore implements SaveStore {
  readonly kind = 'indexeddb' as const;
  private constructor(private db: IDBDatabase) {}

  static async open(): Promise<IdbSaveStore> {
    const open = indexedDB.open(DB, VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('pointers')) db.createObjectStore('pointers', { keyPath: 'key' });
    };
    return new IdbSaveStore(await req(open));
  }

  private tx(stores: string[], mode: IDBTransactionMode) {
    return this.db.transaction(stores, mode, { durability: 'strict' } as IDBTransactionOptions);
  }

  async listProfiles(): Promise<Profile[]> {
    const all = await req(this.tx(['profiles'], 'readonly').objectStore('profiles').getAll()) as Profile[];
    return all.sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt));
  }
  async createProfile(name: string): Promise<Profile> {
    const now = new Date().toISOString();
    const p: Profile = { id: newId('p'), name, createdAt: now, lastPlayedAt: now };
    const t = this.tx(['profiles'], 'readwrite'); t.objectStore('profiles').put(p); await done(t);
    return p;
  }
  async renameProfile(id: string, name: string) {
    const t = this.tx(['profiles'], 'readwrite'); const s = t.objectStore('profiles');
    const p = await req(s.get(id)) as Profile | undefined; if (p) s.put({ ...p, name }); await done(t);
  }
  async touchProfile(id: string) {
    const t = this.tx(['profiles'], 'readwrite'); const s = t.objectStore('profiles');
    const p = await req(s.get(id)) as Profile | undefined; if (p) s.put({ ...p, lastPlayedAt: new Date().toISOString() }); await done(t);
  }
  async deleteProfile(id: string) {
    const t = this.tx(['profiles', 'blobs', 'pointers'], 'readwrite');
    t.objectStore('profiles').delete(id);
    const range = IDBKeyRange.bound(`${id}/`, `${id}/￿`);
    t.objectStore('blobs').delete(range); t.objectStore('pointers').delete(range);
    await done(t);
  }
  async listSlots(profileId: string): Promise<SlotMeta[]> {
    const range = IDBKeyRange.bound(`${profileId}/`, `${profileId}/￿`);
    const ptrs = await req(this.tx(['pointers'], 'readonly').objectStore('pointers').getAll(range)) as { meta: SlotMeta }[];
    return ptrs.map((p) => p.meta);
  }
  async read(profileId: string, slot: string): Promise<unknown | null> {
    const t = this.tx(['pointers', 'blobs'], 'readonly');
    const ptr = await req(t.objectStore('pointers').get(`${profileId}/${slot}`)) as { blob: string } | undefined;
    if (!ptr) return null;
    const blob = await req(t.objectStore('blobs').get(ptr.blob)) as { json: string } | undefined;
    return blob ? JSON.parse(blob.json) : null;
  }
  async write(profileId: string, slot: string, data: SaveData): Promise<SlotMeta> {
    const json = JSON.stringify(data);
    const meta: SlotMeta = { slot, label: data.label, savedAt: data.savedAt, playtimeSec: data.playtimeSec, version: data.version, bytes: json.length };
    const key = `${profileId}/${slot}`, blobKey = `${key}/${newId('g')}`;
    const t = this.tx(['pointers', 'blobs'], 'readwrite');
    const ptrs = t.objectStore('pointers'), blobs = t.objectStore('blobs');
    const old = await req(ptrs.get(key)) as { blob: string } | undefined;
    blobs.put({ key: blobKey, json });
    ptrs.put({ key, blob: blobKey, meta });
    if (old) blobs.delete(old.blob);
    await done(t);
    return meta;
  }
  async deleteSlot(profileId: string, slot: string) {
    const key = `${profileId}/${slot}`;
    const t = this.tx(['pointers', 'blobs'], 'readwrite');
    const ptr = await req(t.objectStore('pointers').get(key)) as { blob: string } | undefined;
    t.objectStore('pointers').delete(key); if (ptr) t.objectStore('blobs').delete(ptr.blob);
    await done(t);
  }
}
