// What the API says about itself and about a refusal (ARCHITECTURE §6, Output; ADR-385).
// Every answer's shape lives here, never in a controller.
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
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export const errorAnswerSchema = z.strictObject({
  code: z.enum(errorCodes),
  requestId: z.string().min(1),
});

export type ErrorAnswer = z.infer<typeof errorAnswerSchema>;
