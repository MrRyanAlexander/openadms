// Numbering, at the domain (spec/acceptance/04-field-capture.md AC-04-01, 03, 04, 06, 07, 08, 13,
// 14; spec/acceptance/03-certification.md AC-03-06; spec/acceptance/01-setup.md AC-01-09;
// ADR-046, 056, 062, 065, 181, 323; REQ-105k, 106a, 114). The numbers are the example world's
// (spec/CONVENTIONS.md §6): P1's loads from 101001, its haul-outs from 201001, its unit rate
// tickets from 301001, its cert numbers from 730415. That two phones never hold the same number is
// the database's to prove (packages/db/test/numbering.test.ts).
import { describe, expect, it } from 'vitest';

import {
  ControlRanges,
  type ControlRangeEntry,
  type HeldBlock,
  NewProjectNumbers,
  NumberSeriesBook,
  NumberSeriesRules,
  PhoneNumbers,
  Policy,
  numberSeries,
  ticketNumbers,
} from '../src/index.ts';

const policy = Policy.from({
  LOAD_CALL_LOW_LIMIT: '5',
  LOAD_CALL_HIGH_LIMIT: '95',
  DISPOSAL_SITE_PROXIMITY_M: '200',
  STUMP_FILL_DEPTH_INCHES: '31',
  CREW_DAY_HOURS: '12',
  TICKET_NUMBER_BLOCK_SIZE: '1000',
  CERT_NUMBER_BLOCK_SIZE: '100',
  ROE_NUMBER_BLOCK_SIZE: '100',
  REQUEST_BODY_LIMIT_BYTES: '1048576',
  STATEMENT_TIMEOUT_MS: '30000',
  DATABASE_POOL_CONNECTIONS: '10',
  DATABASE_CONNECTION_WAIT_MS: '2000',
  DATABASE_WORK_LONGEST_MS: '5000',
  DATABASE_BUSY_RETRY_SECONDS: '5',
  MAP_FILE_RING_PAIRS_AT_MOST: '50000000',
  ESRI_LAYER_ANSWER_SECONDS: '60',
  PASSWORD_MINIMUM_LENGTH: '15',
  PASSWORD_MAXIMUM_LENGTH: '128',
  PASSWORD_RESET_MINUTES: '60',
  ACCESS_TOKEN_MINUTES: '5',
  SESSION_INACTIVITY_MINUTES: '30',
  SESSION_OVERALL_HOURS: '12',
  SIGN_IN_TRIES_BEFORE_WAIT: '5',
  SIGN_IN_TRIES_BEFORE_LOCK: '50',
  SIGN_IN_FIRST_WAIT_SECONDS: '30',
  SIGN_IN_LONGEST_WAIT_MINUTES: '60',
  TWO_STEP_CODE_STEPS_EITHER_SIDE: '1',
  TWO_STEP_SETUP_MINUTES: '10',
  PHONE_CHALLENGE_SECONDS: '120',
  PHONE_TOKEN_MINUTES: '15',
  MONITOR_SESSION_HOURS: '12',
  LOGIN_LIST_ENTRIES_PER_CALL: '50',
  ADDRESS_LOOKUP_ANSWER_SECONDS: '5',
  MEDIA_STORE_ANSWER_SECONDS: '30',
  MEDIA_FILE_BYTES_AT_MOST: '33554432',
  MEDIA_PART_BYTES_AT_MOST: '4194304',
  MEDIA_RECEIVING_BYTES_AT_MOST: '268435456',
  RATE_LIMIT_FILE_PARTS_PER_PHONE: '300',
  MAP_FILE_BYTES_AT_MOST: '16777216',
  MAP_FILE_UNZIPPED_BYTES_AT_MOST: '67108864',
  MAP_FILE_ENTRIES_AT_MOST: '1000',
  RATE_LIMIT_WINDOW_SECONDS: '60',
  RATE_LIMIT_REQUESTS_PER_ADDRESS: '3000',
  RATE_LIMIT_REQUESTS_PER_ACCOUNT: '600',
  RATE_LIMIT_REQUESTS_PER_PHONE: '600',
  RATE_LIMIT_COUNTS_KEPT: '100000',
  SIGN_IN_ADDRESS_WINDOW_MINUTES: '60',
  SIGN_IN_WRONG_TRIES_PER_ADDRESS: '30',
  SIGN_IN_WRONG_TRIES_PER_ADDRESS_AT_LOGIN: '4',
  PASSWORD_RESET_ASKS_PER_ADDRESS: '10',
  PASSWORD_RESET_ASKS_PER_LOGIN: '3',
  MASTER_PASSCODE_MINIMUM_LENGTH: '8',
  MASTER_PASSCODE_MAXIMUM_LENGTH: '128',
  PHONE_KEY_REVOKED_AFTER_HOURS: '24',
  JOB_TRIES_BEFORE_SET_ASIDE: '5',
  RECONCILIATION_RUN_LONGEST_MINUTES: '10',
  JOB_QUEUE_POLL_SECONDS: '5',
  MAP_SERVER_ANSWER_SECONDS: '30',
  DEVICE_CLOCK_OFF_LIMIT_MINUTES: '5',
  JOB_TICKETS_AT_MOST: '200',
});

const block = (
  firstNumber: number,
  lastNumber: number,
  lastUsedNumber: number | null = null,
  status: HeldBlock['status'] = 'ISSUED',
): HeldBlock => ({ firstNumber, lastNumber, lastUsedNumber, status });

const loads = (nextNumber: number, blocks: HeldBlock[] = []): NumberSeriesBook =>
  new NumberSeriesBook({ series: 'LOAD', firstNumber: 101001, nextNumber }, blocks);

describe('a series of numbers', () => {
  it('AC-04-01 is one of five: a ticket series per workflow, the cert numbers, the ROEs', () => {
    expect(numberSeries).toEqual(['LOAD', 'HAUL_OUT', 'UNIT_RATE', 'CERTIFICATION', 'ROE']);
    expect(numberSeries.map((series) => new NumberSeriesRules(series).isTicketSeries)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it('AC-04-01 a ticket series starts between 100,001 and 9,999,999: P1’s at 101001, 201001, 301001', () => {
    expect(ticketNumbers).toEqual({ first: 100001, last: 9999999 });
    for (const [series, start] of [
      ['LOAD', 101001],
      ['HAUL_OUT', 201001],
      ['UNIT_RATE', 301001],
    ] as const) {
      const rules = new NumberSeriesRules(series);
      expect(rules.start(start)).toBeNull();
      expect(rules.usualStart).toBe(100001);
      for (const outside of [100000, 10000000, 0, -1, 101001.5]) {
        expect(rules.start(outside)?.code, String(outside)).toBe('NUMBER_SERIES_START');
      }
    }
    expect(new NumberSeriesRules('LOAD').start(100000)?.message).toBe(
      'Not saved: a load series starts at a whole number from 100,001 to 9,999,999.',
    );
  });

  it('AC-03-06 a cert-number series starts where the firm seeds it (730415), with no start of ours; an ROE series at 1', () => {
    const certs = new NumberSeriesRules('CERTIFICATION');
    expect(certs.start(730415)).toBeNull();
    expect(certs.usualStart).toBeNull();
    expect(certs.start(0)?.message).toBe(
      'Not saved: a cert-number series starts at a whole number, 1 or more.',
    );
    expect(new NumberSeriesRules('ROE').usualStart).toBe(1);
  });

  it('AC-04-04, AC-03-06 a phone holds 1,000 ticket numbers, 100 cert numbers, 100 ROE numbers: policy values', () => {
    expect(numberSeries.map((series) => new NumberSeriesRules(series).blockSize(policy))).toEqual([
      1000, 1000, 1000, 100, 100,
    ]);
  });

  it('AC-04-03, AC-04-13 a ticket or cert number is written bare, with no label and no check digit: a tandem’s 101050 and 101051 are only two numbers', () => {
    expect(new NumberSeriesRules('LOAD').written(101050)).toBe('101050');
    expect(new NumberSeriesRules('LOAD').written(101051)).toBe('101051');
    expect(new NumberSeriesRules('HAUL_OUT').written(201004)).toBe('201004');
    expect(new NumberSeriesRules('UNIT_RATE').written(301001)).toBe('301001');
    expect(new NumberSeriesRules('CERTIFICATION').written(730415)).toBe('730415');
  });

  it('AC-04-14 an ROE number made on a phone is written R- and at least four digits: R-0007', () => {
    const roes = new NumberSeriesRules('ROE');
    expect([7, 8, 1234, 12345].map((value) => roes.written(value))).toEqual([
      'R-0007',
      'R-0008',
      'R-1234',
      'R-12345',
    ]);
  });
});

describe('the server’s book of a series', () => {
  it('AC-04-04 cuts the first phone 1,000 numbers from the start, the next phone the next 1,000', () => {
    expect(loads(101001).take(1000)).toEqual({
      refusal: null,
      runs: [{ firstNumber: 101001, lastNumber: 102000 }],
      nextNumber: 102001,
    });
    expect(loads(102001, [block(101001, 102000)]).take(1000)).toEqual({
      refusal: null,
      runs: [{ firstNumber: 102001, lastNumber: 103000 }],
      nextNumber: 103001,
    });
  });

  it('AC-03-06 cuts a certifying phone 100 cert numbers from 730415', () => {
    const certs = new NumberSeriesBook(
      { series: 'CERTIFICATION', firstNumber: 730415, nextNumber: 730415 },
      [],
    );
    expect(certs.take(100)).toEqual({
      refusal: null,
      runs: [{ firstNumber: 730415, lastNumber: 730514 }],
      nextNumber: 730515,
    });
  });

  it('AC-04-07 hands the next phone what a reset phone handed back, lowest first, then numbers never handed out', () => {
    // P1-COL-1 used 101001 to 101006 and was reset; P1-COL-2 holds the next block.
    const book = loads(103001, [block(101001, 102000, 101006, 'RECLAIMED'), block(102001, 103000)]);
    expect(book.handedBack()).toEqual([{ firstNumber: 101007, lastNumber: 102000 }]);
    expect(book.take(1000)).toEqual({
      refusal: null,
      runs: [
        { firstNumber: 101007, lastNumber: 102000 },
        { firstNumber: 103001, lastNumber: 103006 },
      ],
      nextNumber: 103007,
    });
    expect(book.take(10)).toEqual({
      refusal: null,
      runs: [{ firstNumber: 101007, lastNumber: 101016 }],
      nextNumber: 103001,
    });
  });

  it('AC-04-07 hands a number back once: what was cut again is held again', () => {
    const cutAgain = loads(103001, [
      block(101001, 102000, 101006, 'RECLAIMED'),
      block(101007, 101500),
    ]);
    expect(cutAgain.handedBack()).toEqual([{ firstNumber: 101501, lastNumber: 102000 }]);
    // Cut again, used to 101100 and handed back again: the two rests are counted once.
    const twice = loads(103001, [
      block(101001, 102000, 101006, 'RECLAIMED'),
      block(101007, 101500, 101100, 'RECLAIMED'),
    ]);
    expect(twice.handedBack()).toEqual([{ firstNumber: 101101, lastNumber: 102000 }]);
  });

  it('AC-04-07 a block handed back unused is free whole; a lost phone’s retired block never is', () => {
    expect(loads(102001, [block(101001, 102000, null, 'RECLAIMED')]).handedBack()).toEqual([
      { firstNumber: 101001, lastNumber: 102000 },
    ]);
    expect(loads(102001, [block(101001, 102000, 101006, 'RETIRED')]).handedBack()).toEqual([]);
    expect(NumberSeriesBook.held(block(101001, 102000, 101006, 'RETIRED'))).toEqual({
      firstNumber: 101001,
      lastNumber: 102000,
    });
    expect(NumberSeriesBook.held(block(101001, 102000, 101006, 'RECLAIMED'))).toEqual({
      firstNumber: 101001,
      lastNumber: 101006,
    });
    expect(NumberSeriesBook.held(block(101001, 102000, null, 'RECLAIMED'))).toBeNull();
  });

  it('AC-04-07 keeps the highest number a phone reported: a phone never un-uses one, or uses one outside its block', () => {
    const held = block(101001, 102000, 101006);
    expect(NumberSeriesBook.lastUsed(held, 101037)).toBe(101037);
    expect(NumberSeriesBook.lastUsed(held, 101003)).toBe(101006);
    expect(NumberSeriesBook.lastUsed(held, null)).toBe(101006);
    expect(NumberSeriesBook.lastUsed(held, 102001)).toBe(101006);
    expect(NumberSeriesBook.lastUsed(block(101001, 102000), null)).toBeNull();
  });

  it('AC-04-01 never issues past 9,999,999: a series without enough left says so and takes nothing', () => {
    const last = new NumberSeriesBook(
      { series: 'LOAD', firstNumber: 100001, nextNumber: 9999001 },
      [],
    );
    expect(last.take(999)).toEqual({
      refusal: null,
      runs: [{ firstNumber: 9999001, lastNumber: 9999999 }],
      nextNumber: 10000000,
    });
    expect(last.take(1000)).toEqual({
      refusal: {
        code: 'NUMBER_SERIES_USED_UP',
        message: "The project's load series has fewer than 1,000 numbers left before 9,999,999.",
      },
    });
  });
});

describe('a new project’s series', () => {
  it('AC-01-09 a generated project has one per workflow, from 100,001 unless the firm says where; an ROE series; a cert-number series once seeded', () => {
    expect(new NewProjectNumbers('GENERATED').series({})).toEqual({
      refusal: null,
      series: [
        { series: 'LOAD', firstNumber: 100001 },
        { series: 'HAUL_OUT', firstNumber: 100001 },
        { series: 'UNIT_RATE', firstNumber: 100001 },
        { series: 'ROE', firstNumber: 1 },
      ],
    });
    expect(
      new NewProjectNumbers('GENERATED').series({
        LOAD: 101001,
        HAUL_OUT: 201001,
        UNIT_RATE: 301001,
        CERTIFICATION: 730415,
      }),
    ).toEqual({
      refusal: null,
      series: [
        { series: 'LOAD', firstNumber: 101001 },
        { series: 'HAUL_OUT', firstNumber: 201001 },
        { series: 'UNIT_RATE', firstNumber: 301001 },
        { series: 'CERTIFICATION', firstNumber: 730415 },
        { series: 'ROE', firstNumber: 1 },
      ],
    });
  });

  it('AC-04-09 a control-ticket project still generates its unit rate tickets, and has no load or haul-out series', () => {
    const control = new NewProjectNumbers('CONTROL');
    expect(control.series({})).toEqual({
      refusal: null,
      series: [
        { series: 'UNIT_RATE', firstNumber: 100001 },
        { series: 'ROE', firstNumber: 1 },
      ],
    });
    expect(control.series({ LOAD: 400001 })).toEqual({
      refusal: {
        code: 'NUMBER_SERIES_CONTROL_PROJECT',
        message:
          'Not saved: this project numbers its tickets from control tickets, so it has no load series. Enter the control ranges instead.',
      },
    });
  });

  it('AC-04-01 a start outside 100,001 to 9,999,999 is refused', () => {
    expect(new NewProjectNumbers('GENERATED').series({ HAUL_OUT: 99999 })).toEqual({
      refusal: {
        code: 'NUMBER_SERIES_START',
        message: 'Not saved: a haul-out series starts at a whole number from 100,001 to 9,999,999.',
      },
    });
  });
});

describe('a phone’s numbers', () => {
  it('AC-04-07 a reported last used number uses up every block before the one it lies in', () => {
    const phone = new PhoneNumbers([block(101001, 102000, 101990), block(104001, 104010)]);
    expect(phone.reported(104003)).toEqual([102000, 104003]);
    expect(phone.reported(101995)).toEqual([101995, null]);
    expect(phone.reported(null)).toEqual([101990, null]);
    expect(phone.reported(999999)).toEqual([101990, null]);
  });

  it('AC-04-06 are given out in order, offline: 101001, then 101002…', () => {
    expect(new PhoneNumbers([block(101001, 102000)]).next()).toBe(101001);
    expect(new PhoneNumbers([block(101001, 102000, 101001)]).next()).toBe(101002);
    expect(new PhoneNumbers([block(101001, 102000, 101006)]).unused()).toBe(994);
  });

  it('AC-04-06 run on into its next block when one is used up, and stop when all are', () => {
    const blocks = [block(101001, 102000, 102000), block(104001, 104006)];
    expect(new PhoneNumbers(blocks).next()).toBe(104001);
    expect(new PhoneNumbers([block(101001, 102000, 102000)]).next()).toBeNull();
  });

  it('AC-04-04 a phone that only records disposals holds no block and makes no number', () => {
    const tower = new PhoneNumbers([]);
    expect([tower.next(), tower.unused()]).toEqual([null, 0]);
  });

  it('AC-04-07 never come from a block that was reclaimed or retired', () => {
    const ended = [
      block(101001, 102000, 101006, 'RECLAIMED'),
      block(102001, 103000, null, 'RETIRED'),
    ];
    expect([new PhoneNumbers(ended).next(), new PhoneNumbers(ended).unused()]).toEqual([null, 0]);
  });

  it('AC-03-06 are topped up at a sync to a full block of unused numbers', () => {
    expect(new PhoneNumbers([]).topUp(1000)).toBe(1000);
    expect(new PhoneNumbers([block(101001, 102000, 101006)]).topUp(1000)).toBe(6);
    expect(new PhoneNumbers([block(101001, 102000)]).topUp(1000)).toBe(0);
    expect(new PhoneNumbers([block(730415, 730514, 730419)]).topUp(100)).toBe(5);
  });
});

describe('a control range', () => {
  const range = (
    firstNumber: number,
    lastNumber: number,
    series: ControlRangeEntry['series'] = 'LOAD',
    archived = false,
  ): ControlRangeEntry => ({ series, firstNumber, lastNumber, archived });

  it('AC-04-08 400001–405000 is kept for a control-ticket project’s loads; its haul-outs may have the same stock', () => {
    expect(new ControlRanges('CONTROL', []).check(range(400001, 405000))).toBeNull();
    expect(
      new ControlRanges('CONTROL', [range(400001, 405000)]).check(
        range(400001, 405000, 'HAUL_OUT'),
      ),
    ).toBeNull();
  });

  it('AC-01-09 is entered only where the project numbers its tickets from control tickets', () => {
    expect(new ControlRanges('GENERATED', []).check(range(400001, 405000))).toEqual({
      code: 'CONTROL_RANGE_GENERATED_PROJECT',
      message:
        'Not saved: this project generates its ticket numbers. A control range is entered on a project that numbers its tickets from control tickets.',
    });
  });

  it('AC-04-09 never numbers unit rate tickets, cert numbers or ROEs', () => {
    expect(new ControlRanges('CONTROL', []).check(range(400001, 405000, 'UNIT_RATE'))).toEqual({
      code: 'CONTROL_RANGE_SERIES',
      message:
        'Not saved: control tickets number loads and haul-outs. A unit rate number is never taken from a control range.',
    });
    for (const series of ['CERTIFICATION', 'ROE'] as const) {
      expect(new ControlRanges('CONTROL', []).check(range(1, 100, series))?.code).toBe(
        'CONTROL_RANGE_SERIES',
      );
    }
  });

  it('is a run, first to last, of whole numbers', () => {
    for (const [first, last] of [
      [405000, 400001],
      [0, 100],
      [400001.5, 405000],
    ] as const) {
      expect(new ControlRanges('CONTROL', []).check(range(first, last))?.code).toBe(
        'CONTROL_RANGE_INVALID',
      );
    }
    expect(new ControlRanges('CONTROL', []).check(range(400001, 400001))).toBeNull();
  });

  it('AC-04-08 the same stock entered twice is refused, naming the range it shares numbers with; one taken off no longer counts', () => {
    const entered = [range(400001, 405000), range(410001, 415000)];
    expect(new ControlRanges('CONTROL', entered).check(range(404000, 411000))).toEqual({
      code: 'CONTROL_RANGE_OVERLAP',
      message:
        'Not saved: 404000–411000 shares numbers with the load range 400001–405000 and 410001–415000 already entered.',
    });
    expect(new ControlRanges('CONTROL', entered).check(range(405001, 410000))).toBeNull();
    expect(
      new ControlRanges('CONTROL', [range(400001, 405000, 'LOAD', true)]).check(
        range(400001, 405000),
      ),
    ).toBeNull();
  });
});
