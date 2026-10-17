// The login list and the master passcode's check a phone takes, against the database
// (ARCHITECTURE §7.1, §7.2, §7.5; spec/acceptance/02-people-and-devices.md AC-02-17, AC-02-39,
// AC-02-41; BACKLOG 2.5.3, C90, C110, C117, C119; ADR-105, 106, 139, 449, 454). Part 4 of the
// task. A check is tried here as a phone would try it, with Node's own Argon2 and nothing of
// the API's. The real process, in this test's own memory, on the installation's database as
// `adms_api`: it needs `pnpm local:up` after `pnpm installer`, and fails saying so. Each test's
// work is undone (support/database.ts).
import {
  changeMasterPasscodeEndpoint,
  createProjectEndpoint,
  monitorCreatedAnswerSchema,
  monitorSignedInAnswerSchema,
  phoneLoginListAnswerSchema,
  phoneLoginListEndpoint,
  setPersonPasswordEndpoint,
  setupShownSchema,
  phoneListsSchema,
  withdrawAssignmentEndpoint,
  writeAssignmentEndpoint,
  archivePersonEndpoint,
  type PhoneLoginListAnswer,
} from '@open-adms/contracts';
import { deviceKeyActorId, type Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installationPolicy } from '../src/policy.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { opens } from './support/offline-check.ts';
import { enrolledPhone, passcode, proven, type TestPhone } from './support/phones.ts';
import { danasEmail, long, worldOn, type Answer, type Served } from './support/served.ts';
import { ask, p1Priced, saved, told, type Browser } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

const sunday = '2026-10-11';
const monday = '2026-10-12';
const tuesday = '2026-10-13';
// 6:30 am on Monday in Bayline County, at the staging area.
const mondayMorning = new Date('2026-10-12T10:30:00Z');

// The firm's practice (ADR-105): each monitor's own phone number without the area code.
const leesPassword = '5550142';
const anasPassword = '5550187';
const josPassword = '5550163';

interface Held {
  masterPasscodeVersion: number | null;
  entries: { monitorId: string; mark: string }[];
}
const nothing: Held = { masterPasscodeVersion: null, entries: [] };

const asked = (served: Served, held: object, bearer?: string, monitorSession?: string) =>
  served.ask('POST', phoneLoginListEndpoint.path, {
    payload: held,
    ...(bearer === undefined ? {} : { bearer }),
    ...(monitorSession === undefined ? {} : { monitorSession }),
  });

async function read(
  served: Served,
  bearer: string,
  session: string,
  held: Held = nothing,
): Promise<PhoneLoginListAnswer> {
  const answer = await asked(served, held, bearer, session);
  expect(told(answer)).toEqual([200, undefined]);
  return phoneLoginListAnswerSchema.parse(answer.body);
}

// What the phone holds once it has taken an answer in.
const holding = (answer: PhoneLoginListAnswer): Held => ({
  masterPasscodeVersion: answer.masterPasscode.version,
  entries: (answer.loginList?.monitors ?? []).map(({ monitorId, mark }) => ({ monitorId, mark })),
});

// P1 as Dana prices it, a phone, and Lee Morgan created on it and signed in, with an assignment
// on P1 for Monday.
async function leeOnP1(served: Served, tx: Tx, phoneName = 'P1-UR-1') {
  served.clock.at = mondayMorning;
  const dana: Browser = await served.signedIn(danasEmail, long);
  const priced = await p1Priced(served, dana, tx);
  const phone = await enrolledPhone(served, tx, phoneName);
  const token = await proven(served, phone);
  const created = async (name: string, password: string, onToken = token) => {
    const made = await served.ask('POST', '/phones/current/monitors', {
      bearer: onToken,
      payload: { name, password, passcode },
    });
    expect(told(made)).toEqual([200, undefined]);
    return monitorCreatedAnswerSchema.parse(made.body);
  };
  const signedIn = async (monitorNumber: string, password: string, onToken = token) => {
    const answer = await served.ask('POST', '/phones/current/sign-ins', {
      bearer: onToken,
      payload: { monitorNumber, password },
    });
    expect(told(answer)).toEqual([200, undefined]);
    return monitorSignedInAnswerSchema.parse(answer.body).token;
  };
  const assigned = async (
    personId: string,
    workDate: string,
    ids: Readonly<Record<string, string>> = priced.ids,
  ) =>
    saved(
      writeAssignmentEndpoint,
      await ask(served, dana, writeAssignmentEndpoint, {
        ids,
        payload: {
          personId,
          workDate,
          fieldEventKinds: ['COLLECTION'],
          certifying: false,
          formDocumentTypes: [],
          siteId: null,
          deviceId: null,
          payItemIds: [],
        },
      }),
    ).record;
  const lee = await created('Lee Morgan', leesPassword);
  const leesDay = await assigned(lee.userId, monday);
  const session = await signedIn(lee.monitorNumber, leesPassword);
  return { dana, priced, phone, token, lee, leesDay, session, created, signedIn, assigned };
}

const named = (answer: PhoneLoginListAnswer) =>
  (answer.loginList?.monitors ?? []).map(({ name }) => name);
const entryOf = (answer: PhoneLoginListAnswer, monitorId: string) =>
  answer.loginList?.monitors.find((one) => one.monitorId === monitorId);
const versionHeld = async (tx: Tx, phone: TestPhone) =>
  (await tx.device.findUniqueOrThrow({ where: { id: phone.id } })).masterPasscodeVersion;

describe('the login list a phone takes', () => {
  it('AC-02-41 Lee Morgan’s phone is sent an entry for Lee and for Ana Brooks, who is on P1 tomorrow: each opens to its own monitor’s password on this phone and to no other; Jo Kim, whose day is on another project, an archived monitor, one whose only day on P1 was yesterday and Kim Nguyen, who has no password yet, are not on it; nothing sent is the password, the hash the server checks or the seed', async () => {
    await world(async (served, tx, who) => {
      const { dana, priced, token, lee, session, created, assigned } = await leeOnP1(served, tx);
      const ana = await created('Ana Brooks', anasPassword);
      await assigned(ana.userId, tuesday);
      // Jo Kim works that Monday on the county's other project, P2, and never on P1.
      const jo = await created('Jo Kim', josPassword);
      const p1 = await tx.project.findUniqueOrThrow({ where: { id: priced.ids.projectId } });
      const p2 = saved(
        createProjectEndpoint,
        await ask(served, dana, createProjectEndpoint, {
          payload: {
            name: 'Bayline County PPDR, Hurricane Delphine',
            clientId: p1.clientId,
            declarationEventId: p1.declarationEventId,
            programTypeId: (await tx.programType.findFirstOrThrow({ where: { name: 'PPDR' } })).id,
            timeZone: p1.timeZone,
            activeFrom: monday,
            activeTo: '2027-01-31',
            ticketNumberSource: 'GENERATED',
            workflows: ['UNIT_RATE'],
            kindOfWorkIds: [],
          },
        }),
      ).record;
      await assigned(jo.userId, monday, { projectId: p2.id });
      const sam = await created('Sam Grant', '5550119');
      await assigned(sam.userId, sunday);
      const pat = await created('Tariq Patel', '5550171');
      await assigned(pat.userId, tuesday);
      expect(
        told(await ask(served, dana, archivePersonEndpoint, { ids: { userId: pat.userId } })),
      ).toEqual([200, undefined]);
      // Kim Nguyen is a monitor with a day on P1 and no password set: no phone could check her.
      await assigned(who.kim, monday);

      const before = await tx.auditRecord.count();
      const answer = await asked(served, nothing, token, session);
      const list = phoneLoginListAnswerSchema.parse(answer.body);
      expect(named(list)).toEqual(['Lee Morgan', 'Ana Brooks']);
      expect(list.noAssignment).toBeNull();
      expect(list.loginList?.more).toBe(false);
      const [lees, anas] = [entryOf(list, lee.userId), entryOf(list, ana.userId)];
      expect([lees?.monitorNumber, anas?.monitorNumber]).toEqual([
        lee.monitorNumber,
        ana.monitorNumber,
      ]);
      // Each entry opens to its own monitor's password, and to nobody else's.
      expect([
        await opens(leesPassword, lees?.check),
        await opens(anasPassword, lees?.check),
        await opens(anasPassword, anas?.check),
        await opens(leesPassword, anas?.check),
        await opens('5550143', lees?.check),
      ]).toEqual([true, false, true, false, false]);
      // Every part of the answer, so that nothing more is sent unnoticed.
      expect(Object.keys(lees ?? {}).sort()).toEqual([
        'check',
        'mark',
        'monitorId',
        'monitorNumber',
        'name',
      ]);
      expect(Object.keys(lees?.check ?? {}).sort()).toEqual(['check', 'first']);
      // Nothing sent is what the server keeps: not the password, the keyed hash or the seed.
      const kept = await tx.userCredential.findMany({
        where: { userId: { in: [lee.userId, ana.userId] } },
      });
      expect(kept).toHaveLength(2);
      for (const { passwordHash, offlineSeed } of kept) {
        expect(passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1,keyid=djI\$/);
        expect(offlineSeed).toMatch(/^v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
        for (const text of [answer.text, served.lines.join('\n')]) {
          expect(text).not.toContain(passwordHash ?? 'none');
          expect(text).not.toContain(offlineSeed ?? 'none');
          expect(text).not.toContain((passwordHash ?? '').split('$').at(-1) ?? 'none');
        }
      }
      for (const password of [leesPassword, anasPassword]) {
        expect(answer.text).not.toContain(password);
      }
      // The log names no monitor and holds no entry.
      const logged = served.lines.join('\n');
      for (const sent of [lees, anas]) {
        expect(logged).not.toContain(sent?.mark ?? 'none');
        expect(logged).not.toContain(sent?.check?.check ?? 'none');
      }
      // The phone holds the passcode's version already, so the read wrote nothing at all:
      // entries are kept nowhere on the server.
      expect(await tx.auditRecord.count()).toBe(before);
    });
  });

  it('AC-02-41 an entry is one phone’s: the same monitor’s entry on another phone has another salt and another mark, and the first hash a phone is told how to make is not the entry', async () => {
    await world(async (served, tx) => {
      const { token, lee, session, signedIn } = await leeOnP1(served, tx);
      const first = entryOf(await read(served, token, session), lee.userId);
      const other = await proven(served, await enrolledPhone(served, tx, 'P1-COL-1'));
      const otherSession = await signedIn(lee.monitorNumber, leesPassword, other);
      const second = entryOf(await read(served, other, otherSession), lee.userId);
      expect(second?.check?.check).not.toBe(first?.check?.check);
      expect(second?.mark).not.toBe(first?.mark);
      // How the first hash is made is the monitor's, the same on every phone; the second is
      // salted for the phone.
      expect(second?.check?.first).toEqual(first?.check?.first);
      const salt = (check: string | undefined) => (check ?? '').split('$').at(-2);
      expect(salt(second?.check?.check)).not.toBe(salt(first?.check?.check));
      expect(salt(first?.check?.check)).not.toBe(first?.check?.first.salt);
      expect([
        await opens(leesPassword, first?.check),
        await opens(leesPassword, second?.check),
      ]).toEqual([true, true]);
      // Asked again holding nothing, the same phone is made another: none is kept to send.
      const again = entryOf(await read(served, token, session), lee.userId);
      expect(again?.mark).toBe(first?.mark);
      expect(again?.check?.check).not.toBe(first?.check?.check);
    });
  });

  it('a phone says what it holds and is made only what it lacks: nothing when it holds every entry; Ana’s alone once Dana sets her password anew, and it opens to the new password and not the old; a mark that was never the server’s is made again; a monitor whose day is withdrawn is named no more', async () => {
    await world(async (served, tx) => {
      const { dana, token, lee, session, created, assigned } = await leeOnP1(served, tx);
      const ana = await created('Ana Brooks', anasPassword);
      const anasDay = await assigned(ana.userId, tuesday);
      const first = await read(served, token, session);
      const held = holding(first);
      const second = await read(served, token, session, held);
      expect(named(second)).toEqual(['Lee Morgan', 'Ana Brooks']);
      expect(second.loginList?.monitors.map(({ check }) => check)).toEqual([null, null]);
      expect(second.masterPasscode.check).toBeNull();
      expect(second.loginList?.monitors.map(({ mark }) => mark)).toEqual(
        first.loginList?.monitors.map(({ mark }) => mark),
      );

      const anew = '5550199';
      saved(
        setPersonPasswordEndpoint,
        await ask(served, dana, setPersonPasswordEndpoint, {
          ids: { userId: ana.userId },
          payload: { password: anew },
        }),
      );
      const third = await read(served, token, session, held);
      expect(entryOf(third, lee.userId)?.check).toBeNull();
      const anas = entryOf(third, ana.userId);
      expect(anas?.mark).not.toBe(entryOf(first, ana.userId)?.mark);
      expect([await opens(anew, anas?.check), await opens(anasPassword, anas?.check)]).toEqual([
        true,
        false,
      ]);

      // A mark the server never made: the entry is made again.
      const forged = await read(served, token, session, {
        ...held,
        entries: [{ monitorId: lee.userId, mark: 'never-the-servers' }],
      });
      expect(await opens(leesPassword, entryOf(forged, lee.userId)?.check)).toBe(true);

      saved(
        withdrawAssignmentEndpoint,
        await ask(served, dana, withdrawAssignmentEndpoint, { ids: { assignmentId: anasDay.id } }),
      );
      expect(named(await read(served, token, session, holding(third)))).toEqual(['Lee Morgan']);
    });
  });

  it('one call makes so many entries and no more (LOGIN_LIST_ENTRIES_PER_CALL): with one a call, the first makes Lee’s and says there are more, and the second, told what the phone now holds, makes Ana’s and says there are none', async () => {
    await world(
      async (served, tx) => {
        const { token, lee, session, created, assigned } = await leeOnP1(served, tx);
        const ana = await created('Ana Brooks', anasPassword);
        await assigned(ana.userId, monday);
        const first = await read(served, token, session);
        expect(first.loginList?.more).toBe(true);
        expect(named(first)).toEqual(['Lee Morgan', 'Ana Brooks']);
        expect(await opens(leesPassword, entryOf(first, lee.userId)?.check)).toBe(true);
        expect(entryOf(first, ana.userId)?.check).toBeNull();
        // The phone holds what it was made, and says so.
        const second = await read(served, token, session, {
          masterPasscodeVersion: first.masterPasscode.version,
          entries: [{ monitorId: lee.userId, mark: entryOf(first, lee.userId)?.mark ?? '' }],
        });
        expect(second.loginList?.more).toBe(false);
        expect(entryOf(second, lee.userId)?.check).toBeNull();
        expect(await opens(anasPassword, entryOf(second, ana.userId)?.check)).toBe(true);
      },
      undefined,
      installationPolicy({ LOGIN_LIST_ENTRIES_PER_CALL: '1' }),
    );
  });

  it('a monitor with no offline seed is left off the list, and is on it from their next sign-in online, which keeps one', async () => {
    await world(async (served, tx) => {
      const { token, lee, session, signedIn } = await leeOnP1(served, tx);
      // As a monitor created before seeds were kept.
      await tx.userCredential.update({
        where: { userId: lee.userId },
        data: { offlineSeed: null },
      });
      expect(named(await read(served, token, session))).toEqual([]);
      const again = await signedIn(lee.monitorNumber, leesPassword);
      const list = await read(served, token, again);
      expect(named(list)).toEqual(['Lee Morgan']);
      expect(await opens(leesPassword, entryOf(list, lee.userId)?.check)).toBe(true);
      // A sign-in with a seed in good standing makes no other: the phone's entry stays good.
      const kept = await tx.userCredential.findUniqueOrThrow({ where: { userId: lee.userId } });
      const third = await signedIn(lee.monitorNumber, leesPassword);
      expect(
        (await tx.userCredential.findUniqueOrThrow({ where: { userId: lee.userId } })).offlineSeed,
      ).toBe(kept.offlineSeed);
      expect(
        entryOf(await read(served, token, third, holding(list)), lee.userId)?.check,
      ).toBeNull();
    });
  });
});

describe('the master passcode’s check a phone takes', () => {
  it('AC-02-17 a phone that holds no check is sent the one in force, which opens to the passcode and to nothing else; once Dana changes the passcode the phone is sent the new version’s, and the version its record holds moves then, written as the device key’s actor on that phone; a phone that holds it is sent nothing and nothing is written', async () => {
    await world(async (served, tx, who) => {
      const { dana, phone, token, session } = await leeOnP1(served, tx);
      const enrolledUnder = phone.masterPasscodeVersion;
      const first = await read(served, token, session);
      expect(first.masterPasscode.version).toBe(enrolledUnder);
      expect([
        await opens(passcode, first.masterPasscode.check),
        await opens('osprey-landing-march', first.masterPasscode.check),
      ]).toEqual([true, false]);
      // Not the server's own hash: a check of this phone's, made from it.
      const inForce = await tx.masterPasscode.findUniqueOrThrow({
        where: { version: enrolledUnder },
      });
      expect(first.masterPasscode.check?.check).not.toBe(inForce.hash);
      expect(JSON.stringify(first)).not.toContain(inForce.hash.split('$').at(-1) ?? 'none');
      expect(await versionHeld(tx, phone)).toBe(enrolledUnder);

      const changedTo = 'cordgrass-jetty-heron';
      saved(
        changeMasterPasscodeEndpoint,
        await ask(served, dana, changeMasterPasscodeEndpoint, {
          payload: { currentPassword: long, passcode: changedTo },
        }),
      );
      // Until the phone asks, its record holds the version it was enrolled under.
      expect(await versionHeld(tx, phone)).toBe(enrolledUnder);
      const answer = await asked(served, holding(first), token, session);
      const second = phoneLoginListAnswerSchema.parse(answer.body);
      expect(second.masterPasscode.version).toBe(enrolledUnder + 1);
      expect([
        await opens(changedTo, second.masterPasscode.check),
        await opens(passcode, second.masterPasscode.check),
      ]).toEqual([true, false]);
      expect(await versionHeld(tx, phone)).toBe(enrolledUnder + 1);
      const audited = await tx.auditRecord.findMany({ where: { requestId: answer.requestId } });
      expect(
        audited.map(({ tableName, operation, actorId, deviceId, source, changedFields }) => [
          tableName,
          operation,
          actorId,
          deviceId,
          source,
          changedFields,
        ]),
      ).toEqual([
        ['device', 'UPDATE', deviceKeyActorId, phone.id, 'DEVICE', ['master_passcode_version']],
      ]);
      expect(audited.map(({ actorId }) => actorId)).not.toContain(who.dana);

      const before = await tx.auditRecord.count();
      const third = await read(served, token, session, holding(second));
      expect(third.masterPasscode).toEqual({ version: enrolledUnder + 1, check: null });
      expect(await tx.auditRecord.count()).toBe(before);
    });
  });

  it('a phone that takes no assignment is sent the passcode’s check and no login list, and is told why; it keeps what it holds', async () => {
    await world(async (served, tx) => {
      const { dana, token, leesDay, session } = await leeOnP1(served, tx);
      saved(
        withdrawAssignmentEndpoint,
        await ask(served, dana, withdrawAssignmentEndpoint, { ids: { assignmentId: leesDay.id } }),
      );
      const answer = await read(served, token, session);
      expect([answer.noAssignment, answer.loginList]).toEqual(['NONE_THAT_DAY', null]);
      expect(await opens(passcode, answer.masterPasscode.check)).toBe(true);
    });
  });
});

describe('who may ask, and what no list holds', () => {
  it('AC-02-39 the login list is a signed-in monitor’s on a proven phone, nobody else’s: not a phone with nobody signed in, not a session with no proven phone, not another phone with that session, not the back office; and what a phone says it holds is read strictly', async () => {
    await world(async (served, tx) => {
      const { dana, token, session } = await leeOnP1(served, tx);
      const ok = (answer: Answer) => told(answer);
      expect(ok(await asked(served, nothing, token, session))).toEqual([200, undefined]);
      expect(ok(await asked(served, nothing, token))).toEqual([401, 'NOT_SIGNED_IN']);
      expect(ok(await asked(served, nothing, undefined, session))).toEqual([
        401,
        'PHONE_NOT_PROVEN',
      ]);
      const other = await proven(served, await enrolledPhone(served, tx, 'P1-COL-1'));
      expect(ok(await asked(served, nothing, other, session))).toEqual([401, 'NOT_SIGNED_IN']);
      const asDana = await served.ask('POST', phoneLoginListEndpoint.path, {
        ...dana,
        payload: nothing,
      });
      expect(ok(asDana)).toEqual([401, 'PHONE_NOT_PROVEN']);
      for (const body of [
        {},
        { masterPasscodeVersion: 0, entries: [] },
        { masterPasscodeVersion: null, entries: [{ monitorId: 'lee', mark: 'a' }] },
        { ...nothing, monitorNumber: 'M004127' },
      ]) {
        expect((await asked(served, body, token, session)).status, JSON.stringify(body)).toBe(400);
      }
    });
  });

  it('AC-02-37 a login list and the passcode’s check are no part of a phone’s other lists or of a setup version (ADR-453)', () => {
    for (const schema of [phoneListsSchema, setupShownSchema]) {
      expect(
        Object.keys(schema.shape).filter((key) =>
          /login|monitor|passcode|password|mark/i.test(key),
        ),
      ).toEqual([]);
    }
  });
});
