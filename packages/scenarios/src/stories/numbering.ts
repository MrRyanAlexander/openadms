// The fifth story (BACKLOG 1.3.2; ADR-323): numbers, through the API's allocator
// (spec/parts/04-field-capture.md; spec/acceptance/04-field-capture.md AC-04-01, 04…09, 14;
// AC-03-06; ADR-056, 062, 065, 151, 181). P1 generates its numbers: each phone that makes them is
// cut a block of its series at a sync, gives it out in order offline, and is topped up to a full
// block when it reports the last number it used. A phone reset for someone else hands back what it
// didn't use, and the next phone is cut exactly that; a lost phone's block is retired whole. The
// database itself refuses a block that would put one number on two phones. Then a project numbered
// from control tickets: its ranges are entered, and only its unit rate tickets are generated.
//
// Not here: the sync that carries a top-up (Phase 2), the phone giving a number to a field event
// (BACKLOG 1.3.7), an ROE made with its number (1.3.6).
import { NumberAllocator, type Outcome, ProjectSetup } from '@open-adms/api';
import { NumberSeriesRules, PhoneNumbers } from '@open-adms/domain';

import { uuidv7 } from '../ids.ts';
import type { Story } from '../runner.ts';
import { p1TimeZone as timeZone, setUpP1 } from './p1.ts';

const on = (date: string, time: string): string => `2026-10-${date}T${time}:00-04:00`;

export const numbering: Story = {
  name: 'numbering',
  title:
    'phones are cut blocks of P1’s series and topped up; a reset phone hands its rest back; a lost phone’s block is retired; a control-ticket project has ranges',
  timeZone,
  start: on('12', '05:30'),

  async run(story) {
    const { api, clock } = story;
    const allocator = new NumberAllocator(api, clock, story.policy);
    const projects = new ProjectSetup(api, clock, story.policy);

    const saved = async <T>(attempt: Promise<Outcome<T>>): Promise<T> => {
      const outcome = await attempt;
      if (!outcome.saved) throw new Error(`Refused: ${outcome.refusal.message}`);
      return outcome.record;
    };
    const refused = async <T>(attempt: Promise<Outcome<T>>): Promise<string> => {
      const outcome = await attempt;
      return outcome.saved ? 'saved' : `${outcome.refusal.code}: ${outcome.refusal.message}`;
    };

    // ------------------------------------------------------------------------------------------
    story.at(on('12', '05:30'), 'Dana Reyes has set up P1 and enrolled its phones');
    // Each enrolled under the master passcode, with a key of its own (ADR-439, 440).
    const phones: Record<string, string> = {};
    for (const name of [
      'P1-COL-1',
      'P1-COL-2',
      'P1-COL-3',
      'P1-COL-4',
      'P1-HO-TDSR',
      'P1-UR-1',
      'PARKS-UR-1',
    ]) {
      phones[name] = (await story.enrolled(name)).id;
    }
    const dana = uuidv7(clock.now());
    const world = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
      const luis = await tx.user.create({ data: { name: 'Luis Ortega', role: 'MANAGER_ANALYST' } });
      const monitors: Record<string, string> = {};
      for (const name of ['Ana Brooks', 'Jo Kim', 'Sam Grant', 'Tariq Patel']) {
        monitors[name] = (await tx.user.create({ data: { name, role: 'MONITOR' } })).id;
      }
      const p1 = await setUpP1(tx, story.policy);
      return { luis: luis.id, monitors, phones, p1 };
    });
    const { luis, p1 } = world;
    const person = (name: string): string => {
      const id = world.monitors[name];
      if (id === undefined) throw new Error(`No monitor ${name}`);
      return id;
    };
    const phone = (name: string, monitor: string) => {
      const deviceId = world.phones[name];
      if (deviceId === undefined) throw new Error(`No phone ${name}`);
      return { person: person(monitor), deviceId };
    };
    const col1 = phone('P1-COL-1', 'Ana Brooks');
    const col2 = phone('P1-COL-2', 'Tariq Patel');
    const col3 = phone('P1-COL-3', 'Tariq Patel');
    const col4 = phone('P1-COL-4', 'Ana Brooks');
    const haulOut = phone('P1-HO-TDSR', 'Sam Grant');
    const unitRate = phone('P1-UR-1', 'Jo Kim');

    // Every block of a project, as the server keeps it.
    const blocksOf = async (projectId: string): Promise<string[]> => {
      const blocks = await api.numberBlock.findMany({
        where: { projectId },
        include: { device: true },
        orderBy: [{ series: 'asc' }, { firstNumber: 'asc' }, { issuedAt: 'asc' }],
      });
      return blocks.map(
        (block) =>
          `${block.device.name} ${block.series} ${String(block.firstNumber)}–${String(block.lastNumber)} ${block.status}` +
          (block.lastUsedNumber === null ? '' : `, used to ${String(block.lastUsedNumber)}`),
      );
    };
    const seriesOf = async (projectId: string): Promise<string[]> => {
      const all = await api.projectNumberSeries.findMany({
        where: { projectId },
        orderBy: { firstNumber: 'asc' },
      });
      return all.map(
        (series) =>
          `${series.series} from ${String(series.firstNumber)}, next ${String(series.nextNumber)}`,
      );
    };
    const cut = (blocks: readonly { firstNumber: number; lastNumber: number }[]): string[] =>
      blocks.map((block) => `${String(block.firstNumber)}–${String(block.lastNumber)}`);

    story.check(
      'AC-04-01, AC-01-09 P1 has a series for each workflow, one for its cert numbers and one for its ROEs; nothing is handed out yet',
      await seriesOf(p1.project),
      [
        'ROE from 1, next 1',
        'LOAD from 101001, next 101001',
        'HAUL_OUT from 201001, next 201001',
        'UNIT_RATE from 301001, next 301001',
        'CERTIFICATION from 730415, next 730415',
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(on('12', '06:30'), 'At the yard, online, each phone that makes numbers takes a block');
    const load = { projectId: p1.project, series: 'LOAD', lastUsedNumber: null } as const;
    story.check(
      'AC-04-04 1,000 numbers of its series each; AC-03-06 a certifying phone 100 cert numbers from 730415',
      [
        cut(await saved(allocator.topUp(col1, load))),
        cut(await saved(allocator.topUp(haulOut, { ...load, series: 'HAUL_OUT' }))),
        cut(await saved(allocator.topUp(unitRate, { ...load, series: 'UNIT_RATE' }))),
        cut(await saved(allocator.topUp(haulOut, { ...load, series: 'CERTIFICATION' }))),
      ],
      [['101001–102000'], ['201001–202000'], ['301001–302000'], ['730415–730514']],
    );
    story.check(
      'AC-04-05 the second collection phone is cut the next 1,000 of the load series, and asking again at once cuts nothing more',
      [
        cut(await saved(allocator.topUp(col2, load))),
        cut(await saved(allocator.topUp(col2, load))),
        (await seriesOf(p1.project))[1],
      ],
      [['102001–103000'], ['102001–103000'], 'LOAD from 101001, next 103001'],
    );
    let attempt = 'saved';
    try {
      await api.$write({ actorId: col3.person, source: 'DEVICE', deviceId: col3.deviceId }, (tx) =>
        tx.numberBlock.create({
          data: {
            deviceId: col3.deviceId,
            projectId: p1.project,
            series: 'LOAD',
            firstNumber: 101500,
            lastNumber: 102499,
          },
        }),
      );
    } catch (error) {
      attempt = String(error).includes('number_blocks_never_overlap')
        ? 'refused by the database: number_blocks_never_overlap'
        : String(error);
    }
    story.check(
      'AC-04-05 a block written past the allocator that shares numbers with another phone’s is refused by the database itself',
      attempt,
      'refused by the database: number_blocks_never_overlap',
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('12', '17:30'),
      'P1-COL-1 syncs at the yard, having used 101001 to 101006: it reports its last number and is topped up',
    );
    const afterSync = await saved(allocator.topUp(col1, { ...load, lastUsedNumber: 101006 }));
    story.check(
      'AC-04-06 it holds 1,000 unused numbers again, and gives out 101007 next',
      [
        cut(afterSync),
        new PhoneNumbers(afterSync).unused(),
        new PhoneNumbers(afterSync).next(),
        (await seriesOf(p1.project))[1],
      ],
      [['101001–102000', '103001–103006'], 1000, 101007, 'LOAD from 101001, next 103007'],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('13', '06:15'),
      'P1-COL-1 is reset for someone else: it synced first, and what it didn’t use is handed back',
    );
    await saved(allocator.reclaim(col1, [{ ...load, lastUsedNumber: 101006 }]));
    story.check(
      'AC-04-07 its blocks are marked reclaimed; the first keeps what it used',
      (await blocksOf(p1.project)).filter((block) => block.startsWith('P1-COL-1')),
      [
        'P1-COL-1 LOAD 101001–102000 RECLAIMED, used to 101006',
        'P1-COL-1 LOAD 103001–103006 RECLAIMED',
      ],
    );
    story.check(
      'AC-04-07 the next phone, P1-COL-3, is cut exactly what was handed back; the series doesn’t move on',
      [cut(await saved(allocator.topUp(col3, load))), (await seriesOf(p1.project))[1]],
      [['101007–102000', '103001–103006'], 'LOAD from 101001, next 103007'],
    );

    // ------------------------------------------------------------------------------------------
    story.at(on('13', '18:10'), 'P1-COL-2 can’t be found: Luis retires its block');
    const retired = await saved(
      allocator.retire(luis, col2.deviceId, 'Not handed in at the yard on Tuesday'),
    );
    story.check(
      'AC-04-07 the whole block is retired, for good: P1-COL-4 is cut numbers never handed out, not 102001–103000',
      [
        retired.map(
          (block) => `${String(block.firstNumber)}–${String(block.lastNumber)} ${block.status}`,
        ),
        cut(await saved(allocator.topUp(col4, load))),
      ],
      [['102001–103000 RETIRED'], ['103007–104006']],
    );
    story.check(
      'every block of P1’s, as the server keeps it: no number is held twice',
      await blocksOf(p1.project),
      [
        'P1-COL-1 LOAD 101001–102000 RECLAIMED, used to 101006',
        'P1-COL-3 LOAD 101007–102000 ISSUED',
        'P1-COL-2 LOAD 102001–103000 RETIRED',
        'P1-COL-1 LOAD 103001–103006 RECLAIMED',
        'P1-COL-3 LOAD 103001–103006 ISSUED',
        'P1-COL-4 LOAD 103007–104006 ISSUED',
        'P1-HO-TDSR HAUL_OUT 201001–202000 ISSUED',
        'P1-UR-1 UNIT_RATE 301001–302000 ISSUED',
        'P1-HO-TDSR CERTIFICATION 730415–730514 ISSUED',
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('13', '18:20'),
      'The certifying phone syncs, having issued 730415 to 730417: it reports its last cert number and is topped up',
    );
    const certNumbers = await saved(
      allocator.topUp(haulOut, { ...load, series: 'CERTIFICATION', lastUsedNumber: 730417 }),
    );
    story.check(
      'AC-05-47 a certifying phone is topped up to a full block of 100 unused cert numbers: its first block’s 97, and 3 more',
      [
        cut(certNumbers),
        new PhoneNumbers(certNumbers).unused(),
        new PhoneNumbers(certNumbers).next(),
      ],
      [['730415–730514', '730515–730517'], 100, 730418],
    );

    // ------------------------------------------------------------------------------------------
    story.at(on('13', '18:30'), 'P1-COL-3 takes a block of ROE numbers');
    const roes = await saved(allocator.topUp(col3, { ...load, series: 'ROE' }));
    story.check(
      'AC-04-14 100 numbers of the ROE series, apart from the ticket series; the seventh is written R-0007',
      [cut(roes), new NumberSeriesRules('ROE').written(7)],
      [['1–100'], 'R-0007'],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '09:00'),
      'Dana sets up "Bayline County PARKS, Hurricane Delphine", numbered from pre-printed control tickets',
    );
    const parksType = await api.programType.findFirstOrThrow({ where: { name: 'PARKS' } });
    const newParks = {
      name: 'Bayline County PARKS, Hurricane Delphine',
      clientId: p1.client,
      declarationEventId: p1.declarationEvent,
      programTypeId: parksType.id,
      timeZone,
      activeFrom: '2026-10-14',
      activeTo: null,
      ticketNumberSource: 'CONTROL',
      workflows: ['LOAD', 'UNIT_RATE'],
      kindOfWorkIds: [],
    } as const;
    story.check(
      'AC-01-09 a control-ticket project has no load series to start',
      await refused(projects.project(dana, { ...newParks, numbersFrom: { LOAD: 400001 } })),
      'NUMBER_SERIES_CONTROL_PROJECT: Not saved: this project numbers its tickets from control tickets, so it has no load series. Enter the control ranges instead.',
    );
    const parks = (await saved(projects.project(dana, newParks))).id;
    const range = await saved(
      projects.controlRange(dana, {
        projectId: parks,
        series: 'LOAD',
        firstNumber: 400001,
        lastNumber: 405000,
      }),
    );
    story.check(
      'AC-04-08 the range 400001–405000 is kept for its loads; AC-04-09 its unit rate tickets are still generated, from a series of their own',
      [
        `${range.series} ${String(range.firstNumber)}–${String(range.lastNumber)}`,
        await seriesOf(parks),
      ],
      ['LOAD 400001–405000', ['ROE from 1, next 1', 'UNIT_RATE from 100001, next 100001']],
    );
    story.check(
      'the same stock entered twice is refused, and so is a control range on P1, which generates its numbers',
      [
        await refused(
          projects.controlRange(dana, {
            projectId: parks,
            series: 'LOAD',
            firstNumber: 404001,
            lastNumber: 409000,
          }),
        ),
        await refused(
          projects.controlRange(dana, {
            projectId: p1.project,
            series: 'LOAD',
            firstNumber: 400001,
            lastNumber: 405000,
          }),
        ),
      ],
      [
        'CONTROL_RANGE_OVERLAP: Not saved: 404001–409000 shares numbers with the load range 400001–405000 already entered.',
        'CONTROL_RANGE_GENERATED_PROJECT: Not saved: this project generates its ticket numbers. A control range is entered on a project that numbers its tickets from control tickets.',
      ],
    );
    const parksPhone = phone('PARKS-UR-1', 'Jo Kim');
    story.check(
      'AC-04-09 its unit rate phone is cut a block; no phone is cut load numbers there',
      [
        cut(
          await saved(
            allocator.topUp(parksPhone, {
              projectId: parks,
              series: 'UNIT_RATE',
              lastUsedNumber: null,
            }),
          ),
        ),
        await refused(
          allocator.topUp(parksPhone, { projectId: parks, series: 'LOAD', lastUsedNumber: null }),
        ),
      ],
      [
        ['100001–101000'],
        'NUMBER_SERIES_NONE: No block cut: the project has no LOAD series. A project that numbers its tickets from control tickets generates only its unit rate tickets.',
      ],
    );

    // ------------------------------------------------------------------------------------------
    const names = new Map<string, string>([
      [dana, 'Dana Reyes'],
      [luis, 'Luis Ortega'],
      ...Object.entries(world.monitors).map(([name, id]): [string, string] => [id, name]),
      ...Object.entries(world.phones).map(([name, id]): [string, string] => [id, name]),
    ]);
    const who = (id: string | null): string => (id === null ? '-' : (names.get(id) ?? id));
    const audit = await api.auditRecord.findMany({
      where: { tableName: 'number_block', newValue: { path: ['status'], not: 'ISSUED' } },
      orderBy: { id: 'asc' },
    });
    story.check(
      'the audit log says who ended each block: the reset phone’s own sync, and Luis with his reason',
      audit.map((record) => [
        record.operation,
        who(record.actorId),
        record.source,
        who(record.deviceId),
        record.reason,
      ]),
      [
        ['UPDATE', 'Ana Brooks', 'DEVICE', 'P1-COL-1', null],
        ['UPDATE', 'Ana Brooks', 'DEVICE', 'P1-COL-1', null],
        ['UPDATE', 'Luis Ortega', 'BACK_OFFICE', '-', 'Not handed in at the yard on Tuesday'],
      ],
    );
  },
};
