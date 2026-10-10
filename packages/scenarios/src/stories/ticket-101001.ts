// The first story (BACKLOG 0.4.1; ADR-275), deliberately trivial: the golden mission's first load
// (spec/golden/MISSION.md §2), up to the point this build reaches. Ana Brooks collects 101001 at
// 14 Heron St; Kim Nguyen calls it 80% at the Marsh Road TDSR tower. Both phones are offline; the
// tower's syncs first. The engine that pairs them, prices the load and completes it is Phase 1's, so
// the story ends with both field events received, audited and PENDING. What it proves is the
// harness: its own database, the story's clock, offline phones, out-of-order sync, the audit trail.
// Each phone holds its monitor's assignment for the day (ADR-240); the day's dispatch itself is the
// next story's (dispatch-monday).
import { NumberAllocator } from '@open-adms/api';

import { projectTime } from '../clock.ts';
import { made, scanned } from '../device.ts';
import { uuidv7, uuidv7Time } from '../ids.ts';
import { phoneLists } from '../phone-lists.ts';
import type { Story } from '../runner.ts';
import { assigned, taken } from './board.ts';
import { p1TimeZone as timeZone, setUpP1, setUpP1Sites } from './p1.ts';

const at = (time: string): string => `2026-10-12T${time}:00-04:00`;

export const ticket101001: Story = {
  name: 'ticket-101001',
  title: 'a load recorded offline by two monitors, synced out of order',
  timeZone,
  start: at('06:30'),

  async run(story) {
    const { api, worker, clock } = story;

    story.at(
      at('06:30'),
      'Dana Reyes sets up Bayline County, Hurricane Delphine and P1, its prime and contract, its TDSR, Ana Brooks, Kim Nguyen, their two phones and their assignments',
    );
    // The first user is written with itself as the actor (ADR-270 (4)).
    // The two phones are enrolled as real ones are: under the master passcode, each with a key
    // of its own (ADR-439, 440).
    const collectionPhone = await story.enrolled('P1-COL-1');
    const towerPhone = await story.enrolled('P1-TWR-TDSR');
    const dana = uuidv7(clock.now());
    const entered = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
      const p1 = await setUpP1(tx, story.policy);
      const { tdsr } = await setUpP1Sites(tx, p1.project);
      return { p1: p1.project, collectionPhone, towerPhone, tdsr };
    });
    // The two monitors are created as real ones are: on a phone, online, under the master
    // passcode; the database issues each their Monitor ID (ADR-442).
    const ana = await story.monitor('Ana Brooks', collectionPhone.id);
    const kim = await story.monitor('Kim Nguyen', towerPhone.id);
    // Monday's board, written by Dana: Ana on collections, Kim at the Marsh Road tower.
    const monday = { workDate: '2026-10-12', projectId: entered.p1 } as const;
    const setup = {
      ...entered,
      ana: ana.id,
      kim: kim.id,
      collections: await assigned(api, clock, dana, {
        ...monday,
        personId: ana.id,
        fieldEventKinds: ['COLLECTION'],
        deviceId: entered.collectionPhone.id,
      }),
      tower: await assigned(api, clock, dana, {
        ...monday,
        personId: kim.id,
        fieldEventKinds: ['DISPOSAL'],
        siteId: entered.tdsr,
        deviceId: entered.towerPhone.id,
      }),
    };
    // At the yard, online, Ana's phone takes her assignment and its first block of load numbers:
    // the collection makes the ticket's number (ADR-065, 209).
    const block = await new NumberAllocator(api, clock, story.policy).topUp(
      { person: setup.ana, deviceId: setup.collectionPhone.id },
      { projectId: setup.p1, series: 'LOAD', lastUsedNumber: null },
    );
    if (!block.saved) throw new Error(block.refusal.message);
    // Each signs in with Monitor ID and password, and the phone takes their assignment for the
    // day: nobody enters the master passcode and nobody picks a project (AC-02-35; ADR-444).
    const anaPhone = story.phone({
      name: 'P1-COL-1',
      deviceId: setup.collectionPhone.id,
      monitorId: setup.ana,
      assignmentId: await taken(story, ana, setup.collectionPhone.id),
      projectId: setup.p1,
      setupVersion: 1,
      lists: await phoneLists(api, {
        assignmentId: setup.collections,
        deviceId: setup.collectionPhone.id,
      }),
      timeZone,
    });
    const kimPhone = story.phone({
      name: 'P1-TWR-TDSR',
      deviceId: setup.towerPhone.id,
      monitorId: setup.kim,
      assignmentId: await taken(story, kim, setup.towerPhone.id),
      projectId: setup.p1,
      siteId: setup.tdsr,
      setupVersion: 1,
      timeZone,
    });

    story.at(at('08:15'), 'Ana scans the truck’s badge at 14 Heron St, offline');
    const collection = anaPhone.begin('LOAD', 'COLLECTION', '730415');
    story.at(
      at('08:40'),
      'Ana completes the collection; her phone shows 101001, the first of its block, last',
    );
    anaPhone.complete(collection, {
      number: made,
      endLatitude: '39.13850000',
      endLongitude: '-75.55370000',
    });

    story.at(at('09:05'), 'Kim scans the badge at the Marsh Road TDSR tower, offline');
    const disposal = kimPhone.begin('LOAD', 'DISPOSAL', '730415');
    story.at(at('09:25'), 'Kim calls the load 80% and scans 101001 last');
    kimPhone.complete(disposal, {
      number: scanned('101001'),
      endLatitude: '39.09030000',
      endLongitude: '-75.62020000',
      loadCall: 80,
    });
    story.check(
      'each field event waits on its phone',
      [anaPhone.waiting.length, kimPhone.waiting.length],
      [1, 1],
    );
    story.check('the server has none yet', await api.fieldEvent.count(), 0);

    story.at(at('12:10'), 'Kim’s phone finds signal at lunch and syncs');
    story.check('it sends one field event and keeps none', await kimPhone.sync(story.intake), 1);
    story.check('nothing waits on it', kimPhone.waiting.length, 0);
    const first = await api.fieldEvent.findMany();
    story.check(
      'the server holds the disposal alone, PENDING',
      first.map((event) => [event.kind, event.ticketNumber, event.status]),
      [['DISPOSAL', '101001', 'PENDING']],
    );

    story.at(at('17:30'), 'Ana’s phone syncs back at the yard');
    story.check('it sends one field event', await anaPhone.sync(story.intake), 1);
    const received = await api.fieldEvent.findMany({ orderBy: { receivedAt: 'asc' } });
    story.check(
      'in the order received: the disposal, then the collection',
      received.map((event) => [event.kind, projectTime(timeZone, event.receivedAt)]),
      [
        ['DISPOSAL', 'Mon 12 Oct 12:10'],
        ['COLLECTION', 'Mon 12 Oct 17:30'],
      ],
    );
    const inFieldOrder = await api.fieldEvent.findMany({ orderBy: { endedAt: 'asc' } });
    story.check(
      'in field order: the collection ended first, then the disposal, on one number',
      inFieldOrder.map((event) => [
        event.kind,
        event.ticketNumber,
        projectTime(timeZone, event.endedAt),
      ]),
      [
        ['COLLECTION', '101001', 'Mon 12 Oct 08:40'],
        ['DISPOSAL', '101001', 'Mon 12 Oct 09:25'],
      ],
    );
    story.check(
      'the load call is the tower’s: 80 on the disposal, none on the collection',
      inFieldOrder.map((event) => event.loadCall),
      [null, 80],
    );
    story.check(
      'each id was made on its phone when the badge was scanned; each offset is the phone’s (-4 h)',
      inFieldOrder.map((event) => [
        uuidv7Time(event.id).getTime() === event.startedAt.getTime(),
        projectTime(timeZone, event.startedAt),
        event.deviceUtcOffsetMinutes,
      ]),
      [
        [true, 'Mon 12 Oct 08:15', -240],
        [true, 'Mon 12 Oct 09:05', -240],
      ],
    );
    story.check(
      'each says it came from a phone, with its monitor’s assignment, the setup version its phone held, the badge as scanned, and the tower’s its site',
      inFieldOrder.map((event) => [
        event.source,
        event.assignmentId === setup.collections ? 'Ana’s' : 'Kim’s',
        event.setupVersion,
        event.certNumber,
        event.siteId === setup.tdsr ? 'Marsh Road TDSR' : (event.siteId ?? 'no site'),
      ]),
      [
        ['DEVICE', 'Ana’s', 1, '730415', 'no site'],
        ['DEVICE', 'Kim’s', 1, '730415', 'Marsh Road TDSR'],
      ],
    );
    story.check(
      'both stay PENDING and no completed load exists: pairing is the engine’s (Phase 1)',
      [inFieldOrder.map((event) => event.status), await api.completedLoad.count()],
      [['PENDING', 'PENDING'], 0],
    );
    story.check('the worker’s login sees both', await worker.fieldEvent.count(), 2);

    const names = new Map([
      [dana, 'Dana Reyes'],
      [setup.ana, 'Ana Brooks'],
      [setup.kim, 'Kim Nguyen'],
      [setup.collectionPhone.id, 'P1-COL-1'],
      [setup.towerPhone.id, 'P1-TWR-TDSR'],
    ]);
    const audit = await api.auditRecord.findMany({ orderBy: { id: 'asc' } });
    const who = (id: string | null): string => (id === null ? '-' : (names.get(id) ?? id));
    story.check(
      'each sync is audited as its monitor, from their phone, in the order received',
      audit
        .filter((record) => record.tableName === 'field_event')
        .map((record) => [
          record.operation,
          who(record.actorId),
          record.source,
          who(record.deviceId),
        ]),
      [
        ['INSERT', 'Kim Nguyen', 'DEVICE', 'P1-TWR-TDSR'],
        ['INSERT', 'Ana Brooks', 'DEVICE', 'P1-COL-1'],
      ],
    );
    // The seed's rows come first, every one as the system actor: itself, the master passcode's own
    // actor (ADR-438), the device key's (ADR-440), the master passcode, then what the firm's lists
    // start with (ADR-302; told value by value in packages/db's tests).
    const afterSeed = audit.findIndex((record) => record.source !== 'SYSTEM');
    const seeded = audit.slice(0, afterSeed).map((record) => record.tableName);
    story.check(
      'the audit log opens with the seed: the system actor, the master passcode’s actor, the device key’s actor, the master passcode, the 94 values the firm’s 15 seeded lists start with',
      [seeded.slice(0, 4), seeded.length - 4, new Set(seeded.slice(4)).size],
      [['user', 'user', 'user', 'master_passcode'], 94, 15],
    );
    story.check(
      'and then holds exactly the two phones’ enrolments under the master passcode (each the phone and the security event of the passcode’s use), Dana’s twenty setup rows (the client, the declaration event, P1, its five number series and its five kinds of unit rate work, Coastline, its place as P1’s prime and its contract among them), the two monitors created on a phone under the master passcode (each the person, their sign-in record and the security event of the passcode’s use), the board’s two assignments, the block Ana’s phone took (the series moved on, the block cut), the two sign-ins (each a security event and a session) and the two syncs',
      audit.slice(afterSeed).map((record) => [record.tableName, record.source]),
      [
        ['device', 'DEVICE'],
        ['security_event', 'DEVICE'],
        ['device', 'DEVICE'],
        ['security_event', 'DEVICE'],
        ['user', 'BACK_OFFICE'],
        ['client', 'BACK_OFFICE'],
        ['declaration_event', 'BACK_OFFICE'],
        ['project', 'BACK_OFFICE'],
        ['project_number_series', 'BACK_OFFICE'],
        ['project_number_series', 'BACK_OFFICE'],
        ['project_number_series', 'BACK_OFFICE'],
        ['project_number_series', 'BACK_OFFICE'],
        ['project_number_series', 'BACK_OFFICE'],
        ['project_kind_of_work', 'BACK_OFFICE'],
        ['project_kind_of_work', 'BACK_OFFICE'],
        ['project_kind_of_work', 'BACK_OFFICE'],
        ['project_kind_of_work', 'BACK_OFFICE'],
        ['project_kind_of_work', 'BACK_OFFICE'],
        ['contractor', 'BACK_OFFICE'],
        ['project_contractor', 'BACK_OFFICE'],
        ['contract', 'BACK_OFFICE'],
        ['disposal_site', 'BACK_OFFICE'],
        ['disposal_site', 'BACK_OFFICE'],
        ['user', 'DEVICE'],
        ['user_credential', 'DEVICE'],
        ['security_event', 'DEVICE'],
        ['user', 'DEVICE'],
        ['user_credential', 'DEVICE'],
        ['security_event', 'DEVICE'],
        ['assignment', 'BACK_OFFICE'],
        ['assignment', 'BACK_OFFICE'],
        ['project_number_series', 'DEVICE'],
        ['number_block', 'DEVICE'],
        ['security_event', 'DEVICE'],
        ['session', 'DEVICE'],
        ['security_event', 'DEVICE'],
        ['session', 'DEVICE'],
        ['field_event', 'DEVICE'],
        ['field_event', 'DEVICE'],
      ],
    );
  },
};
