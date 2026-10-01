// The system actor: the User the worker writes as (ADR-270 (4), 273). Not a person and never a
// login (role SYSTEM, no password, no Monitor ID). The installer's seed creates it, in every
// installation with this same id, so the worker states it without looking it up. The id is laid
// out as a UUIDv7 with a zero time, so it sorts before every other user.
import type { Actor } from './actor.ts';

export const systemActorId = '00000000-0000-7000-8000-000000000001';
export const systemActorName = 'Open ADMS (system)';

export const systemActor: Actor = { actorId: systemActorId, source: 'SYSTEM' };
