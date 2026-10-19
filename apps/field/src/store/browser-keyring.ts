// The browser build's keyring (ARCHITECTURE §7.4, §8; BACKLOG 3.2.2, C110, C111; ADR-572): the
// device key kept in an IndexedDB database of its own, `open-adms-keyring`, as the browser keeps a
// WebCrypto key, which a script can use and never read; the store's own database never holds it.
// **Its secrets are held in memory alone.** The browser build has no secure storage: what IndexedDB
// holds lies in the browser's profile on the computer's disk. A proof's token is good for minutes
// and the phone proves itself again whenever it needs one, asking nobody anything (AC-11-12), so
// this build never writes one down: closed and opened again, it proves itself afresh. **The
// monitor's session likewise** (ADR-574): closed and opened again, nobody is signed in on it, and
// the monitor signs in again; nothing they made is lost, the store keeping it. Good enough
// for testing and not device-grade (AC-11-03); the native builds keep the key in the Secure Enclave
// or the Keystore and their secrets in the Keychain or the Keystore, this device only.
import type { DeviceKey, Keyring, Secret } from './keyring.ts';
import { WebCryptoDeviceKey } from './web-crypto-key.ts';

export const browserKeyringName = 'open-adms-keyring';
const keysShelf = 'keys';
const deviceId = 'device';

function answered<T>(asked: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    asked.onsuccess = () => {
      resolve(asked.result);
    };
    asked.onerror = () => {
      reject(asked.error ?? new Error('The phone’s keyring refused a request.'));
    };
  });
}

function done(work: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    work.oncomplete = () => {
      resolve();
    };
    work.onerror = () => {
      reject(work.error ?? new Error('The phone’s keyring undid a piece of work.'));
    };
    work.onabort = () => {
      reject(work.error ?? new Error('The phone’s keyring undid a piece of work.'));
    };
  });
}

export class BrowserKeyring implements Keyring {
  private readonly name: string;
  private readonly secrets = new Map<Secret, string>();
  private database: Promise<IDBDatabase> | undefined;

  // Nothing is opened until the device key is first asked for: a phone not yet enrolled has no
  // keyring database.
  constructor(name = browserKeyringName) {
    this.name = name;
  }

  async deviceKey(): Promise<DeviceKey | undefined> {
    const work = (await this.opened()).transaction(keysShelf, 'readonly');
    const pair = await answered<unknown>(work.objectStore(keysShelf).get(deviceId));
    return pair === undefined ? undefined : WebCryptoDeviceKey.of(pair);
  }

  async madeDeviceKey(): Promise<DeviceKey> {
    const { pair, key } = await WebCryptoDeviceKey.madeAnew();
    const work = (await this.opened()).transaction(keysShelf, 'readwrite', {
      durability: 'strict',
    });
    work.objectStore(keysShelf).put(pair, deviceId);
    await done(work);
    return key;
  }

  secret(name: Secret): Promise<string | undefined> {
    return Promise.resolve(this.secrets.get(name));
  }

  keep(name: Secret, value: string | undefined): Promise<void> {
    if (value === undefined) this.secrets.delete(name);
    else this.secrets.set(name, value);
    return Promise.resolve();
  }

  async erase(): Promise<void> {
    this.secrets.clear();
    const database = await this.opened();
    const work = database.transaction(keysShelf, 'readwrite', { durability: 'strict' });
    work.objectStore(keysShelf).clear();
    await done(work);
    database.close();
    this.database = undefined;
    await answered(indexedDB.deleteDatabase(this.name));
  }

  private opened(): Promise<IDBDatabase> {
    this.database ??= (async () => {
      const asked = indexedDB.open(this.name, 1);
      asked.onupgradeneeded = () => {
        asked.result.createObjectStore(keysShelf);
      };
      const database = await answered(asked);
      // Another hand deleting the database (a wipe) isn't held up by this connection.
      database.onversionchange = () => {
        database.close();
        this.database = undefined;
      };
      return database;
    })();
    // A database that wouldn't open is asked again next time.
    this.database.catch(() => {
      this.database = undefined;
    });
    return this.database;
  }
}
