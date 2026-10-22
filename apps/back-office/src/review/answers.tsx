// The firm's own fields on a form, answered (ADR-160, 278, 308; spec/DATA-MODEL.md §3
// "FormDefinition"): a record's answers are read and corrected by the version of the fields they
// answer; one entered here answers the newest. Text typed, a number typed, yes or no ticked, a
// pick's choice picked (invariant 6); a photograph field takes its photographs as the record's own,
// never as an answer. What fits a version is the server's to say.
import type { FormField, ReviewNamesAnswer } from '@open-adms/contracts';

import { checked, picked, text, type FieldSpec, type Values } from '../look/form-dialog.tsx';
import { words } from '../words.ts';

type Definition = ReviewNamesAnswer['formDefinitions'][number];
type Answer = string | number | boolean;

const keyOf = (field: FormField): string => `answer:${field.id}`;
const answered = (field: FormField): boolean => field.type !== 'PHOTO';

// The version a record's answers answer, or the newest of its form's where it answers none.
export function definitionFor(
  names: ReviewNamesAnswer,
  documentType: string,
  definitionId: string | null,
): Definition | null {
  return (
    names.formDefinitions.find((definition) => definition.id === definitionId) ??
    names.formDefinitions.find((definition) => definition.documentType === documentType) ??
    null
  );
}

export function answerFields(definition: Definition | null): readonly FieldSpec[] {
  const fields = (definition?.fields ?? []).filter(answered);
  if (fields.length === 0) return [];
  return [
    { kind: 'heading', key: 'answers', label: words.forms2.ownFields },
    ...fields.map((field): FieldSpec => {
      const shared = { key: keyOf(field), label: field.label, required: field.required };
      switch (field.type) {
        case 'NUMBER':
          return { kind: 'decimal', ...shared };
        case 'YES_NO':
          return { kind: 'check', key: shared.key, label: shared.label };
        case 'PICK':
          return {
            kind: 'pick',
            ...shared,
            options: (field.choices ?? []).map((choice) => ({ id: choice, label: choice })),
          };
        default:
          return { kind: 'text', ...shared, longest: 2000 };
      }
    }),
  ];
}

export function answerValues(
  definition: Definition | null,
  answers: Readonly<Record<string, Answer>>,
): Values {
  return Object.fromEntries(
    (definition?.fields ?? []).filter(answered).map((field) => {
      const answer = answers[field.id];
      return [
        keyOf(field),
        field.type === 'YES_NO' ? answer === true : answer === undefined ? '' : String(answer),
      ];
    }),
  );
}

// The answers as the API takes them, against their version: a field left empty is unanswered.
export function answersOf(
  definition: Definition | null,
  values: Values,
): { answers: Record<string, Answer>; formDefinitionId?: string } {
  if (definition === null) return { answers: {} };
  const answers: Record<string, Answer> = {};
  for (const field of definition.fields.filter(answered)) {
    const key = keyOf(field);
    if (field.type === 'YES_NO') answers[field.id] = checked(values, key);
    else if (field.type === 'PICK') {
      const choice = picked(values, key);
      if (choice !== null) answers[field.id] = choice;
    } else {
      const typed = text(values, key);
      if (typed !== '') answers[field.id] = field.type === 'NUMBER' ? Number(typed) : typed;
    }
  }
  return { answers, formDefinitionId: definition.id };
}
