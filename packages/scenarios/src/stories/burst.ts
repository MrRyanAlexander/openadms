// The twenty-second story (BACKLOG 2.7.2 part 2; ADR-504, 505; spec/acceptance/05-sync.md AC-05-51
// and its open point 12; spec/parts/05-sync.md, "The load is bursty"): a project's every phone
// syncing at once, at a real project's size, from the office's one address. P1 is set up as the
// stories `p1-field-days`, `setup` and `certification` have it (their phones' records never
// reach the server here), and on Saturday a hundred more of Coastline's trucks are certified.
//
// Thursday 15 October 2026 is a day of P1 at its peak (the agent's default for the burst's size,
// ADR-505): a thousand loads, ten by each of the hundred trucks, watched by fifty collection
// monitors, two trucks each, and called by four towers, two at Marsh Road TDSR and two at
// Bayline County Landfill. Each monitor photographs every field event they record, the towers
// with the depth file beside it. No phone has signal all day.
//
// At six in the evening every phone is at the yard on the office's network and syncs at once,
// through the story's API over HTTPS: every request reaches it from one address. The story's
// clock stands still while the API answers, so the requests fall in one stretch of the rate
// limits, the most they can bite, until a phone answered `429 LIMITED` waits the seconds it is
// told, on the story's clock, and sends again under the same ids. Its wait is everyone's (the
// world's minute passes for every phone), so which phone is told, and how often, is measured,
// never checked: more requests than the office's one address may send in a stretch make one
// wait at least. Then the worker's own loop drains the
// jobs the syncs queued, in more than one run. What it took (the requests, the waits, the time on
// this machine, the runs) is written down by the story as it goes, never checked against a
// figure: the checks are that every record is stored once and none is lost.
//
// Not here: how long the queue's reads take at this size, and whether a run's 200 tickets is right
// (part 3); health (part 4); photographs at their real size (a file here is 4 KiB: it is the
// requests that are counted, not the bytes; Phase 3 measures a phone's real files).
import { type Database } from '@open-adms/db';
import { MapServers, Mileages, Reconciliation } from '@open-adms/worker';

import { projectTime } from '../clock.ts';
import {
  type Completed,
  made,
  type PhoneServer,
  type RecordedEvent,
  scanned,
  type SimulatedDevice,
  ToldToWait,
} from '../device.ts';
import { localMapServers } from '../map-servers.ts';
import type { Story } from '../runner.ts';
import { assigned, firstBlocks, taken } from './board.ts';
import {
  certifyP1,
  loadP1Map,
  p1FieldDaysHeld,
  primaryBox,
  QueueRuns,
  setUpP1Pricing,
} from './p1-office.ts';
import { p1TimeZone as timeZone } from './p1.ts';

const on = (date: string, time: string): string => `2026-10-${date}T${time}:00-04:00`;
const thursday = (time: string): string => on('15', time);

// The burst's size (05-sync's open point 12; ADR-505, an agent default): a day of P1 at its peak.
const trucks = 100;
const loadsATruck = 10;
const trucksAMonitor = 2;
const monitors = trucks / trucksAMonitor;
// Two towers at each site; a truck dumps at one tower all day.
const towers = [
  { phone: 'P1-TWR-TDSR-2', monitor: 'Tower monitor 1', site: 'tdsr' },
  { phone: 'P1-TWR-TDSR-3', monitor: 'Tower monitor 2', site: 'tdsr' },
  { phone: 'P1-TWR-LF-3', monitor: 'Tower monitor 3', site: 'landfill' },
  { phone: 'P1-TWR-LF-4', monitor: 'Tower monitor 4', site: 'landfill' },
] as const;

// Where the trucks collect, in turn: the example world's points on P1 (spec/CONVENTIONS.md §6).
const points = [
  { endLatitude: '39.13850000', endLongitude: '-75.55370000' }, // 14 Heron St, Zone 2
  { endLatitude: '39.15000000', endLongitude: '-75.54000000' }, // 22 Elm St, Zone 2
  { endLatitude: '39.17000000', endLongitude: '-75.69000000' }, // 40 Birch Ln, Zone 1
  { endLatitude: '39.15000000', endLongitude: '-75.52000000' }, // 101002's point, Zone 3
] as const;
// The tower at Marsh Road TDSR; the Landfill's towers record no fix, as Tariq's doesn't.
const tdsrTower = { endLatitude: '39.09030000', endLongitude: '-75.62020000' } as const;

// A truck's cert number: Coastline's burst trucks are 730501 to 730600.
const certOf = (truck: number): string => String(730501 + truck);
const two = (n: number): string => String(n).padStart(2, '0');

// Where a story's phones sync, counted: each sync and each file's part sent, and each one the
// server said to wait for (`ToldToWait`).
function counted(server: PhoneServer) {
  const count = { syncs: 0, parts: 0, toldToWait: 0 };
  const told = async <T>(sent: Promise<T>): Promise<T> => {
    try {
      return await sent;
    } catch (caught) {
      if (caught instanceof ToldToWait) count.toldToWait += 1;
      throw caught;
    }
  };
  const made: PhoneServer = {
    received: (deviceId, sent) => {
      count.syncs += 1;
      return told(server.received(deviceId, sent));
    },
    filePart: (deviceId, part) => {
      count.parts += 1;
      return told(server.filePart(deviceId, part));
    },
  };
  return { server: made, count };
}

// Seconds on this machine since a moment, to a tenth.
const since = (started: number): string => ((performance.now() - started) / 1000).toFixed(1);

export const burst: Story = {
  name: 'burst',
  title:
    'A thousand loads synced at once from the office’s one address: every record and file stored once, none lost; a phone told to wait waits and sends again; the worker drains it in more than one run',
  timeZone,
  start: on('08', '08:00'),

  async run(story) {
    const { api, worker, clock } = story;
    const office = await p1FieldDaysHeld(story);
    const { luis, p1 } = office;
    const say = (what: string): void => {
      story.at(clock.now().toISOString(), what);
    };

    story.at(on('08', '08:40'), 'Thursday: Dana loads P1’s map and enters its pay items and rules');
    await loadP1Map(story, office);
    await setUpP1Pricing(story, office);
    story.at(
      on('10', '09:10'),
      `Saturday: Sam Grant certifies P1’s three containers and two crews, then ${String(trucks)} more of Coastline’s trucks`,
    );
    const certify = await certifyP1(story, office);
    const trailer = (
      await api.vehicleType.findFirstOrThrow({ where: { name: 'Hydraulic Dump Trailer' } })
    ).id;
    for (let truck = 0; truck < trucks; truck += 1) {
      // From 11:00, one every two minutes: a 53 CY dump trailer each.
      const at = new Date(Date.parse(on('10', '11:00')) + truck * 120_000);
      await certify(projectTime(timeZone, at).slice(-5), {
        certNumber: certOf(truck),
        vehicleTypeId: trailer,
        boxes: [primaryBox(360, 96, 72)],
      });
    }

    // ------------------------------------------------------------------------------------------
    story.at(
      thursday('06:00'),
      `Thursday: Luis writes the board, ${String(monitors)} collection monitors and four towers; each phone is enrolled, its monitor created on it`,
    );
    const site = { tdsr: office.tdsr, landfill: office.landfill };
    const crew = [
      ...Array.from({ length: monitors }, (_, n) => ({
        phone: `P1-COL-${two(n + 11)}`,
        monitor: `Collection monitor ${two(n + 1)}`,
        kinds: ['COLLECTION'] as const,
        siteId: null,
      })),
      ...towers.map((tower) => ({
        phone: tower.phone,
        monitor: tower.monitor,
        kinds: ['DISPOSAL'] as const,
        siteId: site[tower.site],
      })),
    ];
    const phones: SimulatedDevice[] = [];
    for (const planned of crew) {
      const { id: deviceId } = await story.enrolled(planned.phone);
      const monitor = await story.monitor(planned.monitor, deviceId);
      const assignment = await assigned(api, clock, luis, {
        workDate: '2026-10-15',
        projectId: p1,
        personId: monitor.id,
        fieldEventKinds: [...planned.kinds],
        formDocumentTypes: [],
        siteId: planned.siteId,
        deviceId,
        payItemIds: [],
      });
      if (planned.kinds[0] === 'COLLECTION') {
        await firstBlocks(story, deviceId, timeZone, p1, ['LOAD']);
      }
      const assignmentId = await taken(story, monitor, deviceId);
      if (assignmentId !== assignment) throw new Error(`${planned.phone} took another assignment.`);
      phones.push(
        story.phone({
          name: planned.phone,
          deviceId,
          monitorId: monitor.id,
          assignmentId,
          projectId: p1,
          ...(planned.siteId === null ? {} : { siteId: planned.siteId }),
          lists: await story.lists.held({ assignmentId, deviceId }),
          timeZone,
        }),
      );
    }
    const collectors = phones.slice(0, monitors);
    const towerPhones = phones.slice(monitors);

    // ------------------------------------------------------------------------------------------
    // The day, offline: in each hour from 07:00 each monitor's first truck is loaded on the hour
    // and dumped at twenty past, the second loaded at half past and dumped at ten to. Every
    // field event is photographed as it is completed; at a tower, with the depth file beside it.
    const done = (completed: Completed): RecordedEvent => {
      if (!completed.saved) throw new Error(`Not saved: ${completed.reason}`);
      return completed.event;
    };
    story.at(thursday('07:00'), 'The day: every phone offline, every field event photographed');
    const start = Date.parse(thursday('07:00'));
    const at = (minutes: number): void => {
      clock.set(new Date(start + minutes * 60_000).toISOString());
    };
    for (let hour = 0; hour < loadsATruck; hour += 1) {
      for (let second = 0; second < trucksAMonitor; second += 1) {
        at(hour * 60 + second * 30);
        const loaded: { truck: number; number: string }[] = [];
        collectors.forEach((phone, n) => {
          const truck = n * trucksAMonitor + second;
          const point = points[truck % points.length] ?? points[0];
          const id = phone.begin('LOAD', 'COLLECTION', certOf(truck));
          const event = done(
            phone.complete(id, { number: made, debrisType: 'Vegetative', ...point }),
          );
          phone.photograph({
            of: { kind: 'FIELD_EVENT', id: event.id },
            latitude: point.endLatitude,
            longitude: point.endLongitude,
          });
          loaded.push({ truck, number: event.ticketNumber });
        });
        at(hour * 60 + second * 30 + 20);
        for (const { truck, number } of loaded) {
          const tower = towerPhones[truck % towerPhones.length];
          if (tower === undefined) throw new Error('No tower.');
          const id = tower.begin('LOAD', 'DISPOSAL', certOf(truck));
          const event = done(
            tower.complete(id, {
              number: scanned(number),
              debrisType: 'Vegetative',
              loadCall: 70 + 5 * ((truck + hour) % 4),
              ...(tower.setup.siteId === office.tdsr ? tdsrTower : {}),
            }),
          );
          tower.photograph({ of: { kind: 'FIELD_EVENT', id: event.id }, depthFile: true });
        }
      }
    }
    const held = {
      records: phones.reduce((sum, phone) => sum + phone.waitingRecords.length, 0),
      photos: phones.reduce((sum, phone) => sum + phone.waitingPhotos.length, 0),
      files: phones.reduce((sum, phone) => sum + phone.holdsFiles.length, 0),
    };
    story.check(
      `AC-05-51 by six the phones hold the day: ${String(trucks * loadsATruck)} loads’ collections and disposals, each photographed, the towers’ with their depth files`,
      held,
      {
        records: 2 * trucks * loadsATruck,
        photos: 2 * trucks * loadsATruck,
        files: 3 * trucks * loadsATruck,
      },
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      thursday('18:00'),
      `At the yard, on the office’s network: all ${String(phones.length)} phones sync at once`,
    );
    const yard = counted(story.server);
    const fieldEventsBefore = await api.fieldEvent.count({ where: { projectId: p1 } });
    const photosBefore = await api.photo.count({ where: { projectId: p1 } });
    const keptBefore = story.media.keys.length;
    const syncing = performance.now();
    // Every phone goes on to the end of its own sync, whatever another's meets, before the story
    // reads what came back: the first refusal then stops it, with nothing left sending.
    const syncs = await Promise.allSettled(phones.map((phone) => phone.sync(yard.server)));
    const answered = syncs.map((each) => {
      if (each.status === 'rejected') throw each.reason;
      return each.value;
    });
    const seconds = since(syncing);
    const waits = phones.flatMap((phone) => phone.toldToWait);
    say(
      `It took ${String(yard.count.syncs)} syncs and ${String(yard.count.parts)} files’ parts ` +
        `(${seconds} s on this machine); the server said to wait ${String(waits.length)} times ` +
        `(${[...new Set(waits)].sort((a, b) => a - b).join(', ') || 'none'} s), and the yard’s ` +
        `clock stood at ${projectTime(timeZone, clock.now())} when the last phone was done`,
    );

    const told = phones.flatMap((phone) => phone.answers);
    const stored = (ids: readonly string[]) => new Set(ids).size;
    story.check(
      'AC-05-51 every record and photograph’s record of the burst was answered saved, once each; no phone shows anything not saved',
      [
        answered.reduce((sum, each) => sum + each, 0),
        told.filter(({ answer }) => answer.answer === 'SAVED').length,
        told.length,
        phones.flatMap((phone) => phone.notSaved).length,
      ],
      [4 * trucks * loadsATruck, 4 * trucks * loadsATruck, 4 * trucks * loadsATruck, 0],
    );
    story.check(
      'AC-05-51 none lost: no phone holds a record, a photograph’s record or a file the server hasn’t said it stored',
      phones.map((phone) => phone.holds.length + phone.holdsFiles.length).filter((n) => n > 0),
      [],
    );
    const fieldEvents = await api.fieldEvent.findMany({
      where: { projectId: p1 },
      select: { id: true },
    });
    const photos = await api.photo.findMany({ where: { projectId: p1 }, select: { id: true } });
    story.check(
      'AC-05-51 each stored once: the server holds each field event, photograph and file of the burst once, nothing quarantined or held for a person',
      [
        fieldEvents.length - fieldEventsBefore,
        stored(fieldEvents.map(({ id }) => id)) - fieldEventsBefore,
        photos.length - photosBefore,
        story.media.keys.length - keptBefore,
        stored(story.media.keys) - keptBefore,
        await api.quarantinedRecord.count(),
        await api.heldRecord.count(),
      ],
      [
        2 * trucks * loadsATruck,
        2 * trucks * loadsATruck,
        2 * trucks * loadsATruck,
        3 * trucks * loadsATruck,
        3 * trucks * loadsATruck,
        0,
        0,
      ],
    );
    story.check(
      'ADR-416, 505 no limit dropped work: the burst is more requests than the office’s one address may send in a stretch, so a phone was told to wait (429 LIMITED); each phone told waited the seconds it was told, on the story’s clock, and sent the same again, and it was all answered saved above',
      [
        waits.length > 0,
        yard.count.toldToWait === waits.length,
        clock.now().getTime() >= Date.parse(thursday('18:00')) + Math.min(...waits) * 1000,
      ],
      [true, true, true],
    );

    // ------------------------------------------------------------------------------------------
    story.at(thursday('18:30'), 'The worker’s loop takes up every job the burst queued');
    const reconciliation = new Reconciliation(
      worker,
      clock,
      {
        crewItemHoursLimit: story.policy.crewDayHours,
        deviceClockOffLimitMinutes: story.policy.deviceClockOffLimitMinutes,
        longestRunMs: 600_000,
      },
      new Mileages(new MapServers(localMapServers())),
    );
    const queue = new QueueRuns(story, reconciliation);
    const jobs = (await queue.waiting(p1)).length;
    const draining = performance.now();
    const runs = await queue.settle(p1);
    say(
      `It took ${String(runs)} runs of at most ${String(story.policy.jobTicketsAtMost)} tickets ` +
        `to work the ${String(jobs)} jobs waiting (${since(draining)} s on this machine)`,
    );
    const burstLoads = await loadsOf(worker, p1, '2026-10-15');
    story.check(
      'AC-05-51 the worker’s own loop drained the burst in more than one run, and every load of the day stands concluded: none still waiting for its other field event, each with its completed load',
      [runs > 1, burstLoads.pending, burstLoads.completed],
      [true, 0, trucks * loadsATruck],
    );
  },
};

// The day's loads on the project as they stand: how many still wait for a field event, and how
// many have their completed load.
async function loadsOf(
  db: Database,
  projectId: string,
  day: string,
): Promise<{ readonly pending: number; readonly completed: number }> {
  const from = new Date(`${day}T00:00:00-04:00`);
  const to = new Date(from.getTime() + 86_400_000);
  const events = await db.fieldEvent.findMany({
    where: { projectId, workflow: 'LOAD', endedAt: { gte: from, lt: to } },
    select: { ticketNumber: true },
  });
  const numbers = [...new Set(events.map(({ ticketNumber }) => ticketNumber))];
  const completed = await db.completedLoad.count({
    where: { projectId, ticketNumber: { in: numbers } },
  });
  return { pending: numbers.length - completed, completed };
}
