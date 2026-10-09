// The answers to the firm's own fields on an ROE, a survey, an incident or a drop-off log, as the
// record's `answers` hold them: keyed by field id, against the version of the definition that was
// answered (spec/DATA-MODEL.md §4.3; spec/acceptance/04-field-capture.md AC-04-87; ADR-160, 278,
// 327; C36). The schema is made from that version's fields, so a later version changes nothing
// about a record already made. The database holds only that the answers are an object and which
// definition they answered; nothing the engine, a rule or a flag reads is ever here.
import { z } from 'zod';

import type { FormDefinitionFields, FormField } from './form-definition.ts';

// What one field takes: text that isn't blank, a number, yes or no, one of its choices, or the id
// its phone gave the photograph (the photograph's own record belongs to the form).
function answerTo(field: FormField): z.ZodType {
  switch (field.type) {
    case 'TEXT':
      return z.string().min(1);
    case 'NUMBER':
      return z.number();
    case 'YES_NO':
      return z.boolean();
    case 'PICK':
      return z.enum(field.choices ?? []);
    case 'PHOTO':
      return z.uuid();
  }
}

// The schema of one version's answers: every required field answered, each answer of its field's
// type, and no answer to a field the version doesn't have.
export function formAnswersSchema(
  fields: FormDefinitionFields,
): z.ZodType<Record<string, unknown>> {
  return z.strictObject(
    Object.fromEntries(
      fields.map((field) => [
        field.id,
        field.required ? answerTo(field) : answerTo(field).optional(),
      ]),
    ),
  );
}

export type FormAnswers = Record<string, string | number | boolean>;
