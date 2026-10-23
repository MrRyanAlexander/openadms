// The sample projects (the user, 2026-10-22: "when a firm installs it, we want to have 1 test
// project setup already in there with data for each thing loaded … Just make it make sense so
// when a firm installs it this data is there"). Two projects of the golden mission's example world
// (spec/golden/MISSION.md, spec/CONVENTIONS.md §6), a ROW project and a PPDR project, named so a
// firm tells them from its own work (sample-names.ts), holding at least one of each thing:
//
// - every field event kind and workflow: loads, a split load, haul-outs, a haul-out loaded from
//   three piles and weighed, unit rate work of every kind the firm's list ships (hangers,
//   leaners, stumps with their fill, white goods with their freon, HHW, crew time);
// - every form: ROEs, pre- and post-work surveys, incidents of every incident type the firm's list
//   holds, a citizen drop-off log; container and crew certifications;
// - a site of every site type; every status (PENDING, COMPLETED, MANUAL_REVIEW, VOID) and every QC
//   status; a renumber, voids, accepted flags, a quarantined duplicate; an invoice batch; the
//   dispatch board, the time clock's entries and an approved day.
//
// **Loaded through the real paths, as the people who would make it** (sample-people.ts,
// sample-setup.ts, sample-field.ts, sample-office.ts): its setup at the setup screens' endpoints;
// its field events on enrolled phones, each proving itself with its own key, and synced; the
// worker concluding everything the system writes; its review, QC and lock at the reviewers'
// endpoints. Nothing derived and no evidence is written into the database by hand, and no guard
// or grant is stepped round. It is told on the golden mission's own days in October 2026, so what
// the worker concludes is known.
//
// **Ready to try the field app on the day it is loaded** (the user, 2026-10-23: "when running
// start has things loaded ready to test out, the final report should also show the field app
// login details"): every phone it enrolled is synced and turned in, its key revoked, and its two
// managers/analysts are archived and signed out; its six monitors stay in service, each with that
// day's assignment on the dispatch board, and their sign-ins (Monitor ID and the password made
// up for them) are handed back to whoever loaded it, to be shown once and kept nowhere else by
// this module. The firm archives them in the back office once it has looked round.
//
// **The passcode first**: its phones are enrolled under the master passcode before anything
// else is written, so a passcode that isn't the firm's stops the load with nothing of it made.
//
// **Once per installation**: its records are how the installation remembers it. Loaded already,
// a load does nothing. Found part-loaded (a load that stopped half-way, the user's installation
// on 2026-10-23), what that load made is put away first, never deleted (its projects closed, its
// client, declaration event, contractors and people archived, each named as a stopped load's),
// and the sample is loaded afresh.
import type { Database } from '@open-adms/db';

import type { StoryContext } from '../runner.ts';
import { archived, madeOnTheServer, stoppedReason } from './sample-people.ts';
import { enrolledPhones, SampleField, type SampleSignIn } from './sample-field.ts';
import { sample, sampleDay, sampleMonitors, sampleOffice } from './sample-names.ts';
import { SampleOffice } from './sample-office.ts';
import { SampleSetup } from './sample-setup.ts';
import { SampleWorker } from './sample-worker.ts';

// When a load begins: Thursday 8 October 2026, 08:00 in the projects' time zone.
export const sampleStart = sampleDay('08', '08:00');

export type SampleStanding = 'NOT_LOADED' | 'LOADED' | 'PARTLY_LOADED';

export type SampleLoaded =
  | {
      readonly loaded: true;
      readonly p1: string;
      readonly p2: string;
      // The day its monitors' assignments are for, and how each signs in.
      readonly workDate: string;
      readonly signIns: readonly SampleSignIn[];
      // Whether a stopped load's records were put away first.
      readonly putAway: boolean;
    }
  | { readonly loaded: false; readonly standing: 'LOADED' };

// The day the sample's monitors are given work on, and when Luis writes it: by default today in
// the projects' time zone, now; never before the sample's own days are done.
export interface SampleToday {
  readonly workDate: string;
  readonly at: Date;
}

const sampleDone = new Date(sampleDay('15', '16:00'));

export function sampleToday(now = new Date()): SampleToday {
  const at = now > sampleDone ? now : new Date(sampleDay('15', '16:30'));
  return { workDate: at.toLocaleDateString('en-CA', { timeZone: sample.timeZone }), at };
}

// The sample's two managers/analysts in service, by their addresses.
const inServiceOffice = {
  archivedAt: null,
  email: { in: [sampleOffice.dana.email, sampleOffice.luis.email] },
};

// How the installation stands for the sample, read from its records: none of it; all of it (its
// batch made and its managers/analysts put away); or some of it.
export async function sampleStanding(api: Database): Promise<SampleStanding> {
  const client = await api.client.findFirst({
    where: { name: sample.client, archivedAt: null },
    select: { id: true },
  });
  if (client === null) return 'NOT_LOADED';
  const batch = await api.invoiceBatch.findFirst({
    where: { name: sample.batch, project: { name: sample.projects.row, clientId: client.id } },
    select: { id: true },
  });
  const inService = await api.user.count({ where: inServiceOffice });
  return batch !== null && inService === 0 ? 'LOADED' : 'PARTLY_LOADED';
}

// What a load that stopped half-way made, put away: its projects closed, its firm-wide records
// and its people archived, each renamed as a stopped load's so it is never taken for the sample,
// written as the sample's own manager/analyst who made it, with the reason said. Nothing is
// deleted. A load stopped before Dana was made has left nothing to put away.
async function putAwayStopped(api: Database, now: Date): Promise<void> {
  const people = await api.user.findMany({ where: inServiceOffice, select: { id: true } });
  const [maker] = people;
  if (maker === undefined) return;
  const stopped = (name: string) =>
    `${name} (a stopped load, put away ${now.toLocaleDateString('en-CA', { timeZone: sample.timeZone })})`;
  await api.$write(
    { actorId: maker.id, source: 'BACK_OFFICE', reason: stoppedReason },
    async (tx) => {
      for (const client of await tx.client.findMany({
        where: { name: sample.client, archivedAt: null },
        include: { projects: { where: { closedAt: null } } },
      })) {
        for (const project of client.projects) {
          await tx.project.update({
            where: { id: project.id },
            data: { name: stopped(project.name), closedAt: now },
          });
        }
        await tx.client.update({
          where: { id: client.id },
          data: { name: stopped(client.name), archivedAt: now },
        });
      }
      for (const event of await tx.declarationEvent.findMany({
        where: { name: sample.declarationEvent.name, archivedAt: null },
      })) {
        await tx.declarationEvent.update({
          where: { id: event.id },
          data: { name: stopped(event.name), archivedAt: now },
        });
      }
      for (const contractor of await tx.contractor.findMany({
        where: { name: { in: [sample.prime, sample.sub] }, archivedAt: null },
      })) {
        await tx.contractor.update({
          where: { id: contractor.id },
          data: { name: stopped(contractor.name), archivedAt: now },
        });
      }
    },
  );
  const monitors = await api.user.findMany({
    where: { archivedAt: null, role: 'MONITOR', name: { in: Object.values(sampleMonitors) } },
    select: { id: true },
  });
  await archived(
    api,
    now,
    [...people, ...monitors].map(({ id }) => id),
    stoppedReason,
  );
}

// The sample loaded on a stage whose clock stands at `sampleStart`, its monitors given work on
// `today`; nothing done where it is loaded already.
export async function loadSample(
  story: StoryContext,
  today: SampleToday = sampleToday(),
): Promise<SampleLoaded> {
  const standing = await sampleStanding(story.api);
  if (standing === 'LOADED') return { loaded: false, standing };
  const { clock } = story;
  const worker = new SampleWorker(story);

  // Thursday first thing: the phones enrolled under the master passcode, which proves it before
  // anything is written; then what a stopped load left is put away.
  clock.set(sampleDay('08', '08:02'));
  let phones: Awaited<ReturnType<typeof enrolledPhones>>;
  try {
    phones = await enrolledPhones(story);
  } catch (problem) {
    if (problem instanceof Error && problem.message.includes('MASTER_PASSCODE_REFUSED')) {
      throw new Error(
        'That is not the firm’s master passcode, so nothing of the sample was loaded. Run `pnpm sample` and type the passcode the installation was set up with.',
        { cause: problem },
      );
    }
    throw problem;
  }
  const putAway = standing === 'PARTLY_LOADED';
  if (putAway) await putAwayStopped(story.api, clock.now());

  // Then Dana and Luis, made on the server, sign in; Dana sets both projects up; the monitors
  // are created at the yard.
  clock.set(sampleDay('08', '08:05'));
  const dana = await madeOnTheServer(story, sampleOffice.dana);
  const luis = await madeOnTheServer(story, sampleOffice.luis);
  clock.set(sampleDay('08', '08:30'));
  const set = await new SampleSetup(dana, story.api).done();
  await worker.settled([set.p1, set.p2]);
  const field = new SampleField(story, luis, set, worker, phones);
  await field.monitorsCreated();

  // Saturday's certifications; Monday to Wednesday in the field.
  await field.certified();
  await field.days();

  // Thursday: review, QC, the lock and the time clock's day.
  const office = new SampleOffice(story.api, luis, set, worker);
  clock.set(sampleDay('15', '08:30'));
  await office.reviewed();
  clock.set(sampleDay('15', '10:00'));
  await office.qcd();
  clock.set(sampleDay('15', '11:00'));
  await office.locked();
  clock.set(sampleDay('15', '11:30'));
  await office.approved(dana, field.assignmentOf('14', 'ana', 'col', set.p1));

  // The end: every phone synced and turned in, its key revoked. Then, on the day it is loaded,
  // Luis gives the six monitors that day's work, and the managers/analysts are put away.
  clock.set(sampleDay('15', '16:00'));
  for (const phone of field.enrolled) {
    const answer = await story.underPasscode.turnIn(phone);
    if (!answer.turnedIn) throw new Error(`${phone.name} wasn’t turned in: ${answer.message}`);
  }
  await worker.settled([set.p1, set.p2]);
  clock.set(today.at.toISOString());
  const signIns = await field.readyToTry(today.workDate);
  await archived(story.api, clock.now(), [dana.userId, luis.userId]);
  return {
    loaded: true,
    p1: set.p1,
    p2: set.p2,
    workDate: today.workDate,
    signIns,
    putAway,
  };
}
