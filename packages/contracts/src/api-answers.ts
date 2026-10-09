// What the API says about itself and about a refusal (ARCHITECTURE §6, Output; ADR-385).
// Every answer's shape lives here, never in a controller.
import {
  assignmentFormDocumentTypes,
  fieldEventKinds,
  mileageSources,
  passwordProblemCodes,
  permissions,
  quantitySources,
  workerStatuses,
  workflows,
} from '@open-adms/domain';
import { z } from 'zod';

import { billingUnits } from './setup-answers.ts';

// The health answer says that the process answers, and nothing else: no version, no setting, no
// word on the database. Anybody may ask (acceptance file 10, point 17).
export const healthAnswerSchema = z.strictObject({ status: z.literal('ok') });

export type HealthAnswer = z.infer<typeof healthAnswerSchema>;

// A refusal or a failure is a plain code and the request's id, never a message from inside the
// server. A task that adds a refusal of its own (not signed in, not allowed, limited) adds its code.
export const errorCodes = [
  'BAD_REQUEST',
  'NOT_FOUND',
  'TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'INTERNAL_ERROR',
  // Why a password was not taken (the domain's rules; ADR-402, 403): the person is told which.
  ...passwordProblemCodes,
  // A reset by email that isn't good: not one the server made, run out, or already used (ADR-404).
  'RESET_REFUSED',
  // The firm has no mail server: an admin sets the password instead (ADR-170).
  'NO_MAIL',
  // A sign-in that didn't work. One code whatever the reason: a name nobody has, a wrong
  // password, a login that waits or is locked, one that may not sign in here (ADR-409).
  'SIGN_IN_REFUSED',
  // No session, or one that has ended: signed out, run out, revoked (ADR-408).
  'NOT_SIGNED_IN',
  // A call with a session's cookie and without the session's CSRF value (ADR-408).
  'CSRF_REFUSED',
  // The person must first set a password of their own: somebody else set this one (ADR-410).
  'PASSWORD_CHANGE_REQUIRED',
  // Changing one's own password: the current one given is wrong, or the new one is the same.
  'PASSWORD_WRONG',
  'PASSWORD_UNCHANGED',
  // The password was right and the person has an authenticator: the sign-in is sent again with
  // its code (ADR-412). A wrong code is a sign-in refused like any other.
  'TWO_STEP_CODE_NEEDED',
  // The person must first set an authenticator up: an admin and a manager/analyst need one.
  'TWO_STEP_SETUP_REQUIRED',
  // Setting one up: the setup isn't one the server began for this person, has run out, or the
  // code doesn't prove the authenticator.
  'TWO_STEP_REFUSED',
  // The person already has an authenticator, or has none to clear.
  'TWO_STEP_ALREADY_SET_UP',
  'TWO_STEP_NOT_SET_UP',
  // Signed in, and not somebody who may do this: the endpoint isn't open to their role, or takes a
  // permission they don't hold now (ADR-415).
  'NOT_ALLOWED',
  // Creating a person: a back-office or outside user already signs in with that email address.
  'EMAIL_HELD',
  // The firm's only admin can't be archived (ARCHITECTURE §6).
  'LAST_ADMIN',
  // A permission is given to a manager/analyst only; a project to a read-only viewer only.
  'NOT_A_MANAGER_ANALYST',
  'NOT_A_VIEWER',
  // A role is changed between admin and manager/analyst only: never a monitor's, a read-only
  // viewer's or an archived person's, and never to one of theirs (ADR-427).
  'NOT_BACK_OFFICE',
  // A contractor user's contractor, or a viewer's project, that the firm doesn't hold.
  'UNKNOWN_CONTRACTOR',
  'UNKNOWN_PROJECT',
  // The caller is over a rate limit (ADR-416): status 429, with how long to wait.
  'LIMITED',
  // A setup change the domain's rules won't save (AC-01-80; ADR-424): `reason` is the rule's own
  // code and `message` its plain words. Nothing was saved.
  'NOT_SAVED',
  // What the database's own constraints refused, told plainly and never as an internal error
  // (AC-10-38; ADR-424): it already holds one; a record the request names isn't on record; a
  // value isn't one it takes. Nothing was saved.
  'ALREADY_HELD',
  'UNKNOWN_RECORD',
  'REFUSED_BY_THE_DATABASE',
  // Enrolling a phone (ADR-439). The master passcode wasn't taken: one code whatever the reason,
  // a wrong one, one that waits after wrong tries, or one locked by them (AC-10-22).
  'ENROLMENT_REFUSED',
  // The passcode was right, and what the phone sent as its key isn't a public key of the kind
  // a phone makes (ADR-437).
  'DEVICE_KEY_REFUSED',
  // A phone that hasn't proved itself (ADR-440). One code whatever the reason: a proof that
  // isn't one (a challenge the server didn't make for that phone, one run out or already
  // answered, a signature the phone's key didn't make, a phone nobody enrolled, a key that is
  // revoked), or a call with no token of a proof, or one run out (AC-10-45, 46).
  'PHONE_NOT_PROVEN',
] as const;

export type ErrorCode = (typeof errorCodes)[number];

// `message`: only where a rule of the domain's has plain words for the person who typed
// something (why a password wasn't taken, why a setting wasn't saved), the API has plain words
// for what the database refused, or a request's schema refused a field (`BAD_REQUEST`: which
// field and how, in the contracts' own words, ADR-431); never anything from inside the server,
// and never anything the caller sent.
// `reason`: only with `NOT_SAVED`, the domain's own code for the rule that refused.
// `retryAfterSeconds`: only with `LIMITED`, the whole seconds until the caller may ask again, as
// the answer's `Retry-After` header says too (RFC 9110 §10.2.3).
export const errorAnswerSchema = z.strictObject({
  code: z.enum(errorCodes),
  requestId: z.string().min(1),
  message: z.string().min(1).optional(),
  reason: z.string().min(1).max(64).optional(),
  retryAfterSeconds: z.number().int().min(1).optional(),
});

export type ErrorAnswer = z.infer<typeof errorAnswerSchema>;

// A reset by email was asked for (ADR-404). The answer is the same whether or not anybody has
// that address: it never says who has a login.
export const resetAskedAnswerSchema = z.strictObject({ status: z.literal('accepted') });

export type ResetAskedAnswer = z.infer<typeof resetAskedAnswerSchema>;

// The new password is kept.
export const passwordSetAnswerSchema = z.strictObject({ status: z.literal('ok') });

export type PasswordSetAnswer = z.infer<typeof passwordSetAnswerSchema>;

// Who is signed in (ADR-408): the person, whether they must first set a password of their own
// (ADR-410), where they stand with two-step sign-in (ADR-412), and the session's CSRF value. Never a token: those are cookies only (AC-10-09).
export const sessionAnswerSchema = z.strictObject({
  user: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    role: z.enum(['ADMIN', 'MANAGER_ANALYST', 'READ_ONLY_VIEWER']),
  }),
  passwordChangeRequired: z.boolean(),
  // Whether the person has an authenticator, and whether they must set one up before anything
  // else (an admin or a manager/analyst with none; ADR-412).
  twoStepSetUp: z.boolean(),
  twoStepSetupRequired: z.boolean(),
  csrf: z.string().min(1),
});

export type SessionAnswer = z.infer<typeof sessionAnswerSchema>;

export const csrfAnswerSchema = z.strictObject({ csrf: z.string().min(1) });

export type CsrfAnswer = z.infer<typeof csrfAnswerSchema>;

export const signedOutAnswerSchema = z.strictObject({ status: z.literal('signed-out') });

export type SignedOutAnswer = z.infer<typeof signedOutAnswerSchema>;

// A setup of two-step sign-in, begun (ADR-412): the secret for the person's authenticator app,
// as the text to type and as the address a QR code holds, and what the server asks back with the
// first code. The server keeps nothing until that code proves the app has the secret. It is
// shown to its owner once, here, and is in no other answer.
export const twoStepSetupAnswerSchema = z.strictObject({
  secret: z.string().min(1),
  uri: z.string().min(1),
  setup: z.string().min(1),
  expiresAt: z.iso.datetime(),
});

export type TwoStepSetupAnswer = z.infer<typeof twoStepSetupAnswerSchema>;

export const twoStepClearedAnswerSchema = z.strictObject({ status: z.literal('cleared') });

export type TwoStepClearedAnswer = z.infer<typeof twoStepClearedAnswerSchema>;

// A person, as an admin or a manager/analyst reads them (ARCHITECTURE §7.0; AC-02-08, 72;
// ADR-169, 415): never a secret of sign-in. `phone` is left out where the reader may not read it:
// a monitor's phone number is an admin's alone to see. `permissions` are the ones held now;
// `projectIds`, a read-only viewer's projects now.
export const personAnswerSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  role: z.enum(['ADMIN', 'MANAGER_ANALYST', 'MONITOR', 'READ_ONLY_VIEWER']),
  viewerKind: z.enum(['CLIENT', 'CONTRACTOR', 'AUDITOR']).nullable(),
  contractorId: z.uuid().nullable(),
  seesPrivateCitizens: z.boolean().nullable(),
  monitorId: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable().optional(),
  archived: z.boolean(),
  permissions: z.array(z.enum(permissions)),
  projectIds: z.array(z.uuid()),
});

export type PersonAnswer = z.infer<typeof personAnswerSchema>;

// A page of the firm's people, in the order they were added (ADR-427). `next` is what to send
// as `after` for the page that follows; null when this is the last.
export const peopleAnswerSchema = z.strictObject({
  people: z.array(personAnswerSchema),
  next: z.uuid().nullable(),
});

export type PeopleAnswer = z.infer<typeof peopleAnswerSchema>;

// An admin ended a person's sessions: how many were open.
export const sessionsEndedAnswerSchema = z.strictObject({
  status: z.literal('ended'),
  sessions: z.number().int().min(0),
});

export type SessionsEndedAnswer = z.infer<typeof sessionsEndedAnswerSchema>;

// One of the firm's phones as the back office reads it (ARCHITECTURE §7.4; AC-02-15, 59; ADR-134,
// 240, 428): its name on the dispatch board, whether it is in service and, if not, from when;
// when its key was revoked, once it was wiped; and which version of the master passcode's check
// it holds, with whether that is the current one (a change reaches a phone at its next sync).
// Never its key.
export const phoneRecordSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(['ACTIVE', 'LOST', 'RETIRED']),
  enrolledAt: z.iso.datetime(),
  outOfServiceAt: z.iso.datetime().nullable(),
  keyRevokedAt: z.iso.datetime().nullable(),
  masterPasscodeVersion: z.number().int().min(1),
  holdsCurrentPasscode: z.boolean(),
});

export type PhoneRecord = z.infer<typeof phoneRecordSchema>;

// A page of the firm's phones, in the order they were enrolled. `next` is what to send as
// `after` for the page that follows; null when this is the last.
export const phonesAnswerSchema = z.strictObject({
  phones: z.array(phoneRecordSchema),
  next: z.uuid().nullable(),
});

export type PhonesAnswer = z.infer<typeof phonesAnswerSchema>;

// A project as a read-only viewer reads it (ARCHITECTURE §5.5; AC-02-74; ADR-169, 315, 434): its
// name, its time zone, and when it was closed if it was. What every viewer given the project may
// read of it, a contractor user included; never a setting, a rate or a rule.
export const viewerProjectSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  timeZone: z.string(),
  closedAt: z.iso.datetime().nullable(),
});

export type ViewerProject = z.infer<typeof viewerProjectSchema>;

// A page of the projects a viewer is given, in the order they were entered. `next` is what to
// send as `after` for the page that follows; null when this is the last.
export const viewerProjectsAnswerSchema = z.strictObject({
  projects: z.array(viewerProjectSchema),
  next: z.uuid().nullable(),
});

export type ViewerProjectsAnswer = z.infer<typeof viewerProjectsAnswerSchema>;

// A ticket as a read-only viewer reads it (ARCHITECTURE §5.5; AC-02-74, 78…80; AC-10-29, 30;
// ADR-169, 236, 361, 435). **Every part is what the database shows that viewer and no more**: a
// contractor user reads its own contractor's tickets and nobody's name who recorded them, a
// sub's no rate and no amount; a name the viewer isn't shown is `null`, never somebody else's.
// A number the database keeps exactly is exact decimal text, never a float.
const exact = z.string().regex(/^-?[0-9]+(\.[0-9]+)?$/);
// A ticket's status is its field events': the worker's three, or VOID (ADR-060).
export const ticketStatuses = [...workerStatuses, 'VOID'] as const;
const payItemNamed = z.strictObject({ code: z.string(), description: z.string() });

// One row of a project's tickets: a ticket is its workflow, its bare number and the field
// events under it (there is no ticket record, ADR-236). `statuses` is what its field events
// hold now: one, but for a ticket whose late field event the worker hasn't yet taken up.
export const viewerTicketRowSchema = z.strictObject({
  workflow: z.enum(workflows),
  ticketNumber: z.string(),
  statuses: z.array(z.enum(ticketStatuses)),
  fieldEvents: z.int().min(1),
});

export type ViewerTicketRow = z.infer<typeof viewerTicketRowSchema>;

// A page of one workflow's tickets on a project, by number as text. `next` is what to send as
// `after` for the page that follows; null when this is the last.
export const viewerTicketsAnswerSchema = z.strictObject({
  tickets: z.array(viewerTicketRowSchema),
  next: z.string().nullable(),
});

export type ViewerTicketsAnswer = z.infer<typeof viewerTicketsAnswerSchema>;

// A field event of the ticket, as recorded and corrected: what one monitor witnessed. Its
// debris type, its site and a unit rate event's pay item by name; `recordedBy` for a client
// user and an auditor only (ADR-324).
export const viewerFieldEventSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(fieldEventKinds),
  splitSuffix: z.string(),
  status: z.enum(ticketStatuses),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  latitude: exact.nullable(),
  longitude: exact.nullable(),
  address: z.string().nullable(),
  certNumber: z.string(),
  loadCall: z.int().nullable(),
  estimateCy: exact.nullable(),
  unitCount: exact.nullable(),
  debrisType: z.string().nullable(),
  site: z.string().nullable(),
  payItem: payItemNamed.nullable(),
  recordedBy: z.strictObject({ name: z.string(), monitorNumber: z.string().nullable() }).nullable(),
});

export type ViewerFieldEvent = z.infer<typeof viewerFieldEventSchema>;

// What the worker concluded for a load or a haul-out, with a row for each collection: one on an
// ordinary ticket, one for each property or pile on a split. `pileLoadCall` is a haul-out's.
export const viewerCompletedSchema = z.strictObject({
  id: z.uuid(),
  quantitySource: z.enum(quantitySources),
  capacityCy: z.int().nullable(),
  loadCall: z.int().nullable(),
  volumeCy: exact.nullable(),
  weightTons: exact.nullable(),
  weightIsShare: z.boolean(),
  carriedCount: z.int().nullable(),
  collections: z.array(
    z.strictObject({
      id: z.uuid(),
      collectionEventId: z.uuid(),
      splitSuffix: z.string(),
      shareFraction: exact,
      pileLoadCall: z.int().nullable(),
      volumeCy: exact.nullable(),
      weightTons: exact.nullable(),
      mileage: exact.nullable(),
      mileageSource: z.enum(mileageSources).nullable(),
    }),
  ),
});

export type ViewerCompleted = z.infer<typeof viewerCompletedSchema>;

// A priced line of the ticket. `rate` and `amount` are null for a viewer the database shows no
// money on the line: a sub's contractor user (ADR-361).
export const viewerLineSchema = z.strictObject({
  id: z.uuid(),
  // The property or the pile it prices on a split; empty otherwise.
  splitSuffix: z.string(),
  slot: z.int(),
  payItem: payItemNamed.nullable(),
  unit: z.enum(billingUnits),
  quantity: exact,
  prime: z.string().nullable(),
  operatingSub: z.string().nullable(),
  rate: exact.nullable(),
  amount: exact.nullable(),
});

export type ViewerLine = z.infer<typeof viewerLineSchema>;

// One ticket, whole: its field events in the order of their field time, the completed record
// if the worker has written one (never on a unit rate ticket), and its lines.
export const viewerTicketAnswerSchema = z.strictObject({
  workflow: z.enum(workflows),
  ticketNumber: z.string(),
  statuses: z.array(z.enum(ticketStatuses)),
  fieldEvents: z.array(viewerFieldEventSchema).min(1),
  completed: viewerCompletedSchema.nullable(),
  lines: z.array(viewerLineSchema),
});

export type ViewerTicketAnswer = z.infer<typeof viewerTicketAnswerSchema>;

// An ROE as a client user or an auditor reads it (a contractor user reads none, ADR-315): its
// number, whether and when it was signed, and its owner's name only for a viewer the firm lets
// see private citizens by name (ADR-336); `null` otherwise, and where none was recorded.
export const viewerRoeSchema = z.strictObject({
  id: z.uuid(),
  roeNumber: z.string(),
  signed: z.boolean(),
  signedDate: z.iso.date().nullable(),
  ownerName: z.string().nullable(),
});

export type ViewerRoe = z.infer<typeof viewerRoeSchema>;

// A page of a project's ROEs, in the order they were made.
export const viewerRoesAnswerSchema = z.strictObject({
  roes: z.array(viewerRoeSchema),
  next: z.uuid().nullable(),
});

export type ViewerRoesAnswer = z.infer<typeof viewerRoesAnswerSchema>;

// One person's work for a day, as the dispatch board reads it (ARCHITECTURE §7; AC-02-24…32;
// ADR-240, 286, 308, 429): who, which day (the project's own), which project, their work (the
// kinds of field event, certifying, the forms that are no ticket's, the unit rate pay items named
// now), one site where the work is at one, the phone where one is named; whether it was planned
// on the board, and by whom, or made on a phone under the master passcode (unplanned, no
// author); and when it was withdrawn, if it was. A pay item says its code and description, never
// a rate.
const named = z.strictObject({ id: z.uuid(), name: z.string() });

export const assignmentRecordSchema = z.strictObject({
  id: z.uuid(),
  projectId: z.uuid(),
  person: z.strictObject({ id: z.uuid(), name: z.string(), monitorId: z.string().nullable() }),
  workDate: z.iso.date(),
  fieldEventKinds: z.array(z.enum(fieldEventKinds)),
  certifying: z.boolean(),
  formDocumentTypes: z.array(z.enum(assignmentFormDocumentTypes)),
  site: named.nullable(),
  phone: named.nullable(),
  payItems: z.array(z.strictObject({ id: z.uuid(), code: z.string(), description: z.string() })),
  origin: z.enum(['PLANNED', 'UNPLANNED']),
  madeBy: named.nullable(),
  withdrawnAt: z.iso.datetime().nullable(),
});

export type AssignmentRecord = z.infer<typeof assignmentRecordSchema>;

// A page of one project's board for one day, in the order the assignments were written. `next`
// is what to send as `after` for the page that follows; null when this is the last.
export const assignmentsAnswerSchema = z.strictObject({
  assignments: z.array(assignmentRecordSchema),
  next: z.uuid().nullable(),
});

export type AssignmentsAnswer = z.infer<typeof assignmentsAnswerSchema>;

// The master passcode was changed: the version now current. Never the passcode or its hash.
export const masterPasscodeAnswerSchema = z.strictObject({
  status: z.literal('ok'),
  version: z.number().int().min(1),
});

export type MasterPasscodeAnswer = z.infer<typeof masterPasscodeAnswerSchema>;

// A phone was enrolled (AC-02-15, 18; ADR-439): the id the server knows it by from now on, and
// the version of the master passcode it was enrolled under. Never a key, the passcode or its
// hash.
export const phoneEnrolledAnswerSchema = z.strictObject({
  deviceId: z.uuid(),
  masterPasscodeVersion: z.number().int().min(1),
});

export type PhoneEnrolledAnswer = z.infer<typeof phoneEnrolledAnswerSchema>;

// A challenge for a phone to sign (AC-05-03, AC-10-45; ADR-437, 440): the text exactly as the
// phone signs it after the domain's label, and how long it may still be sent back.
export const phoneChallengeAnswerSchema = z.strictObject({
  challenge: z.string().min(1),
  expiresInSeconds: z.number().int().min(1),
});

export type PhoneChallengeAnswer = z.infer<typeof phoneChallengeAnswerSchema>;

// A phone proved itself (ADR-440): the token its sync's calls carry, as `Authorization: Bearer`,
// and how long it is good for. It names the phone and nothing else.
export const phoneProvenAnswerSchema = z.strictObject({
  token: z.string().min(1),
  expiresInSeconds: z.number().int().min(1),
});

export type PhoneProvenAnswer = z.infer<typeof phoneProvenAnswerSchema>;

// The phone a token is of, as the server has it now: what the dispatch board calls it, whether
// it is in service, and the version of the master passcode in force beside the one whose check
// the phone holds. Never a key.
export const provenPhoneAnswerSchema = z.strictObject({
  deviceId: z.uuid(),
  name: z.string(),
  status: z.enum(['ACTIVE', 'LOST', 'RETIRED']),
  outOfServiceAt: z.iso.datetime().nullable(),
  masterPasscodeVersion: z.number().int().min(1),
  masterPasscodeVersionInForce: z.number().int().min(1),
});

export type ProvenPhoneAnswer = z.infer<typeof provenPhoneAnswerSchema>;
