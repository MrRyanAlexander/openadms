// A lost phone's key revoked after the firm's time (REQ-214; ARCHITECTURE §7.4; spec/acceptance/
// 10-api-and-sync.md AC-10-83, 84, 86; BACKLOG 2.8.6; ADR-065, 134, 488, 520, 530). P1-COL-2 is
// cut its first block of load numbers on Monday morning and can't be found that evening: Luis
// marks it lost, picking the firm's reason. The firm keeps a lost phone's key 24 hours, as the
// release ships it. The worker's pass a minute before the 24 hours leaves the key standing; the
// pass at the 24 hours revokes it as the system actor, its block retired whole. On Wednesday the
// phone turns up in the yard: its key alone proves nothing now, and it is told the passcode is
// needed; with the passcode beside its key it syncs (numbered no more) and is turned in, and from
// then on proves nothing at all. Every request through the real endpoints, every pass the
// worker's own on its login.
import { NumberAllocator, Phones } from '@open-adms/api';
import { deviceKeyActorId, masterPasscodeActorId, systemActorId } from '@open-adms/db';
import { PhoneKeyBackstop, WorkerLog } from '@open-adms/worker';

import { projectTime } from '../clock.ts';
import { uuidv7 } from '../ids.ts';
import type { Story } from '../runner.ts';
import { p1TimeZone as timeZone, setUpP1 } from './p1.ts';

const on = (day: string, time: string): string => `2026-10-${day}T${time}:00-04:00`;

export const lostPhoneKey: Story = {
  name: 'lost-phone-key',
  title:
    'a lost phone’s key revoked 24 hours after it was marked lost, by the worker; then synced and turned in under the master passcode, and proving nothing after',
  timeZone,
  start: on('12', '05:30'),

  async run(story) {
    const { api, worker, clock } = story;
    const shown = (moment: Date | null): string | null =>
      moment === null ? null : projectTime(timeZone, moment);

    story.at(
      on('12', '05:30'),
      'Dana Reyes has set up P1 and granted Luis Ortega dispatch; P1-COL-2 is enrolled',
    );
    const dana = uuidv7(clock.now());
    const office = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
      const luis = await tx.user.create({ data: { name: 'Luis Ortega', role: 'MANAGER_ANALYST' } });
      await tx.userPermission.create({ data: { userId: luis.id, permission: 'DISPATCH' } });
      await tx.userPermission.create({ data: { userId: luis.id, permission: 'VIEW_DISPATCH' } });
      const p1 = await setUpP1(tx, story.policy);
      return { luis: luis.id, p1: p1.project };
    });
    const phone = await story.enrolled('P1-COL-2');
    const firm = await api.firmSettings.findUniqueOrThrow({ where: { id: 1 } });
    story.check(
      'AC-10-83 the firm keeps a lost phone’s key 24 hours, as the release ships it; viewers’ two-step is optional',
      [firm.phoneKeyRevokedAfterHours, firm.viewerTwoStepRequired],
      [24, false],
    );

    story.at(on('12', '06:00'), 'P1-COL-2’s first sync: it is cut its first block of load numbers');
    const cut = await new NumberAllocator(api, clock, story.policy).topUp(
      { person: deviceKeyActorId, deviceId: phone.id },
      { projectId: office.p1, series: 'LOAD', lastUsedNumber: null },
    );
    if (!cut.saved) throw new Error(cut.refusal.message);
    const blocks = () =>
      api.numberBlock.findMany({
        where: { deviceId: phone.id },
        orderBy: { firstNumber: 'asc' },
        select: { firstNumber: true, lastNumber: true, status: true, endedAt: true },
      });

    story.at(on('12', '18:10'), 'P1-COL-2 can’t be found: Luis marks it lost, picking the reason');
    const reason = await api.reason.findFirstOrThrow({
      where: { name: 'Lost in the field', uses: { has: 'PHONE_REMOVAL' } },
    });
    const removed = await new Phones(api, clock).remove(office.luis, phone.id, {
      status: 'LOST',
      reasonId: reason.id,
      note: 'Not handed in at the yard on Monday',
    });
    if (!removed.saved) throw new Error(removed.refusal.message);
    story.check(
      'AC-10-84 out of service from 6:10 pm, marked then, with the firm’s reason; its key stands',
      [
        removed.record.status,
        shown(new Date(removed.record.outOfServiceAt ?? 0)),
        shown(new Date(removed.record.outOfServiceMarkedAt ?? 0)),
        removed.record.outOfServiceReasonId === reason.id,
        removed.record.keyRevokedAt,
      ],
      ['LOST', 'Mon 12 Oct 18:10', 'Mon 12 Oct 18:10', true, null],
    );

    // The worker's own pass, on its own login, on the story's clock.
    const backstop = new PhoneKeyBackstop(worker, new WorkerLog({ write: () => undefined }), clock);

    story.at(on('13', '18:09'), 'The worker’s pass a minute before the firm’s 24 hours');
    story.check('AC-10-83 a minute early, nothing is revoked', await backstop.pass(), {
      revoked: [],
      failed: [],
    });

    story.at(on('13', '18:10'), 'The worker’s pass at the firm’s 24 hours');
    story.check(
      'AC-10-83 24 hours after its mark, P1-COL-2’s key is revoked',
      await backstop.pass(),
      { revoked: [phone.id], failed: [] },
    );
    const revoked = await api.device.findUniqueOrThrow({ where: { id: phone.id } });
    story.check(
      'AC-10-83 revoked by the firm’s time at Tuesday 6:10 pm, still lost; its block retired whole, then',
      [
        revoked.keyRevokedBy,
        shown(revoked.keyRevokedAt),
        revoked.status,
        (await blocks()).map(({ firstNumber, lastNumber, status, endedAt }) => [
          firstNumber,
          lastNumber,
          status,
          shown(endedAt),
        ]),
      ],
      ['FIRM_TIME', 'Tue 13 Oct 18:10', 'LOST', [[101001, 102000, 'RETIRED', 'Tue 13 Oct 18:10']]],
    );
    const written = await api.auditRecord.findMany({
      where: { tableName: { in: ['device', 'number_block'] }, actorId: systemActorId },
      orderBy: { id: 'asc' },
      select: { tableName: true, source: true, changedFields: true },
    });
    story.check(
      'AC-10-83 written by the worker as the system actor, and a security event says so',
      [
        written.map(({ tableName, source, changedFields }) => [tableName, source, changedFields]),
        (
          await api.securityEvent.findMany({
            where: { deviceId: phone.id, kind: 'DEVICE_KEY_REVOKED' },
            select: { occurredAt: true },
          })
        ).map(({ occurredAt }) => shown(occurredAt)),
      ],
      [
        [
          ['number_block', 'SYSTEM', ['ended_at', 'status']],
          ['device', 'SYSTEM', ['key_revoked_at', 'key_revoked_by']],
        ],
        ['Tue 13 Oct 18:10'],
      ],
    );
    story.check('AC-10-83 a later pass finds nothing more to do', await backstop.pass(), {
      revoked: [],
      failed: [],
    });

    story.at(on('14', '09:00'), 'P1-COL-2 turns up in the yard on Wednesday and tries to sync');
    story.check(
      'AC-10-86 its key alone proves nothing now: it is told the master passcode is needed',
      (await story.proofs.proves(phone.id)).answer,
      'MASTER_PASSCODE_NEEDED',
    );

    story.at(on('14', '09:01'), 'A supervisor types the master passcode on it');
    story.check(
      'AC-10-86 with the passcode beside its key, it proves itself',
      await story.underPasscode.proves(phone.id),
      'PROVEN',
    );
    const { answered } = await story.server.received(phone.id, {
      clockAt: clock.now(),
      deviceUtcOffsetMinutes: -240,
      unplannedAssignments: [],
      passcodeUses: [],
      records: [],
      photos: [],
      lastUsed: [{ projectId: office.p1, series: 'LOAD', lastUsedNumber: 101005 }],
      holds: { masterPasscodeVersion: null, listsProjectId: null },
    });
    story.check(
      'AC-10-86 it syncs, and is numbered no more: its blocks were retired with its key',
      answered.numbers,
      [{ projectId: office.p1, series: 'LOAD', toppedUp: false, blocks: [] }],
    );

    story.at(on('14', '09:05'), 'The supervisor turns it in ("Sync and turn in")');
    const turnedIn = await story.underPasscode.turnInNaming(phone.id, {
      unplannedAssignments: [],
      passcodeUses: [],
      records: [],
      held: [],
      photos: [],
    });
    const after = await api.device.findUniqueOrThrow({ where: { id: phone.id } });
    story.check(
      'AC-10-86 turned in and told to wipe: its revocation is now its turn-in’s, its time kept',
      [turnedIn, after.keyRevokedBy, shown(after.keyRevokedAt), after.status],
      [{ turnedIn: true, wipe: true, numbers: [] }, 'TURN_IN', 'Tue 13 Oct 18:10', 'LOST'],
    );
    const uses = await api.securityEvent.findMany({
      where: { deviceId: phone.id, kind: { in: ['MASTER_PASSCODE_USE', 'DEVICE_TURN_IN'] } },
      orderBy: { id: 'asc' },
      select: { kind: true },
    });
    story.check(
      'AC-10-86 each use of the passcode is a security event: its enrolment, the proof beside its key, then the turn-in',
      uses.map(({ kind }) => kind),
      ['MASTER_PASSCODE_USE', 'MASTER_PASSCODE_USE', 'MASTER_PASSCODE_USE', 'DEVICE_TURN_IN'],
    );
    const turnInWrite = await api.auditRecord.findFirstOrThrow({
      where: { tableName: 'device', recordId: phone.id, changedFields: { has: 'key_revoked_by' } },
      orderBy: { id: 'desc' },
      select: { actorId: true },
    });
    story.check(
      'ADR-488 the turn-in is the master passcode’s, on that phone',
      turnInWrite.actorId,
      masterPasscodeActorId,
    );

    story.at(on('14', '09:10'), 'P1-COL-2 tries again');
    story.check(
      'AC-10-86 turned in, it proves nothing, passcode or not',
      [(await story.proofs.proves(phone.id)).answer, await story.underPasscode.proves(phone.id)],
      ['PHONE_NOT_PROVEN', 'PHONE_NOT_PROVEN'],
    );
  },
};
