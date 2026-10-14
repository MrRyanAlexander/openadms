// What a phone's login-list entry is made from, with no database (ARCHITECTURE §7.2; AC-02-41;
// ADR-412, 449, 454): a monitor's offline seed is sealed for that monitor under a key of this
// installation's, and a mark says which entry a phone holds without holding it.
import { describe, expect, it } from 'vitest';

import { OfflineChecks } from '../src/phone/offline-checks.ts';

const lee = '0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d11';
const ana = '0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d12';
const phone = '0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d21';
const anotherPhone = '0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d22';
const password = '5550142';

describe('a monitor’s offline seed', () => {
  const offline = new OfflineChecks('made-up-signing-secret-for-this-test-only');

  it('AC-02-41 is sealed: it holds nothing readable, is another value each time it is made, and opens only for its own monitor under this installation’s secret', async () => {
    const seed = await offline.seedOf(lee, password);
    expect(seed).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(seed).not.toContain('argon2id');
    expect(Buffer.from(seed.split('.')[2] ?? '', 'base64url').toString()).not.toContain('argon2id');
    expect(await offline.seedOf(lee, password)).not.toBe(seed);
    expect(await offline.entry(lee, seed)).toBeDefined();
    // Put on another monitor's row, opened by another installation, or altered: nothing.
    expect(await offline.entry(ana, seed)).toBeUndefined();
    expect(
      await new OfflineChecks('another-installation’s-secret').entry(lee, seed),
    ).toBeUndefined();
    const [version, nonce, hidden, tag] = seed.split('.');
    const altered = [version, nonce, `${(hidden ?? '').slice(0, -2)}AA`, tag].join('.');
    expect(await offline.entry(lee, altered)).toBeUndefined();
    expect(await offline.entry(lee, 'v2.a.b.c')).toBeUndefined();
  });

  it('is made again at a sign-in only where there is none or this process can’t open it', async () => {
    const seed = await offline.seedOf(lee, password);
    expect([
      offline.stale(lee, seed),
      offline.stale(lee, null),
      offline.stale(ana, seed),
      offline.stale(lee, 'v1.a.b.c'),
    ]).toEqual([false, true, true, true]);
  });

  it('a mark is one phone’s, one monitor’s and one seed’s, and says nothing of the seed', async () => {
    const seed = await offline.seedOf(lee, password);
    const mark = offline.mark(phone, lee, seed);
    expect(mark).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(offline.mark(phone, lee, seed)).toBe(mark);
    expect(offline.sameMark(mark, offline.mark(phone, lee, seed))).toBe(true);
    for (const other of [
      offline.mark(anotherPhone, lee, seed),
      offline.mark(phone, ana, seed),
      offline.mark(phone, lee, await offline.seedOf(lee, password)),
      new OfflineChecks('another-installation’s-secret').mark(phone, lee, seed),
    ]) {
      expect(offline.sameMark(mark, other)).toBe(false);
    }
    expect(offline.sameMark(mark, 'short')).toBe(false);
  });

  it('the master passcode’s check is made only from a hash with no key', async () => {
    const unkeyed =
      // secretlint-disable-next-line -- a made-up hash: its salt and tag are words, base64
      '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g';
    const made = await offline.ofPasscode(unkeyed);
    expect(made?.first).toEqual({
      salt: 'c2FsdHNhbHRzYWx0c2FsdA',
      memory: 19456,
      passes: 2,
      parallelism: 1,
      bytes: 32,
    });
    expect(made?.check).not.toContain('aGFzaGhhc2g');
    expect(await offline.ofPasscode(unkeyed.replace('p=1$', 'p=1,keyid=djE$'))).toBeUndefined();
  });
});
