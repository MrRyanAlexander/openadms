// The debris types on a project's load or haul-out form (spec/parts/01-setup.md step 5;
// spec/DATA-MODEL.md §3 "FormDebrisType"; ADR-211, 214, 308). Each entry is named as the contract
// names the work, and carries Reduced, a reduction method and Hidden on phones. Two rules live here:
// what a phone's list offers, and the warning setup gives, never a refusal, when a debris type not
// marked Reduced is added to the haul-out form.

// The forms debris types are added to.
export type DebrisTypeFormKind = 'LOAD' | 'HAUL_OUT';

// One debris type's entry on a form, as setup holds it.
export interface DebrisTypeEntry {
  readonly id: string;
  // The debris type's name in the firm's library: what a monitor picks.
  readonly name: string;
  readonly reduced: boolean;
  readonly hiddenOnPhones: boolean;
  // Taken off the form; never deleted.
  readonly archived: boolean;
}

// A warning setup shows as it saves; the record is saved either way (ADR-052, 214, 217): a debris
// type not marked Reduced on the haul-out form; a stretch between a payable type's size bands that
// falls in none (size-bands.ts); two rules that add the same transaction # on a ticket both could
// meet (rules.ts; ADR-125); a sub typed at certification whose name already has another place on
// the project (certifications.ts; ADR-321).
export interface SetupWarning {
  readonly code:
    'UNREDUCED_ON_HAUL_OUT' | 'SIZE_BAND_GAP' | 'RULES_OVERLAP' | 'SUB_PLACED_ELSEWHERE';
  readonly message: string;
}

export class DebrisTypeEntries {
  private readonly form: DebrisTypeFormKind;
  private readonly entries: readonly DebrisTypeEntry[];

  constructor(form: DebrisTypeFormKind, entries: readonly DebrisTypeEntry[]) {
    this.form = form;
    this.entries = entries;
  }

  // What a phone's list for this form offers, in setup's order: every entry still on the form and
  // not hidden on phones (ADR-214).
  onPhones(): DebrisTypeEntry[] {
    return this.entries.filter((entry) => !entry.archived && !entry.hiddenOnPhones);
  }

  // The entry a field event carries, hidden or taken off since: it keeps it (ADR-214).
  carried(id: string): DebrisTypeEntry | undefined {
    return this.entries.find((entry) => entry.id === id);
  }

  // What setup says as it saves this entry on the form. Debris leaving a TDSR is usually reduced,
  // but C&D, metals and white goods often leave as they came, so it only warns (ADR-214, agent
  // default).
  warningsFor(entry: Pick<DebrisTypeEntry, 'name' | 'reduced'>): SetupWarning[] {
    if (this.form !== 'HAUL_OUT' || entry.reduced) return [];
    return [
      {
        code: 'UNREDUCED_ON_HAUL_OUT',
        message: `${entry.name} isn't marked Reduced. Haul-outs usually carry reduced debris; saved as it is.`,
      },
    ];
  }
}
