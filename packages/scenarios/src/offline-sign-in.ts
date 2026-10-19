// A story's phone signing in with no connection (ARCHITECTURE §7.2; BACKLOG 3.2.4, C143, C151;
// ADR-449, 454, 531, 575), as the field app does it (apps/field/src/phone/login-list.ts,
// offline-check.ts): the login list it holds, kept and dropped as each answer says; a password
// checked against a monitor's entry in the two slow hashes; and the report of the sign-in, its
// proof an HMAC-SHA256 keyed by the first hash over what the domain says a sign-in signs. Node's
// own Argon2id and HMAC, where the field app's are @noble/hashes'; the same bytes either way.
import { argon2Sync, createHmac, timingSafeEqual } from 'node:crypto';

import type {
  OfflineCheckRecord,
  OfflineSignInReport,
  PhoneLoginListAnswer,
} from '@open-adms/contracts';
import { OfflineSignInRules, passwordAsKept, uuidv7 } from '@open-adms/domain';

const phc = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

interface Entry {
  readonly monitorId: string;
  readonly mark: string;
  readonly check: OfflineCheckRecord;
}

function argon2id(
  message: Buffer,
  salt: Buffer,
  cost: { readonly m: number; readonly t: number; readonly p: number },
  bytes: number,
): Buffer {
  return argon2Sync('argon2id', {
    message,
    nonce: salt,
    memory: cost.m,
    passes: cost.t,
    parallelism: cost.p,
    tagLength: bytes,
  });
}

export class HeldLoginList {
  private readonly entries = new Map<string, Entry>();
  private passcodeVersion: number | null = null;

  // What the phone says it holds when it asks.
  held(): {
    readonly masterPasscodeVersion: number | null;
    readonly entries: { readonly monitorId: string; readonly mark: string }[];
  } {
    return {
      masterPasscodeVersion: this.passcodeVersion,
      entries: [...this.entries.values()].map(({ monitorId, mark }) => ({ monitorId, mark })),
    };
  }

  // An answer kept as the field app keeps it: an entry made kept, one whose mark moved dropped,
  // anybody not named dropped; with no list, everything held kept. Whether there are more.
  kept(answer: PhoneLoginListAnswer): boolean {
    if (answer.masterPasscode.check !== null) this.passcodeVersion = answer.masterPasscode.version;
    if (answer.loginList === null) return false;
    const named = new Set<string>();
    for (const { monitorId, mark, check } of answer.loginList.monitors) {
      named.add(monitorId);
      if (check !== null) this.entries.set(monitorId, { monitorId, mark, check });
      else if (this.entries.get(monitorId)?.mark !== mark) this.entries.delete(monitorId);
    }
    for (const monitorId of [...this.entries.keys()]) {
      if (!named.has(monitorId)) this.entries.delete(monitorId);
    }
    return answer.loginList.more;
  }

  // The first slow hash of what was typed, where it opens the monitor's entry.
  opened(monitorId: string, typed: string): Buffer | undefined {
    const entry = this.entries.get(monitorId);
    const second = entry === undefined ? null : phc.exec(entry.check.check);
    if (entry === undefined || second === null) return undefined;
    const [, m, t, p, salt, hash] = second;
    const { first } = entry.check;
    const firstHash = argon2id(
      Buffer.from(passwordAsKept(typed)),
      Buffer.from(first.salt, 'base64'),
      { m: first.memory, t: first.passes, p: first.parallelism },
      first.bytes,
    );
    const expected = Buffer.from(hash ?? '', 'base64');
    const made = argon2id(
      firstHash,
      Buffer.from(salt ?? '', 'base64'),
      { m: Number(m), t: Number(t), p: Number(p) },
      expected.length,
    );
    return made.length === expected.length && timingSafeEqual(made, expected)
      ? firstHash
      : undefined;
  }
}

// The report of a sign-in with the monitor's own password, made at `at` by a phone whose clock
// stood `offset` minutes from UTC, proven by the first hash.
export function offlineSignInReport(
  deviceId: string,
  personId: string,
  at: Date,
  offset: number,
  firstHash: Buffer,
): OfflineSignInReport {
  const said = {
    deviceId,
    id: uuidv7(at),
    kind: 'OWN_PASSWORD',
    personId,
    signedInAt: at,
    masterPasscodeVersion: null,
  } as const;
  return {
    id: said.id,
    kind: said.kind,
    personId,
    signedInAt: at.toISOString(),
    deviceUtcOffsetMinutes: offset,
    masterPasscodeVersion: null,
    proof: createHmac('sha256', firstHash)
      .update(new OfflineSignInRules().signed(said))
      .digest('base64url'),
  };
}
