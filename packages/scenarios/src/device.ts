// A simulated phone (ARCHITECTURE §7–§10, §15): enrolled, holding the assignment its monitor took at
// sign-in (so one project) and the numbered version of its lists, and offline. What its monitor records stays on it, in the order recorded, until it finds signal
// and syncs; then each record goes to the server in that order, and leaves the phone once
// received. It stamps times from its own clock (the story's, plus any error the story gives it) and
// makes each record's id itself (ids.ts).
//
// It captures as a phone does (adms-field-app §4A.4–§4A.6; BACKLOG 1.3.7): New scans the badge and
// the field event waits; Complete takes the details, picked by name from its lists, then the
// number last: the next of its own block shown, or the truck's copy scanned, and entered again by
// hand. A unit rate pay item is worked out from the size bands by packages/domain's rule, the one
// the server uses. Its screens, its printing and its own duplicate check are the field app's
// (Phase 3).
import { createHash } from 'node:crypto';

import type {
  PhotoOwnerKind,
  SentDropOffLog,
  SentFieldEvent,
  SentForm,
  SentIncident,
  SentItem,
  SentPhoto,
  SentRecord,
  SentRoe,
  SentScaleReceipt,
  SentSurvey,
  SyncAnswer,
} from '@open-adms/api';
import type { AddressSource, FieldEventKind, NumberSeries, Workflow } from '@open-adms/db';
import {
  type BandedPayItem,
  FieldEventDetails,
  type HeldBlock,
  type IncidentOffer,
  IncidentOffers,
  NumberSeriesRules,
  PhoneNumbers,
  SizeBands,
  type TreeMeasurement,
} from '@open-adms/domain';

import { utcOffsetMinutes, type StoryClock } from './clock.ts';
import { uuidv7 } from './ids.ts';

// What a phone sends at a sync is the API's to say (apps/api, src/sync/sent.ts): the harness's
// phone sends exactly those records, under the names its stories know them by.
export type RecordedItem = SentItem;
export type RecordedEvent = SentFieldEvent;
export type RecordedScaleReceipt = SentScaleReceipt;
export type RecordedIncident = SentIncident;
export type RecordedDropOffLog = SentDropOffLog;
export type RecordedSurvey = SentSurvey;
export type RecordedRoe = SentRoe;
export type RecordedPhoto = SentPhoto;
export type PhoneRecord = SentRecord;

// What receives a phone's records at sync, and answers each: the API's intake (apps/api,
// src/sync/intake.ts), with no endpoint in front of it until Phase 2.
export interface SyncIntake {
  receive(record: PhoneRecord): Promise<SyncAnswer>;
}

// A record the phone sent and what it was told: saved, already saved, or not saved (ARCHITECTURE
// §9 (4)).
export interface Answered {
  readonly sent: PhoneRecord;
  readonly answer: SyncAnswer;
}

export interface Named {
  readonly id: string;
  readonly name: string;
}

// A block of numbers the phone holds, as the server issued it.
export interface PhoneBlock extends HeldBlock {
  readonly series: NumberSeries;
}

// A unit rate pay item its assignment names: its band, the payable type the monitor picks by
// name, and its kind of work. No rate (invariant 20).
export interface PhonePayItem extends BandedPayItem {
  readonly payableType: Named;
  readonly kindOfWork: Named;
}

// The lists a phone holds for its assignment (adms-field-app §4A.2a), as far as the harness
// captures from them. Never a rate, a rule, or a load's pay item.
export interface PhoneLists {
  // The project's setup version these lists are (ADR-453): what every record the phone makes
  // carries.
  readonly setupVersion: number;
  readonly blocks: readonly PhoneBlock[];
  // The entries on the project's load and haul-out forms, without those hidden on phones; each
  // id is the entry's.
  readonly debrisTypes: Readonly<Partial<Record<Workflow, readonly Named[]>>>;
  readonly fieldTags: readonly Named[];
  // The firm's reasons for a typed number.
  readonly typedNumberReasons: readonly Named[];
  readonly payItems: readonly PhonePayItem[];
  // The item names of the kinds of work its pay items do.
  readonly itemNames: readonly (Named & { readonly kindOfWorkId: string })[];
  readonly incidentTypes: readonly (Named & { readonly subTypes: readonly Named[] })[];
  // What the project's incident form offers, and the project's contractors, primes and subs, by
  // name, for "the contractor involved" (ADR-328).
  readonly incidentOffers: readonly IncidentOffer[];
  readonly contractors: readonly Named[];
  // The firm's survey work types, for a phone whose assignment makes surveys (ADR-150).
  readonly surveyWorkTypes: readonly Named[];
}

export interface PhoneSetup {
  // The phone's name on the dispatch board, e.g. P1-COL-1.
  readonly name: string;
  readonly deviceId: string;
  // The monitor signed in, the assignment the phone took for them, and its project.
  readonly monitorId: string;
  readonly assignmentId: string;
  readonly projectId: string;
  // The assignment's one site (a tower, a haul-out end); a curb collection's phone has none.
  readonly siteId?: string;
  // The lists the phone took for that assignment, numbered as a setup version: read from the
  // server, never stated by a story.
  readonly lists: PhoneLists;
  // The phone's own time zone: the project's, unless the story says otherwise.
  readonly timeZone: string;
  // How far the phone's clock is off the story's, in minutes (0 when not given).
  readonly clockErrorMinutes?: number;
}

// The number, last (ADR-209). The first field event of a ticket makes it: the next of the phone's
// block, shown (`made`). The second scans it off the truck's copy, as a control-ticket project's
// first does off its stock (`scanned`). Either is then entered again by hand. A barcode that
// won't read is typed, with a reason picked. The next property or pile of a split carries its
// chain's number, from the field event before it.
export type NumberEntry =
  | { readonly from: 'BLOCK' }
  | { readonly from: 'SCAN'; readonly number: string }
  | { readonly from: 'TYPED'; readonly number: string; readonly reason: string }
  | { readonly from: 'CHAIN'; readonly after: string };

export const made: NumberEntry = { from: 'BLOCK' };
export const scanned = (number: string): NumberEntry => ({ from: 'SCAN', number });
export const typed = (number: string, reason: string): NumberEntry => ({
  from: 'TYPED',
  number,
  reason,
});
export const chained = (after: string): NumberEntry => ({ from: 'CHAIN', after });

// Filled in on Complete: badge first, number last (ADR-209). Everything picked is picked by its
// name, from the phone's lists.
export interface Completion {
  readonly number: NumberEntry;
  // What the monitor enters by hand after a shown or scanned number; the same number when the
  // story doesn't say.
  readonly reentered?: string;
  readonly splitSuffix?: string;
  readonly endLatitude?: string;
  readonly endLongitude?: string;
  readonly address?: string;
  readonly addressSource?: AddressSource;
  readonly notes?: string;
  readonly debrisType?: string;
  readonly fieldTag?: string;
  readonly roeNumber?: string;
  readonly estimateCy?: number;
  readonly loadCall?: number;
  readonly carriedCount?: number;
  readonly carriedTickets?: readonly string[];
  // The site's paper, copied by hand; the receipt is the assignment's site's.
  readonly scaleReceipt?: {
    readonly receiptNumber: string;
    readonly grossWeightLb?: number;
    readonly tareWeightLb?: number;
    readonly netWeightLb?: number;
    readonly netWeightTons?: number;
  };
  // A tandem weighed once: this disposal points at the receipt recorded with an earlier one, by
  // that field event's id (ADR-034, 175).
  readonly sameScaleReceiptAs?: string;
  // Unit rate work: the payable type picked, then what its kind of work's screen takes.
  readonly payableType?: string;
  readonly count?: number;
  readonly measurement?: TreeMeasurement;
  readonly rootBallInches?: number;
  readonly rootBallHalfExposed?: boolean;
  readonly surveyNumber?: string;
  readonly markedIneligible?: boolean;
  readonly items?: readonly { readonly name: string; readonly quantity: number }[];
}

// What Complete answers: saved, or not yet. The one check a phone makes before it saves is that
// the number entered again matches (ADR-209): the field event stays open, the same number
// showing, until it does.
export type Completed =
  | { readonly saved: true; readonly event: RecordedEvent }
  | {
      readonly saved: false;
      readonly reason: 'NUMBER_MISMATCH';
      readonly shown: string;
      readonly reentered: string;
    };

// A field event started and not finished: no number yet.
export interface StartedEvent {
  readonly id: string;
  readonly workflow: Workflow;
  readonly kind: FieldEventKind;
  readonly certNumber: string;
  readonly startedAt: Date;
}

export interface NewIncident {
  readonly type: string;
  readonly subType?: string;
  readonly description?: string;
  readonly parties?: string;
  readonly address?: string;
  // Each only where the project's incident form offers it.
  readonly contractor?: string;
  readonly certNumber?: string;
  readonly roeNumber?: string;
  readonly latitude?: string;
  readonly longitude?: string;
  readonly notes?: string;
}

export interface NewDropOffLog {
  readonly residentName?: string;
  readonly originAddress?: string;
  readonly latitude?: string;
  readonly longitude?: string;
  readonly notes?: string;
}

export interface NewSurvey {
  // Pre-work or Post-work, or one of the firm's own, by name.
  readonly workType: string;
  readonly surveyNumber?: string;
  readonly roeNumber?: string;
  readonly latitude?: string;
  readonly longitude?: string;
  readonly notes?: string;
}

export interface NewRoe {
  // The paper ROE's own number, typed; without one the phone gives the next of its block.
  readonly paperNumber?: string;
  readonly parcelId?: string;
  readonly address?: string;
  readonly ownerName?: string;
  readonly signed: boolean;
  readonly signedDate?: string;
}

// A photograph taken with a record the phone made: of what, and where if the phone had a fix.
export interface NewPhoto {
  readonly of: { readonly kind: PhotoOwnerKind; readonly id: string };
  readonly latitude?: string;
  readonly longitude?: string;
}

const seriesOf: Record<Workflow, NumberSeries> = {
  LOAD: 'LOAD',
  HAUL_OUT: 'HAUL_OUT',
  UNIT_RATE: 'UNIT_RATE',
};

export class SimulatedDevice {
  private current: PhoneSetup;
  private readonly clock: StoryClock;
  private readonly started = new Map<string, StartedEvent>();
  private readonly dropped: StartedEvent[] = [];
  private readonly outbox: PhoneRecord[] = [];
  // The last number the phone gave out of each series: its own count, kept across sign-ins.
  private readonly lastUsed = new Map<NumberSeries, number>();
  // The number each finished field event got, for the next of its split chain.
  private readonly numbers = new Map<string, string>();
  // The crew whose badge was last scanned for unit rate work (ADR-111).
  private crew: string | undefined;
  // The scale receipt recorded with each finished disposal, for a tandem's second.
  private readonly receipts = new Map<string, string>();
  // Every record it has sent and what it was told, in the order sent.
  private readonly told: Answered[] = [];
  private photographs = 0;

  constructor(setup: PhoneSetup, clock: StoryClock) {
    this.current = setup;
    this.clock = clock;
  }

  get setup(): PhoneSetup {
    return this.current;
  }

  get name(): string {
    return this.current.name;
  }

  private get lists(): PhoneLists {
    return this.current.lists;
  }

  // The phone's clock: what it stamps on what its monitor records.
  now(): Date {
    return new Date(this.clock.now().getTime() + (this.current.clockErrorMinutes ?? 0) * 60_000);
  }

  // A monitor signs in, online, and the phone takes their assignment and its lists (ADR-240).
  // What it recorded and the numbers it has given out stay with the phone.
  signIn(setup: PhoneSetup): void {
    if (setup.deviceId !== this.current.deviceId) {
      throw new Error(`${this.name} is one phone: it can't sign in as ${setup.name}.`);
    }
    this.current = setup;
    this.crew = undefined;
  }

  // New: the monitor starts a field event by scanning the badge (badge first, ADR-209); its id is
  // made now, on the phone. On unit rate work the crew scanned stays the working crew until
  // another is: a field event started without a badge is that crew's (ADR-111).
  begin(workflow: Workflow, kind: FieldEventKind, certNumber?: string): string {
    const badge = certNumber ?? (kind === 'UNIT_RATE' ? this.crew : undefined);
    if (badge === undefined) {
      throw new Error(`${this.name}: a field event starts with a badge scanned.`);
    }
    if (kind === 'UNIT_RATE') this.crew = badge;
    const startedAt = this.now();
    const id = uuidv7(startedAt);
    this.started.set(id, { id, workflow, kind, certNumber: badge, startedAt });
    return id;
  }

  // The crew a unit rate field event started now would record.
  get workingCrew(): string | undefined {
    return this.crew;
  }

  // What is started and not finished: each waits, with no number.
  get open(): readonly StartedEvent[] {
    return [...this.started.values()];
  }

  // A field event started by mistake: never synced; it stays on the phone (ADR-056). It took no
  // number: the number comes last.
  cancel(id: string): void {
    this.dropped.push(this.startedEvent(id));
    this.started.delete(id);
  }

  get cancelled(): readonly StartedEvent[] {
    return [...this.dropped];
  }

  // The next number the phone would give out of a series; none when it holds no block of it, or
  // its blocks are used up (packages/domain's PhoneNumbers).
  nextNumber(series: NumberSeries): number | null {
    const issued = this.lists.blocks.filter(
      (block) => block.series === series && block.status === 'ISSUED',
    );
    const used = new PhoneNumbers(issued).reported(this.lastUsed.get(series) ?? null);
    return new PhoneNumbers(
      issued.map((block, index) => ({ ...block, lastUsedNumber: used[index] ?? null })),
    ).next();
  }

  // The last number it gave out of a series: what it reports at a sync.
  lastUsedNumber(series: NumberSeries): number | null {
    return this.lastUsed.get(series) ?? null;
  }

  // The harness's own: numbers this phone gave to tickets the story doesn't tell.
  passOver(series: NumberSeries, upTo: number): void {
    this.lastUsed.set(series, upTo);
  }

  // A certifying phone's next cert number, from its block (ADR-151).
  takeCertNumber(): string {
    return new NumberSeriesRules('CERTIFICATION').written(this.take('CERTIFICATION'));
  }

  // Complete: the details and the number last. Saved, the field event waits on the phone for
  // signal.
  complete(id: string, completion: Completion): Completed {
    const started = this.startedEvent(id);
    const series = seriesOf[started.workflow];
    const entry = completion.number;
    let number: string;
    if (entry.from === 'BLOCK') {
      const next = this.nextNumber(series);
      if (next === null) throw new Error(`${this.name} holds no ${series} number to give out.`);
      number = new NumberSeriesRules(series).written(next);
    } else if (entry.from === 'CHAIN') {
      const chain = this.numbers.get(entry.after);
      if (chain === undefined) throw new Error(`${this.name} has no finished field event before.`);
      number = chain;
    } else {
      number = entry.number;
    }
    // A typed number is the hand's own entry; a chain's is carried over.
    if (entry.from === 'BLOCK' || entry.from === 'SCAN') {
      const reentered = completion.reentered ?? number;
      if (reentered !== number) {
        return { saved: false, reason: 'NUMBER_MISMATCH', shown: number, reentered };
      }
    }

    const details = this.details(started, completion);
    const refusals = new FieldEventDetails(started.kind).refusals(details);
    const [refusal] = refusals;
    if (refusal !== undefined) throw new Error(`${this.name}: ${refusal.message}`);

    const endedAt = this.now();
    const offset = utcOffsetMinutes(this.current.timeZone, endedAt);
    let scaleReceiptId: string | null = null;
    if (completion.sameScaleReceiptAs !== undefined) {
      scaleReceiptId = this.receipts.get(completion.sameScaleReceiptAs) ?? null;
      if (scaleReceiptId === null) {
        throw new Error(`${this.name} recorded no scale receipt with that disposal.`);
      }
    } else if (completion.scaleReceipt !== undefined) {
      const siteId = this.site('A scale receipt');
      scaleReceiptId = uuidv7(endedAt);
      this.outbox.push({
        record: 'SCALE_RECEIPT',
        scaleReceipt: {
          id: scaleReceiptId,
          projectId: this.current.projectId,
          receiptNumber: completion.scaleReceipt.receiptNumber,
          siteId,
          grossWeightLb: completion.scaleReceipt.grossWeightLb ?? null,
          tareWeightLb: completion.scaleReceipt.tareWeightLb ?? null,
          netWeightLb: completion.scaleReceipt.netWeightLb ?? null,
          netWeightTons: completion.scaleReceipt.netWeightTons ?? null,
          enteredById: this.current.monitorId,
          deviceId: this.current.deviceId,
          enteredAt: endedAt,
          deviceUtcOffsetMinutes: offset,
        },
      });
    }
    const event: RecordedEvent = {
      id,
      projectId: this.current.projectId,
      workflow: started.workflow,
      kind: started.kind,
      ticketNumber: number,
      monitorId: this.current.monitorId,
      source: 'DEVICE',
      deviceId: this.current.deviceId,
      assignmentId: this.current.assignmentId,
      setupVersion: this.lists.setupVersion,
      temporarySession: false,
      numberTyped: entry.from === 'TYPED',
      numberTypedReasonId:
        entry.from === 'TYPED'
          ? this.pick('reason', this.lists.typedNumberReasons, entry.reason).id
          : null,
      certNumber: started.certNumber,
      certKeyedByHand: false,
      siteId: this.current.siteId ?? null,
      startedAt: started.startedAt,
      endedAt,
      deviceUtcOffsetMinutes: offset,
      endLatitude: completion.endLatitude ?? null,
      endLongitude: completion.endLongitude ?? null,
      address: completion.address ?? null,
      addressSource: completion.addressSource ?? null,
      notes: completion.notes ?? null,
      ...details,
      scaleReceiptId,
    };
    if (entry.from === 'BLOCK') this.lastUsed.set(series, Number(number));
    this.started.delete(id);
    this.numbers.set(id, number);
    if (scaleReceiptId !== null) this.receipts.set(id, scaleReceiptId);
    this.outbox.push({ record: 'FIELD_EVENT', fieldEvent: event });
    return { saved: true, event };
  }

  // An incident: its type, then the firm's sub-type if any, then whichever of the contractor
  // involved, a cert number and an ROE number the project's incident form offers, each optional.
  // It records and never stops work (ADR-052, 137, 328).
  incident(incident: NewIncident): RecordedIncident {
    const type = this.pick('incident type', this.lists.incidentTypes, incident.type);
    const offers = new IncidentOffers(this.lists.incidentOffers);
    const offered = <T>(offer: IncidentOffer, what: string, given: T | undefined): T | null => {
      if (given === undefined) return null;
      if (!offers.offers(offer)) {
        throw new Error(`${this.name} isn't offered ${what} on an incident: not on this project.`);
      }
      return given;
    };
    const contractor = offered('CONTRACTOR', 'a contractor', incident.contractor);
    const made: RecordedIncident = {
      ...this.form(incident),
      incidentTypeId: type.id,
      incidentSubTypeId:
        incident.subType === undefined
          ? null
          : this.pick('incident sub-type', type.subTypes, incident.subType).id,
      description: incident.description ?? null,
      parties: incident.parties ?? null,
      address: incident.address ?? null,
      contractorId:
        contractor === null ? null : this.pick('contractor', this.lists.contractors, contractor).id,
      certNumber: offered('CERT_NUMBER', 'a cert number', incident.certNumber),
      roeNumber: offered('ROE_NUMBER', 'an ROE number', incident.roeNumber),
    };
    this.outbox.push({ record: 'INCIDENT', incident: made });
    return made;
  }

  // A citizen drop-off log, at the assignment's site: no quantity, number or cost (ADR-184, 215).
  dropOffLog(log: NewDropOffLog): RecordedDropOffLog {
    const made: RecordedDropOffLog = {
      ...this.form(log),
      siteId: this.site('A drop-off log'),
      residentName: log.residentName ?? null,
      originAddress: log.originAddress ?? null,
    };
    this.outbox.push({ record: 'DROP_OFF_LOG', dropOffLog: made });
    return made;
  }

  // A survey of a property before work or after it, with the ROE's number as picked or typed
  // (ADR-149, 150).
  survey(survey: NewSurvey): RecordedSurvey {
    const made: RecordedSurvey = {
      ...this.form(survey),
      workTypeId: this.pick('survey work type', this.lists.surveyWorkTypes, survey.workType).id,
      surveyNumber: survey.surveyNumber ?? null,
      roeNumber: survey.roeNumber ?? null,
    };
    this.outbox.push({ record: 'SURVEY', survey: made });
    return made;
  }

  // A photograph taken with a record: its fingerprint is taken now, at capture (ADR-101). The
  // file's upload is Phase 2's, so the harness's phone states where the file would be kept and
  // the same fingerprint for what was uploaded.
  photograph(photo: NewPhoto): RecordedPhoto {
    const capturedAt = this.now();
    this.photographs += 1;
    const file = `${this.name}/${capturedAt.toISOString()}/${String(this.photographs)}`;
    const fingerprint = createHash('sha256').update(file).digest('hex');
    const made: RecordedPhoto = {
      id: uuidv7(capturedAt),
      projectId: this.current.projectId,
      owner: photo.of,
      takenById: this.current.monitorId,
      deviceId: this.current.deviceId,
      capturedAt,
      deviceUtcOffsetMinutes: utcOffsetMinutes(this.current.timeZone, capturedAt),
      latitude: photo.latitude ?? null,
      longitude: photo.longitude ?? null,
      originalSha256: fingerprint,
      uploadedSha256: fingerprint,
      objectKey: `photographs/${file}`,
    };
    this.outbox.push({ record: 'PHOTO', photo: made });
    return made;
  }

  // An ROE: the next number of the phone's ROE block, unless the paper has its own (ADR-149).
  roe(roe: NewRoe): RecordedRoe {
    const madeAt = this.now();
    const made: RecordedRoe = {
      id: uuidv7(madeAt),
      projectId: this.current.projectId,
      roeNumber: roe.paperNumber ?? new NumberSeriesRules('ROE').written(this.take('ROE')),
      parcelId: roe.parcelId ?? null,
      address: roe.address ?? null,
      ownerName: roe.ownerName ?? null,
      signed: roe.signed,
      signedDate: roe.signedDate ?? null,
      source: 'DEVICE',
      madeById: this.current.monitorId,
      deviceId: this.current.deviceId,
      assignmentId: this.current.assignmentId,
      madeAt,
      deviceUtcOffsetMinutes: utcOffsetMinutes(this.current.timeZone, madeAt),
    };
    this.outbox.push({ record: 'ROE', roe: made });
    return made;
  }

  // The payable types the monitor's unit rate list shows: each once, by name (ADR-207, 213).
  get payableTypes(): readonly string[] {
    return [...new Set(this.lists.payItems.map((payItem) => payItem.payableType.name))];
  }

  // The field events still on the phone, waiting for signal.
  get waiting(): readonly RecordedEvent[] {
    return this.outbox.flatMap((entry) =>
      entry.record === 'FIELD_EVENT' ? [entry.fieldEvent] : [],
    );
  }

  // Every record still on the phone, in the order recorded.
  get waitingRecords(): readonly PhoneRecord[] {
    return [...this.outbox];
  }

  // The phone finds signal: its records go first and its photographs after (ARCHITECTURE §9
  // (2)), each in the order recorded. Each leaves the queue once it is answered, whatever the
  // answer, and the phone keeps what it was told. One that gets no answer stays, with the rest
  // after it. How many were sent.
  async sync(intake: SyncIntake): Promise<number> {
    const photographs = this.outbox.filter((entry) => entry.record === 'PHOTO');
    const records = this.outbox.filter((entry) => entry.record !== 'PHOTO');
    this.outbox.splice(0, this.outbox.length, ...records, ...photographs);
    let sent = 0;
    while (this.outbox.length > 0) {
      const [next] = this.outbox;
      if (next === undefined) break;
      const answer = await intake.receive(next);
      this.told.push({ sent: next, answer });
      this.outbox.shift();
      sent += 1;
    }
    return sent;
  }

  // Every record it has sent and what it was told, in the order sent.
  get answers(): readonly Answered[] {
    return [...this.told];
  }

  // What it shows its monitor as not saved: each record the server kept in quarantine, with the
  // reason. Never swallowed (ADR-022; REQ-308c).
  get notSaved(): readonly Answered[] {
    return this.told.filter((one) => one.answer.answer === 'QUARANTINED');
  }

  private startedEvent(id: string): StartedEvent {
    const started = this.started.get(id);
    if (started === undefined) throw new Error(`${this.name} has no field event ${id} started.`);
    return started;
  }

  private take(series: NumberSeries): number {
    const next = this.nextNumber(series);
    if (next === null) throw new Error(`${this.name} holds no ${series} number to give out.`);
    this.lastUsed.set(series, next);
    return next;
  }

  private site(what: string): string {
    if (this.current.siteId === undefined) {
      throw new Error(`${this.name}: ${what} is a site's, and this assignment has no site.`);
    }
    return this.current.siteId;
  }

  private pick<T extends Named>(what: string, list: readonly T[], name: string): T {
    const found = list.find((one) => one.name === name);
    if (found === undefined) throw new Error(`${this.name} has no ${what} "${name}" in its lists.`);
    return found;
  }

  private form(form: {
    readonly latitude?: string;
    readonly longitude?: string;
    readonly notes?: string;
  }): SentForm {
    const madeAt = this.now();
    return {
      id: uuidv7(madeAt),
      projectId: this.current.projectId,
      source: 'DEVICE',
      monitorId: this.current.monitorId,
      deviceId: this.current.deviceId,
      assignmentId: this.current.assignmentId,
      setupVersion: this.lists.setupVersion,
      madeAt,
      deviceUtcOffsetMinutes: utcOffsetMinutes(this.current.timeZone, madeAt),
      latitude: form.latitude ?? null,
      longitude: form.longitude ?? null,
      notes: form.notes ?? null,
    };
  }

  // What the kind records, each pick turned into the id its list holds. A unit rate event's pay
  // item is worked out from the payable type's bands (ADR-213).
  private details(started: StartedEvent, completion: Completion) {
    const debrisTypes = this.lists.debrisTypes[started.workflow] ?? [];
    const work =
      completion.payableType === undefined ? null : this.unitRate(completion.payableType);
    const payItem =
      work === null
        ? null
        : new SizeBands(work.payableType.name, work.payItems).payItemFor(
            completion.measurement ?? null,
          ).payItem;
    return {
      splitSuffix: completion.splitSuffix ?? '',
      formDebrisTypeId:
        completion.debrisType === undefined
          ? null
          : this.pick('debris type', debrisTypes, completion.debrisType).id,
      fieldTagId:
        completion.fieldTag === undefined
          ? null
          : this.pick('field tag', this.lists.fieldTags, completion.fieldTag).id,
      roeNumber: completion.roeNumber ?? null,
      estimateCy: completion.estimateCy ?? null,
      loadCall: completion.loadCall ?? null,
      carriedCount: completion.carriedCount ?? null,
      kindOfWorkId: work?.kindOfWork.id ?? null,
      payableTypeId: work?.payableType.id ?? null,
      payItemId: payItem?.id ?? null,
      unitCount: completion.count ?? null,
      measurementInches: completion.measurement?.inches ?? null,
      measuredAs: completion.measurement?.measuredAs ?? null,
      rootBallInches: completion.rootBallInches ?? null,
      rootBallHalfExposed: completion.rootBallHalfExposed ?? null,
      surveyNumber: completion.surveyNumber ?? null,
      markedIneligible: completion.markedIneligible ?? null,
      items: (completion.items ?? []).map((item) => ({
        itemNameId: this.pick(
          'item',
          this.lists.itemNames.filter((name) => name.kindOfWorkId === work?.kindOfWork.id),
          item.name,
        ).id,
        quantity: item.quantity,
      })),
      carriedTickets: [...(completion.carriedTickets ?? [])],
    };
  }

  // The payable type picked by name, with the pay items its bands tell apart and their kind of
  // work.
  private unitRate(name: string) {
    const payItems = this.lists.payItems.filter((payItem) => payItem.payableType.name === name);
    const [first] = payItems;
    if (first === undefined) throw new Error(`${this.name} has no payable type "${name}".`);
    return { payableType: first.payableType, kindOfWork: first.kindOfWork, payItems };
  }
}
