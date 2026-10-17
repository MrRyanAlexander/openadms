// What a phone's login-list entry is made from, with no database (ARCHITECTURE §7.2; AC-02-41;
// ADR-412, 449, 454, 542): a monitor's offline seed and the master passcode's are sealed, for that
// monitor or that version, under this installation's sealing key, and a mark says which entry a
// phone holds without holding it.
import { argon2, createCipheriv, createHmac, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { OfflineChecks } from '../src/phone/offline-checks.ts';

const sealingKey = 'made-up-sealing-key-for-this-test-only';
const signingSecret = 'made-up-signing-secret-for-this-test-only';

// A seed as the API sealed it before ADR-542: under a key drawn from the signing secret, `v1`.
async function sealedTheEarlierWay(userId: string, typed: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await new Promise<Buffer>((resolve, reject) => {
    argon2(
      'argon2id',
      { message: typed, nonce: salt, memory: 19456, passes: 2, parallelism: 1, tagLength: 32 },
      (error, tag) => {
        if (error === null) resolve(tag);
        else reject(error);
      },
    );
  });
  const b64 = (bytes: Buffer): string => bytes.toString('base64').replace(/=+$/, '');
  const plain = Buffer.from(`$argon2id$v=19$m=19456,t=2,p=1$${b64(salt)}$${b64(hash)}`);
  const key = createHmac('sha256', signingSecret).update('open-adms/offline-seed/v1').digest();
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(`offline-seed\n${userId}`));
  const hidden = Buffer.concat([cipher.update(plain), cipher.final()]);
  return ['v1', ...[nonce, hidden, cipher.getAuthTag()].map((b) => b.toString('base64url'))].join(
    '.',
  );
}

// The first slow hash a phone makes from what is typed, by the first step it was sent.
function firstHashOf(
  typed: string,
  step: { salt: string; memory: number; passes: number; parallelism: number; bytes: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      'argon2id',
      {
        message: typed,
        nonce: Buffer.from(step.salt, 'base64'),
        memory: step.memory,
        passes: step.passes,
        parallelism: step.parallelism,
        tagLength: step.bytes,
      },
      (error, tag) => {
        if (error === null) resolve(tag);
        else reject(error);
      },
    );
  });
}

const lee = '0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d11';
const ana = '0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d12';
const phone = '0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d21';
const anotherPhone = '0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d22';
const password = '5550142';

describe('a monitor’s offline seed', () => {
  const offline = new OfflineChecks(sealingKey, signingSecret);

  it('AC-02-41 is sealed: it holds nothing readable, is another value each time it is made, and opens only for its own monitor under this installation’s secret', async () => {
    const seed = await offline.seedOf(lee, password);
    expect(seed).toMatch(/^v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(seed).not.toContain('argon2id');
    expect(Buffer.from(seed.split('.')[2] ?? '', 'base64url').toString()).not.toContain('argon2id');
    expect(await offline.seedOf(lee, password)).not.toBe(seed);
    expect(await offline.entry(lee, seed)).toBeDefined();
    // Put on another monitor's row, opened by another installation, or altered: nothing.
    expect(await offline.entry(ana, seed)).toBeUndefined();
    expect(
      await new OfflineChecks('another-installation’s-secret').entry(lee, seed),
    ).toBeUndefined();
    // One character in the middle made another: it carries six bits of the hidden part, so the
    // seed always changes (the last ones may carry unused bits, C173).
    const [version, nonce, hidden = '', tag] = seed.split('.');
    const at = Math.floor(hidden.length / 2);
    const other = hidden[at] === 'A' ? 'B' : 'A';
    const altered = [
      version,
      nonce,
      `${hidden.slice(0, at)}${other}${hidden.slice(at + 1)}`,
      tag,
    ].join('.');
    expect(await offline.entry(lee, altered)).toBeUndefined();
    expect(await offline.entry(lee, 'v3.a.b.c')).toBeUndefined();
    // Sealed under the signing secret is no seed of the sealing key's (ADR-542).
    expect(await new OfflineChecks(signingSecret).entry(lee, seed)).toBeUndefined();
  });

  it('AC-10-109 one sealed before the keys were parted (v1, under a key drawn from the signing secret) still opens where the signing secret is given, and is made again at the next sign-in; with no signing secret it opens nothing', async () => {
    const earlier = await sealedTheEarlierWay(lee, password);
    expect(await offline.entry(lee, earlier)).toBeDefined();
    expect(offline.stale(lee, earlier)).toBe(true);
    expect(await new OfflineChecks(sealingKey).entry(lee, earlier)).toBeUndefined();
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

  it('AC-10-109 the master passcode’s check and its offline proof are made from its own sealed seed, bound to its version: never from the hash the server checks it against, so a copy of the database holds nothing a proof can be made from', async () => {
    const passcode = 'osprey-landing-marsh';
    const seed = await offline.passcodeSeedOf(3, passcode);
    expect(seed).toMatch(/^v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(seed).not.toContain('argon2id');
    const made = await offline.ofPasscode(3, seed);
    expect(made?.first).toMatchObject({ memory: 19456, passes: 2, parallelism: 1, bytes: 32 });
    // The phone's first step, from what was typed, proves a sign-in made offline.
    const first = await firstHashOf(
      passcode,
      made?.first ?? { salt: '', memory: 0, passes: 0, parallelism: 0, bytes: 0 },
    );
    const signed = 'what the sign-in says';
    const proof = OfflineChecks.proofOf(first, signed);
    expect(offline.signedWithPasscode(3, seed, signed, proof)).toBe(true);
    // Another passcode's first step proves nothing.
    const wrong = await firstHashOf(
      'heron-marsh-ferry',
      made?.first ?? { salt: '', memory: 0, passes: 0, parallelism: 0, bytes: 0 },
    );
    expect(offline.signedWithPasscode(3, seed, signed, OfflineChecks.proofOf(wrong, signed))).toBe(
      false,
    );
    // Put on another version, a monitor's row, or opened by another installation: nothing.
    expect(await offline.ofPasscode(4, seed)).toBeUndefined();
    expect(offline.signedWithPasscode(4, seed, signed, proof)).toBe(false);
    expect(await offline.entry(lee, seed)).toBeUndefined();
    expect(
      await new OfflineChecks('another-installation’s-key').ofPasscode(3, seed),
    ).toBeUndefined();
  });
});
