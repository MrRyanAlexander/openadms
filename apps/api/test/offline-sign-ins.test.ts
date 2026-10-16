// A sign-in made on a phone with no connection, taken once it has one, and what a phone sends
// only with somebody signed in on it (ARCHITECTURE §6, Device sessions; §7.2, §7.3; ADR-105,
// 454, 462, 531; the user, 2026-10-15). The proof is made here as a phone makes it, with Node's
// own Argon2 and HMAC and the domain's words alone, nothing of the API's. The real process, in
// this test's own memory, on the installation's database as `adms_api`: it needs `pnpm local:up`
// after `pnpm installer`, and fails saying so. Each test's work is undone (support/database.ts).
import { createHmac, randomUUID } from 'node:crypto';

import {
  monitorCreatedAnswerSchema,
  monitorSignedInAnswerSchema,
  offlineSignInTakenAnswerSchema,
  phoneLoginListAnswerSchema,
  phoneLoginListEndpoint,
  removePhoneEndpoint,
  syncAnsweredSchema,
  takeOfflineSignInOnPhoneEndpoint,
  writeAssignmentEndpoint,
  type OfflineCheckRecord,
} from '@open-adms/contracts';
import { masterPasscodeActorId, type Database } from '@open-adms/db';
import { OfflineSignInRules, type OfflineSignInKind } from '@open-adms/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { firstHashOf } from './support/offline-check.ts';
import { enrolledPhone, passcode, proven, provenWithPasscode } from './support/phones.ts';
import { danasEmail, long, worldOn, type Answer, type Served } from './support/served.ts';
import { ask, p1Priced, saved, told } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

const monday = '2026-10-12';
// 6:30 am on Monday in Bayline County.
const mondayMorning = new Date('2026-10-12T10:30:00Z');
const hour = 3_600_000;
const leesPassword = '5550142';
const refused = [401, 'SIGN_IN_REFUSED'];
const offlineSignIns = new OfflineSignInRules();

// P1 as Dana prices it, a phone, and Lee Morgan created on it, assigned to P1 for Monday and
// signed in online at 6:30, so the phone holds his entry and the passcode's check (ADR-454).
async function leeOnP1(served: Served, tx: Tx) {
  served.clock.at = mondayMorning;
  const dana = await served.signedIn(danasEmail, long);
  const priced = await p1Priced(served, dana, tx);
  const phone = await enrolledPhone(served, tx, 'P1-COL-1');
  const token = await proven(served, phone);
  const made = await served.ask('POST', '/phones/current/monitors', {
    bearer: token,
    payload: { name: 'Lee Morgan', password: leesPassword, passcode },
  });
  expect(told(made)).toEqual([200, undefined]);
  const lee = monitorCreatedAnswerSchema.parse(made.body);
  saved(
    writeAssignmentEndpoint,
    await ask(served, dana, writeAssignmentEndpoint, {
      ids: priced.ids,
      payload: {
        personId: lee.userId,
        workDate: monday,
        fieldEventKinds: ['COLLECTION'],
        certifying: false,
        formDocumentTypes: [],
        siteId: null,
        deviceId: null,
        payItemIds: [],
      },
    }),
  );
  const signedIn = await served.ask('POST', '/phones/current/sign-ins', {
    bearer: token,
    payload: { monitorNumber: lee.monitorNumber, password: leesPassword },
  });
  expect(told(signedIn)).toEqual([200, undefined]);
  const session = monitorSignedInAnswerSchema.parse(signedIn.body).token;
  const listed = await served.ask('POST', phoneLoginListEndpoint.path, {
    bearer: token,
    monitorSession: session,
    payload: { masterPasscodeVersion: null, entries: [] },
  });
  expect(told(listed)).toEqual([200, undefined]);
  const list = phoneLoginListAnswerSchema.parse(listed.body);
  const entry = list.loginList?.monitors.find(({ monitorId }) => monitorId === lee.userId);
  return {
    dana,
    priced,
    phone,
    token,
    lee,
    session,
    leesCheck: entry?.check ?? null,
    passcodeCheck: list.masterPasscode,
  };
}

// A sign-in the phone made offline, as it reports it: its proof made from what was typed.
async function madeOffline(
  phone: { id: string },
  said: {
    kind: OfflineSignInKind;
    personId: string;
    signedInAt: Date;
    typed: string;
    check: OfflineCheckRecord | null;
    masterPasscodeVersion?: number;
    id?: string;
  },
) {
  const id = said.id ?? randomUUID();
  const masterPasscodeVersion = said.masterPasscodeVersion ?? null;
  const first = await firstHashOf(said.typed, said.check);
  const signed = offlineSignIns.signed({
    deviceId: phone.id,
    id,
    kind: said.kind,
    personId: said.personId,
    signedInAt: said.signedInAt,
    masterPasscodeVersion,
  });
  return {
    id,
    kind: said.kind,
    personId: said.personId,
    signedInAt: said.signedInAt.toISOString(),
    deviceUtcOffsetMinutes: -240,
    masterPasscodeVersion,
    proof: createHmac('sha256', first).update(signed).digest('base64url'),
  };
}

const reported = (served: Served, bearer: string, report: object): Promise<Answer> =>
  served.ask('POST', takeOfflineSignInOnPhoneEndpoint.path, { bearer, payload: report });

// An empty sync, by the phone's token, with or without a monitor's session beside it.
const synced = (served: Served, bearer: string, monitorSession?: string): Promise<Answer> =>
  served.ask('POST', '/phones/current/syncs', {
    bearer,
    ...(monitorSession === undefined ? {} : { monitorSession }),
    payload: {
      clockAt: served.clock.now().toISOString(),
      deviceUtcOffsetMinutes: -240,
      unplannedAssignments: [],
      passcodeUses: [],
      records: [],
      photos: [],
      lastUsed: [],
      holds: { masterPasscodeVersion: null, listsProjectId: null },
    },
  });

const eventsOf = async (
  tx: Tx,
  deviceId: string,
  kind: 'OFFLINE_SIGN_IN' | 'OFFLINE_SIGN_IN_REFUSED',
) => tx.securityEvent.count({ where: { deviceId, kind } });

describe('what a phone sends needs somebody signed in on it (ADR-531)', () => {
  it('a phone with nobody signed in sends nothing: its sync is refused and writes nothing; the monitor’s session, or the passcode beside its proof, lets it', async () => {
    await world(async (served, tx) => {
      const p = await leeOnP1(served, tx);
      // Lee signs out: nobody is signed in on the phone.
      const out = await served.ask('POST', '/phones/current/sign-outs', {
        bearer: p.token,
        monitorSession: p.session,
      });
      expect(told(out)).toEqual([200, undefined]);
      const before = await tx.sync.count({ where: { deviceId: p.phone.id } });
      expect(told(await synced(served, p.token))).toEqual([401, 'NOT_SIGNED_IN']);
      expect(told(await synced(served, p.token, p.session))).toEqual([401, 'NOT_SIGNED_IN']);
      expect(await tx.sync.count({ where: { deviceId: p.phone.id } })).toBe(before);
      // The master user at the phone: the passcode beside its proof, a moment later.
      served.clock.at = new Date(served.clock.now().getTime() + 1000);
      const master = await provenWithPasscode(served, p.phone);
      expect(told(await synced(served, master))).toEqual([200, undefined]);
      expect(await tx.sync.count({ where: { deviceId: p.phone.id } })).toBe(before + 1);
    });
  });
});

describe('a sign-in made offline, taken once the phone has a connection (ADR-531)', () => {
  it('Lee’s own password: proven by what only it could make, it is his session from when he signed in, the firm’s hours long; it ends the one before, sends his sync and is a security event', async () => {
    await world(async (served, tx) => {
      const p = await leeOnP1(served, tx);
      // At 7:00 he signs in again on the phone, in a dead zone; at 10:00 the phone finds signal.
      const signedInAt = new Date(mondayMorning.getTime() + 0.5 * hour);
      served.clock.at = new Date(mondayMorning.getTime() + 3.5 * hour);
      const token = await proven(served, p.phone);
      const report = await madeOffline(p.phone, {
        kind: 'OWN_PASSWORD',
        personId: p.lee.userId,
        signedInAt,
        typed: leesPassword,
        check: p.leesCheck,
      });
      const answer = await reported(served, token, report);
      expect(told(answer)).toEqual([200, undefined]);
      const taken = offlineSignInTakenAnswerSchema.parse(answer.body);
      expect(taken).toMatchObject({
        userId: p.lee.userId,
        monitorNumber: p.lee.monitorNumber,
        name: 'Lee Morgan',
        masterPasscodeSession: null,
        // 24 hours from 7:00, three of them gone.
        expiresInSeconds: 21 * 3600,
      });
      const sessions = await tx.session.findMany({
        where: { deviceId: p.phone.id },
        orderBy: { createdAt: 'asc' },
        select: {
          revokedAt: true,
          offlineSignInId: true,
          signedInAt: true,
          signedInUtcOffsetMinutes: true,
          expiresAt: true,
          masterPasscodeSession: true,
        },
      });
      expect(sessions).toEqual([
        {
          revokedAt: served.clock.now(),
          offlineSignInId: null,
          signedInAt: null,
          signedInUtcOffsetMinutes: null,
          expiresAt: new Date(mondayMorning.getTime() + 24 * hour),
          masterPasscodeSession: null,
        },
        {
          revokedAt: null,
          offlineSignInId: report.id,
          signedInAt,
          signedInUtcOffsetMinutes: -240,
          expiresAt: new Date(signedInAt.getTime() + 24 * hour),
          masterPasscodeSession: null,
        },
      ]);
      expect(await eventsOf(tx, p.phone.id, 'OFFLINE_SIGN_IN')).toBe(1);
      // Written as Lee, from that phone.
      const written = await tx.auditRecord.findFirstOrThrow({
        where: { tableName: 'session', operation: 'INSERT', requestId: answer.requestId },
        select: { actorId: true, source: true, deviceId: true },
      });
      expect(written).toEqual({ actorId: p.lee.userId, source: 'DEVICE', deviceId: p.phone.id });
      expect(told(await synced(served, token, taken.token))).toEqual([200, undefined]);
      // The session before it ended.
      expect(told(await synced(served, token, p.session))).toEqual([401, 'NOT_SIGNED_IN']);
    });
  });

  it('refused by one code, and the back office told, where it isn’t proven (a wrong password or passcode, a passcode not in force, anything of it changed), its login waits, it was taken already, ran out, or a later sign-in on the phone ended it: nothing else is written', async () => {
    await world(async (served, tx) => {
      const p = await leeOnP1(served, tx);
      served.clock.at = new Date(mondayMorning.getTime() + 3.5 * hour);
      const token = await proven(served, p.phone);
      const at7 = new Date(mondayMorning.getTime() + 0.5 * hour);
      const sessionsBefore = await tx.session.count({ where: { deviceId: p.phone.id } });
      const tries: [string, object][] = [
        // Not his password.
        [
          'a wrong password',
          await madeOffline(p.phone, {
            kind: 'OWN_PASSWORD',
            personId: p.lee.userId,
            signedInAt: at7,
            typed: '5550143',
            check: p.leesCheck,
          }),
        ],
        // Made right, then its moment changed: it proves another sign-in.
        [
          'another moment',
          {
            ...(await madeOffline(p.phone, {
              kind: 'OWN_PASSWORD',
              personId: p.lee.userId,
              signedInAt: at7,
              typed: leesPassword,
              check: p.leesCheck,
            })),
            signedInAt: new Date(at7.getTime() + 60_000).toISOString(),
          },
        ],
        // Before his online sign-in at 6:30, which the server knows of: it ended there.
        [
          'ended by a later sign-in',
          await madeOffline(p.phone, {
            kind: 'OWN_PASSWORD',
            personId: p.lee.userId,
            signedInAt: new Date(mondayMorning.getTime() - 0.5 * hour),
            typed: leesPassword,
            check: p.leesCheck,
          }),
        ],
        // Under the passcode, by a version that isn't the one in force.
        [
          'an old passcode',
          await madeOffline(p.phone, {
            kind: 'AS_MONITOR',
            personId: p.lee.userId,
            signedInAt: at7,
            typed: passcode,
            check: p.passcodeCheck.check,
            masterPasscodeVersion: p.passcodeCheck.version + 1,
          }),
        ],
        // Under the passcode in force, typed wrong.
        [
          'a wrong passcode',
          await madeOffline(p.phone, {
            kind: 'AS_MONITOR',
            personId: p.lee.userId,
            signedInAt: at7,
            typed: 'heron-landing-osprey',
            check: p.passcodeCheck.check,
            masterPasscodeVersion: p.passcodeCheck.version,
          }),
        ],
      ];
      for (const [why, report] of tries) {
        expect(told(await reported(served, token, report)), why).toEqual(refused);
      }
      // His login waiting after wrong tries online: refused too, the proof good or not, as an
      // online sign-in would be; once it no longer waits, the same sign-in is taken.
      const waiting = { where: { userId: p.lee.userId } };
      await tx.userCredential.update({
        ...waiting,
        data: { lockedUntil: new Date(served.clock.now().getTime() + hour) },
      });
      const whileWaiting = await madeOffline(p.phone, {
        kind: 'OWN_PASSWORD',
        personId: p.lee.userId,
        signedInAt: at7,
        typed: leesPassword,
        check: p.leesCheck,
      });
      expect(told(await reported(served, token, whileWaiting)), 'waiting').toEqual(refused);
      await tx.userCredential.update({ ...waiting, data: { lockedUntil: null } });
      expect(await eventsOf(tx, p.phone.id, 'OFFLINE_SIGN_IN_REFUSED')).toBe(tries.length + 1);
      expect(await tx.session.count({ where: { deviceId: p.phone.id } })).toBe(sessionsBefore);

      // Taken once: the same sign-in reported again is refused; so is one that has run out.
      const good = await madeOffline(p.phone, {
        kind: 'OWN_PASSWORD',
        personId: p.lee.userId,
        signedInAt: at7,
        typed: leesPassword,
        check: p.leesCheck,
      });
      expect(told(await reported(served, token, good))).toEqual([200, undefined]);
      expect(told(await reported(served, token, good))).toEqual(refused);
      served.clock.at = new Date(at7.getTime() + 25 * hour);
      const stale = await madeOffline(p.phone, {
        kind: 'OWN_PASSWORD',
        personId: p.lee.userId,
        signedInAt: new Date(at7.getTime() + 0.5 * hour),
        typed: leesPassword,
        check: p.leesCheck,
      });
      const fresh = await proven(served, p.phone);
      expect(told(await reported(served, fresh, stale))).toEqual(refused);
      expect(await eventsOf(tx, p.phone.id, 'OFFLINE_SIGN_IN_REFUSED')).toBe(tries.length + 3);
    });
  });

  it('under the master passcode, as the phone’s monitor: proven by the passcode in force, marked as the passcode’s and written as its actor', async () => {
    await world(async (served, tx) => {
      const p = await leeOnP1(served, tx);
      const signedInAt = new Date(mondayMorning.getTime() + 0.5 * hour);
      served.clock.at = new Date(mondayMorning.getTime() + 2 * hour);
      const answer = await reported(
        served,
        await proven(served, p.phone),
        await madeOffline(p.phone, {
          kind: 'AS_MONITOR',
          personId: p.lee.userId,
          signedInAt,
          typed: passcode,
          check: p.passcodeCheck.check,
          masterPasscodeVersion: p.passcodeCheck.version,
        }),
      );
      expect(told(answer)).toEqual([200, undefined]);
      expect(offlineSignInTakenAnswerSchema.parse(answer.body).masterPasscodeSession).toBe(
        'AS_MONITOR',
      );
      const written = await tx.auditRecord.findFirstOrThrow({
        where: { tableName: 'session', operation: 'INSERT', requestId: answer.requestId },
        select: { actorId: true, deviceId: true },
      });
      expect(written).toEqual({ actorId: masterPasscodeActorId, deviceId: p.phone.id });
    });
  });

  it('a phone taken out of service signs nobody in, offline or not: the door tells it so', async () => {
    await world(async (served, tx) => {
      const p = await leeOnP1(served, tx);
      saved(
        removePhoneEndpoint,
        await ask(served, p.dana, removePhoneEndpoint, {
          ids: { deviceId: p.phone.id },
          payload: { status: 'LOST' },
        }),
      );
      const report = await madeOffline(p.phone, {
        kind: 'OWN_PASSWORD',
        personId: p.lee.userId,
        signedInAt: new Date(mondayMorning.getTime() - 60_000),
        typed: leesPassword,
        check: p.leesCheck,
      });
      expect(told(await reported(served, p.token, report))).toEqual([409, 'PHONE_OUT_OF_SERVICE']);
      // What it holds still goes, with the session it had: it only sends (ADR-134, 531).
      const answer = await synced(served, p.token, p.session);
      expect(told(answer)).toEqual([200, undefined]);
      const read = syncAnsweredSchema.parse(answer.body);
      expect([read.masterPasscode, read.setupVersion]).toEqual([null, null]);
      // Lists and the login list no more, whatever session it holds.
      expect(
        told(
          await served.ask('GET', '/phones/current/lists', {
            bearer: p.token,
            monitorSession: p.session,
          }),
        ),
      ).toEqual([409, 'PHONE_OUT_OF_SERVICE']);
      expect(
        told(
          await served.ask('POST', phoneLoginListEndpoint.path, {
            bearer: p.token,
            monitorSession: p.session,
            payload: { masterPasscodeVersion: null, entries: [] },
          }),
        ),
      ).toEqual([409, 'PHONE_OUT_OF_SERVICE']);
    });
  });
});
