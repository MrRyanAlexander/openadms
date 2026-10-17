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
// Then the queue at that size (part 3, ADR-506): the jobs the syncs queued and the runs they
// took, the same jobs taken up again on paper at other sizes, the neighbour read a sync's field
// event asks, a setup change's read of every ticket, and a run timed by its size. All of it
// written down, never checked: a time is this machine's, not a threshold.
//
// Not here: health (part 4); photographs at their real size (a file here is 4 KiB: it is the
// requests that are counted, not the bytes; Phase 3 measures a phone's real files).
import {
  MapFileReader,
  OfflineChecks,
  ProjectSetup,
  SetupVersions,
  WorkQueue,
} from '@open-adms/api';
import { ReconciliationJobs, type Database } from '@open-adms/db';
import { MapServers, Mileages, Reconciliation, type RunOutcome } from '@open-adms/worker';

import { projectTime } from '../clock.ts';
import { uuidv7 } from '../ids.ts';
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
import { p1Zones } from './setup.ts';

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

// Where a story's phones sync, counted: each sync and each file's part sent, each phone's own,
// and each one the server said to wait for (`ToldToWait`), and of those how many because the
// database was busy (`503 BUSY`, ADR-524).
function counted(server: PhoneServer) {
  const count = { syncs: 0, parts: 0, toldToWait: 0, busy: 0 };
  const byPhone = new Map<string, { syncs: number; parts: number }>();
  const ofPhone = (deviceId: string) => {
    const held = byPhone.get(deviceId) ?? { syncs: 0, parts: 0 };
    byPhone.set(deviceId, held);
    return held;
  };
  const told = async <T>(sent: Promise<T>): Promise<T> => {
    try {
      return await sent;
    } catch (caught) {
      if (caught instanceof ToldToWait) {
        count.toldToWait += 1;
        if (caught.code === 'BUSY') count.busy += 1;
      }
      throw caught;
    }
  };
  const made: PhoneServer = {
    received: (deviceId, sent) => {
      count.syncs += 1;
      ofPhone(deviceId).syncs += 1;
      return told(server.received(deviceId, sent));
    },
    filePart: (deviceId, part) => {
      count.parts += 1;
      ofPhone(deviceId).parts += 1;
      return told(server.filePart(deviceId, part));
    },
  };
  return { server: made, count, byPhone };
}

// Seconds on this machine since a moment, to a tenth; milliseconds, to a tenth.
const since = (started: number): string => ((performance.now() - started) / 1000).toFixed(1);
const ms = (each: number): string => each.toFixed(1);

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

    // What the burst asked of the API's pool, and of a phone's own limits (BACKLOG 2.8.2; C141,
    // C155, C162 (c); ADR-524): written down, never checked.
    const waited = [...story.apiPool.waitedMs()].sort((a, b) => a - b);
    say(
      `The API's pool of ${String(story.apiPool.connections)} connections: ${String(waited.length)} ` +
        `pieces of work; half waited ${ms(middleOf(waited))} ms or less for a connection, the ` +
        `slowest ${ms(waited.at(-1) ?? 0)} ms, ${String(waited.filter((each) => each > 100).length)} ` +
        `over 100 ms; told the database was busy ${String(yard.count.busy)} times`,
    );
    const mostOf = (what: 'syncs' | 'parts'): number =>
      Math.max(...[...yard.byPhone.values()].map((phone) => phone[what]));
    say(
      `The most one phone sent in the burst's minute: ${String(mostOf('syncs'))} syncs and ` +
        `${String(mostOf('parts'))} files' parts (a phone may send ` +
        `${String(story.policy.rateLimitRequestsPerPhone)} requests and ` +
        `${String(story.policy.rateLimitFilePartsPerPhone)} parts a minute)`,
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
      'ADR-416, 505, 524 no limit dropped work: the burst is more requests than the office’s one address may send in a stretch, so a phone was told to wait (429 LIMITED, or 503 BUSY where the database was); each phone told waited the seconds it was told, on the story’s clock, and sent the same again, and it was all answered saved above',
      [
        waits.length > 0,
        yard.count.toldToWait === waits.length,
        clock.now().getTime() >= Date.parse(thursday('18:00')) + Math.min(...waits) * 1000,
      ],
      [true, true, true],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      thursday('18:30'),
      'Two workers, as two worker containers would, take up every job the burst queued at once',
    );
    const reconciling = (db: Database) =>
      new Reconciliation(
        db,
        clock,
        {
          crewItemHoursLimit: story.policy.crewDayHours,
          deviceClockOffLimitMinutes: story.policy.deviceClockOffLimitMinutes,
          longestRunMs: 600_000,
        },
        new Mileages(new MapServers(localMapServers())),
      );
    const queue = new QueueRuns(story, reconciling(worker));
    // The second worker's own pool, as its own container's would be (C95).
    const secondWorker = new QueueRuns(story, reconciling(story.openWorker()));
    const atMost = story.policy.jobTicketsAtMost;
    const waiting = (await queue.waiting(p1)).map((job) => job.tickets);
    const sizes = waiting.map((tickets) => tickets.length).sort((a, b) => a - b);
    say(
      `The syncs queued ${String(waiting.length)} jobs naming ${String(new Set(waiting.flat()).size)} ` +
        `tickets: from ${String(sizes[0] ?? 0)} to ${String(sizes.at(-1) ?? 0)} tickets a job, ` +
        `half of them ${String(middleOf(sizes))} or fewer; the API’s cut at ${String(atMost)} ` +
        `bit on none of them`,
    );
    const draining = performance.now();
    const [first, second] = await twoAtOnce(api, [queue, secondWorker]);
    if (first === undefined || second === undefined) throw new Error('A worker made no answer.');
    const drained = [...first.runs, ...second.runs];
    const runs = drained.length;
    say(
      `It took ${String(runs)} runs of at most ${String(atMost)} tickets to work the ` +
        `${String(waiting.length)} jobs waiting (${since(draining)} s on this machine), ` +
        `${String(workedIn(drained))} tickets worked in all: the first worker made ` +
        `${String(first.runs.length)} runs, the second ${String(second.runs.length)}; their ` +
        `passes found nothing to take up ${String(first.idle + second.idle)} times while the ` +
        `other's run was under way`,
    );
    // The same jobs taken up again on paper at other sizes, by the worker's rule (the oldest
    // first, a job that doesn't fit ends a run's take of a ticket more, a job whose tickets the
    // run already works taken up too, ADR-506); and, beside it, as the rule was before, when a
    // job that didn't fit ended the take whole. A reading, never the rule.
    say(
      `Read again from the same jobs, runs and tickets worked at each size: ` +
        [50, 100, 200, 400, 1000]
          .map((size) => {
            const now = takenUp(waiting, size, true);
            const before = takenUp(waiting, size, false);
            return (
              `${String(size)}: ${String(now.runs)} runs, ${String(now.worked)} worked ` +
              `(${String(before.runs)} and ${String(before.worked)} as the take was before ADR-506)`
            );
          })
          .join('; '),
    );
    const burstLoads = await loadsOf(worker, p1, '2026-10-15');
    story.check(
      'AC-05-51 the workers’ own loops drained the burst in more than one run, two workers at once, and every load of the day stands concluded: none still waiting for its other field event, each with its completed load',
      [runs > 1, burstLoads.pending, burstLoads.completed],
      [true, 0, trucks * loadsATruck],
    );

    // ------------------------------------------------------------------------------------------
    // The queue at that size (BACKLOG 2.7.2 part 3; ADR-506): each read timed on this machine
    // and written down, never checked.
    story.at(
      thursday('19:00'),
      'The queue at that size: the neighbour read, a setup change’s read of every ticket, and a run by its size, timed',
    );
    // What a sync's field event asks before it queues: the other tickets that read it. One
    // ticket of each truck, its sixth load, as one record of a sync asks it.
    const collections = await api.fieldEvent.findMany({
      where: { projectId: p1, kind: 'COLLECTION' },
      select: { certNumber: true, ticketNumber: true },
      orderBy: { startedAt: 'asc' },
    });
    const reads: number[] = [];
    const found: number[] = [];
    for (let truck = 0; truck < trucks; truck += 1) {
      const loads = collections.filter(({ certNumber }) => certNumber === certOf(truck));
      const ticketNumber = loads[5]?.ticketNumber;
      if (ticketNumber === undefined) throw new Error(`Truck ${certOf(truck)} has no sixth load.`);
      const reading = performance.now();
      const neighbours = await api.$read((tx) =>
        new WorkQueue(tx, atMost).neighbours(p1, [{ workflow: 'LOAD', ticketNumber }]),
      );
      reads.push(performance.now() - reading);
      found.push(neighbours.length);
    }
    const sortedReads = [...reads].sort((a, b) => a - b);
    say(
      `The neighbour read of one ticket, a load of each of the ${String(trucks)} trucks among ` +
        `${String(await api.fieldEvent.count({ where: { projectId: p1 } }))} field events: ` +
        `half took ${ms(middleOf(sortedReads))} ms or less, the slowest ${ms(sortedReads.at(-1) ?? 0)} ms; ` +
        `it found from ${String(Math.min(...found))} to ${String(Math.max(...found))} neighbours`,
    );

    // A setup change by a person reads every ticket of the project it touches and queues them in
    // jobs of the policy's size: here one that touches them all, as a rate changed would, queued
    // as `QueueingService.setupChanged` queues it, in Luis's piece of work.
    const readingAll = performance.now();
    const every = await api.$read((tx) => new WorkQueue(tx, atMost).ticketsWith(p1, {}));
    const readAll = performance.now() - readingAll;
    const queueing = performance.now();
    const change = await api.$write({ actorId: luis, source: 'BACK_OFFICE' }, async (tx) => {
      const work = new WorkQueue(tx, atMost);
      return work.queue({
        projectId: p1,
        trigger: 'SETUP_CHANGE',
        requestedById: luis,
        tickets: [],
        others: await work.ticketsWith(p1, {}),
      });
    });
    say(
      `A setup change’s read of every ticket found ${String(every.length)} in ${ms(readAll)} ms; ` +
        `the read and its ${String(change.jobs.length)} jobs written took ${ms(performance.now() - queueing)} ms`,
    );

    // A run by its size: the setup change's jobs, a run each, then a run of one ticket three
    // times (what every run reads and writes besides its tickets), then the day's thousand in
    // one job (a job is always taken up whole, whatever its size). Every ticket here is worked
    // again, its mileage already standing.
    const timed = async (): Promise<{ tickets: number; seconds: number }> => {
      const running = performance.now();
      const run = await queue.next(p1);
      return { tickets: workedIn([run]), seconds: (performance.now() - running) / 1000 };
    };
    const byHand = (ticketNumbers: readonly string[]): Promise<string> =>
      api.$write({ actorId: luis, source: 'BACK_OFFICE' }, (tx) =>
        new ReconciliationJobs(tx).queue({
          projectId: p1,
          trigger: 'REPROCESS',
          requestedById: luis,
          tickets: ticketNumbers.map((ticketNumber) => ({ workflow: 'LOAD', ticketNumber })),
        }),
      );
    const sized: { tickets: number; seconds: number }[] = [];
    while (sized.length < change.jobs.length) sized.push(await timed());
    const [one] = every;
    if (one === undefined) throw new Error('No ticket to work.');
    for (let time = 0; time < 3; time += 1) {
      await byHand([one.ticketNumber]);
      sized.push(await timed());
    }
    await byHand(every.map(({ ticketNumber }) => ticketNumber));
    sized.push(await timed());
    say(
      `A run by its size, seconds on this machine: ` +
        sized.map((run) => `${String(run.tickets)} tickets ${run.seconds.toFixed(2)} s`).join('; '),
    );

    // ------------------------------------------------------------------------------------------
    // What a sync, a turn-in and a map ask at that size (BACKLOG 2.8.2; C133, C134, C140, C141,
    // C154; ADR-524): each timed on this machine and written down, never checked against a
    // figure.
    story.at(thursday('19:30'), 'What a sync, a turn-in and a map ask at that size, timed');
    // Each sync that names a project reads its whole setup to number it (C133).
    const setupReads: number[] = [];
    while (setupReads.length < phones.length) {
      const reading = performance.now();
      await api.$read((tx) => SetupVersions.shownIn(tx, p1));
      setupReads.push(performance.now() - reading);
    }
    setupReads.sort((a, b) => a - b);
    say(
      `A sync's read of P1's setup to number it, ${String(phones.length)} times one after ` +
        `another: half took ${ms(middleOf(setupReads))} ms or less, the slowest ` +
        `${ms(setupReads.at(-1) ?? 0)} ms`,
    );
    // A phone's first sync is made the master passcode's check (C134): a slow hash, made outside
    // any piece of work, so it holds no connection. One, then one for each phone at once; from a
    // seed of the burst's own, sealed as the API seals the passcode's (ADR-542).
    const checks = new OfflineChecks('a sealing key of the burst’s own');
    const seed = await checks.passcodeSeedOf(1, 'a passcode of the burst’s own');
    const checking = performance.now();
    await checks.ofPasscode(1, seed);
    const oneCheck = performance.now() - checking;
    const allChecking = performance.now();
    await Promise.all(phones.map(() => checks.ofPasscode(1, seed)));
    say(
      `The master passcode's check a phone's first sync is made: one took ${ms(oneCheck)} ms; ` +
        `one for each of the ${String(phones.length)} phones at once, ` +
        `${ms(performance.now() - allChecking)} ms in all`,
    );
    // A turn-in names up to 10,000 records and 10,000 photographs (C141): one of the collection
    // phones names its own and made-up ones to that size, so its confirmation reads that many.
    const [namer] = collectors;
    if (namer === undefined) throw new Error('No collection phone.');
    const ownRecords = await api.syncedRecord.findMany({
      where: { deviceId: namer.setup.deviceId },
      select: { recordId: true, recordKind: true },
    });
    const named = (kept: readonly string[]): string[] => [
      ...kept,
      ...Array.from({ length: 10_000 - kept.length }, () => uuidv7(clock.now())),
    ];
    const naming = performance.now();
    const namedAnswer = await story.underPasscode.turnInNaming(namer.setup.deviceId, {
      unplannedAssignments: [],
      passcodeUses: [],
      records: named(
        ownRecords.filter((one) => one.recordKind !== 'PHOTO').map((one) => one.recordId),
      ),
      held: [],
      photos: named(
        ownRecords.filter((one) => one.recordKind === 'PHOTO').map((one) => one.recordId),
      ),
    });
    const namingMs = performance.now() - naming;
    story.check(
      'C141 a turn-in naming 10,000 records and 10,000 photographs is answered: what the server doesn’t have of them is named back, nothing changed',
      namedAnswer.turnedIn
        ? 'turned in'
        : [namedAnswer.notOnTheServer.records.length, namedAnswer.notOnTheServer.photos.length],
      [10_000 - 2 * loadsATruck, 10_000 - 2 * loadsATruck],
    );
    // A phone whose every record the server has, turned in whole.
    const [turned] = towerPhones;
    if (turned === undefined) throw new Error('No tower phone.');
    const turnedHolds = await api.syncedRecord.count({
      where: { deviceId: turned.setup.deviceId },
    });
    const turning = performance.now();
    const turnedAnswer = await story.underPasscode.turnIn(turned);
    say(
      `A turn-in naming 10,000 records and 10,000 photographs, the server holding ` +
        `${String(2 * loadsATruck)} of each: answered in ${ms(namingMs)} ms; a tower phone ` +
        `holding ${String(turnedHolds)} records and photographs, all on the server, ` +
        `synced and turned in in ${ms(performance.now() - turning)} ms`,
    );
    story.check(
      'AC-02-58 the tower phone whose every record the server has is turned in and told to wipe',
      turnedAnswer.wipe,
      true,
    );
    // The neighbour read (C154): how the database reads a field event's other loads by truck,
    // and how many field events of the project that reads.
    const [plan] = await api.$queryRaw<{ 'QUERY PLAN': string }[]>`
      EXPLAIN SELECT "id" FROM "field_event"
      WHERE "project_id" = ${p1}::uuid AND "cert_number" IN (${certOf(0)})
        AND "kind" IN ('COLLECTION', 'UNIT_RATE')`;
    say(
      `The neighbour read by truck is read so: ${plan?.['QUERY PLAN'].trim() ?? 'no plan'}, ` +
        `over the project's ${String(await api.fieldEvent.count({ where: { projectId: p1 } }))} ` +
        `field events`,
    );
    // A map's file at its largest (C140): a GeoJSON of zones as many as fit the policy's size,
    // each a shape of many corners, read as the API reads a file it is sent.
    const corners = 2_000;
    const zone = (n: number) => ({
      type: 'Feature',
      properties: { ZONE_NAME: `Zone ${String(n + 1)}` },
      geometry: {
        type: 'Polygon',
        coordinates: [
          Array.from({ length: corners + 1 }, (_, corner) => {
            const angle = (2 * Math.PI * (corner % corners)) / corners;
            return [
              Number((-75.6 + 0.001 * n + 0.0004 * Math.cos(angle)).toFixed(7)),
              Number((39.1 + 0.0004 * Math.sin(angle)).toFixed(7)),
            ];
          }),
        ],
      },
    });
    const fits = Math.floor(
      (story.policy.mapFileBytesAtMost * 0.95) / Buffer.byteLength(JSON.stringify(zone(0))),
    );
    const mapFile = Buffer.from(
      JSON.stringify({
        type: 'FeatureCollection',
        features: Array.from({ length: fits }, (_, n) => zone(n)),
      }),
    );
    const reader = new MapFileReader({
      unzippedBytesAtMost: story.policy.mapFileUnzippedBytesAtMost,
      entriesAtMost: story.policy.mapFileEntriesAtMost,
      ringPairsAtMost: story.policy.mapFileRingPairsAtMost,
    });
    const readingMap = performance.now();
    const map = await reader.read(mapFile);
    say(
      `A map's GeoJSON file of ${String(mapFile.byteLength)} bytes (the policy lets one weigh ` +
        `${String(story.policy.mapFileBytesAtMost)}), ${String(fits)} zones of ${String(corners)} ` +
        `corners each: read in ${ms(performance.now() - readingMap)} ms, ` +
        (map.read === null
          ? `not read (${map.problem})`
          : `${String(map.read.layers.length)} layer`),
    );
    // A map version whose boundary has a great many corners (C140): loaded, then a run of one
    // ticket timed again, as each run reads the boundary.
    const along = 25_000;
    const edge = (from: readonly [number, number], to: readonly [number, number]) =>
      Array.from({ length: along }, (_, step) => [
        Number((from[0] + ((to[0] - from[0]) * step) / along).toFixed(7)),
        Number((from[1] + ((to[1] - from[1]) * step) / along).toFixed(7)),
      ]);
    const [west, south, east, north] = [-75.8, 38.9, -75.4, 39.3] as const;
    const ring = [
      ...edge([west, south], [east, south]),
      ...edge([east, south], [east, north]),
      ...edge([east, north], [west, north]),
      ...edge([west, north], [west, south]),
      [west, south],
    ];
    const loading = performance.now();
    const loaded = await new ProjectSetup(api, clock, story.policy).loadMap(office.dana, {
      projectId: p1,
      source: 'UPLOAD',
      sourceName: 'bayline-row-zones-v2.geojson',
      boundary: { type: 'Polygon', coordinates: [ring] },
      zones: p1Zones,
      zoneNameField: 'ZONE_NAME',
    });
    if (!loaded.saved) throw new Error(`The map wasn't loaded: ${loaded.refusal.message}`);
    const loadedMs = performance.now() - loading;
    const withIt: number[] = [];
    for (let time = 0; time < 3; time += 1) {
      await byHand([one.ticketNumber]);
      withIt.push((await timed()).seconds);
    }
    await byHand(every.slice(0, atMost).map(({ ticketNumber }) => ticketNumber));
    const twoHundred = await timed();
    say(
      `A map version whose boundary has ${String(ring.length)} corners: loaded in ` +
        `${ms(loadedMs)} ms; a run of one ticket then took ` +
        `${withIt.map((seconds) => `${seconds.toFixed(2)} s`).join(', ')}, and a run of ` +
        `${String(twoHundred.tickets)} tickets ${twoHundred.seconds.toFixed(2)} s`,
    );
  },
};

// Every waiting job taken up by workers at once, each passing until no job waits, as each
// worker container's loop does (C95): a pass that finds nothing to take up, the other's run
// holding the project, waits a moment and passes again. Each worker's runs, and how many of its
// passes found nothing; a pass that failed stops the story.
async function twoAtOnce(
  db: Database,
  queues: readonly QueueRuns[],
): Promise<{ readonly runs: RunOutcome[]; readonly idle: number }[]> {
  const waiting = (): Promise<number> =>
    db.reconciliationJob.count({ where: { finishedAt: null, setAsideAt: null } });
  return Promise.all(
    queues.map(async (queue) => {
      const runs: RunOutcome[] = [];
      let idle = 0;
      while ((await waiting()) > 0) {
        const passed = await queue.pass();
        for (const each of passed) {
          if ('error' in each) throw new Error(`A worker’s pass failed on ${each.projectId}.`);
          if (each.outcome.worked) runs.push(each.outcome.run);
        }
        if (passed.some((each) => 'outcome' in each && each.outcome.worked)) continue;
        idle += 1;
        if (idle > 2400) throw new Error('A worker found nothing to take up for two minutes.');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return { runs, idle };
    }),
  );
}

// The middle of numbers in order: the one at half way.
function middleOf(sorted: readonly number[]): number {
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
}

// The tickets runs worked, each run's counted.
function workedIn(runs: readonly { ticketsDone: number; ticketsFailed: number }[]): number {
  return runs.reduce((sum, run) => sum + run.ticketsDone + run.ticketsFailed, 0);
}

// Jobs taken up on paper as the worker's `WaitingJobs.takeUp` takes them, run after run, at a
// size: the runs it takes and the tickets they work in all. With `riding` (the rule since
// ADR-506), a later job whose tickets the run already works is taken up with it, though a job
// ahead of it didn't fit; without, a job that doesn't fit ends the take, as before it.
function takenUp(
  jobs: readonly (readonly string[])[],
  size: number,
  riding: boolean,
): { runs: number; worked: number } {
  let left = [...jobs];
  let runs = 0;
  let worked = 0;
  while (left.length > 0) {
    const tickets = new Set<string>();
    const behind: (readonly string[])[] = [];
    let full = false;
    for (const job of left) {
      const withIt = new Set([...tickets, ...job]);
      if (!full && (tickets.size === 0 || withIt.size <= size)) {
        for (const ticket of job) tickets.add(ticket);
      } else if (riding && withIt.size === tickets.size) {
        continue;
      } else {
        full = true;
        behind.push(job);
      }
    }
    left = behind;
    runs += 1;
    worked += tickets.size;
  }
  return { runs, worked };
}

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
