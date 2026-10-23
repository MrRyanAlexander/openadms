// What the phone calls the firm's ADMS (the user, 2026-10-22: the firm "put their own White Label
// on it at setup … This would then brand it for them"): the name it last read, kept in the phone's
// own store so the sign-in screens show it with no signal, and read again whenever the phone is
// online (the public brand read at enrolment, the proven-phone answer at sign-in). No secret and
// never sent. Until the phone has read one it says the product's own name.
import { readBrandName } from '@open-adms/domain';

import type { Json, PhoneStore } from '../store/phone-store.ts';

const shelf = 'settings';
const id = 'brand';

function nameIn(kept: Json | Uint8Array | undefined): string | undefined {
  if (typeof kept !== 'object' || kept === null || kept instanceof Uint8Array) return undefined;
  const name = Array.isArray(kept) ? undefined : (kept as Readonly<Record<string, Json>>)['name'];
  return typeof name === 'string' ? readBrandName(name) : undefined;
}

export class PhoneBrand {
  private readonly store: PhoneStore;
  private held: string;

  private constructor(store: PhoneStore, held: string) {
    this.store = store;
    this.held = held;
  }

  // The name the store holds, or `starting` where the phone has read none.
  static async opened(store: PhoneStore, starting: string): Promise<PhoneBrand> {
    return new PhoneBrand(store, nameIn(await store.read(shelf, id)) ?? starting);
  }

  now(): string {
    return this.held;
  }

  // A name the server told: kept before it is answered, when it is a name and is not the one held.
  async keep(told: string): Promise<string> {
    const name = readBrandName(told);
    if (name === undefined || name === this.held) return this.held;
    await this.store.change([{ shelf, id, value: { name } }]);
    this.held = name;
    return name;
  }
}
