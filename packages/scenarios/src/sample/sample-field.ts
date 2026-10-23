// The sample's phones and field days (sample-projects.ts): the golden mission's §1 to §3 as its
// monitors record them (spec/golden/MISSION.md; the stories `p1-field-days` and `golden-mission`
// tell the same days), and a Wednesday more, so that a firm finds every kind of field event and
// form in the sample. Every phone is enrolled once under the master passcode with a key of its
// own; every monitor is created on the yard phone under it; each day's work comes from Luis
// Ortega (sample)'s dispatch board, which the phone takes at sign-in; every record is made on a
// phone, offline, picked by name from its lists, and reaches the server in a sync. What the
// worker concludes from them (completed loads, statuses, flags, transactions) is its own.
//
// - **Saturday 10 October**: Sam Grant (sample) certifies P1's three containers and two crews on
//   his phone, Lee Morgan (sample) helping, and Rivera's self-loader on P2; five photographs each.
// - **Monday 12, Tuesday 13**: the golden mission's loads, haul-outs (one from three piles,
//   weighed), unit rate work, an incident and a citizen drop-off log on P1; P2's ROEs, surveys and
//   split load. The TDSR tower's phone has a flat battery on Tuesday: it syncs Wednesday.
// - **Wednesday 14** (the sample's own): a load dumped at Old Quarry Pit, an ineligible site; a
//   barcode scanned twice at the tower (`adms-exceptions` Scenario A), so a load waits for its
//   disposal and the second disposal is quarantined; HHW by the pound; an incident of every other
//   incident type the firm's list holds; and the day's hours on the time clock.
import { writeAssignmentEndpoint, type SyncedClockEntry } from '@open-adms/contracts';
import type { FieldEventKind, NumberSeries } from '@open-adms/db';
import { uuidv7 } from '@open-adms/domain';

import { utcOffsetMinutes } from '../clock.ts';
import {
  chained,
  made,
  scanned,
  typed,
  type Completion,
  type NewBox,
  type NewCertification,
  type NumberEntry,
  type SimulatedDevice,
} from '../device.ts';
import type { OfficeBrowser } from '../office-browser.ts';
import type { StoryContext, StoryMonitor } from '../runner.ts';
import { firstBlocks, synced, taken } from '../stories/board.ts';
import { samplePicture } from './sample-picture.ts';
import {
  sample,
  sampleDay,
  sampleMonitors,
  samplePhones,
  type SampleMonitor,
  type SamplePhone,
} from './sample-names.ts';
import type { SampleSetUp } from './sample-setup.ts';
import type { SampleWorker } from './sample-worker.ts';

const { timeZone } = sample;
type Day = Parameters<typeof sampleDay>[0];

// Where the collections are (spec/CONVENTIONS.md §6, on the pinned map extract).
const heronSt = { endLatitude: '39.13850000', endLongitude: '-75.55370000' } as const;
const elmSt = { endLatitude: '39.15000000', endLongitude: '-75.54000000' } as const;
const birchLn = { endLatitude: '39.17000000', endLongitude: '-75.69000000' } as const;
const zone3 = { endLatitude: '39.15000000', endLongitude: '-75.52000000' } as const;
// Where a disposal at Marsh Road TDSR ends, and where a haul-out is loaded there: by its tower.
const atTheTdsr = { endLatitude: '39.09030000', endLongitude: '-75.62020000' } as const;
const vegetative = { debrisType: 'Vegetative' } as const;

// What each incident of the firm's list says, by its type (the shipped list's six).
const incidentsSaid: Readonly<Record<string, Omit<SampleIncident, 'type'>>> = {
  'Personal injury': {
    description: 'A laborer cut a hand on a chainsaw; first aid given at the truck.',
    parties: 'Coastline crew',
  },
  'Near miss': { description: 'A hanging limb fell beside the bucket truck; nobody was hurt.' },
  'Equipment failure': {
    description: 'The skid steer’s hydraulic hose burst; the crew stopped for the day’s repair.',
    certNumber: '730418',
  },
  Environmental: {
    description: 'Hydraulic fluid on the road shoulder from the burst hose; absorbent laid.',
    certNumber: '730418',
  },
  Other: { description: 'A resident asked the crew to take household items; they declined.' },
};

interface SampleIncident {
  readonly type: string;
  readonly description: string;
  readonly parties?: string;
  readonly certNumber?: string;
}

// The board's one assignment: a monitor's work on a day, the phone and the one site.
interface Planned {
  readonly monitor: SampleMonitor;
  readonly phone?: SamplePhone;
  readonly kinds?: readonly FieldEventKind[];
  readonly forms?: readonly ('ROE' | 'SURVEY' | 'INCIDENT' | 'DROP_OFF_LOG')[];
  readonly site?: keyof SampleSetUp['sites'];
  readonly certifying?: boolean;
  readonly unitRate?: boolean;
}

// One of the sample's monitors, as they sign in to try the field app on the day it is loaded.
export interface SampleSignIn {
  readonly name: string;
  readonly monitorNumber: string;
  readonly password: string;
  readonly work: string;
}

// Thursday first thing at the yard: each of the sample's phones enrolled under the master
// passcode, before anything else of the sample is written, so a passcode that isn't the firm's
// stops the load with nothing of it made (the user, 2026-10-23: a load that stopped there left
// the projects' setup alone behind it).
export async function enrolledPhones(
  story: StoryContext,
): Promise<ReadonlyMap<SamplePhone, string>> {
  const phones = new Map<SamplePhone, string>();
  for (const phone of Object.keys(samplePhones) as SamplePhone[]) {
    phones.set(phone, (await story.enrolled(samplePhones[phone])).id);
  }
  return phones;
}

export class SampleField {
  private readonly story: StoryContext;
  private readonly luis: OfficeBrowser;
  private readonly set: SampleSetUp;
  private readonly worker: SampleWorker;
  private readonly phoneIds = new Map<SamplePhone, string>();
  private readonly devices = new Map<SamplePhone, SimulatedDevice>();
  private readonly people = new Map<SampleMonitor, StoryMonitor>();
  // Each day's assignments, by the phone (or the monitor, where none is named) they are for.
  private readonly boards = new Map<string, string>();

  constructor(
    story: StoryContext,
    luis: OfficeBrowser,
    set: SampleSetUp,
    worker: SampleWorker,
    phones: ReadonlyMap<SamplePhone, string>,
  ) {
    this.story = story;
    this.luis = luis;
    this.set = set;
    this.worker = worker;
    for (const [phone, id] of phones) this.phoneIds.set(phone, id);
  }

  // Every phone the sample enrolled and every monitor it created, for its end.
  get enrolled(): readonly SimulatedDevice[] {
    return [...this.devices.values()];
  }

  get monitors(): readonly StoryMonitor[] {
    return [...this.people.values()];
  }

  // Thursday afternoon at the yard: the six monitors created on the first phone, online, under
  // the master passcode (the phones were enrolled first thing, `enrolledPhones`).
  async monitorsCreated(): Promise<void> {
    this.story.clock.set(sampleDay('08', '15:00'));
    for (const monitor of Object.keys(sampleMonitors) as SampleMonitor[]) {
      this.people.set(
        monitor,
        await this.story.monitor(sampleMonitors[monitor], this.phoneId('col')),
      );
    }
  }

  // Saturday: Sam certifies P1's containers and crews on his phone, Lee helping, and Rivera's
  // self-loader on P2 on P2's collection phone; each with its five photographs.
  async certified(): Promise<void> {
    const { set } = this;
    this.story.clock.set(sampleDay('10', '07:30'));
    await this.board('10', set.p1, [
      { monitor: 'sam', phone: 'haulOut', certifying: true },
      { monitor: 'lee' },
    ]);
    await this.board('10', set.p2, [{ monitor: 'sam', phone: 'p2Col', certifying: true }]);
    await this.blocks('haulOut', set.p1, ['CERTIFICATION']);
    await this.blocks('p2Col', set.p2, ['CERTIFICATION']);
    const sam = await this.signedIn('10', 'haulOut', 'sam', set.p1);
    const box = (length: number, width: number, height: number, feature?: string): NewBox => ({
      shape: 'RECTANGLE',
      sign: 'ADD',
      length,
      width,
      height,
      ...(feature === undefined ? {} : { feature }),
    });
    const loader: NewCertification = {
      kind: 'CONTAINER',
      prime: sample.prime,
      firstTierSub: sample.sub,
      vehicleType: 'Self-Loading Truck',
      boxes: [
        box(264, 92, 96),
        {
          shape: 'TRIANGLE',
          sign: 'SUBTRACT',
          length: 36,
          width: 92,
          height: 48,
          feature: 'Dog Box',
        },
      ],
      driverName: 'Marco Rivera',
      tagNumber: 'RVT 4821',
      tagState: 'FL',
      tagExpiry: '2027-03-31',
    };
    const certify = (time: string, certification: NewCertification) => {
      this.story.clock.set(sampleDay('10', time));
      sam.certify(certification);
    };
    const helpers = [sampleMonitors.lee];
    certify('09:10', {
      kind: 'CONTAINER',
      prime: sample.prime,
      vehicleType: 'Hydraulic Dump Trailer',
      boxes: [box(360, 96, 72), box(360, 96, 16, 'Sideboards')],
      helpers,
    });
    certify('09:40', { ...loader, helpers });
    certify('10:05', { kind: 'CREW', prime: sample.prime, crewType: 'Bucket Truck', boxes: [] });
    certify('10:15', { kind: 'CREW', prime: sample.prime, crewType: 'Skid Steer', boxes: [] });
    certify('10:50', {
      kind: 'CONTAINER',
      prime: sample.prime,
      vehicleTypeOther: 'Walking floor trailer',
      boxes: [
        box(576, 96, 93),
        {
          shape: 'RADIUS_CORNER',
          sign: 'SUBTRACT',
          radius: 6,
          run: 576,
          corners: 2,
          feature: 'Curved/Angled Sides/Floor',
        },
      ],
      helpers,
    });
    this.story.clock.set(sampleDay('10', '11:00'));
    await sam.sync(this.story.server);
    const samP2 = await this.signedIn('10', 'p2Col', 'sam', set.p2);
    this.story.clock.set(sampleDay('10', '11:30'));
    samP2.certify(loader);
    this.story.clock.set(sampleDay('10', '11:45'));
    await samP2.sync(this.story.server);
    await this.worker.settled([set.p1, set.p2]);
  }

  // Monday, Tuesday and Wednesday, as the phones record them, each evening's syncs, and what the
  // worker concludes after each.
  async days(): Promise<void> {
    const { set, story } = this;
    story.clock.set(sampleDay('12', '06:00'));
    // Luis's boards: the golden mission's §1, and Wednesday's.
    const ana: Planned = { monitor: 'ana', phone: 'col', kinds: ['COLLECTION'] };
    const kim: Planned = {
      monitor: 'kim',
      phone: 'tdsr',
      kinds: ['DISPOSAL'],
      forms: ['DROP_OFF_LOG'],
      site: 'tdsr',
    };
    const tariq: Planned = {
      monitor: 'tariq',
      phone: 'landfill',
      kinds: ['DISPOSAL', 'HAUL_OUT_DISPOSAL'],
      site: 'landfill',
    };
    const sam: Planned = {
      monitor: 'sam',
      phone: 'haulOut',
      kinds: ['HAUL_OUT_COLLECTION'],
      site: 'tdsr',
    };
    const jo: Planned = {
      monitor: 'jo',
      phone: 'unitRate',
      kinds: ['UNIT_RATE'],
      forms: ['INCIDENT'],
      unitRate: true,
    };
    await this.board('12', set.p1, [ana, kim, tariq, sam, jo]);
    await this.board('13', set.p1, [
      ana,
      kim,
      tariq,
      sam,
      jo,
      {
        monitor: 'lee',
        phone: 'cypress',
        kinds: ['HAUL_OUT_DISPOSAL'],
        site: 'cypress',
      },
    ]);
    await this.board('14', set.p1, [
      ana,
      kim,
      { monitor: 'lee', phone: 'cypress', kinds: ['DISPOSAL'], site: 'quarry' },
      jo,
    ]);
    await this.board('12', set.p2, [
      { monitor: 'ana', phone: 'p2Col', kinds: ['COLLECTION'], forms: ['ROE', 'SURVEY'] },
      { monitor: 'kim', phone: 'p2Tdsr', kinds: ['DISPOSAL'], site: 'p2Tdsr' },
    ]);
    await this.monday();
    await this.tuesday();
    await this.wednesday();
  }

  // The day the sample is loaded on (the user, 2026-10-23: "has things loaded ready to test
  // out"): Luis writes that day's board on both projects, every kind of work a monitor does on
  // one of the six, on no phone of its own, so each signs in on any enrolled phone (the firm's
  // browser, enrolled under its master passcode) and it takes their work. Their sign-ins, for
  // whoever loaded the sample to try the field app with.
  async readyToTry(workDate: string): Promise<readonly SampleSignIn[]> {
    const { set } = this;
    const planned: readonly (Planned & { readonly projectId: string; readonly work: string })[] = [
      {
        monitor: 'ana',
        kinds: ['COLLECTION'],
        forms: ['INCIDENT'],
        projectId: set.p1,
        work: 'collections and incidents, ROW project',
      },
      {
        monitor: 'kim',
        kinds: ['DISPOSAL'],
        forms: ['DROP_OFF_LOG'],
        site: 'tdsr',
        projectId: set.p1,
        work: 'disposals and drop-off logs at Marsh Road TDSR, ROW project',
      },
      {
        monitor: 'tariq',
        kinds: ['DISPOSAL', 'HAUL_OUT_DISPOSAL'],
        site: 'landfill',
        projectId: set.p1,
        work: 'disposals and haul-out disposals at the landfill, ROW project',
      },
      {
        monitor: 'sam',
        kinds: ['HAUL_OUT_COLLECTION'],
        site: 'tdsr',
        certifying: true,
        projectId: set.p1,
        work: 'haul-outs at Marsh Road TDSR, and certifying, ROW project',
      },
      {
        monitor: 'jo',
        kinds: ['UNIT_RATE'],
        forms: ['INCIDENT'],
        unitRate: true,
        projectId: set.p1,
        work: 'unit rate work and incidents, ROW project',
      },
      {
        monitor: 'lee',
        kinds: ['COLLECTION'],
        forms: ['ROE', 'SURVEY'],
        projectId: set.p2,
        work: 'collections, ROEs and surveys, PPDR project',
      },
    ];
    const signIns: SampleSignIn[] = [];
    const written = new Map<SampleMonitor, { readonly id: string; readonly projectId: string }>();
    for (const { projectId, work, ...assignment } of planned) {
      const answer = await this.luis.answered(writeAssignmentEndpoint, {
        ids: { projectId },
        json: this.assignment(workDate, assignment),
      });
      written.set(assignment.monitor, { id: answer.record.id, projectId });
      const person = this.person(assignment.monitor);
      signIns.push({
        name: person.name,
        monitorNumber: person.monitorNumber,
        password: person.password,
        work,
      });
    }
    await this.signInsProven(written);
    return signIns;
  }

  // Proven as the firm will try them: on a phone enrolled for the check, each monitor signs in
  // with the sign-in handed back and takes the day's work written for them; the phone is then
  // turned in, its key revoked. Signing in only reads an assignment, never ties it to the phone.
  private async signInsProven(
    written: ReadonlyMap<SampleMonitor, { readonly id: string; readonly projectId: string }>,
  ): Promise<void> {
    const { story } = this;
    const phone = await story.enrolled('A check of the sample’s sign-ins');
    let device: SimulatedDevice | undefined;
    for (const [monitor, assignment] of written) {
      const person = this.person(monitor);
      const takenId = await taken(story, person, phone.id);
      if (takenId !== assignment.id) {
        throw new Error(`${person.name} signed in but took other work than the day’s.`);
      }
      const setup = {
        name: phone.name,
        deviceId: phone.id,
        monitorId: person.id,
        assignmentId: takenId,
        projectId: assignment.projectId,
        lists: await story.lists.held({ assignmentId: takenId, deviceId: phone.id }),
        timeZone,
      };
      if (device === undefined) device = story.phone(setup);
      else device.signIn(setup);
    }
    if (device === undefined) return;
    const answer = await story.underPasscode.turnIn(device);
    if (!answer.turnedIn) throw new Error(`${phone.name} wasn’t turned in: ${answer.message}`);
  }

  private async monday(): Promise<void> {
    const { set, story } = this;
    story.clock.set(sampleDay('12', '06:30'));
    await this.blocks('col', set.p1, ['LOAD']);
    await this.blocks('haulOut', set.p1, ['HAUL_OUT']);
    await this.blocks('unitRate', set.p1, ['UNIT_RATE']);
    await this.blocks('p2Col', set.p2, ['LOAD', 'ROE']);
    const ana = await this.signedIn('12', 'col', 'ana', set.p1);
    const kim = await this.signedIn('12', 'tdsr', 'kim', set.p1, set.sites.tdsr);
    const tariq = await this.signedIn('12', 'landfill', 'tariq', set.p1, set.sites.landfill);
    await this.signedIn('12', 'haulOut', 'sam', set.p1, set.sites.tdsr);
    const jo = await this.signedIn('12', 'unitRate', 'jo', set.p1);
    const anaP2 = await this.signedIn('12', 'p2Col', 'ana', set.p2);
    const kimP2 = await this.signedIn('12', 'p2Tdsr', 'kim', set.p2, set.sites.p2Tdsr);
    const at = (time: string) => {
      story.clock.set(sampleDay('12', time));
    };
    const hanger = {
      payableType: 'Hangers',
      count: 1,
      measurement: { inches: 3, measuredAs: 'DIAMETER' },
    } as const;

    at('08:15');
    const l101001 = this.begin(ana, 'LOAD', 'COLLECTION', '730415', made);
    at('08:40');
    this.complete(ana, l101001, {
      ...vegetative,
      ...heronSt,
      address: '14 Heron St',
      addressSource: 'TYPED',
    });
    at('09:05');
    const d101001 = this.begin(kim, 'LOAD', 'DISPOSAL', '730415', scanned('101001'));
    at('09:25');
    this.complete(kim, d101001, { ...vegetative, loadCall: 80, ...atTheTdsr });
    at('09:40');
    const u301001 = this.begin(jo, 'UNIT_RATE', 'UNIT_RATE', '730417', made);
    at('09:50');
    const l101002 = this.begin(ana, 'LOAD', 'COLLECTION', '730416', made);
    at('09:55');
    this.complete(jo, u301001, hanger);
    at('10:10');
    this.complete(ana, l101002, { debrisType: 'C&D', ...zone3 });
    at('10:35');
    const d101002 = this.begin(tariq, 'LOAD', 'DISPOSAL', '730416', scanned('101002'));
    at('10:50');
    this.complete(tariq, d101002, { debrisType: 'C&D', loadCall: 75 });
    at('10:55');
    const u301002 = this.begin(jo, 'UNIT_RATE', 'UNIT_RATE', undefined, made);
    at('11:10');
    this.complete(jo, u301002, {
      payableType: 'Leaners',
      count: 1,
      measurement: { inches: 56.5, measuredAs: 'CIRCUMFERENCE' },
    });
    at('11:12');
    const l101003 = this.begin(ana, 'LOAD', 'COLLECTION', '730415', made);
    at('11:30');
    this.complete(ana, l101003, { ...vegetative, ...heronSt });
    at('11:50');
    const d101003 = this.begin(kim, 'LOAD', 'DISPOSAL', '730415', scanned('101003'));
    at('12:05');
    // Heaped: flagged, and Luis accepts it on Thursday.
    this.complete(kim, d101003, { ...vegetative, loadCall: 96, ...atTheTdsr });
    at('12:30');
    const u301003 = this.begin(jo, 'UNIT_RATE', 'UNIT_RATE', undefined, made);
    at('12:40');
    // The same tree as 301001: Luis voids it on Thursday (renumbering would double-bill).
    this.complete(jo, u301003, hanger);

    // P2: the PPDR project's ROEs, surveys and split load (golden mission §3).
    anaP2.passOver('ROE', 6);
    at('13:15');
    const r0007 = anaP2.roe({
      parcelId: 'APN 14-0321-007',
      address: '412 Cedar Ct',
      ownerName: 'Rosa Delgado',
      signed: true,
      signedDate: '2026-10-09',
    });
    anaP2.photograph({ of: { kind: 'ROE', id: r0007.id } });
    anaP2.survey({ workType: 'Pre-work survey', roeNumber: r0007.roeNumber });
    at('13:25');
    const propertyA = this.begin(anaP2, 'LOAD', 'COLLECTION', '730416', made);
    at('13:45');
    this.complete(anaP2, propertyA, {
      splitSuffix: 'A',
      ...vegetative,
      estimateCy: 12,
      roeNumber: r0007.roeNumber,
      address: '412 Cedar Ct',
      addressSource: 'TYPED',
      endLatitude: '39.12000000',
      endLongitude: '-75.56000000',
    });
    at('13:50');
    anaP2.survey({ workType: 'Post-work survey', roeNumber: r0007.roeNumber });
    at('13:55');
    const r0008 = anaP2.roe({
      parcelId: 'APN 14-0321-008',
      address: '416 Cedar Ct',
      ownerName: 'Ben Whitaker',
      signed: true,
      signedDate: '2026-10-09',
    });
    anaP2.photograph({ of: { kind: 'ROE', id: r0008.id } });
    anaP2.survey({ workType: 'Pre-work survey', roeNumber: r0008.roeNumber });
    const propertyB = this.begin(anaP2, 'LOAD', 'COLLECTION', '730416', chained(propertyA));
    at('14:15');
    this.complete(anaP2, propertyB, {
      splitSuffix: 'B',
      ...vegetative,
      estimateCy: 18,
      roeNumber: r0008.roeNumber,
      address: '416 Cedar Ct',
      addressSource: 'TYPED',
      endLatitude: '39.12020000',
      endLongitude: '-75.56030000',
    });
    at('14:20');
    anaP2.survey({ workType: 'Post-work survey', roeNumber: r0008.roeNumber });
    at('14:40');
    const d102001 = this.begin(kimP2, 'LOAD', 'DISPOSAL', '730416', scanned('102001'));
    at('14:55');
    this.complete(kimP2, d102001, { ...vegetative, loadCall: 75, ...atTheTdsr });

    // A preload: collected tonight, dumped tomorrow morning.
    at('17:30');
    const l101004 = this.begin(ana, 'LOAD', 'COLLECTION', '730416', made);
    at('17:50');
    this.complete(ana, l101004, { ...vegetative, ...elmSt });

    at('18:30');
    for (const phone of [kim, tariq, jo, ana, anaP2, kimP2]) await phone.sync(story.server);
    await this.worker.settled([set.p1, set.p2]);
  }

  private async tuesday(): Promise<void> {
    const { set, story } = this;
    story.clock.set(sampleDay('13', '06:30'));
    const ana = await this.signedIn('13', 'col', 'ana', set.p1);
    const kim = await this.signedIn('13', 'tdsr', 'kim', set.p1, set.sites.tdsr);
    const tariq = await this.signedIn('13', 'landfill', 'tariq', set.p1, set.sites.landfill);
    const sam = await this.signedIn('13', 'haulOut', 'sam', set.p1, set.sites.tdsr);
    const jo = await this.signedIn('13', 'unitRate', 'jo', set.p1);
    const lee = await this.signedIn('13', 'cypress', 'lee', set.p1, set.sites.cypress);
    const at = (time: string) => {
      story.clock.set(sampleDay('13', time));
    };
    const stump = { payableType: 'Stumps', count: 1 } as const;

    at('06:45');
    const d101004 = this.begin(kim, 'LOAD', 'DISPOSAL', '730416', scanned('101004'));
    at('07:15');
    this.complete(kim, d101004, { ...vegetative, loadCall: 50, ...atTheTdsr });
    at('08:30');
    const u301004 = this.begin(jo, 'UNIT_RATE', 'UNIT_RATE', '730418', made);
    at('08:50');
    this.complete(jo, u301004, {
      ...stump,
      measurement: { inches: 30, measuredAs: 'DIAMETER' },
      rootBallInches: 96,
      rootBallHalfExposed: true,
      surveyNumber: 'APN 14-0321-007',
    });
    at('09:10');
    const u301005 = this.begin(jo, 'UNIT_RATE', 'UNIT_RATE', undefined, made);
    at('09:20');
    // Under 24 in: no band fits, flagged; Luis voids it on Thursday.
    this.complete(jo, u301005, { ...stump, measurement: { inches: 20, measuredAs: 'DIAMETER' } });
    at('09:45');
    const l101005 = this.begin(ana, 'LOAD', 'COLLECTION', '730415', made);
    at('10:05');
    this.complete(ana, l101005, { ...vegetative, ...heronSt });
    at('10:25');
    const d101005 = this.begin(kim, 'LOAD', 'DISPOSAL', '730415', scanned('101005'));
    at('10:40');
    this.complete(kim, d101005, { ...vegetative, loadCall: 70, ...atTheTdsr });
    at('10:50');
    const u301006 = this.begin(jo, 'UNIT_RATE', 'UNIT_RATE', '730417', made);
    at('11:10');
    const l101006 = this.begin(ana, 'LOAD', 'COLLECTION', '730416', made);
    at('11:15');
    this.complete(jo, u301006, {
      payableType: 'White Goods',
      address: '40 Birch Ln',
      addressSource: 'TYPED',
      items: [
        { name: 'Washer', quantity: 2 },
        { name: 'Dryer', quantity: 1 },
        { name: 'Fridge, freon recovered', quantity: 2 },
        { name: 'Fridge, no freon', quantity: 1 },
      ],
    });
    at('11:30');
    this.complete(ana, l101006, { ...vegetative, ...elmSt });
    at('11:50');
    this.incident(jo, {
      type: 'Property damage',
      description: 'A mailbox struck by the self-loader backing out of 22 Elm St.',
      certNumber: '730416',
    });
    at('11:55');
    // The barcode won't scan: Kim types the number, 101060 by mistake. Luis renumbers it to
    // 101006 on Thursday: real work is renumbered, never voided.
    const d101006 = this.begin(
      kim,
      'LOAD',
      'DISPOSAL',
      '730416',
      typed('101060', 'Barcode damaged'),
    );
    at('12:10');
    this.complete(kim, d101006, { ...vegetative, loadCall: 60, ...atTheTdsr });
    at('12:40');
    const h201001 = this.begin(sam, 'HAUL_OUT', 'HAUL_OUT_COLLECTION', '730419', made);
    at('13:00');
    this.complete(sam, h201001, { ...vegetative, loadCall: 90, ...atTheTdsr });
    at('13:55');
    const o201001 = this.begin(tariq, 'HAUL_OUT', 'HAUL_OUT_DISPOSAL', '730419', scanned('201001'));
    at('14:10');
    this.complete(tariq, o201001, vegetative);
    // The split haul-out, loaded from three piles and weighed at Cypress Creek Landfill.
    at('15:10');
    sam.passOver('HAUL_OUT', 201003);
    const pileA = this.begin(sam, 'HAUL_OUT', 'HAUL_OUT_COLLECTION', '730419', made);
    at('15:20');
    kim.dropOffLog({ residentName: 'Carl Jensen', originAddress: '14 Heron St' });
    const pile = (id: string, suffix: string, tag: string, loadCall: number) => {
      this.complete(sam, id, {
        splitSuffix: suffix,
        ...vegetative,
        fieldTag: tag,
        loadCall,
        ...atTheTdsr,
      });
    };
    at('15:30');
    pile(pileA, 'A', 'Zone 1 pile', 10);
    at('15:35');
    const pileB = this.begin(sam, 'HAUL_OUT', 'HAUL_OUT_COLLECTION', '730419', chained(pileA));
    at('15:45');
    pile(pileB, 'B', 'Zone 2 pile', 35);
    at('15:50');
    const pileC = this.begin(sam, 'HAUL_OUT', 'HAUL_OUT_COLLECTION', '730419', chained(pileB));
    at('16:05');
    pile(pileC, 'C', 'Zone 3 pile', 85);
    at('16:50');
    const u301007 = this.begin(jo, 'UNIT_RATE', 'UNIT_RATE', '730418', made);
    at('17:00');
    const o201004 = this.begin(lee, 'HAUL_OUT', 'HAUL_OUT_DISPOSAL', '730419', scanned('201004'));
    at('17:05');
    this.complete(jo, u301007, {
      payableType: 'Crew time',
      items: [
        { name: 'Skid Steer', quantity: 9.75 },
        { name: 'Truck', quantity: 8.5 },
      ],
    });
    at('17:15');
    this.complete(lee, o201004, {
      ...vegetative,
      scaleReceipt: {
        receiptNumber: 'CCL-51207',
        grossWeightLb: 79600,
        tareWeightLb: 31600,
        netWeightLb: 48000,
        netWeightTons: 24,
      },
    });

    // The TDSR tower's battery is flat: its day waits on it until Wednesday morning.
    at('18:30');
    for (const phone of [ana, tariq, sam, lee, jo]) await phone.sync(story.server);
    await this.worker.settled([set.p1]);
  }

  private async wednesday(): Promise<void> {
    const { set, story } = this;
    const at = (time: string) => {
      story.clock.set(sampleDay('14', time));
    };
    at('07:10');
    await this.device('tdsr').sync(story.server);
    await this.worker.settled([set.p1]);
    at('07:20');
    const ana = await this.signedIn('14', 'col', 'ana', set.p1);
    const kim = await this.signedIn('14', 'tdsr', 'kim', set.p1, set.sites.tdsr);
    const lee = await this.signedIn('14', 'cypress', 'lee', set.p1, set.sites.quarry);
    const jo = await this.signedIn('14', 'unitRate', 'jo', set.p1);

    // A load dumped at Old Quarry Pit, an ineligible site: flagged, and still billed. The sample
    // leaves it in the review queue for the firm to look at.
    at('08:10');
    const l101007 = this.begin(ana, 'LOAD', 'COLLECTION', '730415', made);
    at('08:30');
    this.complete(ana, l101007, { ...vegetative, ...elmSt });
    at('08:40');
    const u301009 = this.begin(jo, 'UNIT_RATE', 'UNIT_RATE', '730417', made);
    at('08:55');
    // HHW by the pound, the pounds entered as each item's count.
    this.complete(jo, u301009, {
      payableType: 'HHW',
      address: '14 Heron St',
      addressSource: 'TYPED',
      items: [
        { name: 'Paint cans', quantity: 40 },
        { name: 'Propane tanks', quantity: 15 },
      ],
    });
    at('09:15');
    const d101007 = this.begin(lee, 'LOAD', 'DISPOSAL', '730415', scanned('101007'));
    at('09:20');
    // A barcode scanned twice at the tower (`adms-exceptions` Scenario A): 101008 and 101009 are
    // both Rivera's, and Kim scans 101008 for both. The second disposal is quarantined at sync,
    // and 101009 waits for its disposal: the sample leaves both for the firm to resolve.
    const l101008 = this.begin(ana, 'LOAD', 'COLLECTION', '730416', made);
    at('09:30');
    this.complete(lee, d101007, { ...vegetative, loadCall: 60 });
    at('09:40');
    this.complete(ana, l101008, { ...vegetative, ...elmSt });
    at('10:05');
    const d101008 = this.begin(kim, 'LOAD', 'DISPOSAL', '730416', scanned('101008'));
    at('10:22');
    this.complete(kim, d101008, { ...vegetative, loadCall: 50, ...atTheTdsr });
    at('10:45');
    const l101009 = this.begin(ana, 'LOAD', 'COLLECTION', '730416', made);
    at('11:05');
    this.complete(ana, l101009, { ...vegetative, ...birchLn });
    at('11:25');
    const again = this.begin(kim, 'LOAD', 'DISPOSAL', '730416', scanned('101008'));
    at('11:40');
    this.complete(kim, again, { ...vegetative, loadCall: 75, ...atTheTdsr });

    // An incident of every other type the firm's list holds.
    let minutes = 13 * 60;
    for (const type of jo.setup.lists.incidentTypes) {
      if (type.name === 'Property damage') continue;
      at(
        `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
      );
      this.incident(jo, {
        type: type.name,
        ...(incidentsSaid[type.name] ?? {
          description: `An incident of the kind “${type.name}”, recorded for the sample.`,
        }),
      });
      minutes += 20;
    }

    at('18:30');
    for (const phone of [ana, kim, lee, jo]) await phone.sync(story.server);
    // The day's hours on the time clock, sent from each phone at the yard.
    await this.clocked('col', 'ana', [
      ['IN', '07:00'],
      ['BREAK_START', '12:00'],
      ['BREAK_END', '12:30'],
      ['OUT', '16:30'],
    ]);
    await this.clocked('tdsr', 'kim', [
      ['IN', '07:00'],
      ['OUT', '16:00'],
    ]);
    await this.worker.settled([set.p1]);
  }

  // The assignment Wednesday's clock entries of a monitor hang on.
  assignmentOf(day: Day, monitor: SampleMonitor, phone: SamplePhone, projectId: string): string {
    const id = this.boards.get(`${day} ${projectId} ${phone} ${monitor}`);
    if (id === undefined) throw new Error(`No assignment for ${monitor} on ${day}.`);
    return id;
  }

  // Luis writes a day's board for a project, at his browser: each assignment naming its phone.
  private async board(day: Day, projectId: string, planned: readonly Planned[]): Promise<void> {
    for (const work of planned) {
      const answer = await this.luis.answered(writeAssignmentEndpoint, {
        ids: { projectId },
        json: this.assignment(`2026-10-${day}`, work),
      });
      this.boards.set(
        `${day} ${projectId} ${work.phone ?? 'none'} ${work.monitor}`,
        answer.record.id,
      );
    }
  }

  // What the board says of one assignment.
  private assignment(workDate: string, work: Planned) {
    return {
      personId: this.person(work.monitor).id,
      workDate,
      fieldEventKinds: [...(work.kinds ?? [])],
      certifying: work.certifying ?? false,
      formDocumentTypes: [...(work.forms ?? [])],
      siteId: work.site === undefined ? null : this.set.sites[work.site],
      deviceId: work.phone === undefined ? null : this.phoneId(work.phone),
      payItemIds: work.unitRate === true ? this.set.unitRateWork.map(({ id }) => id) : [],
    };
  }

  // A phone that makes numbers takes its first block of each series, at the yard, online.
  private async blocks(
    phone: SamplePhone,
    projectId: string,
    series: readonly NumberSeries[],
  ): Promise<void> {
    await firstBlocks(this.story, this.phoneId(phone), timeZone, projectId, series);
  }

  // The monitor signs in on the phone, online, and it takes their assignment for the day and its
  // lists; the phone keeps what it recorded and the numbers it gave out through the sign-in.
  private async signedIn(
    day: Day,
    phone: SamplePhone,
    monitor: SampleMonitor,
    projectId: string,
    siteId?: string,
  ): Promise<SimulatedDevice> {
    const deviceId = this.phoneId(phone);
    const assignmentId = await taken(this.story, this.person(monitor), deviceId);
    if (assignmentId !== this.boards.get(`${day} ${projectId} ${phone} ${monitor}`)) {
      throw new Error(`${samplePhones[phone]} took another assignment than ${day} October’s.`);
    }
    const setup = {
      name: samplePhones[phone],
      deviceId,
      monitorId: this.person(monitor).id,
      assignmentId,
      projectId,
      ...(siteId === undefined ? {} : { siteId }),
      lists: await this.story.lists.held({ assignmentId, deviceId }),
      timeZone,
    };
    const held = this.devices.get(phone);
    if (held !== undefined) {
      held.signIn(setup);
      return held;
    }
    const device = this.story.phone(setup);
    device.takesPicturesWith((label) => samplePicture(label));
    this.devices.set(phone, device);
    return device;
  }

  private begin(
    phone: SimulatedDevice,
    workflow: 'LOAD' | 'HAUL_OUT' | 'UNIT_RATE',
    kind: FieldEventKind,
    badge: string | undefined,
    number: NumberEntry,
  ): string {
    return phone.begin(workflow, kind, badge, number);
  }

  // Complete: the details. A unit rate ticket is photographed as it is completed: its crew's
  // photograph, or, where its kind of work is photographed by stage (Stumps), before the work,
  // its measurement and after it (ADR-590).
  private complete(phone: SimulatedDevice, id: string, completion: Completion): void {
    const { event } = phone.complete(id, completion);
    if (event.kind !== 'UNIT_RATE') return;
    const of = { kind: 'FIELD_EVENT', id: event.id } as const;
    if (completion.payableType === 'Stumps') {
      for (const stage of ['PRE_WORK', 'MEASUREMENT', 'POST_WORK'] as const) {
        phone.photograph({ of, stage });
      }
    } else {
      phone.photograph({ of });
    }
  }

  private incident(phone: SimulatedDevice, said: SampleIncident): void {
    phone.incident({
      type: said.type,
      description: said.description,
      address: '22 Elm St',
      ...(said.parties === undefined ? {} : { parties: said.parties }),
      ...(said.certNumber === undefined ? {} : { certNumber: said.certNumber }),
    });
  }

  // A monitor's day on the time clock, clocked in, on a break and out by hand on their phone, and
  // sent from it in a sync of its own at the yard (ADR-241).
  private async clocked(
    phone: SamplePhone,
    monitor: SampleMonitor,
    entries: readonly (readonly [SyncedClockEntry['kind'], string])[],
  ): Promise<void> {
    const assignmentId = this.assignmentOf('14', monitor, phone, this.set.p1);
    await synced(this.story, this.phoneId(phone), timeZone, {
      records: entries.map(([kind, time]) => {
        const at = new Date(sampleDay('14', time));
        return {
          record: 'CLOCK_ENTRY' as const,
          clockEntry: {
            id: uuidv7(at),
            projectId: this.set.p1,
            assignmentId,
            workerId: this.person(monitor).id,
            kind,
            at: at.toISOString(),
            deviceUtcOffsetMinutes: utcOffsetMinutes(timeZone, at),
            activityLines: [],
          },
        };
      }),
    });
  }

  private device(phone: SamplePhone): SimulatedDevice {
    const device = this.devices.get(phone);
    if (device === undefined) throw new Error(`${samplePhones[phone]} is not set up.`);
    return device;
  }

  private phoneId(phone: SamplePhone): string {
    const id = this.phoneIds.get(phone);
    if (id === undefined) throw new Error(`${samplePhones[phone]} is not enrolled.`);
    return id;
  }

  person(monitor: SampleMonitor): StoryMonitor {
    const person = this.people.get(monitor);
    if (person === undefined) throw new Error(`${sampleMonitors[monitor]} was not created.`);
    return person;
  }
}
