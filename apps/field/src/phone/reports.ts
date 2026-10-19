// What the phone reports besides its records (ARCHITECTURE §7.5, §9 (3), (4); adms-field-app
// §4A.0 (5), (7); BACKLOG 3.3.1, C122; ADR-106, 456, 457, 464, 531, 576): the unplanned assignments
// set up on it under the master passcode, and the uses of the passcode it checked itself. Each is
// made with an id of the phone's own, its clock and its clock's offset, **never the passcode**
// (AC-11-23), and kept on the store's `keptAnswers` shelf **until the server answers it saved or
// already saved** (AC-11-25); answered not saved, it is kept, marked with the server's reason, and
// sent again only by the sync, which shows it (3.4.1).
//
// **Sent before anything else of the monitor's** (AC-11-25): `MonitorOnPhone` hands its session
// here ahead of every request, so an assignment set up offline reaches the server before the
// lists that take it and any record made under it; the master user setting the phone up online
// sends them at once (`PhoneSetup`). The unplanned assignments go first, in the order made, then
// the uses. The sync's own payload carries what is held here (task 3.4.1).
//
// **Which uses are kept** (*agent default*, ADR-576): those the phone checked against its own
// check of the passcode: the sign-in screen unlocked, and a wrong try. What the server checked
// itself (enrolment, a monitor created, what a setup picks from, a proof with the passcode) the
// server logged as it happened; a setup is its unplanned assignment's report.
import {
  passcodeUseReportSchema,
  reportPasscodeUseEndpoint,
  reportUnplannedAssignmentEndpoint,
  unplannedAssignmentReportSchema,
  type PasscodeUseReport,
  type UnplannedAssignmentReport,
} from '@open-adms/contracts';
import { uuidv7, type LoggedPasscodeUse } from '@open-adms/domain';

import type { NotAnswered, Sender } from '../server.ts';
import type { Change, Json, PhoneStore } from '../store/phone-store.ts';

const shelf = 'keptAnswers';
const unplannedPrefix = 'unplannedAssignment:';
const usePrefix = 'passcodeUse:';

// A report held, and the server's reason where it answered it not saved.
export interface HeldReport<R> {
  readonly report: R;
  readonly notSaved: string | null;
}

// Where a report stands: gone from the phone (the server has it), held and answered not saved, or
// held and not yet answered.
export type ReportStanding = 'saved' | 'notSaved' | 'held';

// ADR-100: how far the phone's clock stands from UTC, in minutes.
export const offsetOf = (moment: Date): number => 0 - moment.getTimezoneOffset();

export class PhoneReports {
  private readonly store: PhoneStore;
  private readonly now: () => Date;
  // A send under way: requests at once wait on it, never each sending the same report.
  private sending: Promise<NotAnswered | undefined> | undefined;

  constructor(store: PhoneStore, now = () => new Date()) {
    this.store = store;
    this.now = now;
  }

  async keepUnplanned(report: UnplannedAssignmentReport): Promise<void> {
    const held: HeldReport<UnplannedAssignmentReport> = { report, notSaved: null };
    await this.store.change([
      { shelf, id: `${unplannedPrefix}${report.id}`, value: held as unknown as Json },
    ]);
  }

  // A use of the passcode the phone checked itself, logged now by its clock: for a monitor, or
  // nobody (an unlock, a wrong try).
  async keepUse(use: LoggedPasscodeUse, personId: string | null): Promise<PasscodeUseReport> {
    const loggedAt = this.now();
    const report: PasscodeUseReport = {
      id: uuidv7(loggedAt),
      use,
      personId,
      loggedAt: loggedAt.toISOString(),
      deviceUtcOffsetMinutes: offsetOf(loggedAt),
    };
    const held: HeldReport<PasscodeUseReport> = { report, notSaved: null };
    await this.store.change([
      { shelf, id: `${usePrefix}${report.id}`, value: held as unknown as Json },
    ]);
    return report;
  }

  // A use already logged, kept as it was (a phone's record handed in whole, as the sync contract's
  // suite hands one).
  async keepUseReport(report: PasscodeUseReport): Promise<void> {
    const held: HeldReport<PasscodeUseReport> = { report, notSaved: null };
    await this.store.change([
      { shelf, id: `${usePrefix}${report.id}`, value: held as unknown as Json },
    ]);
  }

  // Everything held, each with where it stands, oldest first: what the sync carries (those not
  // yet answered) and shows (those answered not saved).
  async kept(): Promise<{
    readonly unplannedAssignments: HeldReport<UnplannedAssignmentReport>[];
    readonly passcodeUses: HeldReport<PasscodeUseReport>[];
  }> {
    const [unplannedAssignments, passcodeUses] = await Promise.all([this.unplanned(), this.uses()]);
    return { unplannedAssignments, passcodeUses };
  }

  // What keeping a report's answer changes in the store: "saved" or "already saved" drops it, "not
  // saved" keeps it with the reason.
  static answeredChange(
    report: UnplannedAssignmentReport | PasscodeUseReport,
    kind: 'unplannedAssignment' | 'passcodeUse',
    answer: { readonly answer: string; readonly reason: string | null },
  ): Change {
    const id = `${kind === 'unplannedAssignment' ? unplannedPrefix : usePrefix}${report.id}`;
    if (answer.answer !== 'NOT_SAVED') return { shelf, id, dropped: true };
    const held = { report, notSaved: answer.reason ?? 'NOT_SAVED' };
    return { shelf, id, value: held as unknown as Json };
  }

  // Everything held, each by when it was made.
  async held(): Promise<{
    readonly unplannedAssignments: UnplannedAssignmentReport[];
    readonly passcodeUses: PasscodeUseReport[];
  }> {
    const [unplanned, uses] = await Promise.all([this.unplanned(), this.uses()]);
    return {
      unplannedAssignments: unplanned.map(({ report }) => report),
      passcodeUses: uses.map(({ report }) => report),
    };
  }

  async standing(id: string): Promise<ReportStanding> {
    const held = [...(await this.unplanned()), ...(await this.uses())].find(
      ({ report }) => report.id === id,
    );
    if (held === undefined) return 'saved';
    return held.notSaved === null ? 'held' : 'notSaved';
  }

  // Each report not yet answered, sent by whoever is signed in: the server's "saved" or "already
  // saved" drops it, "not saved" keeps it with the reason. A reply that is no answer stops the
  // sending and is handed back; what wasn't sent waits for the next time.
  sent(send: Sender): Promise<NotAnswered | undefined> {
    this.sending ??= this.sentNow(send).finally(() => {
      this.sending = undefined;
    });
    return this.sending;
  }

  private async sentNow(send: Sender): Promise<NotAnswered | undefined> {
    for (const { report, notSaved } of await this.unplanned()) {
      if (notSaved !== null) continue;
      const reply = await send(reportUnplannedAssignmentEndpoint, { json: report });
      if (reply.kind !== 'answered') return reply;
      await this.store.change([
        PhoneReports.answeredChange(report, 'unplannedAssignment', reply.answer),
      ]);
    }
    for (const { report, notSaved } of await this.uses()) {
      if (notSaved !== null) continue;
      const reply = await send(reportPasscodeUseEndpoint, { json: report });
      if (reply.kind !== 'answered') return reply;
      await this.store.change([PhoneReports.answeredChange(report, 'passcodeUse', reply.answer)]);
    }
    return undefined;
  }

  private unplanned(): Promise<HeldReport<UnplannedAssignmentReport>[]> {
    return this.read(unplannedPrefix, (report) =>
      unplannedAssignmentReportSchema.safeParse(report),
    );
  }

  private uses(): Promise<HeldReport<PasscodeUseReport>[]> {
    return this.read(usePrefix, (report) => passcodeUseReportSchema.safeParse(report));
  }

  // What is held under a prefix, each read back by the contracts' own schema, oldest first (an id
  // the phone made is a UUIDv7, which sorts by the millisecond it was made; two made in the same
  // one, in either order).
  private async read<R extends { readonly id: string }>(
    prefix: string,
    parse: (report: unknown) => { success: true; data: R } | { success: false },
  ): Promise<HeldReport<R>[]> {
    const kept = await this.store.readAll(shelf);
    return kept
      .flatMap(({ id, value }) => {
        if (!id.startsWith(prefix) || typeof value !== 'object' || value === null) return [];
        const { report, notSaved } = value as { report?: unknown; notSaved?: unknown };
        const read = parse(report);
        return read.success
          ? [{ report: read.data, notSaved: typeof notSaved === 'string' ? notSaved : null }]
          : [];
      })
      .sort((one, other) => one.report.id.localeCompare(other.report.id));
  }
}
