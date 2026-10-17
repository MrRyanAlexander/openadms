// A sign-in made on a phone with no connection, and how the phone proves it once it has one
// (ARCHITECTURE §7.2, §7.3; adms-field-app §4A.0 (6), (7); ADR-105, 454, 462, 531). The user,
// 2026-10-15: a phone syncs only while somebody is signed in on it, and an offline sign-in counts
// "so long as you can still prove you are who you claim to be".
//
// - **Three ways a sign-in is made offline:** the monitor's own password, checked against the
//   phone's login list; and under the master passcode, as the phone's monitor or the temporary
//   session for a monitor picked from the roster (`masterPasscodeSessions`), checked against the
//   phone's check of the passcode.
// - **The proof.** To check what was typed, the phone makes the first of its check's two slow
//   hashes from it (offline-checks.ts in the API): for a password, the monitor's offline seed;
//   for the passcode, the server's own hash of it. Both are what the server keeps, and no phone
//   holds either but for that moment. With it the phone makes an HMAC-SHA256 over `signed`,
//   keeps that and drops the hash. Only somebody who typed the right password or passcode can
//   make it; it gives away neither, and it names the phone, the sign-in and its moment, so it
//   proves nothing else.
// - **When the session it opens ends** is counted from the sign-in, never from when the server
//   heard of it: a monitor's own lasts the firm's hours; one under the passcode as such a
//   session does (`PasscodeSessionRules`). A phone's clock ahead of the server's is taken as the
//   server's now, so no session outlasts the firm's hours from the moment it was reported.
import {
  masterPasscodeSessions,
  PasscodeSessionRules,
  type MasterPasscodeSessionKind,
} from './passcode-sessions.ts';

export const offlineSignInKinds = ['OWN_PASSWORD', ...masterPasscodeSessions] as const;

export type OfflineSignInKind = (typeof offlineSignInKinds)[number];

// What a phone says of a sign-in it made offline: what its proof is made over.
export interface OfflineSignInSaid {
  readonly deviceId: string;
  // The phone's own id for the sign-in.
  readonly id: string;
  readonly kind: OfflineSignInKind;
  // The monitor signed in, or the session is for.
  readonly personId: string;
  // The phone's clock when it was made.
  readonly signedInAt: Date;
  // The version of the master passcode whose check the phone held: under the passcode only.
  readonly masterPasscodeVersion: number | null;
}

export class OfflineSignInRules {
  // Whether the sign-in was made under the master passcode, and which way.
  underPasscode(kind: OfflineSignInKind): MasterPasscodeSessionKind | null {
    return kind === 'OWN_PASSWORD' ? null : kind;
  }

  // What the phone's HMAC is made over: one line each, the instant as UTC to the millisecond.
  signed(said: OfflineSignInSaid): string {
    return [
      'open-adms/offline-sign-in/v1',
      said.deviceId,
      said.id,
      said.kind,
      said.personId,
      said.signedInAt.toISOString(),
      said.masterPasscodeVersion === null ? '-' : String(said.masterPasscodeVersion),
    ].join('\n');
  }

  // When its session ends: `hours` the firm's for a monitor's sign-in, `timeZone` that of the
  // project of the assignment the phone takes for the monitor, where it takes one.
  endsAt(
    kind: OfflineSignInKind,
    signedInAt: Date,
    receivedAt: Date,
    hours: number,
    timeZone: string | undefined,
  ): Date {
    const from = signedInAt < receivedAt ? signedInAt : receivedAt;
    const underPasscode = this.underPasscode(kind);
    if (underPasscode === null) return new Date(from.getTime() + hours * 3_600_000);
    return new PasscodeSessionRules(hours).endsAt(underPasscode, from, timeZone);
  }
}
