// The lists a phone takes for its monitor's assignment (ARCHITECTURE §7.1's lists note, §9 (6);
// adms-field-app §4A.2a; AC-01-26, AC-02-37, AC-03-09, AC-07-91; BACKLOG 2.5.3, C68, C103, C115;
// ADR-207, 213, 223, 227, 240, 243, 449…451, 453).
//
// - **Read as the API's login**, for one assignment and the phone that holds it. **One thing is
//   written:** a new setup version, when what the project's phones are shown differs from the
//   newest one (`SetupVersions`, ADR-453); the lists say which version they are.
// - **Trimmed to the assignment:** the unit rate pay items it names now (one taken off the
//   assignment is left out), the item names of their kinds of work, the incident and survey
//   lists only where the assignment makes those forms, the ROEs only where its work names one,
//   the truck lists only where it certifies or takes disposals, who may be picked as a helper
//   only where it certifies (ADR-552 (3)), and its one site's quantity lookup.
// - **The least a monitor needs** (ASVS 14.2.6): a certification's number, kind, capacity, prime
//   and subs, never its driver; an ROE's number, address and parcel, never its owner; a helper's
//   id and name, never their Monitor ID or phone number; a contractor's name, never its contact.
// - **Never a rate, a rule, a transaction or a load's pay item** (invariant 20): none is read
//   here, so none can be sent. A unit rate pay item carries its code, which the phone prints.
// - **Which assignment** is the sign-in's own rule, asked again at each read (`taken`), so a
//   phone that refreshes its lists learns of a board that changed.
// - Parts 1 to 3 of task 2.5.3 (ADR-449): the login list, the master passcode's check and the
//   address lookup are the later parts'.
import type { Database } from '@open-adms/db';
import type {
  CertificationKind,
  DumpedForm,
  IncidentOffer,
  NoAssignmentReason,
  NumberSeriesName,
  QuantityAskName,
} from '@open-adms/domain';

import { SetupVersions, type SetupShown, type SiteShown } from '../setup/setup-versions.ts';
import type { PhoneAssignment, PhoneAssignments } from './phone-assignments.ts';

interface Named {
  readonly id: string;
  readonly name: string;
}

export interface PhoneListsHeld {
  // The project's setup version these lists are its assignment's part of (ADR-453): what every
  // field event the phone makes records.
  readonly setupVersion: number;
  // The blocks of numbers this phone holds on the assignment's project.
  readonly blocks: readonly {
    readonly series: NumberSeriesName;
    readonly firstNumber: number;
    readonly lastNumber: number;
    readonly lastUsedNumber: number | null;
    readonly status: 'ISSUED';
  }[];
  // How the project numbers its tickets and the series it has; whether a collection asks
  // "normal or split?" (C184, ADR-137, 581).
  readonly numbering: SetupShown['numbering'];
  readonly allowSplitLoads: boolean;
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
  // Each with its place: its GPS and its area as it stands (ADR-552 (3)(d)).
  readonly sites: readonly SiteShown[];
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
  // The truck lists, for a phone whose assignment certifies or takes disposals (ADR-552 (3)(a)):
  // what certifying picks, and what a tower finds a truck keyed in by hand from.
  readonly vehicleTypes: SetupShown['vehicleTypes'];
  readonly vehicleFeatures: SetupShown['vehicleFeatures'];
  readonly crewTypes: SetupShown['crewTypes'];
  readonly primes: SetupShown['primes'];
  // Who a certifying phone's monitor may pick as a helper (ADR-294, 552 (3)(c)).
  readonly helpers: readonly Named[];
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
  private readonly versions: SetupVersions;
  private readonly clock: { now(): Date };

  constructor(db: Database, parts: { assignments: PhoneAssignments; clock: { now(): Date } }) {
    this.db = db;
    this.assignments = parts.assignments;
    this.versions = new SetupVersions(db);
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

  // The lists of one assignment, for the phone that holds it: its part of what the project's
  // phones are shown, the project's records beside it, and the setup version that is.
  async held(phone: {
    readonly assignmentId: string;
    readonly deviceId: string;
  }): Promise<PhoneListsHeld> {
    const { projectId, shown, lists } = await this.db.$read(async (tx) => {
      const assignment = await tx.assignment.findUniqueOrThrow({
        where: { id: phone.assignmentId },
      });
      const { projectId } = assignment;
      const makes = (documentType: 'INCIDENT' | 'SURVEY' | 'ROE') =>
        assignment.formDocumentTypes.includes(documentType);
      const shown = await SetupVersions.shownIn(tx, projectId);
      const blocks = await tx.numberBlock.findMany({
        where: { deviceId: phone.deviceId, projectId, status: 'ISSUED' },
        orderBy: [{ issuedAt: 'asc' }, { firstNumber: 'asc' }],
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
      });
      const itsPayItems = new Set(assigned.map((one) => one.payItemId));
      const itsKindsOfWork = new Set(assigned.map((one) => one.kindOfWorkId));
      // The truck lists go to a phone that certifies or takes disposals: a tower keys in by hand
      // a truck its certifications don't hold (the user, ADR-552 (3)(a)).
      const trucks =
        assignment.certifying ||
        assignment.fieldEventKinds.some(
          (kind) => kind === 'DISPOSAL' || kind === 'HAUL_OUT_DISPOSAL',
        );
      // A helper is picked from the others with an assignment on the project that day, by id
      // and name alone (ADR-294).
      const helpers = assignment.certifying
        ? await tx.assignment.findMany({
            where: {
              projectId,
              workDate: assignment.workDate,
              archivedAt: null,
              personId: { not: assignment.personId },
            },
            select: { person: { select: { id: true, name: true } } },
            orderBy: [{ person: { name: 'asc' } }, { personId: 'asc' }],
          })
        : [];
      // Once each, though the board gave somebody two assignments that day.
      const helped = [...new Map(helpers.map(({ person }) => [person.id, name(person)])).values()];
      return {
        projectId,
        shown,
        lists: {
          blocks: blocks.map(({ series, firstNumber, lastNumber, lastUsedNumber }) => ({
            series,
            firstNumber,
            lastNumber,
            lastUsedNumber,
            status: 'ISSUED' as const,
          })),
          numbering: shown.numbering,
          allowSplitLoads: shown.allowSplitLoads,
          controlRanges: shown.controlRanges,
          debrisTypes: shown.debrisTypes,
          fieldTags: shown.fieldTags,
          typedNumberReasons: shown.typedNumberReasons,
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
          sites: shown.sites,
          roes: roes.map((roe) => ({
            id: roe.id,
            roeNumber: roe.roeNumber,
            address: roe.address,
            parcelId: roe.parcelId,
            preWorkSurveyDone: surveyed.has(written(roe.roeNumber)),
          })),
          payItems: shown.payItems.filter((payItem) => itsPayItems.has(payItem.id)),
          itemNames: shown.itemNames.filter((item) => itsKindsOfWork.has(item.kindOfWorkId)),
          // The incident and survey lists only where the assignment makes those forms.
          incidentTypes: makes('INCIDENT') ? shown.incidentTypes : [],
          incidentOffers: makes('INCIDENT') ? shown.incidentOffers : [],
          contractors: makes('INCIDENT') ? shown.contractors : [],
          surveyWorkTypes: makes('SURVEY') ? shown.surveyWorkTypes : [],
          vehicleTypes: trucks ? shown.vehicleTypes : [],
          vehicleFeatures: trucks ? shown.vehicleFeatures : [],
          crewTypes: trucks ? shown.crewTypes : [],
          primes: trucks ? shown.primes : [],
          helpers: helped,
          // What the assignment's one site's phones ask for; none for a phone at no site.
          quantityLookup: shown.quantityLookup
            .filter((ask) => ask.siteId === assignment.siteId)
            .map(({ form, debrisTypeId, primeId, asks }) => ({
              form,
              debrisTypeId,
              primeId,
              asks,
            })),
        },
      };
    });
    return {
      setupVersion: await this.versions.numbered(projectId, shown, phone.deviceId),
      ...lists,
    };
  }
}
