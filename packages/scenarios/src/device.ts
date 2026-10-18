// A simulated phone (ARCHITECTURE §7–§10, §15): enrolled, holding the assignment its monitor took at
// sign-in (so one project) and the numbered version of its lists, and offline. What its monitor records stays on it, in the order recorded, until it finds signal
// and syncs. It stamps times from its own clock (the story's, plus any error the story gives it)
// and makes each record's id itself (ids.ts).
//
// **It is a client of the sync contract** (packages/contracts; BACKLOG 2.6.1 part 4; ADR-470): it
// sends `SyncSent`, its records as JSON and never which phone it is, reads what comes back with
// `syncAnswerRead`, and passes the suite any client must (`test/sync-client.test.ts`). Only
// "saved" and "already saved" take a record off it for good; a quarantined record and one not
// saved leave its queue and are kept, shown as not saved. Its photographs' records go in its
// syncs too, after the records, each in the sync that carries its record or a later one, and
// never with where the file is kept, which the server makes (ADR-481). **Each photograph is a
// real file** whose SHA-256 its record carries, and the depth file beside it where one is taken;
// once the photograph's record is answered saved, the phone sends its files to the media
// endpoint in parts, each where the server says the file stands, and keeps each until it is
// answered kept (ARCHITECTURE §9 (5); AC-05-09; BACKLOG 2.6.4 part 4; ADR-482, 483).
//
// **Its sync goes to the API's own `Sync`** (apps/api, src/sync/sync.ts; BACKLOG 2.6.2 part 4;
// ADR-475): read off the wire by the contract as the endpoint's boundary reads it, with the
// phone's id beside it as its proof would say. With its records it sends the last number it
// used of each series it holds a block of, and what it holds: the version of the master
// passcode's check and the project its lists are of. It takes in what comes back: the blocks
// it holds now, the passcode's version, and whether its lists are of an older setup version.
//
// It captures as a phone does (adms-field-app §4A.4–§4A.6; BACKLOG 1.3.7): New scans the badge and
// the field event waits; Complete takes the details, picked by name from its lists, then the
// number last: the next of its own block shown, or the truck's copy scanned, and entered again by
// hand. A unit rate pay item is worked out from the size bands by packages/domain's rule, the one
// the server uses. Its screens, its printing and its own duplicate check are the field app's
// (Phase 3).
import { createHash } from 'node:crypto';

import type {
  SentCertification,
  SentDropOffLog,
  SentFieldEvent,
  SentForm,
  SentIncident,
  SentItem,
  SentRecord,
  SentRoe,
  SentScaleReceipt,
  SentSurvey,
} from '@open-adms/api';
import {
  fitByWeight,
  photoFileAnswerRead,
  photoFileGoesOnFrom,
  stored,
  syncAnswerRead,
  syncedRecordAssignment,
  syncedRecordId,
  syncPasscodeUsesAtMost,
  syncPhotosAtMost,
  syncRecordsAtMost,
  syncSentSchema,
  syncUnplannedAssignmentsAtMost,
  photoRead,
  recordRead,
  sentCanonical,
  toWipe,
  turnInAnswerRead,
  turnInSentSchema,
  type FilePartSent,
  type PhotoAnswer,
  type PhotoFileName,
  type PhotoOwnerKind,
  type ReceivedRecord,
  type RecordAnswer,
  type ShownNotSaved,
  type SyncAnswered,
  type SyncClientHolds,
  type SyncedPhoto,
  type SyncedRecord,
  type SyncReceived,
  type SyncSent,
  type TurnInAnswer,
  type TurnInReceived,
  type TurnInSent,
} from '@open-adms/contracts';
import type { AddressSource, FieldEventKind, NumberSeries, Workflow } from '@open-adms/db';
import {
  type BandedPayItem,
  type BoxShape,
  type BoxSign,
  Capacity,
  certificationViews,
  type CertificationView,
  type CertificationKind,
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
import { builtInPolicy } from './policy.ts';

// What a phone sends at a sync is the API's to say (apps/api, src/sync/sent.ts): the harness's
// phone sends exactly those records, under the names its stories know them by.
export type RecordedItem = SentItem;
export type RecordedEvent = SentFieldEvent;
export type RecordedScaleReceipt = SentScaleReceipt;
export type RecordedIncident = SentIncident;
export type RecordedDropOffLog = SentDropOffLog;
export type RecordedSurvey = SentSurvey;
export type RecordedRoe = SentRoe;
// A photograph's record as it goes on the wire: the contract's own shape, a time as text.
export type RecordedPhoto = SyncedPhoto;
export type RecordedCertification = SentCertification;
export type PhoneRecord = SentRecord;
// Everything a phone holds to send: intake's records, and a certification, which is never
// intake's (ADR-469).
export type HeldRecord =
  PhoneRecord | { readonly record: 'CERTIFICATION'; readonly certification: RecordedCertification };
// A photograph's record it holds, named as the stories know it.
export interface HeldPhoto {
  readonly record: 'PHOTO';
  readonly photo: RecordedPhoto;
}

// Where a phone's sync goes: in a story, the sync endpoint of the story's own API over HTTPS
// (`StoryApi`, ADR-491); one sync as the endpoint's boundary reads it, from the phone that
// proved itself. And where a part of a photograph's file goes: the media endpoint, its answer as
// it comes off the wire. A test's own server in memory keeps the same shape.
export interface PhoneServer {
  received(deviceId: string, sent: SyncReceived): Promise<{ readonly answered: SyncAnswered }>;
  filePart(deviceId: string, part: FilePartSent): Promise<unknown>;
  // A phone turned in under the master passcode: the turn-in endpoint, its answer as it comes
  // off the wire (ADR-488, 491). A server of a story's or a test's own that
  // turns no phone in has none.
  turnIn?(deviceId: string, sent: TurnInReceived): Promise<unknown>;
}

// What a story's server throws where the phone has lost its signal mid-upload: nothing came
// back. Anything else a server throws stops the story.
export class NoSignal extends Error {
  constructor() {
    super('The phone has no signal.');
    this.name = 'NoSignal';
  }
}

// What a story's server throws where the API answered `429 LIMITED` (ARCHITECTURE §6, Abuse;
// ADR-416, 490) or `503 BUSY` (ADR-524): a limit was reached, or the database couldn't do the
// work in time, and the answer says how many seconds to wait. Nothing the refused request asked
// was kept but what an earlier answer said was saved, so the phone holds it all, waits and sends
// it again under the same ids (AC-05-51; ADR-505).
export class ToldToWait extends Error {
  readonly seconds: number;
  // `LIMITED` or `BUSY`.
  readonly code: string;

  constructor(seconds: number, code = 'LIMITED') {
    super(`The server said to wait ${String(seconds)} s (${code}).`);
    this.name = 'ToldToWait';
    this.seconds = seconds;
    this.code = code;
  }
}

// How many times in a row one sync or one part may be told to wait before the story stops: a
// phone that waits as it is told is let through at the next stretch, so more is a story whose
// clocks don't agree, never a busy server.
const toldToWaitInARowAtMost = 10;

// A photograph's file the phone holds until the server says it kept it: the bytes its record's
// fingerprint is of, where it goes on from, and whether its record was answered saved.
interface HeldFile {
  readonly photoId: string;
  readonly file: PhotoFileName;
  readonly bytes: Buffer;
  from: number;
  saved: boolean;
}

// A file as the phone's camera writes one, of so many bytes: a JPEG's first bytes, or a PNG's
// for a depth file, then bytes drawn from what it is of, so the same photograph is the same file.
function fileOf(of: string, bytes: number, kind: 'jpeg' | 'png'): Buffer {
  const start =
    kind === 'jpeg'
      ? Buffer.from([0xff, 0xd8, 0xff, 0xe1])
      : Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const body: Buffer[] = [];
  for (let made = start.length, round = 0; made < bytes; round += 1) {
    const more = createHash('sha256')
      .update(`${of} ${String(round)}`)
      .digest();
    body.push(more);
    made += more.length;
  }
  return Buffer.concat([start, ...body]).subarray(0, bytes);
}

const sha256Of = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

// Every id a value holds, however deep, added to those given: what a phone was sent, or what a
// record it sends names.
const anId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function idsIn(value: unknown, ids: Set<string>): Set<string> {
  if (typeof value === 'string') {
    if (anId.test(value)) ids.add(value);
  } else if (Array.isArray(value)) {
    for (const each of value) idsIn(each, ids);
  } else if (value !== null && typeof value === 'object') {
    for (const each of Object.values(value)) idsIn(each, ids);
  }
  return ids;
}

// What the phone names a thing it sent with no id the server could read by, at turn-in: the
// SHA-256 of what was sent as canonical JSON (the contracts' `sentCanonical`), as the server
// knows the record it holds (ADR-472, 488).
export const sentPrint = (sent: unknown): string =>
  createHash('sha256')
    .update(sentCanonical(JSON.parse(JSON.stringify(sent))), 'utf8')
    .digest('hex');

// A record or a photograph the phone sent and what it was told: saved, already saved,
// quarantined or not saved (ARCHITECTURE §9 (4); ADR-467, 481).
export interface Answered {
  readonly sent: HeldRecord | HeldPhoto;
  readonly answer: RecordAnswer | PhotoAnswer;
}

// What it reports besides its records (the contract's `SyncSent`).
type Reports = Pick<SyncSent, 'unplannedAssignments' | 'passcodeUses' | 'lastUsed'>;

// A record as it goes on the wire: JSON, a time as a UTC instant, and never that a phone made
// it or which (ADR-466): the phone proved that.
export function onTheWire(held: HeldRecord): SyncedRecord {
  const said = (record: object): object =>
    Object.fromEntries(
      Object.entries(record).filter(([name]) => name !== 'source' && name !== 'deviceId'),
    );
  const wire = (): object => {
    switch (held.record) {
      case 'FIELD_EVENT':
        return { record: held.record, fieldEvent: said(held.fieldEvent) };
      case 'SCALE_RECEIPT':
        return { record: held.record, scaleReceipt: said(held.scaleReceipt) };
      case 'INCIDENT':
        return { record: held.record, incident: said(held.incident) };
      case 'DROP_OFF_LOG':
        return { record: held.record, dropOffLog: said(held.dropOffLog) };
      case 'SURVEY':
        return { record: held.record, survey: said(held.survey) };
      case 'ROE':
        return { record: held.record, roe: said(held.roe) };
      case 'CERTIFICATION':
        return { record: held.record, certification: said(held.certification) };
    }
  };
  return JSON.parse(JSON.stringify(wire())) as SyncedRecord;
}

// A record as the server read it, as the phone that made it holds it: that a phone made it, and
// which (the harness's records carry both; the wire carries neither, ADR-466).
export function fromPhone(deviceId: string, read: ReceivedRecord): HeldRecord {
  const phone = { source: 'DEVICE', deviceId } as const;
  switch (read.record) {
    case 'FIELD_EVENT':
      return { record: read.record, fieldEvent: { ...read.fieldEvent, ...phone } };
    case 'SCALE_RECEIPT':
      return { record: read.record, scaleReceipt: { ...read.scaleReceipt, deviceId } };
    case 'INCIDENT':
      return { record: read.record, incident: { ...read.incident, ...phone } };
    case 'DROP_OFF_LOG':
      return { record: read.record, dropOffLog: { ...read.dropOffLog, ...phone } };
    case 'SURVEY':
      return { record: read.record, survey: { ...read.survey, ...phone } };
    case 'ROE':
      return { record: read.record, roe: { ...read.roe, ...phone } };
    case 'CERTIFICATION':
      return { record: read.record, certification: { ...read.certification, deviceId } };
  }
}

// A record it holds, as intake takes it: a certification is never intake's (ADR-469).
export function forIntake(held: HeldRecord): PhoneRecord {
  if (held.record === 'CERTIFICATION') throw new Error('A certification is never intake’s.');
  return held;
}

// The id its phone made for a record or a photograph it holds, whatever its kind.
export function heldId(held: HeldRecord | HeldPhoto): string {
  return held.record === 'PHOTO' ? held.photo.id : syncedRecordId(onTheWire(held));
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
  // The project's certifications, by number: a replaced one is picked from them (ADR-082).
  readonly certifications: readonly { readonly id: string; readonly certNumber: string }[];
  // The truck lists, for a phone that certifies or takes disposals (ADR-552 (3)(a), (b)): the
  // firm's vehicle types, vehicle features and crew types, and the project's primes, each with
  // the subs placed under it.
  readonly vehicleTypes: readonly (Named & { readonly kind: CertificationKind })[];
  readonly vehicleFeatures: readonly Named[];
  readonly crewTypes: readonly Named[];
  readonly primes: readonly (Named & {
    readonly subs: readonly (Named & { readonly tier: 1 | 2 })[];
  })[];
  // Who a certifying phone's monitor may pick as a helper (ADR-294, 552 (3)(c)).
  readonly helpers: readonly Named[];
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
  // The version of the master passcode whose check the phone holds. Not given, it holds none,
  // and its first sync brings it one (ADR-473).
  readonly masterPasscodeVersion?: number;
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

// One measured box, as the sheet has it: a shape's own measurements, whole inches; the first is
// the primary, each after it a feature, picked by name from the phone's lists or typed.
export interface NewBox {
  readonly shape: BoxShape;
  readonly sign: BoxSign;
  readonly feature?: string;
  readonly featureOther?: string;
  readonly length?: number | null;
  readonly secondLength?: number | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly diameter?: number | null;
  readonly radius?: number | null;
  readonly run?: number | null;
  readonly corners?: number | null;
}

// A certification made on the phone (adms-certifications §3A): picked as every other record is,
// by name from the phone's lists (ADR-552 (3)(f)): the prime, the vehicle type or crew type, each
// box's feature and any helper; a replaced certification by its number. A sub is typed, into
// tier 1 or 2 (ADR-108), and a vehicle type or a feature the list doesn't have may be typed.
export interface NewCertification {
  readonly kind: CertificationKind;
  // The pre-printed sheet's number, typed; without one the next of the phone's block (ADR-045).
  readonly paperNumber?: string;
  readonly prime: string;
  readonly firstTierSub?: string;
  readonly secondTierSub?: string;
  readonly vehicleType?: string;
  readonly vehicleTypeOther?: string;
  readonly crewType?: string;
  readonly boxes: readonly NewBox[];
  readonly driverName?: string;
  readonly driverPhone?: string;
  readonly driverLicenceNumber?: string;
  readonly driverLicenceState?: string;
  readonly driverLicenceExpiry?: string;
  readonly tagNumber?: string;
  readonly tagState?: string;
  readonly tagExpiry?: string;
  // Each by name, from the people the phone's lists name as helpers (ADR-294).
  readonly helpers?: readonly string[];
  readonly clientRepresentativeName?: string;
  readonly contractorRepresentativeName?: string;
  readonly replaces?: { readonly certNumber: string; readonly reason: string };
  readonly notes?: string;
}

// A photograph taken with a record the phone made: of what, which of a certification's views,
// where if the phone had a fix, and whether a depth file goes beside it (its fingerprint is then
// sent too, ADR-482). How large its file is, shrunk to send: 4,096 bytes where not said.
export interface NewPhoto {
  readonly of: { readonly kind: PhotoOwnerKind; readonly id: string };
  readonly view?: CertificationView;
  readonly latitude?: string;
  readonly longitude?: string;
  readonly depthFile?: boolean;
  readonly bytes?: number;
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
  private readonly outbox: HeldRecord[] = [];
  // Its photographs' records still to send, in the order taken.
  private readonly photoOutbox: RecordedPhoto[] = [];
  // Its photographs' files not yet kept on the server, in the order taken, and the most a part
  // of one may hold; the files the upload under way leaves for the next, once answered not the
  // one fingerprinted twice; the part it sent last.
  private readonly files = new Map<string, HeldFile>();
  private partBytes: number;
  private readonly resting = new Set<string>();
  private lastPart: FilePartSent | undefined;
  // What it reports besides its records, still to be answered; and the sync it sent last.
  private reports: Reports = { unplannedAssignments: [], passcodeUses: [], lastUsed: [] };
  private last:
    | {
        readonly sync: SyncSent;
        readonly held: readonly HeldRecord[];
        readonly photos: readonly RecordedPhoto[];
      }
    | undefined;
  // What it shows as not saved, and the reports among them, which it keeps.
  private readonly shown: ShownNotSaved[] = [];
  private keptReports: { readonly id: string; readonly kind: 'ASSIGNMENT' | 'USE' }[] = [];
  // Whether it was turned in and wiped (ADR-488): it holds nothing since.
  private turnedIn = false;
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
  // The seconds it was told to wait, each time a server said so.
  private readonly waits: number[] = [];
  private photographs = 0;
  // The blocks a sync answered, by series: what it holds of each since, until it takes its
  // lists again.
  private readonly toppedUp = new Map<NumberSeries, readonly PhoneBlock[]>();
  // The version of the master passcode whose check it holds; none until a sync brings one.
  private passcodeVersion: number | null;
  // The setup version its last sync answered for its project, where one was.
  private setupVersionNow: number | null = null;
  // Every id it was sent (its setups and their lists, from each sign-in) and every record and
  // photograph it made: a record it makes names no other (ADR-552 (3)(f)). And what it was
  // handed by the harness (`hold`), which it sends as it was handed.
  private readonly known = new Set<string>();
  private readonly handed = new Set<string>();

  // `partBytesAtMost`: the most a part of a file may hold, as the server takes them: the
  // release's `MEDIA_PART_BYTES_AT_MOST` where not said.
  constructor(
    setup: PhoneSetup,
    clock: StoryClock,
    partBytesAtMost: number = builtInPolicy().mediaPartBytesAtMost,
  ) {
    this.current = setup;
    this.clock = clock;
    idsIn(setup, this.known);
    this.passcodeVersion = setup.masterPasscodeVersion ?? null;
    this.partBytes = partBytesAtMost;
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
    idsIn(setup, this.known);
    this.crew = undefined;
    this.toppedUp.clear();
    this.setupVersionNow = null;
  }

  // The blocks it holds: its lists', and of a series a sync has topped up since, what that sync
  // answered.
  get blocks(): readonly PhoneBlock[] {
    return [
      ...this.lists.blocks.filter((block) => !this.toppedUp.has(block.series)),
      ...[...this.toppedUp.values()].flat(),
    ];
  }

  // The version of the master passcode whose check it holds.
  get masterPasscodeVersion(): number | null {
    return this.passcodeVersion;
  }

  // Whether its last sync answered a setup version other than the one its lists are: it reads
  // its lists again when its monitor next signs in with a connection (ADR-453, 473).
  get listsStale(): boolean {
    return this.setupVersionNow !== null && this.setupVersionNow !== this.lists.setupVersion;
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
    const issued = this.blocks.filter(
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
      masterPasscodeSession: null,
      numberTyped: entry.from === 'TYPED',
      numberTypedReasonId:
        entry.from === 'TYPED'
          ? this.pick('reason', this.lists.typedNumberReasons, entry.reason).id
          : null,
      certNumber: started.certNumber,
      certKeyedByHand: false,
      typedCapacityCy: null,
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

  // A photograph taken with a record: its fingerprint is taken now, at capture, and the
  // fingerprint of the file it will upload, shrunk (ADR-101): the SHA-256 of the very bytes it
  // then sends, and of the depth file's beside it. Where the file is kept is the server's to
  // make; the files go by the media endpoint once the record is saved (ADR-482).
  photograph(photo: NewPhoto): RecordedPhoto {
    const capturedAt = this.now();
    this.photographs += 1;
    const file = `${this.name}/${capturedAt.toISOString()}/${String(this.photographs)}`;
    const fingerprint = (of: string): string => createHash('sha256').update(of).digest('hex');
    const uploaded = fileOf(`${file} as uploaded`, photo.bytes ?? 4096, 'jpeg');
    const depth = photo.depthFile === true ? fileOf(`${file} depth`, 1024, 'png') : null;
    const made: RecordedPhoto = {
      id: uuidv7(capturedAt),
      projectId: this.current.projectId,
      owner: photo.of,
      view: photo.view ?? null,
      takenById: this.current.monitorId,
      capturedAt: capturedAt.toISOString(),
      deviceUtcOffsetMinutes: utcOffsetMinutes(this.current.timeZone, capturedAt),
      latitude: photo.latitude ?? null,
      longitude: photo.longitude ?? null,
      originalSha256: fingerprint(`${file} as taken`),
      uploadedSha256: sha256Of(uploaded),
      depthSha256: depth === null ? null : sha256Of(depth),
    };
    this.photoOutbox.push(made);
    this.holdFile({ photoId: made.id, file: 'photo', bytes: uploaded, saved: false });
    if (depth !== null) {
      this.holdFile({ photoId: made.id, file: 'depth', bytes: depth, saved: false });
    }
    return made;
  }

  // The file of a photograph it holds, as it will send it: a story that swaps one says so here,
  // and the server finds it isn't the one fingerprinted.
  fileOf(photoId: string, file: PhotoFileName = 'photo'): Buffer {
    const held = this.files.get(`${photoId} ${file}`);
    if (held === undefined) throw new Error(`${this.name} holds no ${file} file of ${photoId}.`);
    return held.bytes;
  }

  swapFile(photoId: string, bytes: Buffer, file: PhotoFileName = 'photo'): void {
    const held = this.files.get(`${photoId} ${file}`);
    if (held === undefined) throw new Error(`${this.name} holds no ${file} file of ${photoId}.`);
    this.files.set(`${photoId} ${file}`, { ...held, bytes, from: 0 });
  }

  // On a poor signal the phone sends smaller parts: never larger than the server takes.
  sendsPartsOf(bytes: number): void {
    if (bytes < 1 || bytes > this.partBytes) {
      throw new Error(`${this.name} sends parts of 1 to ${String(this.partBytes)} bytes.`);
    }
    this.partBytes = bytes;
  }

  private holdFile(held: Omit<HeldFile, 'from'>): void {
    this.files.set(`${held.photoId} ${held.file}`, {
      ...held,
      bytes: Buffer.from(held.bytes),
      from: 0,
    });
  }

  // A certification of a container or a crew (adms-certifications §3A; ADR-469): the boxes as
  // measured, each measurement its shape doesn't hold left empty. The phone works the capacity
  // out with the server's own rule (packages/domain's `Capacity`) to show it, and never sends
  // it: what it shows is answered beside the record. Measurements that give no capacity are not
  // a certification, here as on the server. Its five photographs are taken with it, and go
  // after it (ADR-179, 481).
  certify(certification: NewCertification): {
    readonly record: RecordedCertification;
    readonly capacityCy: number | null;
  } {
    const picked = (what: string, list: readonly Named[], name: string | undefined) =>
      name === undefined ? null : this.pick(what, list, name).id;
    const boxes = certification.boxes.map((box) => ({
      featureId: picked('vehicle feature', this.lists.vehicleFeatures, box.feature),
      featureOther: box.featureOther ?? null,
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
    }));
    const reading = new Capacity(
      certification.kind,
      boxes.map((box, position) => ({ ...box, position })),
    ).work();
    if (reading.refusal !== null) throw new Error(`${this.name}: ${reading.refusal.message}`);
    const certifiedAt = this.now();
    const record: RecordedCertification = {
      id: uuidv7(certifiedAt),
      projectId: this.current.projectId,
      certNumber: certification.paperNumber ?? this.takeCertNumber(),
      kind: certification.kind,
      primeId: this.pick('prime', this.lists.primes, certification.prime).id,
      firstTierSub: certification.firstTierSub ?? null,
      secondTierSub: certification.secondTierSub ?? null,
      vehicleTypeId: picked('vehicle type', this.lists.vehicleTypes, certification.vehicleType),
      vehicleTypeOther: certification.vehicleTypeOther ?? null,
      crewTypeId: picked('crew type', this.lists.crewTypes, certification.crewType),
      boxes,
      driverName: certification.driverName ?? null,
      driverPhone: certification.driverPhone ?? null,
      driverLicenceNumber: certification.driverLicenceNumber ?? null,
      driverLicenceState: certification.driverLicenceState ?? null,
      driverLicenceExpiry: certification.driverLicenceExpiry ?? null,
      tagNumber: certification.tagNumber ?? null,
      tagState: certification.tagState ?? null,
      tagExpiry: certification.tagExpiry ?? null,
      certifiedAt,
      deviceUtcOffsetMinutes: utcOffsetMinutes(this.current.timeZone, certifiedAt),
      certifiedById: this.current.monitorId,
      deviceId: this.current.deviceId,
      assignmentId: this.current.assignmentId,
      helperIds: (certification.helpers ?? []).map(
        (helper) => this.pick('helper', this.lists.helpers, helper).id,
      ),
      clientRepresentativeName: certification.clientRepresentativeName ?? null,
      contractorRepresentativeName: certification.contractorRepresentativeName ?? null,
      replaces:
        certification.replaces === undefined
          ? null
          : {
              replacedId: this.certificationNumbered(certification.replaces.certNumber).id,
              reason: certification.replaces.reason,
            },
      notes: certification.notes ?? null,
    };
    this.outbox.push({ record: 'CERTIFICATION', certification: record });
    // Its five photographs, one a view, taken as it is certified (ADR-179; AC-04-77).
    for (const view of certificationViews) {
      this.photograph({ of: { kind: 'CERTIFICATION', id: record.id }, view });
    }
    return { record, capacityCy: reading.capacityCy };
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
  get waitingRecords(): readonly HeldRecord[] {
    return [...this.outbox];
  }

  // Its photographs' records still to send.
  get waitingPhotos(): readonly RecordedPhoto[] {
    return [...this.photoOutbox];
  }

  // Each file of its photographs it holds that the server has not said it kept, as "<the
  // photograph's id> <file>", and how far each has gone as the server last said.
  get holdsFiles(): readonly string[] {
    return [...this.files.keys()];
  }

  get filesWaiting(): readonly {
    readonly name: string;
    readonly from: number;
    readonly saved: boolean;
  }[] {
    return [...this.files.entries()].map(([name, held]) => ({
      name,
      from: held.from,
      saved: held.saved,
    }));
  }

  // The harness's own: what the phone holds that no story told, as the contract's suite hands
  // it over (`SyncClientHolds`): records as they go on the wire, and the reports a sync carries.
  // A story's phone holds no report: one its story tells is sent in a sync of its own
  // (`stories/board.ts`).
  hold(more: SyncClientHolds): void {
    for (const record of more.records) {
      const read = recordRead(record);
      if (!read.read) throw new Error(`${this.name}: ${read.notice.message}`);
      const handed = fromPhone(this.current.deviceId, read.record);
      this.handed.add(heldId(handed));
      this.outbox.push(handed);
    }
    for (const photo of more.photos) {
      const read = photoRead(photo);
      if (!read.read) throw new Error(`${this.name}: ${read.notice.message}`);
      this.handed.add(photo.id);
      this.photoOutbox.push(photo);
    }
    // A file of a photograph it was not handed had its record saved before.
    for (const file of more.files) {
      const saved = !more.photos.some(({ id }) => id === file.photoId);
      this.holdFile({ ...file, bytes: Buffer.from(file.bytes), saved });
    }
    this.partBytes = more.filePartBytesAtMost;
    this.reports = {
      unplannedAssignments: [...this.reports.unplannedAssignments, ...more.unplannedAssignments],
      passcodeUses: [...this.reports.passcodeUses, ...more.passcodeUses],
      lastUsed: [...more.lastUsed],
    };
  }

  // The last number it used of each series it reports: what the suite handed it, or of each
  // series of its project it holds a block of (ADR-065).
  private numbersReported(): SyncSent['lastUsed'] {
    if (this.reports.lastUsed.length > 0) return this.reports.lastUsed;
    const held = new Set(
      this.blocks.filter((block) => block.status === 'ISSUED').map((block) => block.series),
    );
    return [...held].map((series) => ({
      projectId: this.current.projectId,
      series,
      lastUsedNumber: this.lastUsed.get(series) ?? null,
    }));
  }

  // The next sync, as the contract has it (`SyncSent`; ADR-467, 481): the phone's clock, the
  // reports it holds, its records, its photographs' records, the last number it used of each
  // series it reports. No more than the contract's limits a sync, in counts and in weight; a
  // scale receipt goes ahead of the disposal that points at it, no record ahead of an unplanned
  // assignment that has to wait for the next sync, and no photograph ahead of the sync that
  // carries its record.
  sends(): SyncSent {
    const clockAt = this.now();
    const unplannedAssignments = this.reports.unplannedAssignments.slice(
      0,
      syncUnplannedAssignmentsAtMost,
    );
    const waits = new Set(
      this.reports.unplannedAssignments.slice(syncUnplannedAssignmentsAtMost).map(({ id }) => id),
    );
    const ordered: { readonly held: HeldRecord; readonly wire: SyncedRecord }[] = [];
    const made = new Set([
      ...this.outbox.map(heldId),
      ...this.photoOutbox.map(({ id }) => id),
      ...this.told.map(({ sent }) => heldId(sent)),
    ]);
    const namesOnlyWhatItHolds = (id: string, wire: unknown): void => {
      if (this.handed.has(id)) return;
      for (const named of idsIn(wire, new Set())) {
        if (!this.known.has(named) && !made.has(named)) {
          throw new Error(`${this.name} sends ${named} in ${id}, an id it was never sent.`);
        }
      }
    };
    for (const photo of this.photoOutbox) namesOnlyWhatItHolds(photo.id, photo);
    for (const held of this.outbox) {
      const wire = onTheWire(held);
      namesOnlyWhatItHolds(heldId(held), wire);
      const pointsAtIt =
        wire.record === 'SCALE_RECEIPT'
          ? ordered.findIndex(
              (each) =>
                each.wire.record === 'FIELD_EVENT' &&
                each.wire.fieldEvent.scaleReceiptId === wire.scaleReceipt.id,
            )
          : -1;
      if (pointsAtIt >= 0) ordered.splice(pointsAtIt, 0, { held, wire });
      else ordered.push({ held, wire });
    }
    const sync: SyncSent = {
      clockAt: clockAt.toISOString(),
      deviceUtcOffsetMinutes: utcOffsetMinutes(this.current.timeZone, clockAt),
      unplannedAssignments,
      passcodeUses: this.reports.passcodeUses.slice(0, syncPasscodeUsesAtMost),
      records: [],
      photos: [],
      lastUsed: this.numbersReported(),
      // The check of the master passcode it holds, and the project its lists are of.
      holds: {
        masterPasscodeVersion: this.passcodeVersion,
        listsProjectId: this.current.projectId,
      },
    };
    // As many as the counts let, then as many of those as the sync's weight lets (ADR-504).
    const byCount = ordered
      .filter(({ wire }) => !waits.has(syncedRecordAssignment(wire) ?? ''))
      .slice(0, syncRecordsAtMost);
    const going = byCount.slice(
      0,
      fitByWeight(
        sync,
        byCount.map(({ wire }) => wire),
      ),
    );
    sync.records = going.map(({ wire }) => wire);
    const goingIds = new Set(going.map(({ held }) => heldId(held)));
    const staying = new Set(this.outbox.map(heldId).filter((id) => !goingIds.has(id)));
    const photosByCount = this.photoOutbox
      .filter(({ owner }) => !staying.has(owner.id))
      .slice(0, syncPhotosAtMost);
    const photos = photosByCount.slice(0, fitByWeight(sync, photosByCount));
    sync.photos = photos.map((photo) => ({ ...photo }));
    this.last = { sync, held: going.map(({ held }) => held), photos };
    return sync;
  }

  // What came back for the sync it sent last, off the wire; `undefined` where nothing came. Read
  // by the contract's own rule (`syncAnswerRead`): what is no answer to what was sent marks
  // nothing, and everything stays. Otherwise each thing answered leaves the queue; one the
  // server did not store is kept and shown as not saved (AC-05-20, 46). Whether it was an
  // answer.
  answered(answer: unknown): boolean {
    const last = this.last;
    if (last === undefined) throw new Error(`${this.name} was answered before it sent anything.`);
    this.last = undefined;
    const read = answer === undefined ? null : syncAnswerRead(last.sync, answer);
    if (read === null) return false;
    const reported = [
      ...read.unplannedAssignments.map((each) => ({
        id: each.assignmentId,
        kind: 'ASSIGNMENT' as const,
        ...each,
      })),
      ...read.passcodeUses.map((each) => ({ id: each.useId, kind: 'USE' as const, ...each })),
    ];
    const gone = new Set(reported.map(({ id }) => id));
    this.reports = {
      unplannedAssignments: this.reports.unplannedAssignments.filter(({ id }) => !gone.has(id)),
      passcodeUses: this.reports.passcodeUses.filter(({ id }) => !gone.has(id)),
      lastUsed: this.reports.lastUsed,
    };
    for (const each of reported) {
      if (stored(each)) continue;
      this.keptReports.push({ id: each.id, kind: each.kind });
      this.shown.push({ id: each.id, reason: each.reason ?? each.answer, message: null });
    }
    last.held.forEach((sent, place) => {
      const each = read.records[place];
      if (each === undefined) return;
      this.outbox.splice(this.outbox.indexOf(sent), 1);
      this.told.push({ sent, answer: each });
      if ('reason' in each) {
        this.shown.push({ id: heldId(sent), reason: each.reason, message: each.message });
      }
    });
    last.photos.forEach((photo, place) => {
      const each = read.photos[place];
      if (each === undefined) return;
      this.photoOutbox.splice(this.photoOutbox.indexOf(photo), 1);
      this.told.push({ sent: { record: 'PHOTO', photo }, answer: each });
      if ('reason' in each) {
        this.shown.push({ id: photo.id, reason: each.reason, message: each.message });
      }
      // Its files go once its record is saved; one not saved keeps them with it.
      for (const file of this.files.values()) {
        if (file.photoId === photo.id) file.saved = stored(each);
      }
    });
    // What the sync brought besides: of each series topped up, the blocks it holds now (where
    // a report wasn't taken it holds what it held); the master passcode's version, with its
    // check where it held another; the setup version its project's phones are shown now.
    for (const held of read.numbers) {
      if (!held.toppedUp || held.projectId !== this.current.projectId) continue;
      this.toppedUp.set(
        held.series,
        held.blocks.map((block) => ({ ...block, series: held.series, status: 'ISSUED' })),
      );
    }
    // A phone not in service is brought nothing (ADR-531): it keeps the version it holds.
    this.passcodeVersion = read.masterPasscode?.version ?? this.passcodeVersion;
    this.setupVersionNow = read.setupVersion?.version ?? null;
    return true;
  }

  // The phone finds signal: a sync of the contract's at a time, its records first and its
  // photographs' records after them (ARCHITECTURE §9 (2)), each in the order recorded, until it
  // holds none. Each sync goes as JSON and is read by the contract as the endpoint's boundary
  // reads it, with the phone's id as its proof would say it; what comes back is read off the
  // wire too. A sync that gets no answer leaves everything it carried on the phone, to go again
  // under the same ids; one the server says to wait for, likewise, after the seconds it was
  // told (ADR-505). How many records and photographs were answered.
  async sync(server: PhoneServer): Promise<number> {
    let sent = 0;
    let toldInARow = 0;
    while (this.outbox.length > 0 || this.photoOutbox.length > 0) {
      const sync = this.sends();
      if (sync.records.length === 0 && sync.photos.length === 0) break;
      const wire: unknown = JSON.parse(JSON.stringify(sync));
      const sentAt = this.clock.now();
      let received: { readonly answered: SyncAnswered };
      try {
        received = await server.received(this.current.deviceId, syncSentSchema.parse(wire));
      } catch (caught) {
        if (!(caught instanceof ToldToWait)) throw caught;
        this.answered(undefined);
        toldInARow = this.waitsOut(caught, sentAt, toldInARow);
        continue;
      }
      toldInARow = 0;
      if (!this.answered(JSON.parse(JSON.stringify(received.answered)))) {
        throw new Error(`${this.name}: what came back is no answer to the sync it sent.`);
      }
      sent += sync.records.length + sync.photos.length;
    }
    await this.upload(server);
    return sent;
  }

  // The seconds it was told to wait, each time a server said so, in the order told.
  get toldToWait(): readonly number[] {
    return [...this.waits];
  }

  // Told to wait: it waits, on the story's clock, the seconds it was told from when it sent
  // what was refused (the clock stands still while the server answers, so that is when it was
  // told), and goes on. Phones told at once wait together. How many times in a row now.
  private waitsOut(told: ToldToWait, sentAt: Date, inARow: number): number {
    if (inARow >= toldToWaitInARowAtMost) {
      throw new Error(
        `${this.name} was told to wait ${String(inARow + 1)} times in a row: ${told.message}`,
      );
    }
    this.waits.push(told.seconds);
    this.clock.until(new Date(sentAt.getTime() + told.seconds * 1000));
    return inARow + 1;
  }

  // The next part of a file it sends to the media endpoint (`sendPhotoFilePartEndpoint`): of
  // the first file whose photograph's record was answered saved, from where the server last
  // said it stands, no larger than the server takes. None where it has none to send.
  sendsFilePart(): FilePartSent | null {
    for (const [name, held] of this.files) {
      if (!held.saved || this.resting.has(name)) continue;
      this.lastPart = {
        photoId: held.photoId,
        file: held.file,
        offset: held.from,
        length: held.bytes.length,
        bytes: held.bytes.subarray(held.from, held.from + this.partBytes),
      };
      return this.lastPart;
    }
    return null;
  }

  // What came back for the part it sent last, off the wire; `undefined` where nothing came. Read
  // by the contract's own rule: kept, it lets the file go; receiving, it goes on from what the
  // server took; not matched, from the first byte; anything else, from where it stood. How it
  // was answered, where it was.
  filePartAnswered(answer: unknown): 'KEPT' | 'RECEIVING' | 'NOT_MATCHED' | null {
    const part = this.lastPart;
    if (part === undefined) throw new Error(`${this.name} was answered before it sent a part.`);
    this.lastPart = undefined;
    const name = `${part.photoId} ${part.file}`;
    const held = this.files.get(name);
    if (held === undefined) return null;
    const read = photoFileAnswerRead(answer);
    const from = photoFileGoesOnFrom(read, part.offset);
    if (from === null) this.files.delete(name);
    else held.from = from;
    return read?.upload ?? null;
  }

  // Its photographs' files, after the records that carried them were answered (ARCHITECTURE §9
  // (2), (5); AC-05-09; ADR-482): each part answered before the next goes, until each file is
  // kept. Where the signal goes (`NoSignal`) it stops, holding every file not kept, and goes on
  // from there next time; where the server says to wait (`ToldToWait`), it waits the seconds it
  // was told and sends the same part again (ADR-505). A file answered not the one fingerprinted
  // goes again from its first byte, and rests till the next upload if it is answered so again.
  // How many parts it sent.
  async upload(server: PhoneServer): Promise<number> {
    this.resting.clear();
    const notMatched = new Map<string, number>();
    let parts = 0;
    let toldInARow = 0;
    for (let part = this.sendsFilePart(); part !== null; part = this.sendsFilePart()) {
      parts += 1;
      const sentAt = this.clock.now();
      let answer: unknown;
      try {
        answer = JSON.parse(JSON.stringify(await server.filePart(this.current.deviceId, part)));
      } catch (caught) {
        if (caught instanceof ToldToWait) {
          this.filePartAnswered(undefined);
          toldInARow = this.waitsOut(caught, sentAt, toldInARow);
          continue;
        }
        if (!(caught instanceof NoSignal)) throw caught;
        this.filePartAnswered(undefined);
        return parts;
      }
      toldInARow = 0;
      if (this.filePartAnswered(answer) === 'NOT_MATCHED') {
        const name = `${part.photoId} ${part.file}`;
        const times = (notMatched.get(name) ?? 0) + 1;
        notMatched.set(name, times);
        if (times >= 2) this.resting.add(name);
      }
    }
    return parts;
  }

  // "Sync and turn in" (ARCHITECTURE §8; AC-02-58; ADR-096, 488): what it sends to be turned
  // in, under the passcode typed on it. Everything it still holds, each once, by the id it made:
  // its reports and records waiting or not stored, its photographs waiting, not stored, or with
  // a file not yet kept; and by its fingerprint what it sent that was answered under no id. The
  // last number it used of each series it holds, and never which phone it is.
  turnsIn(passcode: string): TurnInSent {
    const answeredUnder = (one: Answered) => ('id' in one.answer ? one.answer.id : null);
    const notStored = this.notSaved;
    const records = notStored.filter(({ sent }) => sent.record !== 'PHOTO');
    const photos = notStored.filter(({ sent }) => sent.record === 'PHOTO');
    const kept = (kind: 'ASSIGNMENT' | 'USE') =>
      this.keptReports.filter((each) => each.kind === kind).map(({ id }) => id);
    const wire = (one: Answered): unknown =>
      one.sent.record === 'PHOTO' ? { ...one.sent.photo } : onTheWire(one.sent);
    return {
      passcode,
      holds: {
        unplannedAssignments: [
          ...this.reports.unplannedAssignments.map(({ id }) => id),
          ...kept('ASSIGNMENT'),
        ],
        passcodeUses: [...this.reports.passcodeUses.map(({ id }) => id), ...kept('USE')],
        records: [
          ...this.outbox.map(heldId),
          ...records.filter((one) => answeredUnder(one) !== null).map(({ sent }) => heldId(sent)),
        ],
        held: notStored
          .filter((one) => answeredUnder(one) === null)
          .map((one) => sentPrint(wire(one))),
        photos: [
          ...new Set([
            ...this.photoOutbox.map(({ id }) => id),
            ...photos.filter((one) => answeredUnder(one) !== null).map(({ sent }) => heldId(sent)),
            ...[...this.files.values()].map(({ photoId }) => photoId),
          ]),
        ],
      },
      lastUsed: this.numbersReported(),
    };
  }

  // What came back for its turn-in, off the wire; `undefined` where nothing came. Read by the
  // contract's own rule (`turnInAnswerRead`): only an answer to wipe wipes it, and then it
  // wipes everything it holds; anything else leaves it as it was. The answer, where it was one.
  turnInAnswered(answer: unknown): TurnInAnswer | null {
    const read = answer === undefined ? null : turnInAnswerRead(answer);
    if (!toWipe(read)) return read;
    this.turnedIn = true;
    this.started.clear();
    this.dropped.length = 0;
    this.outbox.length = 0;
    this.photoOutbox.length = 0;
    this.files.clear();
    this.resting.clear();
    this.reports = { unplannedAssignments: [], passcodeUses: [], lastUsed: [] };
    this.shown.length = 0;
    this.keptReports = [];
    this.lastUsed.clear();
    this.numbers.clear();
    this.receipts.clear();
    this.told.length = 0;
    this.toppedUp.clear();
    this.current = { ...this.current, lists: { ...this.current.lists, blocks: [] } };
    return read;
  }

  // Whether it was turned in and wiped.
  get wiped(): boolean {
    return this.turnedIn;
  }

  // "Sync and turn in", whole: it syncs every record and photograph's record it holds and sends
  // every file, then sends its turn-in, as JSON read by the contract as the endpoint's boundary
  // reads it, under the passcode typed on it. Answered to wipe, it wipes; answered not turned
  // in, it keeps everything and the answer says what the server doesn't have. The answer.
  async turnIn(server: PhoneServer, passcode: string): Promise<TurnInAnswer> {
    if (server.turnIn === undefined)
      throw new Error(`${this.name}: this server turns no phone in.`);
    await this.sync(server);
    const wire: unknown = JSON.parse(JSON.stringify(this.turnsIn(passcode)));
    const answer: unknown = JSON.parse(
      JSON.stringify(await server.turnIn(this.current.deviceId, turnInSentSchema.parse(wire))),
    );
    const read = this.turnInAnswered(answer);
    if (read === null) throw new Error(`${this.name}: what came back is no answer to its turn-in.`);
    return read;
  }

  // Every record it has sent and what it was told, in the order sent.
  get answers(): readonly Answered[] {
    return [...this.told];
  }

  // What it shows its monitor as not saved: each record the server kept in quarantine or could
  // not save, with the reason. Never swallowed (ADR-022, 468; REQ-308c).
  get notSaved(): readonly Answered[] {
    return this.told.filter((one) => !stored(one.answer));
  }

  // The same, with the reports not saved beside the records, as the contract's suite reads it;
  // and the id of everything it holds that the server has not said it stored.
  get shownNotSaved(): readonly ShownNotSaved[] {
    return [...this.shown];
  }

  get holds(): readonly string[] {
    return [
      ...this.reports.unplannedAssignments.map(({ id }) => id),
      ...this.reports.passcodeUses.map(({ id }) => id),
      ...this.outbox.map(heldId),
      ...this.photoOutbox.map(({ id }) => id),
      ...this.keptReports.map(({ id }) => id),
      ...this.notSaved.map((one) => heldId(one.sent)),
    ];
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

  private certificationNumbered(certNumber: string): { readonly id: string } {
    const found = this.lists.certifications.find((one) => one.certNumber === certNumber);
    if (found === undefined) throw new Error(`${this.name} has no certification ${certNumber}.`);
    return found;
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
