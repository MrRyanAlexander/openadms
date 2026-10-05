// The checks on ROEs and surveys (spec/parts/06-reconciliation.md step 3;
// spec/acceptance/06-reconciliation.md section J, AC-06-112…116; spec/FLAGS.md §3.7;
// adms-validation §5.2 "Forms"; adms-ticket-workflows §4.6; ADR-055, 149, 150, 292, 293, 347).
//
// On a project whose program type requires ROEs, every collection, unit rate ticket and survey
// carries one: missing, not on the project, unsigned or out of scope is flagged, and the ticket
// still bills. Nothing is looked up here: the ROE a number found is handed over, or none was
// found. An ROE with no scope picked has no scope check (ADR-293).
//
// A check changes nothing, refuses nothing and guesses nothing (ADR-052). A ticket's ROE flag is
// the ticket's, like any other; a survey's sits on the survey and touches no ticket.
import type { BuiltInKey } from './built-in-keys.ts';
import type { Named } from './checks.ts';
import { Flags, type FlagRaised, type FlagSubject } from './flags.ts';
import type { GroupedFieldEvent, Ticket } from './tickets.ts';

// What the checks read of an ROE of the project.
export interface CheckedRoe {
  readonly id: string;
  readonly roeNumber: string;
  readonly signed: boolean;
  // Its scope picks that haven't been taken off: debris types of the project's load form and
  // payable types. Empty is no scope picked.
  readonly scopeDebrisTypeIds: readonly string[];
  readonly scopePayableTypeIds: readonly string[];
}

// What names an ROE: the number as picked or typed, and the ROE it found on the project.
export interface RoeNamed {
  readonly roeNumber: string | null;
  readonly roe: CheckedRoe | null;
}

// What the checks read of a field event, beside what grouping reads.
export interface RoeFieldEvent extends GroupedFieldEvent, RoeNamed {
  // A collection's debris type, or a unit rate event's payable type: the work a scope is read
  // against.
  readonly debrisType: Named | null;
  readonly payableType: Named | null;
}

// What the checks read of a survey.
export interface CheckedSurvey extends RoeNamed {
  readonly id: string;
  // Its work type's built-in key, if it has one: a post-work survey is told by it, never by
  // the name (ADR-150, 194).
  readonly workTypeKey: BuiltInKey<'surveyWorkType'> | null;
}

export interface RoeSetup {
  readonly timeZone: string;
  // The project's program type's "requires ROE" (ADR-070, 149).
  readonly requiresRoe: boolean;
}

const named = (roeNumber: string | null): string | null => {
  const written = (roeNumber ?? '').trim();
  return written === '' ? null : written;
};

export class RoeChecks<E extends RoeFieldEvent = RoeFieldEvent> {
  private readonly setup: RoeSetup;
  private readonly flags: Flags;

  constructor(setup: RoeSetup) {
    this.setup = setup;
    this.flags = new Flags(setup.timeZone);
  }

  // The ROE flags of a ticket's collections (each property's own on a split) and of a unit rate
  // event. A disposal and a haul-out carry no ROE.
  of(ticket: Ticket<E>): readonly FlagRaised[] {
    if (!this.setup.requiresRoe) return [];
    const subject: FlagSubject = { ticketNumber: ticket.ticketNumber };
    return ticket.events
      .filter((event) => event.kind === 'COLLECTION' || event.kind === 'UNIT_RATE')
      .flatMap((event) => [...this.named(subject, event, event.id), ...this.scope(subject, event)]);
  }

  // A survey's own flags: its ROE, and a post-work survey's pre-work survey, found by ROE
  // number among the project's other surveys (ADR-150). They sit on the survey.
  survey(survey: CheckedSurvey, others: readonly CheckedSurvey[]): readonly FlagRaised[] {
    const roeNumber = named(survey.roeNumber);
    const subject: FlagSubject = { surveyOnRoe: roeNumber };
    const raised = this.setup.requiresRoe ? this.named(subject, survey, null) : [];
    if (
      roeNumber !== null &&
      survey.workTypeKey === 'POST_WORK' &&
      !others.some(
        (other) =>
          other.id !== survey.id &&
          other.workTypeKey === 'PRE_WORK' &&
          named(other.roeNumber) === roeNumber,
      )
    ) {
      raised.push(this.flags.raise('NO_PRE_WORK_SURVEY', subject, {}, { roeNumber }));
    }
    return raised;
  }

  // No ROE; one the project doesn't have; one that isn't signed. Only `signed` is read: a
  // signed date beside an unticked "signed" is still unsigned.
  private named(subject: FlagSubject, record: RoeNamed, fieldEventId: string | null): FlagRaised[] {
    const roeNumber = named(record.roeNumber);
    if (roeNumber === null) {
      return [this.flags.raise('ROE_MISSING', subject, {}, { requiresRoe: true }, fieldEventId)];
    }
    const { roe } = record;
    if (roe === null) {
      return [
        this.flags.raise(
          'ROE_NOT_ON_PROJECT',
          subject,
          { roe: roeNumber },
          { roeNumber },
          fieldEventId,
        ),
      ];
    }
    if (roe.signed) return [];
    return [
      this.flags.raise(
        'ROE_UNSIGNED',
        subject,
        { roe: roe.roeNumber },
        { roeId: roe.id, signed: false },
        fieldEventId,
      ),
    ];
  }

  // The ROE has a scope and the work isn't among its picks: a collection's debris type, the
  // exact entry; a unit rate event's payable type (ADR-293). Work with no pick of its own can't
  // be read against a scope, and its missing detail is flagged as that.
  private scope(subject: FlagSubject, event: E): FlagRaised[] {
    const { roe } = event;
    if (roe === null) return [];
    const picks = [...roe.scopeDebrisTypeIds, ...roe.scopePayableTypeIds];
    if (picks.length === 0) return [];
    const unitRate = event.kind === 'UNIT_RATE';
    const work = unitRate ? event.payableType : event.debrisType;
    if (work === null) return [];
    const inScope = (unitRate ? roe.scopePayableTypeIds : roe.scopeDebrisTypeIds).includes(work.id);
    if (inScope) return [];
    return [
      this.flags.raise(
        'ROE_OUT_OF_SCOPE',
        subject,
        { roe: roe.roeNumber },
        { roeId: roe.id, scope: [...picks].sort(), work: work.id },
        event.id,
      ),
    ];
  }
}
