// The firm's phones and its master passcode, from the back office, against the database
// (ARCHITECTURE §7.4, §7.5; spec/acceptance/02-people-and-devices.md AC-02-21, 22, 23, 59;
// spec/acceptance/10-api-and-sync.md AC-10-24, 27; BACKLOG 2.4.3, C47, C89; ADR-106, 134, 240,
// 281, 428). OWASP ASVS 5.0 V6, V7, V8. The real process, in this test's own memory, on the
// installation's database as `adms_api`: it needs `pnpm local:up` after `pnpm installer`, and
// fails saying so. Each test's work is undone (support/database.ts).
import { randomUUID } from 'node:crypto';

import {
  backOfficeRoles,
  adminOnly,
  changeMasterPasscodeEndpoint,
  endpoints,
  listPhonesEndpoint,
  removePhoneEndpoint,
  renamePhoneEndpoint,
  returnPhoneEndpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Phones } from '../src/dispatch/phones.ts';
import { PasswordHasher } from '../src/sign-in/password-hasher.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { enrolledPhone, proven, turnedIn } from './support/phones.ts';
import { danasEmail, long, longer, luissEmail, worldOn, type Served } from './support/served.ts';
import { ask, saved, told, viewerSignsIn } from './support/setup.ts';
import { Outbox, passwordKey } from './support/sign-in.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

const inForce = async (tx: Tx): Promise<number> =>
  (await tx.masterPasscode.aggregate({ _max: { version: true } }))._max.version ?? 0;

// The golden mission's three phones, each enrolled as a real one is: by the API's own request,
// with a software key, under the passcode in force (the test's own version).
async function enrolled(served: Served, tx: Tx) {
  const enrol = async (name: string) =>
    tx.device.findUniqueOrThrow({ where: { id: (await enrolledPhone(served, tx, name)).id } });
  return {
    collection: await enrol('P1-COL-1'),
    tdsrTower: await enrol('P1-TWR-TDSR'),
    landfillTower: await enrol('P1-TWR-LF'),
  };
}

const lost = { status: 'LOST', note: 'Not handed in at the yard on Monday' };
const passcode = 'heron-marsh-ferry';
const change = (currentPassword: string, to: string) => ({
  payload: { currentPassword, passcode: to },
});

describe('who may ask', () => {
  it('AC-10-27 the phones are read by an admin or a manager/analyst let see dispatch; one is taken out of service by an admin or a manager/analyst who holds Dispatch; the master passcode is an admin’s alone', () => {
    const asked = (name: string) => {
      const { access, roles, permission } = endpoints.find((one) => one.name === name) ?? {};
      return [access, roles, permission];
    };
    expect(asked('listPhones')).toEqual(['SIGNED_IN', backOfficeRoles, 'VIEW_DISPATCH']);
    expect(asked('removePhone')).toEqual(['SIGNED_IN', backOfficeRoles, 'DISPATCH']);
    expect(asked('changeMasterPasscode')).toEqual(['SIGNED_IN', adminOnly, undefined]);
    expect(
      endpoints.filter(({ permission }) => permission === 'DISPATCH').map(({ name }) => name),
    ).toEqual([
      'renamePhone',
      'removePhone',
      'returnPhone',
      'writeAssignment',
      'changeAssignment',
      'withdrawAssignment',
      'reinstateAssignment',
    ]);
  });

  it('AC-10-27 each is refused to nobody and to a read-only viewer; taking a phone out of service and changing the passcode to a manager/analyst without the grant, before anything sent is read; nothing is changed', async () => {
    await world(async (served, tx, who, within) => {
      const phones = await enrolled(served, tx);
      const before = await inForce(tx);
      const ids = { deviceId: phones.landfillTower.id };
      const luis = await served.signedIn(luissEmail, longer);
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      // A body no schema would take: the door answers first.
      const nonsense = { payload: { nonsense: true } };
      for (const [endpoint, more] of [
        [listPhonesEndpoint, {}],
        [removePhoneEndpoint, { ids, ...nonsense }],
        [changeMasterPasscodeEndpoint, nonsense],
      ] as const) {
        expect(told(await ask(served, undefined, endpoint, more)), endpoint.name).toEqual([
          401,
          'NOT_SIGNED_IN',
        ]);
        expect(told(await ask(served, viewer, endpoint, more)), endpoint.name).toEqual([
          403,
          'NOT_ALLOWED',
        ]);
      }
      expect(told(await ask(served, luis, removePhoneEndpoint, { ids, ...nonsense }))).toEqual([
        403,
        'NOT_ALLOWED',
      ]);
      expect(told(await ask(served, luis, changeMasterPasscodeEndpoint, nonsense))).toEqual([
        403,
        'NOT_ALLOWED',
      ]);
      // Setup is another permission: it opens nothing here.
      await tx.userPermission.create({ data: { userId: who.luis, permission: 'SETUP' } });
      expect(told(await ask(served, luis, removePhoneEndpoint, { ids, payload: lost }))).toEqual([
        403,
        'NOT_ALLOWED',
      ]);
      expect(
        await tx.device.count({ where: { id: { in: Object.values(phones).map(({ id }) => id) } } }),
      ).toBe(3);
      expect(await tx.device.count({ where: { status: { not: 'ACTIVE' } } })).toBe(0);
      expect(await inForce(tx)).toBe(before);
    });
  });

  it('the service asks again inside its own piece of work (ADR-364): called as a manager/analyst without Dispatch, a read-only viewer, a monitor, an archived admin or nobody on record, it changes nothing and says who may', async () => {
    await world(async (served, tx, who, within) => {
      const phones = await enrolled(served, tx);
      const service = new Phones(within, served.clock);
      const gone = await tx.user.create({ data: { name: 'Morgan Ellis', role: 'ADMIN' } });
      await tx.user.update({ where: { id: gone.id }, data: { archivedAt: new Date() } });
      // A grant written beside somebody who is no manager/analyst grants nothing.
      await tx.userPermission.create({ data: { userId: who.viewer, permission: 'DISPATCH' } });
      for (const caller of [who.luis, who.viewer, who.kim, gone.id, randomUUID()]) {
        const outcome = await service.remove(caller, phones.landfillTower.id, { status: 'LOST' });
        expect(outcome.saved ? 'saved' : outcome.refusal.code, caller).toBe('NOT_ALLOWED');
        const page = await service.list(caller, { outOfService: false, limit: 50 });
        if (caller !== who.luis) expect(page.done, caller).toBe(false);
      }
      const luis = await service.remove(who.luis, phones.landfillTower.id, { status: 'LOST' });
      expect(luis.saved ? '' : luis.refusal.message).toBe(
        'Luis Ortega may not dispatch: it takes an admin, or a manager/analyst granted "dispatch" and "view dispatch". Nothing was changed.',
      );
      expect(await tx.device.count({ where: { status: { not: 'ACTIVE' } } })).toBe(0);
    });
  });
});

describe('the firm’s phones', () => {
  it('AC-02-15 are read a page at a time, in the order they were enrolled: in service, with no project and no monitor, each holding the passcode’s check in force; never a key', async () => {
    await world(async (served, tx) => {
      const phones = await enrolled(served, tx);
      const luis = await served.signedIn(luissEmail, longer);
      const first = await ask(served, luis, listPhonesEndpoint, { query: '?limit=2' });
      const page = saved(listPhonesEndpoint, first);
      expect(page.phones.map(({ name }) => name)).toEqual(['P1-COL-1', 'P1-TWR-TDSR']);
      expect(page.next).toBe(phones.tdsrTower.id);
      expect(first.text).not.toContain('test-');
      expect(page.phones[0]).toEqual({
        id: phones.collection.id,
        name: 'P1-COL-1',
        status: 'ACTIVE',
        enrolledAt: phones.collection.enrolledAt.toISOString(),
        outOfServiceAt: null,
        outOfServiceMarkedAt: null,
        outOfServiceReasonId: null,
        outOfServiceReason: null,
        keyRevokedAt: null,
        keyRevokedBy: null,
        masterPasscodeVersion: await inForce(tx),
        holdsCurrentPasscode: true,
        heldBudgetPassedAt: null,
      });
      const rest = saved(
        listPhonesEndpoint,
        await ask(served, luis, listPhonesEndpoint, {
          query: `?limit=2&after=${String(page.next)}`,
        }),
      );
      expect([rest.phones.map(({ name }) => name), rest.next]).toEqual([['P1-TWR-LF'], null]);
      expect(
        saved(
          listPhonesEndpoint,
          await ask(served, luis, listPhonesEndpoint, { query: '?outOfService=true' }),
        ),
      ).toEqual({ phones: [], next: null });
      for (const query of ['?limit=0', '?limit=201', '?after=first', '?status=LOST']) {
        expect(told(await ask(served, luis, listPhonesEndpoint, { query })), query).toEqual([
          400,
          'BAD_REQUEST',
        ]);
      }
    });
  });

  it('AC-02-59 P1-TWR-LF can’t be found on Monday evening: Luis, granted Dispatch, marks it lost at 6:10 pm and it is out of service from exactly that time, its record kept, audited with him as the actor and his note as the reason', async () => {
    await world(async (served, tx, who) => {
      const phones = await enrolled(served, tx);
      await tx.userPermission.create({ data: { userId: who.luis, permission: 'DISPATCH' } });
      // 6:10 pm in Bayline County.
      served.clock.at = new Date('2026-10-12T22:10:00Z');
      const luis = await served.signedIn(luissEmail, longer);
      const ids = { deviceId: phones.landfillTower.id };
      const answer = await ask(served, luis, removePhoneEndpoint, { ids, payload: lost });
      expect(saved(removePhoneEndpoint, answer)).toEqual({
        record: {
          id: phones.landfillTower.id,
          name: 'P1-TWR-LF',
          status: 'LOST',
          enrolledAt: phones.landfillTower.enrolledAt.toISOString(),
          outOfServiceAt: '2026-10-12T22:10:00.000Z',
          outOfServiceMarkedAt: '2026-10-12T22:10:00.000Z',
          outOfServiceReasonId: null,
          outOfServiceReason: null,
          keyRevokedAt: null,
          keyRevokedBy: null,
          masterPasscodeVersion: await inForce(tx),
          holdsCurrentPasscode: true,
          heldBudgetPassedAt: null,
        },
        warnings: [],
      });
      expect(
        await tx.auditRecord.findMany({
          where: { requestId: answer.requestId },
          select: {
            tableName: true,
            operation: true,
            actorId: true,
            recordId: true,
            changedFields: true,
            reason: true,
          },
        }),
      ).toEqual([
        {
          tableName: 'device',
          operation: 'UPDATE',
          actorId: who.luis,
          recordId: phones.landfillTower.id,
          changedFields: ['out_of_service_at', 'out_of_service_marked_at', 'status'],
          reason: 'Not handed in at the yard on Monday',
        },
      ]);
      const out = saved(
        listPhonesEndpoint,
        await ask(served, luis, listPhonesEndpoint, { query: '?outOfService=true' }),
      );
      expect(out.phones.map(({ name, status }) => [name, status])).toEqual([['P1-TWR-LF', 'LOST']]);
      const inService = saved(listPhonesEndpoint, await ask(served, luis, listPhonesEndpoint));
      expect(inService.phones.map(({ name }) => name)).toEqual(['P1-COL-1', 'P1-TWR-TDSR']);

      // Once as lost: a second is refused in plain words and moves nothing (made retired is
      // AC-10-84's).
      served.clock.later(3);
      const again = await ask(served, luis, removePhoneEndpoint, {
        ids,
        payload: { status: 'LOST' },
      });
      expect([told(again), again.body]).toEqual([
        [422, 'NOT_SAVED'],
        expect.objectContaining({
          reason: 'ALREADY_OUT_OF_SERVICE',
          message: 'P1-TWR-LF was already taken out of service as lost. Nothing was changed.',
        }),
      ]);
      const kept = await tx.device.findUniqueOrThrow({ where: { id: phones.landfillTower.id } });
      expect([kept.status, kept.outOfServiceAt?.toISOString()]).toEqual([
        'LOST',
        '2026-10-12T22:10:00.000Z',
      ]);
    });
  });

  it('a phone handed in for good is retired, with no note; a phone the firm doesn’t have isn’t found; a way out of service nobody defined, a blank note and a field no schema names are refused by the schema', async () => {
    await world(async (served, tx) => {
      const phones = await enrolled(served, tx);
      const dana = await served.signedIn(danasEmail, long);
      const ids = { deviceId: phones.collection.id };
      for (const payload of [
        { status: 'ACTIVE' },
        { status: 'LOST', note: '   ' },
        { status: 'LOST', outOfServiceAt: 'Monday evening' },
        { status: 'LOST', reasonId: 'stolen' },
        { status: 'LOST', removedAt: '2026-10-12T19:00:00Z' },
        {},
      ]) {
        expect(
          told(await ask(served, dana, removePhoneEndpoint, { ids, payload })),
          JSON.stringify(payload),
        ).toEqual([400, 'BAD_REQUEST']);
      }
      expect(
        told(await ask(served, dana, removePhoneEndpoint, { payload: { status: 'LOST' } })),
      ).toEqual([404, 'NOT_FOUND']);
      const answer = await ask(served, dana, removePhoneEndpoint, {
        ids,
        payload: { status: 'RETIRED' },
      });
      expect(saved(removePhoneEndpoint, answer).record).toMatchObject({
        status: 'RETIRED',
        outOfServiceAt: served.clock.now().toISOString(),
      });
      const [audited] = await tx.auditRecord.findMany({ where: { requestId: answer.requestId } });
      expect(audited?.reason).toBeNull();
    });
  });
});

describe('a phone’s other acts at the back office (ADR-530; C102)', () => {
  it('AC-10-84 a phone is renamed as the dispatch board calls it, nothing else of it changed, audited', async () => {
    await world(async (served, tx, who) => {
      const phones = await enrolled(served, tx);
      const dana = await served.signedIn(danasEmail, long);
      const luis = await served.signedIn(luissEmail, longer);
      const ids = { deviceId: phones.collection.id };
      expect(
        told(await ask(served, luis, renamePhoneEndpoint, { ids, payload: { name: 'P1-COL-9' } })),
      ).toEqual([403, 'NOT_ALLOWED']);
      const answer = await ask(served, dana, renamePhoneEndpoint, {
        ids,
        payload: { name: 'P1-COL-9' },
      });
      expect(saved(renamePhoneEndpoint, answer).record).toMatchObject({
        name: 'P1-COL-9',
        status: 'ACTIVE',
      });
      const [audited] = await tx.auditRecord.findMany({ where: { requestId: answer.requestId } });
      expect([audited?.actorId, audited?.changedFields]).toEqual([who.dana, ['name']]);
      for (const payload of [{ name: '  ' }, { name: 'P1-COL-9', status: 'LOST' }]) {
        expect(told(await ask(served, dana, renamePhoneEndpoint, { ids, payload }))).toEqual([
          400,
          'BAD_REQUEST',
        ]);
      }
    });
  });

  it('AC-10-84 a lost phone is made retired: marked again now, its removal time kept; a removal time stated by hand is never after now nor before enrolment; a reason is one the firm offers for a removal', async () => {
    await world(async (served, tx) => {
      const phones = await enrolled(served, tx);
      // 6:10 pm in Bayline County, before signing in: an access token lasts five minutes.
      served.clock.at = new Date('2026-10-12T22:10:00Z');
      const dana = await served.signedIn(danasEmail, long);
      const ids = { deviceId: phones.landfillTower.id };
      const stolen = await tx.reason.create({
        data: { name: 'Stolen', position: 900, uses: ['PHONE_REMOVAL'] },
      });
      const voidOnly = await tx.reason.findFirstOrThrow({ where: { uses: { has: 'VOID' } } });
      const enrolledAt = phones.landfillTower.enrolledAt.toISOString();
      for (const [outOfServiceAt, reason] of [
        ['2026-10-12T22:10:01Z', 'REMOVAL_TIME_REFUSED'],
        [
          new Date(phones.landfillTower.enrolledAt.getTime() - 1000).toISOString(),
          'REMOVAL_TIME_REFUSED',
        ],
      ] as const) {
        const refused = await ask(served, dana, removePhoneEndpoint, {
          ids,
          payload: { status: 'LOST', outOfServiceAt },
        });
        expect([told(refused), refused.body], outOfServiceAt).toEqual([
          [422, 'NOT_SAVED'],
          expect.objectContaining({ reason }),
        ]);
      }
      const notOffered = await ask(served, dana, removePhoneEndpoint, {
        ids,
        payload: { status: 'LOST', reasonId: voidOnly.id },
      });
      expect([told(notOffered), notOffered.body]).toEqual([
        [422, 'NOT_SAVED'],
        expect.objectContaining({
          reason: 'UNKNOWN_REASON',
          message:
            'That reason isn’t one the firm offers for taking a phone out of service. Nothing was changed.',
        }),
      ]);
      // Lost since 4:00 pm, as the crew remember; marked at 6:10 pm.
      const lostAnswer = saved(
        removePhoneEndpoint,
        await ask(served, dana, removePhoneEndpoint, {
          ids,
          payload: { status: 'LOST', outOfServiceAt: '2026-10-12T20:00:00Z', reasonId: stolen.id },
        }),
      );
      expect(lostAnswer.record).toMatchObject({
        status: 'LOST',
        outOfServiceAt: '2026-10-12T20:00:00.000Z',
        outOfServiceMarkedAt: '2026-10-12T22:10:00.000Z',
        outOfServiceReasonId: stolen.id,
        outOfServiceReason: stolen.name,
      });
      expect(enrolledAt < '2026-10-12T20:00:00.000Z').toBe(true);
      // Tuesday morning it is written off: retired, marked again now, lost since 4:00 pm still.
      served.clock.at = new Date('2026-10-13T13:00:00Z');
      const tuesday = await served.signedIn(danasEmail, long);
      const retired = saved(
        removePhoneEndpoint,
        await ask(served, tuesday, removePhoneEndpoint, { ids, payload: { status: 'RETIRED' } }),
      );
      expect(retired.record).toMatchObject({
        status: 'RETIRED',
        outOfServiceAt: '2026-10-12T20:00:00.000Z',
        outOfServiceMarkedAt: '2026-10-13T13:00:00.000Z',
        outOfServiceReasonId: stolen.id,
        outOfServiceReason: stolen.name,
      });
      const again = await ask(served, tuesday, removePhoneEndpoint, {
        ids,
        payload: { status: 'LOST' },
      });
      expect([told(again), again.body]).toEqual([
        [422, 'NOT_SAVED'],
        expect.objectContaining({ reason: 'ALREADY_OUT_OF_SERVICE' }),
      ]);
    });
  });

  it('AC-10-84 a found phone is put back in service with a note, its removal, mark and reason cleared; one in service is refused; one whose key is revoked stays as it is', async () => {
    await world(async (served, tx, who) => {
      const phones = await enrolled(served, tx);
      const dana = await served.signedIn(danasEmail, long);
      const ids = { deviceId: phones.collection.id };
      const note = { note: 'Found under the seat of the truck' };
      const inService = await ask(served, dana, returnPhoneEndpoint, { ids, payload: note });
      expect([told(inService), inService.body]).toEqual([
        [422, 'NOT_SAVED'],
        expect.objectContaining({
          reason: 'IN_SERVICE',
          message: 'P1-COL-1 is in service. Nothing was changed.',
        }),
      ]);
      const broken = await tx.reason.create({
        data: { name: 'Broken', position: 901, uses: ['PHONE_REMOVAL'] },
      });
      saved(
        removePhoneEndpoint,
        await ask(served, dana, removePhoneEndpoint, {
          ids,
          payload: { ...lost, reasonId: broken.id },
        }),
      );
      expect(told(await ask(served, dana, returnPhoneEndpoint, { ids, payload: {} }))).toEqual([
        400,
        'BAD_REQUEST',
      ]);
      const back = await ask(served, dana, returnPhoneEndpoint, { ids, payload: note });
      expect(saved(returnPhoneEndpoint, back).record).toMatchObject({
        status: 'ACTIVE',
        outOfServiceAt: null,
        outOfServiceMarkedAt: null,
        outOfServiceReasonId: null,
        outOfServiceReason: null,
        keyRevokedAt: null,
      });
      const [audited] = await tx.auditRecord.findMany({ where: { requestId: back.requestId } });
      expect([audited?.actorId, audited?.reason]).toEqual([who.dana, note.note]);
      // Turned in: its key revoked, it stays as it is.
      const { id: turned, key } = await enrolledPhone(served, tx, 'P1-UR-1');
      await turnedIn(served, await proven(served, { id: turned, key }));
      const told_ = {
        reason: 'KEY_REVOKED',
        message:
          'P1-UR-1’s key is revoked, so it stays as it is. Wipe the phone and enrol it again to use it. Nothing was changed.',
      };
      for (const [served_, payload] of [
        [returnPhoneEndpoint, note],
        [removePhoneEndpoint, { status: 'LOST' }],
      ] as const) {
        const refused = await ask(served, dana, served_, { ids: { deviceId: turned }, payload });
        expect([told(refused), refused.body], served_.name).toEqual([
          [422, 'NOT_SAVED'],
          expect.objectContaining(told_),
        ]);
      }
    });
  });
});

describe('the master passcode', () => {
  it('AC-02-21, AC-02-22, AC-02-23 Dana changes it, giving her own password again: a new version is kept as an Argon2id hash and the one before is still there; the audit log names her and holds no hash; each phone still says the version it holds until its next sync; every admin is told by mail, never the passcode', async () => {
    const outbox = new Outbox();
    await world(async (served, tx, who) => {
      const phones = await enrolled(served, tx);
      const before = await inForce(tx);
      const dana = await served.signedIn(danasEmail, long);
      const answer = await ask(served, dana, changeMasterPasscodeEndpoint, change(long, passcode));
      expect(saved(changeMasterPasscodeEndpoint, answer)).toEqual({
        status: 'ok',
        version: before + 1,
      });
      const versions = await tx.masterPasscode.findMany({ orderBy: { version: 'asc' } });
      expect(versions.map(({ version }) => version)).toEqual(
        Array.from({ length: before + 1 }, (_, at) => at + 1),
      );
      const hash = versions.at(-1)?.hash ?? '';
      // Keyed with the password key, and its offline seed sealed for it (ADR-542).
      expect(hash).toMatch(
        /^\$argon2id\$v=19\$m=19456,t=2,p=1,keyid=djI\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/,
      );
      expect(versions.at(-1)?.offlineSeed).toMatch(
        /^v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
      );
      const hasher = new PasswordHasher(passwordKey);
      expect([await hasher.verify(passcode, hash), await hasher.verify(long, hash)]).toEqual([
        true,
        false,
      ]);
      const audited = await tx.auditRecord.findMany({ where: { requestId: answer.requestId } });
      expect(
        audited.map(({ tableName, operation, actorId, domain, newValue }) => [
          tableName,
          operation,
          actorId,
          domain,
          (newValue as { hash: string }).hash,
        ]),
      ).toEqual([['master_passcode', 'INSERT', who.dana, 'SECURITY', '[kept out of the audit]']]);
      for (const kept of [answer.text, served.lines.join('\n'), JSON.stringify(outbox.sent)]) {
        expect(kept).not.toContain(passcode);
        expect(kept).not.toContain(hash);
      }
      expect(outbox.sent.map(({ to, subject }) => [to, subject])).toEqual([
        [danasEmail, 'Your firm’s Open ADMS master passcode was changed'],
      ]);
      const page = saved(listPhonesEndpoint, await ask(served, dana, listPhonesEndpoint));
      expect(
        page.phones.map(({ id, masterPasscodeVersion, holdsCurrentPasscode }) => [
          id,
          masterPasscodeVersion,
          holdsCurrentPasscode,
        ]),
      ).toEqual(Object.values(phones).map(({ id }) => [id, before, false]));

      // The one in force again is no change.
      expect(
        told(await ask(served, dana, changeMasterPasscodeEndpoint, change(long, passcode))),
      ).toEqual([422, 'PASSWORD_UNCHANGED']);
      expect(await inForce(tx)).toBe(before + 1);
    }, outbox);
  });

  it('AC-10-24 one known from breaches, whatever its capitals, one under 8 characters and one over 128 are refused in plain words; nothing is kept', async () => {
    await world(async (served, tx) => {
      const before = await inForce(tx);
      const dana = await served.signedIn(danasEmail, long);
      for (const [to, code, message] of [
        [
          'Password1234',
          'PASSWORD_BREACHED',
          'That is on a list of passwords known from breaches. Choose another.',
        ],
        ['marsh-7', 'PASSWORD_TOO_SHORT', 'The master passcode needs at least 8 characters.'],
        [
          'm'.repeat(129),
          'PASSWORD_TOO_LONG',
          'The master passcode can have at most 128 characters.',
        ],
      ] as const) {
        const answer = await ask(served, dana, changeMasterPasscodeEndpoint, change(long, to));
        expect([told(answer), answer.body], code).toEqual([
          [422, code],
          expect.objectContaining({ message }),
        ]);
      }
      for (const payload of [
        { passcode },
        { currentPassword: long },
        { currentPassword: long, passcode, version: 9 },
        { currentPassword: long, passcode: '' },
      ]) {
        expect(
          told(await ask(served, dana, changeMasterPasscodeEndpoint, { payload })),
          JSON.stringify(Object.keys(payload)),
        ).toEqual([400, 'BAD_REQUEST']);
      }
      expect(await inForce(tx)).toBe(before);
    });
  });

  it('a session is not enough (ASVS 7.5.1): without Dana’s own password it is refused, counted as a wrong try at her login, and nothing is kept; with it, the change is made', async () => {
    await world(async (served, tx, who) => {
      const before = await inForce(tx);
      const dana = await served.signedIn(danasEmail, long);
      const wrong = await ask(served, dana, changeMasterPasscodeEndpoint, change(longer, passcode));
      expect(told(wrong)).toEqual([422, 'PASSWORD_WRONG']);
      const tried = await tx.userCredential.findUniqueOrThrow({ where: { userId: who.dana } });
      expect([tried.failedSignIns, await inForce(tx)]).toEqual([1, before]);
      expect(
        saved(
          changeMasterPasscodeEndpoint,
          await ask(served, dana, changeMasterPasscodeEndpoint, change(long, passcode)),
        ).version,
      ).toBe(before + 1);
    });
  });
});
