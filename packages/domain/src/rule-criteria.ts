// What a rule's criterion may be (spec/RULES.md §3, §4, §4a; ADR-109, 118, 125, 135, 239, 313): the
// criteria each form takes, the kind of value each holds (picked from a list, or typed: a number, a
// date, text), and the operators that kind takes. The rule builder offers nothing else, the worker
// reads a rule the same way, and the database refuses an operator or a value that doesn't fit its
// criterion (the rules' guard migration). The keys are the database's closed sets, held level with
// these lists by packages/db's rules.test.ts.

// The forms a rule belongs to: one ticket type each (ADR-018, 211).
export type RuleForm = 'LOAD' | 'HAUL_OUT' | 'UNIT_RATE';

// In the order of spec/RULES.md §4's table, which is the order the builder lists them in.
export const ruleCriterionKeys = [
  'TICKET_DATE',
  'CONTRACTOR',
  'DEBRIS_TYPE',
  'FIELD_TAG',
  'WEIGHT',
  'VOLUME',
  'COLLECTION_ADDRESS',
  'ZONE',
  'DISPOSAL_SITE',
  'FROM_SITE',
  'DISPOSAL_SITE_TYPE',
  'MILEAGE',
  'PAY_ITEM',
  'UNIT_COUNT',
  'MEASUREMENT',
  'ITEM',
] as const;
export type RuleCriterionKey = (typeof ruleCriterionKeys)[number];

export const ruleOperators = [
  'EQUALS',
  'NOT_EQUALS',
  'IS_ONE_OF',
  'IS_NOT_ONE_OF',
  'BETWEEN',
  'AT_LEAST',
  'AT_MOST',
  'MORE_THAN',
  'LESS_THAN',
  'ON',
  'NOT_ON',
  'ON_OR_BEFORE',
  'ON_OR_AFTER',
  'CONTAINS',
  'STARTS_WITH',
  'IS_EMPTY',
  'IS_NOT_EMPTY',
] as const;
export type RuleOperator = (typeof ruleOperators)[number];

// The kind of value a criterion holds. An item's count is a number compared for the one item
// picked: "Item "Fridge, freon recovered" AT LEAST 1" (ADR-128).
export type RuleValueKind = 'PICK' | 'NUMBER' | 'DATE' | 'TEXT' | 'ITEM_COUNT';

// One picked value, as setup holds it.
export interface RulePick {
  // The picked record's id; a zone is matched by its name, since map versions change (ADR-141).
  readonly value: string;
  // What people call it: "Vegetative", "Bayline County Landfill", "Zone 2".
  readonly name: string;
  // No longer there to pick: archived, or a zone name the project's current map doesn't have.
  readonly gone: boolean;
}

// One line of a rule's "ifs". A typed value sits in the fields of its kind; the "to" only on
// BETWEEN. A date is a calendar day in the project's time zone, written 2026-10-15.
export interface RuleCriterionLine {
  readonly criterion: RuleCriterionKey;
  readonly operator: RuleOperator;
  readonly picks: readonly RulePick[];
  readonly numberFrom: number | null;
  readonly numberTo: number | null;
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
  readonly text: string | null;
}

interface Criterion {
  readonly label: string;
  readonly kind: RuleValueKind;
  readonly forms: readonly RuleForm[];
}

const everyForm: readonly RuleForm[] = ['LOAD', 'HAUL_OUT', 'UNIT_RATE'];
const loadsAndHaulOuts: readonly RuleForm[] = ['LOAD', 'HAUL_OUT'];
const unitRate: readonly RuleForm[] = ['UNIT_RATE'];

// spec/RULES.md §4, row for row. A new criterion isn't added without its row there.
const criteria: Record<RuleCriterionKey, Criterion> = {
  TICKET_DATE: { label: 'Ticket date', kind: 'DATE', forms: everyForm },
  CONTRACTOR: { label: 'Contractor', kind: 'PICK', forms: everyForm },
  DEBRIS_TYPE: { label: 'Debris type', kind: 'PICK', forms: loadsAndHaulOuts },
  FIELD_TAG: { label: 'Field tag', kind: 'PICK', forms: everyForm },
  WEIGHT: { label: 'Weight', kind: 'NUMBER', forms: loadsAndHaulOuts },
  VOLUME: { label: 'Volume', kind: 'NUMBER', forms: loadsAndHaulOuts },
  COLLECTION_ADDRESS: { label: 'Collection address', kind: 'TEXT', forms: everyForm },
  ZONE: { label: 'Zone', kind: 'PICK', forms: ['LOAD', 'UNIT_RATE'] },
  DISPOSAL_SITE: { label: 'Disposal site', kind: 'PICK', forms: loadsAndHaulOuts },
  FROM_SITE: { label: 'From site', kind: 'PICK', forms: ['HAUL_OUT'] },
  DISPOSAL_SITE_TYPE: { label: 'Disposal site type', kind: 'PICK', forms: loadsAndHaulOuts },
  MILEAGE: { label: 'Mileage', kind: 'NUMBER', forms: loadsAndHaulOuts },
  PAY_ITEM: { label: 'Pay item', kind: 'PICK', forms: unitRate },
  UNIT_COUNT: { label: 'Unit count', kind: 'NUMBER', forms: unitRate },
  MEASUREMENT: { label: 'Measurement', kind: 'NUMBER', forms: unitRate },
  ITEM: { label: 'Item', kind: 'ITEM_COUNT', forms: unitRate },
};

const numberOperators: readonly RuleOperator[] = [
  'EQUALS',
  'NOT_EQUALS',
  'BETWEEN',
  'AT_LEAST',
  'AT_MOST',
  'MORE_THAN',
  'LESS_THAN',
];

// spec/RULES.md §4a, by kind of value; IS EMPTY and IS NOT EMPTY go with every kind.
const operators: Record<RuleValueKind, readonly RuleOperator[]> = {
  PICK: ['EQUALS', 'NOT_EQUALS', 'IS_ONE_OF', 'IS_NOT_ONE_OF'],
  NUMBER: numberOperators,
  ITEM_COUNT: numberOperators,
  DATE: ['ON', 'NOT_ON', 'BETWEEN', 'ON_OR_BEFORE', 'ON_OR_AFTER'],
  TEXT: ['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'STARTS_WITH'],
};
const onAnyKind: readonly RuleOperator[] = ['IS_EMPTY', 'IS_NOT_EMPTY'];

const formNames: Record<RuleForm, string> = {
  LOAD: 'load',
  HAUL_OUT: 'haul-out',
  UNIT_RATE: 'unit rate',
};

// The criteria of one form's rules; and, for any criterion, its kind of value and its operators.
export class RuleCriteria {
  private readonly form: RuleForm;

  constructor(form: RuleForm) {
    this.form = form;
  }

  // The criteria the builder offers on the form, in the page's order: nothing that can't apply.
  offered(): RuleCriterionKey[] {
    return ruleCriterionKeys.filter((key) => this.takes(key));
  }

  takes(criterion: RuleCriterionKey): boolean {
    return criteria[criterion].forms.includes(this.form);
  }

  // The form as a sentence says it: "unit rate".
  get formName(): string {
    return formNames[this.form];
  }

  static kindOf(criterion: RuleCriterionKey): RuleValueKind {
    return criteria[criterion].kind;
  }

  // The operators the builder offers for a criterion: its kind's, then IS EMPTY and IS NOT EMPTY.
  static operatorsOf(criterion: RuleCriterionKey): RuleOperator[] {
    return [...operators[criteria[criterion].kind], ...onAnyKind];
  }

  // A criterion as people read it: "Disposal site type".
  static labelOf(criterion: RuleCriterionKey): string {
    return criteria[criterion].label;
  }

  // An operator as people read it: "IS ONE OF".
  static operatorLabelOf(operator: RuleOperator): string {
    return operator.replaceAll('_', ' ');
  }

  // Why a line can't be read as a criterion, or null: an operator its kind doesn't take, or a
  // value that isn't the one the operator needs. The database refuses the same lines.
  static problemWith(line: RuleCriterionLine): string | null {
    const label = RuleCriteria.labelOf(line.criterion);
    const operator = RuleCriteria.operatorLabelOf(line.operator);
    if (!RuleCriteria.operatorsOf(line.criterion).includes(line.operator)) {
      return `${label} doesn't take ${operator}.`;
    }
    const kind = RuleCriteria.kindOf(line.criterion);
    if (kind === 'ITEM_COUNT' && line.picks.length !== 1) {
      return `${label} needs the one item whose count it compares.`;
    }
    if (line.operator === 'IS_EMPTY' || line.operator === 'IS_NOT_EMPTY') return null;
    switch (kind) {
      case 'PICK': {
        const several = line.operator === 'IS_ONE_OF' || line.operator === 'IS_NOT_ONE_OF';
        if (several ? line.picks.length === 0 : line.picks.length !== 1) {
          return `${label} ${operator} needs ${several ? 'at least one picked value' : 'one picked value'}.`;
        }
        return null;
      }
      case 'NUMBER':
      case 'ITEM_COUNT':
        return RuleCriteria.rangeProblem(label, operator, line, line.numberFrom, line.numberTo);
      case 'DATE':
        return RuleCriteria.rangeProblem(
          label,
          operator,
          line,
          RuleCriteria.dayOf(line.dateFrom),
          RuleCriteria.dayOf(line.dateTo),
        );
      case 'TEXT':
        return line.text === null || line.text === ''
          ? `${label} ${operator} needs its text.`
          : null;
    }
  }

  // A calendar day (2026-10-15) as a count of days, or null where it isn't one.
  static dayOf(date: string | null): number | null {
    if (date === null) return null;
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (parts === null) return null;
    const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
    const time = Date.UTC(year, month - 1, day);
    const read = new Date(time);
    if (read.getUTCMonth() !== month - 1 || read.getUTCDate() !== day) return null;
    return time / 86_400_000;
  }

  private static rangeProblem(
    label: string,
    operator: string,
    line: RuleCriterionLine,
    from: number | null,
    to: number | null,
  ): string | null {
    if (from === null || !Number.isFinite(from)) return `${label} ${operator} needs its value.`;
    if (line.operator !== 'BETWEEN') return null;
    if (to === null || !Number.isFinite(to)) return `${label} BETWEEN needs both its ends.`;
    return from > to ? `${label} BETWEEN runs from its lower end to its higher.` : null;
  }
}
