// What a phone being set up under the firm's master passcode picks from, with a connection and
// nobody signed in (ARCHITECTURE §7.1 steps 1, 2; §7.5; adms-field-app §4A.0 (5); AC-02-38;
// BACKLOG 2.5.4, C113, C124; ADR-106, 240, 462 (4)(f), 463). OWASP ASVS 5.0 8.2.1, 8.2.2,
// 14.2.6, 16.3.1; API Security Top 10 (2023) API1…API5.
//
// - **Two things open it: the phone and the passcode.** The call comes from an enrolled phone
//   that has proved itself with its device key, and carries the master passcode, checked by the
//   one check every act under it shares (master-passcode-check.ts). A phone's proof alone would
//   list the firm's projects and monitors to whoever holds a lost phone, whose key stands until
//   it is revoked.
// - **The passcode covers every project** (ADR-106), so whoever holds it may read any open
//   one's sites and unit rate pay items: nothing here is one monitor's or one assignment's.
// - **The least a setup picks from** (ASVS 14.2.6): a project's name and time zone; a site and
//   a unit rate pay item as a phone's lists show one (setup-versions.ts), those in service
//   only; a monitor's id, Monitor ID and name. Never a rate, a rule or a load's pay item
//   (invariant 20); never a password, a phone number or a role.
// - **A bounded answer**: the monitors a bounded number a call, in the order they were created,
//   asked on from the last one's id.
// - **One thing is written: the use of the passcode**, a security event naming the phone,
//   in the piece of work that reads, so nothing is answered that wasn't recorded.
// - **A phone in service.** One out of service is told so before the passcode is touched.
// - A project that is closed or is none is answered no lists and no refusal: the phone is told
//   the open ones again and picks from them.
import { underMasterPasscode, type Database } from '@open-adms/db';

import type { Clock } from '../setup/setup-service.ts';
import { SetupVersions, type SetupShown } from '../setup/setup-versions.ts';
import type { MasterPasscodeCheck, PasscodeRefused } from './master-passcode-check.ts';
import type { OpeningPhone } from './passcode-sessions.ts';

export interface SetupChoicesRead {
  readonly read: true;
  readonly projects: readonly {
    readonly id: string;
    readonly name: string;
    readonly timeZone: string;
  }[];
  readonly project: {
    readonly id: string;
    readonly sites: SetupShown['sites'];
    readonly payItems: SetupShown['payItems'];
  } | null;
  readonly monitors: readonly {
    readonly monitorId: string;
    readonly monitorNumber: string;
    readonly name: string;
  }[];
  // The last monitor's id where there are more to ask for.
  readonly moreMonitorsAfter: string | null;
}

export type SetupChoicesOutcome =
  | SetupChoicesRead
  | {
      readonly read: false;
      // The passcode's four are for the server's log only: a caller is never told which.
      readonly why: PasscodeRefused | 'PHONE_OUT_OF_SERVICE';
    };

export interface SetupChoicesAsked {
  readonly passcode: string;
  readonly projectId: string | null;
  readonly monitorsAfter: string | null;
}

export interface SetupChoicesParts {
  readonly passcode: MasterPasscodeCheck;
  readonly clock: Clock;
  // How many monitors one answer holds at most: the contracts' number.
  readonly monitorsAtMost: number;
}

export class SetupChoices {
  private readonly db: Database;
  private readonly parts: SetupChoicesParts;

  constructor(db: Database, parts: SetupChoicesParts) {
    this.db = db;
    this.parts = parts;
  }

  async read(phone: OpeningPhone, asked: SetupChoicesAsked): Promise<SetupChoicesOutcome> {
    const { passcode, clock, monitorsAtMost } = this.parts;
    // Before the passcode is touched: a phone out of service never spends its count.
    if (phone.status !== 'ACTIVE') return { read: false, why: 'PHONE_OUT_OF_SERVICE' };
    const now = clock.now();
    const checked = await passcode.check(asked.passcode, now, phone.deviceId);
    if (!checked.taken) return { read: false, why: checked.why };
    return this.db.$write(underMasterPasscode(phone.deviceId), async (tx) => {
      // A right passcode starts the count again, and its use is a security event.
      await passcode.used(tx, checked, now, { deviceId: phone.deviceId });
      const projects = await tx.project.findMany({
        where: { closedAt: null },
        select: { id: true, name: true, timeZone: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      // Only an open project's lists are read: a closed one is set up on no phone.
      const picked = projects.find((project) => project.id === asked.projectId);
      const project =
        picked === undefined
          ? null
          : {
              id: picked.id,
              sites: await SetupVersions.sitesShownIn(tx, picked.id),
              payItems: await SetupVersions.payItemsShownIn(tx, picked.id, 'IN_SERVICE'),
            };
      // One more than an answer holds, to know whether there are more.
      const people = await tx.user.findMany({
        where: {
          role: 'MONITOR',
          archivedAt: null,
          monitorNumber: { not: null },
          ...(asked.monitorsAfter === null ? {} : { id: { gt: asked.monitorsAfter } }),
        },
        select: { id: true, name: true, monitorNumber: true },
        orderBy: { id: 'asc' },
        take: monitorsAtMost + 1,
      });
      const monitors = people
        .slice(0, monitorsAtMost)
        .flatMap((person) =>
          person.monitorNumber === null
            ? []
            : [{ monitorId: person.id, monitorNumber: person.monitorNumber, name: person.name }],
        );
      return {
        read: true as const,
        projects,
        project,
        monitors,
        moreMonitorsAfter:
          people.length > monitorsAtMost ? (monitors.at(-1)?.monitorId ?? null) : null,
      };
    });
  }
}
