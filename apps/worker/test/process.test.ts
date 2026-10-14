// The worker as a process (ARCHITECTURE §4, Secrets; §13; acceptance file 10, AC-10-55 and
// AC-10-32; ADR-419): its settings are read once and checked, and a missing or malformed one
// stops the start and names its key, never its value; its policy is the release's with the
// installation's own over it; its log is one JSON object a line with no error's message in it;
// its health answer says that it answers and how its queue stands. These need no stack; three
// start the built process itself (apps/worker/dist/main.js).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { MapServers } from '../src/index.ts';
import { Health } from '../src/process/health.ts';
import type { WorkerStanding } from '../src/process/job-loop.ts';
import { WorkerLog } from '../src/process/logs.ts';
import { builtInPolicy, installationPolicy } from '../src/process/policy.ts';
import { Settings, SettingsProblem } from '../src/process/settings.ts';

// Made-up values, this test's own; the login's URL is put together here so that no file holds one.
const word = ['made', 'up', 'for', 'this', 'test'].join('-');
const sha256 = '08c07f96ad5863a267cb09c0921d9b6dd6904d8b2fe0704f67ec866af11d1888';
// The login asks TLS alone, its server's certificate and name checked (KD-78; ADR-517).
const tls = '?sslmode=verify-full';
const good: Record<string, string> = {
  DATABASE_URL: `postgresql://adms_worker:${word}@127.0.0.1:55432/adms${tls}`,
  ADMS_ROUTING_URL: 'https://routing.adms.localhost',
  ADMS_ADDRESSES_URL: 'https://addresses.adms.localhost:8443',
  ADMS_MAP_EXTRACT_SHA256: sha256,
  ADMS_WORKER_HOST: '127.0.0.1',
  ADMS_WORKER_PORT: '3001',
};
const without = (key: string): Record<string, string> =>
  Object.fromEntries(Object.entries(good).filter(([name]) => name !== key));

function problemOf(environment: Record<string, string>): SettingsProblem {
  try {
    Settings.from(environment);
  } catch (problem) {
    if (problem instanceof SettingsProblem) return problem;
    throw problem;
  }
  throw new Error('The settings were taken.');
}

const folders: string[] = [];
afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true, force: true });
});
function fileWith(name: string, text: string): string {
  const folder = mkdtempSync(join(tmpdir(), 'adms-worker-'));
  folders.push(folder);
  const file = join(folder, name);
  writeFileSync(file, text, { mode: 0o600 });
  return file;
}

describe('the settings the worker starts with', () => {
  it('are taken when every one is there and well formed', () => {
    const settings = Settings.from(good);
    expect(settings.databaseUrl).toBe(good['DATABASE_URL']);
    expect(settings.routingUrl).toBe('https://routing.adms.localhost');
    expect(settings.addressesUrl).toBe('https://addresses.adms.localhost:8443');
    expect(settings.mapExtractSha256).toBe(sha256);
    expect(settings.mapCaFile).toBeNull();
    expect(settings.mapServersAt).toBeUndefined();
    expect(settings.host).toBe('127.0.0.1');
    expect(settings.port).toBe(3001);
  });

  it('AC-10-55: each one that is missing is named', () => {
    for (const key of Object.keys(good)) {
      const problem = problemOf(without(key));
      expect(problem.keys).toEqual([key]);
      expect(problem.message).toBe(`The worker did not start: ${key} is missing.`);
    }
    expect(problemOf({}).keys).toEqual([
      'DATABASE_URL',
      'ADMS_ROUTING_URL',
      'ADMS_ADDRESSES_URL',
      'ADMS_MAP_EXTRACT_SHA256',
      'ADMS_WORKER_HOST',
      'ADMS_WORKER_PORT',
    ]);
  });

  it('AC-10-55: each one that is malformed is named, never with its value', () => {
    const off: Record<string, string[]> = {
      DATABASE_URL: [
        'not-a-url-9f3c',
        'https://9f3c.example',
        `postgresql://adms_worker@h/adms${tls}`,
        // TLS alone, the certificate and name checked: no URL that asks less (KD-78).
        `postgresql://adms_worker:${word}@h/adms-9f3c`,
        `postgresql://adms_worker:${word}@h/adms-9f3c?sslmode=require`,
        `postgresql://adms_worker:${word}@h/adms-9f3c?sslmode=prefer`,
        `postgresql://adms_worker:${word}@h/adms-9f3c${tls}&sslmode=disable`,
        `postgresql://adms_worker:${word}@h/adms-9f3c${tls}&sslrootcert=/nowhere/9f3c.crt`,
      ],
      ADMS_DATABASE_CA_FILE: ['/nowhere/9f3c.crt'],
      // A map server is asked over HTTPS only (ADR-098), by its address alone.
      ADMS_ROUTING_URL: ['http://routing-9f3c.adms.localhost', 'https://h-9f3c/route', '9f3c'],
      ADMS_ADDRESSES_URL: ['http://addresses-9f3c.adms.localhost', 'https://u:9f3c@h'],
      ADMS_MAP_EXTRACT_SHA256: ['9f3c', sha256.toUpperCase(), `${sha256}9f3c`],
      ADMS_WORKER_HOST: ['localhost-9f3c', '999.9.9.9'],
      ADMS_WORKER_PORT: ['0', '65536', 'port-9f3c'],
      ADMS_DATABASE_ADDRESS: ['postgres-9f3c', 'postgres:9f3c', 'a:1:2'],
      ADMS_MAP_SERVERS_ADDRESS: ['caddy-9f3c:443', '172.30.213.2', '172.30.213.2:port-9f3c'],
      ADMS_MAP_CA_FILE: ['/nowhere/9f3c.crt'],
    };
    for (const [key, values] of Object.entries(off)) {
      for (const value of values) {
        const problem = problemOf({ ...good, [key]: value });
        expect(problem.keys, `${key}=${value}`).toEqual([key]);
        expect(problem.message).toBe(`The worker did not start: ${key} is malformed.`);
        expect(problem.message).not.toContain('9f3c');
      }
    }
  });

  it('take where the database and the map servers are when it isn’t where their names say, the login and the names unchanged', () => {
    const settings = Settings.from({
      ...good,
      ADMS_DATABASE_ADDRESS: 'postgres:5432',
      ADMS_MAP_SERVERS_ADDRESS: '172.30.213.2:443',
    });
    expect(settings.databaseUrl).toBe(`postgresql://adms_worker:${word}@postgres:5432/adms${tls}`);
    expect(settings.mapServersAt).toEqual({ host: '172.30.213.2', port: 443 });
    // Inside the stack the root its certificate is checked against is the stack's own path to it,
    // whatever this machine's path the installer wrote.
    const root = fileWith('root.crt', '-----BEGIN CERTIFICATE-----\nMIIB\n');
    const inStack = new URL(
      Settings.from({
        ...good,
        DATABASE_URL: `${good['DATABASE_URL'] ?? ''}&sslrootcert=%2Fnowhere%2Fhost%2Froot.crt`,
        ADMS_DATABASE_ADDRESS: 'postgres:5432',
        ADMS_DATABASE_CA_FILE: root,
      }).databaseUrl,
    );
    expect([
      inStack.host,
      inStack.searchParams.get('sslmode'),
      inStack.searchParams.get('sslrootcert'),
    ]).toEqual(['postgres:5432', 'verify-full', root]);
    expect(settings.routingUrl).toBe('https://routing.adms.localhost');
  });

  it('take a certificate authority’s file that holds a certificate, and no other file', () => {
    const certificate = fileWith('root.crt', '-----BEGIN CERTIFICATE-----\nMIIB\n');
    expect(Settings.from({ ...good, ADMS_MAP_CA_FILE: certificate }).mapCaFile).toBe(certificate);
    const other = fileWith('root.crt', 'nothing of the kind');
    expect(problemOf({ ...good, ADMS_MAP_CA_FILE: other }).keys).toEqual(['ADMS_MAP_CA_FILE']);
  });

  it('are read from the env file, and a key in the process’s environment wins over the file’s', () => {
    const file = fileWith(
      'worker.env',
      `${Object.entries(good)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')}\n`,
    );
    const read = Settings.read({
      ADMS_ENV_FILE: file,
      ADMS_WORKER_PORT: '3999',
      ADMS_WORKER_HOST: '',
    });
    expect(read.port).toBe(3999);
    expect(read.host).toBe('127.0.0.1');
    expect(read.databaseUrl).toBe(good['DATABASE_URL']);
  });
});

describe('the policy the worker runs with (ADR-395, 419)', () => {
  it('is the release’s where the installation states nothing', () => {
    expect(installationPolicy(good)).toEqual(builtInPolicy());
    expect(installationPolicy({ ...good, JOB_TRIES_BEFORE_SET_ASIDE: ' ' })).toEqual(
      builtInPolicy(),
    );
    const shipped = builtInPolicy();
    expect([
      shipped.jobTriesBeforeSetAside,
      shipped.reconciliationRunLongestMinutes,
      shipped.jobQueuePollSeconds,
      shipped.mapServerAnswerSeconds,
      shipped.databasePoolConnections,
      shipped.deviceClockOffLimitMinutes,
    ]).toEqual([5, 10, 5, 30, 10, 5]);
  });

  it('takes the installation’s own value under the same name, held to the same range', () => {
    const own = installationPolicy({ ...good, JOB_TRIES_BEFORE_SET_ASIDE: '3' });
    expect(own.jobTriesBeforeSetAside).toBe(3);
    const refused = (environment: Record<string, string>): string => {
      try {
        installationPolicy(environment);
      } catch (problem) {
        if (problem instanceof SettingsProblem) return problem.message;
        throw problem;
      }
      return 'taken';
    };
    expect(
      refused({
        JOB_TRIES_BEFORE_SET_ASIDE: '0',
        RECONCILIATION_RUN_LONGEST_MINUTES: 'long-9f3c',
        JOB_QUEUE_POLL_SECONDS: '3601',
        MAP_SERVER_ANSWER_SECONDS: '0',
        // A day at the most.
        DEVICE_CLOCK_OFF_LIMIT_MINUTES: '1441',
        // A run holds its lock on one connection and writes on another.
        DATABASE_POOL_CONNECTIONS: '1',
      }),
    ).toBe(
      'The worker did not start: DATABASE_POOL_CONNECTIONS is malformed; JOB_TRIES_BEFORE_SET_ASIDE is malformed; RECONCILIATION_RUN_LONGEST_MINUTES is malformed; JOB_QUEUE_POLL_SECONDS is malformed; MAP_SERVER_ANSWER_SECONDS is malformed; DEVICE_CLOCK_OFF_LIMIT_MINUTES is malformed.',
    );
    expect(installationPolicy({ ...good, DEVICE_CLOCK_OFF_LIMIT_MINUTES: '15' })).toHaveProperty(
      'deviceClockOffLimitMinutes',
      15,
    );
  });
});

describe('the worker as a process, started with settings that are off', () => {
  const main = fileURLToPath(new URL('../dist/main.js', import.meta.url));

  function startWith(lines: string[], environment: Record<string, string> = {}) {
    const file = fileWith('worker.env', `${lines.join('\n')}\n`);
    return spawnSync(process.execPath, [main], {
      encoding: 'utf8',
      timeout: 20_000,
      // Nothing of this machine's own environment reaches it.
      env: { ADMS_ENV_FILE: file, ...environment },
    });
  }

  it('AC-10-55: it stops, names each key and says no value', () => {
    const started = startWith([
      'DATABASE_URL=not-a-url-9f3c',
      'ADMS_ROUTING_URL=http://routing-9f3c.adms.localhost',
      `ADMS_MAP_EXTRACT_SHA256=${sha256}`,
      'ADMS_WORKER_HOST=127.0.0.1',
      'ADMS_WORKER_PORT=3001',
    ]);
    expect(started.status).toBe(1);
    expect(started.stdout).toBe('');
    const said = JSON.parse(started.stderr) as { msg: string; service: string };
    expect(said.service).toBe('worker');
    expect(said.msg).toBe(
      'The worker did not start: DATABASE_URL is malformed; ADMS_ROUTING_URL is malformed; ADMS_ADDRESSES_URL is missing.',
    );
    expect(started.stderr).not.toContain('9f3c');
  });

  it('AC-10-55: a key set in its environment wins over its file, and is checked the same', () => {
    const started = startWith(
      Object.entries(good).map(([key, value]) => `${key}=${value}`),
      { ADMS_WORKER_PORT: 'port-9f3c' },
    );
    expect(started.status).toBe(1);
    expect((JSON.parse(started.stderr) as { msg: string }).msg).toBe(
      'The worker did not start: ADMS_WORKER_PORT is malformed.',
    );
    expect(started.stderr).not.toContain('9f3c');
    expect(started.stderr).not.toContain(word);
  });

  it('AC-10-55: a policy value of its own that is off stops it the same way (ADR-395)', () => {
    const started = startWith(
      [
        ...Object.entries(good).map(([key, value]) => `${key}=${value}`),
        'JOB_QUEUE_POLL_SECONDS=0',
      ],
      { JOB_TRIES_BEFORE_SET_ASIDE: 'never-9f3c' },
    );
    expect(started.status).toBe(1);
    expect(started.stdout).toBe('');
    expect((JSON.parse(started.stderr) as { msg: string }).msg).toBe(
      'The worker did not start: JOB_TRIES_BEFORE_SET_ASIDE is malformed; JOB_QUEUE_POLL_SECONDS is malformed.',
    );
    expect(started.stderr).not.toContain('9f3c');
  });
});

describe('the worker’s log (AC-10-32)', () => {
  it('is one JSON object a line, and says an error’s kind and never its message', () => {
    const lines: string[] = [];
    const log = new WorkerLog({ write: (line) => lines.push(line) });
    log.info('A run worked its project’s waiting jobs.', { projectId: 'p', jobs: ['a', 'b'] });
    log.error(
      'The worker could not look at its queue.',
      new TypeError(`could not reach postgresql://adms_worker:${word}@127.0.0.1/adms`),
    );
    expect(lines.every((line) => line.endsWith('\n') && line.trim().split('\n').length === 1)).toBe(
      true,
    );
    const [first, second] = lines.map(
      (line) => JSON.parse(line) as Record<string, unknown> & { err?: { kind: string } },
    );
    expect(first).toMatchObject({
      level: 30,
      service: 'worker',
      projectId: 'p',
      jobs: ['a', 'b'],
      msg: 'A run worked its project’s waiting jobs.',
    });
    expect(second).toMatchObject({ level: 50, service: 'worker' });
    expect(second?.err?.kind).toBe('TypeError');
    expect(lines.join('')).not.toContain(word);
    expect(lines.join('')).not.toContain('postgresql://');
  });
});

describe('the worker’s health answer (ADR-419)', () => {
  const asked = (port: number, method: string, path: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, method, path }, (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, body: text });
        });
      });
      req.on('error', reject);
      req.end();
    });

  it('says how the worker and its queue stand, and nothing else: 200 when it is well, 503 when it isn’t, with the problem named; any other question is not found', async () => {
    let standing: WorkerStanding = {
      status: 'ok',
      jobsWaiting: 0,
      jobsSetAside: 0,
      oldestJobWaitingSeconds: 0,
    };
    const health = new Health(() => standing);
    await health.listen('127.0.0.1', 0);
    try {
      expect(await asked(health.port, 'GET', '/health')).toEqual({
        status: 200,
        body: '{"status":"ok","jobsWaiting":0,"jobsSetAside":0,"oldestJobWaitingSeconds":0}',
      });
      standing = { status: 'ok', jobsWaiting: 2, jobsSetAside: 1, oldestJobWaitingSeconds: 42 };
      expect(await asked(health.port, 'GET', '/health')).toEqual({
        status: 200,
        body: '{"status":"ok","jobsWaiting":2,"jobsSetAside":1,"oldestJobWaitingSeconds":42}',
      });
      standing = {
        status: 'unavailable',
        problem: 'QUEUE_NOT_READ',
        jobsWaiting: 2,
        jobsSetAside: 1,
        oldestJobWaitingSeconds: 42,
      };
      expect(await asked(health.port, 'GET', '/health')).toEqual({
        status: 503,
        body: '{"status":"unavailable","problem":"QUEUE_NOT_READ","jobsWaiting":2,"jobsSetAside":1,"oldestJobWaitingSeconds":42}',
      });
      for (const [method, path] of [
        ['GET', '/'],
        ['GET', '/health?verbose=1'],
        ['POST', '/health'],
      ] as const) {
        expect(await asked(health.port, method, path)).toEqual({
          status: 404,
          body: '{"code":"NOT_FOUND"}',
        });
      }
    } finally {
      await health.close();
    }
  });
});

describe('where the map servers are (ADR-419)', () => {
  it('is an IP address and a port, or left out', () => {
    const settings = {
      routing: 'https://routing.adms.localhost',
      addresses: 'https://addresses.adms.localhost',
      caFile: null,
      mapDataSha256: sha256,
      timeoutMs: 1_000,
    };
    expect(() => new MapServers(settings)).not.toThrow();
    expect(
      () => new MapServers({ ...settings, at: { host: '172.30.213.2', port: 443 } }),
    ).not.toThrow();
    expect(() => new MapServers({ ...settings, at: { host: 'caddy', port: 443 } })).toThrow(
      'Where the map servers are is an IP address and a port.',
    );
  });
});
