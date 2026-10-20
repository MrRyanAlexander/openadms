// What setup says as the firm's lists are added to, renamed and archived, and a crew day's steps
// stated (spec/LISTS.md; spec/parts/01-setup.md; ADR-087, 194, 302, 527, 529): a value states what
// its list asks; a built-in value is renamed and never archived; a crew day's steps never share
// an hour. Setup refuses only a bad setting, in plain words, and saves a warning with what it
// saves.
import type { SetupWarning } from './form-debris-types.ts';

export interface SetupRecordRefusal {
  readonly code:
    | 'BUILT_IN_KEPT'
    | 'LIST_VALUE_SETTINGS'
    | 'CREW_DAY_STEPS_OVERLAP'
    | 'CREW_DAY_STEPS_INVALID'
    | 'PROJECT_WORK_UNDER_WAY'
    | 'PROJECT_NOT_CLOSED';
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
// count, and may state whether its photographs are taken by stage (ADR-590; off where it doesn't);
// an item name its kind of work; a vehicle type what it certifies; an incident's sub-type its
// incident type; a reason where it is offered. Every other list takes a name alone.
export const listValueSettings = [
  'requiresRoe',
  'countShape',
  'photosByStage',
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

// What a value may state too, and goes without where it doesn't; and what it may change once it
// is added (a count's shape never: tickets are made by it).
const mayStateOf: Readonly<Partial<Record<string, readonly ListValueSetting[]>>> = {
  'kinds-of-work': ['photosByStage'],
};
const changeableOf = mayStateOf;

const settingWords: Readonly<Record<ListValueSetting, string>> = {
  requiresRoe: 'whether it requires ROEs',
  countShape: 'the shape of its count',
  photosByStage: 'whether its photographs are taken by stage',
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
    const may = mayStateOf[list] ?? [];
    const extra = stated.filter((setting) => !wanted.includes(setting) && !may.includes(setting));
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

  // Why a value's settings aren't changed so, or nothing: only what its list lets change once a
  // value is added, a kind of unit rate work whether its photographs are taken by stage
  // (ADR-590), and something must be said.
  changeRefusal(list: string, stated: readonly ListValueSetting[]): SetupRecordRefusal | null {
    if (stated.length === 0) {
      return { code: 'LIST_VALUE_SETTINGS', message: 'Not changed: nothing to change was said.' };
    }
    const may = changeableOf[list] ?? [];
    const not = stated.filter((setting) => !may.includes(setting));
    if (not.length === 0) return null;
    return {
      code: 'LIST_VALUE_SETTINGS',
      message: `Not changed: a value of this list doesn’t change ${not.map((setting) => settingWords[setting]).join(', ')}.`,
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

// What is still open on a project as an admin closes it (ADR-529 (b)), counted.
export interface ProjectOpenItems {
  // The phones that took its work and still hold their key (never turned in), by name.
  readonly phonesNotTurnedIn: readonly string[];
  readonly ticketsNotQcApproved: number;
  readonly ticketsNotInvoiced: number;
  readonly heldWaiting: number;
  readonly quarantinedWaiting: number;
  // Jobs the worker has yet to take up for it.
  readonly jobsWaiting: number;
}

export interface ClosingItem extends SetupWarning {
  readonly code:
    | 'PHONES_NOT_TURNED_IN'
    | 'TICKETS_NOT_QC_APPROVED'
    | 'TICKETS_NOT_INVOICED'
    | 'HELD_WAITING'
    | 'QUARANTINED_WAITING';
}

// A project closed by an admin, by hand (ADR-529 (b)): what is still open is shown, and the admin
// confirms; it never stops the close. Only work the worker has under way does, for a moment: a
// closed project changes no more, so its waiting jobs could never finish.
export class ProjectClosing {
  private readonly open: ProjectOpenItems;

  constructor(open: ProjectOpenItems) {
    this.open = open;
  }

  items(): readonly ClosingItem[] {
    const counted = (count: number, one: string, many: string): string =>
      `${String(count)} ${count === 1 ? one : many}`;
    const { open } = this;
    const items: ClosingItem[] = [];
    if (open.phonesNotTurnedIn.length > 0) {
      items.push({
        code: 'PHONES_NOT_TURNED_IN',
        message: `${counted(open.phonesNotTurnedIn.length, 'phone that took its work hasn’t', 'phones that took its work haven’t')} been turned in: ${open.phonesNotTurnedIn.join(', ')}.`,
      });
    }
    if (open.ticketsNotQcApproved > 0) {
      items.push({
        code: 'TICKETS_NOT_QC_APPROVED',
        message: `${counted(open.ticketsNotQcApproved, 'ticket isn’t', 'tickets aren’t')} QC Approved.`,
      });
    }
    if (open.ticketsNotInvoiced > 0) {
      items.push({
        code: 'TICKETS_NOT_INVOICED',
        message: `${counted(open.ticketsNotInvoiced, 'ticket isn’t', 'tickets aren’t')} locked as invoiced.`,
      });
    }
    if (open.heldWaiting > 0) {
      items.push({
        code: 'HELD_WAITING',
        message: `${counted(open.heldWaiting, 'record a phone sent waits', 'records phones sent wait')} for a person.`,
      });
    }
    if (open.quarantinedWaiting > 0) {
      items.push({
        code: 'QUARANTINED_WAITING',
        message: `${counted(open.quarantinedWaiting, 'quarantined record waits', 'quarantined records wait')} for a person.`,
      });
    }
    return items;
  }

  refusal(projectName: string): SetupRecordRefusal | null {
    if (this.open.jobsWaiting === 0) return null;
    return {
      code: 'PROJECT_WORK_UNDER_WAY',
      message: `Not closed: the worker is still working ${projectName}’s tickets. Close it again in a moment.`,
    };
  }

  // A project reopened is one that is closed, and says why (the reason is asked by the request).
  static reopenRefusal(project: {
    readonly name: string;
    readonly closedAt: Date | null;
  }): SetupRecordRefusal | null {
    if (project.closedAt !== null) return null;
    return {
      code: 'PROJECT_NOT_CLOSED',
      message: `Not reopened: ${project.name} isn’t closed.`,
    };
  }
}
