// Part 3, certifying containers and crews (spec/parts/03-certification.md; adms-certifications;
// spec/DATA-MODEL.md §3 "Certifications"; ADR-015, 045, 076, 079, 082, 108, 294, 321, 328).
//
// `certify` is what a monitor's phone sends when a truck or a crew is certified: one piece of work,
// written as that monitor, from that phone. Nobody types a capacity: it is what the measured boxes
// work out to (packages/domain's Capacity), and measurements that give none are refused in plain
// words, with nothing saved. The monitor picks the prime and types the subs; each sub gets its
// place on the project in the same piece of work (SubPlaces, beside ContractorSetup.addPrime).
//
// The later changes are the back office's: a measuring mistake corrected in place (the capacity
// worked out again), a box's shape, sign or feature, a box added or taken off, the rest of what
// was keyed (its driver, tag, vehicle type, prime and subs), signatures on file, a revocation
// from a date and one taken back (ADR-534). A modified truck is certified again, naming the
// certification it replaces. **A sheet whose phone failed is entered in the back office**
// (ADR-521, 534 (1)): as the person who entered it, with a reason, naming the monitor who
// certified it and the sheet's number; it then reconciles as one made on a phone. A certification is never copied: a truck
// that works another project is certified there from scratch (ADR-328, 329). Nothing is deleted.
// A certification's number is the phone's: the next of its block of the project's cert-number
// series, or the pre-printed sheet's, as written (ADR-323).
//
// Who may do each of the back office's is asked here, inside the change's own piece of work and
// before anything is changed, whatever the door already asked (ADR-364, 433): only an admin
// revokes (AC-03-55); signatures on file are marked at QC, by an admin or a manager/analyst who
// holds QC (ADR-080); a measuring mistake is a reviewer's correction (`Corrections.certification`,
// which takes correct and works through `measured`). Whether a monitor's assignment includes
// certifying is flagged, never refused.
//
// Each change that moves a ticket queues its job in its own piece of work (ADR-420): a
// certification made after a field event scanned its number is linked to that field event and
// the tickets that scanned it are queued (AC-06-36; BACKLOG C62, C83); a corrected measurement
// and a revocation queue every ticket on the number, and, with them, the tickets that share a
// scale receipt with one (a weight two containers share is split by certified capacity).
import type { Actor, Certification, CertificationBox, Prisma } from '@open-adms/db';
import {
  type BoxShape,
  type BoxSign,
  Capacity,
  CertificationChanges,
  type CertificationKind,
  type MeasuredBox,
  PickedReason,
} from '@open-adms/domain';

import type { WorkQueued } from '../jobs/work-queue.ts';
import { type Brought, ledgerRow } from '../sync/ledger.ts';
import type { SentCertification } from '../sync/sent.ts';
import { ReviewService } from '../review/review-service.ts';
import { SubPlaces } from '../setup/contractor-setup.ts';
import { day, type Outcome, Refused, type Warn } from '../setup/setup-service.ts';

// A box's measurements, whole inches; a shape reads only its own.
export interface BoxMeasurements {
  readonly length?: number | null;
  readonly secondLength?: number | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly diameter?: number | null;
  readonly radius?: number | null;
  readonly run?: number | null;
  readonly corners?: number | null;
}

// A box corrected: only what is stated changes. A shape stated takes the measurements stated and
// no others (a rectangle measured again as a round bottom); a feature stated, picked or typed,
// clears the other; taken off is a mark, cleared to put it back.
export interface BoxCorrection extends BoxMeasurements {
  readonly shape?: BoxShape;
  readonly sign?: BoxSign;
  readonly featureId?: string | null;
  readonly featureOther?: string | null;
  readonly takenOff?: boolean;
}

// The rest of a certification, corrected: only what is stated changes, and `null` empties a
// detail that may be empty. The subs are typed names, placed as a phone's are; with a prime
// changed, the subs it had are placed again under the new one by name.
export interface CertificationCorrection {
  readonly primeId?: string;
  readonly firstTierSub?: string | null;
  readonly secondTierSub?: string | null;
  readonly vehicleTypeId?: string | null;
  readonly vehicleTypeOther?: string | null;
  readonly crewTypeId?: string | null;
  readonly driverName?: string | null;
  readonly driverPhone?: string | null;
  readonly driverLicenceNumber?: string | null;
  readonly driverLicenceState?: string | null;
  readonly driverLicenceExpiry?: string | null;
  readonly tagNumber?: string | null;
  readonly tagState?: string | null;
  readonly tagExpiry?: string | null;
  readonly clientRepresentativeName?: string | null;
  readonly contractorRepresentativeName?: string | null;
  readonly notes?: string | null;
}

// A certification as a correction left it, and what it queued.
export interface Corrected {
  readonly record: Certification;
  readonly queued: WorkQueued;
}

const nothingQueued: WorkQueued = { jobs: [], tickets: [], lockedAsInvoiced: [] };

// One measured box as the phone sends it. The first is the primary; each one after it is labelled
// with a feature, picked from the firm's list or typed.
export interface BoxInput extends BoxMeasurements {
  readonly featureId?: string;
  readonly featureOther?: string;
  readonly shape: BoxShape;
  readonly sign: BoxSign;
}

export interface NewCertification {
  // The phone's own id for it, so a retried sync is the same record (KD-56).
  readonly id?: string;
  readonly projectId: string;
  // The phone's next number from its block, or the pre-printed sheet's, as written (ADR-045).
  readonly certNumber: string;
  readonly kind: CertificationKind;
  // The prime the monitor picked, and the subs they typed, by name.
  readonly primeId: string;
  readonly firstTierSub?: string;
  readonly secondTierSub?: string;
  readonly vehicleTypeId?: string;
  readonly vehicleTypeOther?: string;
  readonly crewTypeId?: string;
  // A container's measured boxes, the primary first; none on a crew.
  readonly boxes: readonly BoxInput[];
  readonly driverName?: string;
  readonly driverPhone?: string;
  readonly driverLicenceNumber?: string;
  readonly driverLicenceState?: string;
  readonly driverLicenceExpiry?: string;
  readonly tagNumber?: string;
  readonly tagState?: string;
  readonly tagExpiry?: string;
  // The phone's clock and its offset.
  readonly certifiedAt: Date;
  readonly deviceUtcOffsetMinutes: number;
  // The monitor who made and measured it, their phone and the assignment it held.
  readonly certifiedById: string;
  readonly deviceId?: string;
  readonly assignmentId?: string;
  // Whoever helped measure, picked from the people assigned with the monitor; none is allowed.
  readonly helperIds?: readonly string[];
  readonly clientRepresentativeName?: string;
  readonly contractorRepresentativeName?: string;
  // A modified truck: the certification this one replaces, and why (ADR-082).
  readonly replaces?: { readonly certificationId: string; readonly reason: string };
  readonly notes?: string;
  // Entered in the back office from the paper sheet (ADR-521, 534 (1)): who entered it, and the
  // reason picked. Never with a phone or an assignment.
  readonly createdById?: string;
  readonly createdReasonId?: string;
}

// A record with what was sent as `null` left out.
type Stated<T> = {
  [K in keyof T as null extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as null extends T[K] ? K : never]?: NonNullable<T[K]>;
};

export function stated<T extends object>(sent: T): Stated<T> {
  return Object.fromEntries(
    Object.entries(sent).filter(([, value]) => value !== null),
  ) as Stated<T>;
}

export class Certifications extends ReviewService {
  // A certification as a phone's sync sends it (the contract's own shape, `syncedRecordSchema`'s
  // seventh kind, ADR-469), from the phone that proved itself: handed to `certify` whole, never
  // a second way in. What the phone left empty is left out.
  // `brought` is the sync that brought it, where one did: its row in the idempotency ledger is
  // then written in the piece of work that makes the certification (ADR-471, 472).
  received(sent: SentCertification, brought?: Brought): Promise<Outcome<Certification>> {
    return this.certify(Certifications.asNew(sent), brought);
  }

  // A certification as its phone sent it, as `certify` takes one.
  static asNew(sent: SentCertification): NewCertification {
    const { boxes, helperIds, replaces, ...rest } = sent;
    return {
      ...stated(rest),
      boxes: boxes.map((box) => stated(box)),
      helperIds,
      ...(replaces === null
        ? {}
        : { replaces: { certificationId: replaces.replacedId, reason: replaces.reason } }),
    };
  }

  certify(input: NewCertification, brought?: Brought): Promise<Outcome<Certification>> {
    const actor: Actor =
      input.deviceId === undefined
        ? { actorId: input.createdById ?? input.certifiedById, source: 'BACK_OFFICE' }
        : { actorId: input.certifiedById, source: 'DEVICE', deviceId: input.deviceId };
    return this.writeAs(actor, (tx, warn) => this.certifiedIn(tx, warn, input, { brought }));
  }

  // A sheet whose phone failed, entered in the back office (ADR-521, 534 (1)): by a person
  // who may correct records, with a reason the firm offers for a record made in the back office,
  // naming the monitor who certified it and the sheet's own number. A number the project already
  // has is refused in words. It is then a certification like one made on a phone: the field
  // events already on its number are linked, and their tickets queued, as that person asked.
  fromTheSheet(
    person: string,
    input: Omit<NewCertification, 'id' | 'deviceId' | 'assignmentId' | 'createdById'> & {
      readonly createdReasonId: string;
    },
  ): Promise<Outcome<Certification>> {
    return this.mark(person, 'CORRECT', undefined, async (tx, warn) => {
      const reason = await tx.reason.findUniqueOrThrow({
        where: { id: input.createdReasonId },
      });
      const notOffered = new PickedReason({
        name: reason.name,
        uses: reason.uses,
        archived: reason.archivedAt !== null,
      }).refusal('BACK_OFFICE_RECORD');
      if (notOffered !== null) throw new Refused(notOffered);
      const held = await tx.certification.findUnique({
        where: {
          projectId_certNumber: { projectId: input.projectId, certNumber: input.certNumber },
        },
        select: { id: true },
      });
      if (held !== null) {
        throw new Refused(new CertificationChanges(input.certNumber).numberHeld());
      }
      return this.certifiedIn(tx, warn, { ...input, createdById: person });
    });
  }

  // The certification made in a piece of work already open: `certify`'s own, or a reviewer's
  // who saves one a phone sent from where it was held (ADR-526 (2)), as that reviewer, with the
  // time the server received it. There `queued` is false: the reviewer's service queues the
  // tickets on its number itself.
  async certifiedIn(
    tx: Prisma.TransactionClient,
    warn: Warn,
    input: NewCertification,
    how: {
      readonly brought?: Brought | undefined;
      readonly receivedAt?: Date;
      readonly queued?: boolean;
    } = {},
  ): Promise<Certification> {
    const { brought } = how;
    const boxes = input.boxes.map((box, position) => ({
      ...Certifications.measured(box, position),
      featureId: box.featureId ?? null,
      featureOther: box.featureOther ?? null,
    }));
    const capacityCy = Certifications.capacity(input.kind, boxes);
    if (input.replaces !== undefined) {
      const refusal = new CertificationChanges(input.certNumber).replacement(input.replaces.reason);
      if (refusal !== null) throw new Refused(refusal);
    }
    const subs = await Certifications.subs(tx, warn, input.projectId, input.kind, input.primeId, [
      input.firstTierSub,
      input.secondTierSub,
    ]);
    const certification = await tx.certification.create({
      data: {
        ...(input.id === undefined ? {} : { id: input.id }),
        projectId: input.projectId,
        certNumber: input.certNumber,
        kind: input.kind,
        primeId: input.primeId,
        ...subs,
        vehicleTypeId: input.vehicleTypeId ?? null,
        vehicleTypeOther: input.vehicleTypeOther ?? null,
        crewTypeId: input.crewTypeId ?? null,
        capacityCy,
        driverName: input.driverName ?? null,
        driverPhone: input.driverPhone ?? null,
        driverLicenceNumber: input.driverLicenceNumber ?? null,
        driverLicenceState: input.driverLicenceState ?? null,
        driverLicenceExpiry:
          input.driverLicenceExpiry === undefined ? null : day(input.driverLicenceExpiry),
        tagNumber: input.tagNumber ?? null,
        tagState: input.tagState ?? null,
        tagExpiry: input.tagExpiry === undefined ? null : day(input.tagExpiry),
        certifiedAt: input.certifiedAt,
        deviceUtcOffsetMinutes: input.deviceUtcOffsetMinutes,
        receivedAt: how.receivedAt ?? this.clock.now(),
        certifiedById: input.certifiedById,
        deviceId: input.deviceId ?? null,
        assignmentId: input.assignmentId ?? null,
        clientRepresentativeName: input.clientRepresentativeName ?? null,
        contractorRepresentativeName: input.contractorRepresentativeName ?? null,
        // Marked at QC (ADR-080).
        signaturesOnFile: false,
        replacesId: input.replaces?.certificationId ?? null,
        replacedReason: input.replaces?.reason.trim() ?? null,
        notes: input.notes ?? null,
        createdById: input.createdById ?? null,
        createdReasonId: input.createdReasonId ?? null,
      },
    });
    for (const box of boxes) {
      await tx.certificationBox.create({
        data: { ...box, certificationId: certification.id, kind: 'CONTAINER' },
      });
    }
    for (const userId of input.helperIds ?? []) {
      await tx.certificationHelper.create({
        data: { certificationId: certification.id, userId },
      });
    }
    // A field event that scanned this number before the certification existed found none
    // when it arrived: it is linked now (a contractor user's sight hangs on the link,
    // ADR-361), and its ticket, unbilled until a certification exists, is queued. So are the
    // tickets on a certification this one replaces: the ones worked on the old number from
    // now on are flagged.
    await tx.fieldEvent.updateMany({
      where: {
        projectId: input.projectId,
        certNumber: input.certNumber,
        certificationId: null,
      },
      data: { certificationId: certification.id },
    });
    const replaced =
      input.replaces === undefined
        ? null
        : await tx.certification.findUniqueOrThrow({
            where: { id: input.replaces.certificationId },
            select: { certNumber: true },
          });
    // Made on a phone, it reached the server by a sync, and no person asked for the run.
    if (how.queued !== false) {
      await this.onNumbers(
        tx,
        input.projectId,
        [input.certNumber, ...(replaced === null ? [] : [replaced.certNumber])],
        input.deviceId === undefined
          ? { trigger: 'SETUP_CHANGE', requestedById: input.createdById ?? input.certifiedById }
          : { trigger: 'SYNC' },
        // Its own flag, views missing, is the run's to raise: with no ticket on the number, a
        // job that names none.
        true,
      );
    }
    if (input.deviceId !== undefined) {
      await ledgerRow(tx, brought, {
        recordId: certification.id,
        recordKind: 'CERTIFICATION',
        deviceId: input.deviceId,
        answer: 'SAVED',
      });
    }
    return certification;
  }

  // Queues every ticket whose field events scanned one of the numbers, their neighbours with
  // them; with no such ticket, a job for the certification's own flags where one is asked for.
  private async onNumbers(
    tx: Prisma.TransactionClient,
    projectId: string,
    certNumbers: readonly string[],
    asked:
      | { readonly trigger: 'SYNC' }
      | { readonly trigger: 'SETUP_CHANGE' | 'CORRECTION'; readonly requestedById: string },
    projectRecords = false,
  ): Promise<WorkQueued> {
    const queue = this.workQueue(tx);
    const tickets = await queue.ticketsWith(projectId, { certNumber: { in: [...certNumbers] } });
    return this.ask(tx, {
      projectId,
      ...asked,
      tickets: [],
      others: [...tickets, ...(await queue.neighbours(projectId, tickets))],
      projectRecords,
    });
  }

  // A measuring mistake: the box is corrected in place, taken off or put back, and the
  // certification's capacity is worked out again from its boxes. The capacity itself is never
  // typed (ADR-076, 079). Its tickets are queued to reprocess at the new capacity, in the same
  // piece of work: the reviewer's correction's (`Corrections.certification`), which asks for
  // correct; with what it queued.
  async boxCorrected(
    tx: Prisma.TransactionClient,
    person: string,
    certificationId: string,
    position: number,
    change: BoxCorrection,
  ): Promise<Corrected> {
    const certification = await tx.certification.findUniqueOrThrow({
      where: { id: certificationId },
    });
    const changes = new CertificationChanges(certification.certNumber);
    const boxes = await Certifications.everyBoxOf(tx, certificationId);
    const box = boxes.find((candidate) => candidate.position === position);
    if (box === undefined) throw new Refused(changes.noBox(position));
    if (position === 0 && change.takenOff === true) throw new Refused(changes.primaryStays());
    const { shape, sign, featureId, featureOther, takenOff, ...measurements } = change;
    const data: Prisma.CertificationBoxUncheckedUpdateInput = {
      ...(shape === undefined
        ? measurements
        : {
            ...Certifications.measured(
              { ...measurements, shape, sign: sign ?? box.sign },
              position,
            ),
          }),
      ...(shape === undefined && sign !== undefined ? { sign } : {}),
      ...(featureId === undefined && featureOther === undefined
        ? {}
        : { featureId: featureId ?? null, featureOther: featureOther ?? null }),
      ...(takenOff === undefined
        ? {}
        : { archivedAt: takenOff ? (box.archivedAt ?? this.clock.now()) : null }),
    };
    delete data.position;
    const updated = { ...box, ...(data as Partial<CertificationBox>) };
    const capacityCy = Certifications.capacity(
      certification.kind,
      boxes
        .map((kept) => (kept.id === box.id ? updated : kept))
        .filter((kept) => kept.archivedAt === null),
    );
    await tx.certificationBox.update({ where: { id: box.id }, data });
    return this.recapacitated(tx, person, certification, capacityCy);
  }

  // A box the sheet had and the certification lacks: added after its last, a feature on it as
  // on every box after the primary, and the capacity worked out again. A crew has no boxes.
  async boxAdded(
    tx: Prisma.TransactionClient,
    person: string,
    certificationId: string,
    box: BoxInput,
  ): Promise<Corrected> {
    const certification = await tx.certification.findUniqueOrThrow({
      where: { id: certificationId },
    });
    const boxes = await Certifications.everyBoxOf(tx, certificationId);
    if (certification.kind === 'CREW') {
      throw new Refused(new CertificationChanges(certification.certNumber).crewHasNoBox());
    }
    const position = Math.max(...boxes.map((kept) => kept.position)) + 1;
    const added = {
      ...Certifications.measured(box, position),
      featureId: box.featureId ?? null,
      featureOther: box.featureOther ?? null,
    };
    const capacityCy = Certifications.capacity(certification.kind, [
      ...boxes.filter((kept) => kept.archivedAt === null),
      added,
    ]);
    await tx.certificationBox.create({ data: { ...added, certificationId, kind: 'CONTAINER' } });
    return this.recapacitated(tx, person, certification, capacityCy);
  }

  // The rest of what was keyed, corrected (ADR-534 (5)). Whose truck it is moves what its tickets
  // bill and whose they are, so every ticket on its number is queued, its neighbours with them.
  async detailsCorrected(
    tx: Prisma.TransactionClient,
    warn: Warn,
    person: string,
    certificationId: string,
    changes: CertificationCorrection,
  ): Promise<Corrected> {
    const certification = await tx.certification.findUniqueOrThrow({
      where: { id: certificationId },
      include: {
        firstTierSub: { select: { name: true } },
        secondTierSub: { select: { name: true } },
      },
    });
    const { primeId, firstTierSub, secondTierSub, driverLicenceExpiry, tagExpiry, ...plain } =
      changes;
    const whose =
      primeId === undefined && firstTierSub === undefined && secondTierSub === undefined
        ? {}
        : {
            primeId: primeId ?? certification.primeId,
            ...(await Certifications.subs(
              tx,
              warn,
              certification.projectId,
              certification.kind,
              primeId ?? certification.primeId,
              [
                (firstTierSub === undefined ? certification.firstTierSub?.name : firstTierSub) ??
                  undefined,
                (secondTierSub === undefined ? certification.secondTierSub?.name : secondTierSub) ??
                  undefined,
              ],
            )),
          };
    const record = await tx.certification.update({
      where: { id: certificationId },
      data: {
        ...plain,
        ...whose,
        ...(driverLicenceExpiry === undefined
          ? {}
          : {
              driverLicenceExpiry: driverLicenceExpiry === null ? null : day(driverLicenceExpiry),
            }),
        ...(tagExpiry === undefined
          ? {}
          : { tagExpiry: tagExpiry === null ? null : day(tagExpiry) }),
      },
    });
    const queued = await this.onNumbers(tx, record.projectId, [record.certNumber], {
      trigger: 'CORRECTION',
      requestedById: person,
    });
    return { record, queued };
  }

  // The capacity a box's correction works out, written where it moved, and its tickets queued.
  private async recapacitated(
    tx: Prisma.TransactionClient,
    person: string,
    certification: Certification,
    capacityCy: number | null,
  ): Promise<Corrected> {
    if (capacityCy === certification.capacityCy) {
      return { record: certification, queued: nothingQueued };
    }
    const record = await tx.certification.update({
      where: { id: certification.id },
      data: { capacityCy },
    });
    const queued = await this.onNumbers(tx, record.projectId, [record.certNumber], {
      trigger: 'CORRECTION',
      requestedById: person,
    });
    return { record, queued };
  }

  // Marked at QC: whether the signatures are on file (they are kept elsewhere; ADR-080). It
  // takes QC, changes nothing a ticket reads and queues nothing.
  signaturesOnFile(
    person: string,
    certificationId: string,
    onFile: boolean,
  ): Promise<Outcome<Certification>> {
    return this.mark(person, 'QC', undefined, (tx) =>
      tx.certification.update({
        where: { id: certificationId },
        data: { signaturesOnFile: onFile },
      }),
    );
  }

  // Revoked from a day (in the project's time zone), with a reason, by an admin and nobody else.
  // Nothing else on it changes and nothing is blocked: later tickets are flagged (ADR-079).
  revoke(
    person: string,
    certificationId: string,
    from: string,
    reason: string,
  ): Promise<Outcome<Certification>> {
    return this.write(person, async (tx) => {
      const certification = await tx.certification.findUniqueOrThrow({
        where: { id: certificationId },
      });
      const changes = new CertificationChanges(certification.certNumber);
      const asking = await tx.user.findUnique({ where: { id: person } });
      const refusal =
        changes.revoker(
          asking === null
            ? null
            : { name: asking.name, role: asking.role, archived: asking.archivedAt !== null },
        ) ?? changes.revocation(reason);
      if (refusal !== null) throw new Refused(refusal);
      const revoked = await tx.certification.update({
        where: { id: certificationId },
        data: { revokedFrom: day(from), revokedReason: reason.trim(), revokedById: person },
      });
      // The tickets worked on it from that day are flagged on their next run: queued here.
      await this.onNumbers(tx, revoked.projectId, [revoked.certNumber], {
        trigger: 'SETUP_CHANGE',
        requestedById: person,
      });
      return revoked;
    });
  }

  // A revocation taken back (ADR-534 (7)): by an admin and nobody else, as revoking is, with a
  // reason the audit record keeps; the revocation's day, reason and admin are cleared (the audit
  // log keeps them), and the tickets on it are queued, no longer flagged on their next run.
  unrevoke(
    person: string,
    certificationId: string,
    reason: string,
  ): Promise<Outcome<Certification>> {
    return this.writeAs(
      { actorId: person, source: 'BACK_OFFICE', reason: reason.trim() },
      async (tx) => {
        const certification = await tx.certification.findUniqueOrThrow({
          where: { id: certificationId },
        });
        const changes = new CertificationChanges(certification.certNumber);
        const asking = await tx.user.findUnique({ where: { id: person } });
        const refusal =
          changes.revoker(
            asking === null
              ? null
              : { name: asking.name, role: asking.role, archived: asking.archivedAt !== null },
            'un-revoke',
          ) ?? changes.unrevocation(certification.revokedFrom !== null, reason);
        if (refusal !== null) throw new Refused(refusal);
        const unrevoked = await tx.certification.update({
          where: { id: certificationId },
          data: { revokedFrom: null, revokedReason: null, revokedById: null },
        });
        await this.onNumbers(tx, unrevoked.projectId, [unrevoked.certNumber], {
          trigger: 'SETUP_CHANGE',
          requestedById: person,
        });
        return unrevoked;
      },
    );
  }

  // What the boxes work out to: whole cubic yards for a container, none for a crew. Measurements
  // that give no capacity are refused with the domain's own words; nothing is saved.
  private static capacity(kind: CertificationKind, boxes: readonly MeasuredBox[]): number | null {
    const reading = new Capacity(kind, boxes).work();
    if (reading.refusal !== null) throw new Refused(reading.refusal);
    return reading.capacityCy;
  }

  private static measured(
    box: BoxMeasurements & Pick<MeasuredBox, 'shape' | 'sign'>,
    position: number,
  ) {
    return {
      position,
      shape: box.shape,
      sign: box.sign,
      length: box.length ?? null,
      secondLength: box.secondLength ?? null,
      width: box.width ?? null,
      height: box.height ?? null,
      diameter: box.diameter ?? null,
      radius: box.radius ?? null,
      run: box.run ?? null,
      corners: box.corners ?? null,
    } satisfies MeasuredBox;
  }

  // Every box a certification has kept, in order, those taken off with them.
  private static everyBoxOf(
    tx: Prisma.TransactionClient,
    certificationId: string,
  ): Promise<CertificationBox[]> {
    return tx.certificationBox.findMany({
      where: { certificationId },
      orderBy: { position: 'asc' },
    });
  }

  private static async subs(
    tx: Prisma.TransactionClient,
    warn: Warn,
    projectId: string,
    kind: CertificationKind,
    primeId: string,
    [firstTier, secondTier]: [string | undefined, string | undefined],
  ): Promise<{ firstTierSubId: string | null; secondTierSubId: string | null }> {
    const prime = await tx.contractor.findUniqueOrThrow({ where: { id: primeId } });
    return new SubPlaces(tx, projectId, prime, kind, warn).named(firstTier, secondTier);
  }
}
