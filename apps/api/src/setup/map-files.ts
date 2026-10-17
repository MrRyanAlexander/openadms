// A map's file, sent whole by the back office, and a map or a site's shape loaded from it
// (ARCHITECTURE §3 "Project boundary and zones", §6 "Uploads", §11; spec/parts/01-setup.md step
// 3 and 7; AC-01-56, AC-01-59; BACKLOG 2.6.4, C86, C100; ADR-135, 141, 142, 311, 401, 484, 485;
// KD-76). A map larger than a request's body may be comes in by a route of its own: the file
// first, read and kept; then a map version, or a site's next shape, from the layers picked.
//
// What OWASP ASVS 5.0 V5 asks of a file a caller sends, and how it is met here, as the media
// endpoint meets it: its size bounded before it is read (the route's own limit, then again
// here), and a zip's bounded again as it is unzipped (`MapFileReader`); its kind told by its own
// first bytes, never by its name; kept where the server places it, in object storage outside
// anything served as a page, never run and never handed back by any endpoint; its name never
// the caller's (the name sent is a label, `sourceName`, and names nothing).
//
// - **Who may:** an admin, or a manager/analyst who holds Setup, asked again here before the
//   file is read or kept, whatever the door already asked.
// - **Only a file that holds a shape is kept.** One the reader can't read, or with no layer that
//   is a shape, is told why and kept nowhere.
// - **A file is known by its own SHA-256 and kept once,** at `projects/<project>/maps/<SHA-256>`:
//   the same file sent again is the same file, and nothing is ever overwritten. Where something
//   is at the place already it is read back and its fingerprint checked; any other file there is
//   the server's failure, never taken as this one (T-25).
// - **A map or a shape is loaded from the file as kept,** read back from the store and its
//   fingerprint checked again, never from anything the caller sends now; through `ProjectSetup`
//   and `SiteSetup`, so the domain's `MapShapes` reads it and the tickets it moves are queued, as
//   for GeoJSON sent in a request. A map version keeps where its file is (`uploadedFileKey`), and
//   so does a site's shape (ADR-527 (10)).
// - **A KML file, or a KMZ, is a map's file too** (the user, ADR-523; ADR-527 (14)), read by the
//   same reader.
// - **An Esri feature layer is fetched by the server** (ADR-527 (15); `EsriLayers` holds the
//   request against server-side request forgery), only once the person is asked whether they may,
//   and before any database work: each layer's copy is kept as a GeoJSON map's file, at its own
//   fingerprint, and the version (or the site's shape) names the layer's address and keeps where
//   its copy is. "Refresh from Esri" fetches the layers a version names again, as a new version.
import { createHash } from 'node:crypto';

import type { Database, MapVersion, SiteAreaVersion } from '@open-adms/db';
import type { MapFileType } from '@open-adms/domain';

import type { Media } from '../media/media-store.ts';
import { Refusal } from '../process/refusal.ts';
import type { EsriLayerSource } from './esri-layers.ts';
import { MapFileReader, type MapLayer } from './map-file-reader.ts';
import type { ProjectSetup } from './project-setup.ts';
import {
  SetupService,
  type Clock,
  type Outcome,
  type Refusal as SetupRefusal,
} from './setup-service.ts';
import type { SiteSetup } from './site-setup.ts';

// Where a map's file is kept: the project's, by the file's own fingerprint.
export const mapFilePlace = (projectId: string, mapFileId: string): string =>
  `projects/${projectId.toLowerCase()}/maps/${mapFileId}`;

export interface MapFileLayer {
  readonly name: string | null;
  readonly features: number;
  readonly fields: readonly string[];
  readonly problem: string | null;
}

// A map's file as it was read when it was sent: never where it is kept.
export interface MapFileSent {
  readonly id: string;
  readonly type: MapFileType;
  readonly bytes: number;
  readonly layers: readonly MapFileLayer[];
}

export interface MapFromFile {
  // The file's name, as the person knows it.
  readonly sourceName: string | null;
  // None: the file's only layer.
  readonly boundaryLayer: string | null;
  readonly zones: { readonly layer: string | null; readonly nameField: string } | null;
}

export interface MapFileParts {
  readonly media: Media;
  // Its reading: apart from the API's own work where the process reads (ADR-548).
  readonly reader: Pick<MapFileReader, 'read'>;
  readonly fileBytesAtMost: number;
  readonly projects: ProjectSetup;
  readonly sites: SiteSetup;
  readonly esri: EsriLayerSource;
}

// A project's map from Esri feature layers: the boundary's, and the zones' (the same or another)
// with the field that names them.
export interface MapFromEsri {
  readonly boundaryLayer: string;
  readonly zones: { readonly layer: string; readonly nameField: string } | null;
  // A secured layer's token: used for this fetch alone, never kept.
  readonly token: string | undefined;
}

const fingerprintOf = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

// A layer fetched from Esri: what it holds, and where its copy is kept.
interface FetchedLayer {
  readonly geojson: unknown;
  readonly place: string;
}

const refused = (code: string, message: string): Outcome<never> => ({
  saved: false,
  refusal: { code, message } satisfies SetupRefusal,
});

export class MapFiles extends SetupService {
  private readonly media: Media;
  private readonly reader: Pick<MapFileReader, 'read'>;
  private readonly fileBytesAtMost: number;
  private readonly projects: ProjectSetup;
  private readonly sites: SiteSetup;
  private readonly esri: EsriLayerSource;

  constructor(db: Database, clock: Clock, parts: MapFileParts) {
    super(db, clock);
    this.media = parts.media;
    this.reader = parts.reader;
    this.fileBytesAtMost = parts.fileBytesAtMost;
    this.projects = parts.projects;
    this.sites = parts.sites;
    this.esri = parts.esri;
  }

  // A map's file for a project: read, and kept once where the server places it, only when it
  // holds a layer that is a shape. Nothing is loaded yet.
  async send(person: string, projectId: string, bytes: Uint8Array): Promise<Outcome<MapFileSent>> {
    if (bytes.byteLength > this.fileBytesAtMost) {
      throw new Refusal(
        'TOO_LARGE',
        413,
        `Not taken: a map’s file is at most ${String(this.fileBytesAtMost)} bytes.`,
      );
    }
    if (MapFileReader.typeOf(bytes) === null) {
      throw new Refusal(
        'UNSUPPORTED_MEDIA_TYPE',
        415,
        'Not taken: a map’s file is a zipped shapefile, a GeoJSON file or a KML file.',
      );
    }
    // Who may, and that the project is there, before the file is read or kept.
    const asked = await this.setup(person, (tx) =>
      tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true } }),
    );
    if (!asked.saved) return asked;
    const reading = await this.reader.read(bytes);
    if (reading.read === null) return refused('MAP_FILE_NOT_READ', `Not kept: ${reading.problem}`);
    const { type, layers } = reading.read;
    const shaped = layers.find((layer) => layer.problem === null);
    if (shaped === undefined) {
      const [first] = layers;
      return refused(
        'MAP_FILE_NOT_READ',
        `Not kept: no layer of the file is a shape. ${first?.name ?? 'The file'}: ${first?.problem ?? ''}`,
      );
    }
    const id = fingerprintOf(bytes);
    await this.kept(projectId, bytes, type);
    return {
      saved: true,
      record: {
        id,
        type,
        bytes: bytes.byteLength,
        layers: layers.map(({ name, features, fields, problem }) => ({
          name,
          features,
          fields,
          problem,
        })),
      },
      warnings: [],
    };
  }

  // The project's map from a file sent before, as its next version, with the file kept beside it.
  async loadMap(
    person: string,
    projectId: string,
    mapFileId: string,
    input: MapFromFile,
  ): Promise<Outcome<MapVersion>> {
    const place = mapFilePlace(projectId, mapFileId);
    const layers = await this.layersAt(place, mapFileId);
    const boundary = MapFiles.picked(layers, input.boundaryLayer);
    if (typeof boundary === 'string') return refused('MAP_NOT_READ', `Not loaded: ${boundary}`);
    const zones = input.zones === null ? null : MapFiles.picked(layers, input.zones.layer);
    if (typeof zones === 'string') return refused('MAP_NOT_READ', `Not loaded: ${zones}`);
    return this.projects.loadMap(person, {
      projectId,
      source: 'UPLOAD',
      sourceName: input.sourceName,
      boundary: boundary.geojson,
      zones: zones?.geojson ?? null,
      zoneNameField: input.zones?.nameField ?? null,
      uploadedFileKey: place,
    });
  }

  // The project's map from Esri feature layers, as its next version (ADR-527 (15)): each layer
  // fetched once, its copy kept, the version naming the layers' addresses.
  async loadEsriMap(
    person: string,
    projectId: string,
    input: MapFromEsri,
  ): Promise<Outcome<MapVersion>> {
    const asked = await this.setup(person, (tx) =>
      tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true } }),
    );
    if (!asked.saved) return asked;
    const boundary = await this.fetched(projectId, input.boundaryLayer, input.token);
    if ('refusal' in boundary) return boundary.refusal;
    let zones: { layer: FetchedLayer; nameField: string } | null = null;
    if (input.zones !== null) {
      const layer =
        input.zones.layer === input.boundaryLayer
          ? boundary
          : await this.fetched(projectId, input.zones.layer, input.token);
      if ('refusal' in layer) return layer.refusal;
      zones = { layer, nameField: input.zones.nameField };
    }
    return this.projects.loadMap(person, {
      projectId,
      source: 'ESRI_LAYER',
      sourceName: input.boundaryLayer,
      boundary: boundary.geojson,
      zones: zones?.layer.geojson ?? null,
      zoneNameField: zones?.nameField ?? null,
      uploadedFileKey: boundary.place,
      ...(zones === null || input.zones === null
        ? {}
        : { zonesSourceName: input.zones.layer, zonesFileKey: zones.layer.place }),
    });
  }

  // "Refresh from Esri": the layers a version fetched from Esri names, fetched again as the
  // project's next version. The version itself never changes.
  async refreshEsriMap(
    person: string,
    mapVersionId: string,
    token: string | undefined,
  ): Promise<Outcome<MapVersion>> {
    const version = await this.db.$read((tx) =>
      tx.mapVersion.findUnique({ where: { id: mapVersionId } }),
    );
    if (version === null) throw new Refusal('NOT_FOUND', 404);
    if (version.source !== 'ESRI_LAYER' || version.sourceName === null) {
      const asked = await this.setup(person, () => Promise.resolve(null));
      if (!asked.saved) return asked;
      return refused(
        'NOT_FROM_ESRI',
        'Not refreshed: this version wasn’t fetched from an Esri layer. Load the map again from its file.',
      );
    }
    return this.loadEsriMap(person, version.projectId, {
      boundaryLayer: version.sourceName,
      zones:
        version.zonesSourceName === null || version.zoneNameField === null
          ? null
          : { layer: version.zonesSourceName, nameField: version.zoneNameField },
      token,
    });
  }

  // A site's own shape from an Esri feature layer, as its next version.
  async esriSiteShape(
    person: string,
    siteId: string,
    layer: string,
    token: string | undefined,
  ): Promise<Outcome<SiteAreaVersion>> {
    const site = await this.db.$read((tx) =>
      tx.disposalSite.findUnique({ where: { id: siteId }, select: { projectId: true } }),
    );
    if (site === null) throw new Refusal('NOT_FOUND', 404);
    const asked = await this.setup(person, () => Promise.resolve(null));
    if (!asked.saved) return asked;
    const shape = await this.fetched(site.projectId, layer, token, 'SITE_SHAPE_NOT_READ');
    if ('refusal' in shape) return shape.refusal;
    return this.sites.shape(person, siteId, {
      source: 'ESRI_LAYER',
      shape: shape.geojson,
      sourceName: layer,
      uploadedFileKey: shape.place,
    });
  }

  // One Esri layer, fetched, read as a map's file is, and its copy kept; or why not.
  private async fetched(
    projectId: string,
    address: string,
    token: string | undefined,
    notRead = 'MAP_NOT_READ',
  ): Promise<FetchedLayer | { refusal: Outcome<never> }> {
    const fetched = await this.esri.fetch(address, token);
    if (fetched.fetched === null) {
      return { refusal: refused('ESRI_LAYER_REFUSED', `Not fetched: ${fetched.problem}`) };
    }
    const reading = await this.reader.read(fetched.fetched);
    const [layer] = reading.read?.layers ?? [];
    if (layer === undefined || layer.geojson === null || layer.problem !== null) {
      return {
        refusal: refused(
          notRead,
          `Not loaded: the layer ${address}: ${layer?.problem ?? reading.problem ?? 'it holds no shape.'}`,
        ),
      };
    }
    const place = await this.kept(projectId, fetched.fetched, 'application/geo+json');
    return { geojson: layer.geojson, place };
  }

  // A map's file kept once where the server places it, by its own fingerprint; where something
  // is there already, it is read back and its fingerprint checked.
  private async kept(projectId: string, bytes: Uint8Array, type: MapFileType): Promise<string> {
    const id = fingerprintOf(bytes);
    const place = mapFilePlace(projectId, id);
    if ((await this.media.keep(place, bytes, type)) === 'ALREADY_THERE') {
      const there = await this.media.read(place, bytes.byteLength);
      if (there === null || fingerprintOf(there.bytes) !== id) {
        throw new Error('The store holds another file where a map’s file was to be kept.');
      }
    }
    return place;
  }

  // A site's own shape from a file sent before for its project, as its next version.
  async siteShape(
    person: string,
    siteId: string,
    mapFileId: string,
    layer: string | null,
  ): Promise<Outcome<SiteAreaVersion>> {
    const site = await this.db.$read((tx) =>
      tx.disposalSite.findUnique({ where: { id: siteId }, select: { projectId: true } }),
    );
    if (site === null) throw new Refusal('NOT_FOUND', 404);
    const place = mapFilePlace(site.projectId, mapFileId);
    const layers = await this.layersAt(place, mapFileId);
    const shape = MapFiles.picked(layers, layer);
    if (typeof shape === 'string') return refused('SITE_SHAPE_NOT_READ', `Not saved: ${shape}`);
    return this.sites.shape(person, siteId, {
      source: 'UPLOAD',
      shape: shape.geojson,
      uploadedFileKey: place,
    });
  }

  // The layers of a file as it was kept, its fingerprint checked again; none kept there, and
  // the project has no such file.
  private async layersAt(place: string, mapFileId: string): Promise<readonly MapLayer[]> {
    const kept = await this.media.read(place, this.fileBytesAtMost);
    if (kept === null) {
      throw new Refusal('NOT_FOUND', 404, 'Not found: the project has no such map’s file.');
    }
    if (fingerprintOf(kept.bytes) !== mapFileId) {
      throw new Error('The store holds another file where a map’s file was kept.');
    }
    const reading = await this.reader.read(kept.bytes);
    if (reading.read === null) {
      throw new Error('A map’s file that was read when it was kept can’t be read again.');
    }
    return reading.read.layers;
  }

  // The layer named, or the file's only one; or why there is none to load.
  private static picked(layers: readonly MapLayer[], name: string | null): MapLayer | string {
    const [only] = layers;
    if (name === null) {
      if (layers.length === 1 && only !== undefined) return MapFiles.readable(only);
      return `the file holds ${String(layers.length)} layers: name the one to load.`;
    }
    const layer = layers.find((each) => each.name === name);
    return layer === undefined ? `the file holds no layer ${name}.` : MapFiles.readable(layer);
  }

  private static readable(layer: MapLayer): MapLayer | string {
    return layer.geojson === null ? `${layer.name ?? 'The file'}: ${layer.problem ?? ''}` : layer;
  }
}
