// What the API says about itself and about a refusal (ARCHITECTURE §6, Output; ADR-385).
// Every answer's shape lives here, never in a controller.
import { passwordProblemCodes } from '@open-adms/domain';
import { z } from 'zod';

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
  // Signed in, and not somebody who may do this.
  'NOT_ALLOWED',
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export const errorAnswerSchema = z.strictObject({
  code: z.enum(errorCodes),
  requestId: z.string().min(1),
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
