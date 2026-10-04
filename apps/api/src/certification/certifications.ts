// Part 3, certifying containers and crews (spec/parts/03-certification.md; adms-certifications;
// spec/DATA-MODEL.md §3 "Certifications"; ADR-015, 045, 076, 079, 082, 108, 152, 294, 321).
//
// `certify` is what a monitor's phone sends when a truck or a crew is certified: one piece of work,
// written as that monitor, from that phone. Nobody types a capacity: it is what the measured boxes
// work out to (packages/domain's Capacity), and measurements that give none are refused in plain
// words, with nothing saved. The monitor picks the prime and types the subs; each sub gets its
// place on the project in the same piece of work (SubPlaces, beside ContractorSetup.addPrime).
//
// The later changes are the back office's: a measuring mistake corrected in place (the capacity
// worked out again), signatures on file, a revocation from a date, a copy to another project. A
// modified truck is certified again, naming the certification it replaces. Nothing is deleted.
// Who may do each (an admin revokes; a certifying assignment) is read at sign-in, Phase 2. A
// certification's number is the phone's: the next of its block of the project's cert-number
// series, or the pre-printed sheet's, as written. A copy's number is the other project's next,
// taken by the server itself (NumberAllocator; ADR-323).
import type { Actor, Certification, CertificationBox, Prisma } from '@open-adms/db';
import {
  type BoxShape,
  type BoxSign,
  Capacity,
  CertificationChanges,
  type CertificationKind,
  type MeasuredBox,
} from '@open-adms/domain';

import { NumberAllocator } from '../numbering/number-allocator.ts';
import { SubPlaces } from '../setup/contractor-setup.ts';
import { day, type Outcome, Refused, SetupService, type Warn } from '../setup/setup-service.ts';

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
}

export class Certifications extends SetupService {
  certify(input: NewCertification): Promise<Outcome<Certification>> {
    const actor: Actor =
      input.deviceId === undefined
        ? { actorId: input.certifiedById, source: 'BACK_OFFICE' }
        : { actorId: input.certifiedById, source: 'DEVICE', deviceId: input.deviceId };
    return this.writeAs(actor, async (tx, warn) => {
      const boxes = input.boxes.map((box, position) => ({
        ...Certifications.measured(box, position),
        featureId: box.featureId ?? null,
        featureOther: box.featureOther ?? null,
      }));
      const capacityCy = Certifications.capacity(input.kind, boxes);
      if (input.replaces !== undefined) {
        const refusal = new CertificationChanges(input.certNumber).replacement(
          input.replaces.reason,
        );
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
          receivedAt: this.clock.now(),
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
      return certification;
    });
  }

  // A measuring mistake: the box is corrected in place, and the certification's capacity is worked
  // out again from its boxes. The capacity itself is never typed (ADR-076, 079). Its tickets
  // reprocess at the new capacity when the engine exists (BACKLOG 1.8.3).
  measure(
    person: string,
    certificationId: string,
    position: number,
    measurements: BoxMeasurements,
  ): Promise<Outcome<Certification>> {
    return this.write(person, async (tx) => {
      const certification = await tx.certification.findUniqueOrThrow({
        where: { id: certificationId },
      });
      const boxes = await Certifications.boxesOf(tx, certificationId);
      const box = boxes.find((candidate) => candidate.position === position);
      if (box === undefined) {
        throw new Error(
          `Certification ${certification.certNumber} has no box ${String(position)} to correct.`,
        );
      }
      const capacityCy = Certifications.capacity(
        certification.kind,
        boxes.map((kept) => (kept.id === box.id ? { ...kept, ...measurements } : kept)),
      );
      await tx.certificationBox.update({ where: { id: box.id }, data: measurements });
      if (capacityCy === certification.capacityCy) return certification;
      return tx.certification.update({ where: { id: certificationId }, data: { capacityCy } });
    });
  }

  // Marked at QC: whether the signatures are on file (they are kept elsewhere; ADR-080).
  signaturesOnFile(
    person: string,
    certificationId: string,
    onFile: boolean,
  ): Promise<Outcome<Certification>> {
    return this.write(person, (tx) =>
      tx.certification.update({
        where: { id: certificationId },
        data: { signaturesOnFile: onFile },
      }),
    );
  }

  // Revoked from a day (in the project's time zone), with a reason. Nothing else on it changes
  // and nothing is blocked: later tickets are flagged (ADR-079).
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
      const refusal = new CertificationChanges(certification.certNumber).revocation(reason);
      if (refusal !== null) throw new Refused(refusal);
      return tx.certification.update({
        where: { id: certificationId },
        data: { revokedFrom: day(from), revokedReason: reason.trim(), revokedById: person },
      });
    });
  }

  // The same truck on another project: a new certification there, with a number of that project's
  // own and a reference to the original; each is its own record (ADR-152). What was measured, who
  // measured it and when are the original's; its subs get their place on the other project. The
  // number is the next of the other project's cert-number series; a number typed from pre-printed
  // paper is kept as written instead, and is needed where that project has no series (ADR-045).
  copy(
    person: string,
    certificationId: string,
    toProjectId: string,
    typedCertNumber?: string,
  ): Promise<Outcome<Certification>> {
    return this.write(person, async (tx, warn) => {
      const original = await tx.certification.findUniqueOrThrow({
        where: { id: certificationId },
      });
      const project = await tx.project.findUniqueOrThrow({ where: { id: toProjectId } });
      const prime = await tx.contractor.findUniqueOrThrow({ where: { id: original.primeId } });
      const primeThere = await tx.projectContractor.findUnique({
        where: { projectId_asPrimeId: { projectId: toProjectId, asPrimeId: prime.id } },
      });
      const refusal = new CertificationChanges(original.certNumber).copy(
        { projectId: original.projectId },
        { projectId: toProjectId, projectName: project.name },
        { name: prime.name, isPrimeThere: primeThere !== null && primeThere.archivedAt === null },
      );
      if (refusal !== null) throw new Refused(refusal);
      const subIds = [original.firstTierSubId, original.secondTierSubId];
      const typed = await tx.contractor.findMany({
        where: { id: { in: subIds.flatMap((id) => (id === null ? [] : [id])) } },
      });
      const nameOf = (id: string | null): string | undefined =>
        typed.find((contractor) => contractor.id === id)?.name;
      const subs = await Certifications.subs(tx, warn, toProjectId, original.kind, prime.id, [
        nameOf(original.firstTierSubId),
        nameOf(original.secondTierSubId),
      ]);
      const boxes = await Certifications.boxesOf(tx, certificationId);
      const helpers = await tx.certificationHelper.findMany({
        where: { certificationId, archivedAt: null },
      });
      const certNumber =
        typedCertNumber ?? (await NumberAllocator.next(tx, toProjectId, 'CERTIFICATION'));
      if (certNumber === null) {
        throw new Refused({
          code: 'COPY_NEEDS_CERT_NUMBER',
          message: `Not saved: ${project.name} has no cert-number series. Type the number from its pre-printed certification paper to copy certification ${original.certNumber}.`,
        });
      }
      const copy = await tx.certification.create({
        data: {
          projectId: toProjectId,
          certNumber,
          kind: original.kind,
          primeId: prime.id,
          ...subs,
          vehicleTypeId: original.vehicleTypeId,
          vehicleTypeOther: original.vehicleTypeOther,
          crewTypeId: original.crewTypeId,
          capacityCy: Certifications.capacity(original.kind, boxes),
          driverName: original.driverName,
          driverPhone: original.driverPhone,
          driverLicenceNumber: original.driverLicenceNumber,
          driverLicenceState: original.driverLicenceState,
          driverLicenceExpiry: original.driverLicenceExpiry,
          tagNumber: original.tagNumber,
          tagState: original.tagState,
          tagExpiry: original.tagExpiry,
          certifiedAt: original.certifiedAt,
          deviceUtcOffsetMinutes: original.deviceUtcOffsetMinutes,
          receivedAt: this.clock.now(),
          certifiedById: original.certifiedById,
          clientRepresentativeName: original.clientRepresentativeName,
          contractorRepresentativeName: original.contractorRepresentativeName,
          signaturesOnFile: false,
          copiedFromId: original.id,
        },
      });
      for (const box of boxes) {
        await tx.certificationBox.create({
          data: {
            ...Certifications.measured(box, box.position),
            featureId: box.featureId,
            featureOther: box.featureOther,
            certificationId: copy.id,
            kind: 'CONTAINER',
          },
        });
      }
      for (const helper of helpers) {
        await tx.certificationHelper.create({
          data: { certificationId: copy.id, userId: helper.userId },
        });
      }
      return copy;
    });
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

  // A certification's boxes as it keeps them, in order; one taken off is left out.
  private static boxesOf(
    tx: Prisma.TransactionClient,
    certificationId: string,
  ): Promise<CertificationBox[]> {
    return tx.certificationBox.findMany({
      where: { certificationId, archivedAt: null },
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
