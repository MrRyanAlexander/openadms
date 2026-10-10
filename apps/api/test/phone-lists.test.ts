// The lists a phone takes for its monitor's assignment, against the database (ARCHITECTURE
// §7.1's lists note, §9 (6); spec/acceptance/01-setup.md AC-01-26; 02-people-and-devices.md
// AC-02-37; 07-pricing-ledger-audit.md AC-07-91; BACKLOG 2.5.3, C103, C114, C115; ADR-151, 207,
// 213, 223, 240, 449, 450). Part 1 of the task: the lists the harness's phones capture from. The
// real process, in this test's own memory, on the installation's database as `adms_api`: it
// needs `pnpm local:up` after `pnpm installer`, and fails saying so. Each test's work is undone
// (support/database.ts).
import {
  addFieldTagEndpoint,
  addFormDebrisTypeEndpoint,
  endpoints,
  monitorCreatedAnswerSchema,
  monitorSignedInAnswerSchema,
  phoneListsAnswerSchema,
  phoneListsEndpoint,
  withdrawAssignmentEndpoint,
  writeAssignmentEndpoint,
  type PhoneListsAnswer,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { enrolledPhone, passcode, proven } from './support/phones.ts';
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

const monday = '2026-10-12';
// 6:30 am on Monday in Bayline County, at the staging area.
const mondayMorning = new Date('2026-10-12T10:30:00Z');

const lists = (served: Served, bearer?: string, monitorSession?: string): Promise<Answer> =>
  served.ask('GET', phoneListsEndpoint.path, {
    ...(bearer === undefined ? {} : { bearer }),
    ...(monitorSession === undefined ? {} : { monitorSession }),
  });

async function read(served: Served, bearer: string, session: string): Promise<PhoneListsAnswer> {
  const answer = await lists(served, bearer, session);
  expect(told(answer)).toEqual([200, undefined]);
  return phoneListsAnswerSchema.parse(answer.body);
}

// P1 as Dana prices it, a phone, and Lee Morgan created on it and signed in: the phone's token
// and Lee's session.
async function leeOnP1(served: Served, tx: Tx) {
  served.clock.at = mondayMorning;
  const dana: Browser = await served.signedIn(danasEmail, long);
  const priced = await p1Priced(served, dana, tx);
  const phone = await enrolledPhone(served, tx, 'P1-UR-1');
  const token = await proven(served, phone);
  const password = '5550142';
  const made = await served.ask('POST', '/phones/current/monitors', {
    bearer: token,
    payload: { name: 'Lee Morgan', password, passcode },
  });
  expect(told(made)).toEqual([200, undefined]);
  const lee = monitorCreatedAnswerSchema.parse(made.body);
  const signIn = async () => {
    const answer = await served.ask('POST', '/phones/current/sign-ins', {
      bearer: token,
      payload: { monitorNumber: lee.monitorNumber, password },
    });
    expect(told(answer)).toEqual([200, undefined]);
    return monitorSignedInAnswerSchema.parse(answer.body);
  };
  const assigned = async (payload: object) =>
    saved(
      writeAssignmentEndpoint,
      await ask(served, dana, writeAssignmentEndpoint, {
        ids: priced.ids,
        payload: {
          personId: lee.userId,
          workDate: monday,
          fieldEventKinds: [],
          certifying: false,
          formDocumentTypes: [],
          siteId: null,
          deviceId: null,
          payItemIds: [],
          ...payload,
        },
      }),
    ).record;
  const onLoadForm = async (name: string, hiddenOnPhones: boolean) =>
    saved(
      addFormDebrisTypeEndpoint,
      await ask(served, dana, addFormDebrisTypeEndpoint, {
        ids: { formId: priced.forms.load },
        payload: { debrisTypeId: await priced.debrisType(name), reduced: false, hiddenOnPhones },
      }),
    ).record;
  const tagged = async (name: string) =>
    saved(
      addFieldTagEndpoint,
      await ask(served, dana, addFieldTagEndpoint, { ids: priced.ids, payload: { name } }),
    ).record;
  const entered = async (answer: Promise<Answer>) => {
    const sent = await answer;
    expect(told(sent)).toEqual([200, undefined]);
    return (sent.body as { record: { id: string } }).record.id;
  };
  return { dana, priced, phone, token, lee, signIn, assigned, onLoadForm, tagged, entered };
}

describe('the lists a phone takes', () => {
  it('AC-02-37 (in part), AC-01-26, AC-07-91 Lee Morgan’s phone reads the lists of the assignment it took: the load form’s debris types without C&D, which is Hidden on phones; the field tags; the unit rate pay item the assignment names and not the project’s other; never a rate, a load’s pay item or its code; and reading them writes nothing', async () => {
    // The exact list of what a monitor's phone may call: a new one is added here on purpose.
    expect(
      endpoints.filter(({ access }) => access === 'MONITOR_ON_PHONE').map(({ name }) => name),
    ).toEqual(['signOutOnPhone', 'phoneMonitor', 'phoneLists']);
    await world(async (served, tx) => {
      const { priced, token, signIn, assigned, onLoadForm, tagged, entered } = await leeOnP1(
        served,
        tx,
      );
      const vegetative = await onLoadForm('Vegetative', false);
      await onLoadForm('C&D', true);
      const mixed = await tagged('Mixed');
      // A load's pay item and two unit rate pay items, each with Coastline's rate.
      await entered(priced.veg15());
      const hangers = await entered(
        priced.each('HNG-RMV-EA', 'Hanger removal', 'Hangers', '68.00'),
      );
      await entered(priced.each('LNR-RMV-EA', 'Leaner removal', 'Leaners', '95.00'));
      const assignment = await assigned({
        fieldEventKinds: ['COLLECTION', 'UNIT_RATE'],
        payItemIds: [hangers],
      });
      const signedIn = await signIn();
      expect(signedIn.assignment?.id).toBe(assignment.id);

      const answer = await lists(served, token, signedIn.token);
      expect(told(answer)).toEqual([200, undefined]);
      const held = phoneListsAnswerSchema.parse(answer.body);
      // The assignment is the one the sign-in was answered, told the same way.
      expect([held.assignment, held.noAssignment]).toEqual([signedIn.assignment, null]);
      expect(held.lists).toEqual({
        blocks: [],
        debrisTypes: { LOAD: [{ id: vegetative.id, name: 'Vegetative' }], HAUL_OUT: [] },
        fieldTags: [{ id: mixed.id, name: 'Mixed' }],
        typedNumberReasons: held.lists?.typedNumberReasons,
        payItems: [
          {
            id: hangers,
            code: 'HNG-RMV-EA',
            bandFrom: null,
            bandTo: null,
            archived: false,
            payableType: { id: await priced.payableType('Hangers'), name: 'Hangers' },
            kindOfWork: { id: await priced.kindOfWork('Hangers'), name: 'Hangers' },
          },
        ],
        itemNames: held.lists?.itemNames,
        // The assignment makes no incident and no survey: their lists stay off the phone.
        incidentTypes: [],
        incidentOffers: [],
        contractors: [],
        surveyWorkTypes: [],
      });
      expect(held.lists?.typedNumberReasons.length).toBeGreaterThan(0);
      // Nothing sent says what anything pays: no rate, no load's code, no other pay item, no
      // prime's name, no description (AC-07-91; invariant 20).
      for (const never of [
        '68.00',
        '95.00',
        '7.50',
        'VEG-HAUL-CY-15',
        'LNR-RMV-EA',
        'Leaner',
        'Hanger removal',
        'Coastline',
        'C&D',
      ]) {
        expect(answer.text.includes(never), never).toBe(false);
      }
      // No field of the answer is named for one either.
      expect(answer.text).not.toMatch(/"\w*(rate|rule|transaction|price|amount)\w*":/i);
      // Reading is a read: no audit record carries the request.
      expect(await tx.auditRecord.count({ where: { requestId: answer.requestId } })).toBe(0);
      // The log names ids and never the monitor or what the lists hold.
      const log = served.lines.join('\n');
      expect(log).toContain('A phone read its lists.');
      for (const never of ['Lee Morgan', 'HNG-RMV-EA', signedIn.token, token]) {
        expect(log.includes(never), never).toBe(false);
      }
    });
  });

  it('a phone refreshes its lists at any time (ADR-151): a field tag Dana adds is there at the next read, a pay item taken off the assignment is gone, and once the board has no assignment for Lee the phone is told there is none and sent no lists, though Lee stays signed in', async () => {
    await world(async (served, tx) => {
      const { dana, priced, token, signIn, assigned, tagged, entered } = await leeOnP1(served, tx);
      const hangers = await entered(
        priced.each('HNG-RMV-EA', 'Hanger removal', 'Hangers', '68.00'),
      );
      const assignment = await assigned({ fieldEventKinds: ['UNIT_RATE'], payItemIds: [hangers] });
      const session = (await signIn()).token;
      const first = await read(served, token, session);
      expect(first.lists?.fieldTags).toEqual([]);
      expect(first.lists?.payItems.map(({ code }) => code)).toEqual(['HNG-RMV-EA']);

      const mixed = await tagged('Mixed');
      // The board's own change: the pay item is taken off Lee's day (C103).
      await tx.assignmentPayItem.updateMany({
        where: { assignmentId: assignment.id },
        data: { archivedAt: mondayMorning },
      });
      const second = await read(served, token, session);
      expect(second.assignment?.id).toBe(assignment.id);
      expect(second.lists?.fieldTags).toEqual([{ id: mixed.id, name: 'Mixed' }]);
      expect([second.lists?.payItems, second.lists?.itemNames]).toEqual([[], []]);

      saved(
        withdrawAssignmentEndpoint,
        await ask(served, dana, withdrawAssignmentEndpoint, {
          ids: { assignmentId: assignment.id },
        }),
      );
      expect(await read(served, token, session)).toEqual({
        assignment: null,
        noAssignment: 'NONE_THAT_DAY',
        lists: null,
      });
      expect(
        told(
          await served.ask('GET', '/phones/current/monitor', {
            bearer: token,
            monitorSession: session,
          }),
        ),
      ).toEqual([200, undefined]);
    });
  });

  it('AC-02-39 the lists are a signed-in monitor’s on a proven phone, nobody else’s: not a phone with nobody signed in, not a session with no proven phone, not another phone with that session, not the back office', async () => {
    await world(async (served, tx) => {
      const { dana, token, signIn } = await leeOnP1(served, tx);
      const session = (await signIn()).token;
      expect(told(await lists(served, token, session))).toEqual([200, undefined]);
      expect(told(await lists(served, token))).toEqual([401, 'NOT_SIGNED_IN']);
      expect(told(await lists(served, undefined, session))).toEqual([401, 'PHONE_NOT_PROVEN']);
      const other = await proven(served, await enrolledPhone(served, tx, 'P1-COL-1'));
      expect(told(await lists(served, other, session))).toEqual([401, 'NOT_SIGNED_IN']);
      const asDana = await served.ask('GET', phoneListsEndpoint.path, { cookies: dana.cookies });
      expect(told(asDana)).toEqual([401, 'PHONE_NOT_PROVEN']);
    });
  });
});
