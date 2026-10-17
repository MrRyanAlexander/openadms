// Who a phone's field event names, asked as it arrives (spec/FLAGS.md §3.13; spec/THREAT-MODEL.md
// T-13; spec/acceptance/05-sync.md point 11; AC-10-110; ADR-540, 543; the Phase 2 audit's F4).
//
// A phone sends a field event as the monitor it names, and it is saved as sent: a phone that
// changed hands carries an earlier monitor's records honestly, and sync refuses nothing over
// eligibility (ADR-052). But "a real actor" (invariant 3) means the name is checked against what
// the server knows of that phone: the sessions opened there, and the assignments that name it. So
// the API asks, once, as the record arrives, whether the person it names held the phone then:
//
// - they had a session on that phone (their own sign-in, online or offline, or one opened under
//   the master passcode for them) begun before its field time ended and not ended before it
//   started (signed out, ended by another's sign-in on the phone, a password set anew, a
//   turn-in): a session past its hours alone still says who held the phone, since nobody else
//   signed in on it since (a phone keeps working offline past them); or
// - the phone was set up for them under the master passcode: the record names an unplanned
//   assignment of theirs on that phone, which is never flagged (ADR-540); or
// - the record names an assignment the board gave them on that very phone, and nobody else held
//   the phone over its field time: the dispatcher's plan says whose the phone was.
//
// The field time is the phone's clock: it is read in the server's by the sync's own difference
// between the two, with the device clock's allowance (`DEVICE_CLOCK_OFF_LIMIT_MINUTES`) either
// side; a sign-in made offline is dated by the same phone's clock. The answer is kept with the
// sync's ledger row and the worker flags from it (`MONITOR_NOT_SIGNED_IN`); nothing is refused.
import type { Prisma } from '@open-adms/db';

type Tx = Prisma.TransactionClient;

export interface NamedOnAPhone {
  readonly monitorId: string;
  readonly deviceId: string;
  readonly assignmentId: string | null;
  readonly startedAt: Date;
  readonly endedAt: Date;
}

export async function signedInThere(
  tx: Tx,
  record: NamedOnAPhone,
  syncId: string,
  allowanceMinutes: number,
): Promise<boolean> {
  const { clockDifferenceSeconds } = await tx.sync.findUniqueOrThrow({
    where: { id: syncId },
    select: { clockDifferenceSeconds: true },
  });
  const allowance = allowanceMinutes * 60_000;
  // The phone's clock, ahead of the server's by the sync's difference.
  const ahead = Number(clockDifferenceSeconds) * 1000;
  const [start, end] =
    record.endedAt.getTime() < record.startedAt.getTime()
      ? [record.endedAt, record.startedAt]
      : [record.startedAt, record.endedAt];
  const fromOnPhone = new Date(start.getTime() - allowance);
  const toOnPhone = new Date(end.getTime() + allowance);
  const from = new Date(fromOnPhone.getTime() - ahead);
  const to = new Date(toOnPhone.getTime() - ahead);
  // The sessions on the phone over the field time: begun before it ended (a sign-in made
  // offline by the phone's clock, any other by the server's), and not ended before it started.
  const heldThen = (who: Prisma.SessionWhereInput): Prisma.SessionWhereInput => ({
    ...who,
    deviceId: record.deviceId,
    OR: [{ signedInAt: null, createdAt: { lte: to } }, { signedInAt: { lte: toOnPhone } }],
    AND: [{ OR: [{ revokedAt: null }, { revokedAt: { gte: from } }] }],
  });
  if ((await tx.session.count({ where: heldThen({ userId: record.monitorId }) })) > 0) return true;
  if (record.assignmentId === null) return false;
  const assignment = await tx.assignment.findUnique({
    where: { id: record.assignmentId },
    select: { origin: true, personId: true, deviceId: true },
  });
  if (assignment?.personId !== record.monitorId || assignment.deviceId !== record.deviceId) {
    return false;
  }
  if (assignment.origin === 'UNPLANNED') return true;
  return (await tx.session.count({ where: heldThen({ userId: { not: record.monitorId } }) })) === 0;
}
