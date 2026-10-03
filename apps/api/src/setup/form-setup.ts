// Setup step 5 (spec/parts/01-setup.md; ADR-160, 211, 214, 308): a project's form for each
// document type it uses; the debris types added to its load and haul-out forms, named as the
// contract names the work; the firm's own fields on an ROE, survey, incident or drop-off log form,
// each change a new version. Setup warns, never refuses, when a debris type not marked Reduced is
// added to the haul-out form (packages/domain's DebrisTypeEntries).
import { formDefinitionFields } from '@open-adms/contracts';
import type { Form, FormDebrisType, FormDefinition, FormDocumentType, Prisma } from '@open-adms/db';
import { DebrisTypeEntries } from '@open-adms/domain';

import { type Outcome, SetupService } from './setup-service.ts';

export interface NewForm {
  readonly projectId: string;
  readonly documentType: FormDocumentType;
  readonly name: string;
  // Read on a form that isn't a workflow's: incidents and drop-off logs are switched on per project.
  readonly enabled: boolean;
  // "GPS required": stated on the ROE form, and only there.
  readonly gpsRequired?: boolean;
}

export interface NewFormDebrisType {
  readonly formId: string;
  // From the firm's library.
  readonly debrisTypeId: string;
  readonly reduced: boolean;
  readonly reductionMethodId?: string;
  readonly hiddenOnPhones: boolean;
}

export class FormSetup extends SetupService {
  form(person: string, input: NewForm): Promise<Outcome<Form>> {
    return this.write(person, (tx) =>
      tx.form.create({
        data: {
          projectId: input.projectId,
          documentType: input.documentType,
          name: input.name,
          enabled: input.enabled,
          gpsRequired: input.gpsRequired ?? null,
        },
      }),
    );
  }

  debrisType(person: string, input: NewFormDebrisType): Promise<Outcome<FormDebrisType>> {
    return this.write(person, async (tx, warn) => {
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

  // The firm's own fields on a form, as its next version; a version is never edited (ADR-308).
  // Their shape is packages/contracts' formDefinitionFields.
  ownFields(person: string, formId: string, fields: unknown): Promise<Outcome<FormDefinition>> {
    return this.write(person, async (tx) => {
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
