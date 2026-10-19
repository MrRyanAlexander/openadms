// What an assignment lets the monitor start (ARCHITECTURE §7.1; adms-field-app §4A.6; BACKLOG
// 3.2.3; ADR-240, 574; AC-11-18): the kinds of field event it names, then certifying, then the
// forms that are no ticket's, each as home names its button. Nothing else is offered, and no
// screen asks for the site: it is the assignment's.
import type { PhoneAssignmentAnswer } from '@open-adms/contracts';

import type { Words } from '../words.ts';

export type Work = keyof Words['home']['start'];

const kindsOfWork = {
  COLLECTION: 'collection',
  DISPOSAL: 'disposal',
  HAUL_OUT_COLLECTION: 'haulOutCollection',
  HAUL_OUT_DISPOSAL: 'haulOutDisposal',
  UNIT_RATE: 'unitRate',
} as const satisfies Readonly<Record<PhoneAssignmentAnswer['fieldEventKinds'][number], Work>>;
const formsOfWork = {
  INCIDENT: 'incident',
  DROP_OFF_LOG: 'dropOff',
  SURVEY: 'survey',
  ROE: 'roe',
} as const satisfies Readonly<Record<PhoneAssignmentAnswer['formDocumentTypes'][number], Work>>;

export function worksOf(assignment: PhoneAssignmentAnswer): Work[] {
  return [
    ...assignment.fieldEventKinds.map((kind) => kindsOfWork[kind]),
    ...(assignment.certifying ? (['certification'] as const) : []),
    ...assignment.formDocumentTypes.map((form) => formsOfWork[form]),
  ];
}
