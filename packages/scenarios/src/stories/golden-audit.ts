// The golden mission's audit rows, read through the API (spec/golden/MISSION.md §4, "Audit log
// (excerpt)"; invariants 2, 3, 5; adms-ledger-audit; ARCHITECTURE §5.3; ADR-085, 097, 544): each
// ticket the excerpt names, its history as the back office reads it (`readTicketHistory`, view
// review), oldest first, in the outcomes' words (`auditLines`). Shared by the story
// `golden-mission` and the field app's browser world for the golden mission (`MissionWorld`),
// which check what they read against the outcomes' one home (`goldenOutcomes.reviewed.p1.audit`).
//
// The reviewer reads the history; whoever reads setup names what its rows hold by id (the pay
// items' codes, the firm's reasons), as a back-office page would beside it.
import {
  listListValuesEndpoint,
  listPayItemsEndpoint,
  readTicketHistoryEndpoint,
  type AnswerOf,
  type AuditTrailAnswer,
} from '@open-adms/contracts';

import type { OfficeBrowser } from '../office-browser.ts';
import { auditedTickets, auditLines, type AuditTickets } from './golden-outcomes.ts';

// Every pay item's code on the projects, by id, read at a browser that reads setup.
export async function payItemCodes(
  setup: OfficeBrowser,
  projectIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const codes = new Map<string, string>();
  for (const projectId of projectIds) {
    let after: string | null = null;
    do {
      const page: AnswerOf<typeof listPayItemsEndpoint> = await setup.answered(
        listPayItemsEndpoint,
        { ids: { projectId }, query: after === null ? {} : { after } },
      );
      for (const { payItem } of page.payItems) codes.set(payItem.id, payItem.code);
      after = page.next;
    } while (after !== null);
  }
  return codes;
}

// The firm's reasons, by id, archived ones too: a row of the log names the one picked then.
async function reasonNames(setup: OfficeBrowser): Promise<ReadonlyMap<string, string>> {
  const names = new Map<string, string>();
  for (const archived of ['false', 'true'] as const) {
    let after: string | null = null;
    do {
      const page: AnswerOf<typeof listListValuesEndpoint> = await setup.answered(
        listListValuesEndpoint,
        { ids: { list: 'reasons' }, query: after === null ? { archived } : { archived, after } },
      );
      for (const { id, name } of page.values) names.set(id, name);
      after = page.next;
    } while (after !== null);
  }
  return names;
}

export class MissionAudit {
  private readonly reviewer: OfficeBrowser;
  private readonly setup: OfficeBrowser;
  private readonly projectId: string;

  constructor(reviewer: OfficeBrowser, setup: OfficeBrowser, projectId: string) {
    this.reviewer = reviewer;
    this.setup = setup;
    this.projectId = projectId;
  }

  // Each ticket the excerpt names, its rows that matter, oldest first.
  async read(): Promise<AuditTickets> {
    const named = {
      payItems: await payItemCodes(this.setup, [this.projectId]),
      reasons: await reasonNames(this.setup),
    };
    const read: Record<string, readonly string[]> = {};
    for (const { workflow, ticketNumber } of auditedTickets) {
      read[ticketNumber] = auditLines(await this.history(workflow, ticketNumber), named);
    }
    return read;
  }

  // A ticket's whole history, every page, oldest first.
  private async history(
    workflow: 'LOAD' | 'UNIT_RATE',
    ticketNumber: string,
  ): Promise<AuditTrailAnswer['entries']> {
    const entries: AuditTrailAnswer['entries'] = [];
    let after: string | null = null;
    do {
      const page: AuditTrailAnswer = await this.reviewer.answered(readTicketHistoryEndpoint, {
        ids: { projectId: this.projectId, workflow, ticketNumber },
        query: after === null ? { limit: '200' } : { limit: '200', after },
      });
      entries.push(...page.entries);
      after = page.next;
    } while (after !== null);
    return entries.reverse();
  }
}
