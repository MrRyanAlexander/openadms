// The master passcode's actor: the User an act under the master passcode is written as
// (ADR-438, 439). The passcode is one value for the firm and whoever holds it is not known
// (ADR-106, 240), so the audit log names the passcode itself, never a person who may not have
// done it. Not a person and never a login (role MASTER_PASSCODE, no password, no Monitor ID).
// The installer's seed creates it, in every installation with this same id, beside the system
// actor. Only the API may state it, and only for a phone (source DEVICE): the database refuses
// anything else, and refuses it as the author, the monitor or the holder of any record.
import type { Actor } from './actor.ts';

export const masterPasscodeActorId = '00000000-0000-7000-8000-000000000002';
export const masterPasscodeActorName = 'Master passcode';

// The actor of an act under the master passcode, on the phone it was done on where the server
// knows the phone (a wrong try at enrolment has none yet).
export function underMasterPasscode(deviceId?: string): Actor {
  return {
    actorId: masterPasscodeActorId,
    source: 'DEVICE',
    ...(deviceId === undefined ? {} : { deviceId }),
  };
}
