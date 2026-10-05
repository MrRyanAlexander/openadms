// The flag catalogue as one closed set, how a message reads, and the facts a flag keeps with
// their hash (spec/acceptance/06-reconciliation.md AC-06-136, 137, 138, 142; spec/FLAGS.md §1;
// ADR-166, 344). That every message is the page's, word for word, is held to spec/FLAGS.md itself
// by packages/scenarios/test/flag-catalogue.test.ts, which can read the page.
import { describe, expect, it } from 'vitest';

import {
  Flags,
  ProjectClock,
  flagBillings,
  flagCodes,
  type FlagRaised,
  type FlagStanding,
} from '../src/index.ts';
import { sha256 } from '../src/sha256.ts';

const flags = new Flags('America/New_York');
const ticket = (ticketNumber: string) => ({ ticketNumber });

describe('the flag catalogue', () => {
  it('AC-06-137 is one closed set of 75 codes, none twice, and three things a flag can do to the money', () => {
    expect(flagCodes).toHaveLength(75);
    expect(new Set(flagCodes).size).toBe(75);
    expect(flagBillings).toEqual(['BILLS', 'LINE_NOT_BILLED', 'NOT_BILLED']);
  });

  it('AC-06-136 a message is "Ticket <number>: <the facts>. Flagged for review.", ending "not billed" where it stops the ticket billing', () => {
    expect(flags.raise('LOAD_CALL_HIGH', ticket('101003'), { loadCall: 96 }, {}).message).toBe(
      'Ticket 101003: load call 96%. Flagged for review.',
    );
    const zero = flags.raise('LOAD_CALL_ZERO', ticket('101032'), {}, { loadCall: 0 });
    expect(zero.message).toBe('Ticket 101032: load call 0%. Flagged for review; not billed.');
    expect(zero.billing).toBe('NOT_BILLED');
  });

  it('AC-06-136 a flag on a record that isn’t a ticket names the record', () => {
    expect(flags.raise('PERMIT_OUTSTANDING', { site: 'Marsh Road TDSR' }, {}, {}).message).toBe(
      'Marsh Road TDSR: permit outstanding.',
    );
    expect(flags.raise('NO_PRE_WORK_SURVEY', { surveyOnRoe: 'R-0008' }, {}, {}).message).toBe(
      'Survey on ROE R-0008: no pre-work survey.',
    );
  });

  it('AC-06-136 dates and times read 03-Feb-2027 and 21:40, in the project’s time zone', () => {
    const clock = new ProjectClock('America/New_York');
    // 01:40 UTC on Tuesday is 21:40 on Monday in Bayline County.
    const instant = new Date('2026-10-13T01:40:00Z');

    expect(clock.day(instant)).toBe('2026-10-12');
    expect(clock.date(instant)).toBe('12-Oct-2026');
    expect(clock.time(instant)).toBe('21:40');
    expect(clock.time(new Date('2026-10-12T04:05:00Z'))).toBe('00:05');
    expect(ProjectClock.dateOf('2027-02-03')).toBe('03-Feb-2027');
    // Four hours behind UTC in October, five in February; a project in Texas is on its own.
    expect(clock.offsetMinutes(instant)).toBe(-240);
    expect(clock.offsetMinutes(new Date('2027-02-03T15:00:00Z'))).toBe(-300);
    expect(new ProjectClock('America/Chicago').time(instant)).toBe('20:40');
    expect(ProjectClock.offsetOf(-300)).toBe('UTC−05:00');
    expect(ProjectClock.offsetOf(330)).toBe('UTC+05:30');
    expect(() => new ProjectClock('Bayline/County')).toThrow();
    expect(() => ProjectClock.dateOf('3 Feb 2027')).toThrow('Not a calendar day');
  });

  it('a stump under 24 in bills as its band says, and not at all where no band holds it', () => {
    const told = { inches: '20', bandHoldsIt: false };
    const flag = flags.raise('STUMP_UNDER_24', ticket('301005'), told, { inches: '20' });

    expect(flag.message).toBe(
      'Ticket 301005: not an eligible stump (20 in, under 24 in). Flagged for review.',
    );
    expect(flag.billing).toBe('NOT_BILLED');
    expect(
      flags.raise('STUMP_UNDER_24', ticket('301005'), { ...told, bandHoldsIt: true }, {}).billing,
    ).toBe('BILLS');
  });
});

describe('the facts a flag keeps', () => {
  it('AC-06-138 a flag keeps its code, the facts it was raised on with their hash, and what it does to the money', () => {
    const flag = flags.raise(
      'LOAD_CALL_HIGH',
      ticket('101003'),
      { loadCall: 96 },
      { loadCall: 96, highLimit: 95 },
      'the-disposal',
    );

    expect(flag).toEqual({
      code: 'LOAD_CALL_HIGH',
      subject: { ticketNumber: '101003' },
      fieldEventId: 'the-disposal',
      message: 'Ticket 101003: load call 96%. Flagged for review.',
      billing: 'BILLS',
      facts: { loadCall: 96, highLimit: 95 },
      // The SHA-256 of {"highLimit":95,"loadCall":96}.
      factsSha256: 'dd6f3b73a291c3256b18919a5e82584a9cf49e4705b530aaa9b1f5a5f5b8f5d3',
    });
    expect(flag.factsSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the same facts give the same hash in whatever order they are given, and any other fact gives another', () => {
    const hash = Flags.hashOf({ loadCall: 96, highLimit: 95 });

    expect(Flags.hashOf({ highLimit: 95, loadCall: 96 })).toBe(hash);
    expect(Flags.hashOf({ loadCall: 97, highLimit: 95 })).not.toBe(hash);
    expect(Flags.hashOf({ loadCall: '96', highLimit: 95 })).not.toBe(hash);
    expect(
      Flags.hashOf({ loading: ['a', 'b'], other: { number: '101030', times: [1, null] } }),
    ).toBe(Flags.hashOf({ other: { times: [1, null], number: '101030' }, loading: ['a', 'b'] }));
    // A list's order is a fact.
    expect(Flags.hashOf({ suffixes: ['A', 'C'] })).not.toBe(Flags.hashOf({ suffixes: ['C', 'A'] }));
  });

  it('the hash is SHA-256 as every machine works it out', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(sha256('C&D – 96% ✓ 😀')).toBe(
      '2af9fecc32c3bf27b3ee18950b5058256d791ad885447340864f8f79a77924bc',
    );
    expect(sha256('a'.repeat(1000))).toBe(
      '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3',
    );
  });
});

describe('a ticket’s flags on a reprocess', () => {
  const high = (loadCall: number): FlagRaised =>
    flags.raise(
      'LOAD_CALL_HIGH',
      ticket('101003'),
      { loadCall },
      { loadCall, highLimit: 95 },
      'the-disposal',
    );
  const standing = (id: string, flag: FlagRaised, accepted = false) =>
    ({
      id,
      code: flag.code,
      fieldEventId: flag.fieldEventId,
      factsSha256: flag.factsSha256,
      accepted,
    }) satisfies FlagStanding & { accepted: boolean };

  it('AC-06-138 the same facts keep the same flag, with its acceptance: it isn’t raised again', () => {
    const accepted = standing('flag-1', high(96), true);
    const compared = Flags.compared([accepted], [high(96)]);

    expect(compared).toEqual({ kept: [accepted], cleared: [], raised: [] });
    expect(compared.kept[0]?.accepted).toBe(true);
  });

  it('AC-06-138 changed facts clear it and, the problem still there, raise a new one to be looked at again', () => {
    const accepted = standing('flag-1', high(96), true);
    const compared = Flags.compared([accepted], [high(97)]);

    expect(compared.kept).toEqual([]);
    expect(compared.cleared).toEqual([accepted]);
    expect(compared.raised.map((flag) => flag.message)).toEqual([
      'Ticket 101003: load call 97%. Flagged for review.',
    ]);
  });

  it('AC-06-138 facts that no longer raise it clear it; a flag about another field event, or another flag on the same facts, is another flag', () => {
    const before = standing('flag-1', high(96));
    expect(Flags.compared([before], [])).toEqual({ kept: [], cleared: [before], raised: [] });

    const onTheOtherEnd = { ...high(96), fieldEventId: 'the-collection' };
    expect(Flags.compared([before], [onTheOtherEnd])).toMatchObject({
      cleared: [before],
      raised: [onTheOtherEnd],
    });
    const low = flags.raise('LOAD_CALL_LOW', ticket('101003'), { loadCall: 96 }, high(96).facts);
    expect(Flags.compared([before], [high(96), low]).raised).toEqual([low]);
  });
});
