// Setup step 5 (spec/parts/01-setup.md; ADR-160, 211, 214, 308): a project's form for each
// document type it uses; the debris types added to its load and haul-out forms, named as the
// contract names the work; the firm's own fields on an ROE, survey, incident or drop-off log form,
// each change a new version. Setup warns, never refuses, when a debris type not marked Reduced is
// added to the haul-out form (packages/domain's DebrisTypeEntries).
import { formDefinitionFields } from '@open-adms/contracts';
import type { Form, FormDebrisType, FormDefinition, FormDocumentType, Prisma } from '@open-adms/db';
import { DebrisTypeEntries, type IncidentOffer, IncidentOffers } from '@open-adms/domain';

import { type Outcome, QueueingService } from './setup-service.ts';

export interface NewForm {
  readonly projectId: string;
  readonly documentType: FormDocumentType;
  readonly name: string;
  // "GPS required": stated on the ROE form, and only there.
  readonly gpsRequired?: boolean;
  // What an incident offers the project's monitors: stated on the incident form, and only there
  // (an empty list for none). A new one starts from the domain's IncidentOffers.startingFor.
  readonly incidentOffers?: readonly IncidentOffer[];
}

export interface NewFormDebrisType {
  readonly formId: string;
  // From the firm's library.
  readonly debrisTypeId: string;
  readonly reduced: boolean;
  readonly reductionMethodId?: string;
  readonly hiddenOnPhones: boolean;
}

// What a form says, changed (ADR-527 (4)): "GPS required" on the ROE form and what an incident
// offers on the incident form, as the database holds them.
export type FormChanges = Partial<Pick<NewForm, 'name' | 'gpsRequired' | 'incidentOffers'>>;

// A debris type's entry changed: its reduction method cleared with null.
export interface FormDebrisTypeChanges {
  readonly reduced?: boolean;
  readonly reductionMethodId?: string | null;
  readonly hiddenOnPhones?: boolean;
}

// A debris type's entry changed moves its form's rules (Reduced is what a rule may read): the
// tickets of the form's workflow are queued in the same piece of work (ADR-420). An entry is
// never archived at the API: "hidden on phones" takes it off their list (ADR-529 (g)).
export class FormSetup extends QueueingService {
  form(person: string, input: NewForm): Promise<Outcome<Form>> {
    return this.setup(person, (tx) =>
      tx.form.create({
        data: {
          projectId: input.projectId,
          documentType: input.documentType,
          name: input.name,
          gpsRequired: input.gpsRequired ?? null,
          // Left unsaid on an incident form, the database refuses it; on any other there is none.
          ...(input.incidentOffers === undefined
            ? {}
            : { incidentOffers: new IncidentOffers(input.incidentOffers).list() }),
        },
      }),
    );
  }

  debrisType(person: string, input: NewFormDebrisType): Promise<Outcome<FormDebrisType>> {
    return this.setup(person, async (tx, warn) => {
      const form = await tx.form.findUniqueOrThrow({ where: { id: input.formId } });
      const debrisType = await tx.debrisType.findUniqueOrThrow({
        where: { id: input.debrisTypeId },
      });
      if (form.documentType === 'LOAD' || form.documentType === 'HAUL_OUT') {
        const entries = new DebrisTypeEntries(form.documentType, []);
        warn(entries.warningsFor({ name: debrisType.name, reduced: input.reduced }));
      }
      // Its form's document type, again: the database holds an entry to a load or haul-out form.
      return tx.formDebrisType.create({
        data: {
          formId: form.id,
          documentType: form.documentType,
          debrisTypeId: debrisType.id,
          reduced: input.reduced,
          reductionMethodId: input.reductionMethodId ?? null,
          hiddenOnPhones: input.hiddenOnPhones,
        },
      });
    });
  }

  // A form's name, "GPS required" or what an incident offers, audited with the value
  // before (AC-01-83). The worker reads none of them, so nothing is queued.
  change(person: string, formId: string, changes: FormChanges): Promise<Outcome<Form>> {
    return this.setup(person, (tx) =>
      tx.form.update({
        where: { id: formId },
        data: {
          ...(changes.name === undefined ? {} : { name: changes.name }),
          ...(changes.gpsRequired === undefined ? {} : { gpsRequired: changes.gpsRequired }),
          ...(changes.incidentOffers === undefined
            ? {}
            : { incidentOffers: new IncidentOffers(changes.incidentOffers).list() }),
        },
      }),
    );
  }

  // A debris type's entry: Reduced, its reduction method, whether phones hide it. One not Reduced
  // on a haul-out form is warned of, as when it was added. Reduced is what a rule's criteria may
  // read, so the form's tickets are queued.
  changeDebrisType(
    person: string,
    formDebrisTypeId: string,
    changes: FormDebrisTypeChanges,
  ): Promise<Outcome<FormDebrisType>> {
    return this.setup(person, async (tx, warn) => {
      const entry = await tx.formDebrisType.findUniqueOrThrow({
        where: { id: formDebrisTypeId },
        include: { debrisType: true, form: true },
      });
      const reduced = changes.reduced ?? entry.reduced;
      if (entry.documentType === 'LOAD' || entry.documentType === 'HAUL_OUT') {
        warn(
          new DebrisTypeEntries(entry.documentType, []).warningsFor({
            name: entry.debrisType.name,
            reduced,
          }),
        );
      }
      const changed = await tx.formDebrisType.update({
        where: { id: formDebrisTypeId },
        data: changes,
      });
      await this.entryMoved(tx, person, entry.form);
      return changed;
    });
  }

  // The tickets of a load or haul-out form's workflow: its rules pick the entry.
  private async entryMoved(
    tx: Prisma.TransactionClient,
    person: string,
    form: Pick<Form, 'projectId' | 'documentType'>,
  ): Promise<void> {
    if (form.documentType !== 'LOAD' && form.documentType !== 'HAUL_OUT') return;
    await this.setupChanged(tx, person, form.projectId, { workflow: form.documentType });
  }

  // The firm's own fields on a form, as its next version; a version is never edited (ADR-308).
  // Their shape is packages/contracts' formDefinitionFields.
  ownFields(person: string, formId: string, fields: unknown): Promise<Outcome<FormDefinition>> {
    return this.setup(person, async (tx) => {
      const form = await tx.form.findUniqueOrThrow({ where: { id: formId } });
      const last = await tx.formDefinition.aggregate({
        where: { formId },
        _max: { version: true },
      });
      return tx.formDefinition.create({
        data: {
          formId: form.id,
          documentType: form.documentType,
          version: (last._max.version ?? 0) + 1,
          fields: formDefinitionFields.parse(fields) satisfies Prisma.InputJsonArray,
          createdById: person,
        },
      });
    });
  }
}
