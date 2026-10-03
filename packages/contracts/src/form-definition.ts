// The firm's own fields on an ROE, survey, incident or drop-off log form: one version of a form's
// definition, as its `fields` hold it (spec/DATA-MODEL.md §3 "FormDefinition"; ADR-160, 278, 308;
// C36). The answers' schema, made from a definition, is BACKLOG 1.3.6's.
import { z } from 'zod';

// What a field takes: text, a number, yes or no, one of its choices, a photo (ADR-160).
export const formFieldTypes = ['TEXT', 'NUMBER', 'YES_NO', 'PICK', 'PHOTO'] as const;

const formField = z
  .strictObject({
    // Stable from version to version: the answers are keyed by it.
    id: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(formFieldTypes),
    required: z.boolean(),
    // A pick's choices, and only a pick's.
    choices: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine((field) => (field.type === 'PICK') === (field.choices !== undefined), {
    message: 'A pick field lists its choices; no other field has any',
    path: ['choices'],
  });

// A version's fields, in the order shown: each id once.
export const formDefinitionFields = z.array(formField).superRefine((fields, context) => {
  const seen = new Set<string>();
  for (const [index, field] of fields.entries()) {
    if (seen.has(field.id)) {
      context.addIssue({
        code: 'custom',
        message: `Field id ${field.id} is used twice`,
        path: [index, 'id'],
      });
    }
    seen.add(field.id);
  }
});

export type FormField = z.infer<typeof formField>;
export type FormDefinitionFields = z.infer<typeof formDefinitionFields>;
