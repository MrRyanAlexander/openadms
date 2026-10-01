// The first story (BACKLOG 0.4.1; ADR-275), deliberately trivial: the golden mission's first load
// (spec/golden/MISSION.md §2), up to the point this build reaches. Ana Brooks collects 101001 at
// 14 Heron St; Kim Nguyen calls it 80% at the Marsh Road TDSR tower. Both phones are offline; the
// tower's syncs first. The engine that pairs them, prices the load and completes it is Phase 1's, so
// the story ends with both field events received, audited and PENDING. What it proves is the
// harness: its own database, the story's clock, offline phones, out-of-order sync, the audit trail.
// Each phone holds its monitor's assignment for the day (ADR-240); the day's dispatch itself is the
// next story's (dispatch-monday).
import { projectTime } from '../clock.ts';
import { uuidv7, uuidv7Time } from '../ids.ts';
import type { Story } from '../runner.ts';

const timeZone = 'America/New_York';
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
      'Dana Reyes sets up P1, its TDSR, Ana Brooks, Kim Nguyen, their two phones and their assignments',
    );
    // The first user is written with itself as the actor (ADR-270 (4)).
    const dana = uuidv7(clock.now());
    const setup = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
      const p1 = await tx.project.create({
        data: { name: 'Bayline County ROW, Hurricane Delphine', timeZone },
      });
      const ana = await tx.user.create({
        data: { name: 'Ana Brooks', role: 'MONITOR', monitorNumber: 'M004127' },
      });
      const kim = await tx.user.create({
        data: { name: 'Kim Nguyen', role: 'MONITOR', monitorNumber: 'M004128' },
      });
      const collectionPhone = await tx.device.create({
        data: { name: 'P1-COL-1', publicKey: 'story-P1-COL-1', masterPasscodeVersion: 1 },
      });
      const towerPhone = await tx.device.create({
        data: { name: 'P1-TWR-TDSR', publicKey: 'story-P1-TWR-TDSR', masterPasscodeVersion: 1 },
      });
      const tdsr = await tx.disposalSite.create({
        data: { projectId: p1.id, name: 'Marsh Road TDSR' },
      });
      const monday = { workDate: new Date('2026-10-12'), projectId: p1.id, madeById: dana };
      const collections = await tx.assignment.create({
        data: {
          ...monday,
          personId: ana.id,
          fieldEventKinds: ['COLLECTION'],
          deviceId: collectionPhone.id,
          origin: 'PLANNED',
        },
      });
      const tower = await tx.assignment.create({
        data: {
          ...monday,
          personId: kim.id,
          fieldEventKinds: ['DISPOSAL'],
          siteId: tdsr.id,
          deviceId: towerPhone.id,
          origin: 'PLANNED',
        },
      });
      return {
        p1: p1.id,
        ana: ana.id,
        kim: kim.id,
        collectionPhone,
        towerPhone,
        collections: collections.id,
        tower: tower.id,
      };
    });
    const anaPhone = story.phone({
      name: 'P1-COL-1',
      deviceId: setup.collectionPhone.id,
      monitorId: setup.ana,
      assignmentId: setup.collections,
      projectId: setup.p1,
      setupVersion: 1,
      timeZone,
    });
    const kimPhone = story.phone({
      name: 'P1-TWR-TDSR',
      deviceId: setup.towerPhone.id,
      monitorId: setup.kim,
      assignmentId: setup.tower,
      projectId: setup.p1,
      setupVersion: 1,
      timeZone,
    });

    story.at(at('08:15'), 'Ana scans the truck’s badge at 14 Heron St, offline');
    const collection = anaPhone.begin('LOAD', 'COLLECTION');
    story.at(at('08:40'), 'Ana completes the collection, number 101001 last');
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
      'each carries its monitor’s assignment and the setup version its phone held',
      inFieldOrder.map((event) => [
        event.assignmentId === setup.collections ? 'Ana’s' : 'Kim’s',
        event.setupVersion,
      ]),
      [
        ['Ana’s', 1],
        ['Kim’s', 1],
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
    story.check(
      'the whole audit log: the seed’s system actor and master passcode, Dana’s nine setup rows, the two syncs',
      audit.map((record) => [record.tableName, record.source]),
      [
        ['user', 'SYSTEM'],
        ['master_passcode', 'SYSTEM'],
        ['user', 'BACK_OFFICE'],
        ['project', 'BACK_OFFICE'],
        ['user', 'BACK_OFFICE'],
        ['user', 'BACK_OFFICE'],
        ['device', 'BACK_OFFICE'],
        ['device', 'BACK_OFFICE'],
        ['disposal_site', 'BACK_OFFICE'],
        ['assignment', 'BACK_OFFICE'],
        ['assignment', 'BACK_OFFICE'],
        ['field_event', 'DEVICE'],
        ['field_event', 'DEVICE'],
      ],
    );
  },
};
