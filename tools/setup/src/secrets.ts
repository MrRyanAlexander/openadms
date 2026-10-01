// The installer's secrets (ARCHITECTURE §4, §5.1, §7.5; ADR-266). Generated once, on a first run;
// never printed, never rotated on a resume.
import {
  argon2,
  createHash,
  createHmac,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
  type BinaryLike,
} from 'node:crypto';

export class SecretMaker {
  // 32 random bytes, URL-safe, so a password needs no escaping in a connection URL.
  password(): string {
    return randomBytes(32).toString('base64url');
  }
}

// Postgres stores a login's password as a SCRAM-SHA-256 verifier. Making it here and sending only
// the verifier means the password itself never reaches the database server, its logs included.
export class ScramVerifier {
  static readonly iterations = 4096;

  make(password: string, salt: Buffer = randomBytes(16)): string {
    const salted = pbkdf2Sync(password, salt, ScramVerifier.iterations, 32, 'sha256');
    const storedKey = createHash('sha256').update(this.hmac(salted, 'Client Key')).digest();
    const serverKey = this.hmac(salted, 'Server Key');
    return `SCRAM-SHA-256$${String(ScramVerifier.iterations)}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
  }

  private hmac(key: BinaryLike, text: string): Buffer {
    return createHmac('sha256', key).update(text).digest();
  }
}

// The master passcode's slow hash: Argon2id at OWASP's first recommended setting (19 MiB, 2 passes,
// 1 lane), written in the PHC string format that any Argon2 library reads.
export class PasscodeHasher {
  static readonly minimumLength = 8;
  static readonly maximumLength = 128;
  private static readonly memory = 19456;
  private static readonly passes = 2;
  private static readonly parallelism = 1;
  private static readonly format =
    /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

  // Why a passcode is refused, or undefined when it's acceptable.
  problem(passcode: string): string | undefined {
    // NIST SP 800-63B counts each Unicode code point as one character.
    const length = Array.from(passcode).length;
    if (length < PasscodeHasher.minimumLength) {
      return `It needs at least ${String(PasscodeHasher.minimumLength)} characters.`;
    }
    if (length > PasscodeHasher.maximumLength) {
      return `It can have at most ${String(PasscodeHasher.maximumLength)} characters.`;
    }
    return undefined;
  }

  async hash(passcode: string): Promise<string> {
    const salt = randomBytes(16);
    const tag = await this.derive(passcode, salt, {
      memory: PasscodeHasher.memory,
      passes: PasscodeHasher.passes,
      parallelism: PasscodeHasher.parallelism,
    });
    const settings = `m=${String(PasscodeHasher.memory)},t=${String(PasscodeHasher.passes)},p=${String(PasscodeHasher.parallelism)}`;
    return `$argon2id$v=19$${settings}$${this.encode(salt)}$${this.encode(tag)}`;
  }

  async verify(passcode: string, phc: string): Promise<boolean> {
    const parts = PasscodeHasher.format.exec(phc);
    if (parts === null) return false;
    const [, memory, passes, parallelism, salt, tag] = parts;
    const expected = Buffer.from(tag ?? '', 'base64');
    const actual = await this.derive(passcode, Buffer.from(salt ?? '', 'base64'), {
      memory: Number(memory),
      passes: Number(passes),
      parallelism: Number(parallelism),
      tagLength: expected.length,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  wellFormed(phc: string): boolean {
    return PasscodeHasher.format.test(phc);
  }

  private derive(
    passcode: string,
    salt: Buffer,
    cost: { memory: number; passes: number; parallelism: number; tagLength?: number },
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      argon2(
        'argon2id',
        {
          message: passcode,
          nonce: salt,
          memory: cost.memory,
          passes: cost.passes,
          parallelism: cost.parallelism,
          tagLength: cost.tagLength ?? 32,
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
