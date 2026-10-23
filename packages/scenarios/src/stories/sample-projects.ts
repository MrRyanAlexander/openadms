// The sample projects a firm finds on a fresh installation (the user, 2026-10-22; sample/
// sample-projects.ts): loaded into a story's own database, as `pnpm sample` loads them into an
// installation's, through the same loader and the same real paths: setup at the setup screens'
// endpoints, field events from enrolled phones' syncs, the worker's conclusions, the review, QC
// and lock at the reviewers' endpoints. The story checks that every kind of thing is there, that
// its phones are turned in and its managers/analysts put away while its monitors stay ready to
// try the field app as, with the day's work, and that a second load finds it and does nothing.
//
// Its API listens on a loopback port of its own (`ownPort`), as an installation's sample load's
// does, never the stories' one a browser test may be holding.
import type { Story } from '../runner.ts';
import { sample, sampleMonitors, sampleOffice } from '../sample/sample-names.ts';
import { loadSample, sampleStanding, sampleStart } from '../sample/sample-projects.ts';

// The day the story loads it on: the Friday after its own days.
const today = { workDate: '2026-10-16', at: new Date('2026-10-16T07:00:00-04:00') };
import { taken } from './board.ts';
import { goldenOutcomes, ledgerLine, totalOf } from './golden-outcomes.ts';

// Each ticket of the sample, as its field events stand: its number and its one status.
const ticketsAtTheEnd = {
  p1: [
    '101001 COMPLETED',
    '101002 COMPLETED',
    '101003 COMPLETED',
    '101004 COMPLETED',
    '101005 COMPLETED',
    '101006 COMPLETED',
    '101007 MANUAL_REVIEW',
    '101008 COMPLETED',
    '101009 PENDING',
    '201001 COMPLETED',
    '201004 COMPLETED',
    '301001 COMPLETED',
    '301002 COMPLETED',
    '301003 VOID',
    '301004 COMPLETED',
    '301005 VOID',
    '301006 COMPLETED',
    '301007 COMPLETED',
    '301008 COMPLETED',
  ],
  p2: ['102001 COMPLETED'],
};

export const sampleProjects: Story = {
  name: 'sample-projects',
  title:
    'the sample projects: a ROW and a PPDR project holding every kind of record, loaded through the real paths, its monitors ready to try the field app as, loaded once',
  timeZone: sample.timeZone,
  start: sampleStart,
  ownPort: true,

  async run(story) {
    const { api } = story;
    story.at(sampleStart, 'A fresh installation: none of the sample is there');
    story.check('nothing of the sample is there yet', await sampleStanding(api), 'NOT_LOADED');
    const loaded = await loadSample(story, today);
    if (!loaded.loaded) throw new Error(`The sample wasn’t loaded: ${loaded.standing}.`);
    const { p1, p2 } = loaded;
    const both = { projectId: { in: [p1, p2] } };
    story.at(
      '2026-10-16T07:30:00-04:00',
      'Loaded: set up, certified, worked Monday to Wednesday, reviewed, QC’d and locked; the phones turned in, the managers/analysts put away, the monitors given Friday’s work',
    );

    story.check(
      'two projects, a ROW one and a PPDR one, under the sample’s client, its declaration event and its prime',
      (
        await api.project.findMany({
          where: { id: { in: [p1, p2] } },
          include: { client: true, declarationEvent: true, programType: true },
          orderBy: { name: 'desc' },
        })
      ).map((project) => [
        project.name,
        project.programType.name,
        project.client.name,
        project.declarationEvent.name,
      ]),
      [
        [sample.projects.row, 'ROW', sample.client, sample.declarationEvent.name],
        [sample.projects.ppdr, 'PPDR', sample.client, sample.declarationEvent.name],
      ],
    );

    const events = await api.fieldEvent.findMany({
      where: both,
      include: { kindOfWork: true },
      orderBy: [{ ticketNumber: 'asc' }, { splitSuffix: 'asc' }, { kind: 'asc' }],
    });
    story.check(
      'every kind of field event, in every workflow: loads, haul-outs and unit rate work on the ROW project; loads on the PPDR project',
      [p1, p2].map((projectId) =>
        [
          ...new Set(
            events
              .filter((event) => event.projectId === projectId)
              .map((event) => `${event.workflow} ${event.kind}`),
          ),
        ].sort(),
      ),
      [
        [
          'HAUL_OUT HAUL_OUT_COLLECTION',
          'HAUL_OUT HAUL_OUT_DISPOSAL',
          'LOAD COLLECTION',
          'LOAD DISPOSAL',
          'UNIT_RATE UNIT_RATE',
        ],
        ['LOAD COLLECTION', 'LOAD DISPOSAL'],
      ],
    );
    const suffixes = (projectId: string, ticketNumber: string) =>
      events
        .filter((event) => event.projectId === projectId && event.ticketNumber === ticketNumber)
        .map((event) => `${event.kind} ${event.splitSuffix === '' ? '–' : event.splitSuffix}`)
        .sort();
    story.check(
      'a split load (102001, two properties) and a split haul-out (201004, three piles, weighed at the scale)',
      [
        suffixes(p2, '102001'),
        suffixes(p1, '201004'),
        (await api.scaleReceipt.findMany({ where: { projectId: p1 } })).map(
          (receipt) => `${receipt.receiptNumber} ${receipt.netWeightTons?.toFixed(2) ?? ''}`,
        ),
      ],
      [
        ['COLLECTION A', 'COLLECTION B', 'DISPOSAL –'],
        [
          'HAUL_OUT_COLLECTION A',
          'HAUL_OUT_COLLECTION B',
          'HAUL_OUT_COLLECTION C',
          'HAUL_OUT_DISPOSAL –',
        ],
        ['CCL-51207 24.00'],
      ],
    );
    const kindsOfWork = (await api.kindOfWork.findMany({ where: { archivedAt: null } }))
      .map((kind) => kind.name)
      .sort();
    story.check(
      'unit rate work of every kind the firm’s list holds',
      [
        ...new Set(
          events.flatMap((event) => (event.kindOfWork === null ? [] : [event.kindOfWork.name])),
        ),
      ].sort(),
      kindsOfWork,
    );

    const forms = await Promise.all([
      api.roe.findMany({ where: both, orderBy: { roeNumber: 'asc' } }),
      api.survey.findMany({ where: both, include: { workType: true } }),
      api.incident.findMany({ where: both, include: { incidentType: true } }),
      api.dropOffLog.count({ where: both }),
      api.incidentType.findMany({ where: { archivedAt: null } }),
    ]);
    const [roes, surveys, incidents, dropOffs, incidentTypes] = forms;
    story.check(
      'every form: ROEs, pre- and post-work surveys, an incident of every incident type the firm’s list holds, a citizen drop-off log',
      [
        roes.map((roe) => `${roe.roeNumber} ${roe.address ?? ''}`),
        surveys.map((survey) => survey.workType.name).sort(),
        incidents.map((incident) => incident.incidentType.name).sort(),
        dropOffs,
      ],
      [
        ['R-0007 412 Cedar Ct', 'R-0008 416 Cedar Ct'],
        ['Post-work survey', 'Post-work survey', 'Pre-work survey', 'Pre-work survey'],
        incidentTypes.map((type) => type.name).sort(),
        1,
      ],
    );
    story.check(
      'container and crew certifications, each with its five photographs',
      (
        await api.certification.findMany({
          where: both,
          orderBy: [{ projectId: 'asc' }, { certNumber: 'asc' }],
          include: { _count: { select: { photos: true } } },
        })
      ).map(
        (certification) =>
          `${certification.projectId === p1 ? 'P1' : 'P2'} ${certification.certNumber} ${certification.kind} ${String(certification._count.photos)} photos`,
      ),
      [
        'P1 730415 CONTAINER 5 photos',
        'P1 730416 CONTAINER 5 photos',
        'P1 730417 CREW 5 photos',
        'P1 730418 CREW 5 photos',
        'P1 730419 CONTAINER 5 photos',
        'P2 730416 CONTAINER 5 photos',
      ],
    );
    story.check(
      'a site of every site type the firm’s list holds',
      [
        ...new Set(
          (
            await api.disposalSite.findMany({
              where: { projectId: p1 },
              include: { siteType: true },
            })
          ).map((site) => site.siteType.name),
        ),
      ].sort(),
      (await api.siteType.findMany({ where: { archivedAt: null } }))
        .map((type) => type.name)
        .sort(),
    );

    const ticketsOf = (projectId: string) => [
      ...new Set(
        events
          .filter((event) => event.projectId === projectId)
          .map((event) => `${event.ticketNumber} ${event.status}`),
      ),
    ];
    story.check(
      'every status: COMPLETED; MANUAL_REVIEW (dumped at an ineligible site, left for the firm); PENDING (a load waiting for its disposal); VOID (a duplicate hanger, an under-size stump)',
      { p1: ticketsOf(p1), p2: ticketsOf(p2) },
      ticketsAtTheEnd,
    );
    story.check(
      'what is left in review for the firm: the load dumped at Old Quarry Pit, and the site’s own outstanding permit',
      (
        await api.flag.findMany({
          where: { projectId: p1, clearedAt: null, acceptances: { none: {} } },
          orderBy: { id: 'asc' },
        })
      ).map((flag) => flag.message),
      [
        'Old Quarry Pit: permit outstanding.',
        'Ticket 101007: dumped at Old Quarry Pit, an ineligible site. Flagged for review.',
      ],
    );
    story.check(
      'a renumber, two accepted flags, two voids and a quarantined duplicate, left for the firm',
      [
        (await api.auditRecord.count({
          where: {
            tableName: 'field_event',
            operation: 'UPDATE',
            changedFields: { has: 'ticket_number' },
            source: 'BACK_OFFICE',
          },
        })) >= 1,
        await api.flagAcceptance.count({ where: { flag: { projectId: p1 } } }),
        await api.ticketVoid.count({ where: { projectId: p1 } }),
        (await api.quarantinedRecord.findMany({ where: { projectId: p1 } })).map(
          (held) => `${held.reason} ${held.resolvedAt === null ? 'waiting' : 'resolved'}`,
        ),
      ],
      [true, 2, 2, ['DUPLICATE_FIELD_EVENT waiting']],
    );
    story.check(
      'every QC status, each set by hand',
      [...new Set((await api.qcMark.findMany({ where: both })).map((mark) => mark.status))].sort(),
      ['QC_APPROVED', 'QC_ISSUES', 'QC_REVIEW', 'QC_VOID'],
    );
    story.check(
      'an invoice batch on the ROW project with its locked tickets, and the PPDR split load locked on its own',
      [
        (
          await api.invoiceBatch.findMany({
            where: both,
            include: { _count: { select: { locks: true } } },
          })
        ).map((batch) => `${batch.name} ${String(batch._count.locks)}`),
        await api.invoiceLock.count({ where: { projectId: p2, invoiceBatchId: null } }),
      ],
      [[`${sample.batch} 14`], 1],
    );
    story.check(
      'the dispatch board, the time clock’s entries and an approved day',
      [
        await api.assignment.count({ where: both }),
        await api.clockEntry.count({ where: { projectId: p1 } }),
        await api.dayApproval.count({ where: { assignment: { projectId: p1 } } }),
      ],
      [26, 6, 1],
    );

    // The ledger, line by line (golden mission §4's, and what the sample adds).
    const ledger = async (projectId: string) =>
      (
        await api.transaction.findMany({
          where: { projectId },
          include: {
            payItem: true,
            completedLoad: true,
            completedLoadCollection: true,
            completedHaulOut: true,
            completedHaulOutCollection: true,
            fieldEvent: true,
          },
        })
      )
        .map((line) =>
          ledgerLine({
            ticketNumber:
              line.completedLoad?.ticketNumber ??
              line.completedHaulOut?.ticketNumber ??
              line.fieldEvent?.ticketNumber ??
              '',
            splitSuffix:
              line.completedLoadCollection?.splitSuffix ??
              line.completedHaulOutCollection?.splitSuffix ??
              '',
            slot: line.slot,
            code: line.payItem.code,
            quantity: line.quantity.toString(),
            rate: line.rate.toString(),
            amount: line.amount.toString(),
          }),
        )
        .sort();
    const p1Ledger = await ledger(p1);
    const golden: readonly string[] = goldenOutcomes.reviewed.p1.ledger;
    const added = p1Ledger.filter((line) => !golden.includes(line));
    story.check(
      'the ROW project’s ledger holds the golden mission’s nineteen lines, and the sample’s Wednesday',
      [golden.every((line) => p1Ledger.includes(line)), added, totalOf(p1Ledger)],
      [
        true,
        [
          '101007 #1 VEG-HAUL-CY-15 39 × $7.50 = $292.50',
          '101008 #1 VEG-HAUL-CY-15 24 × $7.50 = $180.00',
          '301008 #1 HHW-RMV-LB 55 × $1.85 = $101.75',
        ],
        { lines: 22, total: '$6,122.50' },
      ],
    );
    story.check(
      'the PPDR project’s ledger is the golden mission’s: the split load, a line for each property',
      await ledger(p2),
      [...goldenOutcomes.reviewed.p2.ledger],
    );

    // Its phones turned in and its managers/analysts put away; its monitors ready to sign in.
    const people = await api.user.findMany({
      where: {
        OR: [
          { email: { in: [sampleOffice.dana.email, sampleOffice.luis.email] } },
          { name: { in: Object.values(sampleMonitors) } },
        ],
      },
      include: { sessions: { where: { revokedAt: null } } },
    });
    const devices = await api.device.findMany({ where: { name: { startsWith: 'Sample ' } } });
    story.check(
      'its two managers/analysts archived with no session, no admin; its eight phones turned in, each key revoked',
      [
        people
          .filter((person) => person.role !== 'MONITOR')
          .map(
            (person) =>
              `${person.name} ${person.archivedAt === null ? 'in service' : 'archived'} ${String(person.sessions.length)}`,
          )
          .sort(),
        people.filter((person) => person.role === 'ADMIN').length,
        devices.length,
        devices.filter((device) => device.keyRevokedAt === null).map((device) => device.name),
      ],
      [[`${sampleOffice.dana.name} archived 0`, `${sampleOffice.luis.name} archived 0`], 0, 8, []],
    );
    const board = await api.assignment.findMany({
      where: { ...both, workDate: new Date(`${today.workDate}T00:00:00Z`) },
      include: { person: true },
    });
    story.check(
      'its six monitors in service, each with Friday’s work on the board on no phone of its own, and their sign-ins handed back',
      [
        people.filter((person) => person.role === 'MONITOR' && person.archivedAt === null).length,
        board
          .map(
            (one) =>
              `${one.projectId === p1 ? 'P1' : 'P2'} ${one.person.name} ${one.deviceId ?? 'any phone'}`,
          )
          .sort(),
        loaded.workDate,
        loaded.signIns.map((monitor) => [monitor.name, /^M\d{6}$/.test(monitor.monitorNumber)]),
      ],
      [
        6,
        [
          `P1 ${sampleMonitors.ana} any phone`,
          `P1 ${sampleMonitors.jo} any phone`,
          `P1 ${sampleMonitors.kim} any phone`,
          `P1 ${sampleMonitors.sam} any phone`,
          `P1 ${sampleMonitors.tariq} any phone`,
          `P2 ${sampleMonitors.lee} any phone`,
        ],
        today.workDate,
        (['ana', 'kim', 'tariq', 'sam', 'jo', 'lee'] as const).map((key) => [
          sampleMonitors[key],
          true,
        ]),
      ],
    );
    // The firm tries it: its browser enrolled under the master passcode, a monitor signs in on
    // it with the sign-in handed back, and it takes Friday's work.
    const [first] = loaded.signIns;
    const ana = people.find((person) => person.name === first?.name);
    if (first === undefined || ana === undefined) throw new Error('No sign-in was handed back.');
    const browser = await story.enrolled('The firm’s browser');
    const takenId = await taken(story, { id: ana.id, ...first }, browser.id);
    story.check(
      'a monitor signs in on a phone the firm enrolled with the sign-in handed back, and it takes their work for the day',
      board.find((one) => one.id === takenId)?.person.name,
      sampleMonitors.ana,
    );

    story.at('2026-10-16T07:45:00-04:00', 'The sample is loaded again: it is there, so nothing');
    const counted = async (): Promise<number[]> => [
      await api.auditRecord.count(),
      await api.project.count(),
      await api.user.count(),
      await api.device.count(),
      await api.fieldEvent.count(),
    ];
    const before = await counted();
    story.check(
      'a second load finds the sample and does nothing',
      [await loadSample(story, today), await counted()],
      [{ loaded: false, standing: 'LOADED' }, before],
    );
  },
};
