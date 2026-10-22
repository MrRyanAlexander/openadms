// What the audit log holds, as a person reads it (ARCHITECTURE §5.3; invariant 3; ADR-097, 544):
// one change a row, newest first, as the database wrote it: when, who (a person, the system, the
// master passcode's or a phone's key), from where, what changed (each field's value before and
// after) and why. The log is evidence: read here, never changed. And what each run of the worker
// decided for a ticket and why, in its own words.
import type {
  AnswerOf,
  AuditTrailAnswer,
  Endpoint,
  TicketDecisionsAnswer,
} from '@open-adms/contracts';

import type { Asking } from '../api.ts';
import { PagedTable } from '../look/paged-table.tsx';
import { money, say, words } from '../words.ts';
import { at, nameOf, payItemOf, useReviewing } from './reviewing.tsx';

type Entry = AuditTrailAnswer['entries'][number];
type Decision = TicketDecisionsAnswer['decisions'][number];

// A value as the log kept it, in a line: text as it is, anything else as written.
const valueOf = (value: unknown): string => {
  if (value === null || value === undefined) return words.common.none;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
};

// What one change did, field by field: before → after.
export function changeOf(entry: Entry): readonly string[] {
  const before = (entry.priorValue ?? {}) as Record<string, unknown>;
  const after = (entry.newValue ?? {}) as Record<string, unknown>;
  if (entry.operation !== 'UPDATE') return [];
  return entry.changedFields.map((field) =>
    say(words.history.changed, {
      field,
      before: valueOf(before[field]),
      after: valueOf(after[field]),
    }),
  );
}

// A page of the log, newest first, from any endpoint that reads one.
export function AuditEntries<E extends Endpoint>({
  caption,
  served,
  asking,
  reloaded = 0,
}: {
  readonly caption: string;
  readonly served: E;
  readonly asking: Asking<E>;
  readonly reloaded?: number;
}) {
  const said = words.history;
  const { clock } = useReviewing();
  return (
    <PagedTable
      caption={caption}
      served={served}
      asking={asking}
      reloaded={reloaded}
      rowsOf={(answer: AnswerOf<E>) => (answer as AuditTrailAnswer).entries}
      nextOf={(answer: AnswerOf<E>) => (answer as AuditTrailAnswer).next}
      keyOf={(entry: Entry) => entry.id}
      columns={[
        { label: said.when, names: true, cell: (entry) => at(clock, entry.occurredAt) },
        { label: said.who, cell: (entry) => entry.actor?.name ?? words.common.none },
        { label: said.source, cell: (entry) => said.sources[entry.source] },
        {
          label: said.what,
          cell: (entry) => {
            const changes = changeOf(entry);
            return (
              <>
                <span>
                  {say(said.operation, {
                    operation: said.operations[entry.operation],
                    table: entry.tableName,
                  })}
                </span>
                {changes.length === 0 ? null : (
                  <ul className="plain-list">
                    {changes.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </>
            );
          },
        },
        { label: said.why, cell: (entry) => entry.reason ?? '' },
      ]}
    />
  );
}

// What each run of the worker decided for a ticket, newest first.
export function Decisions<E extends Endpoint>({
  served,
  asking,
  reloaded = 0,
}: {
  readonly served: E;
  readonly asking: Asking<E>;
  readonly reloaded?: number;
}) {
  const said = words.history;
  const { clock, names } = useReviewing();
  return (
    <PagedTable
      caption={said.decisions}
      served={served}
      asking={asking}
      reloaded={reloaded}
      rowsOf={(answer: AnswerOf<E>) => (answer as TicketDecisionsAnswer).decisions}
      nextOf={(answer: AnswerOf<E>) => (answer as TicketDecisionsAnswer).next}
      keyOf={(decision: Decision) => decision.id}
      columns={[
        { label: said.when, names: true, cell: (decision) => at(clock, decision.run.startedAt) },
        { label: said.started, cell: (decision) => said.triggers[decision.run.trigger] },
        { label: said.status, cell: (decision) => words.review.statuses[decision.status] },
        {
          label: said.why,
          cell: (decision) => (
            <>
              <span>{decision.processed ? decision.why : said.notProcessed}</span>
              {decision.lines.length === 0 ? null : (
                <ul className="plain-list">
                  {decision.lines.map((line) => (
                    <li key={`${line.splitSuffix}-${String(line.slot)}`}>
                      {say(said.line, {
                        slot: line.slot,
                        payItem: payItemOf(names, line.payItemId),
                        rule: nameOf(names.rules, line.ruleId),
                        quantity: line.quantity,
                        rate: money(line.rate),
                        amount: money(line.amount),
                      })}
                    </li>
                  ))}
                </ul>
              )}
              {decision.voidedByPerson === null ? null : (
                <p>
                  {say(said.voidedBy, {
                    name: decision.voidedByPerson.name,
                    reason: decision.voidedByPerson.reason,
                  })}
                </p>
              )}
              {decision.voidedByRules.map((rule) => (
                <p key={rule.id}>{say(said.voidedByRule, { rule: rule.name })}</p>
              ))}
            </>
          ),
        },
      ]}
    />
  );
}
