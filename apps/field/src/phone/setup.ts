// Setting a phone up under the master passcode when its monitor has no assignment (ARCHITECTURE
// §7.1, §7.5; adms-field-app §4A.0 (5); BACKLOG 3.3.1, REQ-311, 311a, C122, C125; AC-02-38,
// AC-11-23…25; ADR-240, 456, 457, 463, 576). Whoever holds the passcode picks the project, then
// the work, the one site where the work is at one, the unit rate pay items where it is unit rate
// work, and the monitor; the phone makes the **unplanned assignment** with an id of its own and
// reports it. **The passcode is the caller's, held in memory for this act alone**: handed in to
// each call, sent only to the server's own endpoints for what it opens, never kept by the phone,
// a log or a report (AC-11-23).
//
// - **Online** (AC-11-24): what it picks from is the server's (`POST /phones/current/setup-choices`,
//   the passcode in the body): the open projects, then the picked one's live sites and unit rate
//   pay items, and the monitors in service a page at a time; a passcode the server doesn't take
//   is its own to count. At the end the master user, proving the phone with the passcode beside
//   its signature, sends the report at once.
// - **No connection**: only on the project whose lists the phone holds (a new project needs a
//   connection, ADR-240), checked against the phone's own check of the passcode (a wrong try kept
//   as a use to report); its sites and the unit rate pay items it holds, and the monitors of its
//   login list. The report is kept until the phone finds signal and somebody is signed in on it.
// - **Either way the report is kept until it is saved** (AC-11-25; reports.ts) and, set up on
//   the project whose lists the phone holds, **the phone takes the assignment at once**: its
//   monitor becomes the one it was made for, who may sign in with no signal from the login list
//   (ADR-575). Its day is the phone's clock's, in the project's time zone (the domain's).
// - **The work it offers** is every kind of field event, certifying and the forms that are no
//   ticket's (lists every phone has, ADR-463); a site is offered from the project's, or none for a
//   curb; nothing is refused over what is picked (flag, never block). *Agent defaults* (ADR-576).
//
// **Switching and moving** (ARCHITECTURE §7.3; adms-field-app §4A.0 (8), (9); BACKLOG 3.3.2, C122,
// C123; AC-02-46, 47, AC-11-27, 64; ADR-095, 120, 458, 464, 577), each under the passcode, with no
// connection if need be:
// - **A setup for another monitor than the phone's** (the one it was handed to, or whose lists it
//   holds) **is a switch**: its report says `MONITOR_SWITCH`. A switch to a monitor with their
//   own assignment makes none (`handedOver`): the phone logs the use `MONITOR_SWITCH` naming them,
//   and their own sign-in takes theirs; where the phone holds their assignment for the day
//   already, it is never asked.
// - **Either way the earlier monitor's work is passed on** (`passedOn`): whoever is signed in is
//   signed out, their session and any sign-in made offline with its proof dropped (AC-11-64); the
//   records they made and the phone hasn't sent are moved to the archived queues under their id,
//   still theirs, hidden from the next monitor, and sent by the sync (3.4.1).
// - **A move** (`moved`) is a new unplanned assignment for the monitor signed in, at another of
//   the project's sites, with the same work and unit rate pay items, reported with `occasion:
//   'SETUP'`; the earlier assignment stands as it was, and each record keeps its own.
import {
  phoneSetupChoicesEndpoint,
  type PhoneAssignmentAnswer,
  type PhoneListsRecord,
  type PhoneSetupChoicesAnswer,
  type UnplannedAssignmentReport,
} from '@open-adms/contracts';
import {
  AssignmentRules,
  ProjectClock,
  uuidv7,
  type AssignmentFormDocumentType,
  type FieldEventKindName,
  type UnplannedOccasion,
} from '@open-adms/domain';

import type { NotAnswered } from '../server.ts';
import type { Change, PhoneStore } from '../store/phone-store.ts';
import type { PhoneIdentity } from './identity.ts';
import type { PhoneLists } from './lists.ts';
import type { LoginList } from './login-list.ts';
import type { MonitorOnPhone } from './monitor.ts';
import type { PasscodeOnPhone } from './passcode.ts';
import { offsetOf, type PhoneReports, type ReportStanding } from './reports.ts';

export type SetupProject = PhoneSetupChoicesAnswer['projects'][number];
export type SetupMonitor = PhoneSetupChoicesAnswer['monitors'][number];
export type SetupSite = PhoneListsRecord['sites'][number];
export type SetupPayItem = PhoneListsRecord['payItems'][number];

// What a project's setup picks from: its sites and its unit rate pay items in service.
export interface ProjectChoices {
  readonly sites: readonly SetupSite[];
  readonly payItems: readonly SetupPayItem[];
}

// What typing the passcode opened: the server's choices; the held project's, with no connection;
// or why not.
export type SetupOpened =
  | {
      readonly kind: 'online';
      readonly projects: readonly SetupProject[];
      readonly monitors: readonly SetupMonitor[];
      readonly moreMonitorsAfter: string | null;
    }
  | {
      readonly kind: 'offline';
      readonly project: SetupProject;
      readonly choices: ProjectChoices;
      readonly monitors: readonly SetupMonitor[];
    }
  // No connection, and the passcode didn't open the phone's own check of it: counted, and any
  // wait that puts on it; not checked while a wait holds; the phone locked (ADR-577).
  | { readonly kind: 'wrong'; readonly waitUntil: Date | null }
  | { readonly kind: 'waiting'; readonly until: Date }
  | { readonly kind: 'locked' }
  // No connection, and the phone holds no lists, or no check of the passcode.
  | { readonly kind: 'noLists' }
  | { readonly kind: 'noCheck' }
  | NotAnswered;

// The work picked: the kinds of field event, certifying, the forms that are no ticket's.
export interface SetupWork {
  readonly fieldEventKinds: readonly FieldEventKindName[];
  readonly certifying: boolean;
  readonly formDocumentTypes: readonly AssignmentFormDocumentType[];
}

// Everything a setup picked.
export interface SetupPicked {
  readonly project: SetupProject;
  readonly work: SetupWork;
  readonly site: SetupSite | null;
  readonly payItemIds: readonly string[];
  readonly monitor: SetupMonitor;
}

// What the setup came to: the assignment made, whether the phone took it now (its lists are that
// project's), and where its report stands.
export interface SetupMade {
  readonly assignment: PhoneAssignmentAnswer;
  readonly takenHere: boolean;
  readonly report: ReportStanding;
}

// What a move picks from: the project's sites, with signal as the server answers them, else
// those the phone holds; or why not.
export type MoveOpened =
  | { readonly kind: 'online' | 'offline'; readonly sites: readonly SetupSite[] }
  | { readonly kind: 'notSignedIn' }
  | { readonly kind: 'closed' }
  | Exclude<SetupOpened, { readonly kind: 'online' } | { readonly kind: 'offline' }>;

const archived = 'archivedQueues';

const rules = new AssignmentRules();

export class PhoneSetup {
  private readonly store: PhoneStore;
  private readonly identity: PhoneIdentity;
  private readonly monitor: MonitorOnPhone;
  private readonly lists: PhoneLists;
  private readonly loginList: LoginList;
  private readonly passcode: PasscodeOnPhone;
  private readonly reports: PhoneReports;
  private readonly now: () => Date;

  constructor(
    store: PhoneStore,
    identity: PhoneIdentity,
    monitor: MonitorOnPhone,
    lists: PhoneLists,
    loginList: LoginList,
    passcode: PasscodeOnPhone,
    reports: PhoneReports,
    now = () => new Date(),
  ) {
    this.store = store;
    this.identity = identity;
    this.monitor = monitor;
    this.lists = lists;
    this.loginList = loginList;
    this.passcode = passcode;
    this.reports = reports;
    this.now = now;
  }

  // Whether a setup for that monitor passes the phone on: the phone has a monitor, and it is
  // somebody else.
  async isSwitch(monitorId: string): Promise<boolean> {
    const earlier = await this.lists.phonesMonitor();
    return earlier !== null && earlier !== monitorId;
  }

  // Whether the phone holds that monitor's assignment for today, by its project's day: a switch
  // to them makes none, and nobody is asked (AC-11-27).
  async holdsAssignmentFor(monitorId: string): Promise<boolean> {
    const held = await this.lists.held();
    if (held?.monitorId !== monitorId) return false;
    const { workDate, project } = held.assignment;
    return workDate === new ProjectClock(project.timeZone).day(this.now());
  }

  // The passcode typed: the server asked first, with no project picked yet; unreachable, the
  // phone's own check and the lists it holds.
  async opened(passcode: string): Promise<SetupOpened> {
    const reply = await this.choices(passcode, null, null);
    if (reply.kind === 'answered') {
      const { projects, monitors, moreMonitorsAfter } = reply.answer;
      return { kind: 'online', projects, monitors, moreMonitorsAfter };
    }
    return reply.kind === 'unreachable' ? this.offline(passcode) : reply;
  }

  // A project picked online: its live sites and unit rate pay items in service, as the server
  // answers them; none where it has closed since (`closed`: the supervisor picks again).
  async project(
    passcode: string,
    projectId: string,
  ): Promise<
    | { readonly kind: 'project'; readonly choices: ProjectChoices }
    | { readonly kind: 'closed' }
    | NotAnswered
  > {
    const reply = await this.choices(passcode, projectId, null);
    if (reply.kind !== 'answered') return reply;
    const { project } = reply.answer;
    if (project === null) return { kind: 'closed' };
    return {
      kind: 'project',
      choices: { sites: project.sites, payItems: project.payItems },
    };
  }

  // The next page of monitors online, after the last one shown.
  async moreMonitors(
    passcode: string,
    after: string,
  ): Promise<
    | {
        readonly kind: 'monitors';
        readonly monitors: readonly SetupMonitor[];
        readonly moreMonitorsAfter: string | null;
      }
    | NotAnswered
  > {
    const reply = await this.choices(passcode, null, after);
    if (reply.kind !== 'answered') return reply;
    const { monitors, moreMonitorsAfter } = reply.answer;
    return { kind: 'monitors', monitors, moreMonitorsAfter };
  }

  // The unplanned assignment made, now by the phone's clock, and kept to report; taken here where
  // the phone holds that project's lists; and, where the passcode is handed in (a setup made
  // online), sent at once by the master user. Its report's standing is what the server said.
  async made(picked: SetupPicked, passcode: string | null): Promise<SetupMade> {
    const { project, work, site, payItemIds, monitor } = picked;
    const occasion: UnplannedOccasion = (await this.isSwitch(monitor.monitorId))
      ? 'MONITOR_SWITCH'
      : 'SETUP';
    if (occasion === 'MONITOR_SWITCH') await this.passedOn(monitor.monitorId);
    return this.unplanned(
      { project, work, site, payItemIds, monitorId: monitor.monitorId, occasion },
      passcode,
    );
  }

  // Handed over to a monitor who has their own assignment (ADR-464, 577): no assignment made; the
  // earlier monitor's work passed on, the use `MONITOR_SWITCH` naming them kept, and sent at once
  // by the master user where the passcode is handed in (a switch made with signal). They are the
  // phone's monitor now, and sign in with their own Monitor ID and password. Where the use stands.
  async handedOver(monitor: SetupMonitor, passcode: string | null): Promise<ReportStanding> {
    await this.passedOn(monitor.monitorId);
    const use = await this.reports.keepUse('MONITOR_SWITCH', monitor.monitorId);
    await this.lists.handedTo(monitor.monitorId);
    await this.sentAtOnce(passcode);
    return this.reports.standing(use.id);
  }

  // What a move picks from, for the monitor signed in on the project whose lists the phone holds
  // (AC-02-47): with signal, the project's live sites as the server answers them (the passcode
  // checked there); with none, those the phone holds, against its own check.
  async forMove(passcode: string): Promise<MoveOpened> {
    const [signedIn, held] = await Promise.all([this.monitor.signedIn(), this.lists.held()]);
    if (signedIn?.assignment == null) return { kind: 'notSignedIn' };
    if (held === undefined) return { kind: 'noLists' };
    const reply = await this.project(passcode, signedIn.assignment.project.id);
    if (reply.kind === 'project') return { kind: 'online', sites: reply.choices.sites };
    if (reply.kind !== 'unreachable') return reply;
    const checked = await this.passcode.checked(passcode);
    if (checked.kind !== 'opened') return checked;
    return { kind: 'offline', sites: held.lists.sites };
  }

  // Moved to another site (ADR-458; AC-02-47, AC-11-27): a new unplanned assignment for the
  // monitor signed in, at that site, with their work and the unit rate pay items the phone holds
  // for it, made now by the phone's clock and taken at once. Nothing where nobody is signed in on
  // an assignment the phone holds the lists of.
  async moved(site: SetupSite, passcode: string | null): Promise<SetupMade | undefined> {
    const [signedIn, held] = await Promise.all([this.monitor.signedIn(), this.lists.held()]);
    const assignment = signedIn?.assignment;
    if (signedIn === undefined || assignment == null || held === undefined) return undefined;
    if (held.assignment.id !== assignment.id) return undefined;
    const { project, fieldEventKinds, certifying, formDocumentTypes } = assignment;
    return this.unplanned(
      {
        project,
        work: { fieldEventKinds, certifying, formDocumentTypes },
        site,
        payItemIds: held.lists.payItems.map(({ id }) => id),
        monitorId: signedIn.userId,
        occasion: 'SETUP',
      },
      passcode,
    );
  }

  // The phone passed on to the monitor named (AC-02-46, AC-11-64): whoever else is signed in is
  // signed out, their session and offline proof dropped; the records the phone hasn't sent, which
  // are its monitor's (one at a time), moved to the archived queues under that monitor's id, still
  // theirs, hidden from the next. Nothing where the phone is passed to its own monitor.
  async passedOn(to: string): Promise<void> {
    const earlier = await this.lists.phonesMonitor();
    const signedIn = await this.monitor.signedIn();
    if (signedIn !== undefined && signedIn.userId !== to) await this.monitor.signOut();
    if (earlier === null || earlier === to) return;
    const unsent = await this.store.readAll('records');
    const changes: Change[] = unsent.flatMap(({ id, value }) => [
      { shelf: archived, id: `${earlier}:${id}`, value },
      { shelf: 'records', id, dropped: true },
    ]);
    if (changes.length > 0) await this.store.change(changes);
  }

  private async unplanned(
    made: {
      readonly project: SetupProject;
      readonly work: SetupWork;
      readonly site: SetupSite | null;
      readonly payItemIds: readonly string[];
      readonly monitorId: string;
      readonly occasion: UnplannedOccasion;
    },
    passcode: string | null,
  ): Promise<SetupMade> {
    const madeAt = this.now();
    const { project, work, site, payItemIds, monitorId, occasion } = made;
    const report: UnplannedAssignmentReport = {
      id: uuidv7(madeAt),
      projectId: project.id,
      personId: monitorId,
      fieldEventKinds: [...work.fieldEventKinds],
      certifying: work.certifying,
      formDocumentTypes: [...work.formDocumentTypes],
      siteId: site?.id ?? null,
      payItemIds: [...payItemIds],
      occasion,
      madeAt: madeAt.toISOString(),
      deviceUtcOffsetMinutes: offsetOf(madeAt),
    };
    await this.reports.keepUnplanned(report);
    const assignment: PhoneAssignmentAnswer = {
      id: report.id,
      workDate: rules.unplannedDay(madeAt, project.timeZone),
      project,
      fieldEventKinds: report.fieldEventKinds,
      certifying: report.certifying,
      formDocumentTypes: report.formDocumentTypes,
      site: site === null ? null : { id: site.id, name: site.name },
    };
    const takenHere = await this.lists.setUp(assignment, monitorId, payItemIds);
    if (takenHere && (await this.monitor.signedIn())?.userId === monitorId) {
      await this.monitor.took(assignment, null);
    }
    await this.sentAtOnce(passcode);
    return { assignment, takenHere, report: await this.reports.standing(report.id) };
  }

  // What the phone holds to report, sent at once by the master user where the passcode is handed
  // in; kept for the monitor's next request otherwise, or where there is no answer.
  private async sentAtOnce(passcode: string | null): Promise<void> {
    if (passcode === null) return;
    const master = await this.identity.masterUser(passcode);
    if (master.kind === 'atThePhone') await this.reports.sent(master.send);
  }

  private choices(passcode: string, projectId: string | null, monitorsAfter: string | null) {
    return this.identity.asPhone(phoneSetupChoicesEndpoint, {
      json: { passcode, projectId, monitorsAfter },
    });
  }

  private async offline(passcode: string): Promise<SetupOpened> {
    const held = await this.lists.held();
    if (held === undefined) return { kind: 'noLists' };
    const checked = await this.passcode.checked(passcode);
    if (checked.kind !== 'opened') return checked;
    const entries = await this.loginList.entries();
    return {
      kind: 'offline',
      project: held.assignment.project,
      choices: { sites: held.lists.sites, payItems: held.lists.payItems.filter(isInService) },
      monitors: entries
        .map(({ monitorId, monitorNumber, name }) => ({ monitorId, monitorNumber, name }))
        .sort((one, other) => one.name.localeCompare(other.name)),
    };
  }
}

// A unit rate pay item a monitor may be set up to do: one in service.
function isInService(payItem: SetupPayItem): boolean {
  return !payItem.archived;
}
