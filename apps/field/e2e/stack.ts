// The local stack as the browser tests reach it (ADR-564): its names, and the keys the browser is
// told to trust. A browser here doesn't hold the stack's root, and a test never tells it to take
// any certificate. So each name the page reaches is first connected to from Node, its chain
// checked against the stack's root (infra/local/.generated/caddy-root.crt) and the name, and only
// the public keys of the certificates so checked are handed to Chromium (SPKI SHA-256), which
// takes those and nothing else.
import { createHash, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { connect, type DetailedPeerCertificate } from 'node:tls';

export const fieldOrigin = 'https://field.adms.localhost';
export const apiOrigin = 'https://api.adms.localhost';

// Caddy is the one way in, on this machine's loopback, at 443 (infra/local/compose.yaml): the
// build's API origin names no port, so the tests need the stack there too.
const port = 443;
const root = readFileSync(
  new URL('../../../infra/local/.generated/caddy-root.crt', import.meta.url),
);

// Every certificate a name presents, once its chain is checked against the stack's root alone.
async function checkedChain(hostname: string): Promise<X509Certificate[]> {
  const socket = connect({ host: '127.0.0.1', port, servername: hostname, ca: root });
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
        ca: root,
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

// A page of another origin, on this machine's own loopback as the stack is, so that the browser's
// own guard against a public page reaching this machine (its local network access check) stays
// out of it and only the stack's answers decide what that page may do. Plain HTTP, made up for
// the test: `http://127.0.0.1:<port>`, a page that frames the app, or one that holds nothing.
export async function anotherOrigin(): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = createServer((asked, answer) => {
    const framing = asked.url === '/framing';
    answer.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    answer.end(
      framing
        ? `<!doctype html><title>x</title><iframe src="${fieldOrigin}/"></iframe>`
        : '<!doctype html><title>x</title>',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No port.');
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
      }),
  };
}
