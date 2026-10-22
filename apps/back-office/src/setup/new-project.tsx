// A new project (adms-ticket-workflows, the setup spine; ADR-024, 148): one body of work for one
// client under one declaration event, a separate project per funder or kind of work. Its program
// type, its time zone (every ticket's time is read in it), its active window, how it numbers its
// tickets, the ticket types it takes and its kinds of unit rate work; each series' first number
// where the firm's paper says. The project's settings start from the program type, the firm's to
// change after.
import {
  createProjectEndpoint,
  findClientsEndpoint,
  findDeclarationEventsEndpoint,
  ticketNumberSources,
} from '@open-adms/contracts';
import { numberSeries, workflows } from '@open-adms/domain';

import type { NotAnswered } from '../api.ts';
import {
  FormDialog,
  nullable,
  numberOf,
  picked,
  picks,
  text,
  type FieldSpec,
  type Values,
} from '../look/form-dialog.tsx';
import { navigate } from '../router.tsx';
import { useApi, useRead } from '../reading.tsx';
import { words } from '../words.ts';
import { useListOptions } from './common.tsx';

// Every time zone the browser knows, by its IANA name.
const timeZones = Intl.supportedValuesOf('timeZone').map((zone) => ({ id: zone, label: zone }));

export function NewProject({ onClose }: { readonly onClose: () => void }) {
  const api = useApi();
  const said = words.newProject;
  const [clients] = useRead(findClientsEndpoint, { query: { limit: '200' } });
  const [events] = useRead(findDeclarationEventsEndpoint, { query: { limit: '200' } });
  const programTypes = useListOptions('program-types');
  const kinds = useListOptions('kinds-of-work');
  const fields: FieldSpec[] = [
    {
      kind: 'text',
      key: 'name',
      label: said.name,
      hint: said.nameHint,
      required: true,
      longest: 200,
    },
    {
      kind: 'pick',
      key: 'clientId',
      label: said.client,
      required: true,
      options:
        clients.kind === 'answered'
          ? clients.answer.records
              .filter((row) => !row.archived)
              .map((row) => ({ id: row.id, label: row.name }))
          : [],
    },
    {
      kind: 'pick',
      key: 'declarationEventId',
      label: said.event,
      required: true,
      options:
        events.kind === 'answered'
          ? events.answer.records
              .filter((row) => !row.archived)
              .map((row) => ({ id: row.id, label: `${row.name} (${row.reference})` }))
          : [],
    },
    {
      kind: 'pick',
      key: 'programTypeId',
      label: said.programType,
      required: true,
      options: programTypes,
    },
    {
      kind: 'pick',
      key: 'timeZone',
      label: said.timeZone,
      hint: said.timeZoneHint,
      required: true,
      options: timeZones,
    },
    { kind: 'date', key: 'activeFrom', label: said.activeFrom, required: true },
    { kind: 'date', key: 'activeTo', label: said.activeTo, hint: said.activeToHint },
    {
      kind: 'pick',
      key: 'ticketNumberSource',
      label: said.numbering,
      required: true,
      options: ticketNumberSources.map((source) => ({
        id: source,
        label: said.numberings[source],
      })),
    },
    {
      kind: 'picks',
      key: 'workflows',
      label: said.workflows,
      options: workflows.map((workflow) => ({ id: workflow, label: said.workflowNames[workflow] })),
    },
    { kind: 'picks', key: 'kindOfWorkIds', label: said.kindsOfWork, options: kinds },
    { kind: 'heading', key: 'numbersHeading', label: said.numbersFrom },
    ...numberSeries.map((series): FieldSpec => ({
      kind: 'whole',
      key: `from-${series}`,
      label: said.seriesNames[series],
      hint: said.numbersFromHint,
    })),
  ];
  const save = async (values: Values): Promise<NotAnswered | null> => {
    const numbersFrom = Object.fromEntries(
      numberSeries.flatMap((series) => {
        const first = numberOf(values, `from-${series}`);
        return first === null ? [] : [[series, first]];
      }),
    );
    const reply = await api.ask(createProjectEndpoint, {
      body: {
        name: text(values, 'name'),
        clientId: picked(values, 'clientId') ?? '',
        declarationEventId: picked(values, 'declarationEventId') ?? '',
        programTypeId: picked(values, 'programTypeId') ?? '',
        timeZone: picked(values, 'timeZone') ?? '',
        activeFrom: text(values, 'activeFrom'),
        activeTo: nullable(values, 'activeTo'),
        ticketNumberSource: (picked(values, 'ticketNumberSource') ??
          'GENERATED') as (typeof ticketNumberSources)[number],
        workflows: picks(values, 'workflows') as (typeof workflows)[number][],
        kindOfWorkIds: picks(values, 'kindOfWorkIds'),
        ...(Object.keys(numbersFrom).length === 0 ? {} : { numbersFrom }),
      },
    });
    if (reply.kind !== 'answered') return reply;
    navigate(`/projects/${reply.answer.record.id}/setup`);
    return null;
  };
  return (
    <FormDialog
      title={said.title}
      fields={fields}
      initial={{ ticketNumberSource: 'GENERATED', workflows: ['LOAD'] }}
      save={save}
      onClose={onClose}
    />
  );
}
