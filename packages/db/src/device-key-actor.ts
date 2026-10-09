// The device key's actor: the User a phone's own act is written as (ADR-440). A phone proves
// itself with its device key before anybody on it is known to the server, so what the server
// writes then (the challenge the phone answered) names no person: the audit log names the key
// the act was done on the strength of, and the phone. Not a person and never a login (role
// DEVICE_KEY, no password, no Monitor ID). The installer's seed creates it, in every
// installation with this same id, beside the system actor and the master passcode's actor.
// Only the API may state it, only for a phone (source DEVICE) and always naming that phone: the
// database refuses anything else, and refuses it as the author, the monitor or the holder of
// any record.
import type { Actor } from './actor.ts';

export const deviceKeyActorId = '00000000-0000-7000-8000-000000000003';
export const deviceKeyActorName = 'Device key';

// The actor of a phone's own act, on that phone.
export function byDeviceKey(deviceId: string): Actor {
  return { actorId: deviceKeyActorId, source: 'DEVICE', deviceId };
}
