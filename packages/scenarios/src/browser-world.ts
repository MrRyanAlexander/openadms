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
import type { ApiProcess } from '@open-adms/api';
import { uuidv7, type Policy } from '@open-adms/domain';

import { storiesHostname } from './over-https.ts';
import { builtInPolicy } from './policy.ts';
import { assigned } from './stories/board.ts';
import { p1TimeZone, setUpP1, setUpP1Sites } from './stories/p1.ts';
import { listeningApi, StoryApi } from './story-api.ts';
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
  private readonly made: StoryDatabase;
  private readonly api: ApiProcess;
  // The API's error lines (a failure's kind and frames, never what was sent: ADR-385).
  readonly errors: string[];

  private constructor(made: StoryDatabase, cast: WorldCast, api: ApiProcess, errors: string[]) {
    this.made = made;
    this.database = made.name;
    this.cast = cast;
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
      const cast = await BrowserWorld.cast(made, policy);
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
      return new BrowserWorld(made, cast, api, errors);
    } catch (problem) {
      await made.drop();
      throw problem;
    }
  }

  // The cast, written as the stories write theirs: setup by Dana Reyes through `$write`, the yard
  // phone and the monitors at the API's own endpoints (its process, on the real clock, stopped
  // before the world's own starts on the same port), the board through `Assignments`.
  private static async cast(made: StoryDatabase, policy: Policy): Promise<WorldCast> {
    const clock = { now: () => new Date() };
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
        return { luis: luis.id, project: p1.project, ...(await setUpP1Sites(tx, p1.project)) };
      });
      const asked = served.requests(clock);
      const key = new SoftwareKey();
      const yard = await asked.enrol({
        name: 'P1-YARD',
        passcode: storyMasterPasscode,
        publicKey: key.publicKey,
      });
      served.enrolled(yard.deviceId, key);
      const people = ['Kim Nguyen', 'Ana Brooks', 'Lee Morgan', 'Tariq Patel'];
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
      const handed = ({ name, monitorNumber, password }: CastMonitor): CastMonitor => ({
        name,
        monitorNumber,
        password,
      });
      return {
        kim: handed(of('Kim Nguyen')),
        ana: handed(of('Ana Brooks')),
        lee: handed(of('Lee Morgan')),
        tariq: handed(of('Tariq Patel')),
      };
    } finally {
      await served.close();
      await api.$disconnect();
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
