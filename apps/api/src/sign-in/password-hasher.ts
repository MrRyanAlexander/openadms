// A password's slow hash (ARCHITECTURE §6, Passwords; AC-10-20; T-16, T-43; ADR-402): Argon2id at
// OWASP's setting of 19 MiB, 2 passes and 1 lane, a salt of 16 random bytes for each password and
// a tag of 32, written as the PHC string any Argon2 library reads and the only thing
// `user_credential.passwordHash` takes. Node's own Argon2 (node:crypto), as the installer hashes
// the master passcode (ADR-281). The string carries its own settings, so a hash made under
// earlier ones still checks after they are raised.
import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

import { passwordAsKept } from '@open-adms/domain';

interface Cost {
  readonly memory: number;
  readonly passes: number;
  readonly parallelism: number;
}

export class PasswordHasher {
  // In kibibytes, passes and lanes.
  static readonly cost: Cost = { memory: 19456, passes: 2, parallelism: 1 };
  private static readonly saltBytes = 16;
  private static readonly tagBytes = 32;
  private static readonly format =
    /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

  // The whole password, in Unicode's composed form: never trimmed, folded or cut short.
  async hash(password: string): Promise<string> {
    const salt = randomBytes(PasswordHasher.saltBytes);
    const tag = await this.derive(password, salt, PasswordHasher.cost, PasswordHasher.tagBytes);
    const { memory, passes, parallelism } = PasswordHasher.cost;
    const settings = `m=${String(memory)},t=${String(passes)},p=${String(parallelism)}`;
    return `$argon2id$v=19$${settings}$${this.encode(salt)}$${this.encode(tag)}`;
  }

  async verify(password: string, phc: string): Promise<boolean> {
    const parts = PasswordHasher.format.exec(phc);
    if (parts === null) return false;
    const [, memory, passes, parallelism, salt, tag] = parts;
    const expected = Buffer.from(tag ?? '', 'base64');
    const actual = await this.derive(
      password,
      Buffer.from(salt ?? '', 'base64'),
      { memory: Number(memory), passes: Number(passes), parallelism: Number(parallelism) },
      expected.length,
    );
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private derive(password: string, salt: Buffer, cost: Cost, tagLength: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      argon2(
        'argon2id',
        {
          message: passwordAsKept(password),
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

  // PHC strings use unpadded standard base64.
  private encode(bytes: Buffer): string {
    return bytes.toString('base64').replace(/=+$/, '');
  }
}
