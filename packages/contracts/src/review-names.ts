// The names a reviewer's screens read beside a ticket (spec/parts/08-review-and-corrections.md
// step 1; ADR-224, 539): a field event, a flag and a line name their records by id, and whoever is
// let see review reads them by name, never by id, and picks a correction's value by name
// (invariant 6). One read for the project: its people's names, its sites, the debris types of its
// forms, its pay items by code and description, its primes, contracts and rules, its zones, and
// the firm's lists a ticket names, and the firm's own fields on its forms. Archived ones are said so, since an old ticket still names
// them; a pick offers only those in service. Never a rate: that is the ledger's, and setup's.
import { z } from 'zod';

import { formDefinitionFields } from './form-definition.ts';

const id = z.uuid();
const named = { id, name: z.string(), archived: z.boolean() };

export const reviewNamesAnswerSchema = z.strictObject({
  // Every person a record of the project may name: its monitors by their Monitor ID too, and the
  // back office's people, by name alone.
  people: z.array(
    z.strictObject({
      id,
      name: z.string(),
      monitorNumber: z.string().nullable(),
      monitor: z.boolean(),
      archived: z.boolean(),
    }),
  ),
  sites: z.array(z.strictObject(named)),
  // A debris type as a form of the project offers it: the form's entry, by the debris type's
  // name, and which form.
  debrisTypes: z.array(
    z.strictObject({
      ...named,
      formName: z.string(),
      documentType: z.string(),
      reduced: z.boolean(),
    }),
  ),
  payItems: z.array(
    z.strictObject({ id, code: z.string(), description: z.string(), archived: z.boolean() }),
  ),
  contractors: z.array(z.strictObject(named)),
  contracts: z.array(z.strictObject(named)),
  rules: z.array(z.strictObject(named)),
  zones: z.array(z.strictObject({ id, name: z.string() })),
  payableTypes: z.array(z.strictObject(named)),
  kindsOfWork: z.array(z.strictObject(named)),
  itemNames: z.array(z.strictObject({ ...named, kindOfWorkId: id })),
  fieldTags: z.array(z.strictObject(named)),
  // Where each reason is offered: the database's closed set (a void, a typed number, a flag
  // accepted, a record made in the back office, a phone taken out of service).
  reasons: z.array(z.strictObject({ ...named, uses: z.array(z.string()) })),
  surveyWorkTypes: z.array(z.strictObject(named)),
  incidentTypes: z.array(z.strictObject(named)),
  incidentSubTypes: z.array(z.strictObject({ ...named, incidentTypeId: id })),
  // Every version of the firm's own fields on the project's ROE, survey, incident and drop-off
  // log forms, newest first: a record's answers are read by the version they answer, and one
  // entered or corrected here answers the newest.
  formDefinitions: z.array(
    z.strictObject({
      id,
      documentType: z.string(),
      version: z.int(),
      fields: formDefinitionFields,
    }),
  ),
});

export type ReviewNamesAnswer = z.infer<typeof reviewNamesAnswerSchema>;
