// The dispatch board (adms-field-app; ADR-240): each person's work for a day on the project, their
// ticket types, whether they certify, the forms they make, their one site where the work is at one,
// the phone they take it on, and their unit rate work. Planned here; one made on a phone under the
// master passcode shows as such. What is worth a look (a person twice that day, a site not active)
// is the API's, beside each row: nothing here stops work. A day is copied to another, each
// assignment written again as it was (Luis copies Monday's board to Tuesday's).
import {
  listPayItemsEndpoint,
  listPeopleEndpoint,
  listPhonesEndpoint,
  listSitesEndpoint,
  readProjectEndpoint,
  reinstateAssignmentEndpoint,
  searchBoardEndpoint,
  changeAssignmentEndpoint,
  withdrawAssignmentEndpoint,
  writeAssignmentEndpoint,
  type AssignmentRecord,
} from '@open-adms/contracts';
import { ProjectClock } from '@open-adms/domain';
import { Banner, Button, ScreenTitle } from '@open-adms/look';
import { useState } from 'react';

import type { NotAnswered } from '../api.ts';
import { CheckField, DateEntry } from '../look/fields.tsx';
import {
  FormDialog,
  checked,
  optional,
  picked,
  picks,
  text,
  type FieldSpec,
  type Values,
} from '../look/form-dialog.tsx';
import { Table } from '../look/paged-table.tsx';
import { Shown, Trouble, useApi, useRead } from '../reading.tsx';
import { holds, useSigned } from '../session.tsx';
import { useTold, type SetupWritten } from '../setup/common.tsx';
import { counted, day, say, words } from '../words.ts';

type Kind = AssignmentRecord['fieldEventKinds'][number];
type FormKind = AssignmentRecord['formDocumentTypes'][number];
const kinds: readonly Kind[] = [
  'COLLECTION',
  'DISPOSAL',
  'HAUL_OUT_COLLECTION',
  'HAUL_OUT_DISPOSAL',
  'UNIT_RATE',
];
const formKinds: readonly FormKind[] = ['ROE', 'SURVEY', 'INCIDENT', 'DROP_OFF_LOG'];

type Open =
  | { readonly kind: 'add' }
  | { readonly kind: 'edit'; readonly assignment: AssignmentRecord }
  | { readonly kind: 'withdraw'; readonly assignment: AssignmentRecord }
  | { readonly kind: 'copy' };

export function DispatchBoard({ projectId }: { readonly projectId: string }) {
  const [project] = useRead(readProjectEndpoint, { params: { projectId } });
  return (
    <main data-screen="dispatch" className="page" id="content">
      <Shown read={project}>
        {(answer) => <Board projectId={projectId} timeZone={answer.project.timeZone} />}
      </Shown>
    </main>
  );
}

function Board({ projectId, timeZone }: { readonly projectId: string; readonly timeZone: string }) {
  const api = useApi();
  const said = words.dispatch;
  const { session } = useSigned();
  const mayDispatch = holds(session, 'DISPATCH');
  const [workDate, setWorkDate] = useState(() => new ProjectClock(timeZone).day(new Date()));
  const [withdrawn, setWithdrawn] = useState(false);
  const [open, setOpen] = useState<Open | null>(null);
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const [told, tell] = useTold();
  const [copied, setCopied] = useState<string | null>(null);
  const [board, reload] = useRead(searchBoardEndpoint, {
    query: {
      projectId,
      from: workDate,
      to: workDate,
      withdrawn: withdrawn ? 'true' : 'false',
      limit: '200',
    },
  });
  const [people] = useRead(listPeopleEndpoint, {
    query: { role: 'MONITOR', archived: 'false', order: 'NAME', limit: '200' },
  });
  const [sites] = useRead(listSitesEndpoint, { params: { projectId }, query: { limit: '200' } });
  const [phones] = useRead(listPhonesEndpoint, { query: { outOfService: 'false', limit: '200' } });
  const [payItems] = useRead(listPayItemsEndpoint, {
    params: { projectId },
    query: { limit: '200' },
  });

  const done = (answer: SetupWritten): null => {
    tell(answer);
    reload();
    return null;
  };
  const fields = (adding: boolean): FieldSpec[] => [
    ...(adding
      ? [
          {
            kind: 'pick',
            key: 'personId',
            label: said.person,
            required: true,
            options:
              people.kind === 'answered'
                ? people.answer.people.map((one) => ({
                    id: one.id,
                    label: `${one.name} (${one.monitorId ?? ''})`,
                  }))
                : [],
          } as const,
        ]
      : []),
    {
      kind: 'picks',
      key: 'fieldEventKinds',
      label: said.work,
      options: kinds.map((one) => ({ id: one, label: said.kinds[one] })),
    },
    { kind: 'check', key: 'certifying', label: said.certifying },
    {
      kind: 'picks',
      key: 'formDocumentTypes',
      label: said.forms,
      options: formKinds.map((one) => ({ id: one, label: said.formNames[one] })),
    },
    {
      kind: 'pick',
      key: 'siteId',
      label: said.site,
      options: [
        { id: '', label: said.noSite },
        ...(sites.kind === 'answered'
          ? sites.answer.sites.map((entry) => ({ id: entry.site.id, label: entry.site.name }))
          : []),
      ],
    },
    {
      kind: 'pick',
      key: 'deviceId',
      label: said.phone,
      options: [
        { id: '', label: said.noPhone },
        ...(phones.kind === 'answered'
          ? phones.answer.phones.map((phone) => ({ id: phone.id, label: phone.name }))
          : []),
      ],
    },
    {
      kind: 'picks',
      key: 'payItemIds',
      label: said.payItems,
      options:
        payItems.kind === 'answered'
          ? payItems.answer.payItems
              .filter((entry) => entry.payItem.kindOfWorkId !== null && !entry.payItem.archived)
              .map((entry) => ({
                id: entry.payItem.id,
                label: `${entry.payItem.code}, ${entry.payItem.description}`,
              }))
          : [],
    },
  ];
  const workOf = (values: Values) => ({
    fieldEventKinds: picks(values, 'fieldEventKinds') as Kind[],
    certifying: checked(values, 'certifying'),
    formDocumentTypes: picks(values, 'formDocumentTypes') as FormKind[],
    siteId: picked(values, 'siteId'),
    deviceId: picked(values, 'deviceId'),
    payItemIds: picks(values, 'payItemIds'),
  });
  const valuesOf = (assignment: AssignmentRecord): Values => ({
    fieldEventKinds: assignment.fieldEventKinds,
    certifying: assignment.certifying,
    formDocumentTypes: assignment.formDocumentTypes,
    siteId: assignment.site?.id ?? '',
    deviceId: assignment.phone?.id ?? '',
    payItemIds: assignment.payItems.map((item) => item.id),
  });

  const copy = async (
    to: string,
    assignments: readonly AssignmentRecord[],
  ): Promise<NotAnswered | null> => {
    let made = 0;
    for (const one of assignments) {
      const reply = await api.ask(writeAssignmentEndpoint, {
        params: { projectId },
        body: {
          personId: one.person.id,
          workDate: to,
          fieldEventKinds: [...one.fieldEventKinds],
          certifying: one.certifying,
          formDocumentTypes: [...one.formDocumentTypes],
          siteId: one.site?.id ?? null,
          deviceId: one.phone?.id ?? null,
          payItemIds: one.payItems.map((item) => item.id),
        },
      });
      if (reply.kind !== 'answered') return reply;
      made += 1;
    }
    setCopied(counted(said.copied, made));
    return null;
  };

  return (
    <>
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      {told}
      {copied === null ? null : (
        <Banner tone="good" announced>
          <p>{copied}</p>
        </Banner>
      )}
      {failed === null ? null : <Trouble reply={failed} />}
      <div className="page-tools">
        <DateEntry
          label={said.day}
          value={workDate}
          onChange={(value) => {
            if (value !== '') setWorkDate(value);
          }}
        />
        <CheckField label={said.showWithdrawn} value={withdrawn} onChange={setWithdrawn} />
        {mayDispatch ? (
          <>
            <Button
              main
              onPress={() => {
                setOpen({ kind: 'add' });
              }}
            >
              {said.add}
            </Button>
            <Button
              onPress={() => {
                setOpen({ kind: 'copy' });
              }}
            >
              {said.copy}
            </Button>
          </>
        ) : null}
      </div>
      <Shown read={board}>
        {(answer) => {
          const rows = answer.assignments;
          return (
            <>
              <Table
                caption={`${said.title}, ${day(workDate)}`}
                rows={rows}
                keyOf={(entry) => entry.assignment.id}
                columns={[
                  {
                    label: said.person,
                    names: true,
                    cell: (entry) =>
                      `${entry.assignment.person.name}${entry.assignment.person.monitorId === null ? '' : ` (${entry.assignment.person.monitorId})`}`,
                  },
                  {
                    label: said.work,
                    cell: (entry) =>
                      [
                        ...entry.assignment.fieldEventKinds.map((kind) => said.kinds[kind]),
                        ...(entry.assignment.certifying ? [said.certifying] : []),
                        ...entry.assignment.formDocumentTypes.map((form) => said.formNames[form]),
                      ].join(', '),
                  },
                  { label: said.site, cell: (entry) => entry.assignment.site?.name ?? said.noSite },
                  {
                    label: said.phone,
                    cell: (entry) => entry.assignment.phone?.name ?? said.noPhone,
                  },
                  {
                    label: said.payItems,
                    cell: (entry) => entry.assignment.payItems.map((item) => item.code).join(', '),
                  },
                  { label: said.origin, cell: (entry) => said.origins[entry.assignment.origin] },
                  {
                    label: said.warnings,
                    cell: (entry) =>
                      entry.assignment.withdrawnAt === null
                        ? entry.warnings.map((warning) => warning.message).join(' ')
                        : `${said.withdrawn}${entry.assignment.withdrawalNote === null ? '' : `: ${entry.assignment.withdrawalNote}`}`,
                  },
                  ...(mayDispatch
                    ? [
                        {
                          label: words.common.actions,
                          cell: (entry: (typeof rows)[number]) => {
                            const { assignment } = entry;
                            return assignment.withdrawnAt === null ? (
                              <div className="row-actions">
                                <Button
                                  onPress={() => {
                                    setOpen({ kind: 'edit', assignment });
                                  }}
                                >
                                  {say(said.edit, { name: assignment.person.name })}
                                </Button>
                                <Button
                                  onPress={() => {
                                    setOpen({ kind: 'withdraw', assignment });
                                  }}
                                >
                                  {say(said.withdraw, { name: assignment.person.name })}
                                </Button>
                              </div>
                            ) : (
                              <Button
                                onPress={() => {
                                  setFailed(null);
                                  void api
                                    .ask(reinstateAssignmentEndpoint, {
                                      params: { assignmentId: assignment.id },
                                    })
                                    .then((reply) => {
                                      if (reply.kind === 'answered') done(reply.answer);
                                      else setFailed(reply);
                                    });
                                }}
                              >
                                {say(said.reinstate, { name: assignment.person.name })}
                              </Button>
                            );
                          },
                        },
                      ]
                    : []),
                ]}
              />
              {open?.kind === 'copy' ? (
                <FormDialog
                  title={said.copy}
                  fields={[{ kind: 'date', key: 'to', label: said.copyTo, required: true }]}
                  initial={{}}
                  save={(values) =>
                    copy(
                      text(values, 'to'),
                      rows
                        .filter((entry) => entry.assignment.withdrawnAt === null)
                        .map((entry) => entry.assignment),
                    ).then((outcome) => {
                      if (outcome === null) reload();
                      return outcome;
                    })
                  }
                  onClose={() => {
                    setOpen(null);
                  }}
                />
              ) : null}
            </>
          );
        }}
      </Shown>
      {open?.kind === 'add' ? (
        <FormDialog
          title={said.add}
          fields={fields(true)}
          initial={{ fieldEventKinds: ['COLLECTION'] }}
          save={async (values) => {
            const reply = await api.ask(writeAssignmentEndpoint, {
              params: { projectId },
              body: { personId: picked(values, 'personId') ?? '', workDate, ...workOf(values) },
            });
            return reply.kind === 'answered' ? done(reply.answer) : reply;
          }}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open?.kind === 'edit' ? (
        <FormDialog
          title={say(said.edit, { name: open.assignment.person.name })}
          fields={fields(false)}
          initial={valuesOf(open.assignment)}
          save={async (values) => {
            const reply = await api.ask(changeAssignmentEndpoint, {
              params: { assignmentId: open.assignment.id },
              body: workOf(values),
            });
            return reply.kind === 'answered' ? done(reply.answer) : reply;
          }}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open?.kind === 'withdraw' ? (
        <FormDialog
          title={say(said.withdraw, { name: open.assignment.person.name })}
          fields={[{ kind: 'text', key: 'note', label: said.note, longest: 500 }]}
          initial={{}}
          save={async (values) => {
            const note = optional(values, 'note');
            const reply = await api.ask(withdrawAssignmentEndpoint, {
              params: { assignmentId: open.assignment.id },
              body: note === undefined ? {} : { note },
            });
            return reply.kind === 'answered' ? done(reply.answer) : reply;
          }}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
    </>
  );
}
