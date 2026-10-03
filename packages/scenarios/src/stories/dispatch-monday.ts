// The second story (BACKLOG 0.4.3; ADR-281): Monday's dispatch on P1, as far as this build reaches
// (spec/golden/MISSION.md §1, "Phones and the dispatch board"). Phones are enrolled once; Luis
// Ortega writes the day's assignments on the board; each monitor's phone takes theirs at the yard.
// Jo Kim's names the unit rate pay items she does that day (ADR-286), which Dana enters first with
// Coastline's rates (ADR-309). Tariq Patel has none, so the
// master passcode sets his phone up on the spot: an unplanned assignment, marked. Ana and Kim record ticket 101001 under their assignments; that evening
// Tariq's phone can't be found and is marked lost. What it proves is the models: the time zone, the
// Monitor ID, the device with its number block and passcode version, the assignment, and each
// field event carrying its assignment and setup version. The screens, the sign-in, the sync and
// the allocator behind these rows are Phases 2 to 4. It opens with setup's first three steps
// (ADR-303): the client, the declaration event and the project, whose settings start as the
// release's policy values; then the fourth (ADR-305): the prime added to the project, and its
// contract.
import { projectTime } from '../clock.ts';
import { uuidv7 } from '../ids.ts';
import type { Story } from '../runner.ts';
import { p1TimeZone as timeZone, setUpP1 } from './p1.ts';

const at = (time: string): string => `2026-10-12T${time}:00-04:00`;
const monday = new Date('2026-10-12');
const day = (date: Date): string => date.toISOString().slice(0, 10);

export const dispatchMonday: Story = {
  name: 'dispatch-monday',
  title: 'enrolled phones take the day’s assignments; one is unplanned; one phone is lost',
  timeZone,
  start: at('05:30'),

  async run(story) {
    const { api, clock } = story;

    story.at(
      at('05:30'),
      'Dana Reyes sets up Luis Ortega; Bayline County, Hurricane Delphine and P1; its prime and contract; and its two sites',
    );
    // The first user is written with itself as the actor (ADR-270 (4)).
    const dana = uuidv7(clock.now());
    const office = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      const danaRow = await tx.user.create({
        data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' },
      });
      const luis = await tx.user.create({ data: { name: 'Luis Ortega', role: 'MANAGER_ANALYST' } });
      const p1 = await setUpP1(tx, story.policy);
      const tdsr = await tx.disposalSite.create({
        data: { projectId: p1.project, name: 'Marsh Road TDSR' },
      });
      const landfill = await tx.disposalSite.create({
        data: { projectId: p1.project, name: 'Bayline County Landfill' },
      });
      return {
        danaRow,
        luis,
        p1: p1.project,
        prime: p1.prime,
        contract: p1.contract,
        tdsr: tdsr.id,
        landfill: landfill.id,
      };
    });
    const project = await api.project.findUniqueOrThrow({
      where: { id: office.p1 },
      include: {
        client: true,
        declarationEvent: { include: { referenceType: true } },
        programType: true,
        kindsOfWork: {
          include: { kindOfWork: true },
          orderBy: { kindOfWork: { position: 'asc' } },
        },
      },
    });
    story.check(
      'P1 is one body of work for Bayline County under Hurricane Delphine, DR-9001-FL: a ROW project (no ROE), active 12 October 2026 to 31 January 2027, its numbers generated',
      [
        project.name,
        project.client.name,
        project.declarationEvent.name,
        project.declarationEvent.reference,
        project.declarationEvent.referenceType.name,
        project.programType.name,
        project.programType.requiresRoe,
        project.timeZone,
        day(project.activeFrom),
        project.activeTo === null ? null : day(project.activeTo),
        project.ticketNumberSource,
      ],
      [
        'Bayline County ROW, Hurricane Delphine',
        'Bayline County',
        'Hurricane Delphine',
        'DR-9001-FL',
        'FEMA disaster (DR)',
        'ROW',
        false,
        'America/New_York',
        '2026-10-12',
        '2027-01-31',
        'GENERATED',
      ],
    );
    story.check(
      'AC-01-11 its settings start as the release’s policy values: load calls flagged at or under 5 and at or over 95, a 200 m site circle, a 31 in stump fill depth, both stump checks on, the time clock off',
      {
        loadCallLowLimit: project.loadCallLowLimit,
        loadCallHighLimit: project.loadCallHighLimit,
        siteCircleMeters: project.siteCircleMeters,
        stumpFillDepthInches: project.stumpFillDepthInches,
        stumpCheckRootBallWider: project.stumpCheckRootBallWider,
        stumpCheckFillNeedsExposure: project.stumpCheckFillNeedsExposure,
        timeClockEnabled: project.timeClockEnabled,
      },
      {
        loadCallLowLimit: 5,
        loadCallHighLimit: 95,
        siteCircleMeters: 200,
        stumpFillDepthInches: 31,
        stumpCheckRootBallWider: true,
        stumpCheckFillNeedsExposure: true,
        timeClockEnabled: false,
      },
    );
    story.check(
      'Dana ticked Allow split loads (a ROW project starts without it); P1 allows loads, haul-outs and unit rate tickets, and five kinds of unit rate work',
      [
        project.allowSplitLoads,
        project.workflows,
        project.kindsOfWork.map((allowed) => allowed.kindOfWork.name),
      ],
      [
        true,
        ['LOAD', 'HAUL_OUT', 'UNIT_RATE'],
        ['Hangers', 'Leaners', 'Stumps', 'White Goods', 'Crew time'],
      ],
    );
    const placed = await api.projectContractor.findMany({
      where: { projectId: office.p1 },
      include: { contractor: true, prime: true },
    });
    const contracts = await api.contract.findMany({
      where: { projectId: office.p1 },
      include: { prime: true },
    });
    story.check(
      'AC-01-15 Coastline Haulers LLC, a hauler, is P1’s prime and holds "Coastline, Bayline ROW 2026": a name, its prime and no link to the signed copy yet. No sub is set up',
      [
        placed.map((place) => [
          place.contractor.name,
          place.contractor.kind,
          place.position,
          place.prime === null ? null : place.prime.contractorId,
        ]),
        contracts.map((contract) => [
          contract.id === office.contract,
          contract.name,
          contract.prime.name,
          contract.signedCopyUrl,
        ]),
      ],
      [
        [['Coastline Haulers LLC', 'HAULER', 'PRIME', null]],
        [[true, 'Coastline, Bayline ROW 2026', 'Coastline Haulers LLC', null]],
      ],
    );
    story.check(
      'the database issued each of them the next Monitor ID; nobody typed one',
      [office.danaRow.monitorNumber, office.luis.monitorNumber],
      ['M000001', 'M000002'],
    );
    const luis = office.luis.id;

    story.at(
      at('05:45'),
      'The monitors: Ana Brooks, Kim Nguyen (a temp agency’s), Tariq Patel and Jo Kim',
    );
    // Their Monitor IDs are the example world's, written as given; a real installation's all come
    // from the database, as Dana's and Luis's did.
    const people = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      const agency = await tx.contractor.create({
        data: { name: 'Harbor Staffing', kind: 'MONITORING' },
      });
      const ana = await tx.user.create({
        data: { name: 'Ana Brooks', role: 'MONITOR', monitorNumber: 'M004127' },
      });
      const kim = await tx.user.create({
        data: {
          name: 'Kim Nguyen',
          role: 'MONITOR',
          monitorNumber: 'M004128',
          employerId: agency.id,
          employerNumber: 'HS-0417',
        },
      });
      const tariq = await tx.user.create({
        data: { name: 'Tariq Patel', role: 'MONITOR', monitorNumber: 'M004129' },
      });
      const jo = await tx.user.create({
        data: { name: 'Jo Kim', role: 'MONITOR', monitorNumber: 'M004130' },
      });
      return { ana: ana.id, kim: kim.id, tariq: tariq.id, jo: jo.id };
    });
    const employed = await api.user.findMany({
      where: { role: 'MONITOR' },
      include: { employer: true },
      orderBy: { monitorNumber: 'asc' },
    });
    story.check(
      'AC-01-20 each monitor: their Monitor ID, their employer (a contractor record of the monitoring kind) and its ID for them',
      employed.map((person) => [
        person.name,
        person.monitorNumber,
        person.employer?.name ?? null,
        person.employer?.kind ?? null,
        person.employerNumber,
      ]),
      [
        ['Ana Brooks', 'M004127', null, null, null],
        ['Kim Nguyen', 'M004128', 'Harbor Staffing', 'MONITORING', 'HS-0417'],
        ['Tariq Patel', 'M004129', null, null, null],
        ['Jo Kim', 'M004130', null, null, null],
      ],
    );

    story.at(
      at('05:50'),
      'Three phones are enrolled, once: each its own key, no project, no monitor',
    );
    const phones = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      const enrol = (name: string) =>
        tx.device.create({
          data: { name, publicKey: `story-${name}`, masterPasscodeVersion: 1 },
        });
      return {
        collection: await enrol('P1-COL-1'),
        tdsrTower: await enrol('P1-TWR-TDSR'),
        landfillTower: await enrol('P1-TWR-LF'),
      };
    });
    story.check(
      'each is in service and holds version 1 of the master passcode’s check',
      Object.values(phones).map((phone) => [
        phone.name,
        phone.status,
        phone.masterPasscodeVersion,
        phone.outOfServiceAt,
      ]),
      [
        ['P1-COL-1', 'ACTIVE', 1, null],
        ['P1-TWR-TDSR', 'ACTIVE', 1, null],
        ['P1-TWR-LF', 'ACTIVE', 1, null],
      ],
    );
    const passcode = await api.auditRecord.findMany({ where: { tableName: 'master_passcode' } });
    story.check(
      'the passcode itself is nowhere: the database keeps its slow hash, the audit log not even that',
      passcode.map((record) => [record.source, (record.newValue as { hash: string }).hash]),
      [['SYSTEM', '[kept out of the audit]']],
    );

    story.at(
      at('05:55'),
      'Dana enters two of P1’s unit rate pay items off the contract, with Coastline’s rates',
    );
    // As the golden mission §1 has them: each names its payable type and kind of work, by the EA,
    // one each, photos required; the leaner's band is 6–24 in, measured. Every capture setting is
    // stated: none has a default (ADR-309).
    const payItems = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      const enter = async (
        code: string,
        description: string,
        work: string,
        rate: string,
        band?: { from: string; to: string },
      ) => {
        const payableType = await tx.payableType.findFirstOrThrow({ where: { name: work } });
        const kindOfWork = await tx.kindOfWork.findFirstOrThrow({ where: { name: work } });
        const payItem = await tx.payItem.create({
          data: {
            projectId: office.p1,
            code,
            description,
            payableTypeId: payableType.id,
            kindOfWorkId: kindOfWork.id,
            unit: 'EA',
            bandFrom: band?.from ?? null,
            bandTo: band?.to ?? null,
            countIsAlwaysOne: true,
            gpsRequired: false,
            measurementRequired: band !== undefined,
            decimalsAllowed: false,
            photosRequired: true,
            monitorMayMarkIneligible: false,
            quantityFromCarriedTickets: false,
          },
        });
        await tx.payItemRate.create({
          data: { projectId: office.p1, payItemId: payItem.id, primeId: office.prime, rate },
        });
        return { id: payItem.id, kindOfWorkId: kindOfWork.id };
      };
      return {
        hangers: await enter('HNG-RMV-EA', 'Hanger removal', 'Hangers', '68.00'),
        leaners: await enter('LNR-RMV-EA-24', 'Leaner removal 6–24 in', 'Leaners', '95.00', {
          from: '6',
          to: '24',
        }),
      };
    });
    const entered = await api.payItem.findMany({
      where: { projectId: office.p1 },
      include: { payableType: true, kindOfWork: true, rates: { include: { prime: true } } },
      orderBy: { code: 'asc' },
    });
    story.check(
      'each pay item holds its payable type, kind of work, Unit of Measure, band and one rate per prime',
      entered.map((payItem) => [
        payItem.code,
        payItem.payableType.name,
        payItem.kindOfWork?.name,
        payItem.unit,
        payItem.bandFrom?.toFixed(1) ?? null,
        payItem.bandTo?.toFixed(1) ?? null,
        payItem.rates.map((rate) => [rate.prime.name, rate.rate.toFixed(2)]),
      ]),
      [
        [
          'HNG-RMV-EA',
          'Hangers',
          'Hangers',
          'EA',
          null,
          null,
          [['Coastline Haulers LLC', '68.00']],
        ],
        [
          'LNR-RMV-EA-24',
          'Leaners',
          'Leaners',
          'EA',
          '6.0',
          '24.0',
          [['Coastline Haulers LLC', '95.00']],
        ],
      ],
    );

    story.at(
      at('06:00'),
      'Luis writes Monday’s board: Ana on collections, Kim at the TDSR tower, Jo on unit rate',
    );
    const board = await api.$write({ actorId: luis, source: 'BACK_OFFICE' }, async (tx) => {
      const planned = { workDate: monday, projectId: office.p1, madeById: luis } as const;
      const collections = await tx.assignment.create({
        data: {
          ...planned,
          personId: people.ana,
          fieldEventKinds: ['COLLECTION'],
          deviceId: phones.collection.id,
          origin: 'PLANNED',
        },
      });
      const tower = await tx.assignment.create({
        data: {
          ...planned,
          personId: people.kim,
          fieldEventKinds: ['DISPOSAL'],
          siteId: office.tdsr,
          deviceId: phones.tdsrTower.id,
          origin: 'PLANNED',
        },
      });
      // No phone named: Jo signs in on whichever enrolled phone she picks up.
      const unitRate = await tx.assignment.create({
        data: {
          ...planned,
          personId: people.jo,
          fieldEventKinds: ['UNIT_RATE'],
          origin: 'PLANNED',
        },
      });
      await tx.assignmentPayItem.createMany({
        data: [payItems.hangers, payItems.leaners].map((payItem) => ({
          assignmentId: unitRate.id,
          projectId: office.p1,
          payItemId: payItem.id,
          // A unit rate pay item's own kind of work: no other can be named (C42).
          kindOfWorkId: payItem.kindOfWorkId,
        })),
      });
      return { collections: collections.id, tower: tower.id, unitRate: unitRate.id };
    });
    const joDay = await api.assignment.findUniqueOrThrow({
      where: { id: board.unitRate },
      include: { payItems: { include: { payItem: true }, orderBy: { payItem: { code: 'asc' } } } },
    });
    story.check(
      'Jo’s assignment names the unit rate pay items she does today, each one of P1’s own',
      joDay.payItems.map(({ payItem, archivedAt }) => [
        payItem.code,
        payItem.description,
        archivedAt,
      ]),
      [
        ['HNG-RMV-EA', 'Hanger removal', null],
        ['LNR-RMV-EA-24', 'Leaner removal 6–24 in', null],
      ],
    );

    story.at(
      at('06:30'),
      'At the yard, online, Ana’s phone takes her assignment and a block of load numbers',
    );
    await api.$write(
      { actorId: people.ana, source: 'DEVICE', deviceId: phones.collection.id },
      (tx) =>
        tx.numberBlock.create({
          data: {
            deviceId: phones.collection.id,
            projectId: office.p1,
            series: 'LOAD',
            firstNumber: 101001,
            lastNumber: 102000,
          },
        }),
    );
    const anaPhone = story.phone({
      name: 'P1-COL-1',
      deviceId: phones.collection.id,
      monitorId: people.ana,
      assignmentId: board.collections,
      projectId: office.p1,
      setupVersion: 1,
      timeZone,
    });
    const kimPhone = story.phone({
      name: 'P1-TWR-TDSR',
      deviceId: phones.tdsrTower.id,
      monitorId: people.kim,
      assignmentId: board.tower,
      projectId: office.p1,
      setupVersion: 1,
      timeZone,
    });
    const blocks = await api.numberBlock.findMany({ include: { device: true } });
    story.check(
      'the collection phone holds 101001 to 102000 of P1’s load series; a tower issues nothing',
      blocks.map((block) => [
        block.device.name,
        block.series,
        block.firstNumber,
        block.lastNumber,
        block.lastUsedNumber,
        block.status,
      ]),
      [['P1-COL-1', 'LOAD', 101001, 102000, null, 'ISSUED']],
    );

    story.at(
      at('06:40'),
      'Tariq has no assignment: the master passcode sets P1-TWR-LF up for the Landfill tower',
    );
    // Made on the phone, its id the phone's own; it reaches the server when the phone syncs.
    const unplanned = uuidv7(clock.now());
    await api.$write(
      { actorId: people.tariq, source: 'DEVICE', deviceId: phones.landfillTower.id },
      (tx) =>
        tx.assignment.create({
          data: {
            id: unplanned,
            personId: people.tariq,
            workDate: monday,
            projectId: office.p1,
            fieldEventKinds: ['DISPOSAL', 'HAUL_OUT_DISPOSAL'],
            siteId: office.landfill,
            deviceId: phones.landfillTower.id,
            origin: 'UNPLANNED',
          },
        }),
    );
    const mondays = await api.assignment.findMany({
      where: { workDate: monday, projectId: office.p1 },
      include: { person: true, site: true, device: true, madeBy: true },
    });
    story.check(
      'Monday’s board: three planned by Luis, and Tariq’s, unplanned, marked, with no author',
      mondays
        .map((assignment) => [
          assignment.person.name,
          day(assignment.workDate),
          assignment.fieldEventKinds.join(' + '),
          assignment.site?.name ?? 'no site',
          assignment.device?.name ?? 'no phone',
          assignment.origin,
          assignment.madeBy?.name ?? null,
        ])
        .sort(),
      [
        ['Ana Brooks', '2026-10-12', 'COLLECTION', 'no site', 'P1-COL-1', 'PLANNED', 'Luis Ortega'],
        ['Jo Kim', '2026-10-12', 'UNIT_RATE', 'no site', 'no phone', 'PLANNED', 'Luis Ortega'],
        [
          'Kim Nguyen',
          '2026-10-12',
          'DISPOSAL',
          'Marsh Road TDSR',
          'P1-TWR-TDSR',
          'PLANNED',
          'Luis Ortega',
        ],
        [
          'Tariq Patel',
          '2026-10-12',
          'DISPOSAL + HAUL_OUT_DISPOSAL',
          'Bayline County Landfill',
          'P1-TWR-LF',
          'UNPLANNED',
          null,
        ],
      ],
    );

    story.at(at('08:15'), 'Ana scans the truck’s badge at 14 Heron St, offline');
    const collection = anaPhone.begin('LOAD', 'COLLECTION');
    story.at(
      at('08:40'),
      'Ana completes the collection; her phone shows 101001, the first of its block',
    );
    anaPhone.complete(collection, {
      ticketNumber: '101001',
      endLatitude: '27.94620000',
      endLongitude: '-82.45870000',
    });
    story.at(at('09:05'), 'Kim scans the badge at the Marsh Road TDSR tower, offline');
    const disposal = kimPhone.begin('LOAD', 'DISPOSAL');
    story.at(at('09:25'), 'Kim calls the load 80% and scans 101001 last');
    kimPhone.complete(disposal, {
      ticketNumber: '101001',
      endLatitude: '27.99810000',
      endLongitude: '-82.39120000',
      loadCall: 80,
    });

    story.at(at('17:30'), 'Both phones sync at the yard; Ana’s reports the last number it used');
    story.check(
      'each sends its one field event',
      [await kimPhone.sync(story.intake), await anaPhone.sync(story.intake)],
      [1, 1],
    );
    await api.$write(
      { actorId: people.ana, source: 'DEVICE', deviceId: phones.collection.id },
      (tx) =>
        tx.numberBlock.updateMany({
          where: { deviceId: phones.collection.id, series: 'LOAD' },
          data: { lastUsedNumber: 101001 },
        }),
    );
    const events = await api.fieldEvent.findMany({
      include: { assignment: { include: { person: true, site: true } }, project: true },
      orderBy: { endedAt: 'asc' },
    });
    story.check(
      'each field event carries its assignment (so who, and at which site) and setup version 1',
      events.map((event) => [
        event.kind,
        event.ticketNumber,
        event.assignment.person.name,
        event.assignment.site?.name ?? 'no site',
        event.assignment.origin,
        event.setupVersion,
      ]),
      [
        ['COLLECTION', '101001', 'Ana Brooks', 'no site', 'PLANNED', 1],
        ['DISPOSAL', '101001', 'Kim Nguyen', 'Marsh Road TDSR', 'PLANNED', 1],
      ],
    );
    story.check(
      'each is Monday’s in the project’s time zone, the day its assignment was for',
      events.map((event) => [
        projectTime(event.project.timeZone, event.endedAt),
        event.deviceUtcOffsetMinutes,
        day(event.assignment.workDate),
      ]),
      [
        ['Mon 12 Oct 08:40', -240, '2026-10-12'],
        ['Mon 12 Oct 09:25', -240, '2026-10-12'],
      ],
    );
    const [block] = await api.numberBlock.findMany();
    story.check(
      'the block knows its last used number; the rest stay the phone’s',
      [block?.lastUsedNumber, block?.status],
      [101001, 'ISSUED'],
    );

    story.at(at('18:10'), 'P1-TWR-LF isn’t handed in and can’t be found: Luis marks it lost');
    await api.$write(
      { actorId: luis, source: 'BACK_OFFICE', reason: 'Not handed in at the yard on Monday' },
      (tx) =>
        tx.device.update({
          where: { id: phones.landfillTower.id },
          data: { status: 'LOST', outOfServiceAt: clock.now() },
        }),
    );
    const lost = await api.device.findUniqueOrThrow({ where: { id: phones.landfillTower.id } });
    story.check(
      'it’s out of service from 6:10 pm: what it made later will arrive flagged, never refused',
      [
        lost.status,
        lost.outOfServiceAt === null ? null : projectTime(timeZone, lost.outOfServiceAt),
      ],
      ['LOST', 'Mon 12 Oct 18:10'],
    );

    const names = new Map([
      [dana, 'Dana Reyes'],
      [luis, 'Luis Ortega'],
      [people.ana, 'Ana Brooks'],
      [people.kim, 'Kim Nguyen'],
      [people.tariq, 'Tariq Patel'],
      [people.jo, 'Jo Kim'],
      [phones.collection.id, 'P1-COL-1'],
      [phones.tdsrTower.id, 'P1-TWR-TDSR'],
      [phones.landfillTower.id, 'P1-TWR-LF'],
    ]);
    const who = (id: string | null): string => (id === null ? '-' : (names.get(id) ?? id));
    const audit = await api.auditRecord.findMany({
      where: {
        tableName: {
          in: [
            'assignment',
            'assignment_pay_item',
            'pay_item',
            'pay_item_rate',
            'number_block',
            'device',
          ],
        },
      },
      orderBy: { id: 'asc' },
    });
    story.check(
      'the audit log says who did each: enrolment, the pay items, the board, the phones’ own writes, the lost phone',
      audit.map((record) => [
        record.tableName,
        record.operation,
        who(record.actorId),
        record.source,
        who(record.deviceId),
        record.reason,
      ]),
      [
        ['device', 'INSERT', 'Dana Reyes', 'BACK_OFFICE', '-', null],
        ['device', 'INSERT', 'Dana Reyes', 'BACK_OFFICE', '-', null],
        ['device', 'INSERT', 'Dana Reyes', 'BACK_OFFICE', '-', null],
        ['pay_item', 'INSERT', 'Dana Reyes', 'BACK_OFFICE', '-', null],
        ['pay_item_rate', 'INSERT', 'Dana Reyes', 'BACK_OFFICE', '-', null],
        ['pay_item', 'INSERT', 'Dana Reyes', 'BACK_OFFICE', '-', null],
        ['pay_item_rate', 'INSERT', 'Dana Reyes', 'BACK_OFFICE', '-', null],
        ['assignment', 'INSERT', 'Luis Ortega', 'BACK_OFFICE', '-', null],
        ['assignment', 'INSERT', 'Luis Ortega', 'BACK_OFFICE', '-', null],
        ['assignment', 'INSERT', 'Luis Ortega', 'BACK_OFFICE', '-', null],
        ['assignment_pay_item', 'INSERT', 'Luis Ortega', 'BACK_OFFICE', '-', null],
        ['assignment_pay_item', 'INSERT', 'Luis Ortega', 'BACK_OFFICE', '-', null],
        ['number_block', 'INSERT', 'Ana Brooks', 'DEVICE', 'P1-COL-1', null],
        ['assignment', 'INSERT', 'Tariq Patel', 'DEVICE', 'P1-TWR-LF', null],
        ['number_block', 'UPDATE', 'Ana Brooks', 'DEVICE', 'P1-COL-1', null],
        [
          'device',
          'UPDATE',
          'Luis Ortega',
          'BACK_OFFICE',
          '-',
          'Not handed in at the yard on Monday',
        ],
      ],
    );
  },
};
