// What the phone checks a password or the master passcode against with no connection, and how it
// proves the sign-in once it has one (ARCHITECTURE §7.2, §7.5; adms-field-app §4A.0 (6); BACKLOG
// 3.2.4, C120; ADR-454, 531, 575). The server sends a check of two slow hashes, one made from the
// other (the contracts' `offlineCheckSchema`): how to make the first from what is typed (Argon2id,
// version 19, of the whole of it in Unicode's composed form, no key, under the salt and settings
// given), and the second whole, Argon2id of the first's bytes as a PHC string. The phone does both
// steps and compares (AC-11-19). The first hash opens nothing but this check and the proof of the
// sign-in: an HMAC-SHA256 keyed by it over what the domain's `OfflineSignInRules` says a sign-in
// signs, which the server makes again from what it keeps (AC-11-21). The phone keeps that proof
// until the monitor signs out, never the hash and never what was typed.
//
// Argon2id, the HMAC and SHA-256 are @noble/hashes' (ADR-575): JavaScript alone, so the page's
// policy runs no WebAssembly, and the same in every build. No WebCrypto key is made from anything
// typed (AC-11-08).
import { argon2idAsync } from '@noble/hashes/argon2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { OfflineCheckRecord } from '@open-adms/contracts';
import { passwordAsKept } from '@open-adms/domain';

const phc = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

// Standard base64, padded or not, as a PHC string and the check's salt write it.
function bytesOf(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

// The same length and every byte the same, taking as long whichever byte differs.
function same(one: Uint8Array, another: Uint8Array): boolean {
  if (one.length !== another.length) return false;
  let differs = 0;
  for (let at = 0; at < one.length; at += 1) differs |= (one[at] ?? 0) ^ (another[at] ?? 0);
  return differs === 0;
}

// Each slow hash yields to the screen a hundredth of a second at a time, so a spinner turns.
const tick = 10;

// The first slow hash of what was typed, where it opens the check; nothing where it doesn't, or
// where the check isn't one the phone can read.
export async function checkOpened(
  typed: string,
  check: OfflineCheckRecord,
): Promise<Uint8Array | undefined> {
  const second = phc.exec(check.check);
  if (second === null) return undefined;
  const [, memory, passes, lanes, salt, hash] = second;
  const { first } = check;
  try {
    const firstHash = await argon2idAsync(
      new TextEncoder().encode(passwordAsKept(typed)),
      bytesOf(first.salt),
      {
        m: first.memory,
        t: first.passes,
        p: first.parallelism,
        dkLen: first.bytes,
        asyncTick: tick,
      },
    );
    const expected = bytesOf(hash ?? '');
    const made = await argon2idAsync(firstHash, bytesOf(salt ?? ''), {
      m: Number(memory),
      t: Number(passes),
      p: Number(lanes),
      dkLen: expected.length,
      asyncTick: tick,
    });
    return same(made, expected) ? firstHash : undefined;
  } catch {
    // Settings no Argon2id takes, or base64 that isn't: a check nobody can open.
    return undefined;
  }
}

// The proof of a sign-in made offline, from the first hash: base64url, unpadded, as the contracts'
// report takes it.
export function signInProof(firstHash: Uint8Array, signed: string): string {
  return base64url(hmac(sha256, firstHash, new TextEncoder().encode(signed)));
}
