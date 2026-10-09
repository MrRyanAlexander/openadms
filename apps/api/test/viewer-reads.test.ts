// A read-only viewer's path, from the door to the database's read-only login (ARCHITECTURE §5.5,
// §6; spec/acceptance/02-people-and-devices.md AC-02-74; spec/acceptance/10-api-and-sync.md
// AC-10-27, 30, 31; BACKLOG 2.4.5, C22; ADR-050, 169, 315, 434). OWASP ASVS 5.0 V8. The real
// process, in this test's own memory, on the installation's database: it needs `pnpm local:up`
// after `pnpm installer`, and fails saying so. Each test's work is undone.
//
// **What this file can't show, and where it is shown.** The read-only login sees nothing a test
// hasn't committed, so the process here is handed a stand-in (`ViewedWithin`) that keeps who
// each read was stated as and reads as the API's login, which is shown every row. Which rows
// the database shows a client user, a contractor user and an auditor is proven as the read-only
// login itself: `packages/db/test/viewer.test.ts` (the one place that states the viewer),
// `viewers.test.ts`, `row-level-security.test.ts` and `contractor-users.test.ts`.
import { randomUUID } from 'node:crypto';

import {
  closeProjectEndpoint,
  createProjectEndpoint,
  endpoints,
  viewerOnly,
  viewerProjectsEndpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openApiViewerDatabase } from '../src/process/api-database.ts';
import { ViewerReads } from '../src/viewer/viewer-reads.ts';
import { installationSettings, openInstallation } from './support/database.ts';
import { danasEmail, long, longer, luissEmail, worldOn } from './support/served.ts';
import { ask, at, p1, saved, told, viewerSignsIn } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

// What a viewer may send that isn't a GET: their own sign-in's, and nothing of the firm's
// records. (Keeping a session going and signing out go by the refresh token, not a role.)
const aViewersOwn = ['changePassword', 'beginTwoStepSetup', 'confirmTwoStepSetup'];

describe('who may ask', () => {
  it('AC-10-27, 31 a viewer’s reads are a read-only viewer’s alone, and every one is a GET', () => {
    const viewers = endpoints.filter(({ roles }) => roles?.join() === viewerOnly.join());
    expect(viewers.map(({ name }) => name)).toEqual(['viewerProjects']);
    expect(viewers.map(({ method }) => method)).toEqual(viewers.map(() => 'GET'));
    expect(viewers.map(({ permission }) => permission)).toEqual(viewers.map(() => undefined));
  });

  it('AC-10-31 no endpoint that changes anything is open to a read-only viewer, but their own password and authenticator', () => {
    expect(
      endpoints
        .filter(({ method, roles }) => method !== 'GET' && roles?.includes('READ_ONLY_VIEWER'))
        .map(({ name }) => name),
    ).toEqual(aViewersOwn);
  });

  it('AC-10-27 nobody, an admin and a manager/analyst are refused before anything is read; nothing is stated to the database for them', async () => {
    await world(async (served) => {
      const dana = await served.signedIn(danasEmail, long);
      const luis = await served.signedIn(luissEmail, longer);
      expect(told(await ask(served, undefined, viewerProjectsEndpoint))).toEqual([
        401,
        'NOT_SIGNED_IN',
      ]);
      for (const backOffice of [dana, luis]) {
        expect(
          told(await ask(served, backOffice, viewerProjectsEndpoint, { query: '?limit=0' })),
        ).toEqual([403, 'NOT_ALLOWED']);
      }
      expect(served.viewerStated).toEqual([]);
    });
  });
});

describe('a read-only viewer’s read', () => {
  it('AC-10-30 states the signed-in viewer to the database, each time, and nobody else', async () => {
    await world(async (served, tx, who, within) => {
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      saved(viewerProjectsEndpoint, await ask(served, viewer, viewerProjectsEndpoint));
      saved(viewerProjectsEndpoint, await ask(served, viewer, viewerProjectsEndpoint));
      expect(served.viewerStated).toEqual([who.viewer, who.viewer]);
    });
  });

  it('AC-02-74 answers a project by its name, time zone and when it was closed, a page at a time, and nothing else of it', async () => {
    await world(async (served, tx, who, within) => {
      const dana = await served.signedIn(danasEmail, long);
      const row = await p1(served, dana, tx);
      const ppdr = saved(
        createProjectEndpoint,
        await ask(served, dana, createProjectEndpoint, {
          payload: { ...row.payload, name: 'Bayline County PPDR, Hurricane Delphine' },
        }),
      ).record;
      saved(
        closeProjectEndpoint,
        await ask(served, dana, closeProjectEndpoint, { ids: { projectId: ppdr.id } }),
      );
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      const read = async (query = '') =>
        saved(viewerProjectsEndpoint, await ask(served, viewer, viewerProjectsEndpoint, { query }));

      // The installation may hold other projects: these two are read among whatever it holds.
      const ours = (await read('?limit=200')).projects.filter(({ id }) =>
        [row.project.id, ppdr.id].includes(id),
      );
      expect(ours).toEqual([
        {
          id: row.project.id,
          name: 'Bayline County ROW, Hurricane Delphine',
          timeZone: 'America/New_York',
          closedAt: null,
        },
        {
          id: ppdr.id,
          name: 'Bayline County PPDR, Hurricane Delphine',
          timeZone: 'America/New_York',
          closedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as string,
        },
      ]);

      // A page of one says what follows it; the page after P1 starts at the PPDR project.
      const first = await read('?limit=1');
      expect(first.projects).toHaveLength(1);
      expect(first.next).toBe(first.projects[0]?.id);
      const after = await read(`?after=${row.project.id}&limit=1`);
      expect(after.projects.map(({ id }) => id)).toEqual([ppdr.id]);
      expect(after.next).toBeNull();
    });
  });

  it('AC-10-34, 37 takes nothing its schema doesn’t name, told which in plain words', async () => {
    await world(async (served, tx, who, within) => {
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      for (const query of ['?limit=0', '?limit=201', '?after=101001', '?projectId=1']) {
        const answer = await ask(served, viewer, viewerProjectsEndpoint, { query });
        expect(told(answer), query).toEqual([400, 'BAD_REQUEST']);
      }
      expect(served.viewerStated).toEqual([]);
    });
  });
});

describe('as the database’s read-only login itself', () => {
  it('AC-10-30 every read the service makes is one the login is granted, and somebody the firm issued no viewer’s login is shown nothing', async () => {
    // The real login, on the installation's database: a read of a column it isn't granted
    // would be the database's refusal here, whoever is stated.
    const viewed = openApiViewerDatabase(installationSettings(), 1);
    try {
      const reads = new ViewerReads(viewed);
      expect(await reads.projects(randomUUID(), { limit: 200 })).toEqual({
        projects: [],
        next: null,
      });
      expect(await reads.projects(randomUUID(), { after: randomUUID(), limit: 1 })).toEqual({
        projects: [],
        next: null,
      });
    } finally {
      await viewed.$disconnect();
    }
  });
});

describe('a read-only viewer changes nothing', () => {
  it('AC-10-31 every request that isn’t a GET, but their own password and authenticator, is refused to a viewer at the door, whatever they send', async () => {
    await world(async (served, tx, who, within) => {
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      const writes = endpoints.filter(
        ({ access, method, name }) =>
          access === 'SIGNED_IN' && method !== 'GET' && !aViewersOwn.includes(name),
      );
      expect(writes.length).toBeGreaterThanOrEqual(70);
      const before = await tx.auditRecord.count();
      for (const write of writes) {
        const answer = await served.ask(write.method, at(write), { ...viewer, payload: {} });
        expect(told(answer), write.name).toEqual([403, 'NOT_ALLOWED']);
      }
      // Not one of them left a record of a change.
      expect(await tx.auditRecord.count()).toBe(before);
    });
  });
});
