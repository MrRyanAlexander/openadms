// What the server decides about a record as it arrives (spec/acceptance/05-sync.md AC-05-20, 24,
// 25, 39, 45, 46; ADR-022, 329 (5), 338, 467). The fixes are the example world's: Marsh Road TDSR.
import { describe, expect, it } from 'vitest';

import { GpsFix, NotSaved, notSavedReasons, Quarantine, quarantineReasons } from '../src/index.ts';

describe('a GPS fix as a phone sends it', () => {
  it('AC-05-39 a fix on the earth is kept as sent, exact decimals as text', () => {
    expect(new GpsFix({ latitude: '39.09000000', longitude: '-75.62000000' }).read()).toEqual({
      fix: { latitude: '39.09000000', longitude: '-75.62000000' },
      unreadable: null,
    });
    // The poles and the date line are on the earth.
    for (const [latitude, longitude] of [
      ['90', '180'],
      ['-90', '-180'],
      ['0', '0'],
    ] as const) {
      expect(new GpsFix({ latitude, longitude }).read().fix).toEqual({ latitude, longitude });
    }
  });

  it('no fix at all is taken: the phone had none', () => {
    expect(new GpsFix({ latitude: null, longitude: null }).read()).toEqual({
      fix: null,
      unreadable: null,
    });
    expect(new GpsFix({ latitude: undefined, longitude: undefined }).read()).toEqual({
      fix: null,
      unreadable: null,
    });
  });

  it('AC-05-39 half a fix, a latitude past 90 and a longitude past 180 can’t be one: no fix, and what was sent is kept as sent', () => {
    for (const sent of [
      { latitude: '39.09000000', longitude: null },
      { latitude: null, longitude: '-75.62000000' },
      { latitude: '91.20000000', longitude: '-75.62000000' },
      { latitude: '-90.00000001', longitude: '-75.62000000' },
      { latitude: '39.09000000', longitude: '180.5' },
    ]) {
      expect(new GpsFix(sent).read(), JSON.stringify(sent)).toEqual({
        fix: null,
        unreadable: sent,
      });
    }
  });

  it('anything that isn’t a decimal can’t be one either, whatever it is', () => {
    for (const sent of [
      { latitude: 'north', longitude: '-75.62000000' },
      { latitude: '39,0900', longitude: '-75.62000000' },
      { latitude: '', longitude: '' },
      { latitude: 39.09, longitude: -75.62 },
      { latitude: '3.909e1', longitude: '-75.62000000' },
    ]) {
      expect(new GpsFix(sent).read(), JSON.stringify(sent)).toEqual({
        fix: null,
        unreadable: sent,
      });
    }
  });
});

describe('what a phone is told of a record kept in quarantine', () => {
  it('AC-05-20, AC-05-24 a second field event of one kind on one ticket: not saved, with the reason, in plain words, for every kind', () => {
    expect(Quarantine.duplicateFieldEvent('DISPOSAL', '101020', '')).toEqual({
      reason: 'DUPLICATE_FIELD_EVENT',
      message:
        'Ticket 101020: this ticket already has a disposal. Not saved: kept in quarantine for review.',
    });
    expect(
      (
        [
          ['COLLECTION', '101020'],
          ['HAUL_OUT_COLLECTION', '201001'],
          ['HAUL_OUT_DISPOSAL', '201001'],
          ['UNIT_RATE', '301001'],
        ] as const
      ).map(([kind, number]) => Quarantine.duplicateFieldEvent(kind, number, '').message),
    ).toEqual([
      'Ticket 101020: this ticket already has a collection. Not saved: kept in quarantine for review.',
      'Ticket 201001: this ticket already has a haul-out collection. Not saved: kept in quarantine for review.',
      'Ticket 201001: this ticket already has a haul-out disposal. Not saved: kept in quarantine for review.',
      'Ticket 301001: this ticket already has a unit rate event. Not saved: kept in quarantine for review.',
    ]);
  });

  it('AC-05-25 a second collection for one property of a split names the property', () => {
    expect(Quarantine.duplicateFieldEvent('COLLECTION', '102001', 'A').message).toBe(
      'Ticket 102001-A: this ticket already has a collection. Not saved: kept in quarantine for review.',
    );
  });

  it('an ROE made on a phone whose number the project already has', () => {
    expect(Quarantine.duplicateRoeNumber('R-0007')).toEqual({
      reason: 'DUPLICATE_ROE_NUMBER',
      message:
        'ROE R-0007: this project already has an ROE with that number. Not saved: kept in quarantine for review.',
    });
  });

  it('the reasons are a closed set of two', () => {
    expect(quarantineReasons).toEqual(['DUPLICATE_FIELD_EVENT', 'DUPLICATE_ROE_NUMBER']);
  });
});

describe('what a phone is told of a record that could not be saved at all', () => {
  it('AC-05-45, AC-05-46 not saved, with the reason, in plain words: never a judgement of the work, and never a value that was sent', () => {
    expect(notSavedReasons).toEqual(['NOT_A_RECORD', 'NAMES_NO_RECORD', 'ASSIGNMENT_NOT_SAVED']);
    const told = [
      NotSaved.notARecord('fieldEvent.loadCall in this record can’t be more than 100'),
      NotSaved.namesNoRecord(),
      NotSaved.assignmentNotSaved(),
    ];
    expect(told.map((notice) => notice.reason)).toEqual([...notSavedReasons]);
    expect(told.map((notice) => notice.message)).toEqual([
      'Not saved: this record can’t be read: fieldEvent.loadCall in this record can’t be more than 100.',
      'Not saved: this record names something the server doesn’t have: its project, its monitor, its assignment, or something picked from a list.',
      'Not saved: the assignment this record was made under was not saved.',
    ]);
    for (const { message } of told) {
      expect(message.startsWith('Not saved: ')).toBe(true);
      expect(message).not.toMatch(/eligib|flag|quarantine/i);
    }
  });
});
