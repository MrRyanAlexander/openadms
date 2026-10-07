// The door (ARCHITECTURE §4, §6, Transport; acceptance file 10, section A, AC-10-33 and
// AC-10-32's first half; T-10, T-26; ADR-385): the API's own container, asked as a caller would,
// through the local stack's proxy. It needs `pnpm local:up` after `pnpm installer`; without them
// these fail and say so. After a change to apps/api, `pnpm local:up` again: the container runs
// what was built when it started.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { request as overHttp } from 'node:http';
import { request as overHttps } from 'node:https';
import { dirname, join } from 'node:path';
import { connect } from 'node:tls';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { errorAnswerSchema, healthAnswerSchema } from '@open-adms/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

const repository = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const stack = join(repository, 'infra', 'local');
const rootCert = join(stack, '.generated', 'caddy-root.crt');
const hostname = 'api.adms.localhost';
const httpsPort = Number(process.env['ADMS_HTTPS_PORT'] ?? '443');
const httpPort = Number(process.env['ADMS_HTTP_PORT'] ?? '80');
const sent = 'sent-9f3c-never-logged';

interface Answer {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
}

// *.adms.localhost is this machine; the certificate is checked against the stack's own authority.
function ask(
  path: string,
  more: { method?: string; headers?: Record<string, string>; body?: string; plain?: boolean } = {},
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const options = {
      host: '127.0.0.1',
      path,
      method: more.method ?? 'GET',
      headers: { host: hostname, ...more.headers },
    };
    const answered = (res: import('node:http').IncomingMessage): void => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
      });
    };
    const req =
      more.plain === true
        ? overHttp({ ...options, port: httpPort }, answered)
        : overHttps(
            { ...options, port: httpsPort, servername: hostname, ca: readFileSync(rootCert) },
            answered,
          );
    req.on('error', reject);
    req.end(more.body);
  });
}

// The protocol agreed when a caller offers only these versions; an error when none is.
function tls(versions: {
  min: 'TLSv1' | 'TLSv1.2' | 'TLSv1.3';
  max: 'TLSv1.1' | 'TLSv1.2' | 'TLSv1.3';
}) {
  return new Promise<string>((resolve, reject) => {
    const socket = connect({
      host: '127.0.0.1',
      port: httpsPort,
      servername: hostname,
      ca: readFileSync(rootCert),
      minVersion: versions.min,
      maxVersion: versions.max,
      // So that this caller really offers TLS 1.0 and 1.1, which Node no longer does by default.
      ...(versions.max === 'TLSv1.1' ? { ciphers: 'DEFAULT@SECLEVEL=0' } : {}),
    });
    socket.once('secureConnect', () => {
      const protocol = socket.getProtocol() ?? '';
      socket.end();
      resolve(protocol);
    });
    socket.once('error', reject);
  });
}

function compose(args: string[]): string {
  const result = spawnSync(
    'docker',
    ['compose', '--project-name', 'open-adms-local', '--profile', 'api', ...args],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) throw new Error(`docker compose ${args[0] ?? ''} failed.`);
  return result.stdout;
}

beforeAll(async () => {
  if (!existsSync(rootCert)) {
    throw new Error('The local stack is not up: run `pnpm local:up` (after `pnpm installer`).');
  }
  try {
    await ask('/health');
  } catch {
    throw new Error('The local stack does not answer: run `pnpm local:up`.');
  }
});

describe('the door: HTTPS only, through the proxy', () => {
  it('AC-10-01: the health answer, under a certificate of the stack’s own authority', async () => {
    const answer = await ask('/health');
    expect(answer.status).toBe(200);
    expect(healthAnswerSchema.parse(JSON.parse(answer.body))).toEqual({ status: 'ok' });
    // Checked against the root this machine's installed authorities know nothing of.
    await expect(
      new Promise((resolve, reject) => {
        const req = overHttps(
          { host: '127.0.0.1', port: httpsPort, path: '/health', servername: hostname },
          resolve,
        );
        req.on('error', reject);
        req.end();
      }),
    ).rejects.toThrow();
  });

  it('AC-10-01: the API publishes no port of its own', () => {
    const [id] = compose(['ps', '--quiet', 'api']).trim().split('\n');
    expect(id).toMatch(/^[0-9a-f]{12,}$/);
    const ports = spawnSync('docker', ['port', id ?? ''], { encoding: 'utf8' });
    expect(ports.status).toBe(0);
    expect(ports.stdout.trim()).toBe('');
    // Only the proxy, the database and the mail catcher's SMTP port reach this machine.
    const published = compose(['ps', '--format', '{{.Service}} {{.Ports}}'])
      .trim()
      .split('\n')
      .filter((line) => line.includes('->'))
      .map((line) => line.split(' ')[0]);
    expect(published.sort()).toEqual(['caddy', 'mail', 'postgres']);
  });

  it('AC-10-02: plain HTTP is redirected to HTTPS, and nothing is answered over it', async () => {
    const answer = await ask('/health', { plain: true });
    expect(answer.status).toBe(308);
    expect(answer.headers['location']).toBe(
      `https://${hostname}${httpsPort === 443 ? '' : `:${String(httpsPort)}`}/health`,
    );
    expect(answer.body).toBe('');
  });

  it('AC-10-03: TLS 1.2 and 1.3 are taken; a caller with nothing newer than 1.1 is not', async () => {
    expect(await tls({ min: 'TLSv1.3', max: 'TLSv1.3' })).toBe('TLSv1.3');
    expect(await tls({ min: 'TLSv1.2', max: 'TLSv1.2' })).toBe('TLSv1.2');
    await expect(tls({ min: 'TLSv1', max: 'TLSv1.1' })).rejects.toThrow(/protocol version|alert/i);
  });
});

describe('what an error and the log say, through the door', () => {
  it('AC-10-33: a path nobody serves and a body that is not JSON get a plain code', async () => {
    const nowhere = await ask(`/nowhere?password=${sent}`);
    expect(nowhere.status).toBe(404);
    expect(errorAnswerSchema.parse(JSON.parse(nowhere.body)).code).toBe('NOT_FOUND');
    const broken = await ask('/health', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: `{"password": "${sent}"`,
    });
    expect(broken.status).toBeGreaterThanOrEqual(400);
    expect(broken.status).toBeLessThan(500);
    errorAnswerSchema.parse(JSON.parse(broken.body));
    for (const answer of [nowhere, broken]) {
      expect(answer.body).not.toContain(sent);
      expect(answer.body).not.toContain(' at ');
      expect(answer.body).not.toContain('/srv/');
    }
  });

  it('AC-10-32: the container’s log is structured, carries each request’s id, and holds no secret', async () => {
    const asked = await ask(`/nowhere?token=${sent}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${sent}`,
        cookie: `session=${sent}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ password: sent, phone: sent }),
    });
    const { requestId } = errorAnswerSchema.parse(JSON.parse(asked.body));
    const log = compose(['logs', '--no-log-prefix', '--no-color', 'api']);
    const lines = log.trim().split('\n');
    expect(lines.length).toBeGreaterThan(3);
    const parsed = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(parsed.some((line) => line['requestId'] === requestId)).toBe(true);
    for (const line of parsed) {
      if (line['req'] !== undefined || line['res'] !== undefined) {
        expect(line['requestId']).toMatch(/^[0-9a-f-]{36}$/);
      }
    }
    for (const never of [sent, 'Bearer', 'session=', 'password', 'token=']) {
      expect(log).not.toContain(never);
    }
    // None of the API's own settings is in its log: each value is read here and never printed.
    const settings = parseEnv(readFileSync(join(repository, 'apps', 'api', '.env'), 'utf8'));
    const held = Object.entries(settings)
      .filter(([, value]) => value !== undefined && value.length >= 8)
      .filter(([, value]) => log.includes(value ?? ''))
      .map(([key]) => key);
    expect(held).toEqual([]);
  });
});
