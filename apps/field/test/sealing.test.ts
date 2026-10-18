// How the browser build seals what the phone keeps (src/store/sealing.ts; BACKLOG 3.2.1; ADR-570),
// run on Node's WebCrypto, the same interface the browser's is. The store around it, in
// IndexedDB in a real browser, is e2e/store.e2e.ts's.
import { describe, expect, it } from 'vitest';

import { Sealing, UnreadableValue } from '../src/store/sealing.ts';

// What Ana's phone might hold, every part of it something to look for in the sealed bytes.
const anaId = 'M004127';
const collection = {
  ticket: '101001',
  monitor: anaId,
  debrisType: 'Vegetative',
  address: '14 Heron St',
};
const photograph = new TextEncoder().encode('a photograph of 730416 at 14 Heron St');

const latin1 = (bytes: Uint8Array) => String.fromCharCode(...bytes);

describe('the browser build’s sealing', () => {
  it('AC-11-07, AC-11-08: its two keys are random and can’t be read out, and nothing makes them from a password', async () => {
    const keys = await Sealing.madeAnew();
    expect(keys.sealing.extractable).toBe(false);
    expect(keys.naming.extractable).toBe(false);
    expect(keys.sealing.algorithm).toEqual({ name: 'AES-GCM', length: 256 });
    expect(keys.naming.algorithm).toMatchObject({
      name: 'HMAC',
      hash: { name: 'SHA-256' },
      length: 256,
    });
    expect(keys.sealing.usages.sort()).toEqual(['decrypt', 'encrypt']);
    expect(keys.naming.usages).toEqual(['sign']);
    await expect(crypto.subtle.exportKey('raw', keys.sealing)).rejects.toThrow();
    await expect(crypto.subtle.exportKey('jwk', keys.naming)).rejects.toThrow();
    // Made with no input at all, two phones' keys name the same id differently.
    const other = new Sealing(await Sealing.madeAnew());
    expect(await new Sealing(keys).nameOf('loginList', anaId)).not.toBe(
      await other.nameOf('loginList', anaId),
    );
    expect(Sealing.held(keys)).toEqual(keys);
    expect(Sealing.held({ sealing: keys.sealing })).toBeUndefined();
    expect(Sealing.held({ sealing: keys.naming, naming: keys.sealing })).toBeUndefined();
    // Keys a script could read out are not the store's, whatever their kind.
    const readable = {
      sealing: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
        'encrypt',
        'decrypt',
      ]),
      naming: keys.naming,
    };
    expect(Sealing.held(readable)).toBeUndefined();
  });

  it('AC-11-07: a record and a photograph come back as they were kept, and their sealed bytes hold nothing of them', async () => {
    const sealing = new Sealing(await Sealing.madeAnew());
    const recordName = await sealing.nameOf('records', '0192a7c4-0000-7000-8000-000000000001');
    const sealedRecord = await sealing.sealed(
      'records',
      recordName,
      '0192a7c4-0000-7000-8000-000000000001',
      collection,
    );
    expect(await sealing.opened('records', recordName, sealedRecord)).toEqual({
      id: '0192a7c4-0000-7000-8000-000000000001',
      value: collection,
    });

    const photoName = await sealing.nameOf('photographs', 'photo-1');
    const sealedPhoto = await sealing.sealed('photographs', photoName, 'photo-1', photograph);
    const opened = await sealing.opened('photographs', photoName, sealedPhoto);
    expect(opened.value).toBeInstanceOf(Uint8Array);
    expect([...(opened.value as Uint8Array)]).toEqual([...photograph]);

    // An entry of the login list, kept under its Monitor ID, and nothing of it in the clear.
    const entryName = await sealing.nameOf('loginList', anaId);
    const sealedEntry = await sealing.sealed('loginList', entryName, anaId, { mark: 'x' });
    for (const [name, sealed] of [
      [recordName, sealedRecord],
      [photoName, sealedPhoto],
      [entryName, sealedEntry],
    ] as const) {
      for (const said of [anaId, '101001', 'Vegetative', 'Heron', '730416', 'photo-1']) {
        expect(latin1(sealed)).not.toContain(said);
        expect(name).not.toContain(said);
      }
      expect(name).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it('AC-11-07: the same value sealed twice is sealed differently (a fresh nonce each time), and one id has one name', async () => {
    const sealing = new Sealing(await Sealing.madeAnew());
    const name = await sealing.nameOf('lists', 'debrisTypes');
    expect(await sealing.nameOf('lists', 'debrisTypes')).toBe(name);
    expect(await sealing.nameOf('records', 'debrisTypes')).not.toBe(name);
    const once = await sealing.sealed('lists', name, 'debrisTypes', ['Vegetative', 'C&D']);
    const twice = await sealing.sealed('lists', name, 'debrisTypes', ['Vegetative', 'C&D']);
    expect(latin1(once)).not.toBe(latin1(twice));
    expect(latin1(once.slice(0, 12))).not.toBe(latin1(twice.slice(0, 12)));
  });

  it('AC-11-07, AC-11-10: a value changed, moved to another name or shelf, or sealed by another phone is refused, and the refusal names only the shelf', async () => {
    const sealing = new Sealing(await Sealing.madeAnew());
    const name = await sealing.nameOf('loginList', anaId);
    const samName = await sealing.nameOf('loginList', 'M004131');
    const sealed = await sealing.sealed('loginList', name, anaId, { mark: 'Ana’s mark' });

    const changed = sealed.slice();
    changed[changed.length - 1] = (changed[changed.length - 1] ?? 0) ^ 1;
    const elsewhere = new Sealing(await Sealing.madeAnew());
    const refusals = [
      () => sealing.opened('loginList', name, changed),
      () => sealing.opened('loginList', samName, sealed),
      () => sealing.opened('records', name, sealed),
      () => elsewhere.opened('loginList', name, sealed),
      () => sealing.opened('loginList', name, sealed.slice(0, 12)),
      () => sealing.opened('loginList', name, 'not bytes'),
      // Sealed under Sam's name with Ana's id inside: the seal opens, the id doesn't match it.
      async () =>
        sealing.opened(
          'loginList',
          samName,
          await sealing.sealed('loginList', samName, anaId, { mark: 'Ana’s mark' }),
        ),
    ];
    for (const refused of refusals) {
      const error: unknown = await refused().then(
        () => undefined,
        (failed: unknown) => failed,
      );
      expect(error).toBeInstanceOf(UnreadableValue);
      const said = (error as Error).message;
      expect(said).toMatch(/^A value kept on the (loginList|records) shelf can't be read/);
      for (const secret of [anaId, 'M004131', 'Ana’s mark', name]) {
        expect(said).not.toContain(secret);
      }
    }
  });
});
