// The local stack's own certificates (ARCHITECTURE §4; KD-78; ADR-513, 517): every hop is
// encrypted, locally too, so every service that is reached over the stack's network, or from this
// machine, holds a certificate of its own. One root issues them all: `pnpm local:up` makes it
// once, into infra/local/.generated/ (git-ignored), and Caddy issues the certificates of the
// stack's public names (*.adms.localhost) from it too, so a client of the stack trusts that one
// root, named exactly (OWASP ASVS 5.0 12.3.2, 12.3.4), never the machine's trust store.
//
// Node can sign but has no way to write a certificate, so the few fields one holds are written
// here in DER (ITU-T X.690) and signed with Node's own ECDSA (P-256, SHA-256). Every certificate
// is read back through Node's X509Certificate (OpenSSL) before it is kept. A private key is
// written readable by its owner alone; nothing here prints one.
// Node 24 runs this file as-is (type stripping), so it uses erasable TypeScript only.
import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  X509Certificate,
  type KeyObject,
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { join } from 'node:path';

// What each certificate is for: the names a client reaches its service by. A service in the stack
// is reached by its name on the stack's network; Postgres and the mail catcher by this machine's
// loopback too (their ports are published on 127.0.0.1). `host` is a process on this machine
// itself: the stories' API, which Caddy reaches at host.docker.internal, and a test's own HTTPS
// server.
export interface Leaf {
  readonly name: string;
  readonly dns: readonly string[];
  readonly ips: readonly string[];
}

export const stackLeaves: readonly Leaf[] = [
  { name: 'api', dns: ['api'], ips: [] },
  { name: 'postgres', dns: ['postgres', 'localhost'], ips: ['127.0.0.1'] },
  { name: 'objectstore', dns: ['objectstore'], ips: [] },
  { name: 'mail', dns: ['mail', 'localhost'], ips: ['127.0.0.1'] },
  { name: 'routing', dns: ['routing'], ips: [] },
  { name: 'addresses', dns: ['addresses'], ips: [] },
  { name: 'host', dns: ['localhost', 'host.docker.internal'], ips: ['127.0.0.1'] },
];

const day = 24 * 60 * 60 * 1000;
// The root lives ten years, as Caddy's own did; a service's certificate one year (Apple's TLS
// clients take no more than 825 days). Each is made again well before it ends.
const rootLifetime = 3650 * day;
const leafLifetime = 365 * day;
const rootRenewedWithin = 365 * day;
const leafRenewedWithin = 30 * day;
// A certificate starts an hour back: Docker's machine may keep a clock a little behind this one.
const backdated = 60 * 60 * 1000;

const rootName = 'Open ADMS local stack root';

export interface Made {
  readonly root: 'kept' | 'made';
  readonly leaves: readonly string[];
}

export class StackAuthority {
  // The root's certificate, public: what every client of the stack is given to check against.
  readonly rootCert: string;
  readonly folder: string;
  private readonly rootKey: string;
  private readonly leaves: readonly Leaf[];

  constructor(generated: string, leaves: readonly Leaf[] = stackLeaves) {
    this.rootCert = join(generated, 'caddy-root.crt');
    this.folder = join(generated, 'tls');
    this.rootKey = join(this.folder, 'root.key');
    this.leaves = leaves;
  }

  certFile(name: string): string {
    return join(this.folder, `${name}.crt`);
  }

  keyFile(name: string): string {
    return join(this.folder, `${name}.key`);
  }

  // The root, made where there is none, or none whose key is here, or one ending within a year;
  // then each service's certificate, made where it is missing, isn't the root's, doesn't name
  // exactly its names, or ends within thirty days. A new root makes every certificate again.
  ensure(now: Date = new Date()): Made {
    mkdirSync(this.folder, { recursive: true, mode: 0o700 });
    let root = this.readRoot(now);
    const made: string[] = [];
    let rootMade = false;
    if (root === undefined) {
      root = this.makeRoot(now);
      rootMade = true;
    }
    for (const leaf of this.leaves) {
      if (!rootMade && this.holds(leaf, root.cert, now)) continue;
      this.makeLeaf(leaf, root, now);
      made.push(leaf.name);
    }
    return { root: rootMade ? 'made' : 'kept', leaves: made };
  }

  private readRoot(now: Date): { cert: X509Certificate; key: KeyObject } | undefined {
    if (!existsSync(this.rootCert) || !existsSync(this.rootKey)) return undefined;
    try {
      const cert = new X509Certificate(readFileSync(this.rootCert));
      const key = createPrivateKey(readFileSync(this.rootKey));
      const ours =
        cert.ca &&
        cert.checkPrivateKey(key) &&
        cert.verify(cert.publicKey) &&
        cert.validToDate.getTime() - now.getTime() > rootRenewedWithin;
      return ours ? { cert, key } : undefined;
    } catch {
      return undefined;
    }
  }

  private holds(leaf: Leaf, root: X509Certificate, now: Date): boolean {
    const certFile = this.certFile(leaf.name);
    const keyFile = this.keyFile(leaf.name);
    if (!existsSync(certFile) || !existsSync(keyFile)) return false;
    try {
      const cert = new X509Certificate(readFileSync(certFile));
      return (
        !cert.ca &&
        cert.verify(root.publicKey) &&
        cert.checkIssued(root) &&
        cert.checkPrivateKey(createPrivateKey(readFileSync(keyFile))) &&
        cert.subjectAltName === altNamesText(leaf) &&
        cert.validToDate.getTime() - now.getTime() > leafRenewedWithin
      );
    } catch {
      return false;
    }
  }

  private makeRoot(now: Date): { cert: X509Certificate; key: KeyObject } {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const name = distinguishedName(rootName);
    const keyId = keyIdentifier(publicKey);
    const der = signed(
      {
        issuer: name,
        subject: name,
        from: new Date(now.getTime() - backdated),
        until: new Date(now.getTime() + rootLifetime),
        publicKey,
        extensions: [
          extension(oids.basicConstraints, true, sequence(boolean(true))),
          extension(oids.keyUsage, true, keyUsage(['digitalSignature', 'keyCertSign', 'cRLSign'])),
          extension(oids.subjectKeyIdentifier, false, octetString(keyId)),
        ],
      },
      privateKey,
    );
    const cert = checked(der);
    // The key first: a root certificate is never left without the key that signed it.
    writePrivate(this.rootKey, privateKey);
    writePublic(this.rootCert, cert);
    return { cert, key: privateKey };
  }

  private makeLeaf(leaf: Leaf, root: { cert: X509Certificate; key: KeyObject }, now: Date): void {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const rootNotAfter = root.cert.validToDate.getTime();
    const der = signed(
      {
        issuer: distinguishedName(rootName),
        subject: distinguishedName(leaf.name),
        from: new Date(now.getTime() - backdated),
        until: new Date(Math.min(now.getTime() + leafLifetime, rootNotAfter)),
        publicKey,
        extensions: [
          extension(oids.basicConstraints, true, sequence()),
          extension(oids.keyUsage, true, keyUsage(['digitalSignature'])),
          extension(oids.extKeyUsage, false, sequence(oid(oids.serverAuth))),
          extension(oids.subjectAltName, false, altNames(leaf)),
          extension(oids.subjectKeyIdentifier, false, octetString(keyIdentifier(publicKey))),
          extension(
            oids.authorityKeyIdentifier,
            false,
            sequence(tagged(0x80, keyIdentifier(root.cert.publicKey))),
          ),
        ],
      },
      root.key,
    );
    const cert = checked(der);
    if (!cert.verify(root.cert.publicKey) || !cert.checkIssued(root.cert)) {
      throw new Error(`The stack's certificate for ${leaf.name} does not read as its root's.`);
    }
    writePrivate(this.keyFile(leaf.name), privateKey);
    writePublic(this.certFile(leaf.name), cert);
  }
}

// --- What a certificate holds (RFC 5280), written in DER ---------------------------------------

const oids = {
  ecPublicKey: '1.2.840.10045.2.1',
  ecdsaWithSha256: '1.2.840.10045.4.3.2',
  commonName: '2.5.4.3',
  organization: '2.5.4.10',
  subjectKeyIdentifier: '2.5.29.14',
  keyUsage: '2.5.29.15',
  subjectAltName: '2.5.29.17',
  basicConstraints: '2.5.29.19',
  authorityKeyIdentifier: '2.5.29.35',
  extKeyUsage: '2.5.29.37',
  serverAuth: '1.3.6.1.5.5.7.3.1',
} as const;

interface Tbs {
  readonly issuer: Buffer;
  readonly subject: Buffer;
  readonly from: Date;
  readonly until: Date;
  readonly publicKey: KeyObject;
  readonly extensions: readonly Buffer[];
}

function signed(tbs: Tbs, by: KeyObject): Buffer {
  const algorithm = sequence(oid(oids.ecdsaWithSha256));
  const body = sequence(
    tagged(0xa0, integer(Buffer.from([2]))),
    integer(serialNumber()),
    algorithm,
    tbs.issuer,
    sequence(time(tbs.from), time(tbs.until)),
    tbs.subject,
    tbs.publicKey.export({ type: 'spki', format: 'der' }),
    tagged(0xa3, sequence(...tbs.extensions)),
  );
  const signature = sign('sha256', body, { key: by, dsaEncoding: 'der' });
  return sequence(body, algorithm, bitString(signature));
}

// Read back by OpenSSL: a certificate that doesn't parse is never kept.
function checked(der: Buffer): X509Certificate {
  return new X509Certificate(der);
}

function distinguishedName(commonName: string): Buffer {
  return sequence(
    set(sequence(oid(oids.organization), utf8('Open ADMS local stack'))),
    set(sequence(oid(oids.commonName), utf8(commonName))),
  );
}

function extension(id: string, critical: boolean, value: Buffer): Buffer {
  return sequence(oid(id), ...(critical ? [boolean(true)] : []), octetString(value));
}

const usageBits = { digitalSignature: 0, keyCertSign: 5, cRLSign: 6 } as const;

function keyUsage(usages: readonly (keyof typeof usageBits)[]): Buffer {
  let byte = 0;
  let last = 0;
  for (const usage of usages) {
    byte |= 0x80 >> usageBits[usage];
    last = Math.max(last, usageBits[usage]);
  }
  // DER keeps no trailing zero bits: the unused count is what follows the last bit set.
  return tag(0x03, Buffer.from([7 - last, byte]));
}

function altNames(leaf: Leaf): Buffer {
  return sequence(
    ...leaf.dns.map((name) => tagged(0x82, Buffer.from(name, 'ascii'))),
    ...leaf.ips.map((ip) => tagged(0x87, ipBytes(ip))),
  );
}

// How Node writes a certificate's alternative names, to compare one already made with its leaf.
function altNamesText(leaf: Leaf): string {
  return [
    ...leaf.dns.map((name) => `DNS:${name}`),
    ...leaf.ips.map((ip) => `IP Address:${ip}`),
  ].join(', ');
}

function ipBytes(ip: string): Buffer {
  if (isIP(ip) !== 4) throw new Error(`Only an IPv4 address is named in a certificate: ${ip}.`);
  return Buffer.from(ip.split('.').map(Number));
}

// RFC 7093's first method: the leftmost 160 bits of the SHA-256 of the key's bits.
function keyIdentifier(publicKey: KeyObject): Buffer {
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  // The SubjectPublicKeyInfo of a P-256 key ends in its BIT STRING: the 65 bytes of the point.
  const point = spki.subarray(spki.length - 65);
  return createHash('sha256').update(point).digest().subarray(0, 20);
}

// Sixteen random bytes, positive (RFC 5280 §4.1.2.2: at most twenty, never negative).
function serialNumber(): Buffer {
  const bytes = randomBytes(16);
  bytes[0] = ((bytes[0] ?? 0) & 0x7f) | 0x01;
  return bytes;
}

// UTCTime through 2049, GeneralizedTime after (RFC 5280 §4.1.2.5).
function time(at: Date): Buffer {
  const iso = at.toISOString();
  const digits = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  return at.getUTCFullYear() < 2050
    ? tag(0x17, Buffer.from(digits.slice(2), 'ascii'))
    : tag(0x18, Buffer.from(digits, 'ascii'));
}

function oid(dotted: string): Buffer {
  const [first = 0, second = 0, ...rest] = dotted.split('.').map(Number);
  const bytes = [first * 40 + second];
  for (const arc of rest) {
    const groups = [arc & 0x7f];
    for (let value = arc >> 7; value > 0; value >>= 7) groups.unshift((value & 0x7f) | 0x80);
    bytes.push(...groups);
  }
  return tag(0x06, Buffer.from(bytes));
}

function integer(bytes: Buffer): Buffer {
  return tag(0x02, (bytes[0] ?? 0) & 0x80 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes);
}

const boolean = (value: boolean): Buffer => tag(0x01, Buffer.from([value ? 0xff : 0]));
const utf8 = (text: string): Buffer => tag(0x0c, Buffer.from(text, 'utf8'));
const octetString = (bytes: Buffer): Buffer => tag(0x04, bytes);
const bitString = (bytes: Buffer): Buffer => tag(0x03, Buffer.concat([Buffer.from([0]), bytes]));
const sequence = (...parts: Buffer[]): Buffer => tag(0x30, Buffer.concat(parts));
const set = (...parts: Buffer[]): Buffer => tag(0x31, Buffer.concat(parts));
const tagged = (which: number, content: Buffer): Buffer => tag(which, content);

function tag(which: number, content: Buffer): Buffer {
  const length = content.length;
  if (length < 0x80) return Buffer.concat([Buffer.from([which, length]), content]);
  const octets: number[] = [];
  for (let rest = length; rest > 0; rest >>= 8) octets.unshift(rest & 0xff);
  return Buffer.concat([Buffer.from([which, 0x80 | octets.length, ...octets]), content]);
}

// --- Files -------------------------------------------------------------------------------------

// A private key, readable by its owner alone, written whole or not at all.
function writePrivate(path: string, key: KeyObject): void {
  const pem = key.export({ type: 'pkcs8', format: 'pem' });
  writeWhole(path, typeof pem === 'string' ? pem : pem.toString('utf8'), 0o600);
}

function writePublic(path: string, cert: X509Certificate): void {
  writeWhole(path, cert.toString(), 0o644);
}

function writeWhole(path: string, text: string, mode: number): void {
  const beside = `${path}.${randomBytes(4).toString('hex')}.new`;
  writeFileSync(beside, text, { mode, flag: 'wx' });
  renameSync(beside, path);
}
