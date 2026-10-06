// The setup check (spec/parts/01-setup.md, "The setup check"; spec/RULES.md §7; adms-validation
// §5.3a; AC-01-69…73; ADR-222, 229, 239, 357): what a project's setup leaves open, listed before
// the field day, so no rule or setting is silently inert. It lists and never refuses: every gap
// is a plain message, and field work goes on whatever it says (invariant 19).
//
// What it lists:
//   - a site that charges a tipping fee with no tipping fee pay item linked;
//   - a debris type on a load or haul-out form that no rule of the form can pay;
//   - a pay item a rule adds on a prime's contract, holding other primes' rates and none for
//     that prime (a pay item with no rate at all is a $0 pay item, and one still to be
//     negotiated has none yet: neither is a gap);
//   - size bands of one payable type that overlap, or leave a stretch between them in no band;
//   - a crew day paid in steps whose steps leave hours between them in no step, or with no step;
//   - an active rule that isn't valid, and why: it never runs.
// It reads the setup and nothing else, and is the same list every time for the same setup.
import type { Named } from './checks.ts';
import { RuleReach, RuleValidity, type RuleEntry } from './rules.ts';
import { SizeBands } from './size-bands.ts';
import type { PricedPayItem } from './ticket-pricing.ts';

export const setupGapCodes = [
  'TIPPING_FEE_SITE_NO_PAY_ITEM',
  'DEBRIS_TYPE_NO_RULE',
  'NO_RATE_FOR_PRIME',
  'SIZE_BANDS_OVERLAP',
  'SIZE_BAND_GAP',
  'CREW_DAY_STEP_GAP',
  'RULE_NOT_VALID',
] as const;
export type SetupGapCode = (typeof setupGapCodes)[number];

// One thing the check lists, with the records it is about for a screen to link to.
export interface SetupGap {
  readonly code: SetupGapCode;
  readonly message: string;
  readonly siteId: string | null;
  readonly debrisTypeId: string | null;
  readonly payItemId: string | null;
  readonly primeId: string | null;
  readonly ruleId: string | null;
}

// A pay item as the check reads it: what pricing reads, its payable type and its band.
export interface CheckedPayItem extends PricedPayItem {
  readonly payableType: Named;
  readonly bandFrom: number | null;
  readonly bandTo: number | null;
  readonly archived: boolean;
}

// A load or haul-out form with the debris types on it (each a form's own entry).
export interface CheckedForm {
  readonly id: string;
  readonly form: 'LOAD' | 'HAUL_OUT';
  readonly debrisTypes: readonly Named[];
}

export interface CheckedFeeSite extends Named {
  readonly chargesTippingFee: boolean;
  readonly tippingFeePayItemIds: readonly string[];
}

// The project's setup as it stands. The primes, contracts, forms, debris types and sites are the
// live ones; the pay items and the rules are all of them, each saying whether it is archived.
export interface SetupChecked {
  readonly primes: readonly Named[];
  readonly contracts: readonly { readonly id: string; readonly primeId: string }[];
  readonly forms: readonly CheckedForm[];
  readonly sites: readonly CheckedFeeSite[];
  readonly payItems: readonly CheckedPayItem[];
  readonly rules: readonly RuleEntry[];
}

const formNames = { LOAD: 'load', HAUL_OUT: 'haul-out' } as const;
// Crew time is recorded to the quarter hour (ADR-084), so steps a quarter hour apart meet.
const quarterHour = 25;

export class SetupCheck {
  private readonly setup: SetupChecked;
  private readonly payItems: ReadonlyMap<string, CheckedPayItem>;
  private readonly running: readonly RuleEntry[];

  constructor(setup: SetupChecked) {
    this.setup = setup;
    this.payItems = new Map(setup.payItems.map((payItem) => [payItem.id, payItem]));
    this.running = setup.rules.filter((rule) => new RuleValidity(rule).runs);
  }

  // Everything the setup leaves open, in the order of the list above; none when it is whole.
  gaps(): SetupGap[] {
    return [
      ...this.feeSites(),
      ...this.debrisTypes(),
      ...this.rates(),
      ...this.bands(),
      ...this.crewDaySteps(),
      ...this.rules(),
    ];
  }

  private static gap(
    code: SetupGapCode,
    message: string,
    about: Partial<Omit<SetupGap, 'code' | 'message'>>,
  ): SetupGap {
    return {
      code,
      message,
      siteId: null,
      debrisTypeId: null,
      payItemId: null,
      primeId: null,
      ruleId: null,
      ...about,
    };
  }

  private feeSites(): SetupGap[] {
    return this.setup.sites
      .filter((site) => site.chargesTippingFee)
      .filter(
        (site) =>
          !site.tippingFeePayItemIds.some((id) => this.payItems.get(id)?.archived === false),
      )
      .map((site) =>
        SetupCheck.gap(
          'TIPPING_FEE_SITE_NO_PAY_ITEM',
          `${site.name} charges a tipping fee, but no tipping fee pay item is linked to it.`,
          { siteId: site.id },
        ),
      );
  }

  // A fee never pays a debris type: a site's tipping fee pay items are left out (ADR-224).
  private debrisTypes(): SetupGap[] {
    const fees = new Set(this.setup.sites.flatMap((site) => site.tippingFeePayItemIds));
    const contracts = new Set(this.setup.contracts.map((contract) => contract.id));
    const paying = this.running
      .filter((rule) => rule.contract !== null && contracts.has(rule.contract.id))
      .filter((rule) => new RuleReach(rule).adds().some((added) => !fees.has(added.id)));
    return this.setup.forms.flatMap(({ id, form, debrisTypes }) =>
      debrisTypes
        .filter(
          (debrisType) =>
            !paying.some(
              (rule) =>
                rule.formId === id && new RuleReach(rule).couldMeet({ DEBRIS_TYPE: debrisType.id }),
            ),
        )
        .map((debrisType) =>
          SetupCheck.gap(
            'DEBRIS_TYPE_NO_RULE',
            `${debrisType.name} is on the ${formNames[form]} form, but no rule on that form pays it.`,
            { debrisTypeId: debrisType.id },
          ),
        ),
    );
  }

  private rates(): SetupGap[] {
    const gaps = new Map<string, { payItem: CheckedPayItem; prime: Named; rules: string[] }>();
    for (const rule of this.running) {
      const primeId = this.setup.contracts.find((each) => each.id === rule.contract?.id)?.primeId;
      const prime = this.setup.primes.find((each) => each.id === primeId);
      if (prime === undefined) continue;
      for (const added of new RuleReach(rule).adds()) {
        const payItem = this.payItems.get(added.id);
        if (payItem === undefined || payItem.unit === 'TBN' || payItem.rates.length === 0) continue;
        if (payItem.rates.some((rate) => rate.primeId === prime.id)) continue;
        const key = `${payItem.id} ${prime.id}`;
        const gap = gaps.get(key) ?? { payItem, prime, rules: [] };
        if (!gap.rules.includes(rule.name)) gap.rules.push(rule.name);
        gaps.set(key, gap);
      }
    }
    return [...gaps.values()].map(({ payItem, prime, rules }) =>
      SetupCheck.gap(
        'NO_RATE_FOR_PRIME',
        `Pay item ${payItem.code} has no rate for ${prime.name}, and ${SetupCheck.and(rules.map((name) => `"${name}"`))} ${rules.length === 1 ? 'adds' : 'add'} it on a ${prime.name} contract.`,
        { payItemId: payItem.id, primeId: prime.id },
      ),
    );
  }

  private bands(): SetupGap[] {
    const byPayableType = new Map<string, CheckedPayItem[]>();
    for (const payItem of this.setup.payItems) {
      const id = payItem.payableType.id;
      byPayableType.set(id, [...(byPayableType.get(id) ?? []), payItem]);
    }
    const overlaps: SetupGap[] = [];
    const gaps: SetupGap[] = [];
    for (const payItems of byPayableType.values()) {
      const [first] = payItems;
      if (first === undefined) continue;
      const standing = new SizeBands(first.payableType.name, payItems).standing();
      overlaps.push(
        ...standing.overlaps.map((message) => SetupCheck.gap('SIZE_BANDS_OVERLAP', message, {})),
      );
      gaps.push(...standing.gaps.map((message) => SetupCheck.gap('SIZE_BAND_GAP', message, {})));
    }
    return [...overlaps, ...gaps];
  }

  // Hours that fall in no step bill nothing on that line (the user, ADR-355). Only the hours
  // between two steps are listed: where the first step starts and the last ends is the
  // contract's.
  private crewDaySteps(): SetupGap[] {
    const hundredths = (hours: string | number): number => Math.round(Number(hours) * 100);
    const said = (from: number, to: number): string =>
      from === to ? `${String(from / 100)} h` : `${String(from / 100)}–${String(to / 100)} h`;
    return this.setup.payItems
      .filter((payItem) => !payItem.archived && payItem.crewTimeConversion === 'PER_DAY_STEPS')
      .flatMap((payItem) => {
        const about = { payItemId: payItem.id };
        const steps = payItem.crewDaySteps
          .map((step) => ({ from: hundredths(step.fromHours), to: hundredths(step.toHours) }))
          .sort((a, b) => a.from - b.from);
        if (steps.length === 0) {
          return [
            SetupCheck.gap(
              'CREW_DAY_STEP_GAP',
              `Pay item ${payItem.code} pays a crew day in steps, but has no step; crew time on it bills nothing and is flagged.`,
              about,
            ),
          ];
        }
        const gaps: SetupGap[] = [];
        let reached = Number.NEGATIVE_INFINITY;
        for (const [index, step] of steps.entries()) {
          if (index > 0 && step.from - reached > quarterHour) {
            gaps.push(
              SetupCheck.gap(
                'CREW_DAY_STEP_GAP',
                `Pay item ${payItem.code}: ${said(reached + quarterHour, step.from - quarterHour)} falls in no step; crew time there bills nothing on that line and is flagged.`,
                about,
              ),
            );
          }
          reached = Math.max(reached, step.to);
        }
        return gaps;
      });
  }

  private rules(): SetupGap[] {
    return this.setup.rules
      .filter((rule) => rule.active && !rule.archived)
      .flatMap((rule) => {
        const reasons = new RuleValidity(rule).reasons();
        if (reasons.length === 0) return [];
        return [
          SetupCheck.gap(
            'RULE_NOT_VALID',
            `Rule "${rule.name}" is active but not valid, so it never runs. ${reasons.join(' ')}`,
            { ruleId: rule.id },
          ),
        ];
      });
  }

  private static and(names: readonly string[]): string {
    if (names.length <= 1) return names.join('');
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
  }
}
