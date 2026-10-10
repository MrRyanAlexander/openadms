// The lists a phone takes for its monitor's assignment, against the database (ARCHITECTURE
// §7.1's lists note, §9 (6); spec/acceptance/01-setup.md AC-01-26; 02-people-and-devices.md
// AC-02-37; 03-certification.md AC-03-09; 07-pricing-ledger-audit.md AC-07-91; BACKLOG 2.5.3,
// C103, C114, C115, C117; ADR-151, 207, 213, 223, 227, 240, 243, 449…451). Parts 1 and 2 of the
// task: the lists the harness's phones capture from, then the rest of the project's. The
// real process, in this test's own memory, on the installation's database as `adms_api`: it
// needs `pnpm local:up` after `pnpm installer`, and fails saying so. Each test's work is undone
// (support/database.ts).
import {
  addFieldTagEndpoint,
  addFormDebrisTypeEndpoint,
  createRuleEndpoint,
  createSiteEndpoint,
  endpoints,
  enterControlRangeEndpoint,
  monitorCreatedAnswerSchema,
  monitorSignedInAnswerSchema,
  phoneListsAnswerSchema,
  phoneListsEndpoint,
  siteQuantityLookupEndpoint,
  startNumberSeriesEndpoint,
  withdrawAssignmentEndpoint,
  writeAssignmentEndpoint,
  type PhoneListsAnswer,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Certifications } from '../src/certification/certifications.ts';
import { NumberAllocator } from '../src/numbering/number-allocator.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { enrolledPhone, passcode, proven } from './support/phones.ts';
import { shippedPolicy } from './support/process.ts';
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
async function leeOnP1(served: Served, tx: Tx, more: object = {}) {
  served.clock.at = mondayMorning;
  const dana: Browser = await served.signedIn(danasEmail, long);
  const priced = await p1Priced(served, dana, tx, more);
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
        controlRanges: [],
        debrisTypes: { LOAD: [{ id: vegetative.id, name: 'Vegetative' }], HAUL_OUT: [] },
        fieldTags: [{ id: mixed.id, name: 'Mixed' }],
        typedNumberReasons: held.lists?.typedNumberReasons,
        certifications: [],
        sites: [],
        roes: [],
        payItems: [
          {
            id: hangers,
            code: 'HNG-RMV-EA',
            bandFrom: null,
            bandTo: null,
            archived: false,
            payableType: { id: await priced.payableType('Hangers'), name: 'Hangers' },
            kindOfWork: { id: await priced.kindOfWork('Hangers'), name: 'Hangers' },
            // Its capture settings, each as Dana stated it.
            countIsAlwaysOne: true,
            gpsRequired: false,
            measurementRequired: false,
            decimalsAllowed: false,
            photosRequired: true,
            monitorMayMarkIneligible: false,
            quantityFromCarriedTickets: false,
          },
        ],
        itemNames: held.lists?.itemNames,
        // The assignment makes no incident and no survey: their lists stay off the phone.
        incidentTypes: [],
        incidentOffers: [],
        contractors: [],
        surveyWorkTypes: [],
        // The assignment is at no site.
        quantityLookup: [],
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

  it('AC-02-37 (in part), AC-03-09 the project’s certifications are in every phone’s lists: the dump trailer 730415 with its capacity, Coastline and its sub Rivera Trucking by name, never its driver, tag or measurements; a bucket truck crew certified a minute later is there at the next read, with no capacity; and a phone that certifies holds its block of cert numbers', async () => {
    await world(async (served, tx, _who, within) => {
      const { dana, priced, phone, token, lee, signIn, assigned } = await leeOnP1(served, tx);
      saved(
        startNumberSeriesEndpoint,
        await ask(served, dana, startNumberSeriesEndpoint, {
          ids: priced.ids,
          payload: { series: 'CERTIFICATION', firstNumber: 730415 },
        }),
      );
      const assignment = await assigned({ fieldEventKinds: ['COLLECTION'], certifying: true });
      const session = (await signIn()).token;
      const first = await read(served, token, session);
      expect(first.assignment).toMatchObject({ id: assignment.id, certifying: true });
      expect([first.lists?.certifications, first.lists?.blocks]).toEqual([[], []]);

      // What the sync will do for a certifying phone (2.6.2): its block of 100 cert numbers.
      const topUp = await new NumberAllocator(within, served.clock, shippedPolicy).topUp(
        { person: lee.userId, deviceId: phone.id },
        { projectId: priced.project.id, series: 'CERTIFICATION', lastUsedNumber: null },
      );
      expect(topUp.saved).toBe(true);
      const certifications = new Certifications(within, served.clock, shippedPolicy);
      const certified = async (
        more: Pick<
          Parameters<Certifications['certify']>[0],
          'certNumber' | 'kind' | 'boxes' | 'crewTypeId' | 'firstTierSub' | 'driverName'
        >,
      ) => {
        const outcome = await certifications.certify({
          projectId: priced.project.id,
          primeId: priced.coastline,
          certifiedById: lee.userId,
          certifiedAt: mondayMorning,
          deviceUtcOffsetMinutes: -240,
          driverPhone: '302-555-0188',
          driverLicenceNumber: 'R160-542-80-112-0',
          tagNumber: 'RVT 4821',
          ...more,
        });
        if (!outcome.saved) throw new Error(outcome.refusal.message);
        return outcome.record;
      };
      const trailer = await certified({
        certNumber: '730415',
        kind: 'CONTAINER',
        firstTierSub: 'Rivera Trucking',
        driverName: 'Marco Rivera',
        boxes: [{ shape: 'RECTANGLE', sign: 'ADD', length: 240, width: 90, height: 60 }],
      });
      const answer = await lists(served, token, session);
      const second = phoneListsAnswerSchema.parse(answer.body);
      const rivera = await tx.contractor.findFirstOrThrow({ where: { name: 'Rivera Trucking' } });
      // 240 × 90 × 60 = 1,296,000 cu in ÷ 46,656 = 27.78 → 28 CY.
      expect(second.lists?.certifications).toEqual([
        {
          id: trailer.id,
          certNumber: '730415',
          kind: 'CONTAINER',
          capacityCy: 28,
          prime: { id: priced.coastline, name: 'Coastline Haulers LLC' },
          firstTierSub: { id: rivera.id, name: 'Rivera Trucking' },
          secondTierSub: null,
        },
      ]);
      expect(second.lists?.blocks).toEqual([
        {
          series: 'CERTIFICATION',
          firstNumber: 730415,
          lastNumber: 730514,
          lastUsedNumber: null,
          status: 'ISSUED',
        },
      ]);
      // The driver is on the certification and nowhere in a phone's lists; nor the tag, nor a
      // measurement's name (ASVS 14.2.6).
      for (const never of ['Marco', '302-555-0188', 'R160-542', 'RVT 4821']) {
        expect(answer.text.includes(never), never).toBe(false);
      }
      expect(answer.text).not.toMatch(
        /"\w*(driver|licence|tag(Number|State|Expiry)|length|box)\w*":/i,
      );

      const crew = await certified({
        certNumber: '730417',
        kind: 'CREW',
        crewTypeId: (await tx.crewType.findFirstOrThrow({ where: { name: 'Bucket Truck' } })).id,
        boxes: [],
      });
      const third = await read(served, token, session);
      expect(
        third.lists?.certifications.map((one) => [
          one.id,
          one.certNumber,
          one.kind,
          one.capacityCy,
        ]),
      ).toEqual([
        [trailer.id, '730415', 'CONTAINER', 28],
        [crew.id, '730417', 'CREW', null],
      ]);
    });
  });

  it('AC-02-37 (in part), AC-07-91 a tower’s phone holds the project’s sites by name with what each is for, and its own site’s quantity lookup: at Cypress Creek Landfill, where Coastline’s Vegetative loads are paid per ton, the scale weight; no row for C&D, which is Hidden on phones; never the fee, the rule, the pay item or its rate; a phone at no site holds the sites and no lookup', async () => {
    await world(async (served, tx) => {
      const { dana, priced, token, signIn, assigned, onLoadForm, entered } = await leeOnP1(
        served,
        tx,
      );
      const vegetative = await onLoadForm('Vegetative', false);
      await onLoadForm('C&D', true);
      const siteType = async (key: string) =>
        (await tx.siteType.findUniqueOrThrow({ where: { key } })).id;
      const site = async (name: string, key: string, more: object) =>
        saved(
          createSiteEndpoint,
          await ask(served, dana, createSiteEndpoint, {
            ids: priced.ids,
            payload: {
              name,
              siteTypeId: await siteType(key),
              takesLoads: true,
              haulOutsLeaveHere: false,
              chargesTippingFee: false,
              ineligibleSite: false,
              permitNumber: null,
              latitude: '39.09000000',
              longitude: '-75.62000000',
              activationDate: monday,
              ...more,
            },
          }),
        ).record;
      const cypress = await site('Cypress Creek Landfill', 'FINAL_DISPOSAL', {
        chargesTippingFee: true,
        permitNumber: 'FDEP-SW-2019-0442',
      });
      const marshRoad = await site('Marsh Road TDSR', 'TDSR', { haulOutsLeaveHere: true });
      // A site taken off the project is no site to a phone.
      const landfill = await site('Bayline County Landfill', 'FINAL_DISPOSAL', {});
      await tx.disposalSite.update({
        where: { id: landfill.id },
        data: { archivedAt: mondayMorning },
      });
      // Coastline's Vegetative loads dumped at Cypress Creek are paid by the ton.
      const perTon = await entered(
        priced.payItem({
          code: 'VEG-DISP-TN',
          description: 'Vegetative disposal per ton',
          payableTypeId: await priced.payableType('Vegetative'),
          unit: 'TN',
          rates: [{ primeId: priced.coastline, rate: '31.25' }],
        }),
      );
      saved(
        createRuleEndpoint,
        await ask(served, dana, createRuleEndpoint, {
          ids: priced.ids,
          payload: {
            formId: priced.forms.load,
            name: 'Cypress Creek by the ton',
            contractId: priced.contract,
            active: true,
            criteria: [
              { criterion: 'DEBRIS_TYPE', operator: 'EQUALS', picks: [vegetative.id] },
              { criterion: 'DISPOSAL_SITE', operator: 'EQUALS', picks: [cypress.id] },
            ],
            actions: [{ kind: 'ADD_TRANSACTION', slot: 1, payItemId: perTon }],
          },
        }),
      );
      const tower = await assigned({ fieldEventKinds: ['DISPOSAL'], siteId: cypress.id });
      const session = (await signIn()).token;
      const answer = await lists(served, token, session);
      const held = phoneListsAnswerSchema.parse(answer.body);
      expect(held.assignment).toMatchObject({ id: tower.id, site: { id: cypress.id } });
      const types = {
        finalDisposal: await tx.siteType.findUniqueOrThrow({ where: { key: 'FINAL_DISPOSAL' } }),
        tdsr: await tx.siteType.findUniqueOrThrow({ where: { key: 'TDSR' } }),
      };
      expect(held.lists?.sites).toEqual([
        {
          id: cypress.id,
          name: 'Cypress Creek Landfill',
          siteType: { id: types.finalDisposal.id, name: types.finalDisposal.name },
          takesLoads: true,
          haulOutsLeaveHere: false,
        },
        {
          id: marshRoad.id,
          name: 'Marsh Road TDSR',
          siteType: { id: types.tdsr.id, name: types.tdsr.name },
          takesLoads: true,
          haulOutsLeaveHere: true,
        },
      ]);
      expect(held.lists?.quantityLookup).toEqual([
        {
          form: 'LOAD',
          debrisTypeId: vegetative.id,
          primeId: priced.coastline,
          asks: 'SCALE_WEIGHT',
        },
      ]);
      // The back office's own answer for that site holds the hidden C&D too: the phone's
      // rows are those of the debris types it holds, told the same.
      const whole = saved(
        siteQuantityLookupEndpoint,
        await ask(served, dana, siteQuantityLookupEndpoint, { ids: { siteId: cypress.id } }),
      ).asks;
      expect(whole).toHaveLength(2);
      expect(
        whole
          .filter((row) => row.debrisTypeId === vegetative.id)
          .map(({ form, debrisTypeId, primeId, asks }) => ({ form, debrisTypeId, primeId, asks })),
      ).toEqual(held.lists?.quantityLookup);
      // Why the tower asks for a weight stays on the server: no pay item, rate, rule, fee,
      // permit or GPS (AC-07-91).
      for (const never of [
        '31.25',
        'VEG-DISP-TN',
        'per ton',
        'by the ton',
        'FDEP',
        '39.09',
        '75.62',
        'C&D',
      ]) {
        expect(answer.text.includes(never), never).toBe(false);
      }
      expect(answer.text).not.toMatch(
        /"\w*(rate|rule|transaction|price|amount|fee|permit|latitude|ineligible)\w*":/i,
      );
      expect(await tx.auditRecord.count({ where: { requestId: answer.requestId } })).toBe(0);

      // The board moves Lee to the curb: the sites stay, the lookup goes.
      await tx.assignment.update({
        where: { id: tower.id },
        data: { siteId: null, fieldEventKinds: ['COLLECTION'] },
      });
      const atTheCurb = await read(served, token, session);
      expect(atTheCurb.lists?.sites.map(({ name }) => name)).toEqual([
        'Cypress Creek Landfill',
        'Marsh Road TDSR',
      ]);
      expect(atTheCurb.lists?.quantityLookup).toEqual([]);
    });
  });

  it('AC-02-37 (in part) a phone whose work names an ROE holds the project’s ROEs by number, address and parcel, each saying whether its pre-work survey is done, never the owner; a tower’s phone holds none; and a project numbered from pre-printed stock sends its control ranges, without one taken off', async () => {
    await world(async (served, tx, who) => {
      const { dana, priced, token, lee, signIn, assigned } = await leeOnP1(served, tx, {
        ticketNumberSource: 'CONTROL',
      });
      const range = async (series: string, firstNumber: number, lastNumber: number) =>
        saved(
          enterControlRangeEndpoint,
          await ask(served, dana, enterControlRangeEndpoint, {
            ids: priced.ids,
            payload: { series, firstNumber, lastNumber },
          }),
        ).record;
      await range('LOAD', 5001, 5500);
      const takenOff = await range('LOAD', 9001, 9500);
      await tx.controlRange.update({
        where: { id: takenOff.id },
        data: { archivedAt: mondayMorning },
      });
      const roe = (roeNumber: string, parcelId: string, address: string, ownerName: string) =>
        tx.roe.create({
          data: {
            projectId: priced.project.id,
            roeNumber,
            parcelId,
            address,
            ownerName,
            signed: true,
            signedDate: new Date('2026-10-09'),
            answers: {},
            source: 'BACK_OFFICE',
            madeById: who.dana,
          },
        });
      const r0007 = await roe('R-0007', 'APN 14-0321-007', '412 Cedar Ct', 'Rosa Delgado');
      const r0008 = await roe('R-0008', 'APN 14-0321-008', '416 Cedar Ct', 'Ben Whitaker');
      // 412 Cedar Ct's pre-work survey is done; 416's is not.
      const preWork = await tx.surveyWorkType.findUniqueOrThrow({ where: { key: 'PRE_WORK' } });
      const postWork = await tx.surveyWorkType.findUniqueOrThrow({ where: { key: 'POST_WORK' } });
      const deviceFailed = await tx.reason.findFirstOrThrow({ where: { name: 'Device failed' } });
      const survey = (workTypeId: string, roeNumber: string) =>
        tx.survey.create({
          data: {
            projectId: priced.project.id,
            source: 'BACK_OFFICE',
            monitorId: lee.userId,
            createdById: who.dana,
            createdReasonId: deviceFailed.id,
            madeAt: mondayMorning,
            deviceUtcOffsetMinutes: -240,
            answers: {},
            workTypeId,
            roeNumber,
          },
        });
      await survey(preWork.id, 'R-0007');
      await survey(postWork.id, 'R-0008');

      const curb = await assigned({ fieldEventKinds: ['COLLECTION'] });
      const session = (await signIn()).token;
      const answer = await lists(served, token, session);
      const held = phoneListsAnswerSchema.parse(answer.body);
      expect(held.lists?.roes).toEqual([
        {
          id: r0007.id,
          roeNumber: 'R-0007',
          address: '412 Cedar Ct',
          parcelId: 'APN 14-0321-007',
          preWorkSurveyDone: true,
        },
        {
          id: r0008.id,
          roeNumber: 'R-0008',
          address: '416 Cedar Ct',
          parcelId: 'APN 14-0321-008',
          preWorkSurveyDone: false,
        },
      ]);
      expect(held.lists?.controlRanges).toEqual([
        { series: 'LOAD', firstNumber: 5001, lastNumber: 5500 },
      ]);
      // A private citizen's name is not what a monitor picks an ROE by (ASVS 14.2.6).
      for (const never of ['Rosa', 'Delgado', 'Whitaker', '2026-10-09']) {
        expect(answer.text.includes(never), never).toBe(false);
      }
      expect(answer.text).not.toMatch(/"\w*(owner|signed|answers)\w*":/i);

      // At the tower nobody picks an ROE: no address is sent there.
      await tx.assignment.update({
        where: { id: curb.id },
        data: { fieldEventKinds: ['DISPOSAL'] },
      });
      const tower = await lists(served, token, session);
      expect(phoneListsAnswerSchema.parse(tower.body).lists?.roes).toEqual([]);
      expect(tower.text.includes('Cedar Ct')).toBe(false);
      // A phone that makes surveys picks one all the same.
      await tx.assignment.update({
        where: { id: curb.id },
        data: { fieldEventKinds: [], formDocumentTypes: ['SURVEY'] },
      });
      const surveying = await read(served, token, session);
      expect(surveying.lists?.roes.map((one) => one.roeNumber)).toEqual(['R-0007', 'R-0008']);
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
