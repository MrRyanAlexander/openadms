// A closed project is closed (ADR-529 (b); spec/acceptance/10-api-and-sync.md AC-10-81, 82;
// acceptance file 09, AC-09-22, 29). The user: "A closed project … Nothing else will be done to
// it ever." An admin reads what is still open, closes it by hand (its assignments withdrawn, its
// numbers retired), and reopens it with a reason; nothing in it changes after, the database
// refusing it; field work for it that arrives later is held for a person. The real process, in
// this test's own memory, on the installation's database as `adms_api`: it needs `pnpm ready`.
// Each test's work is undone. A refusal by the database ends the test's one piece of work, so it
// is the test's last request.
import {
  changeContractEndpoint,
  closeProjectEndpoint,
  closingCheckEndpoint,
  reopenProjectEndpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installationSettings, openInstallation } from './support/database.ts';
import { kimsOther, kimsPhone, nothingHeld, turnedIn } from './support/kims-phone.ts';
import { passcode } from './support/phones.ts';
import { luisHolds } from './support/review.ts';
import { worldOn } from './support/served.ts';
import { ask, notSaved, plainly, saved, told } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

describe('a project closed', () => {
  it('AC-10-82 an admin reads what is still open; a manager/analyst, even granted Setup, neither reads it nor closes nor reopens; while the worker still has its tickets the close waits', async () => {
    await world(async (served, tx, who) => {
      const p = await kimsPhone(served, tx, who);
      const ids = { projectId: p.projectId };
      const synced = await p.sync({
        records: [{ record: 'FIELD_EVENT', fieldEvent: p.collection() }],
      });
      expect(synced.records.map(({ answer }) => answer)).toEqual(['SAVED']);
      // A second phone took only a block of the project's numbers; a third, named on the board,
      // was turned in: its key is revoked, so it is not said.
      const second = await kimsOther(served, tx, who, p.projectId, 'P1-COL-2', p.dana);
      const blocks = await second.sync({
        lastUsed: [{ projectId: p.projectId, series: 'LOAD', lastUsedNumber: null }],
      });
      expect(blocks.numbers.map(({ toppedUp }) => toppedUp)).toEqual([true]);
      const third = await kimsOther(served, tx, who, p.projectId, 'P1-COL-3', p.dana);
      await tx.assignment.updateMany({
        where: { projectId: p.projectId, personId: who.kim, deviceId: null },
        data: { deviceId: third.phone.id },
      });
      const returned = await turnedIn(served, third.token, {
        passcode,
        holds: nothingHeld,
        lastUsed: [],
      });
      expect(returned.turnedIn).toBe(true);
      const luis = await luisHolds(served, tx, who.luis, 'SETUP');
      for (const [served_, payload] of [
        [closingCheckEndpoint, undefined],
        [closeProjectEndpoint, undefined],
        [reopenProjectEndpoint, { reason: 'Closed the wrong project' }],
      ] as const) {
        expect(
          told(
            await ask(served, luis, served_, {
              ids,
              ...(payload === undefined ? {} : { payload }),
            }),
          ),
          served_.name,
        ).toEqual([403, 'NOT_ALLOWED']);
      }
      const check = saved(
        closingCheckEndpoint,
        await ask(served, p.dana, closingCheckEndpoint, { ids }),
      );
      expect(check.items).toEqual([
        {
          code: 'PHONES_NOT_TURNED_IN',
          message: '2 phones that took its work haven’t been turned in: P1-COL-1, P1-COL-2.',
        },
      ]);
      expect(notSaved(await ask(served, p.dana, closeProjectEndpoint, { ids }))).toEqual([
        'PROJECT_WORK_UNDER_WAY',
        'Not closed: the worker is still working Bayline County ROW, Hurricane Delphine’s tickets. Close it again in a moment.',
      ]);
      expect(
        (await tx.project.findUniqueOrThrow({ where: { id: p.projectId } })).closedAt,
      ).toBeNull();
    });
  });

  it('AC-10-81, 82 closed, its assignments are withdrawn and what was open is said with it; field work for it that arrives later is held for a person, never written to it; a second close is answered as it stands; reopened with a reason, and closed again; then nothing in it changes', async () => {
    await world(async (served, tx, who) => {
      const p = await kimsPhone(served, tx, who);
      const ids = { projectId: p.projectId };
      // The board named Kim's phone on her assignment: the phone took the project's work.
      const assignment = await tx.assignment.findFirstOrThrow({
        where: { projectId: p.projectId, personId: who.kim },
      });
      await tx.assignment.update({ where: { id: assignment.id }, data: { deviceId: p.phone.id } });
      const load = { projectId: p.projectId, series: 'LOAD' as const };
      const before = await p.sync({ lastUsed: [{ ...load, lastUsedNumber: null }] });
      expect(before.numbers.map(({ toppedUp }) => toppedUp)).toEqual([true]);
      // A job the worker set aside is no work under way: it never stops the close.
      await tx.reconciliationJob.create({
        data: {
          projectId: p.projectId,
          trigger: 'SETUP_CHANGE',
          setAsideAt: new Date(),
          lastError: 'Failed too often.',
        },
      });
      const closed = saved(
        closeProjectEndpoint,
        await ask(served, p.dana, closeProjectEndpoint, { ids }),
      );
      expect(closed.record.closedAt).not.toBeNull();
      expect(closed.warnings).toEqual([
        {
          code: 'PHONES_NOT_TURNED_IN',
          message: '1 phone that took its work hasn’t been turned in: P1-COL-1.',
        },
      ]);
      const withdrawn = await tx.assignment.findUniqueOrThrow({ where: { id: assignment.id } });
      expect([withdrawn.archivedAt !== null, withdrawn.withdrawalNote]).toEqual([
        true,
        'Project closed.',
      ]);
      // Its numbers are retired: no phone takes them again.
      expect(
        await tx.numberBlock.groupBy({
          by: ['status'],
          where: { projectId: p.projectId },
          _count: true,
        }),
      ).toEqual([{ status: 'RETIRED', _count: 1 }]);
      // Monday's collection reaches the server after the close, with the phone's numbers and
      // the lists it holds: none topped up, no setup version shown.
      const late = await p.sync({
        records: [{ record: 'FIELD_EVENT', fieldEvent: p.collection() }],
        lastUsed: [{ ...load, lastUsedNumber: null }],
        holds: {
          masterPasscodeVersion: p.phone.masterPasscodeVersion,
          listsProjectId: p.projectId,
        },
      });
      expect([late.numbers, late.setupVersion]).toEqual([
        [{ ...load, toppedUp: false, blocks: [] }],
        null,
      ]);
      expect(
        late.records.map((record) =>
          record.answer === 'NOT_SAVED' ? [record.answer, record.reason, record.message] : record,
        ),
      ).toEqual([
        [
          'NOT_SAVED',
          'PROJECT_CLOSED',
          'Not saved: Bayline County ROW, Hurricane Delphine was closed on 12-Oct-2026, before this arrived. Held on the server for review.',
        ],
      ]);
      expect([
        await tx.fieldEvent.count({ where: { projectId: p.projectId } }),
        await tx.heldRecord.count({ where: { deviceId: p.phone.id, reason: 'PROJECT_CLOSED' } }),
      ]).toEqual([0, 1]);
      const again = await ask(served, p.dana, closeProjectEndpoint, { ids });
      expect(saved(closeProjectEndpoint, again).record.closedAt).toBe(closed.record.closedAt);
      expect(
        told(await ask(served, p.dana, reopenProjectEndpoint, { ids, payload: { reason: ' ' } })),
      ).toEqual([400, 'BAD_REQUEST']);
      const reopening = await ask(served, p.dana, reopenProjectEndpoint, {
        ids,
        payload: { reason: 'Closed before the last tickets were in' },
      });
      expect(saved(reopenProjectEndpoint, reopening).record.closedAt).toBeNull();
      expect(
        await tx.auditRecord.findMany({
          where: { requestId: reopening.requestId },
          select: { tableName: true, actorId: true, reason: true, changedFields: true },
        }),
      ).toEqual([
        {
          tableName: 'project',
          actorId: who.dana,
          reason: 'Closed before the last tickets were in',
          changedFields: ['closed_at'],
        },
      ]);
      expect(
        notSaved(
          await ask(served, p.dana, reopenProjectEndpoint, { ids, payload: { reason: 'Again' } }),
        ),
      ).toEqual([
        'PROJECT_NOT_CLOSED',
        'Not reopened: Bayline County ROW, Hurricane Delphine isn’t closed.',
      ]);
      saved(closeProjectEndpoint, await ask(served, p.dana, closeProjectEndpoint, { ids }));
      const contract = await tx.contract.findFirstOrThrow({ where: { projectId: p.projectId } });
      const refused = await ask(served, p.dana, changeContractEndpoint, {
        ids: { contractId: contract.id },
        payload: { name: 'Changed after the close' },
      });
      expect(told(refused)).toEqual([422, 'REFUSED_BY_THE_DATABASE']);
      expect(plainly(refused)).toBe('Not saved: the project is closed, and nothing in it changes.');
    });
  });
});
