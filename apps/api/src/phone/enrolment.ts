// A phone enrolled under the firm's master passcode (ARCHITECTURE §6, Abuse; §7.1, §7.4, §7.5;
// spec/acceptance/02-people-and-devices.md AC-02-15, 16, 18; spec/acceptance/10-api-and-sync.md
// AC-10-22, 44; spec/THREAT-MODEL.md §5 (4); BACKLOG C45, C88, C110; ADR-106, 240, 401,
// 436…439). NIST SP 800-63B-4 §3.1.1.2, §3.1.6, §3.2.2; OWASP ASVS 5.0 6.1.1, 6.3.1.
//
// - **Nobody is signed in.** The passcode opens enrolment, and whoever holds it is not known:
//   every write here is stated as the master passcode's own actor, for a phone (ADR-438), never
//   as an admin or a monitor who may not have done it.
// - **The passcode is checked by the one check every act under it shares**
//   (master-passcode-check.ts): against the version in force, wrong tries counted there by
//   sign-in's rule and numbers, each a security event, the lock told to every admin.
// - **The server keeps the public half of the phone's key only**, written one way
//   (`DeviceKeys.kept`), and never what was sent. One key, one phone: a key already held is the
//   database's refusal.
// - **A right use is a security event** (`MASTER_PASSCODE_USE`) naming the phone, written with
//   the phone in the same piece of work.
import { underMasterPasscode, type Database, type Prisma } from '@open-adms/db';

import type { Clock } from '../setup/setup-service.ts';
import type { DeviceKeys } from './device-keys.ts';
import type { MasterPasscodeCheck, PasscodeRefused } from './master-passcode-check.ts';

type Tx = Prisma.TransactionClient;

// Why an enrolment was refused: for the server's log only, but for the key. A caller is never
// told which of the passcode's four it was.
export type EnrolmentRefused = PasscodeRefused | 'KEY_REFUSED';

export type EnrolmentOutcome =
  | { readonly enrolled: true; readonly deviceId: string; readonly masterPasscodeVersion: number }
  | { readonly enrolled: false; readonly why: EnrolmentRefused };

export interface PhoneToEnrol {
  // What the dispatch board will call it.
  readonly name: string;
  readonly passcode: string;
  // As the phone sent it: base64 SubjectPublicKeyInfo.
  readonly publicKey: string;
}

export interface EnrolmentParts {
  // The passcode's check, shared by every act under it (master-passcode-check.ts).
  readonly passcode: MasterPasscodeCheck;
  readonly keys: DeviceKeys;
  readonly clock: Clock;
}

export class Enrolment {
  private readonly db: Database;
  private readonly parts: EnrolmentParts;

  constructor(db: Database, parts: EnrolmentParts) {
    this.db = db;
    this.parts = parts;
  }

  async enrol(phone: PhoneToEnrol): Promise<EnrolmentOutcome> {
    const { passcode, keys, clock } = this.parts;
    const now = clock.now();
    const checked = await passcode.check(phone.passcode, now);
    if (!checked.taken) return { enrolled: false, why: checked.why };
    const publicKey = keys.kept(phone.publicKey);
    if (publicKey === undefined) return { enrolled: false, why: 'KEY_REFUSED' };
    // The phone's id is made first, so that every record of this piece of work says which
    // phone it was done on.
    const deviceId = await this.db.$read((tx) => this.newId(tx));
    await this.db.$write(underMasterPasscode(deviceId), async (tx) => {
      await tx.device.create({
        data: {
          id: deviceId,
          name: phone.name,
          publicKey,
          masterPasscodeVersion: checked.version,
          enrolledAt: now,
        },
      });
      // A right passcode starts the count again, and its use is a security event.
      await passcode.used(tx, checked, now, { deviceId });
    });
    return { enrolled: true, deviceId, masterPasscodeVersion: checked.version };
  }

  // An id as the database makes them, in time order.
  private async newId(tx: Tx): Promise<string> {
    const [made] = await tx.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS id`;
    if (made === undefined) throw new Error('The database made no id.');
    return made.id;
  }
}
