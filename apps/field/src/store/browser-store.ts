// The browser build's store (ARCHITECTURE §8; ADR-570): one IndexedDB database, `open-adms-phone`,
// holding its two keys (sealing.ts), which a script can use and never read, and every value sealed
// under them. Nothing of the phone's goes to the web layer's other storage (`localStorage`,
// cookies, a cache: AC-11-07). Good enough for testing and not device-grade (AC-11-03): the
// browser keeps the keys' material in its own profile on the computer's disk, and an erase
// leaves the old bytes to the browser's own clean-up, so real work never uses it.
import type { Change, Held, Kept, PhoneStore, Shelf } from './phone-store.ts';
import { Sealing } from './sealing.ts';

export const browserStoreName = 'open-adms-phone';
const keysShelf = 'keys';
const keysId = 'keys';
const rowsShelf = 'rows';

function answered<T>(asked: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    asked.onsuccess = () => {
      resolve(asked.result);
    };
    asked.onerror = () => {
      reject(asked.error ?? new Error('The phone’s store refused a request.'));
    };
  });
}

// A piece of work's end: written to disk (durability 'strict'), or undone.
function done(work: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    work.oncomplete = () => {
      resolve();
    };
    work.onerror = () => {
      reject(work.error ?? new Error('The phone’s store undid a piece of work.'));
    };
    work.onabort = () => {
      reject(work.error ?? new Error('The phone’s store undid a piece of work.'));
    };
  });
}

// Every row of a shelf: [shelf] sorts before [shelf, any name], and [shelf, []] after them all.
const onShelf = (shelf: Shelf) => IDBKeyRange.bound([shelf], [shelf, []]);

export class BrowserStore implements PhoneStore {
  private readonly database: IDBDatabase;
  private readonly sealing: Sealing;

  private constructor(database: IDBDatabase, sealing: Sealing) {
    this.database = database;
    this.sealing = sealing;
  }

  // The phone's store, made the first time with keys of its own. Nothing is asked of anyone.
  static async opened(name = browserStoreName): Promise<BrowserStore> {
    const asked = indexedDB.open(name, 1);
    asked.onupgradeneeded = () => {
      asked.result.createObjectStore(keysShelf);
      asked.result.createObjectStore(rowsShelf);
    };
    const database = await answered(asked);

    // The keys already there, or new ones kept, in one piece of work. Rows with no key are what
    // an erase cut short left, sealed under a key that is gone: they go too.
    const fresh = await Sealing.madeAnew();
    const work = database.transaction([keysShelf, rowsShelf], 'readwrite', {
      durability: 'strict',
    });
    let found: unknown;
    const read = work.objectStore(keysShelf).get(keysId);
    read.onsuccess = () => {
      found = read.result;
      if (found === undefined) {
        work.objectStore(keysShelf).put(fresh, keysId);
        work.objectStore(rowsShelf).clear();
        found = fresh;
      }
    };
    await done(work);
    const keys = Sealing.held(found);
    if (keys === undefined) {
      database.close();
      throw new Error('The phone’s store holds keys it didn’t make.');
    }
    return new BrowserStore(database, new Sealing(keys));
  }

  async change(changes: readonly Change[]): Promise<void> {
    // Sealed first: WebCrypto's waits would end a piece of work left open over them.
    const rows = await Promise.all(
      changes.map(async (change) => {
        const name = await this.sealing.nameOf(change.shelf, change.id);
        const sealed =
          'value' in change
            ? await this.sealing.sealed(change.shelf, name, change.id, change.value)
            : undefined;
        return { key: [change.shelf, name], sealed };
      }),
    );
    const work = this.database.transaction(rowsShelf, 'readwrite', { durability: 'strict' });
    const kept = work.objectStore(rowsShelf);
    for (const { key, sealed } of rows) {
      if (sealed === undefined) kept.delete(key);
      else kept.put(sealed, key);
    }
    await done(work);
  }

  async read(shelf: Shelf, id: string): Promise<Held | undefined> {
    const name = await this.sealing.nameOf(shelf, id);
    const work = this.database.transaction(rowsShelf, 'readonly');
    const sealed = await answered<unknown>(work.objectStore(rowsShelf).get([shelf, name]));
    if (sealed === undefined) return undefined;
    return (await this.sealing.opened(shelf, name, sealed)).value;
  }

  async readAll(shelf: Shelf): Promise<Kept[]> {
    const work = this.database.transaction(rowsShelf, 'readonly');
    const kept = work.objectStore(rowsShelf);
    const [keys, values] = await Promise.all([
      answered(kept.getAllKeys(onShelf(shelf))),
      answered<unknown[]>(kept.getAll(onShelf(shelf))),
    ]);
    return Promise.all(
      keys.map((key, at) => {
        const name = Array.isArray(key) && typeof key[1] === 'string' ? key[1] : '';
        return this.sealing.opened(shelf, name, values[at]);
      }),
    );
  }

  async erase(): Promise<void> {
    const keys = this.database.transaction(keysShelf, 'readwrite', { durability: 'strict' });
    keys.objectStore(keysShelf).delete(keysId);
    await done(keys);
    const rows = this.database.transaction(rowsShelf, 'readwrite', { durability: 'strict' });
    rows.objectStore(rowsShelf).clear();
    await done(rows);
    const name = this.database.name;
    this.database.close();
    await answered(indexedDB.deleteDatabase(name));
  }

  close(): void {
    this.database.close();
  }
}
