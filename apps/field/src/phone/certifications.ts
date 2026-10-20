// Certifying on the phone (adms-certifications §3A; spec/parts/03-certification.md; adms-field-app
// §4A; BACKLOG 3.5.5, C118, C127, C129; REQ-322; AC-03-09, 14, 36, AC-11-42; ADR-015, 045, 076,
// 079, 080, 082, 108, 151, 179, 294, 320, 469, 477, 585). What the certifying screens keep and
// read, in the store, so a certification left at any step is there after a sign-out and a
// restart (ADR-570), as a form is (`PhoneForms`).
//
// - **A record, never a ticket's field event** (ADR-236): it pairs with nothing and bills nothing
//   itself; every field event that scans its badge refers to it. Begun by its monitor and theirs
//   alone (*agent default*, as tickets and forms are); several may be open at once.
// - **Its number at New** (ADR-045, 151; Q-142): the next of the phone's block of the project's
//   cert-number series, marked used in its block in the same piece of work, so it is never made
//   again; or a pre-printed sheet's own, as typed. Either is typed again by the screen before the
//   certification opens: a person writes it on the placard and the badge.
// - **Its capacity is never typed, never kept and never sent** (ADR-076, 320; AC-10-35): the
//   screen works it out from the boxes with the domain's `Capacity` and shows it; the sync sends
//   the boxes, each with the measurements its shape holds and `null` for the rest (C129), and the
//   server works it out by the same rule.
// - **Five views**, one photograph each, taken again in its place (ADR-179); a view left out is
//   the server's to flag, never refused here.
// - **Nothing open is sent.** Submitted, it is made the record the sync contract carries and handed
//   to the outbox, **sealed** (the user, ADR-477); its photographs follow it, each with its view and
//   its file. Cancelled, it stays on the phone, unsent, keeping its number.
//
// No rule lives here that the server doesn't hold too: what the record takes is the contract's own
// refusal at `PhoneOutbox.keep`, which answers before anything is sealed.
import type {
  PhoneListsRecord,
  SyncedCertification,
  SyncedPhoto,
  SyncedRecord,
} from '@open-adms/contracts';
import {
  Capacity,
  CertificationSubs,
  NumberSeriesRules,
  PhoneNumbers,
  ProjectClock,
  uuidv7,
  type CertificationKind,
  type CertificationView,
  type NotSavedNotice,
} from '@open-adms/domain';

import type { Change, Json, PhoneStore } from '../store/phone-store.ts';
import type { PhoneLists } from './lists.ts';
import type { PhoneOutbox } from './outbox.ts';
import { offsetOf } from './reports.ts';
import type { Fix, TicketPhoto } from './tickets.ts';

export type CertificationState = 'OPEN' | 'SUBMITTING' | 'SUBMITTED' | 'CANCELLED';
// One box as the monitor entered it: the first is the primary, the main interior; each after it
// a feature, picked or typed, that adds or subtracts. A measurement its shape doesn't hold may
// be kept from an earlier shape, and is never sent.
export type CertificationBox = SyncedCertification['boxes'][number];
// One of the five views, its photograph's id and fingerprint as any other's.
export interface ViewPhoto extends TicketPhoto {
  readonly view: CertificationView;
}

// What the monitor entered, each as picked or typed; null where nothing was.
export interface CertificationDetails {
  // A measured container, or a crew (never measured): asked first.
  readonly kind: CertificationKind | null;
  readonly primeId: string | null;
  // A sub typed into tier 1 or tier 2, the prime's known ones offered (ADR-108).
  readonly firstTierSub: string | null;
  readonly secondTierSub: string | null;
  readonly driverName: string | null;
  readonly driverPhone: string | null;
  readonly driverLicenceNumber: string | null;
  readonly driverLicenceState: string | null;
  readonly driverLicenceExpiry: string | null;
  readonly tagNumber: string | null;
  readonly tagState: string | null;
  readonly tagExpiry: string | null;
  // Picked from the firm's list, or typed where nothing on it fits (ADR-070).
  readonly vehicleTypeId: string | null;
  readonly vehicleTypeOther: string | null;
  readonly crewTypeId: string | null;
  // A container's, the primary first.
  readonly boxes: readonly CertificationBox[];
  // Picked from the people assigned with the monitor (ADR-294).
  readonly helperIds: readonly string[];
  readonly clientRepresentativeName: string | null;
  readonly contractorRepresentativeName: string | null;
  // A modified truck certified again: the certification it replaces, from the lists, and why.
  readonly replaces: { readonly replacedId: string; readonly reason: string } | null;
  readonly notes: string | null;
}

export interface PhoneCertification extends CertificationDetails {
  readonly id: string;
  readonly state: CertificationState;
  readonly monitorId: string;
  readonly projectId: string;
  readonly timeZone: string;
  readonly assignmentId: string;
  // Cert = placard = badge: one number, as written (invariant 9).
  readonly certNumber: string;
  // Where it came from: the phone's block, or the pre-printed sheet.
  readonly numberFrom: 'MADE' | 'TYPED';
  // When it was begun: its time, and the project's day.
  readonly certifiedAt: string;
  readonly offset: number;
  readonly day: string;
  // Where its monitor left it: the screen's own name for the step.
  readonly step: string;
  readonly photos: readonly ViewPhoto[];
  readonly closedAt: string | null;
}

// What New hands over: who, on what, and the number.
export interface CertificationBegun {
  readonly monitorId: string;
  readonly projectId: string;
  readonly timeZone: string;
  readonly assignmentId: string;
  readonly step: string;
  readonly number: { readonly certNumber: string; readonly from: 'MADE' | 'TYPED' };
}

export interface CertificationsOptions {
  // The most bytes one photograph's file may be (`MEDIA_FILE_BYTES_AT_MOST`).
  readonly photoBytesAtMost: number;
  readonly now?: () => Date;
}

export type CertificationSubmitted =
  | { readonly kind: 'sealed'; readonly certification: PhoneCertification }
  | { readonly kind: 'notKept'; readonly notice: NotSavedNotice };

const certificationsShelf = 'certifications';
const photoPrefix = 'photo:';

const hex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');

const isCertification = (value: unknown): value is PhoneCertification =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Uint8Array) &&
  typeof (value as { id?: unknown }).id === 'string' &&
  typeof (value as { certNumber?: unknown }).certNumber === 'string';

const none: CertificationDetails = {
  kind: null,
  primeId: null,
  firstTierSub: null,
  secondTierSub: null,
  driverName: null,
  driverPhone: null,
  driverLicenceNumber: null,
  driverLicenceState: null,
  driverLicenceExpiry: null,
  tagNumber: null,
  tagState: null,
  tagExpiry: null,
  vehicleTypeId: null,
  vehicleTypeOther: null,
  crewTypeId: null,
  boxes: [],
  helperIds: [],
  clientRepresentativeName: null,
  contractorRepresentativeName: null,
  replaces: null,
  notes: null,
};

// A box with nothing measured yet: the primary, or a feature's of a shape.
export const emptyBox: CertificationBox = {
  featureId: null,
  featureOther: null,
  shape: 'RECTANGLE',
  sign: 'ADD',
  length: null,
  secondLength: null,
  width: null,
  height: null,
  diameter: null,
  radius: null,
  run: null,
  corners: null,
};

// A box as it is sent: the measurements its shape holds, every other `null` (C129).
export function sentBox(box: CertificationBox): CertificationBox {
  const held = new Set<string>(Capacity.measurementsOf(box.shape));
  const kept = (name: keyof CertificationBox, value: number | null): number | null =>
    held.has(name) ? value : null;
  return {
    ...box,
    length: kept('length', box.length),
    secondLength: kept('secondLength', box.secondLength),
    width: kept('width', box.width),
    height: kept('height', box.height),
    diameter: kept('diameter', box.diameter),
    radius: kept('radius', box.radius),
    run: kept('run', box.run),
    corners: kept('corners', box.corners),
  };
}

// What the boxes work out to, by the domain's `Capacity`: shown, never typed or kept.
export function capacityOf(details: Pick<CertificationDetails, 'kind' | 'boxes'>) {
  return new Capacity(
    details.kind ?? 'CONTAINER',
    details.kind === 'CREW'
      ? []
      : details.boxes.map((box, position) => ({ ...sentBox(box), position })),
  ).work();
}

export class PhoneCertifications {
  private readonly store: PhoneStore;
  private readonly lists: PhoneLists;
  private readonly outbox: PhoneOutbox;
  private readonly options: CertificationsOptions;
  private readonly now: () => Date;
  private certifications: PhoneCertification[] = [];

  private constructor(
    store: PhoneStore,
    lists: PhoneLists,
    outbox: PhoneOutbox,
    options: CertificationsOptions,
  ) {
    this.store = store;
    this.lists = lists;
    this.outbox = outbox;
    this.options = options;
    this.now = options.now ?? (() => new Date());
  }

  // The certifications as the store holds them; one the phone stopped submitting finishes now.
  static async opened(
    store: PhoneStore,
    lists: PhoneLists,
    outbox: PhoneOutbox,
    options: CertificationsOptions,
  ): Promise<PhoneCertifications> {
    const certifications = new PhoneCertifications(store, lists, outbox, options);
    await certifications.read();
    for (const one of [...certifications.certifications]) {
      const submitting =
        one.state === 'SUBMITTING' ||
        (one.state === 'OPEN' && (await store.read('records', one.id)) !== undefined);
      if (submitting) await certifications.sealed(one);
    }
    return certifications;
  }

  async read(): Promise<void> {
    const kept = await this.store.readAll(certificationsShelf);
    const held: PhoneCertification[] = [];
    for (const { value } of kept) if (isCertification(value)) held.push(value);
    this.certifications = held.sort((one, other) =>
      one.certifiedAt.localeCompare(other.certifiedAt),
    );
  }

  // A monitor's open certifications, the oldest first: home's open list.
  openOf(monitorId: string): readonly PhoneCertification[] {
    return this.certifications.filter((one) => one.monitorId === monitorId && one.state === 'OPEN');
  }

  certification(id: string): PhoneCertification | undefined {
    return this.certifications.find((one) => one.id === id);
  }

  // The next cert number the phone would make (the bare number); none where it holds no block of
  // the series or has used it up: the pre-printed sheet's is typed then (Q-142).
  async nextCertNumber(): Promise<string | null> {
    const held = await this.lists.held();
    if (held === undefined) return null;
    const next = new PhoneNumbers(
      held.lists.blocks.filter(({ series }) => series === 'CERTIFICATION'),
    ).next();
    return next === null ? null : new NumberSeriesRules('CERTIFICATION').written(next);
  }

  // New: a certification opened under its number. One the phone made is marked used in its block
  // in the same piece of work.
  async begin(begun: CertificationBegun): Promise<PhoneCertification> {
    const at = this.now();
    const certification: PhoneCertification = {
      ...none,
      id: uuidv7(at),
      state: 'OPEN',
      monitorId: begun.monitorId,
      projectId: begun.projectId,
      timeZone: begun.timeZone,
      assignmentId: begun.assignmentId,
      certNumber: begun.number.certNumber,
      numberFrom: begun.number.from,
      certifiedAt: at.toISOString(),
      offset: offsetOf(at),
      day: new ProjectClock(begun.timeZone).day(at),
      step: begun.step,
      photos: [],
      closedAt: null,
    };
    const changes: Change[] = [this.kept(certification)];
    if (begun.number.from === 'MADE' && /^\d+$/.test(begun.number.certNumber)) {
      const used = await this.lists.gaveOut('CERTIFICATION', Number(begun.number.certNumber));
      if (used !== null) changes.push(used);
    }
    await this.store.change(changes);
    this.certifications.push(certification);
    return certification;
  }

  // What its monitor entered, or where they left it: kept at once. Never a sealed one's.
  async changed(
    id: string,
    change: Partial<CertificationDetails> & { readonly step?: string },
  ): Promise<PhoneCertification> {
    return this.put({ ...this.openOne(id), ...change });
  }

  // A view's photograph (ADR-179): fingerprinted now, its bytes kept beside the certification; one
  // the view already had is let go, never sent. One too large to ever go is not kept.
  async photographed(
    id: string,
    view: CertificationView,
    bytes: Uint8Array,
    fix: Fix | null,
  ): Promise<ViewPhoto | null> {
    const certification = this.openOne(id);
    if (bytes.byteLength === 0 || bytes.byteLength > this.options.photoBytesAtMost) return null;
    const at = this.now();
    const sha256 = hex(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));
    const photo: ViewPhoto = {
      id: uuidv7(at),
      view,
      capturedAt: at.toISOString(),
      offset: offsetOf(at),
      fix,
      sha256,
      bytes: bytes.byteLength,
      kept: false,
    };
    const before = certification.photos.filter((one) => one.view === view);
    const next: PhoneCertification = {
      ...this.openOne(id),
      photos: [...certification.photos.filter((one) => one.view !== view), photo],
    };
    await this.store.change([
      ...before.map((one): Change => ({
        shelf: certificationsShelf,
        id: `${photoPrefix}${one.id}`,
        dropped: true,
      })),
      { shelf: certificationsShelf, id: `${photoPrefix}${photo.id}`, value: bytes },
      this.kept(next),
    ]);
    this.replace(next);
    return photo;
  }

  // A photograph's file as it was taken, for the screen to draw.
  async photoBytes(photoId: string): Promise<Uint8Array | undefined> {
    const kept = await this.store.read(certificationsShelf, `${photoPrefix}${photoId}`);
    return kept instanceof Uint8Array ? kept : undefined;
  }

  // Cancelled: kept on the phone, never sent; its number is never made again (ADR-056).
  async cancel(id: string): Promise<PhoneCertification> {
    return this.put({
      ...this.openOne(id),
      state: 'CANCELLED',
      closedAt: this.now().toISOString(),
    });
  }

  // Submitted: the record made from it and sealed in the outbox, then its photographs, each with
  // its view and its file. Where the contract doesn't take the record, nothing is sealed and it
  // stays open, the contract's words said.
  async submit(id: string): Promise<CertificationSubmitted> {
    const submitting: PhoneCertification = {
      ...this.openOne(id),
      state: 'SUBMITTING',
      closedAt: this.now().toISOString(),
    };
    const notice = await this.outbox.keep(PhoneCertifications.record(submitting));
    if (notice !== undefined) return { kind: 'notKept', notice };
    await this.put(submitting);
    return { kind: 'sealed', certification: await this.sealed(submitting) };
  }

  // The record a certification is, as the sync contract carries it (ADR-469): the boxes, never a
  // capacity; a crew's none (invariant 10); a sub as typed, tidied of stray spaces.
  static record(certification: PhoneCertification): SyncedRecord {
    const kind = certification.kind ?? 'CONTAINER';
    return {
      record: 'CERTIFICATION',
      certification: {
        id: certification.id,
        projectId: certification.projectId,
        certNumber: certification.certNumber,
        kind,
        primeId: certification.primeId ?? '',
        firstTierSub: CertificationSubs.typed(certification.firstTierSub),
        secondTierSub: CertificationSubs.typed(certification.secondTierSub),
        vehicleTypeId: certification.vehicleTypeId,
        vehicleTypeOther: certification.vehicleTypeOther,
        crewTypeId: kind === 'CREW' ? certification.crewTypeId : null,
        boxes: kind === 'CREW' ? [] : certification.boxes.map(sentBox),
        driverName: certification.driverName,
        driverPhone: certification.driverPhone,
        driverLicenceNumber: certification.driverLicenceNumber,
        driverLicenceState: certification.driverLicenceState,
        driverLicenceExpiry: certification.driverLicenceExpiry,
        tagNumber: certification.tagNumber,
        tagState: certification.tagState,
        tagExpiry: certification.tagExpiry,
        certifiedAt: certification.certifiedAt,
        deviceUtcOffsetMinutes: certification.offset,
        certifiedById: certification.monitorId,
        assignmentId: certification.assignmentId,
        helperIds: [...certification.helperIds],
        clientRepresentativeName: certification.clientRepresentativeName,
        contractorRepresentativeName: certification.contractorRepresentativeName,
        replaces: certification.replaces,
        notes: certification.notes,
      },
    };
  }

  // The certifications of the lists a phone holds, and those submitted on this phone that the
  // server hasn't told it of yet: what a replacement is picked from.
  replaceable(
    projectId: string,
    lists: PhoneListsRecord,
  ): readonly { readonly id: string; readonly certNumber: string }[] {
    const here = this.certifications
      .filter(
        (one) =>
          one.projectId === projectId &&
          one.state === 'SUBMITTED' &&
          !lists.certifications.some(({ id }) => id === one.id),
      )
      .map(({ id, certNumber }) => ({ id, certNumber }));
    return [...lists.certifications.map(({ id, certNumber }) => ({ id, certNumber })), ...here];
  }

  // The photographs of a certification submitting go to the outbox, each once with its view and
  // its file, its bytes then dropped from beside it; then it is submitted. One opened again half
  // way through finishes here: its record already sealed is left as it is.
  private async sealed(certification: PhoneCertification): Promise<PhoneCertification> {
    if ((await this.store.read('records', certification.id)) === undefined) {
      await this.outbox.keep(PhoneCertifications.record(certification));
    }
    let now = certification;
    for (const photo of certification.photos.filter(({ kept }) => !kept)) {
      const bytes = await this.photoBytes(photo.id);
      if (bytes !== undefined) {
        const record: SyncedPhoto = {
          id: photo.id,
          projectId: certification.projectId,
          owner: { kind: 'CERTIFICATION', id: certification.id },
          view: photo.view,
          takenById: certification.monitorId,
          capturedAt: photo.capturedAt,
          deviceUtcOffsetMinutes: photo.offset,
          latitude: photo.fix?.latitude ?? null,
          longitude: photo.fix?.longitude ?? null,
          originalSha256: photo.sha256,
          uploadedSha256: photo.sha256,
          depthSha256: null,
        };
        await this.outbox.keepPhoto(record, [{ file: 'photo', bytes }]);
      }
      now = {
        ...now,
        photos: now.photos.map((one) => (one.id === photo.id ? { ...one, kept: true } : one)),
      };
      await this.store.change([
        { shelf: certificationsShelf, id: `${photoPrefix}${photo.id}`, dropped: true },
        this.kept(now),
      ]);
      this.replace(now);
    }
    return this.put({ ...now, state: 'SUBMITTED' });
  }

  private openOne(id: string): PhoneCertification {
    const certification = this.certification(id);
    if (certification?.state !== 'OPEN') {
      throw new Error('Only an open certification changes on the phone.');
    }
    return certification;
  }

  private kept(certification: PhoneCertification): Change {
    return {
      shelf: certificationsShelf,
      id: certification.id,
      value: certification as unknown as Json,
    };
  }

  private async put(certification: PhoneCertification): Promise<PhoneCertification> {
    await this.store.change([this.kept(certification)]);
    this.replace(certification);
    return certification;
  }

  private replace(certification: PhoneCertification): void {
    const at = this.certifications.findIndex(({ id }) => id === certification.id);
    if (at === -1) this.certifications.push(certification);
    else this.certifications[at] = certification;
  }
}
