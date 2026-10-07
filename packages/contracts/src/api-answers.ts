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
