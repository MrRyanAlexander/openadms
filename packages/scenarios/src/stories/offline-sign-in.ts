// Ana signs in on P1-COL-1 with no signal (BACKLOG 3.2.4, C143, C151; ARCHITECTURE §7.2;
// spec/acceptance/02-people-and-devices.md AC-02-39, 41, 11-field-app.md AC-11-19, 21; ADR-449,
// 454, 531, 575). At the yard she signs in online and her phone reads its login list: an entry for
// her and for Kim Nguyen, each a slow hash made for that phone, and the master passcode's check.
// On Elm Street the phone has restarted and there is no signal: she types her password wrong,
// then right, and the phone checks each against her entry itself. At 12:05 it finds signal and
// reports that sign-in before anything else; the server checks its proof against what it keeps
// and opens her session from 07:00. What it proves: the phone holds the least that lets it check
// (made only what it lacks), a wrong try on the phone moves no count on the server, the sign-in
// made offline is the server's to take, never the phone's word, and taken once.
import { uuidv7 } from '@open-adms/domain';

import { projectTime } from '../clock.ts';
import type { Story } from '../runner.ts';
import { assigned } from './board.ts';
import { p1TimeZone as timeZone, setUpP1, setUpP1Sites } from './p1.ts';

const at = (time: string): string => `2026-10-12T${time}:00-04:00`;

export const offlineSignIn: Story = {
  name: 'offline-sign-in',
  title:
    'Ana signs in on P1-COL-1 with no signal from its login list; at signal the sign-in is reported, proven and taken once',
  timeZone,
  start: at('05:30'),

  async run(story) {
    const { api, clock } = story;

    story.at(
      at('05:30'),
      'Dana Reyes sets up Luis Ortega, P1 and its two sites; P1-COL-1 is enrolled; Ana Brooks and Kim Nguyen are created on it; Luis plans Ana’s collections and Kim’s tower for Monday',
    );
    const dana = uuidv7(clock.now());
    const office = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
      const luis = await tx.user.create({ data: { name: 'Luis Ortega', role: 'MANAGER_ANALYST' } });
      await tx.userPermission.create({ data: { userId: luis.id, permission: 'DISPATCH' } });
      await tx.userPermission.create({ data: { userId: luis.id, permission: 'VIEW_DISPATCH' } });
      const p1 = await setUpP1(tx, story.policy);
      const sites = await setUpP1Sites(tx, p1.project);
      return { luis: luis.id, p1: p1.project, ...sites };
    });
    const phone = await story.enrolled('P1-COL-1');
    const ana = await story.monitor('Ana Brooks', phone.id);
    const kim = await story.monitor('Kim Nguyen', phone.id);
    const anasPlan = await assigned(api, clock, office.luis, {
      workDate: '2026-10-12',
      projectId: office.p1,
      personId: ana.id,
      fieldEventKinds: ['COLLECTION'],
    });
    await assigned(api, clock, office.luis, {
      workDate: '2026-10-12',
      projectId: office.p1,
      personId: kim.id,
      fieldEventKinds: ['DISPOSAL'],
      siteId: office.tdsr,
    });
    const names = new Map([
      [ana.id, ana.name],
      [kim.id, kim.name],
    ]);

    story.at(
      at('06:30'),
      'At the yard Ana signs in online; P1-COL-1 reads her lists and its login list, then reads the login list again',
    );
    const took = await story.signedIn(ana, phone.id);
    await story.lists.held({ assignmentId: anasPlan, deviceId: phone.id });
    const [first, ...more] = await story.offline.loginList(phone.id);
    const [again] = await story.offline.loginList(phone.id);
    story.check(
      'AC-02-41 the login list is Ana and Kim, each with an entry made for this phone, and the master passcode’s check; read again, the phone says what it holds and is made nothing',
      [
        took.taken ? took.assignment.id === anasPlan : took.why,
        more.length,
        first?.loginList?.monitors.map(({ monitorId, check }) => [
          names.get(monitorId),
          check === null ? 'none' : 'an entry',
        ]),
        first?.masterPasscode.check === null ? 'none' : 'the passcode’s check',
        again?.loginList?.monitors.map(({ check }) => check),
        again?.masterPasscode.check,
      ],
      [
        true,
        0,
        [
          ['Ana Brooks', 'an entry'],
          ['Kim Nguyen', 'an entry'],
        ],
        'the passcode’s check',
        [null, null],
        null,
      ],
    );

    story.at(
      at('07:00'),
      'On Elm Street, no signal: P1-COL-1 has restarted, and Ana types her password wrong, then right; the phone checks each against her entry',
    );
    const wrong = story.offline.signIn(ana, phone.id, 'not-her-password');
    const right = story.offline.signIn(ana, phone.id);
    const kimsOnAnas = story.offline.signIn(kim, phone.id, ana.password);
    story.check(
      'AC-11-19 the wrong password opens nothing, hers opens her entry, and her password opens nobody else’s',
      [wrong, right, kimsOnAnas],
      [false, true, false],
    );

    story.at(
      at('12:05'),
      'Signal on Oak Avenue: P1-COL-1 reports Ana’s sign-in from 07:00 before anything else of hers',
    );
    const reported = await story.offline.reported(phone.id);
    const sessions = await api.session.findMany({
      where: { deviceId: phone.id },
      orderBy: { createdAt: 'asc' },
    });
    story.check(
      'AC-11-21, ADR-531 taken: a session for Ana on P1-COL-1 from the phone’s 07:00, lasting the firm’s hours, a day as shipped; her 06:30 session ended as it was taken',
      [
        reported,
        sessions.map((session) => [
          names.get(session.userId),
          session.offlineSignInId === null ? 'online' : 'offline',
          session.signedInAt === null ? null : projectTime(timeZone, session.signedInAt),
          projectTime(timeZone, session.expiresAt),
          session.revokedAt === null ? null : projectTime(timeZone, session.revokedAt),
        ]),
      ],
      [
        'TAKEN',
        [
          ['Ana Brooks', 'online', null, 'Tue 13 Oct 06:30', 'Mon 12 Oct 12:05'],
          ['Ana Brooks', 'offline', 'Mon 12 Oct 07:00', 'Tue 13 Oct 07:00', null],
        ],
      ],
    );
    const lists = await story.lists.held({ assignmentId: anasPlan, deviceId: phone.id });
    story.check('the session it was given reads her lists', lists.setupVersion > 0, true);

    story.at(at('12:10'), 'The phone lost its answer and reports the same sign-in again');
    const twice = await story.offline.reported(phone.id, true);
    const events = await api.securityEvent.findMany({
      where: { deviceId: phone.id, kind: { in: ['OFFLINE_SIGN_IN', 'OFFLINE_SIGN_IN_REFUSED'] } },
      orderBy: { createdAt: 'asc' },
    });
    const tries = await api.userCredential.findUniqueOrThrow({
      where: { userId: ana.id },
      select: { failedSignIns: true },
    });
    story.check(
      'ADR-531 (4) a sign-in made offline is taken once: again, it is refused by the one code and the back office is shown it; the wrong try typed on the phone moved no count on the server',
      [
        twice,
        events.map((event) => [event.kind, names.get(event.userId ?? '') ?? 'nobody']),
        tries.failedSignIns,
      ],
      [
        'SIGN_IN_REFUSED',
        [
          ['OFFLINE_SIGN_IN', 'Ana Brooks'],
          ['OFFLINE_SIGN_IN_REFUSED', 'Ana Brooks'],
        ],
        0,
      ],
    );
  },
};
