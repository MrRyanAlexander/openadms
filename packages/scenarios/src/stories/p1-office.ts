// What the stories of the worker's run share (the stories `p1-reconciled` and `p1-priced`;
// BACKLOG 1.5.9, 1.7.2; ADR-352, 359): P1's two field days exactly as the story `p1-field-days`
// records them, held on its phones until each phone's own sync; and what that story leaves out
// and the worker reads: P1's map, its five certifications, and the golden mission's load,
// haul-out, fee, fill and freon pay items with every rule of its §1.
//
// Each step here is told by the story that calls it: it moves the clock and says what happens,
// then calls the step.
import {
  Certifications,
  ListSetup,
  PayItemSetup,
  ProjectSetup,
  RuleSetup,
  SiteSetup,
  type BoxInput,
  type CriterionInput,
  type NewCertification,
  type NewPayItem,
} from '@open-adms/api';
import {
  photoRead,
  readPersonEndpoint,
  recordRead,
  reprocessTicketsEndpoint,
  setPermissionsEndpoint,
  type AnswerOf,
  type SyncAnswered,
  type SyncReceived,
} from '@open-adms/contracts';
import type { JobTicket } from '@open-adms/db';
import { certificationViews, workflows, type PermissionName, uuidv7 } from '@open-adms/domain';
import {
  JobLoop,
  WorkerLog,
  type ProjectPassed,
  type Reconciliation,
  type RunOutcome,
  type TicketOutcome,
} from '@open-adms/worker';

import { createHash } from 'node:crypto';

import { StoryClock, utcOffsetMinutes } from '../clock.ts';
import {
  fromPhone,
  heldId,
  NoSignal,
  SimulatedDevice,
  type PhoneRecord,
  type RecordedPhoto,
} from '../device.ts';
import type { OfficeBrowser } from '../office-browser.ts';
import type { StoryContext } from '../runner.ts';
import { p1FieldDays } from './p1-field-days.ts';
import { assigned, synced } from './board.ts';
import { danasEmail, luissEmail, p1TimeZone as timeZone } from './p1.ts';
import { p1Boundary, p1Zones } from './setup.ts';

const on = (date: string, time: string): string => `2026-10-${date}T${time}:00-04:00`;

export const primaryBox = (length: number, width: number, height: number): BoxInput => ({
  shape: 'RECTANGLE',
  sign: 'ADD',
  length,
  width,
  height,
});

type Saving<T> = Promise<
  { saved: true; record: T } | { saved: false; refusal: { message: string } }
>;

export async function saved<T>(attempt: Saving<T>): Promise<T> {
  const outcome = await attempt;
  if (!outcome.saved) throw new Error(`Refused: ${outcome.refusal.message}`);
  return outcome.record;
}

// The worker's side of the job queue in a story (BACKLOG 2.3.3, 2.7.1 part 3; ADR-420, 494):
// nobody asks the worker for a run. A sync, a person's action or a setup change queued its job
// in its own piece of work, and here the worker's own job loop (`JobLoop`, as its process runs
// it, under the release's policy) takes the waiting jobs up on the story's database and clock:
// every project with a job waiting, one run each a pass. What a run did is its own answer, as
// the pass hands it on.
export class QueueRuns {
  private readonly story: StoryContext;
  private readonly loop: JobLoop;
  // Each project's runs the story hasn't read yet, the oldest first.
  private readonly unread = new Map<string, RunOutcome[]>();

  constructor(story: StoryContext, reconciliation: Reconciliation) {
    const { policy } = story;
    this.story = story;
    this.loop = new JobLoop(
      story.worker,
      reconciliation,
      {
        triesBeforeSetAside: policy.jobTriesBeforeSetAside,
        ticketsARun: policy.jobTicketsAtMost,
        pollMs: policy.jobQueuePollSeconds * 1_000,
        stalledAfterMs: JobLoop.stalledAfterMs(policy),
      },
      // Its lines say only what a pass's answer says too; a story reads the answer.
      new WorkerLog({ write: () => undefined }),
      story.clock,
    );
  }

  // One pass of the job loop: what it did with each project, for the story to read here.
  pass(): Promise<readonly ProjectPassed[]> {
    return this.loop.pass();
  }

  // One pass; each run it made is kept for its project until the story reads it.
  private async kept(): Promise<readonly ProjectPassed[]> {
    const passed = await this.loop.pass();
    for (const each of passed) {
      if ('outcome' in each && each.outcome.worked) {
        this.unread.set(each.projectId, [
          ...(this.unread.get(each.projectId) ?? []),
          each.outcome.run,
        ]);
      }
    }
    return passed;
  }

  // One pass; the project's run in it. A story that expects one and finds none has lost a job:
  // it stops.
  async next(projectId: string): Promise<RunOutcome> {
    const passed = await this.kept();
    const [run, ...more] = this.taken(projectId);
    if (run === undefined || more.length > 0) {
      throw new Error(
        `The worker’s pass made ${String(more.length + (run ? 1 : 0))} runs on the project, not one: ${QueueRuns.why(passed)}.`,
      );
    }
    return run;
  }

  // Every waiting job worked, pass after pass, as the loop goes on at once while a pass
  // finished jobs and more wait; how many runs it took on the project. What setup queued before
  // the field days (a site's permit, a certification's views) is settled so.
  async settle(projectId: string): Promise<number> {
    return (await this.ran(projectId)).length;
  }

  // As `settle`, answering the project's runs themselves, the oldest first.
  async ran(projectId: string): Promise<readonly RunOutcome[]> {
    await this.drained();
    return this.taken(projectId);
  }

  // Every waiting job worked, as `settle`, in one run on the project: that run's answer. A story
  // that expects the worker to run and finds no job has lost one, and one whose jobs took more
  // than a run (more tickets than the policy lets one take up) is told so: it stops.
  async settled(projectId: string): Promise<RunOutcome> {
    await this.drained();
    const [run, ...more] = this.taken(projectId);
    if (run === undefined || more.length > 0) {
      throw new Error(
        `The worker made ${String(more.length + (run ? 1 : 0))} runs on the project, not one.`,
      );
    }
    return run;
  }

  // Every ticket of the project as it stands, read from its records, not from a run: each
  // number its field events are under, with their status, the flags standing on it, and what
  // its last decision says it waits for and why it couldn't be processed; in a run's order
  // (workflow, then number), a number that isn't one last. A void ticket is listed, VOID. The
  // id and the counts are the project's last run's. A run the queue starts works only the
  // tickets its jobs name, so what a whole run used to tell of a project is read here.
  async standing(projectId: string): Promise<RunOutcome> {
    const { api } = this.story;
    const events = await api.fieldEvent.findMany({
      where: { projectId },
      select: { workflow: true, ticketNumber: true, status: true },
    });
    const statuses = new Map<string, Set<TicketOutcome['status']>>();
    for (const event of events) {
      const key = JSON.stringify([event.workflow, event.ticketNumber]);
      statuses.set(key, (statuses.get(key) ?? new Set()).add(event.status));
    }
    const isNumber = (ticketNumber: string): boolean => /^[0-9]+$/.test(ticketNumber);
    const named = [...statuses.keys()]
      .map((key) => JSON.parse(key) as [TicketOutcome['workflow'], string])
      .sort(
        ([leftFlow, left], [rightFlow, right]) =>
          Number(!isNumber(left)) - Number(!isNumber(right)) ||
          workflows.indexOf(leftFlow) - workflows.indexOf(rightFlow) ||
          left.length - right.length ||
          (left < right ? -1 : left > right ? 1 : 0),
      );
    const tickets: TicketOutcome[] = [];
    for (const [workflow, ticketNumber] of named) {
      const [status, ...mixed] = statuses.get(JSON.stringify([workflow, ticketNumber])) ?? [];
      if (status === undefined || mixed.length > 0) {
        throw new Error(`Ticket ${ticketNumber}’s field events stand at more than one status.`);
      }
      const decided = await api.reconciliationDecision.findFirst({
        where: { workflow, ticketNumber, reconciliationRun: { projectId } },
        orderBy: { id: 'desc' },
        select: { summary: true, error: true },
      });
      const flags = await api.flag.findMany({
        where: { projectId, workflow, ticketNumber, clearedAt: null },
        select: { message: true },
        orderBy: { id: 'asc' },
      });
      const { waitingFor } = (decided?.summary ?? {}) as {
        waitingFor?: TicketOutcome['waitingFor'];
      };
      tickets.push({
        workflow,
        ticketNumber,
        status,
        waitingFor: waitingFor ?? [],
        flags: flags.map((flag) => flag.message),
        error: decided?.error ?? null,
      });
    }
    const last = await api.reconciliationRun.findFirst({
      where: { projectId },
      orderBy: { id: 'desc' },
      select: { id: true, ticketsDone: true, ticketsFailed: true },
    });
    return {
      runId: last?.id ?? '',
      ticketsDone: last?.ticketsDone ?? 0,
      ticketsFailed: last?.ticketsFailed ?? 0,
      tickets,
      pending: tickets.filter((ticket) => ticket.waitingFor.length > 0),
    };
  }

  // The project's waiting jobs, the oldest first: what asked for each, and the tickets it names.
  async waiting(
    projectId: string,
  ): Promise<{ id: string; trigger: string; requestedById: string | null; tickets: string[] }[]> {
    const jobs = await this.story.api.reconciliationJob.findMany({
      where: { projectId, finishedAt: null, setAsideAt: null },
      orderBy: { id: 'asc' },
      include: { tickets: { orderBy: [{ workflow: 'asc' }, { ticketNumber: 'asc' }] } },
    });
    return jobs.map((job) => ({
      id: job.id,
      trigger: job.trigger,
      requestedById: job.requestedById,
      tickets: job.tickets.map((ticket) => ticket.ticketNumber),
    }));
  }

  private taken(projectId: string): RunOutcome[] {
    const runs = this.unread.get(projectId) ?? [];
    this.unread.delete(projectId);
    return runs;
  }

  // Passes until no job waits anywhere. A pass that leaves as many jobs waiting as before it (a
  // try that failed whole, a project that couldn't be taken up, a run of another worker's under
  // way, a run that finished none of its jobs) stops the story with why.
  private async drained(): Promise<void> {
    const waiting = (): Promise<number> =>
      this.story.api.reconciliationJob.count({ where: { finishedAt: null, setAsideAt: null } });
    let before = await waiting();
    while (before > 0) {
      const passed = await this.kept();
      const after = await waiting();
      if (after >= before) {
        throw new Error(
          `The worker’s pass finished no job while some wait: ${QueueRuns.why(passed)}.`,
        );
      }
      before = after;
    }
  }

  // Why a pass worked nothing, project by project, in its own words.
  private static why(passed: readonly ProjectPassed[]): string {
    return (
      passed
        .map((each) =>
          'error' in each
            ? `${each.projectId}: ${each.error instanceof Error ? each.error.message : String(each.error)}`
            : each.outcome.worked
              ? `${each.projectId}: worked`
              : `${each.projectId}: ${each.outcome.reason}${'error' in each.outcome ? ` (${each.outcome.error})` : ''}`,
        )
        .join('; ') || 'no job waits'
    );
  }
}

// A record a phone holds, with the time its phone found signal.
export interface HeldRecord {
  readonly sent: PhoneRecord;
  readonly syncedAt: Date;
}

// A sync a phone would have sent, whole, as the endpoint's boundary read it, with the time its
// phone found signal.
export interface HeldSync {
  readonly deviceId: string;
  readonly sent: SyncReceived;
  readonly syncedAt: Date;
}

export interface P1Office {
  // Each phone's syncs, held whole; and their records one by one, as their phones hold them.
  readonly syncs: readonly HeldSync[];
  readonly held: readonly HeldRecord[];
  readonly dana: string;
  readonly luis: string;
  readonly sam: string;
  readonly lee: string;
  readonly p1: string;
  readonly coastline: string;
  readonly contract: string;
  readonly tdsr: string;
  readonly landfill: string;
  readonly cypress: string;
  // P1-HO-TDSR, the phone Sam Grant certifies on.
  readonly samPhone: string;
}

// The two field days, exactly as the story `p1-field-days` records them, on a clock of their
// own, with every phone's sync held back: each sync that carries records is kept whole with
// the time its phone found signal, and that story's own checks aren't asked again. It sets P1
// up as it goes (its sites, forms, unit rate pay items, people, phones and dispatch board); a
// sync that carries no record (a phone's first blocks, at the yard) reaches the server then.
export async function p1FieldDaysHeld(story: StoryContext): Promise<P1Office> {
  const { api } = story;
  const syncs: HeldSync[] = [];
  const held: HeldRecord[] = [];
  const fieldClock = new StoryClock(p1FieldDays.start);
  // Every request of the field days' phones on their own clock (enrolment, a monitor created,
  // a sign-in, their lists): the story's API started again on it.
  const atTheYard = story.phonesOn(fieldClock);
  await p1FieldDays.run({
    ...story,
    ...atTheYard,
    clock: fieldClock,
    server: {
      received: (deviceId, sent) => {
        if (sent.records.length === 0 && sent.photos.length === 0) {
          return atTheYard.server.received(deviceId, sent);
        }
        const syncedAt = fieldClock.now();
        syncs.push({ deviceId, sent, syncedAt });
        const records: SyncAnswered['records'] = sent.records.map((one) => {
          const read = recordRead(one);
          if (!read.read) throw new Error(`A phone held what is no record: ${read.notice.reason}.`);
          const record = fromPhone(deviceId, read.record);
          if (record.record === 'CERTIFICATION') {
            throw new Error('No phone certifies on these two days.');
          }
          held.push({ sent: record, syncedAt });
          // Answered under its own id: the phone takes no other answer for one (ADR-470).
          return { answer: 'SAVED', id: heldId(record), notes: [] };
        });
        // The phone hears "saved" and nothing more: its numbers are topped up when the sync
        // reaches the server.
        return Promise.resolve({
          answered: {
            unplannedAssignments: [],
            passcodeUses: [],
            records,
            photos: sent.photos.map((one) => {
              const read = photoRead(one);
              if (!read.read) throw new Error(`A phone held what is no photograph's record.`);
              return { answer: 'SAVED', id: read.photo.id, notes: [] };
            }),
            numbers: sent.lastUsed.map(({ projectId, series }) => ({
              projectId,
              series,
              toppedUp: false,
              blocks: [],
            })),
            masterPasscode: { version: sent.holds.masterPasscodeVersion ?? 1, check: null },
            setupVersion: null,
          },
        });
      },
      // Its photographs' files wait on the phone: their records reach the server only when the
      // held syncs are told, and the phone isn't there then (ADR-483).
      filePart: () => Promise.reject(new NoSignal()),
    },
    at: (time) => {
      fieldClock.set(time);
    },
    check: () => undefined,
    phone: (setup) => new SimulatedDevice(setup, fieldClock),
  });

  const person = async (name: string): Promise<string> =>
    (await api.user.findFirstOrThrow({ where: { name } })).id;
  const site = async (name: string): Promise<string> =>
    (await api.disposalSite.findFirstOrThrow({ where: { name } })).id;
  const project = await api.project.findFirstOrThrow();
  return {
    syncs,
    held,
    dana: await person('Dana Reyes'),
    luis: await person('Luis Ortega'),
    sam: await person('Sam Grant'),
    lee: await person('Lee Morgan'),
    p1: project.id,
    coastline: (await api.contractor.findFirstOrThrow({ where: { name: 'Coastline Haulers LLC' } }))
      .id,
    contract: (
      await api.contract.findFirstOrThrow({ where: { name: 'Coastline, Bayline ROW 2026' } })
    ).id,
    tdsr: await site('Marsh Road TDSR'),
    landfill: await site('Bayline County Landfill'),
    cypress: await site('Cypress Creek Landfill'),
    samPhone: (await api.device.findFirstOrThrow({ where: { name: 'P1-HO-TDSR' } })).id,
  };
}

// P1's back office at their browsers (BACKLOG 2.7.1 part 4; ADR-496, 497): Dana, the firm's
// first admin, and Luis Ortega, the manager/analyst she wrote, his first password set by her.
// Each signs in at the story's clock when first asked for.
export interface P1BackOffice {
  danas(): Promise<OfficeBrowser>;
  luiss(): Promise<OfficeBrowser>;
  // Dana gives Luis more grants on his record: she reads what he holds, and states it with
  // these (`setPermissions` takes the whole of it).
  grantLuis(...more: PermissionName[]): Promise<void>;
  // Luis asks for tickets of P1 to be reprocessed with nothing changed, at the reprocess
  // endpoint (ADR-498): he holds correct. Its answer: what was asked and queued.
  reprocess(tickets: readonly JobTicket[]): Promise<AnswerOf<typeof reprocessTicketsEndpoint>>;
}

export function p1BackOffice(
  story: StoryContext,
  office: Pick<P1Office, 'dana' | 'luis' | 'p1'>,
): P1BackOffice {
  const danas = () => story.backOffice.admin({ id: office.dana, email: danasEmail });
  const luiss = async () =>
    story.backOffice.person(await danas(), { id: office.luis, email: luissEmail });
  return {
    danas,
    luiss,
    async grantLuis(...more) {
      const dana = await danas();
      const ids = { userId: office.luis };
      const held = (await dana.answered(readPersonEndpoint, { ids })).permissions;
      await dana.answered(setPermissionsEndpoint, {
        ids,
        json: { permissions: [...new Set([...held, ...more])] },
      });
    },
    async reprocess(tickets) {
      return (await luiss()).answered(reprocessTicketsEndpoint, {
        ids: { projectId: office.p1 },
        json: {
          tickets: tickets.map(({ workflow, ticketNumber }) => ({ workflow, ticketNumber })),
        },
      });
    },
  };
}

// Dana loads P1's map: its boundary and three zones.
export async function loadP1Map(
  story: StoryContext,
  office: Pick<P1Office, 'dana' | 'p1'>,
): Promise<void> {
  await saved(
    new ProjectSetup(story.api, story.clock, story.policy).loadMap(office.dana, {
      projectId: office.p1,
      source: 'UPLOAD',
      sourceName: 'bayline-row-zones-v1.geojson',
      boundary: p1Boundary,
      zones: p1Zones,
      zoneNameField: 'ZONE_NAME',
    }),
  );
}

// A certification on Saturday 10 October, at a time of that day, as Sam Grant makes one on
// P1-HO-TDSR with Lee Morgan helping. Coastline's unless told. Its five photographs, one a
// view, are taken with it and reach the server after it, through the API's own `Sync`
// (ADR-179, 481).
export type P1Certify = (
  time: string,
  more: Partial<NewCertification> & Pick<NewCertification, 'certNumber' | 'boxes'>,
) => Promise<void>;

// Saturday: Sam Grant certifies P1's three containers and two crews (golden mission §1). The
// answer certifies another that day, for a story that needs one more.
export async function certifyP1(
  story: StoryContext,
  office: Pick<P1Office, 'luis' | 'sam' | 'lee' | 'p1' | 'coastline' | 'samPhone'>,
): Promise<P1Certify> {
  const { api, clock } = story;
  const { luis, sam, lee, p1, coastline, samPhone } = office;
  const certifying = await assigned(api, clock, luis, {
    workDate: '2026-10-10',
    projectId: p1,
    personId: sam,
    certifying: true,
    deviceId: samPhone,
  });
  const certifications = new Certifications(api, clock, story.policy);
  const feature = async (name: string): Promise<string> =>
    (await api.vehicleFeature.findFirstOrThrow({ where: { name } })).id;
  const certify: P1Certify = async (time, more) => {
    clock.set(on('10', time));
    const made = await saved(
      certifications.certify({
        projectId: p1,
        kind: 'CONTAINER',
        primeId: coastline,
        certifiedById: sam,
        deviceId: samPhone,
        assignmentId: certifying,
        helperIds: [lee],
        ...more,
        id: uuidv7(clock.now()),
        certifiedAt: clock.now(),
        deviceUtcOffsetMinutes: utcOffsetMinutes(timeZone, clock.now()),
      }),
    );
    await photographed(story, { deviceId: samPhone, takenById: sam }, made);
  };
  await certify('09:10', {
    certNumber: '730415',
    vehicleTypeId: (
      await api.vehicleType.findFirstOrThrow({ where: { name: 'Hydraulic Dump Trailer' } })
    ).id,
    boxes: [
      primaryBox(360, 96, 72),
      { ...primaryBox(360, 96, 16), featureId: await feature('Sideboards') },
    ],
  });
  await certify('09:40', {
    certNumber: '730416',
    firstTierSub: 'Rivera Trucking',
    vehicleTypeId: (
      await api.vehicleType.findFirstOrThrow({ where: { name: 'Self-Loading Truck' } })
    ).id,
    boxes: [
      primaryBox(264, 92, 96),
      {
        shape: 'TRIANGLE',
        sign: 'SUBTRACT',
        length: 36,
        width: 92,
        height: 48,
        featureId: await feature('Dog Box'),
      },
    ],
  });
  for (const [time, certNumber, crewType] of [
    ['10:05', '730417', 'Bucket Truck'],
    ['10:15', '730418', 'Skid Steer'],
  ] as const) {
    await certify(time, {
      certNumber,
      kind: 'CREW',
      crewTypeId: (await api.crewType.findFirstOrThrow({ where: { name: crewType } })).id,
      boxes: [],
    });
  }
  await certify('10:50', {
    certNumber: '730419',
    vehicleTypeOther: 'Walking floor trailer',
    boxes: [
      primaryBox(576, 96, 93),
      {
        shape: 'RADIUS_CORNER',
        sign: 'SUBTRACT',
        radius: 6,
        run: 576,
        corners: 2,
        featureId: await feature('Curved/Angled Sides/Floor'),
      },
    ],
  });
  return certify;
}

// A certification's five photographs, one a view, taken as it was certified and sent after it
// by the phone that took them, through the API's own `Sync` (ADR-179, 481). One not saved stops
// the story.
export async function photographed(
  story: StoryContext,
  by: { readonly deviceId: string; readonly takenById: string },
  certification: { readonly id: string; readonly projectId: string; readonly certNumber: string },
): Promise<void> {
  const takenAt = story.clock.now();
  const fingerprint = (view: string, as: string): string =>
    createHash('sha256')
      .update(`${certification.projectId} ${certification.certNumber} ${view} as ${as}`)
      .digest('hex');
  const { photos } = await synced(story, by.deviceId, timeZone, {
    photos: certificationViews.map((view) => ({
      id: uuidv7(takenAt),
      projectId: certification.projectId,
      owner: { kind: 'CERTIFICATION', id: certification.id },
      view,
      takenById: by.takenById,
      capturedAt: takenAt.toISOString(),
      deviceUtcOffsetMinutes: utcOffsetMinutes(timeZone, takenAt),
      latitude: null,
      longitude: null,
      originalSha256: fingerprint(view, 'taken'),
      uploadedSha256: fingerprint(view, 'uploaded'),
      depthSha256: null,
    })),
  });
  for (const answer of photos) {
    if (answer.answer !== 'SAVED') throw new Error(`Not saved: ${answer.answer}`);
  }
}

// The phones' syncs, in the order the story `p1-field-days` has them: Monday evening, Tuesday
// evening, and the Marsh Road tower's on Wednesday.
export class P1Syncs {
  readonly times: readonly Date[];
  private readonly story: StoryContext;
  private readonly syncs: readonly HeldSync[];
  private readonly held: readonly HeldRecord[];

  constructor(story: StoryContext, office: Pick<P1Office, 'syncs' | 'held'>) {
    this.story = story;
    this.syncs = office.syncs;
    this.held = office.held;
    this.times = [...new Set(office.syncs.map((each) => each.syncedAt.getTime()))]
      .sort((left, right) => left - right)
      .map((time) => new Date(time));
  }

  // The phones' syncs reach the server, each whole and through the API's own `Sync`: the ones
  // sent at that time in `p1-field-days`, each phone's clock as it sends it now. How many
  // records they carried; one that isn't saved stops the story.
  async arrive(syncedAt: Date): Promise<number> {
    let records = 0;
    for (const { deviceId, sent, syncedAt: at } of this.syncs) {
      if (at.getTime() !== syncedAt.getTime()) continue;
      const { answered } = await this.story.server.received(deviceId, {
        ...sent,
        clockAt: this.story.clock.now(),
      });
      for (const answer of [...answered.records, ...answered.photos]) {
        if (answer.answer !== 'SAVED') throw new Error(`Not saved: ${answer.answer}`);
      }
      records += answered.records.length;
    }
    return records;
  }

  // The photographs' records the syncs sent at that time carried, each now in a sync of its own
  // from its phone, after its record has arrived: a phone on a thin connection. How many; one
  // not saved stops the story.
  async photosArrive(syncedAt: Date): Promise<number> {
    let sent = 0;
    for (const { deviceId, sent: held, syncedAt: at } of this.syncs) {
      if (at.getTime() !== syncedAt.getTime()) continue;
      for (const photo of held.photos) {
        const { photos } = await synced(this.story, deviceId, timeZone, {
          photos: [JSON.parse(JSON.stringify(photo)) as RecordedPhoto],
        });
        for (const answer of photos) {
          if (answer.answer !== 'SAVED') throw new Error(`Not saved: ${answer.answer}`);
        }
        sent += photos.length;
      }
    }
    return sent;
  }

  // How many photographs' records the syncs sent at that time carried, after their records:
  // Jo's crew photograph with each unit rate ticket (golden mission §2).
  photosAt(syncedAt: Date): number {
    return this.syncs
      .filter(({ syncedAt: at }) => at.getTime() === syncedAt.getTime())
      .reduce((count, { sent }) => count + sent.photos.length, 0);
  }
}

// The pay items a rule adds and no monitor picks, by their codes, and the fill's rule.
export interface P1Pricing {
  readonly payItems: Readonly<Record<string, string>>;
  readonly forms: { readonly load: string; readonly haulOut: string; readonly unitRate: string };
  readonly vegetative: string;
  // "STP-FILL-CY - Stump hole fill", the one rule Dana writes in the rule builder.
  readonly fillRule: {
    readonly id: string;
    readonly input: Parameters<RuleSetup['save']>[1];
  };
}

// A pay item's capture settings, none ticked.
export const unticked = {
  kindOfWorkId: null,
  bandFrom: null,
  bandTo: null,
  countIsAlwaysOne: false,
  gpsRequired: false,
  measurementRequired: false,
  decimalsAllowed: false,
  photosRequired: false,
  monitorMayMarkIneligible: false,
  quantityFromCarriedTickets: false,
  crewTimeConversion: null,
  crewDayHours: null,
} as const;

// Dana enters what the story `p1-field-days` leaves out of P1's pricing (golden mission §1, as
// the story `setup` tells it step by step): the load, haul-out, fee, fill and freon pay items
// with Coastline's rate on each, the Landfill's link to its tipping fee pay item, and every
// rule, each naming "Coastline, Bayline ROW 2026". A pay item's "Pays when" writes its rule; the
// stump hole fill's is written in the rule builder.
export async function setUpP1Pricing(
  story: StoryContext,
  office: Pick<P1Office, 'dana' | 'p1' | 'coastline' | 'contract' | 'landfill' | 'cypress'>,
): Promise<P1Pricing> {
  const { api, clock } = story;
  const { dana, p1, coastline, contract, landfill, cypress } = office;
  const payItems = new PayItemSetup(api, clock, story.policy);
  const lists = new ListSetup(api, clock, story.policy);

  const payableType = async (name: string): Promise<string> =>
    (await api.payableType.findFirstOrThrow({ where: { name } })).id;
  await saved(lists.payableType(dana, 'Stump fill'));
  await saved(lists.payableType(dana, 'Freon recovery'));
  const enter = async (
    code: string,
    description: string,
    type: string,
    unit: NewPayItem['unit'],
    rate: string,
  ): Promise<void> => {
    await saved(
      payItems.payItem(dana, {
        ...unticked,
        projectId: p1,
        code,
        description,
        payableTypeId: await payableType(type),
        unit,
        rates: [{ primeId: coastline, rate }],
      }),
    );
  };
  await enter('VEG-HAUL-CY-15', 'ROW VEG haul 0–15 mi', 'Vegetative', 'CY', '7.50');
  await enter('VEG-HAUL-CY-30', 'ROW VEG haul 15.1–30 mi', 'Vegetative', 'CY', '8.90');
  await enter('CD-HAUL-CY-15', 'ROW C&D haul 0–15 mi', 'C&D', 'CY', '8.25');
  await enter('MULCH-HO-CY', 'Mulch haul-out to FDS', 'Vegetative', 'CY', '5.10');
  await enter('MULCH-HO-TN', 'Mulch haul-out to FDS, by weight', 'Vegetative', 'TN', '20.00');
  await enter(
    'TIP-FEE-CY-BCL',
    'Tipping fee, Bayline County Landfill',
    'Tipping fee',
    'CY',
    '4.00',
  );
  await enter('STP-FILL-CY', 'Stump hole fill', 'Stump fill', 'CY', '22.00');
  await enter('WG-FRN-EA', 'Freon recovered', 'Freon recovery', 'EA', '25.00');
  const ids = Object.fromEntries(
    (await api.payItem.findMany({ where: { projectId: p1 } })).map((each) => [each.code, each.id]),
  );
  const id = (code: string): string => {
    const found = ids[code];
    if (found === undefined) throw new Error(`No pay item ${code}`);
    return found;
  };
  await saved(
    new SiteSetup(api, clock, story.policy).tippingFee(dana, landfill, id('TIP-FEE-CY-BCL')),
  );

  const form = async (documentType: 'LOAD' | 'HAUL_OUT' | 'UNIT_RATE'): Promise<string> =>
    (await api.form.findFirstOrThrow({ where: { projectId: p1, documentType } })).id;
  const forms = {
    load: await form('LOAD'),
    haulOut: await form('HAUL_OUT'),
    unitRate: await form('UNIT_RATE'),
  };
  const entry = async (formId: string, name: string): Promise<string> =>
    (await api.formDebrisType.findFirstOrThrow({ where: { formId, debrisType: { name } } })).id;
  const itemName = async (name: string): Promise<string> =>
    (await api.itemName.findFirstOrThrow({ where: { name } })).id;
  const vegetative = await entry(forms.load, 'Vegetative');
  const debris = (entryId: string): CriterionInput => ({
    criterion: 'DEBRIS_TYPE',
    operator: 'EQUALS',
    picks: [entryId],
  });
  const within15: CriterionInput = { criterion: 'MILEAGE', operator: 'AT_MOST', numberFrom: 15 };
  const dumpedAt = (siteId: string): CriterionInput => ({
    criterion: 'DISPOSAL_SITE',
    operator: 'EQUALS',
    picks: [siteId],
  });
  const payItemIs = (...payItemIds: string[]): CriterionInput => ({
    criterion: 'PAY_ITEM',
    operator: payItemIds.length === 1 ? 'EQUALS' : 'IS_ONE_OF',
    picks: payItemIds,
  });
  const pays = async (
    code: string,
    formId: string,
    criteria: CriterionInput[],
    slot = 1,
  ): Promise<void> => {
    await saved(payItems.paysWhen(dana, id(code), [{ formId, slot, criteria }]));
  };

  await pays('VEG-HAUL-CY-15', forms.load, [debris(vegetative), within15]);
  await pays('VEG-HAUL-CY-30', forms.load, [
    debris(vegetative),
    { criterion: 'MILEAGE', operator: 'BETWEEN', numberFrom: 15.1, numberTo: 30 },
  ]);
  await pays('CD-HAUL-CY-15', forms.load, [debris(await entry(forms.load, 'C&D')), within15]);
  // The site's tipping fee: the same pay item on a load and on a haul-out dumped there, a rule
  // for each form (ADR-292).
  await saved(
    payItems.paysWhen(dana, id('TIP-FEE-CY-BCL'), [
      { formId: forms.load, slot: 2, criteria: [dumpedAt(landfill)] },
      { formId: forms.haulOut, slot: 2, criteria: [dumpedAt(landfill)] },
    ]),
  );
  const mulch = await entry(forms.haulOut, 'Mulch');
  await pays('MULCH-HO-CY', forms.haulOut, [debris(mulch), dumpedAt(landfill)]);
  await pays('MULCH-HO-TN', forms.haulOut, [debris(mulch), dumpedAt(cypress)]);
  for (const code of [
    'HNG-RMV-EA',
    'LNR-RMV-EA-24',
    'LNR-RMV-EA-99',
    'STP-RMV-EA-36',
    'STP-RMV-EA-48',
    'CREW-TIME-HR',
  ]) {
    await pays(code, forms.unitRate, [payItemIs(id(code))]);
  }
  // White goods: the rules, never a setting on the item, say which items count toward which pay
  // item (spec/RULES.md §9).
  const freonRecovered = await itemName('Fridge, freon recovered');
  const removed = await Promise.all(
    ['Washer', 'Dryer', 'Fridge, freon recovered', 'Fridge, no freon', 'Oven', 'Microwave'].map(
      itemName,
    ),
  );
  await saved(
    payItems.paysWhen(dana, id('WG-RMV-EA'), [
      {
        formId: forms.unitRate,
        slot: 1,
        criteria: [payItemIs(id('WG-RMV-EA'))],
        quantityFrom: 'CHOSEN_ITEMS',
        itemNameIds: removed,
      },
    ]),
  );
  await saved(
    payItems.paysWhen(dana, id('WG-FRN-EA'), [
      {
        formId: forms.unitRate,
        slot: 2,
        criteria: [
          payItemIs(id('WG-RMV-EA')),
          { criterion: 'ITEM', operator: 'AT_LEAST', picks: [freonRecovered], numberFrom: 1 },
        ],
        quantityFrom: 'CHOSEN_ITEMS',
        itemNameIds: [freonRecovered],
      },
    ]),
  );
  const fill = {
    projectId: p1,
    formId: forms.unitRate,
    name: 'STP-FILL-CY - Stump hole fill',
    contractId: contract,
    active: true,
    criteria: [payItemIs(id('STP-RMV-EA-36'), id('STP-RMV-EA-48'))],
    actions: [{ kind: 'ADD_TRANSACTION', slot: 2, payItemId: id('STP-FILL-CY') }],
  } as const;
  const fillRule = await saved(new RuleSetup(api, clock, story.policy).save(dana, fill));
  return { payItems: ids, forms, vegetative, fillRule: { id: fillRule.id, input: fill } };
}
