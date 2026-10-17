// What a phone checks a password or the master passcode against with no connection, and what
// the server keeps to make it from (ARCHITECTURE §7.1, §7.2, §7.5; adms-field-app §4A.0 (6),
// (7); spec/acceptance/02-people-and-devices.md AC-02-41; BACKLOG 2.5.3, C89, C90, C110, C117;
// ADR-105, 106, 139, 411, 412, 449, 454). NIST SP 800-63B-4 §3.1.1.2 and OWASP ASVS 5.0 11.4.2
// ask this of a password a server checks; a check handed to a phone is outside both, the firm's
// accepted risk (ADR-449 (3)), so what is sent is the least that lets a phone check.
//
// - **A check is two slow hashes, one made from the other.** The first is Argon2id of what is
//   typed, under a salt of its own and no key: for a monitor's password their **offline seed**,
//   for the master passcode **its own offline seed** (ADR-542; the Phase 2 audit's F3). The
//   second is Argon2id of the first under a salt made for that phone alone. The phone is sent how
//   to make the first (its salt and settings, never the hash itself) and the second whole; it
//   checks what is typed by doing both steps. So one phone's check is not another's, and nothing
//   sent to a phone is what the server itself checks a sign-in against.
// - **Every offline seed is kept sealed** (AES-256-GCM, as an authenticator's secret is, ADR-412),
//   under a key of this purpose alone drawn from the API's sealing key (`ADMS_SEALING_KEY`,
//   ADR-542) and bound to what it is for: a monitor, or a version of the master passcode. A
//   password's own hash and the passcode's are keyed (ADR-411, 542) and no phone could make
//   either, so the seed is what a phone's check is made from, and what a sign-in made offline is
//   proven against. Whoever copies the database alone holds nothing a guess can be tried
//   against, and nothing a proof can be made from. A seed sealed `v1` (under a key drawn from the
//   signing secret, before ADR-542) is opened where this process holds that secret and made
//   again at its monitor's next sign-in.
// - **A mark says which check a phone holds** without holding the check: a keyed fingerprint of
//   the phone, the monitor and their seed as kept. A phone that sends a mark still good is made
//   no new entry; a password set anew makes a new seed, so its mark is good no more.
// - **Nothing made here is kept on the server**: an entry exists on the phone it was made for.
// - **A sign-in made offline is proven by the first hash** (ADR-531; the domain's
//   `OfflineSignInRules`): the phone made it from what was typed to check it, and keyed an
//   HMAC-SHA256 with it over what the sign-in says. The server makes the same from what it keeps
//   (the monitor's seed or the passcode's, opened) and compares in constant time: only somebody
//   who typed the right password or passcode could have made it.
import {
  argon2,
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { passwordAsKept } from '@open-adms/domain';

interface Cost {
  readonly memory: number;
  readonly passes: number;
  readonly parallelism: number;
}

// How a phone makes the first hash from what is typed: Argon2id, version 19, of the whole
// password in Unicode's composed form, with no key.
export interface OfflineFirstStep extends Cost {
  // Standard base64, unpadded, as a PHC string writes it.
  readonly salt: string;
  readonly bytes: number;
}

export interface OfflineCheck {
  readonly first: OfflineFirstStep;
  // Argon2id of the first hash's bytes, as the PHC string any Argon2 library checks against.
  readonly check: string;
}

const sealVersion = 'v2';
const earlierSealVersion = 'v1';
const sealPart = /^[A-Za-z0-9_-]+$/;
const phc = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

interface FirstHash {
  readonly step: OfflineFirstStep;
  readonly hash: Buffer;
}

export class OfflineChecks {
  // In kibibytes, passes and lanes: a password's own (password-hasher.ts), for both steps.
  static readonly cost: Cost = { memory: 19456, passes: 2, parallelism: 1 };
  private static readonly saltBytes = 16;
  private static readonly hashBytes = 32;

  private readonly seedKey: Buffer;
  private readonly earlierSeedKey: Buffer | undefined;
  private readonly passcodeSeedKey: Buffer;
  private readonly markKey: Buffer;

  // The sealing key is the API's (ADMS_SEALING_KEY). The signing secret, where given, is only to
  // open a monitor's seed sealed under the key drawn from it before ADR-542.
  constructor(sealingKey: string, earlierSigningSecret?: string) {
    const keyFor = (secret: string, purpose: string): Buffer =>
      createHmac('sha256', secret).update(purpose).digest();
    this.seedKey = keyFor(sealingKey, 'open-adms/offline-seed/v2');
    this.passcodeSeedKey = keyFor(sealingKey, 'open-adms/master-passcode-seed/v2');
    this.markKey = keyFor(sealingKey, 'open-adms/login-list-mark/v2');
    this.earlierSeedKey =
      earlierSigningSecret === undefined
        ? undefined
        : keyFor(earlierSigningSecret, 'open-adms/offline-seed/v1');
  }

  // What `user_credential.offlineSeed` holds for this monitor, made from the password as it is
  // set or as it just checked.
  async seedOf(userId: string, password: string): Promise<string> {
    return this.sealed(
      this.seedKey,
      OfflineChecks.boundToMonitor(userId),
      await this.first(password),
    );
  }

  // What `master_passcode.offlineSeed` holds for that version, made from the passcode as it is
  // set or as it just checked (ADR-542).
  async passcodeSeedOf(version: number, passcode: string): Promise<string> {
    return this.sealed(
      this.passcodeSeedKey,
      OfflineChecks.boundToPasscode(version),
      await this.first(passcode),
    );
  }

  // Whether a seed should be made again at a sign-in that worked: there is none, this process
  // can't open it, it was sealed under an earlier key, or made under settings since raised.
  stale(userId: string, kept: string | null): boolean {
    if (kept !== null && !kept.startsWith(`${sealVersion}.`)) return true;
    const first = kept === null ? undefined : this.opened(userId, kept);
    if (first === undefined) return true;
    const { cost } = OfflineChecks;
    return (
      first.step.memory < cost.memory ||
      first.step.passes < cost.passes ||
      first.step.parallelism < cost.parallelism
    );
  }

  // Which entry a phone holds for a monitor: good while their seed is the one kept now.
  mark(deviceId: string, userId: string, kept: string): string {
    const { memory, passes, parallelism } = OfflineChecks.cost;
    return createHmac('sha256', this.markKey)
      .update([deviceId, userId, kept, memory, passes, parallelism].join('\n'))
      .digest('base64url');
  }

  sameMark(one: string, another: string): boolean {
    const [a, b] = [Buffer.from(one), Buffer.from(another)];
    return a.length === b.length && timingSafeEqual(a, b);
  }

  // A phone's login-list entry for a monitor, under a salt made now for that phone alone;
  // undefined when this process can't open their seed.
  async entry(userId: string, kept: string): Promise<OfflineCheck | undefined> {
    const first = this.opened(userId, kept);
    return first === undefined ? undefined : this.second(first);
  }

  // A phone's check of a version of the master passcode, made from its offline seed; undefined
  // where this process can't open it.
  async ofPasscode(version: number, kept: string): Promise<OfflineCheck | undefined> {
    const first = this.openedPasscode(version, kept);
    return first === undefined ? undefined : this.second(first);
  }

  // Whether a sign-in a phone made offline with a monitor's password is proven: the HMAC keyed
  // by their seed as kept now. False where this process can't open it.
  signedWithSeed(userId: string, kept: string, signed: string, proof: string): boolean {
    const first = this.opened(userId, kept);
    return first !== undefined && OfflineChecks.sameProof(first.hash, signed, proof);
  }

  // Whether a sign-in a phone made offline under a version of the master passcode is proven: the
  // HMAC keyed by that version's offline seed. False where this process can't open it.
  signedWithPasscode(version: number, kept: string, signed: string, proof: string): boolean {
    const first = this.openedPasscode(version, kept);
    return first !== undefined && OfflineChecks.sameProof(first.hash, signed, proof);
  }

  // What a phone sends as the proof of a sign-in it made offline, from the first hash: the
  // phone's own making of it (a test's or a story's phone makes it so too).
  static proofOf(firstHash: Buffer, signed: string): string {
    return createHmac('sha256', firstHash).update(signed).digest('base64url');
  }

  private static sameProof(firstHash: Buffer, signed: string, proof: string): boolean {
    const [made, sent] = [
      Buffer.from(OfflineChecks.proofOf(firstHash, signed)),
      Buffer.from(proof),
    ];
    return made.length === sent.length && timingSafeEqual(made, sent);
  }

  // The first hash of what is typed, as the PHC string a seed seals.
  private async first(typed: string): Promise<Buffer> {
    const salt = randomBytes(OfflineChecks.saltBytes);
    const hash = await this.derive(
      Buffer.from(passwordAsKept(typed)),
      salt,
      OfflineChecks.cost,
      OfflineChecks.hashBytes,
    );
    return Buffer.from(this.written(OfflineChecks.cost, salt, hash));
  }

  private static boundToMonitor(userId: string): string {
    return `offline-seed\n${userId}`;
  }

  private static boundToPasscode(version: number): string {
    return `master-passcode-seed\n${String(version)}`;
  }

  private async second(first: FirstHash): Promise<OfflineCheck> {
    const salt = randomBytes(OfflineChecks.saltBytes);
    const hash = await this.derive(first.hash, salt, OfflineChecks.cost, OfflineChecks.hashBytes);
    return { first: first.step, check: this.written(OfflineChecks.cost, salt, hash) };
  }

  private read(written: string): FirstHash | undefined {
    const parts = phc.exec(written);
    if (parts === null) return undefined;
    const [, memory, passes, parallelism, salt, hash] = parts;
    const bytes = Buffer.from(hash ?? '', 'base64');
    return {
      step: {
        salt: salt ?? '',
        memory: Number(memory),
        passes: Number(passes),
        parallelism: Number(parallelism),
        bytes: bytes.length,
      },
      hash: bytes,
    };
  }

  private written(cost: Cost, salt: Buffer, hash: Buffer): string {
    // PHC strings use unpadded standard base64.
    const encode = (bytes: Buffer): string => bytes.toString('base64').replace(/=+$/, '');
    const settings = `m=${String(cost.memory)},t=${String(cost.passes)},p=${String(cost.parallelism)}`;
    return `$argon2id$v=19$${settings}$${encode(salt)}$${encode(hash)}`;
  }

  private derive(message: Buffer, salt: Buffer, cost: Cost, tagLength: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      argon2(
        'argon2id',
        {
          message,
          nonce: salt,
          memory: cost.memory,
          passes: cost.passes,
          parallelism: cost.parallelism,
          tagLength,
        },
        (error, tag) => {
          if (error === null) resolve(tag);
          else reject(error);
        },
      );
    });
  }

  // Sealed for one monitor or one version of the passcode: a row's value put on another's opens
  // nothing.
  private sealed(key: Buffer, boundTo: string, plain: Buffer): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(boundTo));
    const hidden = Buffer.concat([cipher.update(plain), cipher.final()]);
    return [
      sealVersion,
      ...[nonce, hidden, cipher.getAuthTag()].map((b) => b.toString('base64url')),
    ].join('.');
  }

  private opened(userId: string, kept: string): FirstHash | undefined {
    const earlier = kept.startsWith(`${earlierSealVersion}.`);
    const key = earlier ? this.earlierSeedKey : this.seedKey;
    return key === undefined
      ? undefined
      : this.openedBy(
          key,
          earlier ? earlierSealVersion : sealVersion,
          OfflineChecks.boundToMonitor(userId),
          kept,
        );
  }

  // A passcode's seed is only ever sealed under the sealing key.
  private openedPasscode(version: number, kept: string): FirstHash | undefined {
    return this.openedBy(
      this.passcodeSeedKey,
      sealVersion,
      OfflineChecks.boundToPasscode(version),
      kept,
    );
  }

  private openedBy(
    key: Buffer,
    version: string,
    boundTo: string,
    kept: string,
  ): FirstHash | undefined {
    const [said, nonce, hidden, tag, ...more] = kept.split('.');
    if (said !== version || more.length > 0) return undefined;
    if (nonce === undefined || hidden === undefined || tag === undefined) return undefined;
    if (![nonce, hidden, tag].every((text) => sealPart.test(text))) return undefined;
    const nonceBytes = Buffer.from(nonce, 'base64url');
    const tagBytes = Buffer.from(tag, 'base64url');
    if (nonceBytes.length !== 12 || tagBytes.length !== 16) return undefined;
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, nonceBytes);
      decipher.setAAD(Buffer.from(boundTo));
      decipher.setAuthTag(tagBytes);
      const plain = Buffer.concat([
        decipher.update(Buffer.from(hidden, 'base64url')),
        decipher.final(),
      ]);
      return this.read(plain.toString());
    } catch {
      // Not sealed by this key, not for this monitor or version, or altered.
      return undefined;
    }
  }
}
