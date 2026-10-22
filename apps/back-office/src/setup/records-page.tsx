// What a screen of records the firm keeps shows, inside the screen that names itself
// (ARCHITECTURE §14): its one paged table, searched by name
// where the API searches, a record added from a dialog and each changed from its row, by a person
// who may set up; what each write came to said above the table. A record is archived, never deleted.
import type { Endpoint } from '@open-adms/contracts';
import { Button, ScreenTitle, TextEntry } from '@open-adms/look';
import { useState, type ReactNode } from 'react';

import type { Asking, NotAnswered } from '../api.ts';
import { FormDialog, type FieldSpec, type Values } from '../look/form-dialog.tsx';
import { PagedTable, type Column } from '../look/paged-table.tsx';
import { useApi } from '../reading.tsx';
import { holds, useSigned } from '../session.tsx';
import { say, words } from '../words.ts';
import { useTold, type SetupWritten } from './common.tsx';

// A write the page sends: its endpoint and what it asks, from the dialog's values.
export interface Write {
  readonly served: Endpoint;
  readonly asking: Asking<Endpoint>;
}

export function RecordsPage<Row extends { readonly id: string; readonly name: string }>({
  title,
  about,
  served,
  searched = true,
  rowsOf,
  columns,
  fields,
  addLabel,
  added,
  editLabel,
  initialOf,
  changed,
  extra,
}: {
  readonly title: string;
  readonly about: string;
  readonly served: Endpoint;
  readonly searched?: boolean;
  readonly rowsOf: (answer: never) => readonly Row[];
  readonly columns: readonly Column<Row>[];
  readonly fields: readonly FieldSpec[];
  readonly addLabel: string;
  readonly added: (values: Values) => Write;
  readonly editLabel: string;
  readonly initialOf: (row: Row) => Values;
  readonly changed: (row: Row, values: Values) => Write;
  readonly extra?: ReactNode;
}) {
  const api = useApi();
  const { session } = useSigned();
  const mayChange = holds(session, 'SETUP');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<{ readonly row: Row | null } | null>(null);
  const [reloaded, setReloaded] = useState(0);
  const [told, tell] = useTold();

  const sent = async (write: Write): Promise<NotAnswered | null> => {
    const reply = await api.ask(write.served, write.asking);
    if (reply.kind !== 'answered') return reply;
    tell(reply.answer as SetupWritten);
    setReloaded((count) => count + 1);
    return null;
  };

  return (
    <>
      <ScreenTitle>{title}</ScreenTitle>
      <p>{about}</p>
      {told}
      <div className="page-tools">
        {searched ? (
          <TextEntry label={words.common.search} value={search} onChange={setSearch} />
        ) : null}
        {mayChange ? (
          <Button
            main
            onPress={() => {
              setOpen({ row: null });
            }}
          >
            {addLabel}
          </Button>
        ) : null}
      </div>
      {extra}
      <PagedTable
        caption={title}
        served={served}
        asking={{
          query: { limit: '50', ...(search.trim() === '' ? {} : { search: search.trim() }) },
        }}
        rowsOf={rowsOf as (answer: unknown) => readonly Row[]}
        nextOf={(answer) => (answer as { next: string | null }).next}
        keyOf={(row: Row) => row.id}
        reloaded={reloaded}
        columns={[
          ...columns,
          ...(mayChange
            ? [
                {
                  label: words.common.actions,
                  cell: (row: Row) => (
                    <Button
                      onPress={() => {
                        setOpen({ row });
                      }}
                    >
                      {say(editLabel, { name: row.name })}
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
      />
      {open === null ? null : (
        <FormDialog
          title={open.row === null ? addLabel : say(editLabel, { name: open.row.name })}
          fields={fields}
          initial={open.row === null ? {} : initialOf(open.row)}
          save={(values) => sent(open.row === null ? added(values) : changed(open.row, values))}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
    </>
  );
}
