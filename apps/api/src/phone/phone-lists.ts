// The lists a phone takes for its monitor's assignment (ARCHITECTURE §7.1's lists note, §9 (6);
// adms-field-app §4A.2a; AC-01-26, AC-02-37, AC-03-09, AC-07-91; BACKLOG 2.5.3, C68, C103, C115;
// ADR-207, 213, 223, 227, 240, 243, 449…451).
//
// - **Read, never written**, as the API's login, for one assignment and the phone that holds it.
// - **Trimmed to the assignment:** the unit rate pay items it names now (one taken off the
//   assignment is left out), the item names of their kinds of work, the incident and survey
//   lists only where the assignment makes those forms, the ROEs only where its work names one,
//   and its one site's quantity lookup.
// - **The least a monitor needs** (ASVS 14.2.6): a certification's number, kind, capacity, prime
//   and subs, never its driver; an ROE's number, address and parcel, never its owner.
// - **Never a rate, a rule, a transaction or a load's pay item** (invariant 20): none is read
//   here, so none can be sent. A unit rate pay item carries its code, which the phone prints.
// - **Which assignment** is the sign-in's own rule, asked again at each read (`taken`), so a
//   phone that refreshes its lists learns of a board that changed.
// - Parts 1 and 2 of task 2.5.3 (ADR-449): the setup version, the login list, the master
//   passcode's check and the address lookup are the later parts'.
import type { Database } from '@open-adms/db';
import type {
  CertificationKind,
  DumpedForm,
  IncidentOffer,
  NoAssignmentReason,
  NumberSeriesName,
  QuantityAskName,
} from '@open-adms/domain';

import { SetupStanding } from '../setup/setup-standing.ts';
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
  // The project's pre-printed stock, for a project that numbers from it.
  readonly controlRanges: readonly {
    readonly series: NumberSeriesName;
    readonly firstNumber: number;
    readonly lastNumber: number;
  }[];
  // The entries on the project's load and haul-out forms, without those hidden on phones; each
  // id is the entry's.
  readonly debrisTypes: { readonly LOAD: readonly Named[]; readonly HAUL_OUT: readonly Named[] };
  readonly fieldTags: readonly Named[];
  readonly typedNumberReasons: readonly Named[];
  // What a scanned badge's number finds: whose truck or crew, and what it holds.
  readonly certifications: readonly {
    readonly id: string;
    readonly certNumber: string;
    readonly kind: CertificationKind;
    readonly capacityCy: number | null;
    readonly prime: Named;
    readonly firstTierSub: Named | null;
    readonly secondTierSub: Named | null;
  }[];
  readonly sites: readonly (Named & {
    readonly siteType: Named;
    readonly takesLoads: boolean;
    readonly haulOutsLeaveHere: boolean;
  })[];
  // The project's ROEs to pick one from, each saying whether its pre-work survey is done
  // (ADR-150); none for a phone whose work names no ROE.
  readonly roes: readonly {
    readonly id: string;
    readonly roeNumber: string;
    readonly address: string | null;
    readonly parcelId: string | null;
    readonly preWorkSurveyDone: boolean;
  }[];
  readonly payItems: readonly {
    readonly id: string;
    readonly code: string;
    readonly bandFrom: number | null;
    readonly bandTo: number | null;
    readonly archived: boolean;
    readonly payableType: Named;
    readonly kindOfWork: Named;
    readonly countIsAlwaysOne: boolean;
    readonly gpsRequired: boolean;
    readonly measurementRequired: boolean;
    readonly decimalsAllowed: boolean;
    readonly photosRequired: boolean;
    readonly monitorMayMarkIneligible: boolean;
    readonly quantityFromCarriedTickets: boolean;
  }[];
  readonly itemNames: readonly (Named & { readonly kindOfWorkId: string })[];
  readonly incidentTypes: readonly (Named & { readonly subTypes: readonly Named[] })[];
  readonly incidentOffers: readonly IncidentOffer[];
  readonly contractors: readonly Named[];
  readonly surveyWorkTypes: readonly Named[];
  // What the assignment's site's phones ask for (ADR-227, 243), for the debris types this
  // phone holds; none for a phone at no site.
  readonly quantityLookup: readonly {
    readonly form: DumpedForm;
    readonly debrisTypeId: string;
    readonly primeId: string;
    readonly asks: QuantityAskName;
  }[];
}

export type PhoneListsTaken =
  | { readonly taken: true; readonly assignment: PhoneAssignment; readonly lists: PhoneListsHeld }
  | { readonly taken: false; readonly why: NoAssignmentReason };

const name = ({ id, name }: Named): Named => ({ id, name });
const written = (roeNumber: string | null): string => (roeNumber ?? '').trim();

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
      const makes = (documentType: 'INCIDENT' | 'SURVEY' | 'ROE') =>
        assignment.formDocumentTypes.includes(documentType);
      const blocks = await tx.numberBlock.findMany({
        where: { deviceId: phone.deviceId, projectId, status: 'ISSUED' },
        orderBy: [{ issuedAt: 'asc' }, { firstNumber: 'asc' }],
      });
      const controlRanges = await tx.controlRange.findMany({
        where: { projectId, archivedAt: null },
        orderBy: [{ series: 'asc' }, { firstNumber: 'asc' }],
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
      // Every certification of the project: one never ends on its own, and a revoked or
      // replaced one is the server's to flag (ADR-079), never the phone's to refuse.
      const certifications = await tx.certification.findMany({
        where: { projectId },
        select: {
          id: true,
          certNumber: true,
          kind: true,
          capacityCy: true,
          prime: { select: { id: true, name: true } },
          firstTierSub: { select: { id: true, name: true } },
          secondTierSub: { select: { id: true, name: true } },
        },
        orderBy: { certNumber: 'asc' },
      });
      const sites = await tx.disposalSite.findMany({
        where: { projectId, archivedAt: null },
        select: {
          id: true,
          name: true,
          takesLoads: true,
          haulOutsLeaveHere: true,
          siteType: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
      });
      // An ROE is named by a collection, unit rate work, a survey and an incident, and made by
      // a phone that makes ROEs: no other phone is sent a property's address.
      const namesRoes =
        assignment.fieldEventKinds.some((kind) => kind === 'COLLECTION' || kind === 'UNIT_RATE') ||
        makes('ROE') ||
        makes('SURVEY') ||
        makes('INCIDENT');
      const roes = namesRoes
        ? await tx.roe.findMany({
            where: { projectId },
            select: { id: true, roeNumber: true, address: true, parcelId: true },
            orderBy: { roeNumber: 'asc' },
          })
        : [];
      // A pre-work survey is found by the ROE number written on it (ADR-150).
      const preWork = namesRoes
        ? await tx.survey.findMany({
            where: { projectId, workType: { key: 'PRE_WORK' }, roeNumber: { not: null } },
            select: { roeNumber: true },
          })
        : [];
      const surveyed = new Set(preWork.map((survey) => written(survey.roeNumber)));
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
          countIsAlwaysOne: true,
          gpsRequired: true,
          measurementRequired: true,
          decimalsAllowed: true,
          photosRequired: true,
          monitorMayMarkIneligible: true,
          quantityFromCarriedTickets: true,
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
      // What the assignment's one site's phones ask for, for the debris types this phone holds.
      const carried = new Set(entries.map((entry) => entry.id));
      const asks =
        assignment.siteId === null
          ? []
          : await SetupStanding.quantityLookupIn(tx, { id: assignment.siteId, projectId });
      return {
        blocks: blocks.map(({ series, firstNumber, lastNumber, lastUsedNumber }) => ({
          series,
          firstNumber,
          lastNumber,
          lastUsedNumber,
          status: 'ISSUED' as const,
        })),
        controlRanges: controlRanges.map(({ series, firstNumber, lastNumber }) => ({
          series,
          firstNumber,
          lastNumber,
        })),
        debrisTypes: { LOAD: named('LOAD'), HAUL_OUT: named('HAUL_OUT') },
        fieldTags: fieldTags.map(name),
        typedNumberReasons: reasons.map(name),
        certifications: certifications.map((certification) => ({
          id: certification.id,
          certNumber: certification.certNumber,
          kind: certification.kind,
          capacityCy: certification.capacityCy,
          prime: name(certification.prime),
          firstTierSub:
            certification.firstTierSub === null ? null : name(certification.firstTierSub),
          secondTierSub:
            certification.secondTierSub === null ? null : name(certification.secondTierSub),
        })),
        sites: sites.map((site) => ({
          ...name(site),
          siteType: name(site.siteType),
          takesLoads: site.takesLoads,
          haulOutsLeaveHere: site.haulOutsLeaveHere,
        })),
        roes: roes.map((roe) => ({
          id: roe.id,
          roeNumber: roe.roeNumber,
          address: roe.address,
          parcelId: roe.parcelId,
          preWorkSurveyDone: surveyed.has(written(roe.roeNumber)),
        })),
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
                  countIsAlwaysOne: payItem.countIsAlwaysOne,
                  gpsRequired: payItem.gpsRequired,
                  measurementRequired: payItem.measurementRequired,
                  decimalsAllowed: payItem.decimalsAllowed,
                  photosRequired: payItem.photosRequired,
                  monitorMayMarkIneligible: payItem.monitorMayMarkIneligible,
                  quantityFromCarriedTickets: payItem.quantityFromCarriedTickets,
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
        quantityLookup: asks
          .filter((ask) => carried.has(ask.debrisTypeId))
          .map(({ form, debrisTypeId, primeId, asks }) => ({ form, debrisTypeId, primeId, asks })),
      };
    });
  }
}
