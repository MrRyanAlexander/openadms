// The one paged table (FROM-BUILD-1 §13; ARCHITECTURE §14): every list of the back office is this
// table, a page at a time as the API reads it (`after`, `limit`, `next`), "Show more" asking for
// the next. A real table: a caption naming it, its column headers, a row header where a row has
// one, so a screen reader says each cell's column and row (WCAG 1.3.1). It stays inside the screen
// at any width: a table wider than its screen scrolls sideways inside its own region, which takes
// the keyboard's focus and is named for it (WCAG 1.4.10, 2.1.1), and the page itself never does.
import type { AnswerOf, Endpoint } from '@open-adms/contracts';
import { Button } from '@open-adms/look';
import { useEffect, useState, type ReactNode } from 'react';

import type { Asking } from '../api.ts';
import { Trouble, useApi, type Read } from '../reading.tsx';
import { counted, words } from '../words.ts';

export interface Column<Row> {
  readonly label: string;
  readonly cell: (row: Row) => ReactNode;
  // The cell that names its row (one a table).
  readonly names?: boolean;
  // A number, set to the end of its cell.
  readonly numeric?: boolean;
}

// A table of rows the screen already holds.
export function Table<Row>({
  caption,
  columns,
  rows,
  keyOf,
  footer,
}: {
  readonly caption: string;
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[];
  readonly keyOf: (row: Row) => string;
  readonly footer?: ReactNode;
}) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={caption}>
      <table className="table">
        <caption className="table-caption">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.label}
                scope="col"
                className={column.numeric === true ? 'cell-number' : undefined}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="quiet">
                {words.table.empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={keyOf(row)}>
                {columns.map((column) =>
                  column.names === true ? (
                    <th key={column.label} scope="row">
                      {column.cell(row)}
                    </th>
                  ) : (
                    <td
                      key={column.label}
                      className={column.numeric === true ? 'cell-number' : undefined}
                    >
                      {column.cell(row)}
                    </td>
                  ),
                )}
              </tr>
            ))
          )}
        </tbody>
        {footer === undefined ? null : <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}

// A table read from a paged endpoint: the first page as the screen asks it, then each next page
// added beneath on "Show more". Asked afresh whenever what the screen asks changes.
export function PagedTable<E extends Endpoint, Row>({
  caption,
  served,
  asking,
  rowsOf,
  nextOf,
  columns,
  keyOf,
  reloaded = 0,
}: {
  readonly caption: string;
  readonly served: E;
  readonly asking: Asking<E>;
  readonly rowsOf: (answer: AnswerOf<E>) => readonly Row[];
  readonly nextOf: (answer: AnswerOf<E>) => string | null;
  readonly columns: readonly Column<Row>[];
  readonly keyOf: (row: Row) => string;
  // Moved on by the screen to read the table again (after a change it made).
  readonly reloaded?: number;
}) {
  const api = useApi();
  const [rows, setRows] = useState<readonly Row[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [read, setRead] = useState<Read<null>>({ kind: 'loading' });
  const [more, setMore] = useState(false);
  const key = JSON.stringify(asking);

  const page = async (after: string | null): Promise<void> => {
    const base = JSON.parse(key) as Asking<E>;
    const query = { ...(base.query ?? {}), ...(after === null ? {} : { after }) };
    const reply = await api.ask(served, { ...base, query } as Asking<E>);
    if (reply.kind !== 'answered') {
      setRead(reply);
      return;
    }
    setRows((held) => [...(after === null ? [] : held), ...rowsOf(reply.answer)]);
    setNext(nextOf(reply.answer));
    setRead({ kind: 'answered', answer: null });
  };

  useEffect(() => {
    setRead({ kind: 'loading' });
    setRows([]);
    void page(null);
    // `page` reads only the key and the endpoint, both named here.
  }, [api, served, key, reloaded]);

  if (read.kind === 'loading') {
    return (
      <p className="quiet" role="status">
        {words.common.loading}
      </p>
    );
  }
  if (read.kind !== 'answered') return <Trouble reply={read} />;
  return (
    <div className="paged">
      <Table caption={caption} columns={columns} rows={rows} keyOf={keyOf} />
      <div className="paged-foot">
        <p className="quiet" role="status">
          {counted(words.table.shown, rows.length)}
          {next === null && rows.length > 0 ? ` ${words.table.all}` : ''}
        </p>
        {next === null ? null : (
          <Button
            busy={more}
            onPress={() => {
              setMore(true);
              void page(next).finally(() => {
                setMore(false);
              });
            }}
          >
            {more ? words.table.loadingMore : words.table.more}
          </Button>
        )}
      </div>
    </div>
  );
}
