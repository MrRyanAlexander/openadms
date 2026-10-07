// The Zod schemas for every API and sync payload; depends on `domain` only (ARCHITECTURE §18).
// The wiring probe (BACKLOG 0.2.2) proves Zod runs and `domain` resolves.
import { workspace as domainWorkspace } from '@open-adms/domain';
import { z } from 'zod';

export {
  csrfAnswerSchema,
  errorAnswerSchema,
  errorCodes,
  healthAnswerSchema,
  passwordSetAnswerSchema,
  personAnswerSchema,
  resetAskedAnswerSchema,
  sessionAnswerSchema,
  sessionsEndedAnswerSchema,
  signedOutAnswerSchema,
  twoStepClearedAnswerSchema,
  twoStepSetupAnswerSchema,
  type CsrfAnswer,
  type ErrorAnswer,
  type ErrorCode,
  type HealthAnswer,
  type PasswordSetAnswer,
  type PersonAnswer,
  type ResetAskedAnswer,
  type SessionAnswer,
  type SessionsEndedAnswer,
  type SignedOutAnswer,
  type TwoStepClearedAnswer,
  type TwoStepSetupAnswer,
} from './api-answers.ts';
export {
  adminOnly,
  archivePersonEndpoint,
  backOfficeRoles,
  beginTwoStepSetupEndpoint,
  changePasswordEndpoint,
  clearTwoStepEndpoint,
  completePasswordResetEndpoint,
  confirmTwoStepSetupEndpoint,
  createPersonEndpoint,
  csrfHeader,
  currentSessionEndpoint,
  endPersonSessionsEndpoint,
  endpoint,
  endpointAccess,
  endpointMethods,
  endpoints,
  healthEndpoint,
  readPersonEndpoint,
  refreshSessionEndpoint,
  requestPasswordResetEndpoint,
  sessionCsrfEndpoint,
  setPermissionsEndpoint,
  setPersonPasswordEndpoint,
  setViewerProjectsEndpoint,
  signedInRoles,
  signInEndpoint,
  signOutEndpoint,
  taken,
  type Endpoint,
  type EndpointAccess,
  type EndpointMethod,
  type Sent,
  type SignedInRole,
} from './endpoints.ts';
export { fieldEventDetailsSchema, type FieldEventDetailsPayload } from './field-event-details.ts';
export { formAnswersSchema, type FormAnswers } from './form-answers.ts';
export {
  formDefinitionFields,
  formFieldTypes,
  type FormDefinitionFields,
  type FormField,
} from './form-definition.ts';
export { openApiDocument } from './openapi.ts';

export const workspace = 'contracts';

export const wiringProbe = z.object({
  workspace: z.literal(workspace),
  dependsOn: z.literal(domainWorkspace),
});

export type WiringProbe = z.infer<typeof wiringProbe>;
