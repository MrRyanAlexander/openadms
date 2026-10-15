// A phone turned in: "Sync and turn in" under the firm's master passcode (ARCHITECTURE §7.4, §7.5,
// §8; spec/acceptance/02-people-and-devices.md AC-02-58, 60, 61; spec/acceptance/05-sync.md
// AC-05-56; spec/acceptance/10-api-and-sync.md AC-10-22, 46; spec/THREAT-MODEL.md T-02, T-11;
// BACKLOG 2.6.5, C47, C64, C126, C139; ADR-065, 096, 134, 438, 468, 487, 488; REQ-202a, 202b,
// 209). NIST SP 800-63B's authenticator lifecycle (a lost or retired authenticator invalidated
// promptly); OWASP ASVS 5.0 V6, V16.3; API Security Top 10 API1, API2, API6.
//
// - **Two things open it: the phone and the passcode.** The call comes from an enrolled phone
//   that has proved itself with its device key, in service or not (a lost phone that turns up is
//   turned in like any other, ADR-134), and carries the master passcode, checked by the one
//   check every act under it shares: a wrong one counts as at enrolment.
// - **Nothing is wiped before the server has it** (ADR-096). The phone says everything it still
//   holds; only what that same phone sent counts, so no phone confirms another's work (API1).
//   A record is on the server when it was saved or kept in quarantine (the ledger), or held for
//   a person, not saved (ADR-468 (2)); a photograph when it was saved and every file of it is
//   kept. Anything else is named back, and nothing is changed but the passcode's use, logged.
// - **Then, in one piece of work, as the master passcode's actor on that phone:** the use and
//   the turn-in are security events; each series' blocks end (the domain's `TurnInRules`: the
//   unused rest handed back where the phone reports its last number, retired whole where it
//   doesn't or the phone is marked lost); a phone in service is taken out of service as retired
//   from now; every session on it ends; and its key is revoked. The database lets nobody else
//   revoke a key, refuses it while a block is still issued, and keeps a turned-in phone as it
//   was turned in. The answer tells the phone to wipe.
// - **The key is revoked when the wipe is ordered, not after it is done** (ADR-488): the server
//   can't see a wipe, and a phone's word that it wiped proves nothing; a key left standing until
//   a phone that may never call again says so is a key standing for good. Nothing else revokes a
//   key, so a phone refused for its key after asking to be turned in was turned in.
import { underMasterPasscode, type Database, type DeviceStatus, type Prisma } from '@open-adms/db';
import type { TurnInRules } from '@open-adms/domain';
import type { TurnInAnswer, TurnInHolds, TurnInReceived } from '@open-adms/contracts';

import { NumberAllocator, type SeriesTurnedIn } from '../numbering/number-allocator.ts';
import { Refusal } from '../process/refusal.ts';
import type { Clock } from '../setup/setup-service.ts';
import type { MasterPasscodeCheck, PasscodeRefused } from './master-passcode-check.ts';

type Tx = Prisma.TransactionClient;

// The phone the call came from, as its proof's token read it now.
export interface TurningInPhone {
  readonly deviceId: string;
  readonly status: DeviceStatus;
}

export type TurnInOutcome =
  // The passcode's four are for the server's log only: a caller is never told which.
  | { readonly checked: false; readonly why: PasscodeRefused }
  | { readonly checked: true; readonly turnedIn: true; readonly numbers: SeriesTurnedIn[] }
  | {
      readonly checked: true;
      readonly turnedIn: false;
      readonly message: string;
      readonly notOnTheServer: TurnInHolds;
    };

export interface TurnInsParts {
  readonly passcode: MasterPasscodeCheck;
  readonly rules: TurnInRules;
  readonly clock: Clock;
  // The request the work now running is for, if any.
  readonly requestNow: () => string | undefined;
}

// What the phone is answered, for a turn-in whose passcode was taken: the endpoint's answer and
// the harness's alike.
export function turnInAnswerOf(
  outcome: Extract<TurnInOutcome, { readonly checked: true }>,
): TurnInAnswer {
  if (!outcome.turnedIn) {
    return {
      turnedIn: false,
      wipe: false,
      message: outcome.message,
      notOnTheServer: outcome.notOnTheServer,
    };
  }
  return {
    turnedIn: true,
    wipe: true,
    numbers: outcome.numbers.map(({ projectId, series, ended, blocks }) => ({
      projectId,
      series,
      ended,
      blocks: blocks.map(({ firstNumber, lastNumber, lastUsedNumber }) => ({
        firstNumber,
        lastNumber,
        lastUsedNumber,
      })),
    })),
  };
}

const nothingMissing = (missing: TurnInHolds): boolean =>
  Object.values(missing).every((named: readonly string[]) => named.length === 0);

export class TurnIns {
  private readonly db: Database;
  private readonly parts: TurnInsParts;

  constructor(db: Database, parts: TurnInsParts) {
    this.db = db;
    this.parts = parts;
  }

  async turnIn(phone: TurningInPhone, sent: TurnInReceived): Promise<TurnInOutcome> {
    const { passcode, rules, clock } = this.parts;
    const now = clock.now();
    const checked = await passcode.check(sent.passcode, now, phone.deviceId);
    if (!checked.taken) return { checked: false, why: checked.why };
    const { deviceId } = phone;
    const missing = await this.db.$read((tx) => TurnIns.notOnTheServer(tx, deviceId, sent.holds));
    if (!nothingMissing(missing)) {
      // The passcode was used all the same: a right use starts the count again, and is logged.
      await this.db.$write(underMasterPasscode(deviceId), (tx) =>
        passcode.used(tx, checked, now, { deviceId }),
      );
      const files = missing.photos.length;
      const records = Object.values(missing).flat().length - files;
      return {
        checked: true,
        turnedIn: false,
        message: rules.notConfirmed({ records, files }),
        notOnTheServer: missing,
      };
    }
    const numbers = await this.db.$write(underMasterPasscode(deviceId), async (tx) => {
      // The phone's row first, held for the rest of this piece of work (ADR-524): a block cut
      // for the phone at the same moment went through before it, and is ended below, or is
      // refused after it, its key revoked; a second turn-in of the phone at the same moment
      // waits here, and finds it turned in.
      await tx.$queryRaw`SELECT "id" FROM "device" WHERE "id" = ${deviceId}::uuid FOR UPDATE`;
      const device = await tx.device.findUniqueOrThrow({
        where: { id: deviceId },
        select: { status: true, keyRevokedAt: true },
      });
      // Turned in already: its key is revoked, so it is proven no more (ARCHITECTURE §7.4).
      if (device.keyRevokedAt !== null) throw new Refusal('PHONE_NOT_PROVEN', 401);
      await passcode.used(tx, checked, now, { deviceId });
      const ended = await NumberAllocator.turnedIn(
        tx,
        deviceId,
        sent.lastUsed,
        (reported) => rules.blocksEnd(device, reported),
        now,
      );
      // Once: the row is held, so nothing has revoked the key since it was read (and the
      // database refuses a key revoked twice).
      await tx.device.update({
        where: { id: deviceId },
        data: {
          keyRevokedAt: now,
          ...(device.status === 'ACTIVE' ? { status: 'RETIRED', outOfServiceAt: now } : {}),
        },
        select: { id: true },
      });
      await tx.session.updateMany({
        where: { deviceId, revokedAt: null },
        data: { revokedAt: now },
      });
      const requestId = this.parts.requestNow();
      await tx.securityEvent.create({
        data: {
          kind: 'DEVICE_TURN_IN',
          occurredAt: now,
          deviceId,
          ...(requestId ? { requestId } : {}),
        },
      });
      return ended;
    });
    return { checked: true, turnedIn: true, numbers };
  }

  // What the server doesn't have, from this phone, of what the phone says it holds.
  private static async notOnTheServer(
    tx: Tx,
    deviceId: string,
    holds: TurnInHolds,
  ): Promise<TurnInHolds> {
    const lacking = (named: readonly string[], found: readonly { id: string }[]) => {
      const there = new Set(found.map(({ id }) => id));
      return named.filter((one) => !there.has(one));
    };
    const assignments = await tx.assignment.findMany({
      where: { id: { in: [...holds.unplannedAssignments] }, deviceId, origin: 'UNPLANNED' },
      select: { id: true },
    });
    // A use the phone logged is kept as security events, the first under the use's own id.
    const uses = await tx.securityEvent.findMany({
      where: { id: { in: [...holds.passcodeUses] }, deviceId },
      select: { id: true },
    });
    const stored = await tx.syncedRecord.findMany({
      where: { recordId: { in: [...holds.records] }, deviceId, recordKind: { not: 'PHOTO' } },
      select: { recordId: true },
    });
    const heldById = await tx.heldRecord.findMany({
      where: { sentId: { in: [...holds.records] }, deviceId },
      select: { sentId: true },
    });
    const heldByPrint = await tx.heldRecord.findMany({
      where: { sentSha256: { in: [...holds.held] }, deviceId },
      select: { sentSha256: true },
    });
    const photos = await tx.photo.findMany({
      where: { id: { in: [...holds.photos] }, deviceId },
      select: { id: true, uploadedAt: true, depthObjectKey: true, depthUploadedAt: true },
    });
    return {
      unplannedAssignments: lacking(holds.unplannedAssignments, assignments),
      passcodeUses: lacking(holds.passcodeUses, uses),
      records: lacking(holds.records, [
        ...stored.map(({ recordId }) => ({ id: recordId })),
        ...heldById.flatMap(({ sentId }) => (sentId === null ? [] : [{ id: sentId }])),
      ]),
      held: lacking(
        holds.held,
        heldByPrint.map(({ sentSha256 }) => ({ id: sentSha256 })),
      ),
      photos: lacking(
        holds.photos,
        photos.filter(
          (photo) =>
            photo.uploadedAt !== null &&
            (photo.depthObjectKey === null || photo.depthUploadedAt !== null),
        ),
      ),
    };
  }
}
