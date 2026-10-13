// The server's allocator of numbers (spec/DATA-MODEL.md §3 "Numbering"; adms-ticket-workflows;
// ADR-065, 151, 181, 323): the only one. A phone that makes numbers is cut a block of its
// project's series at a sync, topped up to a full block of unused numbers each time it reports the
// last one it used. A phone that is reset syncs first, and what it didn't use is handed back for
// the next phone; a lost phone's blocks are retired whole. Which numbers a block takes is
// packages/domain's NumberSeriesBook; that no two phones ever hold the same number is the
// database's own refusal (number_blocks_never_overlap), whatever this class does.
//
// A top-up is the phone's own piece of work, written as its monitor from that phone; retiring a
// lost phone's blocks is the back office's; a phone turned in ends its own in its turn-in's piece
// of work, under the master passcode (`turnedIn`, ADR-488). Two top-ups of one series at the same moment don't
// both go through: the second finds the series moved on, or the database refuses its block, and
// it is thrown, not saved, for the caller to ask again (the sync endpoint's, Phase 2).
import type { Database, NumberBlock, NumberSeries, Prisma } from '@open-adms/db';
import {
  NumberSeriesBook,
  NumberSeriesRules,
  PhoneNumbers,
  type NumbersTaken,
  type Policy,
  type TurnedInBlocks,
} from '@open-adms/domain';

import { type Clock, type Outcome, Refused, SetupService } from '../setup/setup-service.ts';

// A phone at a sync: its monitor, and the phone itself.
export interface PhoneAtSync {
  readonly person: string;
  readonly deviceId: string;
}

// The last number a phone used of one series of its project; null when it used none.
export interface LastUsed {
  readonly projectId: string;
  readonly series: NumberSeries;
  readonly lastUsedNumber: number | null;
}

// How one series' blocks ended when their phone was turned in, and the blocks as they ended.
export interface SeriesTurnedIn {
  readonly projectId: string;
  readonly series: NumberSeries;
  readonly ended: TurnedInBlocks;
  readonly blocks: readonly NumberBlock[];
}

export class NumberAllocator extends SetupService {
  private readonly policy: Policy;

  constructor(db: Database, clock: Clock, policy: Policy) {
    super(db, clock);
    this.policy = policy;
  }

  // At a sync: the phone reports the last number it used of a series, and is topped up to a full
  // block of unused numbers (1,000 ticket numbers, 100 cert numbers). Answers the blocks it holds
  // now, in the order it gives them out. A first top-up is its first block.
  topUp(phone: PhoneAtSync, report: LastUsed): Promise<Outcome<NumberBlock[]>> {
    return this.writeAs(
      { actorId: phone.person, source: 'DEVICE', deviceId: phone.deviceId },
      async (tx) => {
        const series = await tx.projectNumberSeries.findUnique({
          where: { projectId_series: { projectId: report.projectId, series: report.series } },
        });
        if (series === null) throw NumberAllocator.noSeries(report.series);
        await NumberAllocator.record(tx, phone.deviceId, report);
        const held = await NumberAllocator.heldBy(tx, phone.deviceId, report);
        const size = new NumberSeriesRules(report.series).blockSize(this.policy);
        const wanted = new PhoneNumbers(held).topUp(size);
        if (wanted === 0) return held;
        const blocks = await tx.numberBlock.findMany({
          where: { projectId: report.projectId, series: report.series },
        });
        const taken = new NumberSeriesBook(series, blocks).take(wanted);
        await NumberAllocator.advance(tx, series, taken);
        if (taken.refusal !== null) throw new Refused(taken.refusal);
        for (const run of taken.runs) {
          await tx.numberBlock.create({
            data: {
              deviceId: phone.deviceId,
              projectId: report.projectId,
              series: report.series,
              ...run,
              issuedAt: this.clock.now(),
            },
          });
        }
        return NumberAllocator.heldBy(tx, phone.deviceId, report);
      },
    );
  }

  // The blocks a phone holds of one series now, in the order it gives them out: what a sync
  // answers where a report wasn't taken (ADR-467 (8)).
  held(deviceId: string, series: Pick<LastUsed, 'projectId' | 'series'>): Promise<NumberBlock[]> {
    return this.db.$read((tx) => NumberAllocator.heldBy(tx, deviceId, series));
  }

  // A phone reset for someone else: it has synced, so each last used number is the phone's own
  // word, and the unused rest of every block it holds is handed back (ADR-065). Never called for a
  // phone that hasn't reported: that one's blocks are retired.
  reclaim(phone: PhoneAtSync, reports: readonly LastUsed[]): Promise<Outcome<NumberBlock[]>> {
    return this.writeAs(
      { actorId: phone.person, source: 'DEVICE', deviceId: phone.deviceId },
      async (tx) => {
        for (const report of reports) await NumberAllocator.record(tx, phone.deviceId, report);
        return NumberAllocator.end(tx, phone.deviceId, 'RECLAIMED', this.clock.now());
      },
    );
  }

  // A lost or broken phone: every block it holds is retired whole, for good, because nobody can
  // be sure which numbers it used (ADR-065, 134).
  retire(person: string, deviceId: string, reason: string): Promise<Outcome<NumberBlock[]>> {
    return this.writeAs({ actorId: person, source: 'BACK_OFFICE', reason }, (tx) =>
      NumberAllocator.end(tx, deviceId, 'RETIRED', this.clock.now()),
    );
  }

  // A phone turned in (ADR-065, 134, 488), inside its turn-in's own piece of work: each series
  // it holds blocks of ends as `endsAs` says, given whether the phone reported its last used
  // number there; a report is written on the blocks first, so a block handed back keeps only
  // what the phone used. A report of a series it holds nothing of changes nothing.
  static async turnedIn(
    tx: Prisma.TransactionClient,
    deviceId: string,
    reports: readonly LastUsed[],
    endsAs: (reported: boolean) => TurnedInBlocks,
    endedAt: Date,
  ): Promise<SeriesTurnedIn[]> {
    const held = await tx.numberBlock.findMany({
      where: { deviceId, status: 'ISSUED' },
      orderBy: [
        { projectId: 'asc' },
        { series: 'asc' },
        { issuedAt: 'asc' },
        { firstNumber: 'asc' },
      ],
      select: { projectId: true, series: true },
    });
    const series = new Map(held.map((block) => [`${block.projectId} ${block.series}`, block]));
    const turnedIn: SeriesTurnedIn[] = [];
    for (const { projectId, series: of } of series.values()) {
      const report = reports.find((one) => one.projectId === projectId && one.series === of);
      if (report !== undefined) await NumberAllocator.record(tx, deviceId, report);
      const ended = endsAs(report !== undefined);
      const blocks: NumberBlock[] = [];
      for (const block of await NumberAllocator.heldBy(tx, deviceId, { projectId, series: of })) {
        blocks.push(
          await tx.numberBlock.update({
            where: { id: block.id },
            data: { status: ended, endedAt },
          }),
        );
      }
      turnedIn.push({ projectId, series: of, ended, blocks });
    }
    return turnedIn;
  }

  // Moves the series on to the next number never handed out, only if nobody moved it meanwhile.
  private static async advance(
    tx: Prisma.TransactionClient,
    series: { id: string; nextNumber: number },
    taken: NumbersTaken,
  ): Promise<void> {
    if (taken.refusal !== null || taken.nextNumber === series.nextNumber) return;
    const moved = await tx.projectNumberSeries.updateMany({
      where: { id: series.id, nextNumber: series.nextNumber },
      data: { nextNumber: taken.nextNumber },
    });
    if (moved.count !== 1) {
      throw new Error('The number series moved on while a block was being cut: ask again.');
    }
  }

  // Writes down the last number the phone says it used: every block before the one it lies in is
  // used up, and a block's last used number never goes back.
  private static async record(
    tx: Prisma.TransactionClient,
    deviceId: string,
    report: LastUsed,
  ): Promise<void> {
    const held = await NumberAllocator.heldBy(tx, deviceId, report);
    const reported = new PhoneNumbers(held).reported(report.lastUsedNumber);
    for (const [index, block] of held.entries()) {
      const lastUsedNumber = reported[index] ?? null;
      if (lastUsedNumber === block.lastUsedNumber) continue;
      await tx.numberBlock.update({ where: { id: block.id }, data: { lastUsedNumber } });
    }
  }

  // The blocks a phone holds of one series, in the order it gives them out.
  private static heldBy(
    tx: Prisma.TransactionClient,
    deviceId: string,
    { projectId, series }: Pick<LastUsed, 'projectId' | 'series'>,
  ): Promise<NumberBlock[]> {
    return tx.numberBlock.findMany({
      where: { deviceId, projectId, series, status: 'ISSUED' },
      orderBy: [{ issuedAt: 'asc' }, { firstNumber: 'asc' }],
    });
  }

  private static async end(
    tx: Prisma.TransactionClient,
    deviceId: string,
    status: 'RECLAIMED' | 'RETIRED',
    endedAt: Date,
  ): Promise<NumberBlock[]> {
    const held = await tx.numberBlock.findMany({
      where: { deviceId, status: 'ISSUED' },
      orderBy: [{ issuedAt: 'asc' }, { firstNumber: 'asc' }],
    });
    const ended: NumberBlock[] = [];
    for (const block of held) {
      ended.push(
        await tx.numberBlock.update({ where: { id: block.id }, data: { status, endedAt } }),
      );
    }
    return ended;
  }

  private static noSeries(series: NumberSeries): Refused {
    return new Refused({
      code: 'NUMBER_SERIES_NONE',
      message: `No block cut: the project has no ${series} series. A project that numbers its tickets from control tickets generates only its unit rate tickets.`,
    });
  }
}
