// A sign-in made on a phone with no connection: what its proof is made over, and when the
// session it opens ends (ADR-531).
import { describe, expect, it } from 'vitest';

import { OfflineSignInRules, offlineSignInKinds } from '../src/index.ts';

const said = {
  deviceId: '0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d11',
  id: '0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d21',
  kind: 'OWN_PASSWORD' as const,
  personId: '0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d31',
  // 7:00 am on Monday in Bayline County.
  signedInAt: new Date('2026-10-12T11:00:00.000Z'),
  masterPasscodeVersion: null,
};
const hour = 3_600_000;
const offlineSignIns = new OfflineSignInRules();

describe('a sign-in made offline', () => {
  it('is made three ways: the monitor’s own password, or under the master passcode as the phone’s monitor or the temporary session', () => {
    expect(offlineSignInKinds).toEqual(['OWN_PASSWORD', 'AS_MONITOR', 'TEMPORARY']);
    expect(offlineSignInKinds.map((kind) => offlineSignIns.underPasscode(kind))).toEqual([
      null,
      'AS_MONITOR',
      'TEMPORARY',
    ]);
  });

  it('is proven over every word of what it says, the instant to the millisecond in UTC: change one and it is another sign-in', () => {
    const signed = offlineSignIns.signed(said);
    expect(signed).toBe(
      [
        'open-adms/offline-sign-in/v1',
        said.deviceId,
        said.id,
        'OWN_PASSWORD',
        said.personId,
        '2026-10-12T11:00:00.000Z',
        '-',
      ].join('\n'),
    );
    for (const other of [
      { ...said, deviceId: said.id },
      { ...said, id: said.deviceId },
      { ...said, kind: 'AS_MONITOR' as const, masterPasscodeVersion: 3 },
      { ...said, personId: said.id },
      { ...said, signedInAt: new Date(said.signedInAt.getTime() + 1) },
      { ...said, masterPasscodeVersion: 3 },
    ]) {
      expect(offlineSignIns.signed(other)).not.toBe(signed);
    }
  });

  it('opens a session ending the firm’s hours after it was made, never after the moment it was reported; a temporary one also with the project’s day', () => {
    const received = new Date(said.signedInAt.getTime() + 3 * hour);
    expect(offlineSignIns.endsAt('OWN_PASSWORD', said.signedInAt, received, 24, undefined)).toEqual(
      new Date(said.signedInAt.getTime() + 24 * hour),
    );
    expect(offlineSignIns.endsAt('AS_MONITOR', said.signedInAt, received, 14, undefined)).toEqual(
      new Date(said.signedInAt.getTime() + 14 * hour),
    );
    // Midnight in Bayline County (UTC−04:00) is seventeen hours after 7 am.
    expect(
      offlineSignIns.endsAt('TEMPORARY', said.signedInAt, received, 24, 'America/New_York'),
    ).toEqual(new Date('2026-10-13T04:00:00.000Z'));
    // A phone's clock ahead of the server's: counted from the server's now.
    const ahead = new Date(received.getTime() + 2 * hour);
    expect(offlineSignIns.endsAt('OWN_PASSWORD', ahead, received, 24, undefined)).toEqual(
      new Date(received.getTime() + 24 * hour),
    );
  });
});
