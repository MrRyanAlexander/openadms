// A check a phone was sent, tried as a phone would try it, with Node's own Argon2 and nothing
// of the API's (ARCHITECTURE §7.2, §7.5; AC-02-17, AC-02-41; ADR-454): for the login list's test
// and the sync's (ADR-473).
import { argon2, timingSafeEqual } from 'node:crypto';

import type { OfflineCheckRecord } from '@open-adms/contracts';
import { expect } from 'vitest';

// A phone's own work, with no connection: the first slow hash of what was typed, then the
// second of that, held against the check it was sent.
const slow = (message: Buffer, salt: string, memory: number, passes: number, lanes: number) =>
  new Promise<Buffer>((resolve, reject) => {
    argon2(
      'argon2id',
      {
        message,
        nonce: Buffer.from(salt, 'base64'),
        memory,
        passes,
        parallelism: lanes,
        tagLength: 32,
      },
      (error, tag) => {
        if (error === null) resolve(tag);
        else reject(error);
      },
    );
  });

export async function opens(
  typed: string,
  sent: OfflineCheckRecord | null | undefined,
): Promise<boolean> {
  if (sent == null) throw new Error('The phone was sent no check.');
  const { first } = sent;
  expect(first.bytes).toBe(32);
  const one = await slow(
    Buffer.from(typed.normalize('NFC')),
    first.salt,
    first.memory,
    first.passes,
    first.parallelism,
  );
  const parts = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/.exec(sent.check);
  if (parts === null) throw new Error('The check is no PHC string.');
  const [, memory, passes, lanes, salt, tag] = parts;
  const two = await slow(one, salt ?? '', Number(memory), Number(passes), Number(lanes));
  const kept = Buffer.from(tag ?? '', 'base64');
  return two.length === kept.length && timingSafeEqual(two, kept);
}

// The first slow hash of what was typed, as a phone makes it to check it against its entry
// (ADR-531): the key of the proof of a sign-in made offline. Never kept by a real phone.
export async function firstHashOf(
  typed: string,
  sent: OfflineCheckRecord | null | undefined,
): Promise<Buffer> {
  if (sent == null) throw new Error('The phone was sent no check.');
  const { first } = sent;
  return slow(
    Buffer.from(typed.normalize('NFC')),
    first.salt,
    first.memory,
    first.passes,
    first.parallelism,
  );
}
