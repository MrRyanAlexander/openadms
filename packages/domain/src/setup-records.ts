// What setup says as the firm's records are changed, archived and put back (spec/LISTS.md;
// spec/parts/01-setup.md; ADR-087, 108, 194, 302, 527): a built-in value is renamed and never
// archived; a contractor merged into another is never put back; a crew day's steps never share
// an hour; and a merge says what still names the contractor it archived. Setup refuses only a
// bad setting, in plain words, and saves a warning with what it saves.
import type { SetupWarning } from './form-debris-types.ts';

export interface SetupRecordRefusal {
  readonly code:
    | 'BUILT_IN_KEPT'
    | 'LIST_VALUE_SETTINGS'
    | 'CONTRACTOR_MERGED'
    | 'CREW_DAY_STEPS_OVERLAP'
    | 'CREW_DAY_STEPS_INVALID';
  readonly message: string;
}

// A value of one of the firm's lists, as archiving it reads it.
export interface ListValue {
  readonly name: string;
  // A built-in value's key; none on the firm's own.
  readonly key: string | null;
}

// What a value the firm adds to one of its lists states beside its name (spec/LISTS.md;
// ADR-527 (6)): a program type whether it requires ROEs; a kind of unit rate work the shape of its
// count; an item name its kind of work; a vehicle type what it certifies; an incident's sub-type
// its incident type; a reason where it is offered. Every other list takes a name alone.
export const listValueSettings = [
  'requiresRoe',
  'countShape',
  'kindOfWorkId',
  'certifies',
  'incidentTypeId',
  'uses',
] as const;

export type ListValueSetting = (typeof listValueSettings)[number];

const settingsOf: Readonly<Partial<Record<string, readonly ListValueSetting[]>>> = {
  'program-types': ['requiresRoe'],
  'kinds-of-work': ['countShape'],
  'item-names': ['kindOfWorkId'],
  'vehicle-types': ['certifies'],
  'incident-sub-types': ['incidentTypeId'],
  reasons: ['uses'],
};

const settingWords: Readonly<Record<ListValueSetting, string>> = {
  requiresRoe: 'whether it requires ROEs',
  countShape: 'the shape of its count',
  kindOfWorkId: 'its kind of work',
  certifies: 'what it certifies',
  incidentTypeId: 'its incident type',
  uses: 'where it is offered',
};

export class ListValues {
  // Why a value stating these settings isn't added to that list (named as a path names it:
  // `kinds-of-work`), or nothing. A project's field tag is added with its project, never here.
  addRefusal(list: string, stated: readonly ListValueSetting[]): SetupRecordRefusal | null {
    if (list === 'field-tags') {
      return {
        code: 'LIST_VALUE_SETTINGS',
        message: 'Not added: a field tag is added to its own project’s list.',
      };
    }
    const wanted = settingsOf[list] ?? [];
    const missing = wanted.filter((setting) => !stated.includes(setting));
    const extra = stated.filter((setting) => !wanted.includes(setting));
    if (missing.length === 0 && extra.length === 0) return null;
    const said = (settings: readonly ListValueSetting[]): string =>
      settings.map((setting) => settingWords[setting]).join(', ');
    return {
      code: 'LIST_VALUE_SETTINGS',
      message:
        missing.length > 0
          ? `Not added: a value of this list states ${said(missing)}.`
          : `Not added: a value of this list takes no ${said(extra)}.`,
    };
  }

  // A built-in value comes with Open ADMS: the system acts on it, so it is renamed if the firm
  // uses another word, and never archived (spec/LISTS.md, "Built-in values plus the firm's own").
  // The database refuses it too.
  archiveRefusal(value: ListValue): SetupRecordRefusal | null {
    if (value.key === null) return null;
    return {
      code: 'BUILT_IN_KEPT',
      message: `Not archived: “${value.name}” comes with Open ADMS and the system acts on it. It can be renamed, never archived.`,
    };
  }
}

export class FirmRecords {
  // A contractor archived as a second spelling of another points at the one kept: putting it back
  // would give the firm two records of one company again (ADR-108).
  putBackRefusal(contractor: {
    readonly name: string;
    readonly mergedIntoId: string | null;
  }): SetupRecordRefusal | null {
    if (contractor.mergedIntoId === null) return null;
    return {
      code: 'CONTRACTOR_MERGED',
      message: `Not put back: ${contractor.name} was merged into another contractor, which is the one kept.`,
    };
  }

  // What a merge leaves naming the contractor it archived, each said once (ADR-527 (11)): it moves
  // certifications and places only. A rule's pick is the rule builder's to change; whom a person
  // works for, and whose user a viewer is, an admin's.
  mergeLeftNaming(
    duplicateName: string,
    keptName: string,
    left: { readonly rulePicks: number; readonly employees: number; readonly viewers: number },
  ): SetupWarning[] {
    const counted = (count: number, one: string, many: string): string =>
      `${String(count)} ${count === 1 ? one : many}`;
    const said = (what: string, change: string): SetupWarning => ({
      code: 'MERGE_LEFT_NAMING',
      message: `Merged into ${keptName}, but ${what} still name${what.startsWith('1 ') ? 's' : ''} ${duplicateName}: ${change}.`,
    });
    return [
      ...(left.rulePicks === 0
        ? []
        : [
            said(
              counted(left.rulePicks, 'rule pick', 'rule picks'),
              'change them in the rule builder',
            ),
          ]),
      ...(left.employees === 0
        ? []
        : [
            said(
              counted(left.employees, 'person it employs', 'people it employs'),
              'an admin changes their employer',
            ),
          ]),
      ...(left.viewers === 0
        ? []
        : [
            said(
              counted(left.viewers, 'contractor user', 'contractor users'),
              'an admin changes whose user they are',
            ),
          ]),
    ];
  }
}

// One step of a crew day paid in steps: the hours from and to, both included, and the quantity
// they bill, as exact decimals ("1.50", "4.50", "0.25").
export interface CrewDayStep {
  readonly fromHours: string;
  readonly toHours: string;
  readonly quantity: string;
}

export interface CrewDayStepsCheck {
  readonly refusal: SetupRecordRefusal | null;
  readonly warnings: readonly SetupWarning[];
}

const hundredths = (hours: string): number => Math.round(Number(hours) * 100);

export class CrewDaySteps {
  private readonly steps: readonly CrewDayStep[];

  constructor(steps: readonly CrewDayStep[]) {
    this.steps = steps;
  }

  // A pay item's steps, stated whole (ADR-087, 355). Two that share an hour aren't saved: what an
  // hour in both bills would depend on which was read first. A gap between two is the setup
  // check's to list. Steps on a pay item not paid in them are saved and never read: said so.
  check(payItem: {
    readonly code: string;
    readonly crewTimeConversion: string | null;
  }): CrewDayStepsCheck {
    const steps = this.steps
      .map((step) => ({ ...step, from: hundredths(step.fromHours), to: hundredths(step.toHours) }))
      .sort((a, b) => a.from - b.from);
    const backwards = steps.find((step) => step.to < step.from);
    if (backwards !== undefined) {
      return {
        refusal: {
          code: 'CREW_DAY_STEPS_INVALID',
          message: `Not saved: a step of pay item ${payItem.code} ends (${backwards.toHours} h) before it starts (${backwards.fromHours} h).`,
        },
        warnings: [],
      };
    }
    for (const [index, step] of steps.entries()) {
      const before = steps[index - 1];
      if (before !== undefined && step.from <= before.to) {
        return {
          refusal: {
            code: 'CREW_DAY_STEPS_OVERLAP',
            message: `Not saved: two steps of pay item ${payItem.code} share hours (${before.fromHours}–${before.toHours} h and ${step.fromHours}–${step.toHours} h). An hour is in one step at most.`,
          },
          warnings: [],
        };
      }
    }
    const unread =
      steps.length > 0 && payItem.crewTimeConversion !== 'PER_DAY_STEPS'
        ? [
            {
              code: 'CREW_DAY_STEPS_UNREAD',
              message: `Pay item ${payItem.code} isn’t paid by the crew day in steps: its steps are kept, and read only once it is.`,
            } satisfies SetupWarning,
          ]
        : [];
    return { refusal: null, warnings: unread };
  }
}
