// What the back office shows for the firm's ADMS (src/brand.tsx; the user, 2026-10-22): the
// product's own name until the public brand read answers, then the firm's, with the release; the
// page's title is the name; a rename made on its own screen is shown at once; a read that didn't
// answer is asked again, one that did is asked once. Against the real API, in a real browser: the
// back office's browser tests.
import { brandEndpoint } from '@open-adms/contracts';
import { describe, expect, it } from 'vitest';

import type { Api } from '../src/api.ts';
import { BrandStore } from '../src/brand.tsx';

// An API that answers the brand read as it is told to, and counts how often it was asked.
function answering(...replies: ('unreachable' | { name: string; version: string })[]) {
  const asked: string[] = [];
  const left = [...replies];
  const api = {
    ask: (served: unknown) => {
      asked.push((served as { path: string }).path);
      const reply = left.shift() ?? 'unreachable';
      return Promise.resolve(
        reply === 'unreachable' ? { kind: 'unreachable' } : { kind: 'answered', answer: reply },
      );
    },
  } as unknown as Pick<Api, 'ask'>;
  return { api, asked };
}

describe('the brand the back office shows', () => {
  it('is Open ADMS until the read answers, then the firm’s name with the release, and the title follows', async () => {
    const titles: string[] = [];
    const store = new BrandStore((title) => titles.push(title));
    const { api, asked } = answering({ name: 'Gates ADMS', version: '0.1.0' });
    expect(store.snapshot()).toEqual({ name: 'Open ADMS', version: null });
    let told = 0;
    store.subscribe(() => (told += 1));
    await store.read(api);
    expect(store.snapshot()).toEqual({ name: 'Gates ADMS', version: '0.1.0' });
    expect(titles).toEqual(['Gates ADMS']);
    expect(told).toBe(1);
    expect(asked).toEqual([brandEndpoint.path]);
    // Asked once for the page, however many screens show it.
    await store.read(api);
    expect(asked).toHaveLength(1);
  });

  it('asks again when the first read didn’t answer, and keeps the product’s name meanwhile', async () => {
    const store = new BrandStore(() => undefined);
    const { api, asked } = answering('unreachable', { name: 'Gates ADMS', version: '0.1.0' });
    await store.read(api);
    expect(store.snapshot().name).toBe('Open ADMS');
    await store.read(api);
    expect(store.snapshot().name).toBe('Gates ADMS');
    expect(asked).toHaveLength(2);
  });

  it('shows a rename made on its own screen at once, the release as it was, and tells nobody of no change', async () => {
    const titles: string[] = [];
    const store = new BrandStore((title) => titles.push(title));
    await store.read(answering({ name: 'Gates ADMS', version: '0.1.0' }).api);
    let told = 0;
    store.subscribe(() => (told += 1));
    store.changed('Gates Recovery ADMS');
    store.changed('Gates Recovery ADMS');
    expect(store.snapshot()).toEqual({ name: 'Gates Recovery ADMS', version: '0.1.0' });
    expect(titles).toEqual(['Gates ADMS', 'Gates Recovery ADMS']);
    expect(told).toBe(1);
  });
});
