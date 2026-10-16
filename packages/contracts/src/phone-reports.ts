// What a phone reports besides its records, said once (ARCHITECTURE §7's notes, §7.5, §10;
// BACKLOG 2.5.4, 2.6.1; ADR-240, 456…458, 464, 467, 531): an unplanned assignment made on it under
// the master passcode, and a use of the passcode it logged with no connection; and a sign-in made
// on it with no connection, reported by itself before anything else is sent. Each has an
// endpoint of its own (endpoints.ts) and rides in a sync's payload (sync.ts); both read it with
// the one schema here. The work an assignment states is the dispatch board's too.
import {
  assignmentFormDocumentTypes,
  fieldEventKinds,
  loggedPasscodeUses,
  offlineSignInKinds,
  OfflineSignInRules,
  PasscodeLogRules,
  unplannedOccasions,
} from '@open-adms/domain';
import { z } from 'zod';

export const once = (values: readonly string[]): boolean => new Set(values).size === values.length;

export const assignedWork = {
  // The kinds of field event they may record; none on a certifier's or a helper's day.
  fieldEventKinds: z.array(z.enum(fieldEventKinds)).max(fieldEventKinds.length).refine(once),
  certifying: z.boolean(),
  // The forms that are no ticket's (ADR-308).
  formDocumentTypes: z
    .array(z.enum(assignmentFormDocumentTypes))
    .max(assignmentFormDocumentTypes.length)
    .refine(once),
  // One of the project's own sites, where the work is at one; null on a curb collection.
  siteId: z.uuid().nullable(),
  // The phone, where one is named; null where they sign in on whichever they pick up.
  deviceId: z.uuid().nullable(),
  // The project's unit rate pay items they do that day, each once.
  payItemIds: z.array(z.uuid()).max(200).refine(once),
};

// An unplanned assignment as the phone it was made on reports it (ADR-457, 458).
export const unplannedAssignmentReportSchema = z.strictObject({
  // Made on the phone, so that what it records under the assignment can name it at once.
  id: z.uuid(),
  projectId: z.uuid(),
  // The monitor, picked from the phone's login list.
  personId: z.uuid(),
  fieldEventKinds: assignedWork.fieldEventKinds,
  certifying: assignedWork.certifying,
  formDocumentTypes: assignedWork.formDocumentTypes,
  siteId: assignedWork.siteId,
  payItemIds: assignedWork.payItemIds,
  // What it was made at: the phone set up, or passed to this monitor.
  occasion: z.enum(unplannedOccasions),
  // The phone's clock when it was made, as a UTC instant, and how far that clock stood from
  // UTC, in minutes (ADR-100): UTC−12:00 to UTC+14:00.
  madeAt: z.iso.datetime(),
  deviceUtcOffsetMinutes: z.number().int().min(-720).max(840),
});

const passcodeLog = new PasscodeLogRules();
const offlineSignIns = new OfflineSignInRules();

// A use of the master passcode as the phone that logged it reports it (ADR-464).
export const passcodeUseReportSchema = z
  .strictObject({
    // Made on the phone when it logged the use.
    id: z.uuid(),
    // What the passcode was typed for.
    use: z.enum(loggedPasscodeUses),
    // The monitor it was for, from the phone's login list; null for a wrong try, and only
    // for one.
    personId: z.uuid().nullable(),
    // The phone's clock when it was logged, as a UTC instant, and how far that clock stood
    // from UTC, in minutes (ADR-100): UTC−12:00 to UTC+14:00.
    loggedAt: z.iso.datetime(),
    deviceUtcOffsetMinutes: z.number().int().min(-720).max(840),
  })
  .refine(({ use, personId }) => passcodeLog.namesAMonitor(use) === (personId !== null), {
    path: ['personId'],
  });

// A sign-in made on the phone with no connection, as the phone reports it once it has one, so
// that what it sends then is sent by somebody signed in (ADR-531; the domain's
// `OfflineSignInRules`). `proof`: the phone's HMAC-SHA256 over what the domain says it signs,
// keyed by the first slow hash of what was typed, in base64url (32 bytes).
export const offlineSignInReportSchema = z
  .strictObject({
    // Made on the phone when the sign-in was made.
    id: z.uuid(),
    kind: z.enum(offlineSignInKinds),
    // The monitor signed in, or the session is for, from the phone's login list.
    personId: z.uuid(),
    // The phone's clock when it was made, as a UTC instant, and how far that clock stood from
    // UTC, in minutes (ADR-100): UTC−12:00 to UTC+14:00.
    signedInAt: z.iso.datetime(),
    deviceUtcOffsetMinutes: z.number().int().min(-720).max(840),
    // The version of the master passcode whose check the phone held: under the passcode only.
    masterPasscodeVersion: z.number().int().min(1).max(2_147_483_647).nullable(),
    proof: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .refine(
    ({ kind, masterPasscodeVersion }) =>
      (offlineSignIns.underPasscode(kind) === null) === (masterPasscodeVersion === null),
    { path: ['masterPasscodeVersion'] },
  );

export type UnplannedAssignmentReport = z.infer<typeof unplannedAssignmentReportSchema>;
export type OfflineSignInReport = z.infer<typeof offlineSignInReportSchema>;
export type PasscodeUseReport = z.infer<typeof passcodeUseReportSchema>;
