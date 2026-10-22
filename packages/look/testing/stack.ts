// The local stack as every web app's browser tests reach it (ADR-564): the keys the browser is
// told to trust, and an answer asked from Node. A browser here doesn't hold the stack's root, and a
// test never tells it to take any certificate. So each name the page reaches is first connected to
// from Node, its chain checked against the stack's root (infra/local/.generated/caddy-root.crt) and
// the name, and only the public keys of the certificates so checked are handed to Chromium (SPKI
// SHA-256), which takes those and nothing else.
import { createHash, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { connect, type DetailedPeerCertificate } from 'node:tls';

// Caddy is the one way in, on this machine's loopback, at 443 (infra/local/compose.yaml): the
// build's API origin names no port, so the tests need the stack there too.
const port = 443;
// The stack's root, read when a test first reaches the stack (a unit test that imports the kit
// needs no stack).
const root = (): Buffer =>
  readFileSync(new URL('../../../infra/local/.generated/caddy-root.crt', import.meta.url));

// Every certificate a name presents, once its chain is checked against the stack's root alone.
async function checkedChain(hostname: string): Promise<X509Certificate[]> {
  const socket = connect({ host: '127.0.0.1', port, servername: hostname, ca: root() });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('secureConnect', resolve);
      socket.once('error', reject);
    });
    if (!socket.authorized) {
      throw new Error(`${hostname}: ${String(socket.authorizationError)}`);
    }
    // Node ends the chain at a certificate that is its own issuer (the stack's root).
    const chain: X509Certificate[] = [];
    let certificate: DetailedPeerCertificate = socket.getPeerCertificate(true);
    for (;;) {
      const read = new X509Certificate(certificate.raw);
      if (chain.some((held) => held.fingerprint256 === read.fingerprint256)) break;
      chain.push(read);
      certificate = certificate.issuerCertificate;
    }
    return chain;
  } finally {
    socket.destroy();
  }
}

// The keys Chromium is told to take, as `--ignore-certificate-errors-spki-list` reads them.
export async function trustedKeys(hostnames: readonly string[]): Promise<string[]> {
  const keys = new Set<string>();
  for (const hostname of hostnames) {
    for (const certificate of await checkedChain(hostname)) {
      const spki = certificate.publicKey.export({ type: 'spki', format: 'der' });
      keys.add(createHash('sha256').update(spki).digest('base64'));
    }
  }
  return [...keys];
}

// An answer of the stack's, asked from Node over HTTPS, its certificate checked against the
// stack's root: for what a page of the app may not ask itself (its policy lets it reach the API
// alone).
export async function servedOverHttps(
  url: string,
): Promise<{ status: number; headers: Record<string, string | string[] | undefined> }> {
  const { hostname, pathname } = new URL(url);
  return new Promise((resolve, reject) => {
    const sent = httpsRequest(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        servername: hostname,
        headers: { host: hostname },
        ca: root(),
      },
      (received) => {
        received.resume();
        received.on('end', () => {
          resolve({ status: received.statusCode ?? 0, headers: received.headers });
        });
      },
    );
    sent.on('error', reject);
    sent.end();
  });
}
