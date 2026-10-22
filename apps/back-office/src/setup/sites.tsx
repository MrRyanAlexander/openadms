// A project's disposal sites (adms-ticket-workflows; ADR-111, 136, 145, 173, 215, 222): each with
// its type, its site facts (takes loads, haul-outs leave here, charges a tipping fee, ineligible),
// its permit, its GPS and its activation and close dates; labels beside the facts; the tipping fee
// pay items the firm writes the site's fee from; its area, a circle around its GPS or a shape
// loaded from a map file; and what its phones ask for, worked out by the API from the setup as it
// stands.
import {
  addSiteShapeFileEndpoint,
  changeSiteEndpoint,
  createSiteEndpoint,
  filePartMediaType,
  giveSiteLabelEndpoint,
  linkTippingFeeEndpoint,
  listPayItemsEndpoint,
  listSitesEndpoint,
  readProjectEndpoint,
  removeSiteLabelEndpoint,
  removeTippingFeeEndpoint,
  sendMapFileEndpoint,
  siteQuantityLookupEndpoint,
  type SitesAnswer,
} from '@open-adms/contracts';
import { Button, ScreenTitle } from '@open-adms/look';
import { useState } from 'react';

import type { NotAnswered } from '../api.ts';
import { FileField } from '../look/fields.tsx';
import {
  FormDialog,
  checked,
  nullable,
  optional,
  picked,
  text,
  type FieldSpec,
  type Values,
} from '../look/form-dialog.tsx';
import { Table } from '../look/paged-table.tsx';
import { Shown, Trouble, useApi, useRead } from '../reading.tsx';
import { holds, useSigned } from '../session.tsx';
import { day, say, words } from '../words.ts';
import { nameIn, useListOptions, useTold, yesNo, type SetupWritten } from './common.tsx';

type Entry = SitesAnswer['sites'][number];
type Site = Entry['site'];

type Open =
  | { readonly kind: 'site'; readonly site: Site | null }
  | { readonly kind: 'label'; readonly entry: Entry }
  | { readonly kind: 'fee'; readonly entry: Entry }
  | { readonly kind: 'shape'; readonly entry: Entry };

export function Sites({ projectId }: { readonly projectId: string }) {
  const api = useApi();
  const { session } = useSigned();
  const mayChange = holds(session, 'SETUP');
  const said = words.sites;
  const [read, reload] = useRead(listSitesEndpoint, {
    params: { projectId },
    query: { limit: '200' },
  });
  const [payItems] = useRead(listPayItemsEndpoint, {
    params: { projectId },
    query: { limit: '200' },
  });
  const siteTypes = useListOptions('site-types');
  const labels = useListOptions('site-labels');
  const [open, setOpen] = useState<Open | null>(null);
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const [told, tell] = useTold();

  const done = (answer: SetupWritten): null => {
    tell(answer);
    reload();
    return null;
  };
  const payItemOptions =
    payItems.kind === 'answered'
      ? payItems.answer.payItems.map((entry) => ({
          id: entry.payItem.id,
          label: `${entry.payItem.code}, ${entry.payItem.description}`,
        }))
      : [];

  const siteFields: FieldSpec[] = [
    { kind: 'text', key: 'name', label: said.name, required: true, longest: 200 },
    { kind: 'text', key: 'shortCode', label: said.shortCode, longest: 20 },
    { kind: 'pick', key: 'siteTypeId', label: said.siteType, options: siteTypes, required: true },
    { kind: 'heading', key: 'factsHeading', label: said.facts },
    { kind: 'check', key: 'takesLoads', label: said.takesLoads },
    { kind: 'check', key: 'haulOutsLeaveHere', label: said.haulOutsLeaveHere },
    { kind: 'check', key: 'chargesTippingFee', label: said.chargesTippingFee },
    { kind: 'check', key: 'ineligibleSite', label: said.ineligibleSite, hint: said.ineligibleHint },
    { kind: 'text', key: 'permitNumber', label: said.permit, longest: 200 },
    {
      kind: 'decimal',
      key: 'latitude',
      label: said.latitude,
      hint: said.coordinateHint,
      required: true,
    },
    {
      kind: 'decimal',
      key: 'longitude',
      label: said.longitude,
      hint: said.coordinateHint,
      required: true,
    },
    { kind: 'date', key: 'activationDate', label: said.activation, required: true },
    { kind: 'date', key: 'closeDate', label: said.close },
  ];
  const facts = (values: Values) => ({
    name: text(values, 'name'),
    siteTypeId: picked(values, 'siteTypeId') ?? '',
    takesLoads: checked(values, 'takesLoads'),
    haulOutsLeaveHere: checked(values, 'haulOutsLeaveHere'),
    chargesTippingFee: checked(values, 'chargesTippingFee'),
    ineligibleSite: checked(values, 'ineligibleSite'),
    permitNumber: nullable(values, 'permitNumber'),
    latitude: text(values, 'latitude'),
    longitude: text(values, 'longitude'),
    activationDate: text(values, 'activationDate'),
  });

  const dialog = (entries: readonly Entry[]) => {
    if (open === null) return null;
    const close = () => {
      setOpen(null);
    };
    if (open.kind === 'site') {
      const site = open.site;
      return (
        <FormDialog
          title={site === null ? said.add : say(said.edit, { name: site.name })}
          fields={siteFields}
          initial={
            site === null
              ? {}
              : {
                  name: site.name,
                  shortCode: site.shortCode ?? '',
                  siteTypeId: site.siteTypeId,
                  takesLoads: site.takesLoads,
                  haulOutsLeaveHere: site.haulOutsLeaveHere,
                  chargesTippingFee: site.chargesTippingFee,
                  ineligibleSite: site.ineligibleSite,
                  permitNumber: site.permitNumber ?? '',
                  latitude: site.latitude,
                  longitude: site.longitude,
                  activationDate: site.activationDate,
                  closeDate: site.closeDate ?? '',
                }
          }
          save={async (values) => {
            const reply =
              site === null
                ? await api.ask(createSiteEndpoint, {
                    params: { projectId },
                    body: {
                      ...facts(values),
                      ...(optional(values, 'shortCode') === undefined
                        ? {}
                        : { shortCode: text(values, 'shortCode') }),
                      ...(optional(values, 'closeDate') === undefined
                        ? {}
                        : { closeDate: text(values, 'closeDate') }),
                    },
                  })
                : await api.ask(changeSiteEndpoint, {
                    params: { siteId: site.id },
                    body: {
                      ...facts(values),
                      shortCode: nullable(values, 'shortCode'),
                      closeDate: nullable(values, 'closeDate'),
                    },
                  });
            return reply.kind === 'answered' ? done(reply.answer) : reply;
          }}
          onClose={close}
        />
      );
    }
    const entry = entries.find((one) => one.site.id === open.entry.site.id) ?? open.entry;
    if (open.kind === 'label') {
      const held = new Set(
        entry.labels.filter((one) => !one.archived).map((one) => one.siteLabelId),
      );
      return (
        <FormDialog
          title={say(words.common.of, { what: said.addLabel, name: entry.site.name })}
          fields={[
            {
              kind: 'pick',
              key: 'siteLabelId',
              label: said.label,
              required: true,
              options: labels.filter((one) => !held.has(one.id)),
            },
          ]}
          initial={{}}
          save={async (values) => {
            const reply = await api.ask(giveSiteLabelEndpoint, {
              params: { siteId: entry.site.id, siteLabelId: picked(values, 'siteLabelId') ?? '' },
            });
            return reply.kind === 'answered' ? done(reply.answer) : reply;
          }}
          onClose={close}
        />
      );
    }
    if (open.kind === 'fee') {
      return (
        <FormDialog
          title={say(words.common.of, { what: said.linkFee, name: entry.site.name })}
          fields={[
            {
              kind: 'pick',
              key: 'payItemId',
              label: words.payItems.code,
              required: true,
              options: payItemOptions,
            },
          ]}
          initial={{}}
          save={async (values) => {
            const reply = await api.ask(linkTippingFeeEndpoint, {
              params: { siteId: entry.site.id },
              body: { payItemId: picked(values, 'payItemId') ?? '' },
            });
            return reply.kind === 'answered' ? done(reply.answer) : reply;
          }}
          onClose={close}
        />
      );
    }
    return (
      <ShapeFromFile
        projectId={projectId}
        site={entry.site}
        onSaved={(written) => {
          done(written);
          close();
        }}
        onClose={close}
      />
    );
  };

  const act = (reply: Promise<Awaited<ReturnType<typeof api.ask>>>) => {
    setFailed(null);
    void reply.then((answered) => {
      if (answered.kind === 'answered') done(answered.answer as SetupWritten);
      else setFailed(answered);
    });
  };

  return (
    <main data-screen="sites" className="page" id="content">
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      {told}
      {failed === null ? null : <Trouble reply={failed} />}
      {mayChange ? (
        <div className="page-tools">
          <Button
            main
            onPress={() => {
              setOpen({ kind: 'site', site: null });
            }}
          >
            {said.add}
          </Button>
        </div>
      ) : null}
      <Shown read={read}>
        {(answer) => (
          <>
            <Table
              caption={said.title}
              rows={answer.sites}
              keyOf={(entry) => entry.site.id}
              columns={[
                { label: said.name, names: true, cell: (entry) => entry.site.name },
                { label: said.siteType, cell: (entry) => nameIn(siteTypes, entry.site.siteTypeId) },
                { label: said.takesLoads, cell: (entry) => yesNo(entry.site.takesLoads) },
                {
                  label: said.haulOutsLeaveHere,
                  cell: (entry) => yesNo(entry.site.haulOutsLeaveHere),
                },
                {
                  label: said.chargesTippingFee,
                  cell: (entry) => yesNo(entry.site.chargesTippingFee),
                },
                { label: said.ineligibleSite, cell: (entry) => yesNo(entry.site.ineligibleSite) },
                { label: said.activation, cell: (entry) => day(entry.site.activationDate) },
                {
                  label: said.area,
                  cell: (entry) =>
                    entry.shape === null
                      ? said.circle
                      : say(said.shape, { version: entry.shape.version }),
                },
                ...(mayChange
                  ? [
                      {
                        label: words.common.actions,
                        cell: (entry: Entry) => (
                          <Button
                            onPress={() => {
                              setOpen({ kind: 'site', site: entry.site });
                            }}
                          >
                            {say(said.edit, { name: entry.site.name })}
                          </Button>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            {answer.sites.map((entry) => (
              <section
                key={entry.site.id}
                className="panel"
                aria-labelledby={`site-${entry.site.id}`}
              >
                <h2 id={`site-${entry.site.id}`}>{entry.site.name}</h2>
                <dl className="facts">
                  <dt>{said.permit}</dt>
                  <dd>{entry.site.permitNumber ?? words.common.none}</dd>
                  <dt>{said.latitude}</dt>
                  <dd>{entry.site.latitude}</dd>
                  <dt>{said.longitude}</dt>
                  <dd>{entry.site.longitude}</dd>
                  <dt>{said.close}</dt>
                  <dd>
                    {entry.site.closeDate === null ? words.common.none : day(entry.site.closeDate)}
                  </dd>
                </dl>
                <h3>{said.labels}</h3>
                <ul className="tag-list">
                  {entry.labels
                    .filter((one) => !one.archived)
                    .map((one) => (
                      <li key={one.id}>
                        {nameIn(labels, one.siteLabelId)}
                        {mayChange ? (
                          <Button
                            onPress={() => {
                              act(
                                api.ask(removeSiteLabelEndpoint, {
                                  params: { siteId: entry.site.id, siteLabelId: one.siteLabelId },
                                }),
                              );
                            }}
                          >
                            {`${words.common.remove} ${nameIn(labels, one.siteLabelId)}`}
                          </Button>
                        ) : null}
                      </li>
                    ))}
                </ul>
                <h3>{said.tippingFees}</h3>
                <ul className="tag-list">
                  {entry.tippingFees
                    .filter((one) => !one.archived)
                    .map((one) => (
                      <li key={one.id}>
                        {nameIn(payItemOptions, one.payItemId)}
                        {mayChange ? (
                          <Button
                            onPress={() => {
                              act(
                                api.ask(removeTippingFeeEndpoint, {
                                  params: { siteId: entry.site.id, payItemId: one.payItemId },
                                }),
                              );
                            }}
                          >
                            {`${words.common.remove} ${nameIn(payItemOptions, one.payItemId)}`}
                          </Button>
                        ) : null}
                      </li>
                    ))}
                </ul>
                {mayChange ? (
                  <div className="form-actions">
                    <Button
                      onPress={() => {
                        setOpen({ kind: 'label', entry });
                      }}
                    >
                      {say(words.common.of, { what: said.addLabel, name: entry.site.name })}
                    </Button>
                    <Button
                      onPress={() => {
                        setOpen({ kind: 'fee', entry });
                      }}
                    >
                      {say(words.common.of, { what: said.linkFee, name: entry.site.name })}
                    </Button>
                    <Button
                      onPress={() => {
                        setOpen({ kind: 'shape', entry });
                      }}
                    >
                      {say(words.common.of, { what: words.map.upload, name: entry.site.name })}
                    </Button>
                  </div>
                ) : null}
                <SiteLookup
                  projectId={projectId}
                  siteId={entry.site.id}
                  siteName={entry.site.name}
                />
              </section>
            ))}
            {dialog(answer.sites)}
          </>
        )}
      </Shown>
    </main>
  );
}

// What a site's phones ask for, by form, debris type and prime: the API's working-out.
function SiteLookup({
  projectId,
  siteId,
  siteName,
}: {
  readonly projectId: string;
  readonly siteId: string;
  readonly siteName: string;
}) {
  const said = words.sites;
  const [read] = useRead(siteQuantityLookupEndpoint, { params: { siteId } });
  const [project] = useRead(readProjectEndpoint, { params: { projectId } });
  const debrisTypes = useListOptions('debris-types');
  const primeName = (id: string) =>
    project.kind === 'answered'
      ? (project.answer.contractors.find((place) => place.contractorId === id)?.name ?? '…')
      : '…';
  return (
    <>
      <h3>{said.lookup}</h3>
      <p>{said.lookupAbout}</p>
      <Shown read={read}>
        {(answer) => (
          <Table
            caption={say(words.common.of, { what: said.lookup, name: siteName })}
            rows={answer.asks}
            keyOf={(ask) => `${ask.form}-${ask.debrisTypeId}-${ask.primeId}`}
            columns={[
              {
                label: said.lookupForm,
                names: true,
                cell: (ask) => words.forms.documentTypes[ask.form],
              },
              {
                label: words.forms.debrisType,
                cell: (ask) => nameIn(debrisTypes, ask.debrisTypeId),
              },
              { label: words.projectSetup.prime, cell: (ask) => primeName(ask.primeId) },
              { label: words.common.details, cell: (ask) => said.asks[ask.asks] },
            ]}
          />
        )}
      </Shown>
    </>
  );
}

// A site's shape from a map file: the file sent, what it holds shown, the layer picked.
function ShapeFromFile({
  projectId,
  site,
  onSaved,
  onClose,
}: {
  readonly projectId: string;
  readonly site: Site;
  readonly onSaved: (written: SetupWritten) => void;
  readonly onClose: () => void;
}) {
  const api = useApi();
  const said = words.map;
  const [file, setFile] = useState<{
    readonly id: string;
    readonly layers: readonly {
      readonly name: string | null;
      readonly features: number;
      readonly problem: string | null;
    }[];
  } | null>(null);
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const [reading, setReading] = useState(false);
  const fields: FieldSpec[] =
    file === null
      ? []
      : [
          {
            kind: 'pick',
            key: 'layer',
            label: said.layer,
            required: true,
            options: file.layers
              .filter((layer) => layer.problem === null)
              .map((layer, at) => ({
                id: layer.name ?? `#${String(at)}`,
                label: `${layer.name ?? said.layer} (${String(layer.features)})`,
              })),
          },
        ];
  return (
    <FormDialog
      title={say(words.common.of, { what: said.upload, name: site.name })}
      fields={fields}
      initial={{}}
      save={async (values) => {
        if (file === null) return { kind: 'refused', code: 'BAD_REQUEST', message: said.file };
        const layer = picked(values, 'layer');
        const reply = await api.ask(addSiteShapeFileEndpoint, {
          params: { siteId: site.id, mapFileId: file.id },
          body: { layer: layer === null || layer.startsWith('#') ? null : layer },
        });
        if (reply.kind !== 'answered') return reply;
        onSaved(reply.answer);
        return null;
      }}
      onClose={onClose}
    >
      <FileField
        label={said.file}
        accept=".zip,.json,.geojson,.kml"
        busy={reading}
        onFile={(chosen) => {
          setReading(true);
          setFailed(null);
          void api
            .ask(sendMapFileEndpoint, {
              params: { projectId },
              bytes: { data: chosen, type: filePartMediaType },
            })
            .then((reply) => {
              setReading(false);
              if (reply.kind === 'answered') setFile(reply.answer.record);
              else setFailed(reply);
            });
        }}
      />
      {failed === null ? null : <Trouble reply={failed} />}
    </FormDialog>
  );
}
