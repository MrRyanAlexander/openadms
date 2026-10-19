// A store and a keyring held in memory, for the tests of what the phone keeps (identity, its
// monitor, its lists): each records what it was handed, as the interfaces say, and nothing more.
import type { DeviceKey, Keyring, Secret } from '../src/store/keyring.ts';
import type { Change, Held, Kept, PhoneStore, Shelf } from '../src/store/phone-store.ts';
import { WebCryptoDeviceKey } from '../src/store/web-crypto-key.ts';

export class HeldStore implements PhoneStore {
  readonly shelves = new Map<string, Held>();
  change(changes: readonly Change[]): Promise<void> {
    for (const change of changes) {
      const at = `${change.shelf}/${change.id}`;
      if ('value' in change) this.shelves.set(at, change.value);
      else this.shelves.delete(at);
    }
    return Promise.resolve();
  }
  read(shelf: Shelf, id: string): Promise<Held | undefined> {
    return Promise.resolve(this.shelves.get(`${shelf}/${id}`));
  }
  readAll(shelf: Shelf): Promise<Kept[]> {
    return Promise.resolve(
      [...this.shelves]
        .filter(([at]) => at.startsWith(`${shelf}/`))
        .map(([at, value]) => ({ id: at.slice(shelf.length + 1), value })),
    );
  }
  erase(): Promise<void> {
    this.shelves.clear();
    return Promise.resolve();
  }
  close(): void {
    this.shelves.clear();
  }
}

export class HeldKeyring implements Keyring {
  key: DeviceKey | undefined;
  readonly secrets = new Map<Secret, string>();
  deviceKey(): Promise<DeviceKey | undefined> {
    return Promise.resolve(this.key);
  }
  async madeDeviceKey(): Promise<DeviceKey> {
    this.key = (await WebCryptoDeviceKey.madeAnew()).key;
    return this.key;
  }
  secret(name: Secret): Promise<string | undefined> {
    return Promise.resolve(this.secrets.get(name));
  }
  keep(name: Secret, value: string | undefined): Promise<void> {
    if (value === undefined) this.secrets.delete(name);
    else this.secrets.set(name, value);
    return Promise.resolve();
  }
  erase(): Promise<void> {
    this.key = undefined;
    this.secrets.clear();
    return Promise.resolve();
  }
}
