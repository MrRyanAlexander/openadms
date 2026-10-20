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
  addFormDefinitionEndpoint,
  addFormDebrisTypeEndpoint,
  addPrimeEndpoint,
  addSiteShapeEndpoint,
  changeProjectSettingsEndpoint,
  createRuleEndpoint,
  createSiteEndpoint,
  endpoints,
  enterControlRangeEndpoint,
  monitorCreatedAnswerSchema,
  monitorSignedInAnswerSchema,
  phoneListsAnswerSchema,
  phoneListsEndpoint,
  setupShownSchema,
  siteQuantityLookupEndpoint,
  startNumberSeriesEndpoint,
  withdrawAssignmentEndpoint,
  writeAssignmentEndpoint,
  type PhoneListsAnswer,
} from '@open-adms/contracts';
import { deviceKeyActorId, type Database } from '@open-adms/db';
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
  it('AC-02-37 (in part), AC-01-26, AC-07-91 Lee Morgan’s phone reads the lists of the assignment it took: the load form’s debris types without C&D, which is Hidden on phones; the field tags; the unit rate pay item the assignment names and not the project’s other; never a rate, a load’s pay item or its code; they are the project’s setup version 1, made by this first read and by no read after it', async () => {
    // The exact list of what a monitor's phone may call: a new one is added here on purpose.
    expect(
      endpoints.filter(({ access }) => access === 'MONITOR_ON_PHONE').map(({ name }) => name),
    ).toEqual([
      'signOutOnPhone',
      'phoneMonitor',
      'phoneLists',
      'phoneLoginList',
      'phoneAddressLookup',
    ]);
    await world(async (served, tx) => {
      const { priced, phone, token, signIn, assigned, onLoadForm, tagged, entered } = await leeOnP1(
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
      // White goods have item names (Refrigerator…); Lee's day names no white goods.
      await entered(priced.each('WG-RMV-EA', 'White good removed', 'White Goods', '45.00'));
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
        setupVersion: 1,
        blocks: [],
        // P1 generates its numbers in a series for each workflow and its ROEs; ROW allows no
        // split loads unless the firm says so (C184, ADR-137, 581).
        numbering: {
          ticketNumberSource: 'GENERATED',
          series: ['LOAD', 'HAUL_OUT', 'UNIT_RATE', 'ROE'],
        },
        allowSplitLoads: false,
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
            kindOfWork: {
              id: await priced.kindOfWork('Hangers'),
              name: 'Hangers',
              key: null,
              countShape: 'NUMBER',
              // Photographed by stage, as shipped (ADR-590).
              photosByStage: true,
            },
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
        // Hangers have no item names, and no other kind of work's are sent.
        itemNames: [],
        // The assignment makes no incident and no survey: their lists stay off the phone.
        incidentTypes: [],
        incidentOffers: [],
        contractors: [],
        surveyWorkTypes: [],
        // Nor any form that is no ticket's, nor any of the firm's own fields.
        forms: [],
        // Unit rate work neither certifies nor takes disposals: no truck list, no helper.
        vehicleTypes: [],
        vehicleFeatures: [],
        crewTypes: [],
        primes: [],
        helpers: [],
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
        '45.00',
        'VEG-HAUL-CY-15',
        'LNR-RMV-EA',
        'WG-RMV-EA',
        'Washer',
        'Leaner',
        'Hanger removal',
        'Coastline',
        'C&D',
      ]) {
        expect(answer.text.includes(never), never).toBe(false);
      }
      // No field of the answer is named for one either.
      expect(answer.text).not.toMatch(/"\w*(rate|rule|transaction|price|amount)\w*":/i);
      // The one thing the read wrote is the setup version these lists are (ADR-453): the
      // project's first, made for this phone by the device key's actor, never by Lee.
      expect(
        (await tx.auditRecord.findMany({ where: { requestId: answer.requestId } })).map(
          ({ tableName, operation, actorId, source, deviceId, domain }) => [
            tableName,
            operation,
            actorId,
            source,
            deviceId,
            domain,
          ],
        ),
      ).toEqual([['setup_manifest', 'INSERT', deviceKeyActorId, 'DEVICE', phone.id, 'RECORDS']]);
      // Asked again with nothing changed, the lists are the same version and nothing is written.
      const again = await lists(served, token, signedIn.token);
      expect(phoneListsAnswerSchema.parse(again.body).lists).toEqual(held.lists);
      expect(await tx.auditRecord.count({ where: { requestId: again.requestId } })).toBe(0);
      expect(
        (await tx.setupManifest.findMany({ where: { projectId: priced.ids.projectId } })).map(
          ({ version }) => version,
        ),
      ).toEqual([1]);
      // The log names ids and never the monitor or what the lists hold.
      const log = served.lines.join('\n');
      expect(log).toContain('A phone read its lists.');
      expect(log).toContain('"setupVersion":1');
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
      // A new certification is a record, not a change to the setup; but the sub it placed under
      // Coastline is in the truck lists a phone is shown, so the version moves (ADR-552 (3)(e)).
      expect([first.lists?.setupVersion, second.lists?.setupVersion]).toEqual([1, 2]);
      expect(second.lists?.primes).toEqual([
        {
          id: priced.coastline,
          name: 'Coastline Haulers LLC',
          subs: [
            {
              id: (await tx.contractor.findFirstOrThrow({ where: { name: 'Rivera Trucking' } })).id,
              name: 'Rivera Trucking',
              tier: 1,
            },
          ],
        },
      ]);
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

  it('AC-02-37 (in part), AC-07-91 a tower’s phone holds the project’s sites by name with what each is for, and its own site’s quantity lookup: at Cypress Creek Landfill, where Coastline’s Vegetative loads are paid per ton, the scale weight; no row for C&D, which is Hidden on phones; never the fee, the rule, the pay item or its rate; a phone at no site holds the sites and no lookup; AC-05-48, REQ-124f once the rule is switched off the lists are setup version 2 and ask for the load call, and the back office reads the site’s lookup as each version’s phones held it', async () => {
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
      const byTheTon = saved(
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
      ).record;
      const tower = await assigned({ fieldEventKinds: ['DISPOSAL'], siteId: cypress.id });
      const session = (await signIn()).token;
      const answer = await lists(served, token, session);
      const held = phoneListsAnswerSchema.parse(answer.body);
      expect(held.assignment).toMatchObject({ id: tower.id, site: { id: cypress.id } });
      const types = {
        finalDisposal: await tx.siteType.findUniqueOrThrow({ where: { key: 'FINAL_DISPOSAL' } }),
        tdsr: await tx.siteType.findUniqueOrThrow({ where: { key: 'TDSR' } }),
      };
      // Each with its place, for the phone's advisory "not at this site" (ADR-552 (3)(d)): its
      // GPS and, with no shape of its own, P1's circle round it.
      const place = {
        latitude: '39.09000000',
        longitude: '-75.62000000',
        area: { kind: 'CIRCLE', meters: priced.project.siteCircleMeters },
      };
      expect(held.lists?.sites).toEqual([
        {
          id: cypress.id,
          name: 'Cypress Creek Landfill',
          siteType: { id: types.finalDisposal.id, name: types.finalDisposal.name },
          takesLoads: true,
          haulOutsLeaveHere: false,
          ...place,
        },
        {
          id: marshRoad.id,
          name: 'Marsh Road TDSR',
          siteType: { id: types.tdsr.id, name: types.tdsr.name },
          takesLoads: true,
          haulOutsLeaveHere: true,
          ...place,
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
      // Why the tower asks for a weight stays on the server: no pay item, rate, rule, fee or
      // permit (AC-07-91). A site's GPS is sent since ADR-552 (3)(d).
      for (const never of ['31.25', 'VEG-DISP-TN', 'per ton', 'by the ton', 'FDEP', 'C&D']) {
        expect(answer.text.includes(never), never).toBe(false);
      }
      expect(answer.text).not.toMatch(
        /"\w*(rate|rule|transaction|price|amount|fee|permit|ineligible)\w*":/i,
      );
      // The version kept is what the project's phones are shown, whole, and holds none of it
      // either: nor a certification, an ROE or a phone's numbers (ADR-453).
      expect(held.lists?.setupVersion).toBe(1);
      const versions = async () =>
        (
          await tx.setupManifest.findMany({
            where: { projectId: priced.ids.projectId },
            orderBy: { version: 'asc' },
          })
        ).map(({ version, content }) => ({ version, kept: JSON.stringify(content) }));
      const [first] = await versions();
      for (const never of ['31.25', 'VEG-DISP-TN', 'per ton', 'by the ton', 'FDEP', 'C&D']) {
        expect(first?.kept.includes(never), never).toBe(false);
      }
      expect(first?.kept).not.toMatch(
        /"\w*(rate|rule|transaction|price|amount|fee|permit|ineligible|cert|roe|block|helper)\w*":/i,
      );
      expect(Object.keys(setupShownSchema.parse(JSON.parse(first?.kept ?? '')))).toHaveLength(19);

      // The board moves Lee to the curb: the sites stay, the lookup goes. The project's setup
      // is as it was, so the version is too.
      await tx.assignment.update({
        where: { id: tower.id },
        data: { siteId: null, fieldEventKinds: ['COLLECTION'] },
      });
      const atTheCurb = await read(served, token, session);
      expect(atTheCurb.lists?.sites.map(({ name }) => name)).toEqual([
        'Cypress Creek Landfill',
        'Marsh Road TDSR',
      ]);
      expect([atTheCurb.lists?.quantityLookup, atTheCurb.lists?.setupVersion]).toEqual([[], 1]);

      // Dana switches the rule off: nothing pays Cypress Creek's loads by the ton, so its
      // tower asks for the load call. Lee, back at the tower, is sent setup version 2.
      await tx.rule.update({ where: { id: byTheTon.id }, data: { active: false } });
      await tx.assignment.update({
        where: { id: tower.id },
        data: { siteId: cypress.id, fieldEventKinds: ['DISPOSAL'] },
      });
      const afterwards = await read(served, token, session);
      const row = { form: 'LOAD', debrisTypeId: vegetative.id, primeId: priced.coastline };
      expect([afterwards.lists?.setupVersion, afterwards.lists?.quantityLookup]).toEqual([
        2,
        [{ ...row, asks: 'LOAD_CALL' }],
      ]);
      expect((await versions()).map(({ version }) => version)).toEqual([1, 2]);
      // A reviewer reading a disposal recorded under version 1 asks what the tower's phone
      // asked from then: the weight, as kept, though the setup now says the load call.
      const under = async (setupVersion: string) =>
        ask(served, dana, siteQuantityLookupEndpoint, {
          ids: { siteId: cypress.id },
          query: `?setupVersion=${setupVersion}`,
        });
      expect(saved(siteQuantityLookupEndpoint, await under('1')).asks).toEqual([
        { siteId: cypress.id, ...row, asks: 'SCALE_WEIGHT' },
      ]);
      expect(saved(siteQuantityLookupEndpoint, await under('2')).asks).toEqual([
        { siteId: cypress.id, ...row, asks: 'LOAD_CALL' },
      ]);
      // Marsh Road's phones were shown its own rows under the same version.
      expect(
        saved(
          siteQuantityLookupEndpoint,
          await ask(served, dana, siteQuantityLookupEndpoint, {
            ids: { siteId: marshRoad.id },
            query: '?setupVersion=1',
          }),
        ).asks,
      ).toEqual([{ siteId: marshRoad.id, ...row, asks: 'LOAD_CALL' }]);
      // A version the project never had is not found; what is no version number is refused.
      expect(told(await under('3'))).toEqual([404, 'NOT_FOUND']);
      for (const not of ['0', '-1', 'two', '1.5', '']) {
        expect(told(await under(not)), not).toEqual([400, 'BAD_REQUEST']);
      }
      // No phone asks the back office's question.
      expect(
        told(
          await served.ask('GET', `/sites/${cypress.id}/quantity-lookup?setupVersion=1`, {
            bearer: token,
            monitorSession: session,
          }),
        ),
      ).toEqual([401, 'NOT_SIGNED_IN']);
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

  it('AC-11-86, C69 a phone whose work makes forms that are no ticket’s holds each of them: "GPS required" (the ROE form’s) and the newest version of the firm’s own fields, none where the firm added none; the survey work types with their built-in keys; no other form’s fields; and a new version of the fields is a new setup version', async () => {
    await world(async (served, tx) => {
      const { dana, priced, token, signIn, assigned } = await leeOnP1(served, tx);
      await priced.form('ROE', 'ROE', { gpsRequired: true });
      await priced.form('SURVEY', 'Survey');
      await priced.form('DROP_OFF_LOG', 'Drop-off log');
      const incident = await priced.form('INCIDENT', 'Incident', {
        incidentOffers: ['CONTRACTOR', 'CERT_NUMBER'],
      });
      const fields = async (version: object[]) =>
        saved(
          addFormDefinitionEndpoint,
          await ask(served, dana, addFormDefinitionEndpoint, {
            ids: { formId: incident.id },
            payload: { fields: version },
          }),
        ).record;
      const policeReport = {
        id: 'police-report',
        label: 'Police report number',
        type: 'TEXT',
        required: false,
      };
      await fields([policeReport]);
      const damage = { id: 'damage', label: 'Photo of the damage', type: 'PHOTO', required: true };
      const second = await fields([{ ...policeReport, required: true }, damage]);

      const day = await assigned({ formDocumentTypes: ['INCIDENT', 'ROE'] });
      const session = (await signIn()).token;
      const held = await read(served, token, session);
      expect(held.lists?.forms).toEqual([
        { documentType: 'ROE', gpsRequired: true, definition: null },
        {
          documentType: 'INCIDENT',
          gpsRequired: false,
          definition: {
            id: second.id,
            version: 2,
            fields: [{ ...policeReport, required: true }, damage],
          },
        },
      ]);
      // No survey made here: its work types stay off the phone.
      expect(held.lists?.surveyWorkTypes).toEqual([]);

      await tx.assignment.update({
        where: { id: day.id },
        data: { formDocumentTypes: ['SURVEY', 'DROP_OFF_LOG'] },
      });
      const surveying = await read(served, token, session);
      expect(surveying.lists?.forms).toEqual([
        { documentType: 'SURVEY', gpsRequired: false, definition: null },
        { documentType: 'DROP_OFF_LOG', gpsRequired: false, definition: null },
      ]);
      // Each work type with its built-in key, so a post-work survey is told by it, never the name.
      expect(surveying.lists?.surveyWorkTypes.map(({ name, key }) => [name, key])).toEqual([
        ['Pre-work survey', 'PRE_WORK'],
        ['Post-work survey', 'POST_WORK'],
        ['ROE', 'ROE'],
      ]);
      expect(surveying.lists?.setupVersion).toBe(held.lists?.setupVersion);

      await fields([policeReport]);
      const later = await read(served, token, session);
      expect(later.lists?.setupVersion).toBe((held.lists?.setupVersion ?? 0) + 1);
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
      // The field tag is a change to what P1's phones are shown: a new setup version. A pay
      // item taken off one person's day is the board's, and by itself would have made none.
      expect([first.lists?.setupVersion, second.lists?.setupVersion]).toEqual([1, 2]);

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

  it('a unit rate pay item archived while an assignment still names it stays in that phone’s lists, marked archived (ADR-453): the work goes on and the server judges it; a phone being set up is no longer shown it (ADR-463)', async () => {
    await world(async (served, tx) => {
      const { priced, token, signIn, assigned, entered } = await leeOnP1(served, tx);
      const hangers = await entered(
        priced.each('HNG-RMV-EA', 'Hanger removal', 'Hangers', '68.00'),
      );
      await assigned({ fieldEventKinds: ['UNIT_RATE'], payItemIds: [hangers] });
      const session = (await signIn()).token;
      await tx.payItem.update({ where: { id: hangers }, data: { archivedAt: mondayMorning } });
      const held = await read(served, token, session);
      expect(held.lists?.payItems.map(({ code, archived }) => [code, archived])).toEqual([
        ['HNG-RMV-EA', true],
      ]);
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

  it('AC-10-117, AC-10-118 a certifying phone holds the truck lists and who may help: the firm’s vehicle types with what each certifies, its features and crew types, and P1’s primes, Coastline with Rivera and Tidewater under it by tier and Summit with none; Sam Grant, assigned to P1 that day, as the one helper, never Lee himself, nobody on another day and nobody withdrawn; a tower and a haul-out’s disposal hold the truck lists and no helper; the curb and unit rate work hold neither; never a contractor’s contact', async () => {
    await world(async (served, tx, _who, within) => {
      const { dana, priced, token, lee, signIn, assigned } = await leeOnP1(served, tx);
      const summit = await priced.contractor('Summit Debris Services');
      saved(
        addPrimeEndpoint,
        await ask(served, dana, addPrimeEndpoint, {
          ids: priced.ids,
          payload: { contractorId: summit },
        }),
      );
      await tx.contractor.update({
        where: { id: priced.coastline },
        data: { contactName: 'Pat Coastline', contactPhone: '302-555-0101' },
      });
      // Rivera and Tidewater are placed under Coastline when a truck is certified naming them.
      const certified = await new Certifications(within, served.clock, shippedPolicy).certify({
        projectId: priced.project.id,
        certNumber: '730423',
        kind: 'CONTAINER',
        primeId: priced.coastline,
        firstTierSub: 'Rivera Trucking',
        secondTierSub: 'Tidewater Hauling',
        certifiedById: lee.userId,
        certifiedAt: mondayMorning,
        deviceUtcOffsetMinutes: -240,
        boxes: [{ shape: 'RECTANGLE', sign: 'ADD', length: 240, width: 90, height: 60 }],
      });
      expect(certified.saved).toBe(true);
      const contractorNamed = async (name: string) =>
        (await tx.contractor.findFirstOrThrow({ where: { name } })).id;
      // The others on the board: Sam on P1 that day, Ana on P1 on Tuesday, Kim withdrawn.
      const someone = async (name: string, workDate: string) => {
        const made = await served.ask('POST', '/phones/current/monitors', {
          bearer: token,
          payload: { name, password: '5550199', passcode },
        });
        expect(told(made)).toEqual([200, undefined]);
        const person = monitorCreatedAnswerSchema.parse(made.body);
        return assigned({ personId: person.userId, workDate, fieldEventKinds: ['COLLECTION'] });
      };
      const sams = await someone('Sam Grant', monday);
      await someone('Ana Brooks', '2026-10-13');
      const kims = await someone('Kim Tran', monday);
      await tx.assignment.update({ where: { id: kims.id }, data: { archivedAt: mondayMorning } });

      const certifying = await assigned({ certifying: true });
      const session = (await signIn()).token;
      const answer = await lists(served, token, session);
      const held = phoneListsAnswerSchema.parse(answer.body).lists;
      const firms = { where: { archivedAt: null }, orderBy: { position: 'asc' } } as const;
      expect(held?.vehicleTypes).toEqual(
        (await tx.vehicleType.findMany(firms)).map(({ id, name, certifies }) => ({
          id,
          name,
          kind: certifies,
        })),
      );
      expect(held?.vehicleTypes.find(({ name }) => name === 'Self-Loading Truck')?.kind).toBe(
        'CONTAINER',
      );
      expect(held?.vehicleFeatures).toEqual(
        (await tx.vehicleFeature.findMany(firms)).map(({ id, name }) => ({ id, name })),
      );
      expect(held?.crewTypes).toEqual(
        (await tx.crewType.findMany(firms)).map(({ id, name }) => ({ id, name })),
      );
      expect(held?.vehicleFeatures.map(({ name }) => name)).toContain('Dog Box');
      expect(held?.crewTypes.map(({ name }) => name)).toEqual(
        expect.arrayContaining(['Bucket Truck', 'Skid Steer']),
      );
      expect(held?.primes).toEqual([
        {
          id: priced.coastline,
          name: 'Coastline Haulers LLC',
          subs: [
            { id: await contractorNamed('Rivera Trucking'), name: 'Rivera Trucking', tier: 1 },
            { id: await contractorNamed('Tidewater Hauling'), name: 'Tidewater Hauling', tier: 2 },
          ],
        },
        { id: summit, name: 'Summit Debris Services', subs: [] },
      ]);
      const sam = await tx.assignment.findUniqueOrThrow({
        where: { id: sams.id },
        select: { person: { select: { id: true, name: true } } },
      });
      expect(held?.helpers).toEqual([{ id: sam.person.id, name: 'Sam Grant' }]);
      // The least a monitor needs (ASVS 14.2.6): no contact, no Monitor ID, no phone number.
      for (const never of ['Pat Coastline', '302-555-0101', '5550199']) {
        expect(answer.text.includes(never), never).toBe(false);
      }
      expect(answer.text).not.toMatch(/"\w*(contact|email|phone|monitorNumber)\w*":/i);

      // Each kind of work: the truck lists to a phone that certifies or takes disposals, a
      // helper only to one that certifies (ADR-552 (3)).
      const holds = async (work: object) => {
        await tx.assignment.update({
          where: { id: certifying.id },
          data: { certifying: false, fieldEventKinds: [], ...work },
        });
        const got = (await read(served, token, session)).lists;
        return [
          (got?.vehicleTypes.length ?? 0) > 0,
          (got?.vehicleFeatures.length ?? 0) > 0,
          (got?.crewTypes.length ?? 0) > 0,
          got?.primes.length,
          got?.helpers.length,
        ];
      };
      expect(await holds({ fieldEventKinds: ['DISPOSAL'] })).toEqual([true, true, true, 2, 0]);
      expect(await holds({ fieldEventKinds: ['HAUL_OUT_DISPOSAL'] })).toEqual([
        true,
        true,
        true,
        2,
        0,
      ]);
      expect(await holds({ fieldEventKinds: ['COLLECTION', 'HAUL_OUT_COLLECTION'] })).toEqual([
        false,
        false,
        false,
        0,
        0,
      ]);
      expect(await holds({ fieldEventKinds: ['UNIT_RATE'] })).toEqual([false, false, false, 0, 0]);
      expect(await holds({ certifying: true })).toEqual([true, true, true, 2, 1]);
    });
  });

  it('AC-10-119 each site carries its GPS and its area as it stands: P1’s circle round Cypress Creek’s GPS, and Marsh Road TDSR’s own shape once one is drawn; a new shape, a changed circle, a feature taken off the firm’s list and a sub placed under a prime each make a new setup version at the next read, and a certification alone does not', async () => {
    await world(async (served, tx, _who, within) => {
      const { dana, priced, token, lee, signIn, assigned } = await leeOnP1(served, tx);
      const siteType = async (key: string) =>
        (await tx.siteType.findUniqueOrThrow({ where: { key } })).id;
      const site = async (name: string, key: string, latitude: string, longitude: string) =>
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
              latitude,
              longitude,
              activationDate: monday,
            },
          }),
        ).record;
      const cypress = await site(
        'Cypress Creek Landfill',
        'FINAL_DISPOSAL',
        '39.07100000',
        '-75.60400000',
      );
      const marshRoad = await site('Marsh Road TDSR', 'TDSR', '39.09000000', '-75.62000000');
      await assigned({ fieldEventKinds: ['DISPOSAL'], siteId: cypress.id });
      const session = (await signIn()).token;
      const placeOf = async () =>
        Object.fromEntries(
          ((await read(served, token, session)).lists?.sites ?? []).map(
            ({ name, latitude, longitude, area }) => [name, { latitude, longitude, area }],
          ),
        );
      const version = async () => (await read(served, token, session)).lists?.setupVersion;
      const circle = { kind: 'CIRCLE', meters: priced.project.siteCircleMeters };
      expect(await placeOf()).toEqual({
        'Cypress Creek Landfill': {
          latitude: '39.07100000',
          longitude: '-75.60400000',
          area: circle,
        },
        'Marsh Road TDSR': { latitude: '39.09000000', longitude: '-75.62000000', area: circle },
      });
      expect(await version()).toBe(1);

      // Dana draws Marsh Road's own shape: it stands in place of the circle.
      const shape = {
        type: 'Polygon',
        coordinates: [
          [
            [-75.622, 39.088],
            [-75.618, 39.088],
            [-75.618, 39.092],
            [-75.622, 39.092],
            [-75.622, 39.088],
          ],
        ],
      };
      saved(
        addSiteShapeEndpoint,
        await ask(served, dana, addSiteShapeEndpoint, {
          ids: { siteId: marshRoad.id },
          payload: { source: 'DRAWN', shape },
        }),
      );
      const drawn = await placeOf();
      expect(drawn['Marsh Road TDSR']?.area).toEqual({
        kind: 'SHAPE',
        geometry: shape,
        box: {
          westLongitude: '-75.62200000',
          southLatitude: '39.08800000',
          eastLongitude: '-75.61800000',
          northLatitude: '39.09200000',
        },
      });
      expect(drawn['Cypress Creek Landfill']?.area).toEqual(circle);
      expect(await version()).toBe(2);

      // The circle round every site without a shape.
      saved(
        changeProjectSettingsEndpoint,
        await ask(served, dana, changeProjectSettingsEndpoint, {
          ids: priced.ids,
          payload: { siteCircleMeters: 250 },
        }),
      );
      expect((await placeOf())['Cypress Creek Landfill']?.area).toEqual({
        kind: 'CIRCLE',
        meters: 250,
      });
      expect(await version()).toBe(3);

      // A feature the firm takes off its list.
      const wheelWells = await tx.vehicleFeature.findFirstOrThrow({
        where: { archivedAt: null },
        orderBy: { position: 'desc' },
      });
      await tx.vehicleFeature.update({
        where: { id: wheelWells.id },
        data: { archivedAt: mondayMorning },
      });
      expect(await version()).toBe(4);

      // A certification is a record, not the setup; the sub it places under Coastline is.
      const certifications = new Certifications(within, served.clock, shippedPolicy);
      const certify = (certNumber: string, firstTierSub?: string) =>
        certifications.certify({
          projectId: priced.project.id,
          certNumber,
          kind: 'CONTAINER',
          primeId: priced.coastline,
          ...(firstTierSub === undefined ? {} : { firstTierSub }),
          certifiedById: lee.userId,
          certifiedAt: mondayMorning,
          deviceUtcOffsetMinutes: -240,
          boxes: [{ shape: 'RECTANGLE', sign: 'ADD', length: 240, width: 90, height: 60 }],
        });
      expect((await certify('730415')).saved).toBe(true);
      expect(await version()).toBe(4);
      expect((await certify('730416', 'Rivera Trucking')).saved).toBe(true);
      expect(await version()).toBe(5);
    });
  });
});
