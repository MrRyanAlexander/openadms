// The local stack's own certificates (KD-78; ADR-517): one root, and a certificate for each
// service of the stack, each read back by OpenSSL, each naming exactly the names its service is
// reached by, each key its owner's alone. Made again only where one is missing, isn't the root's,
// names other names or is ending. These need no stack: each test makes its own in a folder of
// its own.
import { X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { StackAuthority, stackLeaves } from '../src/certificates.ts';

const scratch = mkdtempSync(join(tmpdir(), 'adms-tls-'));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});
const folder = (): string => mkdtempSync(join(scratch, 'generated-'));
const day = 24 * 60 * 60 * 1000;
const read = (path: string): X509Certificate => new X509Certificate(readFileSync(path));

describe('the stack’s root', () => {
  it('is made once: a certificate authority of its own, ten years, its key its owner’s alone', () => {
    const authority = new StackAuthority(folder());
    const now = new Date('2026-10-14T12:00:00Z');
    expect(authority.ensure(now)).toEqual({
      root: 'made',
      leaves: stackLeaves.map(({ name }) => name),
    });
    const root = read(authority.rootCert);
    expect(root.ca).toBe(true);
    expect(root.verify(root.publicKey)).toBe(true);
    expect(root.subject).toBe('O=Open ADMS local stack\nCN=Open ADMS local stack root');
    expect(root.publicKey.asymmetricKeyDetails).toEqual({ namedCurve: 'prime256v1' });
    expect(root.validToDate.getTime() - now.getTime()).toBeGreaterThan(3649 * day);
    expect(root.keyUsage).toBeUndefined();
    expect(statSync(join(authority.folder, 'root.key')).mode & 0o777).toBe(0o600);
    expect(statSync(authority.rootCert).mode & 0o777).toBe(0o644);
    // Asked again, everything is kept.
    expect(authority.ensure(now)).toEqual({ root: 'kept', leaves: [] });
  });

  it('is made again, and every certificate with it, where its key is gone, or it ends within a year', () => {
    const authority = new StackAuthority(folder());
    authority.ensure(new Date('2026-10-14T12:00:00Z'));
    const first = read(authority.rootCert).serialNumber;
    rmSync(join(authority.folder, 'root.key'));
    expect(authority.ensure(new Date('2026-10-14T12:00:00Z')).root).toBe('made');
    const second = read(authority.rootCert);
    expect(second.serialNumber).not.toBe(first);
    for (const { name } of stackLeaves) {
      expect(read(authority.certFile(name)).checkIssued(second), name).toBe(true);
    }
    // Nine years on, it has less than a year left.
    expect(authority.ensure(new Date('2035-10-20T12:00:00Z')).root).toBe('made');
  });
});

describe('each service’s certificate', () => {
  const authority = new StackAuthority(folder());
  const now = new Date('2026-10-14T12:00:00Z');
  authority.ensure(now);
  const root = read(authority.rootCert);

  it.each(stackLeaves)(
    'for $name: the root’s, a server’s and no authority, naming exactly its names, for a year, its key its owner’s alone',
    ({ name, dns, ips }) => {
      const cert = read(authority.certFile(name));
      expect(cert.ca).toBe(false);
      expect(cert.verify(root.publicKey)).toBe(true);
      expect(cert.checkIssued(root)).toBe(true);
      expect(cert.subject).toBe(`O=Open ADMS local stack\nCN=${name}`);
      expect(cert.keyUsage).toEqual(['1.3.6.1.5.5.7.3.1']);
      for (const host of dns) expect(cert.checkHost(host), host).toBe(host);
      for (const ip of ips) expect(cert.checkIP(ip), ip).toBe(ip);
      // No other name: another service's, a wildcard, the stack's public names.
      for (const other of ['api.adms.localhost', 'example.com', 'adms.localhost']) {
        expect(cert.checkHost(other), other).toBeUndefined();
      }
      if (!ips.includes('127.0.0.1')) expect(cert.checkIP('127.0.0.1')).toBeUndefined();
      const days = (cert.validToDate.getTime() - now.getTime()) / day;
      expect(days).toBeGreaterThan(364);
      expect(days).toBeLessThan(366);
      expect(statSync(authority.keyFile(name)).mode & 0o777).toBe(0o600);
    },
  );

  it('the stack’s services are named as compose names them, Postgres and the mail catcher on this machine too, and a process on this machine as Caddy reaches it', () => {
    expect(
      Object.fromEntries(stackLeaves.map(({ name, dns, ips }) => [name, [...dns, ...ips]])),
    ).toEqual({
      api: ['api'],
      postgres: ['postgres', 'localhost', '127.0.0.1'],
      objectstore: ['objectstore'],
      mail: ['mail', 'localhost', '127.0.0.1'],
      routing: ['routing'],
      addresses: ['addresses'],
      host: ['localhost', 'host.docker.internal', '127.0.0.1'],
    });
  });

  it('is made again where it is missing, isn’t the root’s, ends within thirty days or was spoilt; the others are kept', () => {
    const own = new StackAuthority(folder());
    own.ensure(now);
    rmSync(own.certFile('api'));
    // Another root's certificate for `mail`, with its own key: whole, and not this root's.
    writeFileSync(own.certFile('mail'), readFileSync(authority.certFile('mail')));
    writeFileSync(own.keyFile('mail'), readFileSync(authority.keyFile('mail')));
    writeFileSync(own.keyFile('routing'), 'not a key');
    expect(own.ensure(now).leaves).toEqual(['api', 'mail', 'routing']);
    expect(own.ensure(new Date(now.getTime() + 340 * day)).leaves).toEqual(
      stackLeaves.map(({ name }) => name),
    );
  });

  it('names other names, and is made again for them, where its service’s names change', () => {
    const generated = folder();
    new StackAuthority(generated).ensure(now);
    const renamed = stackLeaves.map((leaf) =>
      leaf.name === 'api' ? { ...leaf, dns: ['api', 'api-2'] } : leaf,
    );
    const again = new StackAuthority(generated, renamed);
    expect(again.ensure(now).leaves).toEqual(['api']);
    expect(read(again.certFile('api')).checkHost('api-2')).toBe('api-2');
  });
});
