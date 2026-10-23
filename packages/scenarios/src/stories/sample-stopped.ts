// A load of the sample projects that stopped half-way, loaded again (sample/sample-projects.ts;
// the user's installation on 2026-10-23: a master passcode that wasn't the firm's stopped the load
// at its first phone, after both projects were set up, and every load after it did nothing). The
// stopped load is told as it stood then: its managers/analysts made and the projects set up, no
// phone enrolled. Loaded again, what it made is put away, never deleted: its projects closed, its
// client, declaration event, contractors and people archived, each named as a stopped load's;
// then the sample is loaded afresh beside it, whole.
import type { Story } from '../runner.ts';
import { madeOnTheServer } from '../sample/sample-people.ts';
import { sample, sampleOffice } from '../sample/sample-names.ts';
import { loadSample, sampleStanding, sampleStart } from '../sample/sample-projects.ts';
import { SampleSetup } from '../sample/sample-setup.ts';

const today = { workDate: '2026-10-16', at: new Date('2026-10-16T07:00:00-04:00') };
// The stopped load, the day before the sample's own start (a story's clock never goes back).
const stoppedAt = '2026-10-07T09:00:00-04:00';
const stoppedName = (name: string) => `${name} (a stopped load, put away 2026-10-08)`;

export const sampleStopped: Story = {
  name: 'sample-stopped',
  title:
    'a load of the sample projects that stopped half-way, loaded again: what it made put away, never deleted, and the sample loaded whole',
  timeZone: sample.timeZone,
  start: stoppedAt,
  ownPort: true,

  async run(story) {
    const { api, clock } = story;
    story.at(stoppedAt, 'A load of the sample stops after its setup');
    const dana = await madeOnTheServer(story, sampleOffice.dana);
    await madeOnTheServer(story, sampleOffice.luis);
    await new SampleSetup(dana, api).done();
    story.check('the sample stands part-loaded', await sampleStanding(api), 'PARTLY_LOADED');
    const before = await api.auditRecord.count();

    clock.set(sampleStart);
    const loaded = await loadSample(story, today);
    if (!loaded.loaded) throw new Error(`The sample wasn’t loaded: ${loaded.standing}.`);
    story.at('2026-10-16T07:30:00-04:00', 'Loaded again');
    story.check(
      'the stopped load was put away first, and the sample now stands loaded',
      [loaded.putAway, await sampleStanding(api)],
      [true, 'LOADED'],
    );
    const projects = await api.project.findMany({
      include: { client: true },
      orderBy: [{ createdAt: 'asc' }, { name: 'desc' }],
    });
    story.check(
      'the stopped load’s projects closed under its archived client, named as a stopped load’s; the sample’s two open beside them',
      projects.map((project) => [
        project.name,
        project.closedAt === null ? 'open' : 'closed',
        project.client.name,
        project.client.archivedAt === null ? 'in service' : 'archived',
      ]),
      [
        [stoppedName(sample.projects.row), 'closed', stoppedName(sample.client), 'archived'],
        [stoppedName(sample.projects.ppdr), 'closed', stoppedName(sample.client), 'archived'],
        [sample.projects.row, 'open', sample.client, 'in service'],
        [sample.projects.ppdr, 'open', sample.client, 'in service'],
      ],
    );
    story.check(
      'its declaration event and contractor archived and renamed; no record deleted, every change audited',
      [
        (await api.declarationEvent.findMany({ where: { archivedAt: { not: null } } })).map(
          (event) => event.name,
        ),
        (
          await api.contractor.findMany({
            where: { archivedAt: { not: null } },
            orderBy: { name: 'asc' },
          })
        ).map((contractor) => contractor.name),
        // A transaction removed when its ticket is reprocessed is the only row ever taken away,
        // copied in full to the audit log first (ADR-085).
        [
          ...new Set(
            (
              await api.auditRecord.findMany({
                where: { operation: 'DELETE' },
                select: { tableName: true },
              })
            ).map((record) => record.tableName),
          ),
        ],
        (await api.auditRecord.count()) > before,
      ],
      [
        [stoppedName(sample.declarationEvent.name)],
        [stoppedName(sample.prime)],
        ['transaction'],
        true,
      ],
    );
    story.check(
      'the sample loaded whole: every kind of field event, and its monitors’ sign-ins handed back',
      [
        (
          await api.fieldEvent.groupBy({
            by: ['kind'],
            where: { projectId: { in: [loaded.p1, loaded.p2] } },
            orderBy: { kind: 'asc' },
          })
        ).map((group) => group.kind),
        loaded.signIns.length,
      ],
      [['COLLECTION', 'DISPOSAL', 'HAUL_OUT_COLLECTION', 'HAUL_OUT_DISPOSAL', 'UNIT_RATE'], 6],
    );
  },
};
