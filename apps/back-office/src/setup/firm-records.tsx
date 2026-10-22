// The records the firm keeps across its projects (adms-domain §1.4): clients, declaration events
// and contractors, each added and changed by a person who may set up.
import {
  changeClientEndpoint,
  changeContractorEndpoint,
  changeDeclarationEventEndpoint,
  contractorKinds,
  createClientEndpoint,
  createContractorEndpoint,
  createDeclarationEventEndpoint,
  findClientsEndpoint,
  findContractorsEndpoint,
  findDeclarationEventsEndpoint,
  type ClientRecord,
  type ContractorRecord,
  type DeclarationEventRecord,
} from '@open-adms/contracts';

import { nullable, optional, picked, text, type Values } from '../look/form-dialog.tsx';
import { words } from '../words.ts';
import { nameIn, useListOptions } from './common.tsx';
import { RecordsPage, type Write } from './records-page.tsx';

const archivedOr = (archived: boolean): string =>
  archived ? words.common.archived : words.common.inService;

export function Clients() {
  const said = words.clients;
  const contact = [
    { kind: 'text', key: 'contactName', label: words.common.contactName, longest: 200 },
    { kind: 'text', key: 'contactEmail', label: words.common.contactEmail, longest: 320 },
    { kind: 'text', key: 'contactPhone', label: words.common.contactPhone, longest: 40 },
    { kind: 'long', key: 'notes', label: words.common.notes, longest: 4000 },
  ] as const;
  return (
    <main data-screen="clients" className="page" id="content">
      <RecordsPage<ClientRecord>
        title={said.title}
        about={said.about}
        served={findClientsEndpoint}
        rowsOf={(answer: { records: ClientRecord[] }) => answer.records}
        columns={[
          { label: said.name, names: true, cell: (row) => row.name },
          { label: words.common.contactName, cell: (row) => row.contactName ?? '' },
          { label: words.common.contactEmail, cell: (row) => row.contactEmail ?? '' },
          { label: words.common.state, cell: (row) => archivedOr(row.archived) },
        ]}
        fields={[
          { kind: 'text', key: 'name', label: said.name, required: true, longest: 200 },
          ...contact,
        ]}
        addLabel={said.add}
        added={(values): Write => ({
          served: createClientEndpoint,
          asking: {
            body: {
              name: text(values, 'name'),
              ...defined({
                contactName: optional(values, 'contactName'),
                contactEmail: optional(values, 'contactEmail'),
                contactPhone: optional(values, 'contactPhone'),
                notes: optional(values, 'notes'),
              }),
            },
          },
        })}
        editLabel={said.edit}
        initialOf={(row): Values => ({
          name: row.name,
          contactName: row.contactName ?? '',
          contactEmail: row.contactEmail ?? '',
          contactPhone: row.contactPhone ?? '',
          notes: row.notes ?? '',
        })}
        changed={(row, values): Write => ({
          served: changeClientEndpoint,
          asking: {
            params: { clientId: row.id },
            body: {
              name: text(values, 'name'),
              contactName: nullable(values, 'contactName'),
              contactEmail: nullable(values, 'contactEmail'),
              contactPhone: nullable(values, 'contactPhone'),
              notes: nullable(values, 'notes'),
            },
          },
        })}
      />
    </main>
  );
}

export function DeclarationEvents() {
  const said = words.events;
  const kinds = useListOptions('declaration-reference-types');
  const fields = [
    { kind: 'text', key: 'name', label: said.name, required: true, longest: 200 },
    {
      kind: 'text',
      key: 'reference',
      label: said.reference,
      hint: said.referenceHint,
      required: true,
      longest: 200,
    },
    {
      kind: 'pick',
      key: 'referenceTypeId',
      label: said.referenceType,
      options: kinds,
      required: true,
    },
  ] as const;
  const body = (values: Values) => ({
    name: text(values, 'name'),
    reference: text(values, 'reference'),
    referenceTypeId: picked(values, 'referenceTypeId') ?? '',
  });
  return (
    <main data-screen="declaration-events" className="page" id="content">
      <RecordsPage<DeclarationEventRecord>
        title={said.title}
        about={said.about}
        served={findDeclarationEventsEndpoint}
        rowsOf={(answer: { records: DeclarationEventRecord[] }) => answer.records}
        columns={[
          { label: said.name, names: true, cell: (row) => row.name },
          { label: said.reference, cell: (row) => row.reference },
          { label: said.referenceType, cell: (row) => nameIn(kinds, row.referenceTypeId) },
          { label: words.common.state, cell: (row) => archivedOr(row.archived) },
        ]}
        fields={fields}
        addLabel={said.add}
        added={(values): Write => ({
          served: createDeclarationEventEndpoint,
          asking: { body: body(values) },
        })}
        editLabel={said.edit}
        initialOf={(row): Values => ({
          name: row.name,
          reference: row.reference,
          referenceTypeId: row.referenceTypeId,
        })}
        changed={(row, values): Write => ({
          served: changeDeclarationEventEndpoint,
          asking: { params: { declarationEventId: row.id }, body: body(values) },
        })}
      />
    </main>
  );
}

export function Contractors() {
  const said = words.contractors;
  const kinds = contractorKinds.map((kind) => ({ id: kind, label: said.kinds[kind] }));
  const fields = [
    { kind: 'text', key: 'name', label: said.name, required: true, longest: 200 },
    { kind: 'pick', key: 'kind', label: said.kind, options: kinds, required: true },
    { kind: 'text', key: 'contactName', label: words.common.contactName, longest: 200 },
    { kind: 'text', key: 'contactEmail', label: words.common.contactEmail, longest: 320 },
    { kind: 'text', key: 'contactPhone', label: words.common.contactPhone, longest: 40 },
  ] as const;
  const kindOf = (values: Values) =>
    (picked(values, 'kind') ?? 'HAULER') as (typeof contractorKinds)[number];
  return (
    <main data-screen="contractors" className="page" id="content">
      <RecordsPage<ContractorRecord>
        title={said.title}
        about={said.about}
        served={findContractorsEndpoint}
        rowsOf={(answer: { records: ContractorRecord[] }) => answer.records}
        columns={[
          { label: said.name, names: true, cell: (row) => row.name },
          { label: said.kind, cell: (row) => said.kinds[row.kind] },
          { label: words.common.contactName, cell: (row) => row.contactName ?? '' },
          { label: words.common.state, cell: (row) => archivedOr(row.archived) },
        ]}
        fields={fields}
        addLabel={said.add}
        added={(values): Write => ({
          served: createContractorEndpoint,
          asking: {
            body: {
              name: text(values, 'name'),
              kind: kindOf(values),
              ...defined({
                contactName: optional(values, 'contactName'),
                contactEmail: optional(values, 'contactEmail'),
                contactPhone: optional(values, 'contactPhone'),
              }),
            },
          },
        })}
        editLabel={said.edit}
        initialOf={(row): Values => ({
          name: row.name,
          kind: row.kind,
          contactName: row.contactName ?? '',
          contactEmail: row.contactEmail ?? '',
          contactPhone: row.contactPhone ?? '',
        })}
        changed={(row, values): Write => ({
          served: changeContractorEndpoint,
          asking: {
            params: { contractorId: row.id },
            body: {
              name: text(values, 'name'),
              kind: kindOf(values),
              contactName: nullable(values, 'contactName'),
              contactEmail: nullable(values, 'contactEmail'),
              contactPhone: nullable(values, 'contactPhone'),
            },
          },
        })}
      />
    </main>
  );
}

// An object with the keys whose values are given: what the API takes as "left out".
export function defined<T extends Record<string, unknown>>(
  values: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}
