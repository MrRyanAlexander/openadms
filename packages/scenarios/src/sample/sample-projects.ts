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
// **It leaves no way in behind it**: every phone it enrolled is synced and turned in, its key
// revoked; every one of its people is archived and signed out; no password it made is kept.
//
// **Once per installation**: its records are how the installation remembers it. Loaded already,
// a load does nothing; found part-loaded (a load stopped half-way), it does nothing either and
// says so, since nothing it made can be taken away again.
import type { Database } from '@open-adms/db';

import type { StoryContext } from '../runner.ts';
import { archived, madeOnTheServer } from './sample-people.ts';
import { SampleField } from './sample-field.ts';
import { sample, sampleDay, sampleMonitors, sampleOffice } from './sample-names.ts';
import { SampleOffice } from './sample-office.ts';
import { SampleSetup } from './sample-setup.ts';
import { SampleWorker } from './sample-worker.ts';

// When a load begins: Thursday 8 October 2026, 08:00 in the projects' time zone.
export const sampleStart = sampleDay('08', '08:00');

export type SampleStanding = 'NOT_LOADED' | 'LOADED' | 'PARTLY_LOADED';

export type SampleLoaded =
  | { readonly loaded: true; readonly p1: string; readonly p2: string }
  | { readonly loaded: false; readonly standing: Exclude<SampleStanding, 'NOT_LOADED'> };

// How the installation stands for the sample, read from its records: none of it; all of it (its
// batch made and its people put away); or some of it.
export async function sampleStanding(api: Database): Promise<SampleStanding> {
  const client = await api.client.findFirst({
    where: { name: sample.client },
    select: { id: true },
  });
  if (client === null) return 'NOT_LOADED';
  const batch = await api.invoiceBatch.findFirst({
    where: { name: sample.batch, project: { name: sample.projects.row, clientId: client.id } },
    select: { id: true },
  });
  const inService = await api.user.count({
    where: {
      archivedAt: null,
      OR: [
        { email: { in: [sampleOffice.dana.email, sampleOffice.luis.email] } },
        { name: { in: Object.values(sampleMonitors) }, role: 'MONITOR' },
      ],
    },
  });
  return batch !== null && inService === 0 ? 'LOADED' : 'PARTLY_LOADED';
}

// The sample loaded on a stage whose clock stands at `sampleStart`, or nothing done where any of
// it is there already.
export async function loadSample(story: StoryContext): Promise<SampleLoaded> {
  const standing = await sampleStanding(story.api);
  if (standing !== 'NOT_LOADED') return { loaded: false, standing };
  const { clock } = story;
  const worker = new SampleWorker(story);

  // Thursday: Dana and Luis, made on the server, sign in; Dana sets both projects up; the phones
  // are enrolled and the monitors created at the yard.
  clock.set(sampleDay('08', '08:05'));
  const dana = await madeOnTheServer(story, sampleOffice.dana);
  const luis = await madeOnTheServer(story, sampleOffice.luis);
  clock.set(sampleDay('08', '08:30'));
  const set = await new SampleSetup(dana, story.api).done();
  await worker.settled([set.p1, set.p2]);
  const field = new SampleField(story, luis, set, worker);
  await field.phonesAndMonitors();

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

  // The end: every phone synced and turned in, its key revoked; every person put away.
  clock.set(sampleDay('15', '16:00'));
  for (const phone of field.enrolled) {
    const answer = await story.underPasscode.turnIn(phone);
    if (!answer.turnedIn) throw new Error(`${phone.name} wasn’t turned in: ${answer.message}`);
  }
  await worker.settled([set.p1, set.p2]);
  await archived(story.api, clock.now(), [
    dana.userId,
    luis.userId,
    ...field.monitors.map((monitor) => monitor.id),
  ]);
  return { loaded: true, p1: set.p1, p2: set.p2 };
}
