// A project's reports (REQ-409, 410; spec/FROM-BUILD-1.md §9): what it moved over a day, a week, a
// month or any range of its days, narrowed by workflow, debris type, site or contractor: **debris
// totals, never costs**. The periods offered fit the project's length (FROM-BUILD-1 §13). Beside
// them the email summary in the user's shape, to copy and paste, and the daily report as a PDF.
// Nothing is stored: a report is made each time, like a printout.
import {
  dailyReportFileEndpoint,
  readDebrisTotalsEndpoint,
  readEmailSummaryEndpoint,
  type DebrisTotalsAnswer,
} from '@open-adms/contracts';
import { workflows, type ProjectClock } from '@open-adms/domain';
import { Banner, Button, ScreenTitle } from '@open-adms/look';
import { useState } from 'react';

import type { NotAnswered } from '../api.ts';
import { ChoiceField, DateEntry, SelectField } from '../look/fields.tsx';
import { Table } from '../look/paged-table.tsx';
import { savedFile } from '../look/save-file.ts';
import { Shown, Trouble, useApi, useRead } from '../reading.tsx';
import { optionsOf, Reviewed, useReviewing } from '../review/reviewing.tsx';
import { counted, day, number, say, words } from '../words.ts';

export function Reports({ projectId }: { readonly projectId: string }) {
  return (
    <main data-screen="reports" className="page" id="content">
      <Reviewed projectId={projectId}>
        <ReportsOf projectId={projectId} />
      </Reviewed>
    </main>
  );
}

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'whole' | 'range';

// A day moved on by whole days, as the project's calendar counts them.
const shifted = (calendar: string, days: number): string => {
  const [year, month, date] = calendar.split('-').map(Number);
  const moved = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (date ?? 1) + days));
  return moved.toISOString().slice(0, 10);
};

const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

// The days a period covers, the project's today counted.
function rangeOf(
  period: Period,
  clock: ProjectClock,
  activeFrom: string,
  range: { from: string; to: string },
) {
  const today = clock.day(new Date());
  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday':
      return { from: shifted(today, -1), to: shifted(today, -1) };
    case 'week': {
      const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
      return { from: shifted(today, -weekday), to: today };
    }
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today };
    case 'whole':
      return { from: activeFrom, to: today };
    case 'range':
      return range;
  }
}

const any = '';

function ReportsOf({ projectId }: { readonly projectId: string }) {
  const api = useApi();
  const said = words.reports;
  const { project, clock, names } = useReviewing();
  const today = clock.day(new Date());
  const length = daysBetween(project.activeFrom, today);
  // The periods a project of this length is read by: a week's project has no month.
  const periods: readonly Period[] = [
    'today',
    'yesterday',
    'week',
    ...(length > 7 ? (['month'] as const) : []),
    ...(length <= 365 ? (['whole'] as const) : []),
    'range',
  ];
  const [period, setPeriod] = useState<Period>('yesterday');
  const [range, setRange] = useState({ from: shifted(today, -6), to: today });
  const [workflow, setWorkflow] = useState<string>(any);
  const [debrisType, setDebrisType] = useState<string>(any);
  const [site, setSite] = useState<string>(any);
  const [contractor, setContractor] = useState<string>(any);
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const [making, setMaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const days = rangeOf(period, clock, project.activeFrom, range);
  const query = {
    ...days,
    ...(workflow === any
      ? {}
      : { workflow: workflows.find((each) => each === workflow) ?? 'LOAD' }),
    ...(debrisType === any ? {} : { debrisTypeId: debrisType }),
    ...(site === any ? {} : { siteId: site }),
    ...(contractor === any ? {} : { contractorId: contractor }),
  };
  const [totals] = useRead(readDebrisTotalsEndpoint, { params: { projectId }, query });
  const [summary] = useRead(readEmailSummaryEndpoint, { params: { projectId }, query });
  return (
    <>
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      <div className="page-tools">
        <ChoiceField
          label={said.period}
          options={periods.map((each) => ({ id: each, label: said.periods[each] }))}
          value={period}
          onChange={(value) => {
            setPeriod(periods.find((each) => each === value) ?? 'yesterday');
          }}
        />
      </div>
      {period === 'range' ? (
        <div className="page-tools">
          <DateEntry
            label={words.common.from}
            value={range.from}
            onChange={(from) => {
              setRange((was) => ({ ...was, from }));
            }}
          />
          <DateEntry
            label={words.common.to}
            value={range.to}
            onChange={(to) => {
              setRange((was) => ({ ...was, to }));
            }}
          />
        </div>
      ) : null}
      <div className="page-tools">
        <SelectField
          label={said.workflow}
          options={[
            { id: any, label: said.every },
            ...workflows.map((each) => ({ id: each, label: words.review.workflows[each] })),
          ]}
          value={workflow}
          onChange={(value) => {
            setWorkflow(value ?? any);
          }}
        />
        <SelectField
          label={said.debrisType}
          options={[
            { id: any, label: said.every },
            // Each of the firm's debris types the project's forms offer, once.
            ...[
              ...new Map(
                names.debrisTypes.map((entry) => [entry.debrisTypeId, entry.name]),
              ).entries(),
            ].map(([id, name]) => ({ id, label: name })),
          ]}
          value={debrisType}
          onChange={(value) => {
            setDebrisType(value ?? any);
          }}
        />
        <SelectField
          label={said.site}
          options={[{ id: any, label: said.every }, ...optionsOf(names.sites)]}
          value={site}
          onChange={(value) => {
            setSite(value ?? any);
          }}
        />
        <SelectField
          label={said.contractor}
          options={[{ id: any, label: said.every }, ...optionsOf(names.contractors)]}
          value={contractor}
          onChange={(value) => {
            setContractor(value ?? any);
          }}
        />
      </div>
      <p role="status">
        {days.from === days.to
          ? say(said.oneDay, { day: day(days.from) })
          : say(said.days, { from: day(days.from), to: day(days.to) })}
      </p>
      {failed === null ? null : <Trouble reply={failed} />}
      <div className="page-tools">
        <Button
          main
          busy={making}
          onPress={() => {
            setMaking(true);
            setFailed(null);
            void savedFile(
              api,
              dailyReportFileEndpoint,
              { params: { projectId }, query },
              'daily-report.pdf',
            ).then((outcome) => {
              setMaking(false);
              setFailed(outcome);
            });
          }}
        >
          {making ? said.making : said.dailyReport}
        </Button>
      </div>
      <Shown read={totals}>{(answer) => <Totals answer={answer} />}</Shown>
      <section aria-labelledby="email-summary">
        <h2 id="email-summary">{said.emailSummary}</h2>
        <p>{said.emailAbout}</p>
        <Shown read={summary}>
          {(answer) => (
            <>
              <p>
                <strong>{said.subject}</strong> {answer.subject}
              </p>
              <pre className="email-summary" tabIndex={0} role="region" aria-label={said.emailText}>
                {answer.text}
              </pre>
              <div className="page-tools">
                <Button
                  onPress={() => {
                    void navigator.clipboard.writeText(answer.text).then(() => {
                      setCopied(true);
                    });
                  }}
                >
                  {said.copy}
                </Button>
              </div>
              {copied ? (
                <Banner tone="good" announced>
                  <p>{said.copied}</p>
                </Banner>
              ) : null}
            </>
          )}
        </Shown>
      </section>
    </>
  );
}

function Totals({ answer }: { readonly answer: DebrisTotalsAnswer }) {
  const said = words.reports;
  const cy = (value: string) => say(said.cy, { amount: number(Number(value)) });
  const equipment = (rows: DebrisTotalsAnswer['loads']['equipment']) =>
    rows.length === 0
      ? words.common.none
      : rows.map((each) => `${each.name} (${String(each.count)})`).join(', ');
  return (
    <>
      <section aria-labelledby="totals-loads">
        <h2 id="totals-loads">{answer.headings.loads}</h2>
        <Table
          caption={answer.headings.loads}
          rows={answer.loads.rows}
          keyOf={(row) => row.debrisType?.id ?? 'none'}
          columns={[
            {
              label: said.debrisType,
              names: true,
              cell: (row) => row.debrisType?.name ?? said.noDebrisType,
            },
            { label: said.loads, numeric: true, cell: (row) => String(row.loads) },
            { label: said.cyColumn, numeric: true, cell: (row) => cy(row.cy) },
          ]}
        />
        <p>
          {say(said.total, {
            loads: counted(said.loadsCounted, answer.loads.total.loads),
            cy: cy(answer.loads.total.cy),
          })}{' '}
          {say(said.equipment, { equipment: equipment(answer.loads.equipment) })}
        </p>
      </section>
      <section aria-labelledby="totals-haul-outs">
        <h2 id="totals-haul-outs">{answer.headings.haulOuts}</h2>
        <Table
          caption={answer.headings.haulOuts}
          rows={answer.haulOuts.rows}
          keyOf={(row) => `${row.site?.id ?? ''}-${row.debrisType?.id ?? ''}`}
          columns={[
            { label: said.site, names: true, cell: (row) => row.site?.name ?? words.common.none },
            { label: said.debrisType, cell: (row) => row.debrisType?.name ?? said.noDebrisType },
            { label: said.loads, numeric: true, cell: (row) => String(row.loads) },
            { label: said.cyColumn, numeric: true, cell: (row) => cy(row.cy) },
          ]}
        />
        <p>
          {say(said.total, {
            loads: counted(said.loadsCounted, answer.haulOuts.total.loads),
            cy: cy(answer.haulOuts.total.cy),
          })}{' '}
          {say(said.equipment, { equipment: equipment(answer.haulOuts.equipment) })}
        </p>
      </section>
      <section aria-labelledby="totals-unit-rate">
        <h2 id="totals-unit-rate">{answer.headings.unitRate}</h2>
        <Table
          caption={answer.headings.unitRate}
          rows={answer.unitRate.rows}
          keyOf={(row) => `${row.payableType?.id ?? ''}-${row.payItem?.id ?? ''}`}
          columns={[
            {
              label: said.payableType,
              names: true,
              cell: (row) => row.payableType?.name ?? words.common.none,
            },
            {
              label: said.payItem,
              cell: (row) =>
                row.payItem === null
                  ? words.common.none
                  : `${row.payItem.code} · ${row.payItem.description}`,
            },
            { label: said.tickets, numeric: true, cell: (row) => String(row.tickets) },
            {
              label: said.units,
              numeric: true,
              cell: (row) =>
                row.hours
                  ? say(said.hours, { amount: number(Number(row.units)) })
                  : number(Number(row.units)),
            },
          ]}
        />
        <p>
          {say(said.unitTotal, {
            tickets: counted(said.ticketsCounted, answer.unitRate.total.tickets),
            units: number(Number(answer.unitRate.total.units)),
            hours: number(Number(answer.unitRate.total.hours)),
          })}{' '}
          {say(said.equipment, { equipment: equipment(answer.unitRate.equipment) })}
        </p>
      </section>
      <section aria-labelledby="totals-stats">
        <h2 id="totals-stats">{said.stats}</h2>
        <dl className="facts">
          <div className="fact">
            <dt>{said.incidents}</dt>
            <dd>
              {say(said.incidentsCounted, {
                filed: answer.incidents.filed,
                open: answer.incidents.open,
              })}
            </dd>
          </div>
          <div className="fact">
            <dt>{said.monitors}</dt>
            <dd>{String(answer.monitorsOnShift)}</dd>
          </div>
        </dl>
        <Table
          caption={said.byDay}
          rows={answer.byDay}
          keyOf={(row) => row.day}
          columns={[
            { label: said.day, names: true, cell: (row) => day(row.day) },
            { label: said.loads, numeric: true, cell: (row) => String(row.loads) },
            { label: said.loadCy, numeric: true, cell: (row) => cy(row.loadCy) },
            { label: said.haulOuts, numeric: true, cell: (row) => String(row.haulOuts) },
            { label: said.haulOutCy, numeric: true, cell: (row) => cy(row.haulOutCy) },
            { label: said.tickets, numeric: true, cell: (row) => String(row.unitRateTickets) },
          ]}
        />
      </section>
    </>
  );
}
