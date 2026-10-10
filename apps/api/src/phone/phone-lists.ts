// The lists a phone takes for its monitor's assignment (ARCHITECTURE §7.1's lists note, §9 (6);
// adms-field-app §4A.2a; AC-01-26, AC-02-37, AC-03-09, AC-07-91; BACKLOG 2.5.3, C68, C103, C115;
// ADR-207, 213, 223, 240, 449, 450).
//
// - **Read, never written**, as the API's login, for one assignment and the phone that holds it.
// - **Trimmed to the assignment:** the unit rate pay items it names now (one taken off the
//   assignment is left out), the item names of their kinds of work, and the incident and survey
//   lists only where the assignment makes those forms.
// - **Never a rate, a rule, a transaction or a load's pay item** (invariant 20): none is read
//   here, so none can be sent. A unit rate pay item carries its code, which the phone prints.
// - **Which assignment** is the sign-in's own rule, asked again at each read (`taken`), so a
//   phone that refreshes its lists learns of a board that changed.
// - Part 1 of task 2.5.3 (ADR-449): the project's certifications, sites, ROEs and control
//   ranges, a site's quantity lookup, the setup version, the login list and the master
//   passcode's check are the later parts'.
import type { Database } from '@open-adms/db';
import type { IncidentOffer, NoAssignmentReason, NumberSeriesName } from '@open-adms/domain';

import type { PhoneAssignment, PhoneAssignments } from './phone-assignments.ts';

interface Named {
  readonly id: string;
  readonly name: string;
}

export interface PhoneListsHeld {
  // The blocks of numbers this phone holds on the assignment's project.
  readonly blocks: readonly {
    readonly series: NumberSeriesName;
    readonly firstNumber: number;
    readonly lastNumber: number;
    readonly lastUsedNumber: number | null;
    readonly status: 'ISSUED';
  }[];
  // The entries on the project's load and haul-out forms, without those hidden on phones; each
  // id is the entry's.
  readonly debrisTypes: { readonly LOAD: readonly Named[]; readonly HAUL_OUT: readonly Named[] };
  readonly fieldTags: readonly Named[];
  readonly typedNumberReasons: readonly Named[];
  readonly payItems: readonly {
    readonly id: string;
    readonly code: string;
    readonly bandFrom: number | null;
    readonly bandTo: number | null;
    readonly archived: boolean;
    readonly payableType: Named;
    readonly kindOfWork: Named;
  }[];
  readonly itemNames: readonly (Named & { readonly kindOfWorkId: string })[];
  readonly incidentTypes: readonly (Named & { readonly subTypes: readonly Named[] })[];
  readonly incidentOffers: readonly IncidentOffer[];
  readonly contractors: readonly Named[];
  readonly surveyWorkTypes: readonly Named[];
}

export type PhoneListsTaken =
  | { readonly taken: true; readonly assignment: PhoneAssignment; readonly lists: PhoneListsHeld }
  | { readonly taken: false; readonly why: NoAssignmentReason };

const name = ({ id, name }: Named): Named => ({ id, name });

export class PhoneLists {
  private readonly db: Database;
  private readonly assignments: PhoneAssignments;
  private readonly clock: { now(): Date };

  constructor(db: Database, parts: { assignments: PhoneAssignments; clock: { now(): Date } }) {
    this.db = db;
    this.assignments = parts.assignments;
    this.clock = parts.clock;
  }

  // The assignment the phone takes for that monitor now, and its lists; or why it takes none.
  async taken(personId: string, deviceId: string): Promise<PhoneListsTaken> {
    const taken = await this.assignments.taken(personId, deviceId, this.clock.now());
    if (!taken.taken) return taken;
    return {
      taken: true,
      assignment: taken.assignment,
      lists: await this.held({ assignmentId: taken.assignment.id, deviceId }),
    };
  }

  // The lists of one assignment, for the phone that holds it.
  async held(phone: {
    readonly assignmentId: string;
    readonly deviceId: string;
  }): Promise<PhoneListsHeld> {
    return this.db.$read(async (tx) => {
      const assignment = await tx.assignment.findUniqueOrThrow({
        where: { id: phone.assignmentId },
      });
      const { projectId } = assignment;
      const makes = (documentType: 'INCIDENT' | 'SURVEY') =>
        assignment.formDocumentTypes.includes(documentType);
      const blocks = await tx.numberBlock.findMany({
        where: { deviceId: phone.deviceId, projectId, status: 'ISSUED' },
        orderBy: [{ issuedAt: 'asc' }, { firstNumber: 'asc' }],
      });
      const forms = await tx.form.findMany({
        where: { projectId, documentType: { in: ['LOAD', 'HAUL_OUT'] } },
      });
      const entries = await tx.formDebrisType.findMany({
        where: {
          formId: { in: forms.map((form) => form.id) },
          hiddenOnPhones: false,
          archivedAt: null,
        },
        include: { debrisType: true },
        orderBy: { createdAt: 'asc' },
      });
      const named = (documentType: 'LOAD' | 'HAUL_OUT') =>
        entries
          .filter((entry) => entry.documentType === documentType)
          .map((entry) => ({ id: entry.id, name: entry.debrisType.name }));
      const fieldTags = await tx.fieldTag.findMany({
        where: { projectId, archivedAt: null },
        orderBy: { position: 'asc' },
      });
      const reasons = await tx.reason.findMany({
        where: { uses: { has: 'TYPED_NUMBER' }, archivedAt: null },
        orderBy: { position: 'asc' },
      });
      // The unit rate pay items the assignment names now (C103).
      const assigned = await tx.assignmentPayItem.findMany({
        where: { assignmentId: assignment.id, archivedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      const payItems = await tx.payItem.findMany({
        where: { id: { in: assigned.map((one) => one.payItemId) } },
        select: {
          id: true,
          code: true,
          bandFrom: true,
          bandTo: true,
          archivedAt: true,
          payableType: { select: { id: true, name: true } },
          kindOfWork: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
      const itemNames = await tx.itemName.findMany({
        where: {
          kindOfWorkId: { in: [...new Set(assigned.map((one) => one.kindOfWorkId))] },
          archivedAt: null,
        },
        orderBy: { position: 'asc' },
      });
      const incidentTypes = makes('INCIDENT')
        ? await tx.incidentType.findMany({
            where: { archivedAt: null },
            include: { subTypes: { where: { archivedAt: null }, orderBy: { position: 'asc' } } },
            orderBy: { position: 'asc' },
          })
        : [];
      // What the project's incident form offers, and the contractors on the project to pick
      // "the contractor involved" from (ADR-328): only for a phone that makes incidents.
      const incidentForm = makes('INCIDENT')
        ? await tx.form.findFirst({ where: { projectId, documentType: 'INCIDENT' } })
        : null;
      const incidentOffers = (incidentForm?.incidentOffers ?? []) as IncidentOffer[];
      const placed = incidentOffers.includes('CONTRACTOR')
        ? await tx.projectContractor.findMany({
            where: { projectId, archivedAt: null },
            include: { contractor: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'asc' },
          })
        : [];
      const surveyWorkTypes = makes('SURVEY')
        ? await tx.surveyWorkType.findMany({
            where: { archivedAt: null },
            orderBy: { position: 'asc' },
          })
        : [];
      return {
        blocks: blocks.map(({ series, firstNumber, lastNumber, lastUsedNumber }) => ({
          series,
          firstNumber,
          lastNumber,
          lastUsedNumber,
          status: 'ISSUED' as const,
        })),
        debrisTypes: { LOAD: named('LOAD'), HAUL_OUT: named('HAUL_OUT') },
        fieldTags: fieldTags.map(name),
        typedNumberReasons: reasons.map(name),
        payItems: payItems.flatMap((payItem) =>
          payItem.kindOfWork === null
            ? []
            : [
                {
                  id: payItem.id,
                  code: payItem.code,
                  bandFrom: payItem.bandFrom?.toNumber() ?? null,
                  bandTo: payItem.bandTo?.toNumber() ?? null,
                  archived: payItem.archivedAt !== null,
                  payableType: name(payItem.payableType),
                  kindOfWork: name(payItem.kindOfWork),
                },
              ],
        ),
        itemNames: itemNames.map((item) => ({ ...name(item), kindOfWorkId: item.kindOfWorkId })),
        incidentTypes: incidentTypes.map((type) => ({
          ...name(type),
          subTypes: type.subTypes.map(name),
        })),
        incidentOffers,
        contractors: placed.map((place) => name(place.contractor)),
        surveyWorkTypes: surveyWorkTypes.map(name),
      };
    });
  }
}
