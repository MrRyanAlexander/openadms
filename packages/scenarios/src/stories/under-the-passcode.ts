// One phone's Monday under the firm's master passcode (BACKLOG 2.5.4; ARCHITECTURE §7's notes,
// §7.1, §7.3, §7.5; spec/acceptance/02-people-and-devices.md AC-02-23, 38, 42, 46, 47;
// ADR-106, 456…458, 462…464; REQ-202b, 209). Tariq Patel has no assignment, so a supervisor
// sets P1-TWR-LF up with a connection (what they pick from is read under the passcode), signs
// in as its monitor, and through a day with no signal moves it to another site, types the
// passcode wrong once, passes it to Sam Grant (whom Luis planned) and opens the temporary
// session for Tariq. When the phone finds signal it reports what it logged. What it proves:
// every use of the passcode is a security event, the server's own at the server's time and the
// phone's at the phone's time with its offset, each written as "Master passcode" on that phone;
// a wrong try on the phone moves no count on the server; and nothing is kept twice.
import { masterPasscodeActorId } from '@open-adms/db';

import { projectTime } from '../clock.ts';
import type { Story } from '../runner.ts';
import { assigned, loggedUse, unplanned } from './board.ts';
import { p1TimeZone as timeZone, setUpP1, setUpP1Sites } from './p1.ts';
import { uuidv7 } from '../ids.ts';

const at = (time: string): string => `2026-10-12T${time}:00-04:00`;
const when = (time: string): Date => new Date(at(time));
const monday = new Date('2026-10-12');

export const underThePasscode: Story = {
  name: 'under-the-passcode',
  title:
    'one phone’s day under the master passcode: a setup, a session, a move, a wrong try, a switch and a temporary session, each a security event',
  timeZone,
  start: at('05:30'),

  async run(story) {
    const { api, clock } = story;

    story.at(
      at('05:30'),
      'Dana Reyes sets up Luis Ortega, P1 and its two sites; P1-TWR-LF is enrolled; Tariq Patel and Sam Grant are created on it; Luis plans Sam’s Monday at Marsh Road TDSR',
    );
    const dana = uuidv7(clock.now());
    const office = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
      const luis = await tx.user.create({ data: { name: 'Luis Ortega', role: 'MANAGER_ANALYST' } });
      await tx.userPermission.create({ data: { userId: luis.id, permission: 'DISPATCH' } });
      const p1 = await setUpP1(tx, story.policy);
      const sites = await setUpP1Sites(tx, p1.project);
      return { luis: luis.id, p1: p1.project, ...sites };
    });
    const phone = await story.enrolled('P1-TWR-LF');
    const tariq = await story.monitor('Tariq Patel', phone.id);
    const sam = await story.monitor('Sam Grant', phone.id);
    const samsPlan = await assigned(api, clock, office.luis, {
      workDate: '2026-10-12',
      projectId: office.p1,
      personId: sam.id,
      fieldEventKinds: ['DISPOSAL'],
      siteId: office.tdsr,
    });
    const names = new Map([
      [tariq.id, tariq.name],
      [sam.id, sam.name],
    ]);

    story.at(
      at('06:38'),
      'Tariq has no assignment. With a connection, a supervisor types the master passcode on P1-TWR-LF: the phone reads what a setup picks from',
    );
    const first = await story.underPasscode.choices(phone.id, null);
    story.at(at('06:39'), 'P1 is picked: the phone reads its sites');
    const picked = await story.underPasscode.choices(phone.id, office.p1);
    story.check(
      'AC-02-38 read only with the passcode sent: the open projects and the monitors in service by name, then the picked project’s sites',
      [
        first.projects.map(({ name }) => name),
        first.monitors.map(({ name }) => name),
        first.project,
        picked.project?.sites.map(({ name }) => name).sort(),
      ],
      [
        ['Bayline County ROW, Hurricane Delphine'],
        ['Tariq Patel', 'Sam Grant'],
        null,
        ['Bayline County Landfill', 'Marsh Road TDSR'],
      ],
    );

    story.at(at('06:40'), 'The phone is set up for Tariq at the Landfill’s tower, and reports it');
    const atTheLandfill = await unplanned(api, clock, phone.id, timeZone, {
      projectId: office.p1,
      personId: tariq.id,
      fieldEventKinds: ['DISPOSAL', 'HAUL_OUT_DISPOSAL'],
      siteId: office.landfill,
    });

    story.at(
      at('06:45'),
      'Tariq can’t recall his password: the supervisor signs in as the phone’s monitor with the master passcode',
    );
    const asTariq = await story.underPasscode.session(tariq, phone.id, 'AS_MONITOR');
    const marked = await api.session.findUniqueOrThrow({ where: { id: asTariq.sessionId } });
    story.check(
      'AC-02-42 the session is Tariq’s on P1-TWR-LF, marked as opened under the master passcode, and lasts a monitor’s own twelve hours',
      [
        names.get(marked.userId),
        marked.deviceId === phone.id,
        marked.masterPasscodeSession,
        projectTime(timeZone, marked.expiresAt),
        marked.revokedAt,
      ],
      ['Tariq Patel', true, 'AS_MONITOR', 'Mon 12 Oct 18:45', null],
    );

    story.at(
      at('16:10'),
      'No signal since the yard. At 10:15 the phone was moved to Marsh Road TDSR; at 12:58 the passcode was typed wrong; at 13:00 the phone passed to Sam, who signed in with his own password; at 15:30 the temporary session was opened for Tariq. The phone finds signal, proves itself and reports each',
    );
    const { challenge } = story.proofs.challenge(phone.id);
    const proof = await story.proofs.prove(phone.id, challenge, phone.key.signed(challenge));
    const atTheTdsr = await unplanned(
      api,
      clock,
      phone.id,
      timeZone,
      {
        projectId: office.p1,
        personId: tariq.id,
        fieldEventKinds: ['DISPOSAL', 'HAUL_OUT_COLLECTION'],
        siteId: office.tdsr,
      },
      when('10:15'),
    );
    const logged = [
      { use: 'WRONG_TRY', personId: null, loggedAt: when('12:58') },
      { use: 'MONITOR_SWITCH', personId: sam.id, loggedAt: when('13:00') },
      { use: 'TEMPORARY_SESSION', personId: tariq.id, loggedAt: when('15:30') },
    ] as const;
    const reports: { id: string; answer: string }[] = [];
    for (const one of logged) reports.push(await loggedUse(api, clock, phone.id, timeZone, one));
    story.check(
      'AC-02-23 the phone proved itself with its device key, and each use it logged is saved: no passcode is sent, and nobody need be signed in',
      [proof.proven, ...reports.map(({ answer }) => answer)],
      [true, 'SAVED', 'SAVED', 'SAVED'],
    );

    const order = [
      'DEVICE_SETUP',
      'DEVICE_SWITCH',
      'MASTER_PASSCODE_USE',
      'MASTER_PASSCODE_FAILED',
    ];
    const securityLog = async () =>
      (
        await api.securityEvent.findMany({
          where: { deviceId: phone.id, occurredAt: { gte: when('06:38') } },
        })
      )
        .sort(
          (a, b) =>
            a.occurredAt.getTime() - b.occurredAt.getTime() ||
            order.indexOf(a.kind) - order.indexOf(b.kind),
        )
        .map((event) => [
          projectTime(timeZone, event.occurredAt).slice(-5),
          event.kind,
          event.userId === null ? 'nobody' : (names.get(event.userId) ?? event.userId),
          event.deviceUtcOffsetMinutes === null ? 'the server saw it' : 'the phone reported it',
          event.deviceUtcOffsetMinutes,
          event.masterPasscodeSession,
        ]);
    const seen = 'the server saw it';
    const told = 'the phone reported it';
    const day = [
      ['06:38', 'MASTER_PASSCODE_USE', 'nobody', seen, null, null],
      ['06:39', 'MASTER_PASSCODE_USE', 'nobody', seen, null, null],
      ['06:40', 'DEVICE_SETUP', 'Tariq Patel', told, -240, null],
      ['06:40', 'MASTER_PASSCODE_USE', 'Tariq Patel', told, -240, null],
      ['06:45', 'MASTER_PASSCODE_USE', 'Tariq Patel', seen, null, null],
      ['10:15', 'DEVICE_SETUP', 'Tariq Patel', told, -240, null],
      ['10:15', 'MASTER_PASSCODE_USE', 'Tariq Patel', told, -240, null],
      ['12:58', 'MASTER_PASSCODE_FAILED', 'nobody', told, -240, null],
      ['13:00', 'DEVICE_SWITCH', 'Sam Grant', told, -240, null],
      ['13:00', 'MASTER_PASSCODE_USE', 'Sam Grant', told, -240, null],
      ['15:30', 'MASTER_PASSCODE_USE', 'Tariq Patel', told, -240, 'TEMPORARY'],
    ];
    story.check(
      'REQ-202b the phone’s day in the security log, each use of the master passcode an event: the reads and the session the server saw at its own time, and what the phone logged at the phone’s time with its clock’s offset; a wrong try names nobody; the temporary session says it was one',
      await securityLog(),
      day,
    );

    const reported = await api.securityEvent.findMany({
      where: { deviceId: phone.id, deviceUtcOffsetMinutes: { not: null } },
      select: { id: true, createdAt: true, occurredAt: true },
    });
    const written = await api.auditRecord.findMany({
      where: { tableName: 'security_event', recordId: { in: reported.map(({ id }) => id) } },
      select: { actorId: true, source: true, deviceId: true },
    });
    story.check(
      'REQ-209 each of the eight events the phone reported was written as "Master passcode" on P1-TWR-LF, never as Tariq, Sam or a supervisor; the first event of a use carries the id the phone gave it',
      [
        written.length,
        [...new Set(written.map((record) => JSON.stringify(Object.values(record))))],
        reports.every(({ id }) => reported.some((event) => event.id === id)),
      ],
      [8, [JSON.stringify([masterPasscodeActorId, 'DEVICE', phone.id])], true],
    );

    const tries = await api.masterPasscodeTries.count();
    const locks = await api.securityEvent.count({ where: { kind: 'MASTER_PASSCODE_LOCKOUT' } });
    const ended = await api.session.findUniqueOrThrow({ where: { id: asTariq.sessionId } });
    story.check(
      'ADR-456 (5)(e), ADR-462 the wrong try on the phone moved no count on the server and locked nothing; the switch to Sam at 13:00, once reported, ended the session opened for Tariq at 06:45',
      [tries, locks, ended.revokedAt === null ? null : projectTime(timeZone, ended.revokedAt)],
      [0, 0, 'Mon 12 Oct 16:10'],
    );

    const board = await api.assignment.findMany({
      where: { workDate: monday, projectId: office.p1 },
      include: { person: true, site: true, madeBy: true },
    });
    story.check(
      'AC-02-46, 47 Monday’s board: Sam’s as Luis planned it, untouched by the switch (no assignment was made for him); Tariq’s two made on the phone, the Landfill at 06:40 and Marsh Road TDSR at 10:15, each unplanned with no author',
      board
        .map((assignment) => [
          assignment.person.name,
          assignment.site?.name ?? 'no site',
          assignment.origin,
          assignment.madeBy?.name ?? null,
          assignment.madeAt === null ? null : projectTime(timeZone, assignment.madeAt).slice(-5),
        ])
        .sort(),
      [
        ['Sam Grant', 'Marsh Road TDSR', 'PLANNED', 'Luis Ortega', null],
        ['Tariq Patel', 'Bayline County Landfill', 'UNPLANNED', null, '06:40'],
        ['Tariq Patel', 'Marsh Road TDSR', 'UNPLANNED', null, '10:15'],
      ],
    );

    story.at(at('16:12'), 'With signal, each signs in on P1-TWR-LF with his own password');
    const samTook = await story.signedIn(sam, phone.id);
    const tariqTook = await story.signedIn(tariq, phone.id);
    story.check(
      'Sam’s sign-in takes the assignment Luis planned; Tariq’s takes the one made on the phone last, at Marsh Road TDSR',
      [
        samTook.taken ? samTook.assignment.id === samsPlan : samTook.why,
        tariqTook.taken ? tariqTook.assignment.id === atTheTdsr : tariqTook.why,
        atTheLandfill === atTheTdsr,
      ],
      [true, true, false],
    );

    story.at(at('16:20'), 'The phone lost its answers and reports the three again');
    const again: string[] = [];
    for (const [nth, one] of logged.entries()) {
      const id = reports[nth]?.id;
      if (id === undefined) throw new Error('A report has no id.');
      again.push((await loggedUse(api, clock, phone.id, timeZone, { ...one, id })).answer);
    }
    const afterwards = (await securityLog()).filter(([time]) => time !== '16:12');
    story.check(
      'AC-05-40 each is already saved and nothing is written twice: the day’s log is as it stood',
      [again, JSON.stringify(afterwards) === JSON.stringify(day)],
      [['ALREADY_SAVED', 'ALREADY_SAVED', 'ALREADY_SAVED'], true],
    );
  },
};
