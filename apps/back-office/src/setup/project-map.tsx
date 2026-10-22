// A project's map (ADR-135, 141, 485, 486; ARCHITECTURE §3): its boundary and its named zones,
// loaded from a file (a zipped shapefile, GeoJSON or KML: the file is sent, what it holds is shown,
// the boundary and zone layers picked) or from an Esri feature layer. Each load is a new version;
// reconciliation attaches a zone from a ticket's GPS by the version in force then. The newest
// version is drawn here as plain lines, with the sites as points: no map tiles, so nothing leaves
// the firm's installation.
import {
  filePartMediaType,
  listMapVersionsEndpoint,
  listSitesEndpoint,
  loadEsriMapEndpoint,
  loadMapFileEndpoint,
  readMapVersionEndpoint,
  sendMapFileEndpoint,
} from '@open-adms/contracts';
import { Button, ScreenTitle } from '@open-adms/look';
import { useState } from 'react';

import type { NotAnswered } from '../api.ts';
import { FileField } from '../look/fields.tsx';
import { FormDialog, optional, picked, text, type FieldSpec } from '../look/form-dialog.tsx';
import { Table } from '../look/paged-table.tsx';
import { Shown, Trouble, useApi, useRead } from '../reading.tsx';
import { holds, useSigned } from '../session.tsx';
import { number, say, when, words } from '../words.ts';
import { useTold, type SetupWritten } from './common.tsx';

type Open = 'file' | 'esri';

export function ProjectMap({ projectId }: { readonly projectId: string }) {
  const api = useApi();
  const { session } = useSigned();
  const mayChange = holds(session, 'SETUP');
  const said = words.map;
  const [versions, reload] = useRead(listMapVersionsEndpoint, {
    params: { projectId },
    query: { limit: '50' },
  });
  const [open, setOpen] = useState<Open | null>(null);
  const [told, tell] = useTold();
  const done = (answer: SetupWritten): null => {
    tell(answer);
    reload();
    return null;
  };
  return (
    <main data-screen="project-map" className="page" id="content">
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      {told}
      {mayChange ? (
        <div className="page-tools">
          <Button
            main
            onPress={() => {
              setOpen('file');
            }}
          >
            {said.upload}
          </Button>
          <Button
            onPress={() => {
              setOpen('esri');
            }}
          >
            {said.esri}
          </Button>
        </div>
      ) : null}
      <Shown read={versions}>
        {(answer) => {
          const [newest] = answer.mapVersions;
          return (
            <>
              {newest === undefined ? (
                <p>{said.none}</p>
              ) : (
                <MapDrawing projectId={projectId} mapVersionId={newest.id} />
              )}
              <Table
                caption={said.versions}
                rows={answer.mapVersions}
                keyOf={(version) => version.id}
                columns={[
                  {
                    label: said.version,
                    names: true,
                    numeric: true,
                    cell: (version) => String(version.version),
                  },
                  { label: said.source, cell: (version) => said.sources[version.source] },
                  { label: words.common.name, cell: (version) => version.sourceName ?? '' },
                  { label: said.loadedAt, cell: (version) => when(version.loadedAt) },
                  {
                    label: said.zones,
                    cell: (version) => version.zones.map((zone) => zone.name).join(', '),
                  },
                ]}
              />
            </>
          );
        }}
      </Shown>
      {open === 'file' ? (
        <MapFromFile
          projectId={projectId}
          onSaved={(written) => {
            done(written);
            setOpen(null);
          }}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open === 'esri' ? (
        <FormDialog
          title={said.esri}
          fields={[
            {
              kind: 'text',
              key: 'boundaryLayer',
              label: said.esriBoundary,
              hint: said.esriHint,
              required: true,
              longest: 2000,
            },
            {
              kind: 'text',
              key: 'zonesLayer',
              label: said.esriZones,
              hint: said.esriHint,
              longest: 2000,
            },
            { kind: 'text', key: 'nameField', label: said.zoneNameField, longest: 200 },
            { kind: 'text', key: 'token', label: said.accessTokenLabel, longest: 4096 },
          ]}
          initial={{}}
          save={async (values) => {
            const zonesLayer = optional(values, 'zonesLayer');
            const token = optional(values, 'token');
            const reply = await api.ask(loadEsriMapEndpoint, {
              params: { projectId },
              body: {
                boundaryLayer: text(values, 'boundaryLayer'),
                zones:
                  zonesLayer === undefined
                    ? null
                    : { layer: zonesLayer, nameField: text(values, 'nameField') },
                ...(token === undefined ? {} : { token }),
              },
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

// A map version from a file: the file sent, its layers shown, the boundary and zone layers picked.
function MapFromFile({
  projectId,
  onSaved,
  onClose,
}: {
  readonly projectId: string;
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
      readonly fields: readonly string[];
      readonly problem: string | null;
    }[];
  } | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const readable = (file?.layers ?? []).filter((layer) => layer.problem === null);
  const layerOptions = readable.map((layer, at) => ({
    id: layer.name ?? `#${String(at)}`,
    label: `${layer.name ?? said.layer} (${number(layer.features)} ${said.features})`,
  }));
  const fields: FieldSpec[] =
    file === null
      ? []
      : [
          {
            kind: 'pick',
            key: 'boundaryLayer',
            label: said.boundaryLayer,
            required: true,
            options: layerOptions,
          },
          {
            kind: 'pick',
            key: 'zonesLayer',
            label: said.zonesLayer,
            options: [{ id: '', label: said.noZones }, ...layerOptions],
          },
          {
            kind: 'pick',
            key: 'nameField',
            label: said.zoneNameField,
            options: [...new Set(readable.flatMap((layer) => layer.fields))].map((field) => ({
              id: field,
              label: field,
            })),
          },
        ];
  const layerOf = (id: string | null): string | null =>
    id === null || id === '' || id.startsWith('#') ? null : id;
  return (
    <FormDialog
      title={said.upload}
      fields={fields}
      initial={{}}
      saveLabel={said.load}
      save={async (values) => {
        if (file === null) return { kind: 'refused', code: 'BAD_REQUEST', message: said.file };
        const zones = picked(values, 'zonesLayer');
        const reply = await api.ask(loadMapFileEndpoint, {
          params: { projectId, mapFileId: file.id },
          body: {
            sourceName: name,
            boundaryLayer: layerOf(picked(values, 'boundaryLayer')),
            zones:
              zones === null || zones === ''
                ? null
                : { layer: layerOf(zones), nameField: picked(values, 'nameField') ?? '' },
          },
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
          setName(chosen.name);
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
      {reading ? <p role="status">{said.uploading}</p> : null}
      {failed === null ? null : <Trouble reply={failed} />}
      {file === null ? null : (
        <Table
          caption={said.layers}
          rows={file.layers.map((layer, at) => ({ ...layer, key: String(at) }))}
          keyOf={(layer) => layer.key}
          columns={[
            { label: said.layer, names: true, cell: (layer) => layer.name ?? said.layer },
            { label: said.features, numeric: true, cell: (layer) => String(layer.features) },
            { label: said.fields, cell: (layer) => layer.fields.join(', ') },
            { label: words.common.details, cell: (layer) => layer.problem ?? '' },
          ]}
        />
      )}
    </FormDialog>
  );
}

type Ring = readonly (readonly [number, number])[];

// The rings of a GeoJSON polygon or multipolygon, as longitude and latitude pairs; none of anything
// else.
function ringsOf(geometry: unknown): Ring[] {
  if (typeof geometry !== 'object' || geometry === null) return [];
  const shape = geometry as {
    type?: unknown;
    coordinates?: unknown;
    geometry?: unknown;
    features?: unknown;
  };
  if (shape.type === 'Feature') return ringsOf(shape.geometry);
  if (shape.type === 'FeatureCollection' && Array.isArray(shape.features))
    return shape.features.flatMap(ringsOf);
  const pairs = (ring: unknown): Ring =>
    Array.isArray(ring)
      ? ring.map(
          (point) => [Number((point as number[])[0]), Number((point as number[])[1])] as const,
        )
      : [];
  if (shape.type === 'Polygon' && Array.isArray(shape.coordinates))
    return shape.coordinates.map(pairs);
  if (shape.type === 'MultiPolygon' && Array.isArray(shape.coordinates)) {
    return shape.coordinates.flatMap((polygon) =>
      Array.isArray(polygon) ? polygon.map(pairs) : [],
    );
  }
  return [];
}

// The newest map version drawn: the boundary, each zone, and the sites' points, in a drawing
// described for a screen reader by what it shows (the zones by name are in the table beneath).
function MapDrawing({
  projectId,
  mapVersionId,
}: {
  readonly projectId: string;
  readonly mapVersionId: string;
}) {
  const said = words.map;
  const [version] = useRead(readMapVersionEndpoint, { params: { mapVersionId } });
  const [sites] = useRead(listSitesEndpoint, { params: { projectId }, query: { limit: '200' } });
  if (version.kind !== 'answered') return null;
  const boundary = ringsOf(version.answer.boundary);
  const zones = version.answer.zones.map((zone) => ({
    name: zone.name,
    rings: ringsOf(zone.shape),
  }));
  const points =
    sites.kind === 'answered'
      ? sites.answer.sites.map((entry) => ({
          name: entry.site.name,
          at: [Number(entry.site.longitude), Number(entry.site.latitude)] as const,
        }))
      : [];
  const all = [
    ...boundary.flat(),
    ...zones.flatMap((zone) => zone.rings.flat()),
    ...points.map((point) => point.at),
  ];
  if (all.length === 0) return null;
  const longitudes = all.map(([longitude]) => longitude);
  const latitudes = all.map(([, latitude]) => latitude);
  const [west, east] = [Math.min(...longitudes), Math.max(...longitudes)];
  const [south, north] = [Math.min(...latitudes), Math.max(...latitudes)];
  // A degree of longitude is shorter than one of latitude away from the equator.
  const squeeze = Math.cos((((south + north) / 2) * Math.PI) / 180);
  const width = Math.max((east - west) * squeeze, 1e-6);
  const height = Math.max(north - south, 1e-6);
  const size = 1000;
  const scale = size / Math.max(width, height);
  const x = (longitude: number) => (longitude - west) * squeeze * scale;
  const y = (latitude: number) => (north - latitude) * scale;
  const path = (rings: readonly Ring[]) =>
    rings
      .map(
        (ring) =>
          ring
            .map(
              ([longitude, latitude], at) =>
                `${at === 0 ? 'M' : 'L'}${x(longitude).toFixed(1)},${y(latitude).toFixed(1)}`,
            )
            .join(' ') + ' Z',
      )
      .join(' ');
  return (
    <figure className="map-drawing">
      <svg
        viewBox={`-20 -20 ${String(width * scale + 40)} ${String(height * scale + 40)}`}
        role="img"
        aria-label={say(said.picture, { count: zones.length })}
      >
        {zones.map((zone) => (
          <path key={zone.name} className="map-zone" d={path(zone.rings)} />
        ))}
        <path className="map-boundary" d={path(boundary)} />
        {points.map((point) => (
          <circle
            key={point.name}
            className="map-site"
            cx={x(point.at[0])}
            cy={y(point.at[1])}
            r={8}
          />
        ))}
      </svg>
      <figcaption>{said.drawing}</figcaption>
    </figure>
  );
}
