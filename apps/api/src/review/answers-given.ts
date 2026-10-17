// The answers to the firm's own fields on an ROE, a survey, an incident or a drop-off log, given
// by a person at the back office (spec/DATA-MODEL.md §4.3; AC-04-87; ADR-278, 327, 432, 534 (4),
// (9)): the answers whole, against a version of that kind of form's fields on the record's own
// project, the record's own unless another is named. The person is there to be told, so answers
// that don't fit are refused in plain words, never kept as sent as a phone's are. With no version
// there is nothing to answer.
import { formAnswersSchema, formDefinitionFields } from '@open-adms/contracts';
import type { FormDocumentType, Prisma } from '@open-adms/db';
import { FormAnswersGiven } from '@open-adms/domain';

import { Refused } from '../setup/setup-service.ts';
import type { Tx } from './review-service.ts';

export interface AnswersGiven {
  readonly answers: Readonly<Record<string, string | number | boolean>>;
  // The version answered; left out, the one the record answers already.
  readonly formDefinitionId?: string | undefined;
}

export interface AnswersKept {
  readonly answers: Prisma.InputJsonObject;
  readonly formDefinitionId: string | null;
  readonly formId: string | null;
  readonly formDocumentType: FormDocumentType | null;
}

const recordInWords: Record<'ROE' | 'SURVEY' | 'INCIDENT' | 'DROP_OFF_LOG', string> = {
  ROE: 'ROE',
  SURVEY: 'survey',
  INCIDENT: 'incident',
  DROP_OFF_LOG: 'drop-off log',
};

export async function answersKept(
  tx: Tx,
  record: {
    readonly projectId: string;
    readonly kind: 'ROE' | 'SURVEY' | 'INCIDENT' | 'DROP_OFF_LOG';
    readonly formDefinitionId: string | null;
  },
  given: AnswersGiven,
): Promise<AnswersKept> {
  const answers = { ...given.answers } as Prisma.InputJsonObject;
  const versionId = given.formDefinitionId ?? record.formDefinitionId;
  if (versionId === null) {
    if (Object.keys(answers).length > 0) throw new Refused(FormAnswersGiven.noFields());
    return { answers, formDefinitionId: null, formId: null, formDocumentType: null };
  }
  const version = await tx.formDefinition.findUnique({
    where: { id: versionId },
    include: { form: { select: { projectId: true } } },
  });
  if (version?.documentType !== record.kind || version.form.projectId !== record.projectId) {
    throw new Refused(FormAnswersGiven.notThisForm(recordInWords[record.kind]));
  }
  const fields = formDefinitionFields.parse(version.fields);
  const fit = formAnswersSchema(fields).safeParse(answers);
  if (!fit.success) {
    const named = new Set<string>();
    for (const issue of fit.error.issues) {
      const [first] = issue.path;
      if (typeof first === 'string') named.add(first);
      if (issue.code === 'unrecognized_keys') for (const key of issue.keys) named.add(key);
    }
    const labels = fields.filter((field) => named.has(field.id)).map((field) => field.label);
    const unknown = [...named].filter((key) => !fields.some((field) => field.id === key));
    throw new Refused(FormAnswersGiven.notFitting(version.version, [...labels, ...unknown]));
  }
  return {
    answers,
    formDefinitionId: version.id,
    formId: version.formId,
    formDocumentType: version.documentType,
  };
}
