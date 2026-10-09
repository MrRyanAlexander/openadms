// A field monitor created on a phone, online, under the firm's master passcode (ARCHITECTURE
// §6, Abuse; §7.0, §7.5; spec/acceptance/02-people-and-devices.md AC-02-07;
// spec/acceptance/10-api-and-sync.md AC-10-22, 32; spec/THREAT-MODEL.md §5 (4); BACKLOG 2.5.2,
// C111, C112; ADR-105, 120, 402 (5), 438, 441, 442). NIST SP 800-63B-4 §3.1.1.2, §3.2.2; OWASP
// ASVS 5.0 6.1.1, 6.1.3, 6.3.1.
//
// - **Two things open it: the phone and the passcode.** The call comes from an enrolled phone
//   that has proved itself with its device key, and carries the master passcode. Nobody is
//   signed in, and whoever holds the passcode is not known: every write here is stated as the
//   master passcode's own actor, on that phone (ADR-438). The monitor is who the records are
//   about, never who made them.
// - **A phone in service only.** One taken out of service as lost or retired still proves
//   itself, to hand over its work (ADR-134); it makes no new person.
// - **The passcode is checked by the one check every act under it shares**
//   (master-passcode-check.ts): a wrong one here counts on the same record as a wrong one at
//   enrolment, and a passcode that waits or is locked is refused here too.
// - **The Monitor ID is the database's** (ADR-120, 281): the next of its one series, never
//   typed. It is the monitor's username.
// - **The password is the firm's practice** (ADR-105): exempt from the length, the breached
//   list and the words (the domain's `PasswordRules`, ADR-402 (5)), never empty, and kept only
//   as the same slow hash as anybody's. Whoever typed it knows it, and that is the practice:
//   it is not marked to be changed.
// - **A right use is a security event** (`MASTER_PASSCODE_USE`) naming the phone and the
//   monitor, written with the monitor in the same piece of work.
import { underMasterPasscode, type Database, type DeviceStatus } from '@open-adms/db';
import type { PasswordProblemCode, PasswordRules } from '@open-adms/domain';

import type { Clock } from '../setup/setup-service.ts';
import type { PasswordHasher } from '../sign-in/password-hasher.ts';
import type { MasterPasscodeCheck, PasscodeRefused } from './master-passcode-check.ts';

// Why no monitor was created. The passcode's four are for the server's log only: a caller is
// never told which. The other two are told apart, the second only to somebody who holds the
// passcode.
export type MonitorNotCreated =
  | { readonly created: false; readonly why: PasscodeRefused | 'PHONE_OUT_OF_SERVICE' }
  | {
      readonly created: false;
      readonly why: 'PASSWORD_REFUSED';
      readonly code: PasswordProblemCode;
      readonly message: string;
    };

export type MonitorOutcome =
  | {
      readonly created: true;
      readonly userId: string;
      readonly monitorNumber: string;
      readonly name: string;
    }
  | MonitorNotCreated;

export interface MonitorToCreate {
  readonly name: string;
  readonly password: string;
  // The firm's contact number for them, if it was given: read by admins only (ADR-169).
  readonly phone?: string | undefined;
  readonly passcode: string;
}

// The phone the call came from, as its proof's token read it now.
export interface CreatingPhone {
  readonly deviceId: string;
  readonly status: DeviceStatus;
}

export interface PhoneMonitorsParts {
  readonly passcode: MasterPasscodeCheck;
  readonly rules: PasswordRules;
  readonly hasher: PasswordHasher;
  readonly clock: Clock;
}

export class PhoneMonitors {
  private readonly db: Database;
  private readonly parts: PhoneMonitorsParts;

  constructor(db: Database, parts: PhoneMonitorsParts) {
    this.db = db;
    this.parts = parts;
  }

  async create(phone: CreatingPhone, monitor: MonitorToCreate): Promise<MonitorOutcome> {
    const { passcode, rules, hasher, clock } = this.parts;
    // Before the passcode is touched: a phone out of service never spends its count.
    if (phone.status !== 'ACTIVE') return { created: false, why: 'PHONE_OUT_OF_SERVICE' };
    const now = clock.now();
    const checked = await passcode.check(monitor.passcode, now, phone.deviceId);
    if (!checked.taken) return { created: false, why: checked.why };
    const problem = rules.problem(monitor.password, { monitor: true, words: [] });
    if (problem !== undefined) {
      return {
        created: false,
        why: 'PASSWORD_REFUSED',
        code: problem.code,
        message: problem.message,
      };
    }
    const passwordHash = await hasher.hash(monitor.password);
    return this.db.$write(underMasterPasscode(phone.deviceId), async (tx) => {
      const made = await tx.user.create({
        data: {
          name: monitor.name,
          role: 'MONITOR',
          ...(monitor.phone === undefined ? {} : { phone: monitor.phone }),
        },
        select: { id: true, name: true, monitorNumber: true },
      });
      if (made.monitorNumber === null) throw new Error('The database issued no Monitor ID.');
      await tx.userCredential.create({ data: { userId: made.id, passwordHash } });
      // A right passcode starts the count again, and its use is a security event.
      await passcode.used(tx, checked, now, { deviceId: phone.deviceId, userId: made.id });
      return {
        created: true as const,
        userId: made.id,
        monitorNumber: made.monitorNumber,
        name: made.name,
      };
    });
  }
}
