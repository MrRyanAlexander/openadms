// The Zod schemas for every API and sync payload; depends on `domain` only (ARCHITECTURE §18).
// Only a wiring probe so far (BACKLOG 0.2.2): it proves Zod runs and `domain` resolves.
import { workspace as domainWorkspace } from '@open-adms/domain';
import { z } from 'zod';

export { fieldEventDetailsSchema, type FieldEventDetailsPayload } from './field-event-details.ts';
export {
  formDefinitionFields,
  formFieldTypes,
  type FormDefinitionFields,
  type FormField,
} from './form-definition.ts';

export const workspace = 'contracts';

export const wiringProbe = z.object({
  workspace: z.literal(workspace),
  dependsOn: z.literal(domainWorkspace),
});

export type WiringProbe = z.infer<typeof wiringProbe>;
