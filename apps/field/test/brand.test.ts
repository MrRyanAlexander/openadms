// What the phone calls the firm's ADMS (src/phone/brand.ts; the user, 2026-10-22): the name it last
// read, kept in its own store so the sign-in screens show it with no signal; the product's own name
// until it has read one; and the server's brand read, the one call it makes before it is enrolled.
// Against the real API, in a real browser: e2e/brand.e2e.ts.
import { brandEndpoint, type Endpoint } from '@open-adms/contracts';
import { describe, expect, it } from 'vitest';

import { PhoneBrand } from '../src/phone/brand.ts';
import { Server, type Reply } from '../src/server.ts';
import { HeldStore } from './held.ts';

// A store that counts what it is asked to write.
class CountingStore extends HeldStore {
  writes = 0;
  override change(...asked: Parameters<HeldStore['change']>): Promise<void> {
    this.writes += 1;
    return super.change(...asked);
  }
}

describe('the name the phone shows for the firm’s ADMS', () => {
  it('is the product’s own until the phone has read one, then the last it read, kept across a restart', async () => {
    const store = new HeldStore();
    const brand = await PhoneBrand.opened(store, 'Open ADMS');
    expect(brand.now()).toBe('Open ADMS');
    expect(await brand.keep('  Gates ADMS ')).toBe('Gates ADMS');
    expect(brand.now()).toBe('Gates ADMS');
    // Opened again on the same store (the app started with no signal): the kept name.
    expect((await PhoneBrand.opened(store, 'Open ADMS')).now()).toBe('Gates ADMS');
  });

  it('keeps only a name, and writes the store only when the name changes', async () => {
    const store = new CountingStore();
    const brand = await PhoneBrand.opened(store, 'Open ADMS');
    await brand.keep('Gates ADMS');
    const writes = store.writes;
    expect(await brand.keep('Gates ADMS')).toBe('Gates ADMS');
    expect(await brand.keep('')).toBe('Gates ADMS');
    expect(await brand.keep('x'.repeat(41))).toBe('Gates ADMS');
    expect(store.writes).toBe(writes);
    expect((await PhoneBrand.opened(store, 'Open ADMS')).now()).toBe('Gates ADMS');
  });

  it('starts again from the product’s name when what the store holds is no name', async () => {
    const store = new HeldStore();
    await store.change([{ shelf: 'settings', id: 'brand', value: { name: 42 } }]);
    expect((await PhoneBrand.opened(store, 'Open ADMS')).now()).toBe('Open ADMS');
    await store.change([{ shelf: 'settings', id: 'brand', value: ['Gates ADMS'] }]);
    expect((await PhoneBrand.opened(store, 'Open ADMS')).now()).toBe('Open ADMS');
  });
});

class AnsweringServer extends Server {
  answers: 'ANSWERS' | 'UNREACHABLE' = 'ANSWERS';
  readonly asked: string[] = [];

  constructor() {
    super('https://api.adms.localhost');
  }

  override ask<E extends Endpoint>(served: E): Promise<Reply<E>> {
    this.asked.push(`${served.method} ${served.path}`);
    return Promise.resolve(
      ((served as Endpoint) === brandEndpoint && this.answers === 'ANSWERS'
        ? { kind: 'answered', answer: { name: 'Gates ADMS', version: '0.1.0' } }
        : { kind: 'unreachable' }) as Reply<E>,
    );
  }
}

describe('the server’s brand read', () => {
  it('gives the name the firm gave its ADMS, and nothing when the server isn’t there', async () => {
    const server = new AnsweringServer();
    expect(await server.brand()).toBe('Gates ADMS');
    server.answers = 'UNREACHABLE';
    expect(await server.brand()).toBeUndefined();
    expect(server.asked).toEqual(['GET /brand', 'GET /brand']);
  });
});
