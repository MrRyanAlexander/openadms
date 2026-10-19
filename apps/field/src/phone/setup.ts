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
import {
  phoneSetupChoicesEndpoint,
  type PhoneAssignmentAnswer,
  type PhoneListsRecord,
  type PhoneSetupChoicesAnswer,
  type UnplannedAssignmentReport,
} from '@open-adms/contracts';
import {
  AssignmentRules,
  uuidv7,
  type AssignmentFormDocumentType,
  type FieldEventKindName,
} from '@open-adms/domain';

import type { NotAnswered } from '../server.ts';
import type { PhoneIdentity } from './identity.ts';
import type { PhoneLists } from './lists.ts';
import type { LoginList } from './login-list.ts';
import type { MonitorOnPhone } from './monitor.ts';
import { checkOpened } from './offline-check.ts';
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
  // No connection, and the passcode didn't open the phone's own check of it.
  | { readonly kind: 'wrong' }
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

const rules = new AssignmentRules();

export class PhoneSetup {
  private readonly identity: PhoneIdentity;
  private readonly monitor: MonitorOnPhone;
  private readonly lists: PhoneLists;
  private readonly loginList: LoginList;
  private readonly reports: PhoneReports;
  private readonly now: () => Date;

  constructor(
    identity: PhoneIdentity,
    monitor: MonitorOnPhone,
    lists: PhoneLists,
    loginList: LoginList,
    reports: PhoneReports,
    now = () => new Date(),
  ) {
    this.identity = identity;
    this.monitor = monitor;
    this.lists = lists;
    this.loginList = loginList;
    this.reports = reports;
    this.now = now;
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
    const madeAt = this.now();
    const { project, work, site, payItemIds, monitor } = picked;
    const report: UnplannedAssignmentReport = {
      id: uuidv7(madeAt),
      projectId: project.id,
      personId: monitor.monitorId,
      fieldEventKinds: [...work.fieldEventKinds],
      certifying: work.certifying,
      formDocumentTypes: [...work.formDocumentTypes],
      siteId: site?.id ?? null,
      payItemIds: [...payItemIds],
      occasion: 'SETUP',
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
    const takenHere = await this.lists.setUp(assignment, monitor.monitorId, payItemIds);
    if (takenHere && (await this.monitor.signedIn())?.userId === monitor.monitorId) {
      await this.monitor.took(assignment, null);
    }
    if (passcode !== null) {
      const master = await this.identity.masterUser(passcode);
      if (master.kind === 'atThePhone') await this.reports.sent(master.send);
    }
    return { assignment, takenHere, report: await this.reports.standing(report.id) };
  }

  private choices(passcode: string, projectId: string | null, monitorsAfter: string | null) {
    return this.identity.asPhone(phoneSetupChoicesEndpoint, {
      json: { passcode, projectId, monitorsAfter },
    });
  }

  private async offline(passcode: string): Promise<SetupOpened> {
    const held = await this.lists.held();
    if (held === undefined) return { kind: 'noLists' };
    const check = await this.loginList.passcode();
    if (check === undefined) return { kind: 'noCheck' };
    if ((await checkOpened(passcode, check.check)) === undefined) {
      await this.reports.keepUse('WRONG_TRY', null);
      return { kind: 'wrong' };
    }
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
