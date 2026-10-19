// Numbering (spec/parts/04-field-capture.md; spec/DATA-MODEL.md §3 "Numbering";
// adms-ticket-workflows; ADR-046, 056, 062, 065, 151, 181, 323). A project has a series of numbers
// for each workflow, one for its cert numbers and one for its ROEs. The server is the only
// allocator: it cuts each phone a block of a series, and the phone gives the block out in order,
// offline. A phone that is reset hands back what it didn't use, for the next phone; a lost phone's
// block is retired whole, because nobody can be sure what it used. Gaps are normal.
//
// A number is bare: no project, type, phone or date in it, no check digit, and nothing here or
// anywhere reads meaning out of one (ADR-046, 114). This is the one generator, shared by the phone
// and the server (REQ-114): the arithmetic only, with no database and no clock.
import type { Policy } from './policy.ts';

export const numberSeries = ['LOAD', 'HAUL_OUT', 'UNIT_RATE', 'CERTIFICATION', 'ROE'] as const;
export type NumberSeriesName = (typeof numberSeries)[number];

// The series a ticket's number comes from, one per workflow (ADR-062).
export const ticketNumberSeries = ['LOAD', 'HAUL_OUT', 'UNIT_RATE'] as const;

// A generated ticket number is a whole number from 100,001 to 9,999,999 (ADR-062): a rule of the
// product, held by the database's own checks too, not a threshold the firm tunes.
export const ticketNumbers = { first: 100_001, last: 9_999_999 } as const;

// The largest number a series' column holds.
const largest = 2_147_483_647;

export interface NumberRefusal {
  readonly code:
    | 'NUMBER_SERIES_START'
    | 'NUMBER_SERIES_USED_UP'
    | 'NUMBER_SERIES_CONTROL_PROJECT'
    | 'CONTROL_RANGE_INVALID'
    | 'CONTROL_RANGE_SERIES'
    | 'CONTROL_RANGE_GENERATED_PROJECT'
    | 'CONTROL_RANGE_OVERLAP';
  readonly message: string;
}

// A run of numbers, first to last, both held.
export interface NumberRun {
  readonly firstNumber: number;
  readonly lastNumber: number;
}

const said: Record<NumberSeriesName, string> = {
  LOAD: 'load',
  HAUL_OUT: 'haul-out',
  UNIT_RATE: 'unit rate',
  CERTIFICATION: 'cert-number',
  ROE: 'ROE',
};

const grouped = (value: number): string => value.toLocaleString('en-US');

// What is true of one kind of series, whichever project it is on.
export class NumberSeriesRules {
  readonly series: NumberSeriesName;

  constructor(series: NumberSeriesName) {
    this.series = series;
  }

  get isTicketSeries(): boolean {
    return (ticketNumberSeries as readonly string[]).includes(this.series);
  }

  // The last number the series may ever reach.
  get lastNumber(): number {
    return this.isTicketSeries ? ticketNumbers.last : largest;
  }

  // Where a new series starts when the firm says nothing: tickets at 100,001, so projects look the
  // same (ADR-062); ROEs at 1. A cert-number series has no start of ours: the firm seeds it with a
  // number that doesn't look made up (Q-96).
  get usualStart(): number | null {
    if (this.isTicketSeries) return ticketNumbers.first;
    return this.series === 'ROE' ? 1 : null;
  }

  // Whether a series may start at this number.
  start(firstNumber: number): NumberRefusal | null {
    const least = this.isTicketSeries ? ticketNumbers.first : 1;
    if (Number.isInteger(firstNumber) && firstNumber >= least && firstNumber <= this.lastNumber) {
      return null;
    }
    return {
      code: 'NUMBER_SERIES_START',
      message: this.isTicketSeries
        ? `Not saved: a ${said[this.series]} series starts at a whole number from ${grouped(ticketNumbers.first)} to ${grouped(ticketNumbers.last)}.`
        : `Not saved: a ${said[this.series]} series starts at a whole number, 1 or more.`,
    };
  }

  // How many unused numbers a phone holds after a top-up: 1,000 ticket numbers, 100 cert numbers
  // (ADR-065, 181), from the policy values.
  blockSize(policy: Policy): number {
    if (this.isTicketSeries) return policy.ticketNumberBlockSize;
    return this.series === 'ROE' ? policy.roeNumberBlockSize : policy.certNumberBlockSize;
  }

  // A number as it is written on a record, printed and scanned. A ticket number and a cert number
  // are the bare number. An ROE number made on a phone is written "R-" and the number, at least
  // four digits (R-0007), so it never reads as a ticket or a placard (ADR-323); nothing reads it
  // back apart.
  written(value: number): string {
    return this.series === 'ROE' ? `R-${String(value).padStart(4, '0')}` : String(value);
  }
}

// One block as the server keeps it.
export interface HeldBlock extends NumberRun {
  // The last number its phone reported using; none yet when null.
  readonly lastUsedNumber: number | null;
  readonly status: 'ISSUED' | 'RECLAIMED' | 'RETIRED';
}

export interface SeriesPosition {
  readonly series: NumberSeriesName;
  readonly firstNumber: number;
  // The next number the server has never handed out.
  readonly nextNumber: number;
}

export type NumbersTaken =
  | { readonly refusal: null; readonly runs: readonly NumberRun[]; readonly nextNumber: number }
  | { readonly refusal: NumberRefusal };

// The last number a block's phone is known to have used; one before its start when it used none.
const usedTo = (block: HeldBlock): number => block.lastUsedNumber ?? block.firstNumber - 1;

// The server's book of one series of one project: which numbers the next block takes.
export class NumberSeriesBook {
  private readonly position: SeriesPosition;
  private readonly blocks: readonly HeldBlock[];
  private readonly rules: NumberSeriesRules;

  constructor(position: SeriesPosition, blocks: readonly HeldBlock[]) {
    this.position = position;
    this.blocks = blocks;
    this.rules = new NumberSeriesRules(position.series);
  }

  // What a block still holds: an issued or a retired block its whole run; a reclaimed one only
  // what its phone used (nothing, if it used none). The database keeps these apart
  // (number_blocks_never_overlap).
  static held(block: HeldBlock): NumberRun | null {
    if (block.status !== 'RECLAIMED') {
      return { firstNumber: block.firstNumber, lastNumber: block.lastNumber };
    }
    return block.lastUsedNumber === null
      ? null
      : { firstNumber: block.firstNumber, lastNumber: block.lastUsedNumber };
  }

  // The last used number to keep when a phone reports one: a phone never un-uses a number, and
  // never used one outside its block. The higher of what is kept and what is reported.
  static lastUsed(block: HeldBlock, reported: number | null): number | null {
    if (reported === null || reported < block.firstNumber || reported > block.lastNumber) {
      return block.lastUsedNumber;
    }
    return Math.max(reported, usedTo(block));
  }

  // The numbers reset phones handed back that no block holds now, lowest first.
  handedBack(): NumberRun[] {
    const rests = this.blocks
      .filter((block) => block.status === 'RECLAIMED' && usedTo(block) < block.lastNumber)
      .map((block) => ({ firstNumber: usedTo(block) + 1, lastNumber: block.lastNumber }))
      .sort((a, b) => a.firstNumber - b.firstNumber);
    const held = this.blocks
      .map((block) => NumberSeriesBook.held(block))
      .filter((run) => run !== null)
      .sort((a, b) => a.firstNumber - b.firstNumber);
    const free: NumberRun[] = [];
    for (const rest of rests) {
      // A rest cut again and handed back again lies inside an earlier one: count it once.
      let from = Math.max(rest.firstNumber, (free.at(-1)?.lastNumber ?? rest.firstNumber - 1) + 1);
      for (const run of held) {
        if (run.lastNumber < from || run.firstNumber > rest.lastNumber) continue;
        if (run.firstNumber > from)
          free.push({ firstNumber: from, lastNumber: run.firstNumber - 1 });
        from = run.lastNumber + 1;
      }
      if (from <= rest.lastNumber) free.push({ firstNumber: from, lastNumber: rest.lastNumber });
    }
    return free;
  }

  // The next numbers of the series, as many as asked: what was handed back first, lowest first,
  // then numbers never handed out. Each run is one block. Refused when the series hasn't that many
  // left; nothing is taken then.
  take(count: number): NumbersTaken {
    const runs: NumberRun[] = [];
    let wanted = count;
    for (const run of this.handedBack()) {
      if (wanted === 0) break;
      const lastNumber = Math.min(run.lastNumber, run.firstNumber + wanted - 1);
      runs.push({ firstNumber: run.firstNumber, lastNumber });
      wanted -= lastNumber - run.firstNumber + 1;
    }
    if (wanted === 0) return { refusal: null, runs, nextNumber: this.position.nextNumber };
    const fresh = this.takeNew(wanted);
    if (fresh.refusal !== null) return fresh;
    return { refusal: null, runs: [...runs, ...fresh.runs], nextNumber: fresh.nextNumber };
  }

  // Numbers never handed out, only: what a block takes once the handed-back numbers are used up.
  takeNew(count: number): NumbersTaken {
    const firstNumber = this.position.nextNumber;
    const lastNumber = firstNumber + count - 1;
    if (lastNumber > this.rules.lastNumber) {
      return {
        refusal: {
          code: 'NUMBER_SERIES_USED_UP',
          message: `The project's ${said[this.position.series]} series has fewer than ${grouped(count)} numbers left before ${grouped(this.rules.lastNumber)}.`,
        },
      };
    }
    return { refusal: null, runs: [{ firstNumber, lastNumber }], nextNumber: lastNumber + 1 };
  }
}

// A phone's own blocks of one series, in the order they were issued: the numbers it gives out,
// offline (ADR-065). A phone that only records disposals holds none, and makes no number.
export class PhoneNumbers {
  private readonly blocks: readonly HeldBlock[];

  constructor(blocks: readonly HeldBlock[]) {
    this.blocks = blocks.filter((block) => block.status === 'ISSUED');
  }

  // The next number, in order: the one after the last it used, block by block. None when its
  // blocks are used up, or it holds none.
  next(): number | null {
    const block = this.blocks.find((candidate) => usedTo(candidate) < candidate.lastNumber);
    return block === undefined ? null : usedTo(block) + 1;
  }

  // What each block's last used number is once the phone reports the last number it used, block
  // by block in the same order. A phone gives its blocks out in order, so every block before the
  // one the number lies in is used up. A number in none of its blocks changes nothing.
  reported(lastUsedNumber: number | null): (number | null)[] {
    const at = this.blocks.findIndex(
      (block) =>
        lastUsedNumber !== null &&
        lastUsedNumber >= block.firstNumber &&
        lastUsedNumber <= block.lastNumber,
    );
    return this.blocks.map((block, index) => {
      if (at === -1 || index > at) return block.lastUsedNumber;
      return index < at ? block.lastNumber : NumberSeriesBook.lastUsed(block, lastUsedNumber);
    });
  }

  // How many numbers it still holds unused.
  unused(): number {
    return this.blocks.reduce((sum, block) => sum + (block.lastNumber - usedTo(block)), 0);
  }

  // How many more it takes at a sync to hold a full block again.
  topUp(blockSize: number): number {
    return Math.max(0, blockSize - this.unused());
  }

  // Whether it holds less than two days' worth (ADR-065): fewer unused than twice the most it
  // gave out of the series in one day, as the phone counts its own days (ADR-581, an agent
  // reading). A phone that hasn't given any out yet isn't low.
  low(mostInADay: number): boolean {
    return mostInADay > 0 && this.unused() < 2 * mostInADay;
  }
}

// The work a phone's assignment names, as far as numbers go.
export interface NumberingWork {
  readonly fieldEventKinds: readonly string[];
  readonly certifying: boolean;
  readonly formDocumentTypes: readonly string[];
}

// The series a phone makes numbers of for its work (ADR-065, 151, 581; C184): a collection makes
// a load's number, a haul-out collection a haul-out's, unit rate work its own, certifying a cert
// number and an ROE made on the phone an ROE number, each where the project has that series. A
// disposal makes none: it scans the number the truck carries (ADR-021, 056). A project numbered
// from control tickets has no load or haul-out series, so its collections take the control ticket
// (ADR-056); one whose firm seeded no cert-number series takes the pre-printed sheet's (Q-142).
// So a phone asks for its first block of exactly these, and of no other.
const madeBy: Readonly<Record<string, NumberSeriesName>> = {
  COLLECTION: 'LOAD',
  HAUL_OUT_COLLECTION: 'HAUL_OUT',
  UNIT_RATE: 'UNIT_RATE',
};

export class PhoneSeries {
  private readonly work: NumberingWork;

  constructor(work: NumberingWork) {
    this.work = work;
  }

  // Of the series the project has, those this work makes numbers of, in the series' order.
  of(projectSeries: readonly NumberSeriesName[]): NumberSeriesName[] {
    const wanted = new Set<NumberSeriesName>();
    for (const kind of this.work.fieldEventKinds) {
      const series = madeBy[kind];
      if (series !== undefined) wanted.add(series);
    }
    if (this.work.certifying) wanted.add('CERTIFICATION');
    if (this.work.formDocumentTypes.includes('ROE')) wanted.add('ROE');
    return numberSeries.filter((series) => wanted.has(series) && projectSeries.includes(series));
  }
}

// A project's pre-printed stock as a phone holds it (ADR-056; AC-04-08): a control ticket scanned
// outside every range of its series is questioned on the phone, never refused. A number that isn't
// a whole number is outside every range.
export class ControlTickets {
  private readonly ranges: readonly (NumberRun & { readonly series: NumberSeriesName })[];

  constructor(ranges: readonly (NumberRun & { readonly series: NumberSeriesName })[]) {
    this.ranges = ranges;
  }

  holds(series: NumberSeriesName, scanned: string): boolean {
    if (!/^\d{1,10}$/.test(scanned)) return false;
    const number = Number(scanned);
    return this.ranges.some(
      (range) =>
        range.series === series && number >= range.firstNumber && number <= range.lastNumber,
    );
  }
}

// A run of pre-printed control tickets as setup holds it.
export interface ControlRangeEntry extends NumberRun {
  readonly series: NumberSeriesName;
  // Taken off; it no longer counts.
  readonly archived: boolean;
}

// A project's control ranges (ADR-056): entered where the project numbers its tickets from
// pre-printed stock, for its loads and its haul-outs. Unit rate tickets are generated on every
// project. Setup refuses only a range that is no range, or one that shares a number with another
// of the same series: the same stock entered twice.
export class ControlRanges {
  private readonly source: 'CONTROL' | 'GENERATED';
  private readonly ranges: readonly ControlRangeEntry[];

  constructor(source: 'CONTROL' | 'GENERATED', ranges: readonly ControlRangeEntry[]) {
    this.source = source;
    this.ranges = ranges;
  }

  check(range: ControlRangeEntry): NumberRefusal | null {
    const written = `${String(range.firstNumber)}–${String(range.lastNumber)}`;
    if (this.source !== 'CONTROL') {
      return {
        code: 'CONTROL_RANGE_GENERATED_PROJECT',
        message:
          'Not saved: this project generates its ticket numbers. A control range is entered on a project that numbers its tickets from control tickets.',
      };
    }
    if (range.series !== 'LOAD' && range.series !== 'HAUL_OUT') {
      return {
        code: 'CONTROL_RANGE_SERIES',
        message: `Not saved: control tickets number loads and haul-outs. A ${said[range.series]} number is never taken from a control range.`,
      };
    }
    if (
      !Number.isInteger(range.firstNumber) ||
      !Number.isInteger(range.lastNumber) ||
      range.firstNumber < 1 ||
      range.lastNumber < range.firstNumber ||
      range.lastNumber > largest
    ) {
      return {
        code: 'CONTROL_RANGE_INVALID',
        message: `Not saved: ${written} isn't a range of ticket numbers. Enter the first and the last number of the stock, whole numbers, the first no higher than the last.`,
      };
    }
    const overlapped = this.ranges
      .filter(
        (other) =>
          !other.archived &&
          other.series === range.series &&
          other.firstNumber <= range.lastNumber &&
          other.lastNumber >= range.firstNumber,
      )
      .sort((a, b) => a.firstNumber - b.firstNumber)
      .map((other) => `${String(other.firstNumber)}–${String(other.lastNumber)}`);
    if (overlapped.length > 0) {
      return {
        code: 'CONTROL_RANGE_OVERLAP',
        message: `Not saved: ${written} shares numbers with the ${said[range.series]} range ${overlapped.join(' and ')} already entered.`,
      };
    }
    return null;
  }
}

export interface NewSeries {
  readonly series: NumberSeriesName;
  readonly firstNumber: number;
}

// The series a new project starts with (spec/parts/01-setup.md step 3; AC-01-09). A project that
// generates its ticket numbers has a series for each workflow; one that numbers its tickets from
// control tickets has only the unit rate series, since unit rate tickets are generated on every
// project (ADR-056). Either has an ROE series, and a cert-number series once the firm seeds one;
// without it, cert numbers are typed from pre-printed paper (ADR-045, Q-142).
export class NewProjectNumbers {
  private readonly source: 'CONTROL' | 'GENERATED';

  constructor(source: 'CONTROL' | 'GENERATED') {
    this.source = source;
  }

  // Each series and where it starts: where the firm says, or the usual start.
  series(
    starts: Readonly<Partial<Record<NumberSeriesName, number>>>,
  ):
    | { readonly refusal: null; readonly series: readonly NewSeries[] }
    | { readonly refusal: NumberRefusal } {
    const series: NewSeries[] = [];
    for (const name of numberSeries) {
      const refusal = this.refusal(name);
      if (refusal !== null) {
        if (starts[name] !== undefined) return { refusal };
        continue;
      }
      const rules = new NumberSeriesRules(name);
      const firstNumber = starts[name] ?? rules.usualStart;
      if (firstNumber === null) continue;
      const start = rules.start(firstNumber);
      if (start !== null) return { refusal: start };
      series.push({ series: name, firstNumber });
    }
    return { refusal: null, series };
  }

  // Why the project can't have this series, if it can't.
  refusal(series: NumberSeriesName): NumberRefusal | null {
    if (this.source === 'GENERATED' || (series !== 'LOAD' && series !== 'HAUL_OUT')) return null;
    return {
      code: 'NUMBER_SERIES_CONTROL_PROJECT',
      message: `Not saved: this project numbers its tickets from control tickets, so it has no ${said[series]} series. Enter the control ranges instead.`,
    };
  }
}
