// The phone's own settings (BUILD.md, settled 7): kept on the phone, never a monitor's or a day's,
// and never sent. Each has a default; a phone that never changed one has it.
//
// - **"Take a scanner's keys anywhere on the screen"** (WCAG 2.1.4; ADR-596, 606 (4)): on by
//   default. On, a scan field takes the keys a keyboard-style scanner types wherever the focus is
//   on its screen, outside another field (`ScanField`); off, only where the field has the focus.
import type { Json, PhoneStore } from '../store/phone-store.ts';

const shelf = 'settings';
const id = 'phone';

export interface Settings {
  readonly scannerKeysAnywhere: boolean;
}

// A list, as JSON writes one (Array.isArray narrows no readonly array).
function isList(value: Json): value is readonly Json[] {
  return Array.isArray(value);
}

const defaults: Settings = { scannerKeysAnywhere: true };

export class PhoneSettings {
  private readonly store: PhoneStore;
  private held: Settings;

  private constructor(store: PhoneStore, held: Settings) {
    this.store = store;
    this.held = held;
  }

  // The settings as the store holds them, the defaults where it holds none.
  static async opened(store: PhoneStore): Promise<PhoneSettings> {
    const kept = await store.read(shelf, id);
    const keptOne =
      typeof kept === 'object' && kept !== null && !(kept instanceof Uint8Array) && !isList(kept)
        ? kept['scannerKeysAnywhere']
        : undefined;
    const scannerKeysAnywhere =
      typeof keptOne === 'boolean' ? keptOne : defaults.scannerKeysAnywhere;
    return new PhoneSettings(store, { scannerKeysAnywhere });
  }

  now(): Settings {
    return this.held;
  }

  // One setting changed, kept before it is answered.
  async keep(changed: Partial<Settings>): Promise<Settings> {
    const next = { ...this.held, ...changed };
    await this.store.change([{ shelf, id, value: { ...next } }]);
    this.held = next;
    return next;
  }
}
