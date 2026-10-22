// A project's own setup (adms-ticket-workflows, the setup spine; ADR-024, 057, 137, 164): its
// settings (split loads, the load call's extreme limits, the stump checks, a site's circle, the time
// clock), its active window, how it numbers its tickets (each series' first number, the control
// ticket ranges entered), its field tags, and its primes and contracts. A sub is typed in at
// certification, never here. Each change by a person who may set up, through the API, which says
// what it came to.
import {
  addFieldTagEndpoint,
  addPrimeEndpoint,
  archiveControlRangeEndpoint,
  changeContractEndpoint,
  changeProjectSettingsEndpoint,
  changeProjectWindowEndpoint,
  createContractEndpoint,
  enterControlRangeEndpoint,
  findContractorsEndpoint,
  listListValuesEndpoint,
  readProjectEndpoint,
  startNumberSeriesEndpoint,
  type ProjectAnswer,
} from '@open-adms/contracts';
import { numberSeries, UsUnits } from '@open-adms/domain';
import { Button, ScreenTitle } from '@open-adms/look';
import { useState } from 'react';

import type { NotAnswered } from '../api.ts';
import {
  FormDialog,
  checked,
  nullable,
  numberOf,
  optional,
  picked,
  text,
  type FieldSpec,
  type Values,
} from '../look/form-dialog.tsx';
import { Table } from '../look/paged-table.tsx';
import { Shown, Trouble, useApi, useRead } from '../reading.tsx';
import { holds, useSigned } from '../session.tsx';
import { day, number, say, words } from '../words.ts';
import { useTold, yesNo, type SetupWritten } from './common.tsx';

type Dialog =
  | 'settings'
  | 'window'
  | 'series'
  | 'range'
  | 'fieldTag'
  | 'prime'
  | 'contract'
  | { readonly contract: ProjectAnswer['contracts'][number] };

export function ProjectSetup({ projectId }: { readonly projectId: string }) {
  const api = useApi();
  const { session } = useSigned();
  const mayChange = holds(session, 'SETUP');
  const said = words.projectSetup;
  const [read, reload] = useRead(readProjectEndpoint, { params: { projectId } });
  const [tags, reloadTags] = useRead(listListValuesEndpoint, {
    params: { list: 'field-tags' },
    query: { archived: 'false', limit: '200' },
  });
  const [contractors] = useRead(findContractorsEndpoint, { query: { limit: '200' } });
  const [open, setOpen] = useState<Dialog | null>(null);
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const [told, tell] = useTold();

  const written = (answer: SetupWritten) => {
    tell(answer);
    reload();
    reloadTags();
  };

  const asked = (reply: Awaited<ReturnType<typeof api.ask>>): NotAnswered | null => {
    if (reply.kind !== 'answered') return reply;
    written(reply.answer as SetupWritten);
    return null;
  };

  return (
    <main data-screen="project-setup" className="page" id="content">
      <Shown read={read}>
        {(answer) => {
          const { project } = answer;
          const primes = answer.contractors.filter((place) => place.position === 'PRIME');
          // A prime is named by its contractor's id (a contract's and a rate's `primeId`).
          const primeName = (id: string) =>
            answer.contractors.find((place) => place.contractorId === id)?.name ?? '…';
          const projectTags =
            tags.kind === 'answered'
              ? tags.answer.values.filter((value) => value.projectId === projectId)
              : [];
          const dialog = (): {
            title: string;
            fields: FieldSpec[];
            initial: Values;
            save: (values: Values) => Promise<NotAnswered | null>;
          } | null => {
            if (open === null) return null;
            if (open === 'settings') {
              return {
                title: said.changeSettings,
                fields: [
                  { kind: 'check', key: 'allowSplitLoads', label: said.allowSplitLoads },
                  {
                    kind: 'whole',
                    key: 'loadCallLowLimit',
                    label: said.loadCallLow,
                    hint: said.loadCallHint,
                  },
                  {
                    kind: 'whole',
                    key: 'loadCallHighLimit',
                    label: said.loadCallHigh,
                    hint: said.loadCallHint,
                  },
                  {
                    kind: 'whole',
                    key: 'stumpFillDepthInches',
                    label: said.stumpFillDepth,
                    required: true,
                  },
                  { kind: 'check', key: 'stumpCheckRootBallWider', label: said.stumpRootBallWider },
                  {
                    kind: 'check',
                    key: 'stumpCheckFillNeedsExposure',
                    label: said.stumpFillNeedsExposure,
                  },
                  {
                    kind: 'whole',
                    key: 'siteCircleFeet',
                    label: said.siteCircle,
                    hint: said.siteCircleHint,
                    required: true,
                  },
                  { kind: 'check', key: 'timeClockEnabled', label: said.timeClock },
                ],
                initial: {
                  allowSplitLoads: project.allowSplitLoads,
                  loadCallLowLimit:
                    project.loadCallLowLimit === null ? '' : String(project.loadCallLowLimit),
                  loadCallHighLimit:
                    project.loadCallHighLimit === null ? '' : String(project.loadCallHighLimit),
                  stumpFillDepthInches: String(project.stumpFillDepthInches),
                  stumpCheckRootBallWider: project.stumpCheckRootBallWider,
                  stumpCheckFillNeedsExposure: project.stumpCheckFillNeedsExposure,
                  siteCircleFeet: String(UsUnits.feetOf(project.siteCircleMeters)),
                  timeClockEnabled: project.timeClockEnabled,
                },
                save: async (values) =>
                  asked(
                    await api.ask(changeProjectSettingsEndpoint, {
                      params: { projectId },
                      body: {
                        allowSplitLoads: checked(values, 'allowSplitLoads'),
                        loadCallLowLimit: numberOf(values, 'loadCallLowLimit'),
                        loadCallHighLimit: numberOf(values, 'loadCallHighLimit'),
                        stumpFillDepthInches: numberOf(values, 'stumpFillDepthInches') ?? 0,
                        stumpCheckRootBallWider: checked(values, 'stumpCheckRootBallWider'),
                        stumpCheckFillNeedsExposure: checked(values, 'stumpCheckFillNeedsExposure'),
                        siteCircleMeters: UsUnits.metersOf(numberOf(values, 'siteCircleFeet') ?? 0),
                        timeClockEnabled: checked(values, 'timeClockEnabled'),
                      },
                    }),
                  ),
              };
            }
            if (open === 'window') {
              return {
                title: said.changeWindow,
                fields: [
                  {
                    kind: 'date',
                    key: 'activeFrom',
                    label: words.newProject.activeFrom,
                    required: true,
                  },
                  {
                    kind: 'date',
                    key: 'activeTo',
                    label: words.newProject.activeTo,
                    hint: words.newProject.activeToHint,
                  },
                ],
                initial: { activeFrom: project.activeFrom, activeTo: project.activeTo ?? '' },
                save: async (values) =>
                  asked(
                    await api.ask(changeProjectWindowEndpoint, {
                      params: { projectId },
                      body: {
                        activeFrom: text(values, 'activeFrom'),
                        activeTo: nullable(values, 'activeTo'),
                      },
                    }),
                  ),
              };
            }
            const seriesOptions = numberSeries.map((series) => ({
              id: series,
              label: words.newProject.seriesNames[series],
            }));
            if (open === 'series' || open === 'range') {
              const range = open === 'range';
              return {
                title: range ? said.addRange : said.startSeries,
                fields: [
                  {
                    kind: 'pick',
                    key: 'series',
                    label: said.series,
                    options: seriesOptions,
                    required: true,
                  },
                  { kind: 'whole', key: 'firstNumber', label: said.firstNumber, required: true },
                  ...(range
                    ? [
                        {
                          kind: 'whole',
                          key: 'lastNumber',
                          label: said.lastNumber,
                          required: true,
                        } as const,
                      ]
                    : []),
                ],
                initial: {},
                save: async (values) => {
                  const series = (picked(values, 'series') ??
                    'LOAD') as (typeof numberSeries)[number];
                  const firstNumber = numberOf(values, 'firstNumber') ?? 0;
                  return asked(
                    range
                      ? await api.ask(enterControlRangeEndpoint, {
                          params: { projectId },
                          body: {
                            series,
                            firstNumber,
                            lastNumber: numberOf(values, 'lastNumber') ?? 0,
                          },
                        })
                      : await api.ask(startNumberSeriesEndpoint, {
                          params: { projectId },
                          body: { series, firstNumber },
                        }),
                  );
                },
              };
            }
            if (open === 'fieldTag') {
              return {
                title: said.addFieldTag,
                fields: [
                  { kind: 'text', key: 'name', label: said.fieldTag, required: true, longest: 200 },
                ],
                initial: {},
                save: async (values) =>
                  asked(
                    await api.ask(addFieldTagEndpoint, {
                      params: { projectId },
                      body: { name: text(values, 'name') },
                    }),
                  ),
              };
            }
            if (open === 'prime') {
              const held = new Set(answer.contractors.map((place) => place.contractorId));
              return {
                title: said.addPrime,
                fields: [
                  {
                    kind: 'pick',
                    key: 'contractorId',
                    label: said.prime,
                    required: true,
                    options:
                      contractors.kind === 'answered'
                        ? contractors.answer.records
                            .filter((row) => !row.archived && !held.has(row.id))
                            .map((row) => ({ id: row.id, label: row.name }))
                        : [],
                  },
                ],
                initial: {},
                save: async (values) =>
                  asked(
                    await api.ask(addPrimeEndpoint, {
                      params: { projectId },
                      body: { contractorId: picked(values, 'contractorId') ?? '' },
                    }),
                  ),
              };
            }
            const editing = typeof open === 'object' ? open.contract : null;
            return {
              title:
                editing === null
                  ? said.addContract
                  : say(said.editContract, { name: editing.name }),
              fields: [
                { kind: 'text', key: 'name', label: said.contract, required: true, longest: 200 },
                ...(editing === null
                  ? [
                      {
                        kind: 'pick',
                        key: 'primeId',
                        label: said.prime,
                        required: true,
                        options: primes.map((place) => ({
                          id: place.contractorId,
                          label: place.name,
                        })),
                      } as const,
                    ]
                  : []),
                {
                  kind: 'text',
                  key: 'signedCopyUrl',
                  label: said.signedCopy,
                  hint: said.signedCopyHint,
                  longest: 2000,
                },
              ],
              initial:
                editing === null
                  ? {}
                  : { name: editing.name, signedCopyUrl: editing.signedCopyUrl ?? '' },
              save: async (values) =>
                asked(
                  editing === null
                    ? await api.ask(createContractEndpoint, {
                        params: { projectId },
                        body: {
                          name: text(values, 'name'),
                          primeId: picked(values, 'primeId') ?? '',
                          ...(optional(values, 'signedCopyUrl') === undefined
                            ? {}
                            : { signedCopyUrl: text(values, 'signedCopyUrl') }),
                        },
                      })
                    : await api.ask(changeContractEndpoint, {
                        params: { contractId: editing.id },
                        body: {
                          name: text(values, 'name'),
                          signedCopyUrl: nullable(values, 'signedCopyUrl'),
                        },
                      }),
                ),
            };
          };
          const shownDialog = dialog();
          const tool = (label: string, opens: Dialog) =>
            mayChange ? (
              <div className="form-actions">
                <Button
                  onPress={() => {
                    setOpen(opens);
                  }}
                >
                  {label}
                </Button>
              </div>
            ) : null;
          return (
            <>
              <ScreenTitle>
                {say(words.common.of, { what: said.title, name: project.name })}
              </ScreenTitle>
              <p>{said.about}</p>
              {told}
              {failed === null ? null : <Trouble reply={failed} />}

              <section className="panel" aria-labelledby="setup-settings">
                <h2 id="setup-settings">{said.settings}</h2>
                <dl className="facts">
                  <dt>{said.allowSplitLoads}</dt>
                  <dd>{yesNo(project.allowSplitLoads)}</dd>
                  <dt>{said.loadCallLow}</dt>
                  <dd>
                    {project.loadCallLowLimit === null
                      ? words.common.none
                      : number(project.loadCallLowLimit)}
                  </dd>
                  <dt>{said.loadCallHigh}</dt>
                  <dd>
                    {project.loadCallHighLimit === null
                      ? words.common.none
                      : number(project.loadCallHighLimit)}
                  </dd>
                  <dt>{said.stumpFillDepth}</dt>
                  <dd>{number(project.stumpFillDepthInches)}</dd>
                  <dt>{said.stumpRootBallWider}</dt>
                  <dd>{yesNo(project.stumpCheckRootBallWider)}</dd>
                  <dt>{said.stumpFillNeedsExposure}</dt>
                  <dd>{yesNo(project.stumpCheckFillNeedsExposure)}</dd>
                  <dt>{said.siteCircle}</dt>
                  <dd>{number(UsUnits.feetOf(project.siteCircleMeters))}</dd>
                  <dt>{said.timeClock}</dt>
                  <dd>{yesNo(project.timeClockEnabled)}</dd>
                </dl>
                {tool(said.changeSettings, 'settings')}
              </section>

              <section className="panel" aria-labelledby="setup-window">
                <h2 id="setup-window">{said.window}</h2>
                <dl className="facts">
                  <dt>{words.newProject.activeFrom}</dt>
                  <dd>{day(project.activeFrom)}</dd>
                  <dt>{words.newProject.activeTo}</dt>
                  <dd>{project.activeTo === null ? words.common.none : day(project.activeTo)}</dd>
                  <dt>{words.newProject.numbering}</dt>
                  <dd>{words.newProject.numberings[project.ticketNumberSource]}</dd>
                  <dt>{words.newProject.workflows}</dt>
                  <dd>
                    {project.workflows.map((one) => words.newProject.workflowNames[one]).join(', ')}
                  </dd>
                </dl>
                {tool(said.changeWindow, 'window')}
              </section>

              <section className="panel" aria-labelledby="setup-numbering">
                <h2 id="setup-numbering">{said.numbering}</h2>
                <Table
                  caption={said.numbering}
                  rows={answer.numberSeries}
                  keyOf={(row) => row.id}
                  columns={[
                    {
                      label: said.series,
                      names: true,
                      cell: (row) => words.newProject.seriesNames[row.series],
                    },
                    {
                      label: said.firstNumber,
                      numeric: true,
                      cell: (row) => String(row.firstNumber),
                    },
                    {
                      label: said.nextNumber,
                      numeric: true,
                      cell: (row) => String(row.nextNumber),
                    },
                  ]}
                />
                {tool(said.startSeries, 'series')}
                <h3>{said.ranges}</h3>
                <Table
                  caption={said.ranges}
                  rows={answer.controlRanges}
                  keyOf={(row) => row.id}
                  columns={[
                    {
                      label: said.series,
                      names: true,
                      cell: (row) => words.newProject.seriesNames[row.series],
                    },
                    {
                      label: said.firstNumber,
                      numeric: true,
                      cell: (row) => String(row.firstNumber),
                    },
                    {
                      label: said.lastNumber,
                      numeric: true,
                      cell: (row) => String(row.lastNumber),
                    },
                    {
                      label: words.common.state,
                      cell: (row) =>
                        row.archived ? (
                          words.common.archived
                        ) : mayChange ? (
                          <Button
                            onPress={() => {
                              setFailed(null);
                              void api
                                .ask(archiveControlRangeEndpoint, {
                                  params: { controlRangeId: row.id },
                                })
                                .then((reply) => {
                                  if (reply.kind === 'answered') written(reply.answer);
                                  else setFailed(reply);
                                });
                            }}
                          >
                            {`${words.common.archive} ${String(row.firstNumber)}–${String(row.lastNumber)}`}
                          </Button>
                        ) : (
                          words.common.inService
                        ),
                    },
                  ]}
                />
                {tool(said.addRange, 'range')}
              </section>

              <section className="panel" aria-labelledby="setup-tags">
                <h2 id="setup-tags">{said.fieldTags}</h2>
                <p>{said.fieldTagsAbout}</p>
                <Table
                  caption={said.fieldTags}
                  rows={projectTags}
                  keyOf={(row) => row.id}
                  columns={[{ label: said.fieldTag, names: true, cell: (row) => row.name }]}
                />
                {tool(said.addFieldTag, 'fieldTag')}
              </section>

              <section className="panel" aria-labelledby="setup-primes">
                <h2 id="setup-primes">{said.primes}</h2>
                <Table
                  caption={said.primes}
                  rows={answer.contractors}
                  keyOf={(row) => row.id}
                  columns={[
                    { label: said.prime, names: true, cell: (row) => row.name },
                    { label: said.position, cell: (row) => said.positions[row.position] },
                    {
                      label: words.common.state,
                      cell: (row) =>
                        row.archived ? words.common.archived : words.common.inService,
                    },
                  ]}
                />
                {tool(said.addPrime, 'prime')}
              </section>

              <section className="panel" aria-labelledby="setup-contracts">
                <h2 id="setup-contracts">{said.contracts}</h2>
                <Table
                  caption={said.contracts}
                  rows={answer.contracts}
                  keyOf={(row) => row.id}
                  columns={[
                    { label: said.contract, names: true, cell: (row) => row.name },
                    { label: said.prime, cell: (row) => primeName(row.primeId) },
                    {
                      label: said.signedCopy,
                      cell: (row) => row.signedCopyUrl ?? words.common.none,
                    },
                    ...(mayChange
                      ? [
                          {
                            label: words.common.actions,
                            cell: (row: ProjectAnswer['contracts'][number]) => (
                              <Button
                                onPress={() => {
                                  setOpen({ contract: row });
                                }}
                              >
                                {say(said.editContract, { name: row.name })}
                              </Button>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
                {tool(said.addContract, 'contract')}
              </section>

              {shownDialog === null ? null : (
                <FormDialog
                  title={shownDialog.title}
                  fields={shownDialog.fields}
                  initial={shownDialog.initial}
                  save={shownDialog.save}
                  onClose={() => {
                    setOpen(null);
                  }}
                />
              )}
            </>
          );
        }}
      </Shown>
    </main>
  );
}
