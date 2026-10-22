// One place for what the back office takes away (REQ-412, 413, 414; spec/FROM-BUILD-1.md §1, §10;
// AC-09-27): the client package is assembled by hand from these. Exports of a project's tickets,
// transactions, certifications and audit history as CSV, Excel-compatible CSV or JSON, narrowed as
// the ledger is; photo PDFs of tickets, certifications or incidents in two layouts; and the
// receipt batch, ticket numbers pasted with any separator, as just their receipts or the full
// record. Each file is made by the server, read with the session's cookies and saved; nothing is
// kept of it.
import {
  exportDatasets,
  exportFileEndpoint,
  exportFormats,
  listInvoiceBatchesEndpoint,
  photoPdfEndpoint,
  receiptBatchEndpoint,
} from '@open-adms/contracts';
import { workflows } from '@open-adms/domain';
import { Banner, Button, ScreenTitle } from '@open-adms/look';
import { useState } from 'react';

import type { NotAnswered } from '../api.ts';
import { ChoiceField, DateEntry, SelectField, TextBlock } from '../look/fields.tsx';
import { savedFile } from '../look/save-file.ts';
import { Trouble, useApi, useRead } from '../reading.tsx';
import { optionsOf, Reviewed, useReviewing } from '../review/reviewing.tsx';
import { words } from '../words.ts';

export function Exports({ projectId }: { readonly projectId: string }) {
  return (
    <main data-screen="exports" className="page" id="content">
      <Reviewed projectId={projectId}>
        <ExportsOf projectId={projectId} />
      </Reviewed>
    </main>
  );
}

const any = '';
type Dataset = (typeof exportDatasets)[number];
type Format = (typeof exportFormats)[number];

// A file being made, and what came of the last one.
function useMaking() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const [saved, setSaved] = useState(false);
  const make = (made: () => Promise<NotAnswered | null>) => {
    setBusy(true);
    setFailed(null);
    setSaved(false);
    void made().then((outcome) => {
      setBusy(false);
      setFailed(outcome);
      setSaved(outcome === null);
    });
  };
  const said = (
    <>
      {failed === null ? null : <Trouble reply={failed} />}
      {saved ? (
        <Banner tone="good" announced>
          <p>{words.exports.saved}</p>
        </Banner>
      ) : null}
    </>
  );
  return { busy, make, said };
}

function ExportsOf({ projectId }: { readonly projectId: string }) {
  const api = useApi();
  const said = words.exports;
  const { names } = useReviewing();
  const [dataset, setDataset] = useState<Dataset>('transactions');
  const [format, setFormat] = useState<Format>('excel');
  const [workflow, setWorkflow] = useState<string>(any);
  const [prime, setPrime] = useState<string>(any);
  const [batch, setBatch] = useState<string>(any);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const exporting = useMaking();
  const [batches] = useRead(listInvoiceBatchesEndpoint, {
    params: { projectId },
    query: { limit: '200' },
  });

  const [items, setItems] = useState<'tickets' | 'certifications' | 'incidents'>('tickets');
  const [layout, setLayout] = useState<'several' | 'one'>('several');
  const [photoNumbers, setPhotoNumbers] = useState('');
  const [photoFrom, setPhotoFrom] = useState('');
  const [photoTo, setPhotoTo] = useState('');
  const photographing = useMaking();

  const [numbers, setNumbers] = useState('');
  const [content, setContent] = useState<'receipts' | 'full'>('receipts');
  const receipting = useMaking();

  const workflowPicked = workflows.find((each) => each === workflow);
  return (
    <>
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>

      <section aria-labelledby="exports-files">
        <h2 id="exports-files">{said.filesTitle}</h2>
        <div className="page-tools">
          <SelectField
            label={said.dataset}
            options={exportDatasets.map((each) => ({ id: each, label: said.datasets[each] }))}
            value={dataset}
            onChange={(value) => {
              setDataset(exportDatasets.find((each) => each === value) ?? 'transactions');
            }}
          />
          <ChoiceField
            label={said.format}
            options={exportFormats.map((each) => ({ id: each, label: said.formats[each] }))}
            value={format}
            onChange={(value) => {
              setFormat(exportFormats.find((each) => each === value) ?? 'excel');
            }}
          />
        </div>
        {dataset === 'audit-history' || dataset === 'certifications' ? null : (
          <div className="page-tools">
            <SelectField
              label={said.workflow}
              options={[
                { id: any, label: said.every },
                ...workflows.map((each) => ({ id: each, label: words.review.workflows[each] })),
              ]}
              value={workflow}
              onChange={(value) => {
                setWorkflow(value ?? any);
              }}
            />
            {dataset === 'transactions' ? (
              <SelectField
                label={said.prime}
                options={[{ id: any, label: said.every }, ...optionsOf(names.contractors)]}
                value={prime}
                onChange={(value) => {
                  setPrime(value ?? any);
                }}
              />
            ) : null}
            <SelectField
              label={said.batch}
              options={[
                { id: any, label: said.every },
                ...(batches.kind === 'answered'
                  ? batches.answer.batches.map((each) => ({
                      id: each.batch.id,
                      label: each.batch.name,
                    }))
                  : []),
              ]}
              value={batch}
              onChange={(value) => {
                setBatch(value ?? any);
              }}
            />
            <DateEntry label={words.common.from} value={from} onChange={setFrom} />
            <DateEntry label={words.common.to} value={to} onChange={setTo} />
          </div>
        )}
        {exporting.said}
        <div className="page-tools">
          <Button
            main
            busy={exporting.busy}
            onPress={() => {
              exporting.make(() =>
                savedFile(
                  api,
                  exportFileEndpoint,
                  {
                    params: { projectId, dataset },
                    query: {
                      format,
                      ...(workflowPicked === undefined ? {} : { workflow: workflowPicked }),
                      ...(prime === any || dataset !== 'transactions' ? {} : { primeId: prime }),
                      ...(batch === any ? {} : { invoiceBatchId: batch }),
                      ...(from === '' ? {} : { from }),
                      ...(to === '' ? {} : { to }),
                    },
                  },
                  `${dataset}.csv`,
                ),
              );
            }}
          >
            {exporting.busy ? said.making : said.export}
          </Button>
        </div>
      </section>

      <section aria-labelledby="exports-photos">
        <h2 id="exports-photos">{said.photosTitle}</h2>
        <p>{said.photosAbout}</p>
        <div className="page-tools">
          <ChoiceField
            label={said.items}
            options={(['tickets', 'certifications', 'incidents'] as const).map((each) => ({
              id: each,
              label: said.itemKinds[each],
            }))}
            value={items}
            onChange={(value) => {
              setItems(value === 'certifications' || value === 'incidents' ? value : 'tickets');
            }}
          />
          <ChoiceField
            label={said.layout}
            options={(['several', 'one'] as const).map((each) => ({
              id: each,
              label: said.layouts[each],
            }))}
            value={layout}
            onChange={(value) => {
              setLayout(value === 'one' ? 'one' : 'several');
            }}
          />
        </div>
        <div className="page-tools">
          {items === 'incidents' ? null : (
            <TextBlock
              label={items === 'tickets' ? said.ticketNumbers : said.certNumbers}
              hint={said.numbersHint}
              value={photoNumbers}
              onChange={setPhotoNumbers}
              longest={4000}
            />
          )}
          {items === 'certifications' ? null : (
            <>
              <DateEntry label={words.common.from} value={photoFrom} onChange={setPhotoFrom} />
              <DateEntry label={words.common.to} value={photoTo} onChange={setPhotoTo} />
            </>
          )}
        </div>
        {photographing.said}
        <div className="page-tools">
          <Button
            busy={photographing.busy}
            onPress={() => {
              photographing.make(() =>
                savedFile(
                  api,
                  photoPdfEndpoint,
                  {
                    params: { projectId },
                    query: {
                      items,
                      layout,
                      ...(photoNumbers.trim() === '' || items === 'incidents'
                        ? {}
                        : { numbers: photoNumbers.trim() }),
                      ...(photoFrom === '' ? {} : { from: photoFrom }),
                      ...(photoTo === '' ? {} : { to: photoTo }),
                    },
                  },
                  'photographs.pdf',
                ),
              );
            }}
          >
            {photographing.busy ? said.making : said.makePhotos}
          </Button>
        </div>
      </section>

      <section aria-labelledby="exports-receipts">
        <h2 id="exports-receipts">{said.receiptsTitle}</h2>
        <p>{said.receiptsAbout}</p>
        <div className="page-tools">
          <TextBlock
            label={said.ticketNumbers}
            hint={said.numbersHint}
            value={numbers}
            onChange={setNumbers}
            longest={4000}
          />
          <ChoiceField
            label={said.content}
            options={(['receipts', 'full'] as const).map((each) => ({
              id: each,
              label: said.contents[each],
            }))}
            value={content}
            onChange={(value) => {
              setContent(value === 'full' ? 'full' : 'receipts');
            }}
          />
        </div>
        {receipting.said}
        <div className="page-tools">
          <Button
            busy={receipting.busy}
            onPress={() => {
              if (numbers.trim() === '') return;
              receipting.make(() =>
                savedFile(
                  api,
                  receiptBatchEndpoint,
                  { params: { projectId }, query: { numbers: numbers.trim(), content } },
                  'receipts.pdf',
                ),
              );
            }}
          >
            {receipting.busy ? said.making : said.makeReceipts}
          </Button>
        </div>
      </section>
    </>
  );
}
