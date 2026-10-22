// A project's ROEs, Rights of Entry (adms-ticket-workflows; ADR-149; BUILD.md, settled 2): made on a
// phone or entered here from paper. An ROE made on a phone carries no scope: the back office enters
// it from the paper, each debris type of the project's forms and each kind of unit rate work the
// owner allowed, with how many where the paper says; one taken off stays, marked. Every change by a
// person who may correct, prior values kept.
import {
  correctRoeEndpoint,
  correctRoeScopeEndpoint,
  createRoeEndpoint,
  listFormsEndpoint,
  listRoesEndpoint,
  setupCheckEndpoint,
  type RoesAnswer,
} from '@open-adms/contracts';
import { Button, ScreenTitle } from '@open-adms/look';
import { useState } from 'react';

import type { NotAnswered } from '../api.ts';
import {
  FormDialog,
  checked,
  nullable,
  numberOf,
  picked,
  text,
  type Values,
} from '../look/form-dialog.tsx';
import { PagedTable, Table } from '../look/paged-table.tsx';
import { Trouble, useApi, useRead } from '../reading.tsx';
import { holds, useSigned } from '../session.tsx';
import { day, number, say, words } from '../words.ts';
import { nameIn, useListOptions, useTold, yesNo, type SetupWritten } from './common.tsx';

type Entry = RoesAnswer['roes'][number];

type Open =
  | { readonly kind: 'new' }
  | { readonly kind: 'correct'; readonly entry: Entry }
  | { readonly kind: 'scope'; readonly entry: Entry };

export function Roes({ projectId }: { readonly projectId: string }) {
  const api = useApi();
  const said = words.roes;
  const { session } = useSigned();
  const mayCorrect = holds(session, 'CORRECT');
  const [forms] = useRead(listFormsEndpoint, { params: { projectId } });
  const debrisTypes = useListOptions('debris-types');
  const payableTypes = useListOptions('payable-types');
  const [open, setOpen] = useState<Open | null>(null);
  const [reloaded, setReloaded] = useState(0);
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const [told, tell] = useTold();
  const done = (answer: SetupWritten): null => {
    tell(answer);
    setReloaded((count) => count + 1);
    return null;
  };
  // Each debris type entry of the project's load and haul-out forms, by its form's name.
  const entries =
    forms.kind === 'answered'
      ? forms.answer.forms.flatMap((entry) =>
          entry.debrisTypes
            .filter((one) => !one.archived)
            .map((one) => ({
              id: one.id,
              label: `${nameIn(debrisTypes, one.debrisTypeId)} (${entry.form.name})`,
            })),
        )
      : [];
  const scopeName = (line: Entry['scope'][number]) =>
    line.formDebrisTypeId !== null
      ? nameIn(entries, line.formDebrisTypeId)
      : nameIn(payableTypes, line.payableTypeId);

  const roeFields = [
    { kind: 'text', key: 'roeNumber', label: said.roeNumber, required: true, longest: 40 },
    { kind: 'text', key: 'parcelId', label: said.parcel, longest: 40 },
    { kind: 'text', key: 'address', label: said.address, longest: 2000 },
    { kind: 'text', key: 'ownerName', label: said.owner, longest: 200 },
    { kind: 'check', key: 'signed', label: said.signed },
    { kind: 'date', key: 'signedDate', label: said.signedDate },
    { kind: 'long', key: 'notes', label: words.common.notes, longest: 2000 },
  ] as const;
  const facts = (values: Values) => ({
    roeNumber: text(values, 'roeNumber'),
    parcelId: nullable(values, 'parcelId'),
    address: nullable(values, 'address'),
    ownerName: nullable(values, 'ownerName'),
    signed: checked(values, 'signed'),
    signedDate: nullable(values, 'signedDate'),
    notes: nullable(values, 'notes'),
  });

  return (
    <main data-screen="roes" className="page" id="content">
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      {told}
      {failed === null ? null : <Trouble reply={failed} />}
      {mayCorrect ? (
        <div className="page-tools">
          <Button
            main
            onPress={() => {
              setOpen({ kind: 'new' });
            }}
          >
            {said.add}
          </Button>
        </div>
      ) : null}
      <PagedTable
        caption={said.title}
        served={listRoesEndpoint}
        asking={{ params: { projectId }, query: { limit: '50' } }}
        rowsOf={(answer) => answer.roes}
        nextOf={(answer) => answer.next}
        keyOf={(entry: Entry) => entry.roe.id}
        reloaded={reloaded}
        columns={[
          { label: said.roeNumber, names: true, cell: (entry) => entry.roe.roeNumber },
          { label: said.owner, cell: (entry) => entry.roe.ownerName ?? '' },
          { label: said.address, cell: (entry) => entry.roe.address ?? '' },
          {
            label: said.signed,
            cell: (entry) =>
              entry.roe.signed
                ? `${yesNo(true)}${entry.roe.signedDate === null ? '' : `, ${day(entry.roe.signedDate)}`}`
                : yesNo(false),
          },
          { label: said.source, cell: (entry) => said.sources[entry.roe.source] },
          {
            label: said.scope,
            cell: (entry) => {
              const lines = entry.scope.filter((line) => line.takenOffAt === null);
              return lines.length === 0
                ? said.noScope
                : lines
                    .map(
                      (line) =>
                        `${scopeName(line)}${line.count === null ? '' : ` × ${number(line.count)}`}`,
                    )
                    .join(', ');
            },
          },
          ...(mayCorrect
            ? [
                {
                  label: words.common.actions,
                  cell: (entry: Entry) => (
                    <div className="row-actions">
                      <Button
                        onPress={() => {
                          setOpen({ kind: 'scope', entry });
                        }}
                      >
                        {say(words.common.of, { what: said.addScope, name: entry.roe.roeNumber })}
                      </Button>
                      <Button
                        onPress={() => {
                          setOpen({ kind: 'correct', entry });
                        }}
                      >
                        {say(words.common.of, { what: said.correct, name: entry.roe.roeNumber })}
                      </Button>
                      {entry.scope
                        .filter((line) => line.takenOffAt === null)
                        .map((line) => (
                          <Button
                            key={line.id}
                            onPress={() => {
                              setFailed(null);
                              const pick =
                                line.formDebrisTypeId !== null
                                  ? { formDebrisTypeId: line.formDebrisTypeId }
                                  : { payableTypeId: line.payableTypeId ?? '' };
                              void api
                                .ask(correctRoeScopeEndpoint, {
                                  params: { roeId: entry.roe.id },
                                  body: { pick, inScope: false },
                                })
                                .then((reply) => {
                                  if (reply.kind === 'answered') done(reply.answer);
                                  else setFailed(reply);
                                });
                            }}
                          >
                            {say(words.common.of, { what: said.takeOff, name: scopeName(line) })}
                          </Button>
                        ))}
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
      {open?.kind === 'new' ? (
        <FormDialog
          title={said.add}
          fields={roeFields}
          initial={{}}
          save={async (values) => {
            const reply = await api.ask(createRoeEndpoint, {
              params: { projectId },
              body: { ...facts(values), fix: null, madeAt: null, answers: { answers: {} } },
            });
            return reply.kind === 'answered' ? done(reply.answer) : reply;
          }}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open?.kind === 'correct' ? (
        <FormDialog
          title={say(said.page, { number: open.entry.roe.roeNumber })}
          fields={[...roeFields, { kind: 'text', key: 'note', label: said.note, longest: 500 }]}
          initial={{
            roeNumber: open.entry.roe.roeNumber,
            parcelId: open.entry.roe.parcelId ?? '',
            address: open.entry.roe.address ?? '',
            ownerName: open.entry.roe.ownerName ?? '',
            signed: open.entry.roe.signed,
            signedDate: open.entry.roe.signedDate ?? '',
            notes: open.entry.roe.notes ?? '',
          }}
          save={async (values) => {
            const note = text(values, 'note');
            const reply = await api.ask(correctRoeEndpoint, {
              params: { roeId: open.entry.roe.id },
              body: { changes: facts(values), ...(note === '' ? {} : { note }) },
            });
            return reply.kind === 'answered' ? done(reply.answer) : reply;
          }}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open?.kind === 'scope' ? (
        <FormDialog
          title={say(words.common.of, { what: said.addScope, name: open.entry.roe.roeNumber })}
          fields={[
            {
              kind: 'pick',
              key: 'pick',
              label: said.scopeKind,
              required: true,
              options: [
                ...entries.map((entry) => ({
                  id: `debris:${entry.id}`,
                  label: say(words.common.of, { what: said.scopeKinds.debris, name: entry.label }),
                })),
                ...payableTypes.map((type) => ({
                  id: `work:${type.id}`,
                  label: say(words.common.of, { what: said.scopeKinds.work, name: type.label }),
                })),
              ],
            },
            { kind: 'whole', key: 'count', label: said.scopeCount },
            { kind: 'text', key: 'note', label: said.note, longest: 500 },
          ]}
          initial={{}}
          save={async (values) => {
            const chosen = picked(values, 'pick') ?? '';
            const [kind = '', id = ''] = chosen.split(':');
            const count = numberOf(values, 'count');
            const pick =
              kind === 'debris' ? { formDebrisTypeId: id, count } : { payableTypeId: id, count };
            const note = text(values, 'note');
            const reply = await api.ask(correctRoeScopeEndpoint, {
              params: { roeId: open.entry.roe.id },
              body: { pick, inScope: true, ...(note === '' ? {} : { note }) },
            });
            return reply.kind === 'answered' ? done(reply.answer) : reply;
          }}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
    </main>
  );
}

// The setup check (ADR-229): gaps in the setup before the field day, each in the API's plain words.
// Nothing here stops field work.
export function SetupCheck({ projectId }: { readonly projectId: string }) {
  const said = words.setupCheck;
  const [read] = useRead(setupCheckEndpoint, { params: { projectId } });
  return (
    <main data-screen="setup-check" className="page" id="content">
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      {read.kind === 'answered' ? (
        read.answer.gaps.length === 0 ? (
          <p role="status">{said.none}</p>
        ) : (
          <Table
            caption={said.title}
            rows={read.answer.gaps.map((gap, at) => ({ ...gap, key: `${gap.code}-${String(at)}` }))}
            keyOf={(gap) => gap.key}
            columns={[{ label: said.gap, names: true, cell: (gap) => gap.message }]}
          />
        )
      ) : read.kind === 'loading' ? (
        <p className="quiet" role="status">
          {words.common.loading}
        </p>
      ) : (
        <Trouble reply={read} />
      )}
    </main>
  );
}
