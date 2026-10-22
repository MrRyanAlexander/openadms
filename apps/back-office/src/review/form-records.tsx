// The project's forms that never bill (adms-ticket-workflows, Workflow D; FROM-BUILD-1 §8: they
// belong in Reports and Forms, never among the tickets): surveys, incidents and citizen drop-off
// logs, each as its phone made it or as the back office entered it from paper (ADR-156, 521, 534),
// with its photographs. Each is corrected in place by a person who may correct, the values before
// kept in the audit log; one entered here names the person and a reason picked from the firm's
// list, and takes its photographs here. ROEs have their own screen.
import {
  correctDropOffLogEndpoint,
  correctIncidentEndpoint,
  correctSurveyEndpoint,
  createDropOffLogEndpoint,
  createIncidentEndpoint,
  createSurveyEndpoint,
  listDropOffLogsEndpoint,
  listIncidentsEndpoint,
  listSurveysEndpoint,
  type DropOffLogsAnswer,
  type Endpoint,
  type IncidentsAnswer,
  type PhotographRecord,
  type QcMarkRecord,
  type SurveysAnswer,
} from '@open-adms/contracts';
import type { ProjectClock } from '@open-adms/domain';
import { Button, ScreenTitle } from '@open-adms/look';
import { useState } from 'react';

import type { Asking, NotAnswered } from '../api.ts';
import {
  FormDialog,
  nullable,
  picked,
  text,
  type FieldSpec,
  type Values,
} from '../look/form-dialog.tsx';
import { PagedTable, type Column } from '../look/paged-table.tsx';
import { Photo } from '../look/photo.tsx';
import { Trouble, useApi } from '../reading.tsx';
import { holds, useSigned } from '../session.tsx';
import { useTold, type SetupWritten } from '../setup/common.tsx';
import { say, words } from '../words.ts';
import { QcMark } from '../billings/qc-mark.tsx';
import { AddPhoto } from './add-photo.tsx';
import { answerFields, answersOf, answerValues, definitionFor } from './answers.tsx';
import {
  at,
  nameOf,
  optionsOf,
  personOf,
  reasonsFor,
  Reviewed,
  useReviewing,
  type Reviewing,
} from './reviewing.tsx';

// What every form records, whoever made it.
interface FormRecord {
  readonly id: string;
  readonly source: 'DEVICE' | 'BACK_OFFICE';
  readonly createdById: string | null;
  readonly createdReasonId: string | null;
  readonly monitorId: string;
  readonly madeAt: string;
  readonly fix: { readonly latitude: string; readonly longitude: string } | null;
  readonly notes: string | null;
  readonly answers: Readonly<Record<string, string | number | boolean>>;
  readonly formDefinitionId: string | null;
}

interface Row<R extends FormRecord> {
  readonly record: R;
  readonly photographs: readonly PhotographRecord[];
  readonly qcMark: QcMarkRecord | null;
}

// One kind of form: how it is listed, entered and corrected.
interface Kind<R extends FormRecord> {
  readonly title: string;
  readonly about: string;
  readonly add: string;
  readonly named: (record: R) => string;
  readonly owner: 'SURVEY' | 'INCIDENT' | 'DROP_OFF_LOG';
  // What its QC mark is set on.
  readonly qcOf: (
    record: R,
  ) => { surveyId: string } | { incidentId: string } | { dropOffLogId: string };
  readonly list: Endpoint;
  readonly rowsOf: (answer: never) => readonly Row<R>[];
  readonly columns: (reviewing: Reviewing) => readonly Column<Row<R>>[];
  readonly fields: (reviewing: Reviewing, record: R | null) => readonly FieldSpec[];
  readonly valuesOf: (record: R) => Values;
  // Its own details from the form, as the API takes them.
  readonly detailsOf: (values: Values) => Record<string, unknown>;
  readonly create: (
    projectId: string,
    body: Record<string, unknown>,
  ) => {
    readonly served: Endpoint;
    readonly asking: Asking<Endpoint>;
  };
  readonly correct: (
    record: R,
    changes: Record<string, unknown>,
    note: string,
  ) => {
    readonly served: Endpoint;
    readonly asking: Asking<Endpoint>;
  };
}

const commonFields = ({ names }: Reviewing, record: FormRecord | null): FieldSpec[] => [
  {
    kind: 'pick',
    key: 'monitorId',
    label: words.review.event.monitor,
    required: true,
    options: names.people
      .filter((person) => person.monitor && (!person.archived || person.id === record?.monitorId))
      .map((person) => ({
        id: person.id,
        label: `${person.name} (${person.monitorNumber ?? ''})`,
      })),
  },
  { kind: 'date', key: 'madeDay', label: words.forms2.madeDay, required: true },
  { kind: 'time', key: 'madeTime', label: words.forms2.madeTime },
  { kind: 'decimal', key: 'latitude', label: words.forms2.latitude },
  { kind: 'decimal', key: 'longitude', label: words.forms2.longitude },
];

const notesField: FieldSpec = {
  kind: 'long',
  key: 'notes',
  label: words.common.notes,
  longest: 2000,
};

const madeAtOf = (clock: ProjectClock, values: Values): string => {
  const day = text(values, 'madeDay');
  const time = text(values, 'madeTime') || '00:00';
  return clock.instantAt(day, time)?.toISOString() ?? `${day}T${time}`;
};

const fixOf = (values: Values) => {
  const latitude = text(values, 'latitude');
  const longitude = text(values, 'longitude');
  return latitude === '' && longitude === '' ? null : { latitude, longitude };
};

const commonValues = (clock: ProjectClock, record: FormRecord): Values => ({
  monitorId: record.monitorId,
  madeDay: clock.day(new Date(record.madeAt)),
  madeTime: clock.time(new Date(record.madeAt)),
  latitude: record.fix?.latitude ?? '',
  longitude: record.fix?.longitude ?? '',
  notes: record.notes ?? '',
});

function FormRecords<R extends FormRecord>({
  projectId,
  kind,
}: {
  readonly projectId: string;
  readonly kind: Kind<R>;
}) {
  const api = useApi();
  const reviewing = useReviewing();
  const { names, clock } = reviewing;
  const { session } = useSigned();
  const mayCorrect = holds(session, 'CORRECT');
  const mayQc = holds(session, 'QC');
  const [open, setOpen] = useState<{ readonly record: R | null } | null>(null);
  const [reloaded, setReloaded] = useState(0);
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const [told, tell] = useTold();
  const done = (written: SetupWritten): null => {
    setFailed(null);
    tell(written);
    setReloaded((count) => count + 1);
    return null;
  };
  const said = words.forms2;
  const definitionOf = (record: R | null) =>
    definitionFor(names, kind.owner, record?.formDefinitionId ?? null);

  return (
    <>
      <ScreenTitle>{kind.title}</ScreenTitle>
      <p>{kind.about}</p>
      {told}
      {failed === null ? null : <Trouble reply={failed} />}
      {mayCorrect ? (
        <div className="page-tools">
          <Button
            main
            onPress={() => {
              setOpen({ record: null });
            }}
          >
            {kind.add}
          </Button>
        </div>
      ) : null}
      <PagedTable
        caption={kind.title}
        served={kind.list}
        asking={{ params: { projectId }, query: { limit: '50' } }}
        rowsOf={kind.rowsOf as (answer: unknown) => readonly Row<R>[]}
        nextOf={(answer) => (answer as { next: string | null }).next}
        keyOf={(row: Row<R>) => row.record.id}
        reloaded={reloaded}
        columns={[
          {
            label: said.made,
            names: true,
            cell: (row) => at(clock, row.record.madeAt),
          },
          { label: said.monitor, cell: (row) => personOf(names, row.record.monitorId) },
          ...kind.columns(reviewing),
          {
            label: said.source,
            cell: (row) =>
              row.record.source === 'BACK_OFFICE'
                ? say(words.review.event.madeInBackOffice, {
                    person: personOf(names, row.record.createdById),
                    reason: nameOf(names.reasons, row.record.createdReasonId),
                  })
                : words.review.event.madeOnPhone,
          },
          {
            label: said.qc,
            cell: (row) =>
              row.qcMark === null ? words.review.qc.QC_REVIEW : words.review.qc[row.qcMark.status],
          },
          {
            label: said.photos,
            cell: (row) => (
              <div className="photos">
                {row.photographs
                  .filter((photo) => photo.uploadedAt !== null)
                  .map((photo) => (
                    <Photo
                      key={photo.id}
                      photoId={photo.id}
                      label={say(words.review.event.photoLabel, {
                        what: photo.label ?? kind.named(row.record),
                        at: at(clock, photo.capturedAt),
                      })}
                    />
                  ))}
                {mayCorrect && row.record.source === 'BACK_OFFICE' ? (
                  <AddPhoto
                    on={kind.owner}
                    recordId={row.record.id}
                    name={kind.named(row.record)}
                    onDone={done}
                    onFailed={setFailed}
                  />
                ) : null}
              </div>
            ),
          },
          ...(mayCorrect || mayQc
            ? [
                {
                  label: words.common.actions,
                  cell: (row: Row<R>) => (
                    <div className="row-actions">
                      {mayCorrect ? (
                        <Button
                          onPress={() => {
                            setOpen({ record: row.record });
                          }}
                        >
                          {say(words.common.of, {
                            what: said.correct,
                            name: kind.named(row.record),
                          })}
                        </Button>
                      ) : null}
                      {mayQc ? (
                        <QcMark
                          record={kind.qcOf(row.record)}
                          name={kind.named(row.record)}
                          mark={row.qcMark}
                          onDone={done}
                        />
                      ) : null}
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
      {open === null ? null : (
        <FormDialog
          title={
            open.record === null
              ? kind.add
              : say(words.common.of, { what: said.correct, name: kind.named(open.record) })
          }
          fields={[
            ...(open.record === null
              ? [
                  {
                    kind: 'pick' as const,
                    key: 'reasonId',
                    label: words.review.made.reason,
                    required: true,
                    options: reasonsFor(names, 'BACK_OFFICE_RECORD'),
                  },
                ]
              : []),
            // Who made it, when and where are entered once, from the paper.
            ...(open.record === null ? commonFields(reviewing, null) : []),
            ...kind.fields(reviewing, open.record),
            notesField,
            ...answerFields(definitionOf(open.record)),
            ...(open.record === null
              ? []
              : [{ kind: 'text' as const, key: 'note', label: words.review.note, longest: 500 }]),
          ]}
          initial={
            open.record === null
              ? { madeDay: clock.day(new Date()) }
              : {
                  ...commonValues(clock, open.record),
                  ...kind.valuesOf(open.record),
                  ...answerValues(definitionOf(open.record), open.record.answers),
                }
          }
          save={async (values) => {
            const details = {
              monitorId: picked(values, 'monitorId') ?? '',
              madeAt: madeAtOf(clock, values),
              fix: fixOf(values),
              notes: nullable(values, 'notes'),
              ...kind.detailsOf(values),
            };
            if (open.record === null) {
              const write = kind.create(projectId, {
                ...details,
                deviceUtcOffsetMinutes: clock.offsetMinutes(new Date(details.madeAt)),
                answers: answersOf(definitionOf(null), values),
                reasonId: picked(values, 'reasonId') ?? '',
              });
              const reply = await api.ask(write.served, write.asking);
              return reply.kind === 'answered' ? done(reply.answer as SetupWritten) : reply;
            }
            // Only what the person changed: the form's own details, as the record had them.
            const before = {
              ...kind.detailsOf({
                ...commonValues(clock, open.record),
                ...kind.valuesOf(open.record),
              }),
              notes: open.record.notes,
            } as Record<string, unknown>;
            const changes: Record<string, unknown> = Object.fromEntries(
              Object.entries({ ...kind.detailsOf(values), notes: details.notes }).filter(
                ([key, value]) => JSON.stringify(before[key]) !== JSON.stringify(value),
              ),
            );
            // The answers given whole, against their version, where any changed.
            const definition = definitionOf(open.record);
            const answersBefore = answersOf(
              definition,
              answerValues(definition, open.record.answers),
            );
            const answersNow = answersOf(definition, values);
            if (JSON.stringify(answersBefore) !== JSON.stringify(answersNow)) {
              changes['answers'] = answersNow;
            }
            if (Object.keys(changes).length === 0) return null;
            const write = kind.correct(open.record, changes, text(values, 'note'));
            const reply = await api.ask(write.served, write.asking);
            return reply.kind === 'answered' ? done(reply.answer as SetupWritten) : reply;
          }}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
    </>
  );
}

const noted = (note: string): { note?: string } => (note === '' ? {} : { note });

type Survey = SurveysAnswer['surveys'][number]['survey'];
const surveys: Kind<Survey> = {
  title: words.forms2.surveys.title,
  about: words.forms2.surveys.about,
  add: words.forms2.surveys.add,
  named: (record) =>
    say(words.forms2.surveys.named, { number: record.surveyNumber ?? record.roeNumber ?? '' }),
  owner: 'SURVEY',
  qcOf: (record) => ({ surveyId: record.id }),
  list: listSurveysEndpoint,
  rowsOf: (answer: SurveysAnswer) =>
    answer.surveys.map((entry) => ({ ...entry, record: entry.survey })),
  columns: ({ names }) => [
    {
      label: words.forms2.surveys.workType,
      cell: (row) => nameOf(names.surveyWorkTypes, row.record.workTypeId),
    },
    { label: words.forms2.surveys.surveyNumber, cell: (row) => row.record.surveyNumber ?? '' },
    { label: words.forms2.roeNumber, cell: (row) => row.record.roeNumber ?? '' },
  ],
  fields: ({ names }, record) => [
    {
      kind: 'pick',
      key: 'workTypeId',
      label: words.forms2.surveys.workType,
      required: true,
      options: optionsOf(names.surveyWorkTypes, record?.workTypeId ?? null),
    },
    { kind: 'text', key: 'surveyNumber', label: words.forms2.surveys.surveyNumber, longest: 40 },
    { kind: 'text', key: 'roeNumber', label: words.forms2.roeNumber, longest: 40 },
  ],
  valuesOf: (record) => ({
    workTypeId: record.workTypeId,
    surveyNumber: record.surveyNumber ?? '',
    roeNumber: record.roeNumber ?? '',
  }),
  detailsOf: (values) => ({
    workTypeId: picked(values, 'workTypeId') ?? '',
    surveyNumber: nullable(values, 'surveyNumber'),
    roeNumber: nullable(values, 'roeNumber'),
  }),
  create: (projectId, body) => ({
    served: createSurveyEndpoint,
    asking: { params: { projectId }, body },
  }),
  correct: (record, changes, note) => ({
    served: correctSurveyEndpoint,
    asking: { params: { surveyId: record.id }, body: { changes, ...noted(note) } },
  }),
};

type Incident = IncidentsAnswer['incidents'][number]['incident'];
const incidents: Kind<Incident> = {
  title: words.forms2.incidents.title,
  about: words.forms2.incidents.about,
  add: words.forms2.incidents.add,
  named: (record) => say(words.forms2.incidents.named, { what: record.description ?? '' }),
  owner: 'INCIDENT',
  qcOf: (record) => ({ incidentId: record.id }),
  list: listIncidentsEndpoint,
  rowsOf: (answer: IncidentsAnswer) =>
    answer.incidents.map((entry) => ({ ...entry, record: entry.incident })),
  columns: ({ names }) => [
    {
      label: words.forms2.incidents.type,
      cell: (row) =>
        [
          nameOf(names.incidentTypes, row.record.incidentTypeId),
          row.record.incidentSubTypeId === null
            ? null
            : nameOf(names.incidentSubTypes, row.record.incidentSubTypeId),
        ]
          .filter((part) => part !== null)
          .join(' · '),
    },
    { label: words.forms2.incidents.description, cell: (row) => row.record.description ?? '' },
    { label: words.forms2.incidents.address, cell: (row) => row.record.address ?? '' },
  ],
  fields: ({ names }, record) => [
    {
      kind: 'pick',
      key: 'incidentTypeId',
      label: words.forms2.incidents.type,
      required: true,
      options: optionsOf(names.incidentTypes, record?.incidentTypeId ?? null),
    },
    {
      kind: 'pick',
      key: 'incidentSubTypeId',
      label: words.forms2.incidents.subType,
      options: names.incidentSubTypes
        .filter((sub) => !sub.archived || sub.id === record?.incidentSubTypeId)
        .map((sub) => ({
          id: sub.id,
          label: `${nameOf(names.incidentTypes, sub.incidentTypeId)} · ${sub.name}`,
        })),
    },
    { kind: 'long', key: 'description', label: words.forms2.incidents.description, longest: 2000 },
    { kind: 'text', key: 'parties', label: words.forms2.incidents.parties, longest: 2000 },
    { kind: 'text', key: 'address', label: words.forms2.incidents.address, longest: 2000 },
    {
      kind: 'pick',
      key: 'contractorId',
      label: words.forms2.incidents.contractor,
      options: optionsOf(names.contractors, record?.contractorId ?? null),
    },
    { kind: 'text', key: 'certNumber', label: words.review.event.certNumber, longest: 40 },
    { kind: 'text', key: 'roeNumber', label: words.forms2.roeNumber, longest: 40 },
  ],
  valuesOf: (record) => ({
    incidentTypeId: record.incidentTypeId,
    incidentSubTypeId: record.incidentSubTypeId ?? '',
    description: record.description ?? '',
    parties: record.parties ?? '',
    address: record.address ?? '',
    contractorId: record.contractorId ?? '',
    certNumber: record.certNumber ?? '',
    roeNumber: record.roeNumber ?? '',
  }),
  detailsOf: (values) => ({
    incidentTypeId: picked(values, 'incidentTypeId') ?? '',
    incidentSubTypeId: picked(values, 'incidentSubTypeId'),
    description: nullable(values, 'description'),
    parties: nullable(values, 'parties'),
    address: nullable(values, 'address'),
    contractorId: picked(values, 'contractorId'),
    certNumber: nullable(values, 'certNumber'),
    roeNumber: nullable(values, 'roeNumber'),
  }),
  create: (projectId, body) => ({
    served: createIncidentEndpoint,
    asking: { params: { projectId }, body },
  }),
  correct: (record, changes, note) => ({
    served: correctIncidentEndpoint,
    asking: { params: { incidentId: record.id }, body: { changes, ...noted(note) } },
  }),
};

type DropOffLog = DropOffLogsAnswer['dropOffLogs'][number]['dropOffLog'];
const dropOffLogs: Kind<DropOffLog> = {
  title: words.forms2.dropOffLogs.title,
  about: words.forms2.dropOffLogs.about,
  add: words.forms2.dropOffLogs.add,
  named: (record) => say(words.forms2.dropOffLogs.named, { name: record.residentName ?? '' }),
  owner: 'DROP_OFF_LOG',
  qcOf: (record) => ({ dropOffLogId: record.id }),
  list: listDropOffLogsEndpoint,
  rowsOf: (answer: DropOffLogsAnswer) =>
    answer.dropOffLogs.map((entry) => ({ ...entry, record: entry.dropOffLog })),
  columns: ({ names }) => [
    { label: words.forms2.dropOffLogs.site, cell: (row) => nameOf(names.sites, row.record.siteId) },
    { label: words.forms2.dropOffLogs.resident, cell: (row) => row.record.residentName ?? '' },
    { label: words.forms2.dropOffLogs.origin, cell: (row) => row.record.originAddress ?? '' },
  ],
  fields: ({ names }, record) => [
    {
      kind: 'pick',
      key: 'siteId',
      label: words.forms2.dropOffLogs.site,
      required: true,
      options: optionsOf(names.sites, record?.siteId ?? null),
    },
    { kind: 'text', key: 'residentName', label: words.forms2.dropOffLogs.resident, longest: 200 },
    { kind: 'text', key: 'originAddress', label: words.forms2.dropOffLogs.origin, longest: 2000 },
  ],
  valuesOf: (record) => ({
    siteId: record.siteId,
    residentName: record.residentName ?? '',
    originAddress: record.originAddress ?? '',
  }),
  detailsOf: (values) => ({
    siteId: picked(values, 'siteId') ?? '',
    residentName: nullable(values, 'residentName'),
    originAddress: nullable(values, 'originAddress'),
  }),
  create: (projectId, body) => ({
    served: createDropOffLogEndpoint,
    asking: { params: { projectId }, body },
  }),
  correct: (record, changes, note) => ({
    served: correctDropOffLogEndpoint,
    asking: { params: { dropOffLogId: record.id }, body: { changes, ...noted(note) } },
  }),
};

export function Surveys({ projectId }: { readonly projectId: string }) {
  return (
    <main data-screen="surveys" className="page" id="content">
      <Reviewed projectId={projectId}>
        <FormRecords projectId={projectId} kind={surveys} />
      </Reviewed>
    </main>
  );
}

export function Incidents({ projectId }: { readonly projectId: string }) {
  return (
    <main data-screen="incidents" className="page" id="content">
      <Reviewed projectId={projectId}>
        <FormRecords projectId={projectId} kind={incidents} />
      </Reviewed>
    </main>
  );
}

export function DropOffLogs({ projectId }: { readonly projectId: string }) {
  return (
    <main data-screen="drop-off-logs" className="page" id="content">
      <Reviewed projectId={projectId}>
        <FormRecords projectId={projectId} kind={dropOffLogs} />
      </Reviewed>
    </main>
  );
}
