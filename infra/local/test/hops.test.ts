// Every hop inside the local stack is encrypted (ARCHITECTURE §4; OWASP ASVS 5.0 12.3.1, 12.3.3;
// KD-78; ADR-517): each service Caddy reaches answers HTTPS alone, with its certificate of the
// stack's root for the name it is reached by, and refuses plain HTTP; Valhalla's own plain port
// and every server of the object store, S3 and each one's gRPC among them, are their container's
// loopback, out of the network's reach (ADR-525); the mail catcher takes no mail before STARTTLS. Asked from inside the stack's network (the address server's container, which holds
// curl and the stack's root) and from this machine: it needs `pnpm local:up`, and fails saying so.
// Postgres's part is the database's own test (packages/db/test/tls.test.ts).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const stack = join(dirname(fileURLToPath(import.meta.url)), '..');
const rootCert = join(stack, '.generated', 'caddy-root.crt');
// A container of the stack's network with curl and the stack's root in it.
const inside = 'open-adms-local-addresses-1';

beforeAll(() => {
  if (!existsSync(rootCert)) {
    throw new Error('The local stack is not up: run `pnpm local:up` first (adms-verify).');
  }
});

// curl, from inside the stack's network: its exit status and what it wrote.
function curl(...args: string[]): { status: number | null; out: string } {
  const run = spawnSync(
    'docker',
    ['exec', inside, 'curl', '--silent', '--show-error', '--max-time', '10', ...args],
    { encoding: 'utf8' },
  );
  return { status: run.status, out: `${run.stdout}${run.stderr}` };
}

// Each service Caddy reaches, as Caddy reaches it, and a path it answers.
const upstreams = [
  { name: 'api', at: 'api:3000', path: '/health' },
  { name: 'objectstore', at: 'objectstore:8333', path: '/healthz' },
  { name: 'mail', at: 'mail:8025', path: '/readyz' },
  { name: 'routing', at: 'routing:8443', path: '/status' },
  { name: 'addresses', at: 'addresses:8080', path: '/status' },
] as const;

describe('inside the stack’s network, each service Caddy reaches (KD-78)', () => {
  it.each(upstreams)(
    '$name answers HTTPS with its certificate of the stack’s root, for its own name alone',
    ({ at, path }) => {
      const answered = curl(
        '--fail',
        '--output',
        '/dev/null',
        '--write-out',
        '%{http_code} %{ssl_verify_result}',
        '--cacert',
        '/run/adms/tls/root.crt',
        `https://${at}${path}`,
      );
      expect(answered.out).toBe('200 0');
      expect(answered.status).toBe(0);
      // Asked by an address its certificate doesn't name, it is refused by the client's check.
      const [host, port] = at.split(':');
      const misnamed = curl(
        '--output',
        '/dev/null',
        '--cacert',
        '/run/adms/tls/root.crt',
        '--resolve',
        `someone-else.example:${port ?? ''}:${resolved(host ?? '')}`,
        `https://someone-else.example:${port ?? ''}${path}`,
      );
      expect(misnamed.status).toBe(60);
    },
  );

  it.each(upstreams)('$name refuses plain HTTP: nothing is answered in clear', ({ at, path }) => {
    const plain = curl(
      '--output',
      '/dev/null',
      '--write-out',
      '%{http_code}',
      `http://${at}${path}`,
    );
    // A TLS server sent plain HTTP closes the connection, or answers 400 to say it wants TLS.
    expect(plain.status === 0 ? plain.out : 'refused').toMatch(/^(refused|400)$/);
  });

  it('Valhalla’s own plain port is its container’s loopback alone: the network can’t reach it', () => {
    const plain = curl('--output', '/dev/null', 'http://routing:8002/status');
    expect(plain.status).toBe(7);
  });

  // SeaweedFS's own servers (ASVS 5.0 4.2.1, 12.3.3; ADR-525): none speaks TLS or asks who calls.
  // The ports it listens on now (master, volume, filer, S3, each with its gRPC), and those
  // `mini` listened on before (its volume, S3's gRPC, its admin server's, an admin's gRPC).
  const storePorts = [
    9333, 19333, 8080, 18080, 8888, 18888, 8334, 18334, 9340, 19340, 18333, 23646, 33646,
  ];
  it.each(storePorts)(
    'the object store’s port %i is its container’s loopback alone: the network can’t reach it',
    (port) => {
      const plain = curl('--output', '/dev/null', `http://objectstore:${String(port)}/`);
      expect(plain.status).toBe(7);
    },
  );
});

// The address a service's name has on the stack's network, as the container sees it.
function resolved(name: string): string {
  const run = spawnSync('docker', ['exec', inside, 'getent', 'hosts', name], { encoding: 'utf8' });
  const address = run.stdout.trim().split(/\s+/)[0];
  if (run.status !== 0 || address === undefined || address === '') {
    throw new Error(`${name} has no address on the stack's network.`);
  }
  return address;
}

describe('the mail catcher’s SMTP, from this machine (KD-78)', () => {
  it('offers STARTTLS and takes no message before it', async () => {
    const port = Number(process.env['ADMS_SMTP_PORT'] ?? '1025');
    const said = await new Promise<string>((resolve, reject) => {
      const socket = connect(port, '127.0.0.1');
      let heard = '';
      const sent: string[] = [];
      socket.setEncoding('utf8');
      socket.setTimeout(5000, () => {
        socket.destroy();
        reject(new Error(`The mail catcher stopped answering: ${heard}`));
      });
      socket.on('data', (chunk: string) => {
        heard += chunk;
        const lines = heard.split('\r\n').filter((line) => line !== '');
        const last = lines.at(-1) ?? '';
        // Each step once its answer is whole (a last line of a code and a space).
        if (!/^\d{3} /.test(last)) return;
        if (sent.length === 0) {
          sent.push('EHLO');
          socket.write('EHLO tests.adms.localhost\r\n');
        } else if (sent.length === 1) {
          sent.push('MAIL');
          socket.write('MAIL FROM:<open-adms@adms.localhost>\r\n');
        } else {
          socket.end('QUIT\r\n');
          resolve(heard);
        }
      });
      socket.on('error', reject);
    });
    expect(said).toMatch(/^250[- ]STARTTLS$/m);
    expect(said).toMatch(/^530 .*STARTTLS/im);
  });
});
