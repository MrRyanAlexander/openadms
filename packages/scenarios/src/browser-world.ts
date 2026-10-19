// A world of their own for the field app's browser tests (ARCHITECTURE §15; BACKLOG 3.2.2; ADR-572):
// a phone a browser test enrols, and a monitor it creates, are real records written by the real
// API, and they never go into the installation's own database, which holds no person but the
// seed's actors (ADR-396). So a run of the browser tests has a database of its own, made as a
// story's is (migrated, seeded, locked down, the stories' made-up master passcode), served by the
// API's own process at the stories' address (`https://stories.adms.localhost`, through the stack's
// proxy, over HTTPS), on the real clock, with the one page that tests it on its CORS list. It is
// dropped when the run ends; one left by a run stopped short is `pnpm scenarios clean`'s.
//
// **Its cast** (BACKLOG 3.2.3; ADR-574): before the page can call it, the world holds P1 and its
// two sites as the stories set them up, a yard phone enrolled at the API, monitors created on it
// at the API as any are, and Luis Ortega's board for the project's today and tomorrow (so a run
// across midnight still finds it): Kim Nguyen on disposals and the drop-off log at Marsh Road TDSR,
// Ana Brooks on collections and incidents, Lee Morgan on two assignments, Tariq Patel on none. A
// test signs them in on its own phone with the Monitor ID and the made-up password handed on.
// **And P2** (task 3.3.1, ADR-576), "Bayline County PPDR, Hurricane Delphine", with Marsh Road
// TDSR entered again on it and nobody's assignment: where the tests that set a phone up under the
// master passcode put the monitors they create, so that P1's login list, which other tests read
// whole, stays the cast's.
//
// **And what a collection picks from and scans** (task 3.5.1, ADR-581): P1's load form with
// Vegetative and C&D, its field tags, and two trucks certified the day before by Lee Morgan on the
// yard phone, the dump trailer 730415 (65 CY) and Rivera's self-loader 730416 (48 CY), as the
// golden mission §1 has them, through the setup and certification services as the stories write
// them. A badge of any other number is one the phone's lists don't hold. **And the PARKS project**
// (spec/CONVENTIONS.md §6, ADR-322): "Bayline County PARKS, Hurricane Delphine", its loads
// numbered from pre-printed control tickets, range 400001–405000, Vegetative on its load form, no
// truck certified, and Jo Kim on its collections today and tomorrow (made up, agent default).
//
// **And a lost tower phone whose key the firm's time revoked** (task 3.4.3, ADR-580): P1-TWR-LF,
// enrolled at the API with a key made here and marked lost by Luis with the firm's reason, both on
// the cast's clock set back the firm's 24 hours and a minute; then its key revoked by the worker's
// own pass as the system actor, on the real clock, which the database holds it to.
// Its key is handed to the test with the rest (a made-up world's, never an installation's), for
// the browser's keyring to hold as the phone's own: the browser can't otherwise hold a key made
// before the run, and nothing else of it is planted.
import { generateKeyPairSync } from 'node:crypto';

import { Certifications, FormSetup, Phones, ProjectSetup, type ApiProcess } from '@open-adms/api';
import type { Database, Prisma } from '@open-adms/db';
import { NewProjectSettings, uuidv7, type Policy } from '@open-adms/domain';
import { PhoneKeyBackstop, WorkerLog } from '@open-adms/worker';

import { storiesHostname } from './over-https.ts';
import { builtInPolicy } from './policy.ts';
import { assigned } from './stories/board.ts';
import { primaryBox, saved } from './stories/p1-office.ts';
import { p1TimeZone, setUpP1, setUpP1Sites, startSeries, type P1 } from './stories/p1.ts';
import { listeningApi, StoryApi, type PhoneRequests } from './story-api.ts';
import { StoryDatabase, storyMasterPasscode } from './story-database.ts';
import { StoryMedia } from './story-media.ts';
import { SoftwareKey } from './software-key.ts';

// A monitor of the cast, as a test signs them in.
export interface CastMonitor {
  readonly name: string;
  readonly monitorNumber: string;
  readonly password: string;
}

export interface WorldCast {
  readonly kim: CastMonitor;
  readonly ana: CastMonitor;
  readonly lee: CastMonitor;
  readonly tariq: CastMonitor;
  // On the PARKS project's collections (task 3.5.1).
  readonly jo: CastMonitor;
}

// The lost tower phone, as a browser test plants it: its id and name as enrolled, the passcode
// version it was enrolled under, and its key's two halves in base64 DER (SubjectPublicKeyInfo,
// PKCS #8).
export interface LostPhone {
  readonly deviceId: string;
  readonly name: string;
  readonly masterPasscodeVersion: number;
  readonly publicKey: string;
  readonly privateKey: string;
}

// A day as the project's people name it: 2026-10-19.
function dayIn(timeZone: string, at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export class BrowserWorld {
  // Where the browser tests' page reaches the world's API.
  static readonly apiOrigin = `https://${storiesHostname}`;
  // The world's master passcode, which whoever holds it types on the phone: made up, no
  // installation's.
  static readonly masterPasscode = storyMasterPasscode;

  readonly database: string;
  readonly cast: WorldCast;
  readonly lostPhone: LostPhone;
  private readonly made: StoryDatabase;
  private readonly api: ApiProcess;
  // The API's error lines (a failure's kind and frames, never what was sent: ADR-385).
  readonly errors: string[];

  private constructor(
    made: StoryDatabase,
    { cast, lostPhone }: { readonly cast: WorldCast; readonly lostPhone: LostPhone },
    api: ApiProcess,
    errors: string[],
  ) {
    this.made = made;
    this.database = made.name;
    this.cast = cast;
    this.lostPhone = lostPhone;
    this.api = api;
    this.errors = errors;
  }

  // The world made and listening, for the one page origin given. The caller closes it.
  static async opened(pageOrigin: string): Promise<BrowserWorld> {
    const made = await StoryDatabase.create();
    const errors: string[] = [];
    try {
      made.migrate();
      await made.seed();
      const policy = builtInPolicy();
      const people = await BrowserWorld.cast(made, policy);
      const api = await listeningApi({
        database: made,
        policy,
        media: new StoryMedia(),
        clock: { now: () => new Date() },
        corsOrigins: [pageOrigin],
        log: (line) => {
          if (/"level":(50|60)\b/.test(line)) errors.push(line.trim());
        },
      });
      return new BrowserWorld(made, people, api, errors);
    } catch (problem) {
      await made.drop();
      throw problem;
    }
  }

  // P2 as the example world names it (spec/CONVENTIONS.md §6): PPDR work for the same client under
  // the same declaration event, loads alone, its numbers from 102001, and Marsh Road TDSR entered
  // again with the same GPS and permit. Nothing else of its setup: a phone set up on it picks no
  // more than that.
  private static async setUpP2(
    tx: Prisma.TransactionClient,
    policy: Policy,
    p1: P1,
  ): Promise<void> {
    const ppdr = await tx.programType.findFirstOrThrow({ where: { name: 'PPDR' } });
    const project = await tx.project.create({
      data: {
        name: 'Bayline County PPDR, Hurricane Delphine',
        clientId: p1.client,
        declarationEventId: p1.declarationEvent,
        programTypeId: ppdr.id,
        timeZone: p1TimeZone,
        activeFrom: new Date('2026-10-12'),
        activeTo: new Date('2027-01-31'),
        ticketNumberSource: 'GENERATED',
        workflows: ['LOAD'],
        ...new NewProjectSettings(policy).for(ppdr),
      },
    });
    await startSeries(tx, project.id, { LOAD: 102001 });
    const tdsrType = await tx.siteType.findUniqueOrThrow({ where: { key: 'TDSR' } });
    await tx.disposalSite.create({
      data: {
        projectId: project.id,
        activationDate: new Date('2026-10-12'),
        takesLoads: true,
        name: 'Marsh Road TDSR',
        siteTypeId: tdsrType.id,
        siteTypeKey: tdsrType.key,
        haulOutsLeaveHere: true,
        chargesTippingFee: false,
        ineligibleSite: false,
        permitNumber: 'FDEP-DMS-2026-0117',
        latitude: '39.09000000',
        longitude: '-75.62000000',
      },
    });
  }

  // P1's load form, debris types and field tags, and two trucks certified on the yard phone the
  // day before, each through the service a story writes it with.
  private static async collectionSetup(
    api: Database,
    clock: { now(): Date },
    policy: Policy,
    who: {
      readonly dana: string;
      readonly luis: string;
      readonly project: string;
      readonly prime: string;
      readonly lee: string;
      readonly yard: string;
      readonly parks: string;
    },
  ): Promise<void> {
    const forms = new FormSetup(api, clock, policy);
    for (const [projectId, names] of [
      [who.project, ['Vegetative', 'C&D']],
      [who.parks, ['Vegetative']],
    ] as const) {
      const loadForm = await saved(
        forms.form(who.dana, { projectId, documentType: 'LOAD', name: 'Load' }),
      );
      for (const name of names) {
        const library = await api.debrisType.findFirstOrThrow({ where: { name } });
        await saved(
          forms.debrisType(who.dana, {
            formId: loadForm.id,
            debrisTypeId: library.id,
            reduced: false,
            hiddenOnPhones: false,
          }),
        );
      }
    }
    const projects = new ProjectSetup(api, clock, policy);
    for (const tag of ['Mixed', 'Zone 1 pile']) {
      await saved(projects.fieldTag(who.dana, who.project, tag));
    }
    const yesterday = dayIn(p1TimeZone, new Date(clock.now().getTime() - 86_400_000));
    const certifying = await assigned(api, clock, who.luis, {
      workDate: yesterday,
      projectId: who.project,
      personId: who.lee,
      certifying: true,
      deviceId: who.yard,
    });
    const certifications = new Certifications(api, clock, policy);
    const vehicle = async (name: string) =>
      (await api.vehicleType.findFirstOrThrow({ where: { name } })).id;
    const feature = async (name: string) =>
      (await api.vehicleFeature.findFirstOrThrow({ where: { name } })).id;
    for (const truck of [
      {
        certNumber: '730415',
        vehicleTypeId: await vehicle('Hydraulic Dump Trailer'),
        boxes: [
          primaryBox(360, 96, 72),
          { ...primaryBox(360, 96, 16), featureId: await feature('Sideboards') },
        ],
      },
      {
        certNumber: '730416',
        firstTierSub: 'Rivera Trucking',
        vehicleTypeId: await vehicle('Self-Loading Truck'),
        boxes: [
          primaryBox(264, 92, 96),
          {
            shape: 'TRIANGLE',
            sign: 'SUBTRACT',
            length: 36,
            width: 92,
            height: 48,
            featureId: await feature('Dog Box'),
          } as const,
        ],
      },
    ]) {
      const at = clock.now();
      await saved(
        certifications.certify({
          ...truck,
          id: uuidv7(at),
          projectId: who.project,
          kind: 'CONTAINER',
          primeId: who.prime,
          certifiedById: who.lee,
          deviceId: who.yard,
          assignmentId: certifying,
          certifiedAt: at,
          deviceUtcOffsetMinutes: 0 - at.getTimezoneOffset(),
        }),
      );
    }
  }

  // The PARKS project: its loads from control tickets, 400001–405000; its unit rate tickets from
  // 100001, as every project's are generated (ADR-056).
  private static async setUpParks(
    tx: Prisma.TransactionClient,
    policy: Policy,
    p1: P1,
  ): Promise<string> {
    const parks = await tx.programType.findFirstOrThrow({ where: { name: 'PARKS' } });
    const project = await tx.project.create({
      data: {
        name: 'Bayline County PARKS, Hurricane Delphine',
        clientId: p1.client,
        declarationEventId: p1.declarationEvent,
        programTypeId: parks.id,
        timeZone: p1TimeZone,
        activeFrom: new Date('2026-10-12'),
        activeTo: new Date('2027-01-31'),
        ticketNumberSource: 'CONTROL',
        workflows: ['LOAD'],
        ...new NewProjectSettings(policy).for(parks),
      },
    });
    await startSeries(tx, project.id, { UNIT_RATE: 100001 });
    await tx.controlRange.create({
      data: { projectId: project.id, series: 'LOAD', firstNumber: 400001, lastNumber: 405000 },
    });
    return project.id;
  }

  // The cast, written as the stories write theirs: setup by Dana Reyes through `$write`, the yard
  // phone and the monitors at the API's own endpoints (its process, on the real clock, stopped
  // before the world's own starts on the same port), the board through `Assignments`.
  private static async cast(
    made: StoryDatabase,
    policy: Policy,
  ): Promise<{ readonly cast: WorldCast; readonly lostPhone: LostPhone }> {
    // The cast's clock, set back only while the lost phone is enrolled and marked.
    let behindMs = 0;
    const clock = { now: () => new Date(Date.now() - behindMs) };
    const api = made.open('api');
    const served = new StoryApi({ database: made, clock, policy, media: new StoryMedia() });
    try {
      const dana = uuidv7(clock.now());
      const office = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
        await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
        const luis = await tx.user.create({
          data: { name: 'Luis Ortega', role: 'MANAGER_ANALYST' },
        });
        for (const permission of ['DISPATCH', 'VIEW_DISPATCH'] as const) {
          await tx.userPermission.create({ data: { userId: luis.id, permission } });
        }
        const p1 = await setUpP1(tx, policy);
        await BrowserWorld.setUpP2(tx, policy, p1);
        const parks = await BrowserWorld.setUpParks(tx, policy, p1);
        return {
          parks,
          luis: luis.id,
          project: p1.project,
          prime: p1.prime,
          ...(await setUpP1Sites(tx, p1.project)),
        };
      });
      const asked = served.requests(clock);
      const key = new SoftwareKey();
      const yard = await asked.enrol({
        name: 'P1-YARD',
        passcode: storyMasterPasscode,
        publicKey: key.publicKey,
      });
      served.enrolled(yard.deviceId, key);
      const people = ['Kim Nguyen', 'Ana Brooks', 'Lee Morgan', 'Tariq Patel', 'Jo Kim'];
      const created = new Map<string, CastMonitor & { readonly id: string }>();
      for (const [place, name] of people.entries()) {
        // A made-up phone number without its area code, as the stories' monitors have.
        const password = `555${String(101 + place).padStart(4, '0')}`;
        const answer = await asked.monitorCreated(yard.deviceId, {
          name,
          password,
          passcode: storyMasterPasscode,
        });
        created.set(name, {
          id: answer.userId,
          name,
          monitorNumber: answer.monitorNumber,
          password,
        });
      }
      const of = (name: string) => {
        const monitor = created.get(name);
        if (monitor === undefined) throw new Error(`No monitor ${name} in the world.`);
        return monitor;
      };
      const now = clock.now();
      for (const workDate of [now, new Date(now.getTime() + 86_400_000)].map((at) =>
        dayIn(p1TimeZone, at),
      )) {
        const planned = { workDate, projectId: office.project } as const;
        await assigned(api, clock, office.luis, {
          ...planned,
          personId: of('Kim Nguyen').id,
          fieldEventKinds: ['DISPOSAL'],
          formDocumentTypes: ['DROP_OFF_LOG'],
          siteId: office.tdsr,
        });
        await assigned(api, clock, office.luis, {
          ...planned,
          personId: of('Ana Brooks').id,
          fieldEventKinds: ['COLLECTION'],
          formDocumentTypes: ['INCIDENT'],
        });
        await assigned(api, clock, office.luis, {
          workDate,
          projectId: office.parks,
          personId: of('Jo Kim').id,
          fieldEventKinds: ['COLLECTION'],
        });
        for (const [kind, site] of [
          ['COLLECTION', null],
          ['DISPOSAL', office.landfill],
        ] as const) {
          await assigned(api, clock, office.luis, {
            ...planned,
            personId: of('Lee Morgan').id,
            fieldEventKinds: [kind],
            siteId: site,
          });
        }
      }
      await BrowserWorld.collectionSetup(api, clock, policy, {
        dana,
        luis: office.luis,
        project: office.project,
        prime: office.prime,
        lee: of('Lee Morgan').id,
        yard: yard.deviceId,
        parks: office.parks,
      });
      const handed = ({ name, monitorNumber, password }: CastMonitor): CastMonitor => ({
        name,
        monitorNumber,
        password,
      });
      return {
        cast: {
          kim: handed(of('Kim Nguyen')),
          ana: handed(of('Ana Brooks')),
          lee: handed(of('Lee Morgan')),
          tariq: handed(of('Tariq Patel')),
          jo: handed(of('Jo Kim')),
        },
        lostPhone: await BrowserWorld.lostPhone(made, asked, office.luis, (ms) => {
          behindMs = ms;
        }),
      };
    } finally {
      await served.close();
      await api.$disconnect();
    }
  }

  // P1-TWR-LF enrolled and marked lost by Luis the firm's hours and a minute ago (the cast's clock
  // set back that long, then put right), and its key revoked now by the worker's pass.
  private static async lostPhone(
    made: StoryDatabase,
    asked: PhoneRequests,
    luis: string,
    setBack: (ms: number) => void,
  ): Promise<LostPhone> {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    const name = 'P1-TWR-LF';
    const api = made.open('api');
    const worker = made.open('worker');
    try {
      const { phoneKeyRevokedAfterHours: hours } = await api.firmSettings.findUniqueOrThrow({
        where: { id: 1 },
      });
      if (hours === null) throw new Error('The firm keeps a lost phone’s key for good.');
      const reason = await api.reason.findFirstOrThrow({
        where: { name: 'Lost in the field', uses: { has: 'PHONE_REMOVAL' } },
      });
      const behindMs = (hours * 60 + 1) * 60_000;
      setBack(behindMs);
      let enrolled: Awaited<ReturnType<PhoneRequests['enrol']>>;
      try {
        enrolled = await asked.enrol({ name, passcode: storyMasterPasscode, publicKey });
        const removed = await new Phones(api, {
          now: () => new Date(Date.now() - behindMs),
        }).remove(luis, enrolled.deviceId, {
          status: 'LOST',
          reasonId: reason.id,
          note: 'Not handed in at the Landfill’s tower',
        });
        if (!removed.saved) throw new Error(removed.refusal.message);
      } finally {
        setBack(0);
      }
      const revoked = await new PhoneKeyBackstop(
        worker,
        new WorkerLog({ write: () => undefined }),
        { now: () => new Date() },
      ).pass();
      if (!revoked.revoked.includes(enrolled.deviceId)) {
        throw new Error('The worker’s pass didn’t revoke the lost phone’s key.');
      }
      return {
        deviceId: enrolled.deviceId,
        name,
        masterPasscodeVersion: enrolled.masterPasscodeVersion,
        publicKey,
        privateKey: pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
      };
    } finally {
      await api.$disconnect();
      await worker.$disconnect();
    }
  }

  async close(): Promise<void> {
    try {
      await this.api.close();
    } finally {
      await this.made.drop();
    }
  }
}
