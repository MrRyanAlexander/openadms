// What the firm calls its ADMS, and which Open ADMS it is built on, as the page shows them (the
// user, 2026-10-22: the firm "put their own White Label on it at setup … This would then brand it
// for them"). Read once through the API's public brand read, which needs no sign-in, so the
// sign-in screens say it too; "Open ADMS" until it answers. The page's title is the name.
//
// - `useBrand()` is `{ name, version }` for a screen's heading or footer; `version` is null until
//   the read has answered. `<BrandName />` is the name as text.
// - `brandChanged(name)` is for the screen where whoever holds Setup renames the firm's ADMS: the
//   change's answer is told to every place the name is shown, with no second read.
// - `builtOn` is the line's fixed parts: the product, the licence and where the source is (the
//   AGPL-3.0 attribution, §13). The words around them are the page's translation file's.
import { brandEndpoint } from '@open-adms/contracts';
import { startingBrandName } from '@open-adms/domain';
import { useEffect, useSyncExternalStore } from 'react';

import type { Api } from './api.ts';
import { useApi } from './reading.tsx';

export interface Brand {
  // What the firm calls its ADMS.
  readonly name: string;
  // Which Open ADMS release it is built on; null until the read has answered.
  readonly version: string | null;
}

export { builtOn } from '@open-adms/domain';

// The brand as the page holds it, and who is told when it changes. One for the page.
export class BrandStore {
  private brand: Brand = { name: startingBrandName, version: null };
  private reading: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly titled: (title: string) => void;

  constructor(titled: (title: string) => void) {
    this.titled = titled;
  }

  snapshot = (): Brand => this.brand;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  // Asks the API once; a read that didn't answer is asked again by the next screen that shows it.
  read(api: Pick<Api, 'ask'>): Promise<void> {
    this.reading ??= api.ask(brandEndpoint).then((reply) => {
      if (reply.kind === 'answered') this.set(reply.answer);
      else this.reading = null;
    });
    return this.reading;
  }

  // The firm renamed its ADMS here: shown at once, the release as it was.
  changed(name: string): void {
    this.set({ name, version: this.brand.version });
  }

  private set(next: Brand): void {
    if (next.name === this.brand.name && next.version === this.brand.version) return;
    this.brand = next;
    this.titled(next.name);
    for (const listener of this.listeners) listener();
  }
}

const page = new BrandStore((title) => {
  if (typeof document !== 'undefined') document.title = title;
});

export function useBrand(): Brand {
  const api = useApi();
  useEffect(() => {
    void page.read(api);
  }, [api]);
  return useSyncExternalStore(page.subscribe, page.snapshot);
}

export function brandChanged(name: string): void {
  page.changed(name);
}

// The name as text, for a heading, a title or a sentence.
export function BrandName() {
  return <>{useBrand().name}</>;
}
