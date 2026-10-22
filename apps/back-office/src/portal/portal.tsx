// The read-only viewer portal (REQ-408; ADR-050, 169, 315, 324, 336, 361, 435; ARCHITECTURE §5.5):
// a client user, an auditor or a contractor user signs in at the same address as the back office
// and is shown their projects, each project's tickets, each ticket whole with its photographs and
// history, its certifications and forms, and its setup, **every screen read from `/viewer/…`
// alone**, which the database answers as its read-only login for this viewer: a contractor user
// its own contractor's tickets and nobody's name who recorded them, a sub's no rate and no amount,
// a viewer the firm doesn't let see private citizens no owner's or resident's name. A screen shows
// what it was answered and never works out what it wasn't. Nothing here changes anything.
import {
  viewerCertificationsEndpoint,
  viewerDropOffLogsEndpoint,
  viewerIncidentsEndpoint,
  viewerProjectsEndpoint,
  viewerRoesEndpoint,
  viewerSetupCheckEndpoint,
  viewerSetupEndpoint,
  viewerSurveysEndpoint,
  viewerTicketEndpoint,
  viewerTicketHistoryEndpoint,
  viewerTicketsEndpoint,
  type SessionAnswer,
  type ViewerProject,
  type ViewerTicketAnswer,
  type ViewerTicketRow,
} from '@open-adms/contracts';
import { ProjectClock, workflows, type WorkflowName } from '@open-adms/domain';
import { Banner, ScreenTitle } from '@open-adms/look';
import { type ReactNode } from 'react';
import { Link } from 'react-aria-components';

import { ChoiceField } from '../look/fields.tsx';
import { PagedTable, Table } from '../look/paged-table.tsx';
import { Photo } from '../look/photo.tsx';
import { Shown, useRead } from '../reading.tsx';
import { matched, navigate, useWhere } from '../router.tsx';
import { Account } from '../screens/account.tsx';
import { NotFound } from '../screens/not-found.tsx';
import { useSigned, type Signed } from '../session.tsx';
import type { MenuSection } from '../shell.tsx';
import { changeOf } from '../review/history.tsx';
import { day, money, number, say, words } from '../words.ts';

// Whether this viewer reads a project's forms, setup and history: a client user and an auditor;
// a contractor user its own tickets and certifications alone (ADR-315, 544).
const readsWhole = (session: SessionAnswer): boolean => session.user.viewerKind !== 'CONTRACTOR';

const at = (timeZone: string, instant: string): string => {
  const clock = new ProjectClock(timeZone);
  const moment = new Date(instant);
  return `${clock.date(moment)} ${clock.time(moment)}`;
};

export const portalHref = (projectId: string, rest = '') => `/projects/${projectId}${rest}`;

// Which screen each address shows a viewer.
export function portalRouteOf(path: string): ReactNode {
  if (path === '/' || path === '') return <ViewerProjects />;
  if (path === '/account') return <Account />;
  const routes: readonly (readonly [
    string,
    (params: Readonly<Record<string, string>>) => ReactNode,
  ])[] = [
    ['/projects/:projectId', (params) => <ViewerTickets projectId={params['projectId'] ?? ''} />],
    [
      '/projects/:projectId/tickets/:workflow/:ticketNumber',
      (params) => (
        <ViewerTicket
          projectId={params['projectId'] ?? ''}
          workflow={params['workflow'] ?? ''}
          ticketNumber={params['ticketNumber'] ?? ''}
        />
      ),
    ],
    [
      '/projects/:projectId/certifications',
      (params) => <ViewerCertifications projectId={params['projectId'] ?? ''} />,
    ],
    [
      '/projects/:projectId/forms',
      (params) => <ViewerForms projectId={params['projectId'] ?? ''} />,
    ],
    [
      '/projects/:projectId/setup',
      (params) => <ViewerSetup projectId={params['projectId'] ?? ''} />,
    ],
  ];
  for (const [pattern, screen] of routes) {
    const params = matched(pattern, path);
    if (params !== null) return screen(params);
  }
  return <NotFound />;
}

export function portalSectionsOf(signed: Signed, projectId: string | null): readonly MenuSection[] {
  const said = words.portal.links;
  const whole = readsWhole(signed.session);
  const yours: MenuSection = {
    label: words.portal.sections.yours,
    links: [{ label: said.projects, href: '/', shown: true }],
  };
  if (projectId === null) return [yours];
  return [
    yours,
    {
      label: words.portal.sections.project,
      links: [
        { label: said.tickets, href: portalHref(projectId), shown: true },
        { label: said.certifications, href: portalHref(projectId, '/certifications'), shown: true },
        { label: said.forms, href: portalHref(projectId, '/forms'), shown: whole },
        { label: said.setup, href: portalHref(projectId, '/setup'), shown: whole },
      ],
    },
  ];
}

// The viewer's projects: each one's name the way into it.
function ViewerProjects() {
  const said = words.portal.projects;
  return (
    <main data-screen="viewer-projects" className="page" id="content">
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      <PagedTable
        caption={said.title}
        served={viewerProjectsEndpoint}
        asking={{ query: { limit: '50' } }}
        rowsOf={(answer) => answer.projects}
        nextOf={(answer) => answer.next}
        keyOf={(project: ViewerProject) => project.id}
        columns={[
          {
            label: said.name,
            names: true,
            cell: (project) => (
              <Link className="link" href={portalHref(project.id)}>
                {project.name}
              </Link>
            ),
          },
          { label: said.timeZone, cell: (project) => project.timeZone },
          {
            label: said.state,
            cell: (project) =>
              project.closedAt === null
                ? said.open
                : say(said.closed, { at: at(project.timeZone, project.closedAt) }),
          },
        ]}
      />
    </main>
  );
}

// The project a viewer is in, read from their own projects (a project they aren't given is none).
function useViewerProject(projectId: string) {
  const [read] = useRead(viewerProjectsEndpoint, { query: { limit: '200' } });
  if (read.kind !== 'answered') return read;
  const project = read.answer.projects.find((each) => each.id === projectId);
  return project === undefined
    ? ({ kind: 'refused', code: 'NOT_FOUND' } as const)
    : ({ kind: 'answered', answer: project } as const);
}

function ProjectShown({
  projectId,
  title,
  children,
}: {
  readonly projectId: string;
  readonly title: (project: ViewerProject) => string;
  readonly children: (project: ViewerProject) => ReactNode;
}) {
  const read = useViewerProject(projectId);
  return (
    <Shown read={read}>
      {(project) => (
        <>
          <ScreenTitle>{title(project)}</ScreenTitle>
          {project.closedAt === null ? null : (
            <Banner tone="notice">
              <p>
                {say(words.portal.projects.closed, { at: at(project.timeZone, project.closedAt) })}
              </p>
            </Banner>
          )}
          {children(project)}
        </>
      )}
    </Shown>
  );
}

const workflowOf = (said: string | null): WorkflowName =>
  workflows.find((workflow) => workflow === said) ?? 'LOAD';

// A project's tickets, one workflow at a time, by number.
function ViewerTickets({ projectId }: { readonly projectId: string }) {
  const said = words.portal.tickets;
  const { query } = useWhere();
  const workflow = workflowOf(query.get('workflow'));
  return (
    <main data-screen="viewer-tickets" className="page" id="content">
      <ProjectShown projectId={projectId} title={(project) => project.name}>
        {() => (
          <>
            <ChoiceField
              label={said.workflow}
              options={workflows.map((each) => ({ id: each, label: words.review.workflows[each] }))}
              value={workflow}
              onChange={(value) => {
                navigate(`${portalHref(projectId)}?workflow=${workflowOf(value)}`, {
                  replace: true,
                });
              }}
            />
            <PagedTable
              caption={say(said.caption, { workflow: words.review.workflows[workflow] })}
              served={viewerTicketsEndpoint}
              asking={{ params: { projectId }, query: { workflow, limit: '100' } }}
              rowsOf={(answer) => answer.tickets}
              nextOf={(answer) => answer.next}
              keyOf={(row: ViewerTicketRow) => row.ticketNumber}
              columns={[
                {
                  label: said.ticket,
                  names: true,
                  cell: (row) => (
                    <Link
                      className="link"
                      href={portalHref(
                        projectId,
                        `/tickets/${row.workflow}/${encodeURIComponent(row.ticketNumber)}`,
                      )}
                    >
                      {row.ticketNumber}
                    </Link>
                  ),
                },
                {
                  label: said.status,
                  cell: (row) =>
                    row.statuses.map((status) => words.review.statuses[status]).join(', '),
                },
                { label: said.fieldEvents, numeric: true, cell: (row) => String(row.fieldEvents) },
              ]}
            />
          </>
        )}
      </ProjectShown>
    </main>
  );
}

// One ticket whole, as this viewer is shown it.
function ViewerTicket({
  projectId,
  workflow,
  ticketNumber,
}: {
  readonly projectId: string;
  readonly workflow: string;
  readonly ticketNumber: string;
}) {
  const said = words.portal.ticket;
  const { session } = useSigned();
  const known = workflowOf(workflow);
  const [read] = useRead(viewerTicketEndpoint, {
    params: { projectId, workflow: known, ticketNumber },
  });
  return (
    <main data-screen="viewer-ticket" className="page" id="content">
      <ProjectShown
        projectId={projectId}
        title={() =>
          say(words.review.ticket.title, {
            workflow: words.review.workflows[known],
            number: ticketNumber,
          })
        }
      >
        {(project) => (
          <>
            <p>
              <Link className="link" href={`${portalHref(projectId)}?workflow=${known}`}>
                {said.back}
              </Link>
            </p>
            <Shown read={read}>
              {(answer) => <TicketWhole answer={answer} timeZone={project.timeZone} />}
            </Shown>
            {readsWhole(session) ? (
              <section aria-labelledby="viewer-history">
                <h2 id="viewer-history">{said.history}</h2>
                <ViewerHistory
                  projectId={projectId}
                  workflow={known}
                  ticketNumber={ticketNumber}
                  timeZone={project.timeZone}
                />
              </section>
            ) : null}
          </>
        )}
      </ProjectShown>
    </main>
  );
}

function TicketWhole({
  answer,
  timeZone,
}: {
  readonly answer: ViewerTicketAnswer;
  readonly timeZone: string;
}) {
  const said = words.portal.ticket;
  const facts = (rows: readonly (readonly [string, string | null])[]) => (
    <dl className="facts">
      {rows
        .filter((row): row is readonly [string, string] => row[1] !== null)
        .map(([label, value]) => (
          <div key={label} className="fact">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
    </dl>
  );
  return (
    <>
      {facts([
        [said.status, answer.statuses.map((status) => words.review.statuses[status]).join(', ')],
        [
          said.qc,
          answer.qcStatus === null ? words.review.qc.QC_REVIEW : words.review.qc[answer.qcStatus],
        ],
        [
          said.lock,
          answer.lock === null
            ? said.notLocked
            : answer.lock.batch === null
              ? say(said.locked, { at: at(timeZone, answer.lock.lockedAt) })
              : say(said.lockedIn, {
                  at: at(timeZone, answer.lock.lockedAt),
                  batch: answer.lock.batch,
                }),
        ],
      ])}
      {answer.flags.length === 0 ? null : (
        <section aria-labelledby="viewer-flags">
          <h2 id="viewer-flags">{said.flags}</h2>
          <ul className="flag-list">
            {answer.flags.map((flag) => (
              <li key={flag.id} className="flag">
                <p className="spaced">
                  <span>{flag.message}</span>
                  {flag.clearedAt !== null
                    ? said.cleared
                    : flag.accepted
                      ? said.accepted
                      : said.open}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="viewer-events">
        <h2 id="viewer-events">{said.fieldEvents}</h2>
        <div className="event-cards">
          {answer.fieldEvents.map((event) => {
            const title = say(words.review.event.title, {
              kind: words.review.kinds[event.kind],
              number:
                event.splitSuffix === ''
                  ? answer.ticketNumber
                  : `${answer.ticketNumber}-${event.splitSuffix}`,
            });
            const photos = answer.photographs.filter(
              (photo) => photo.fieldEventId === event.id && photo.uploadedAt !== null,
            );
            const items = answer.itemLines.filter((line) => line.fieldEventId === event.id);
            const carried = answer.carriedTickets.filter((one) => one.fieldEventId === event.id);
            return (
              <section key={event.id} className="event-card" aria-label={title}>
                <h3 className="event-title">{title}</h3>
                {facts([
                  [said.status, words.review.statuses[event.status]],
                  [
                    said.recordedBy,
                    event.recordedBy === null
                      ? null
                      : event.recordedBy.monitorNumber === null
                        ? event.recordedBy.name
                        : `${event.recordedBy.name} (${event.recordedBy.monitorNumber})`,
                  ],
                  [said.started, at(timeZone, event.startedAt)],
                  [said.ended, at(timeZone, event.endedAt)],
                  [said.certNumber, event.certNumber],
                  [said.site, event.site],
                  [said.debrisType, event.debrisType],
                  [said.loadCall, event.loadCall === null ? null : `${String(event.loadCall)}%`],
                  [said.estimate, event.estimateCy],
                  [said.count, event.unitCount],
                  [
                    said.payItem,
                    event.payItem === null
                      ? null
                      : `${event.payItem.code} · ${event.payItem.description}`,
                  ],
                  [said.address, event.address],
                  [
                    said.gps,
                    event.latitude === null || event.longitude === null
                      ? null
                      : `${event.latitude}, ${event.longitude}`,
                  ],
                ])}
                {items.length === 0 ? null : (
                  <ul className="plain-list">
                    {items.map((line) => (
                      <li key={line.id}>{`${line.item ?? ''}: ${line.quantity}`}</li>
                    ))}
                  </ul>
                )}
                {carried.length === 0 ? null : (
                  <p>
                    {say(said.carried, {
                      numbers: carried.map((one) => one.carriedTicketNumber).join(', '),
                    })}
                  </p>
                )}
                {photos.length === 0 ? null : (
                  <div className="photos">
                    {photos.map((photo) => (
                      <Photo
                        key={photo.id}
                        viewer
                        photoId={photo.id}
                        label={say(words.review.event.photoLabel, {
                          what:
                            photo.label ??
                            (photo.view === null
                              ? words.review.kinds[event.kind]
                              : words.photos.views[photo.view]),
                          at: at(timeZone, photo.capturedAt),
                        })}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </section>
      {answer.scaleReceipts.length === 0 ? null : (
        <Table
          caption={said.scaleReceipts}
          rows={answer.scaleReceipts}
          keyOf={(receipt) => receipt.id}
          columns={[
            { label: said.receiptNumber, names: true, cell: (receipt) => receipt.receiptNumber },
            { label: said.site, cell: (receipt) => receipt.site ?? '' },
            { label: said.netTons, numeric: true, cell: (receipt) => receipt.netWeightTons ?? '' },
          ]}
        />
      )}
      {answer.completed === null ? null : (
        <section aria-labelledby="viewer-completed">
          <h2 id="viewer-completed">{said.completed}</h2>
          {facts([
            [
              said.capacity,
              answer.completed.capacityCy === null
                ? null
                : say(words.review.ticket.cubicYards, {
                    amount: number(answer.completed.capacityCy),
                  }),
            ],
            [
              said.loadCall,
              answer.completed.loadCall === null ? null : `${String(answer.completed.loadCall)}%`,
            ],
            [
              said.volume,
              answer.completed.volumeCy === null
                ? null
                : say(words.review.ticket.cubicYards, { amount: answer.completed.volumeCy }),
            ],
            [
              said.weight,
              answer.completed.weightTons === null
                ? null
                : say(words.review.ticket.tons, { amount: answer.completed.weightTons }),
            ],
          ])}
        </section>
      )}
      <Table
        caption={said.lines}
        rows={answer.lines}
        keyOf={(line) => line.id}
        columns={[
          {
            label: said.line,
            names: true,
            cell: (line) =>
              `${line.splitSuffix === '' ? '' : `-${line.splitSuffix} `}#${String(line.slot)}`,
          },
          {
            label: said.payItem,
            cell: (line) =>
              line.payItem === null ? '' : `${line.payItem.code} · ${line.payItem.description}`,
          },
          {
            label: said.quantity,
            numeric: true,
            cell: (line) => `${line.quantity} ${words.review.units[line.unit]}`,
          },
          { label: said.prime, cell: (line) => line.prime ?? '' },
          {
            label: said.rate,
            numeric: true,
            cell: (line) => (line.rate === null ? said.notShown : money(line.rate)),
          },
          {
            label: said.amount,
            numeric: true,
            cell: (line) => (line.amount === null ? said.notShown : money(line.amount)),
          },
        ]}
      />
    </>
  );
}

function ViewerHistory({
  projectId,
  workflow,
  ticketNumber,
  timeZone,
}: {
  readonly projectId: string;
  readonly workflow: WorkflowName;
  readonly ticketNumber: string;
  readonly timeZone: string;
}) {
  const said = words.history;
  return (
    <PagedTable
      caption={words.portal.ticket.history}
      served={viewerTicketHistoryEndpoint}
      asking={{ params: { projectId, workflow, ticketNumber }, query: { limit: '50' } }}
      rowsOf={(answer) => answer.entries}
      nextOf={(answer) => answer.next}
      keyOf={(entry) => entry.id}
      columns={[
        { label: said.when, names: true, cell: (entry) => at(timeZone, entry.occurredAt) },
        { label: said.who, cell: (entry) => entry.actor?.name ?? words.common.none },
        { label: said.source, cell: (entry) => said.sources[entry.source] },
        {
          label: said.what,
          cell: (entry) => (
            <>
              <span>
                {say(said.operation, {
                  operation: said.operations[entry.operation],
                  table: entry.tableName,
                })}
              </span>
              <ul className="plain-list">
                {changeOf(entry).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          ),
        },
      ]}
    />
  );
}

function ViewerCertifications({ projectId }: { readonly projectId: string }) {
  const said = words.portal.certifications;
  return (
    <main data-screen="viewer-certifications" className="page" id="content">
      <ProjectShown projectId={projectId} title={() => said.title}>
        {(project) => (
          <PagedTable
            caption={said.title}
            served={viewerCertificationsEndpoint}
            asking={{ params: { projectId }, query: { limit: '100' } }}
            rowsOf={(answer) => answer.certifications}
            nextOf={(answer) => answer.next}
            keyOf={(row) => row.id}
            columns={[
              { label: said.certNumber, names: true, cell: (row) => row.certNumber },
              { label: said.kind, cell: (row) => said.kinds[row.kind] },
              { label: said.prime, cell: (row) => row.prime ?? '' },
              { label: said.sub, cell: (row) => row.secondTierSub ?? row.firstTierSub ?? '' },
              {
                label: said.capacity,
                numeric: true,
                cell: (row) => (row.capacityCy === null ? '' : String(row.capacityCy)),
              },
              { label: said.vehicle, cell: (row) => row.vehicleType ?? row.crewType ?? '' },
              { label: said.certified, cell: (row) => at(project.timeZone, row.certifiedAt) },
              {
                label: said.revoked,
                cell: (row) => (row.revokedFrom === null ? '' : day(row.revokedFrom)),
              },
            ]}
          />
        )}
      </ProjectShown>
    </main>
  );
}

// The project's forms: ROEs, surveys, incidents and drop-off logs, as this viewer reads them.
function ViewerForms({ projectId }: { readonly projectId: string }) {
  const said = words.portal.forms;
  return (
    <main data-screen="viewer-forms" className="page" id="content">
      <ProjectShown projectId={projectId} title={() => said.title}>
        {(project) => (
          <>
            <PagedTable
              caption={said.roes}
              served={viewerRoesEndpoint}
              asking={{ params: { projectId }, query: { limit: '100' } }}
              rowsOf={(answer) => answer.roes}
              nextOf={(answer) => answer.next}
              keyOf={(row) => row.id}
              columns={[
                { label: said.roeNumber, names: true, cell: (row) => row.roeNumber },
                { label: said.owner, cell: (row) => row.ownerName ?? said.notShown },
                { label: said.address, cell: (row) => row.address ?? '' },
                {
                  label: said.signed,
                  cell: (row) =>
                    row.signed
                      ? row.signedDate === null
                        ? words.common.yes
                        : day(row.signedDate)
                      : words.common.no,
                },
                {
                  label: said.scope,
                  cell: (row) =>
                    row.scope
                      .map(
                        (pick) =>
                          `${pick.debrisType ?? pick.payableType ?? ''}${pick.count === null ? '' : ` × ${String(pick.count)}`}`,
                      )
                      .join(', '),
                },
              ]}
            />
            <PagedTable
              caption={said.surveys}
              served={viewerSurveysEndpoint}
              asking={{ params: { projectId }, query: { limit: '100' } }}
              rowsOf={(answer) => answer.surveys}
              nextOf={(answer) => answer.next}
              keyOf={(row) => row.id}
              columns={[
                { label: said.made, names: true, cell: (row) => at(project.timeZone, row.madeAt) },
                { label: said.workType, cell: (row) => row.workType ?? '' },
                { label: said.roeNumber, cell: (row) => row.roeNumber ?? '' },
                { label: words.common.notes, cell: (row) => row.notes ?? '' },
              ]}
            />
            <PagedTable
              caption={said.incidents}
              served={viewerIncidentsEndpoint}
              asking={{ params: { projectId }, query: { limit: '100' } }}
              rowsOf={(answer) => answer.incidents}
              nextOf={(answer) => answer.next}
              keyOf={(row) => row.id}
              columns={[
                { label: said.made, names: true, cell: (row) => at(project.timeZone, row.madeAt) },
                {
                  label: said.type,
                  cell: (row) =>
                    [row.incidentType, row.incidentSubType]
                      .filter((part) => part !== null)
                      .join(' · '),
                },
                { label: said.description, cell: (row) => row.description ?? '' },
                { label: said.address, cell: (row) => row.address ?? '' },
              ]}
            />
            <PagedTable
              caption={said.dropOffLogs}
              served={viewerDropOffLogsEndpoint}
              asking={{ params: { projectId }, query: { limit: '100' } }}
              rowsOf={(answer) => answer.dropOffLogs}
              nextOf={(answer) => answer.next}
              keyOf={(row) => row.id}
              columns={[
                { label: said.made, names: true, cell: (row) => at(project.timeZone, row.madeAt) },
                { label: said.site, cell: (row) => row.site ?? '' },
                { label: said.resident, cell: (row) => row.residentName ?? said.notShown },
              ]}
            />
          </>
        )}
      </ProjectShown>
    </main>
  );
}

// The project's setup as a client user or an auditor reads it: never a rate.
function ViewerSetup({ projectId }: { readonly projectId: string }) {
  const said = words.portal.setup;
  const [setup] = useRead(viewerSetupEndpoint, { params: { projectId } });
  const [check] = useRead(viewerSetupCheckEndpoint, { params: { projectId } });
  return (
    <main data-screen="viewer-setup" className="page" id="content">
      <ProjectShown projectId={projectId} title={() => said.title}>
        {() => (
          <>
            <Shown read={setup}>
              {(answer) => (
                <>
                  <Table
                    caption={said.debrisTypes}
                    rows={answer.forms.flatMap((form) =>
                      form.debrisTypes.map((entry) => ({ ...entry, form: form.name })),
                    )}
                    keyOf={(row) => row.id}
                    columns={[
                      { label: said.debrisType, names: true, cell: (row) => row.name ?? '' },
                      { label: said.form, cell: (row) => row.form },
                    ]}
                  />
                  <Table
                    caption={said.payItems}
                    rows={answer.payItems}
                    keyOf={(row) => row.id}
                    columns={[
                      { label: said.code, names: true, cell: (row) => row.code },
                      { label: said.description, cell: (row) => row.description },
                      { label: said.unit, cell: (row) => words.review.units[row.unit] },
                    ]}
                  />
                  <Table
                    caption={said.sites}
                    rows={answer.sites}
                    keyOf={(row) => row.id}
                    columns={[
                      { label: said.site, names: true, cell: (row) => row.name },
                      { label: said.activation, cell: (row) => day(row.activationDate) },
                      {
                        label: said.close,
                        cell: (row) => (row.closeDate === null ? '' : day(row.closeDate)),
                      },
                    ]}
                  />
                  <Table
                    caption={said.contracts}
                    rows={answer.contracts}
                    keyOf={(row) => row.id}
                    columns={[
                      { label: said.contract, names: true, cell: (row) => row.name },
                      { label: said.prime, cell: (row) => row.prime ?? '' },
                    ]}
                  />
                </>
              )}
            </Shown>
            <Shown read={check}>
              {(answer) => (
                <Table
                  caption={said.check}
                  rows={answer.gaps.map((gap, at_) => ({
                    ...gap,
                    key: `${gap.code}-${String(at_)}`,
                  }))}
                  keyOf={(gap) => gap.key}
                  columns={[{ label: said.gap, names: true, cell: (gap) => gap.message }]}
                />
              )}
            </Shown>
          </>
        )}
      </ProjectShown>
    </main>
  );
}

// Signed in as a viewer: this session reads the portal rather than the back office.
export const isViewer = (session: SessionAnswer): boolean =>
  session.user.role === 'READ_ONLY_VIEWER';
