// The tickets list as a file (REQ-412): the tickets the screen's filters match, every page of
// them, as CSV, an Excel workbook or a landscape PDF. The server makes the file through the same
// export the Exports screen uses, narrowed as the list is and read as the person may read it; the
// browser saves it under the name the server gave.
import { exportFileEndpoint, type QueryOf } from '@open-adms/contracts';
import { Button } from '@open-adms/look';
import { useState } from 'react';

import { SelectField } from '../look/fields.tsx';
import { useMaking } from '../look/making.tsx';
import { savedFile } from '../look/save-file.ts';
import { useApi } from '../reading.tsx';
import { words } from '../words.ts';

type Asked = QueryOf<typeof exportFileEndpoint>;
type Format = 'csv' | 'xlsx' | 'pdf';
const formats = ['csv', 'xlsx', 'pdf'] as const satisfies readonly Format[];

export function ExportTickets({
  projectId,
  narrowed,
}: {
  readonly projectId: string;
  // The list's own filters: workflow, status, QC status, locked.
  readonly narrowed: Omit<Asked, 'format'>;
}) {
  const api = useApi();
  const said = words.billings.tickets;
  const [format, setFormat] = useState<Format>('xlsx');
  const making = useMaking();
  return (
    <section aria-labelledby="tickets-export">
      <h2 id="tickets-export">{said.exportTitle}</h2>
      <p>{said.exportAbout}</p>
      {making.said}
      <div className="page-tools">
        <SelectField
          label={said.exportFormat}
          options={formats.map((each) => ({ id: each, label: said.exportFormats[each] }))}
          value={format}
          onChange={(value) => {
            setFormat(formats.find((each) => each === value) ?? 'xlsx');
          }}
        />
        <Button
          busy={making.busy}
          onPress={() => {
            making.make(() =>
              savedFile(
                api,
                exportFileEndpoint,
                { params: { projectId, dataset: 'tickets' }, query: { ...narrowed, format } },
                `tickets.${format}`,
              ),
            );
          }}
        >
          {making.busy ? said.exporting : said.export}
        </Button>
      </div>
    </section>
  );
}
