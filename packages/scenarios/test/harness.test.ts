// The harness's own pieces, without a database (BACKLOG 0.4.1; ADR-275): the story's clock, the
// ids a phone makes, and a phone that keeps what it records until it syncs.
import { describe, expect, it } from 'vitest';

import { projectTime, StoryClock, utcOffsetMinutes } from '../src/clock.ts';
import { SimulatedDevice, type RecordedEvent, type SyncIntake } from '../src/device.ts';
import { uuidv7, uuidv7Time } from '../src/ids.ts';

const setup = {
  name: 'P1-COL-1',
  deviceId: '00000000-0000-7000-8000-00000000000a',
  monitorId: '00000000-0000-7000-8000-00000000000b',
  assignmentId: '00000000-0000-7000-8000-00000000000d',
  projectId: '00000000-0000-7000-8000-00000000000c',
  setupVersion: 4,
  timeZone: 'America/New_York',
};

class Received implements SyncIntake {
  readonly events: RecordedEvent[] = [];
  refuseAfter = Infinity;

  receive(event: RecordedEvent): Promise<void> {
    if (this.events.length >= this.refuseAfter) return Promise.reject(new Error('no signal'));
    this.events.push(event);
    return Promise.resolve();
  }
}

describe('the story clock', () => {
  it('starts where the story says and moves only forward', () => {
    const clock = new StoryClock('2026-10-12T08:15:00-04:00');
    expect(clock.now().toISOString()).toBe('2026-10-12T12:15:00.000Z');
    clock.advance(25);
    expect(projectTime('America/New_York', clock.now())).toBe('Mon 12 Oct 08:40');
    clock.set('2026-10-13T07:15:00-04:00');
    expect(projectTime('America/New_York', clock.now())).toBe('Tue 13 Oct 07:15');
    expect(() => {
      clock.set('2026-10-12T09:00:00-04:00');
    }).toThrow("can't go back");
    expect(() => {
      clock.advance(-1);
    }).toThrow("can't go back");
  });

  it('refuses a time without its offset', () => {
    expect(() => new StoryClock('2026-10-12T08:15:00')).toThrow('with their offset');
  });

  it('knows a time zone’s offset at an instant, summer time included', () => {
    expect(utcOffsetMinutes('America/New_York', new Date('2026-10-12T12:00:00Z'))).toBe(-240);
    expect(utcOffsetMinutes('America/New_York', new Date('2026-12-01T12:00:00Z'))).toBe(-300);
    expect(utcOffsetMinutes('UTC', new Date('2026-10-12T12:00:00Z'))).toBe(0);
    expect(utcOffsetMinutes('Asia/Kolkata', new Date('2026-10-12T12:00:00Z'))).toBe(330);
  });
});

describe('a phone-made id', () => {
  it('is a UUIDv7 holding the time it was made', () => {
    const at = new Date('2026-10-12T12:15:00.123Z');
    const id = uuidv7(at);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuidv7Time(id).toISOString()).toBe('2026-10-12T12:15:00.123Z');
    expect(uuidv7(at)).not.toBe(id);
  });

  it('sorts by the time it was made', () => {
    const earlier = uuidv7(new Date('2026-10-12T12:15:00Z'));
    const later = uuidv7(new Date('2026-10-12T12:15:00.001Z'));
    expect([later, earlier].sort()).toEqual([earlier, later]);
  });
});

describe('a simulated phone', () => {
  it('keeps what its monitor records until it syncs, then sends it in the order recorded', async () => {
    const clock = new StoryClock('2026-10-12T08:15:00-04:00');
    const phone = new SimulatedDevice(setup, clock);
    const first = phone.begin('LOAD', 'COLLECTION');
    clock.advance(25);
    phone.complete(first, { ticketNumber: '101001' });
    const second = phone.begin('LOAD', 'COLLECTION');
    clock.advance(20);
    phone.complete(second, { ticketNumber: '101002' });
    expect(phone.waiting.map((event) => event.ticketNumber)).toEqual(['101001', '101002']);

    const intake = new Received();
    expect(await phone.sync(intake)).toBe(2);
    expect(intake.events.map((event) => event.ticketNumber)).toEqual(['101001', '101002']);
    expect(phone.waiting).toEqual([]);
    expect(await phone.sync(intake)).toBe(0);
  });

  it('stamps its own clock, its offset, and an id made when the badge was scanned', () => {
    const clock = new StoryClock('2026-10-12T08:15:00-04:00');
    const phone = new SimulatedDevice({ ...setup, clockErrorMinutes: -7 }, clock);
    const id = phone.begin('LOAD', 'DISPOSAL');
    clock.advance(20);
    const event = phone.complete(id, { ticketNumber: '101001', loadCall: 80 });
    expect(projectTime('America/New_York', event.startedAt)).toBe('Mon 12 Oct 08:08');
    expect(projectTime('America/New_York', event.endedAt)).toBe('Mon 12 Oct 08:28');
    expect(uuidv7Time(event.id)).toEqual(event.startedAt);
    expect(event).toMatchObject({
      projectId: setup.projectId,
      monitorId: setup.monitorId,
      deviceId: setup.deviceId,
      assignmentId: setup.assignmentId,
      setupVersion: 4,
      workflow: 'LOAD',
      kind: 'DISPOSAL',
      splitSuffix: '',
      deviceUtcOffsetMinutes: -240,
      loadCall: 80,
      endLatitude: null,
    });
  });

  it('keeps what wasn’t received, in order, when the signal drops mid-sync', async () => {
    const clock = new StoryClock('2026-10-12T08:15:00-04:00');
    const phone = new SimulatedDevice(setup, clock);
    for (const number of ['101001', '101002', '101003']) {
      phone.complete(phone.begin('LOAD', 'COLLECTION'), { ticketNumber: number });
    }
    const intake = new Received();
    intake.refuseAfter = 1;
    await expect(phone.sync(intake)).rejects.toThrow('no signal');
    expect(phone.waiting.map((event) => event.ticketNumber)).toEqual(['101002', '101003']);
    intake.refuseAfter = Infinity;
    expect(await phone.sync(intake)).toBe(2);
    expect(intake.events.map((event) => event.ticketNumber)).toEqual([
      '101001',
      '101002',
      '101003',
    ]);
  });

  it('completes only a field event it started', () => {
    const phone = new SimulatedDevice(setup, new StoryClock('2026-10-12T08:15:00-04:00'));
    expect(() => phone.complete('not-started', { ticketNumber: '101001' })).toThrow(
      'has no field event',
    );
  });
});
