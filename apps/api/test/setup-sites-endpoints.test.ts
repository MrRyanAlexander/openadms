// Setup's endpoints, steps 3, 4 and 7 and the setup as it stands, against the database
// (spec/parts/01-setup.md; ARCHITECTURE §6; acceptance file 01, AC-01-21 and sections F and H;
// file 10, AC-10-27; BACKLOG 2.4.2, C97, C98, C99; ADR-321, 422, 423, 426): a contractor merged
// into another; disposal sites, a site's own shape and its tipping fee pay item; the project's
// map; the setup check and what each site's phones ask for. OWASP ASVS 5.0 V2, V8, V16. The real
// process, in this test's own memory, on the installation's database as `adms_api`: it needs
// `pnpm local:up` after `pnpm installer`, and fails saying so. Each test's work is undone
// (support/database.ts). A refusal by the database ends the test's one piece of work, so each
// such test makes its refused request last. Who may call each endpoint that takes Setup is
// setup-endpoints.test.ts's, which holds them all; who may ask the setup as it stands is here.
import {
  addFormDebrisTypeEndpoint,
  addSiteShapeEndpoint,
  backOfficeRoles,
  changePayItemEndpoint,
  changeSiteEndpoint,
  createSiteEndpoint,
  linkTippingFeeEndpoint,
  loadMapEndpoint,
  mergeContractorEndpoint,
  quantityLookupEndpoint,
  savePaysWhenEndpoint,
  setupCheckEndpoint,
  siteQuantityLookupEndpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { danasEmail, long, longer, luissEmail, worldOn, type Served } from './support/served.ts';
import {
  ask,
  notSaved,
  p1Priced,
  plainly,
  saved,
  told,
  viewerSignsIn,
  type Browser,
} from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

// A rectangle as GeoJSON, west to east and south to north.
const rectangle = (west: number, south: number, east: number, north: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ],
});

// P1's sites as its contract has them (spec/CONVENTIONS.md §6), each entered through the endpoint.
async function p1Sites(api: Served, dana: Browser, tx: Tx) {
  const priced = await p1Priced(api, dana, tx);
  const siteType = async (key: string) =>
    (await tx.siteType.findUniqueOrThrow({ where: { key } })).id;
  const types = { tdsr: await siteType('TDSR'), finalDisposal: await siteType('FINAL_DISPOSAL') };
  const landfill = {
    name: 'Bayline County Landfill',
    shortCode: 'BCL',
    siteTypeId: types.finalDisposal,
    takesLoads: true,
    haulOutsLeaveHere: false,
    chargesTippingFee: true,
    ineligibleSite: false,
    permitNumber: 'FDEP-SW-2019-0442',
    latitude: '39.12',
    longitude: '-75.7',
    activationDate: '2026-10-12',
  };
  const marshRoad = {
    name: 'Marsh Road TDSR',
    siteTypeId: types.tdsr,
    takesLoads: true,
    haulOutsLeaveHere: true,
    chargesTippingFee: false,
    ineligibleSite: false,
    // Permit outstanding (ADR-111).
    permitNumber: null,
    latitude: '39.09000000',
    longitude: '-75.62000000',
    activationDate: '2026-10-12',
  };
  const enter = (payload: object) =>
    ask(api, dana, createSiteEndpoint, { ids: priced.ids, payload });
  return { ...priced, types, landfill, marshRoad, enter };
}

describe('step 7: Dana enters P1’s disposal sites through the endpoints', () => {
  it('AC-01-53, 55 Bayline County Landfill holds its site type, the four site facts, its GPS as exact decimals, its dates, its permit and its short code BCL, audited with her as the actor; Marsh Road TDSR with no permit number is saved all the same; each answer says what it queued', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const { project, types, landfill, marshRoad, enter } = await p1Sites(api, dana, tx);
      const answer = await enter(landfill);
      const entered = saved(createSiteEndpoint, answer);
      expect(entered.record).toEqual({
        id: entered.record.id,
        projectId: project.id,
        name: 'Bayline County Landfill',
        shortCode: 'BCL',
        siteTypeId: types.finalDisposal,
        takesLoads: true,
        haulOutsLeaveHere: false,
        chargesTippingFee: true,
        ineligibleSite: false,
        permitNumber: 'FDEP-SW-2019-0442',
        latitude: '39.12000000',
        longitude: '-75.70000000',
        activationDate: '2026-10-12',
        closeDate: null,
        archived: false,
      });
      // No ticket is at a new site: one job, naming none, for the site's own flag.
      expect([entered.warnings, entered.queued?.jobs.length, entered.queued?.tickets]).toEqual([
        [],
        1,
        0,
      ]);
      expect(
        await tx.auditRecord.findMany({
          where: { requestId: answer.requestId, tableName: 'disposal_site' },
          select: { operation: true, actorId: true, source: true, recordId: true },
        }),
      ).toEqual([
        {
          operation: 'INSERT',
          actorId: who.dana,
          source: 'BACK_OFFICE',
          recordId: entered.record.id,
        },
      ]);
      const tdsr = saved(createSiteEndpoint, await enter(marshRoad)).record;
      expect([tdsr.permitNumber, tdsr.shortCode, tdsr.haulOutsLeaveHere]).toEqual([
        null,
        null,
        true,
      ]);
      // A site fact left out, a coordinate that isn't an exact decimal, a date that isn't a day
      // and a field nobody named are refused by the schema.
      const oneFactShort = Object.fromEntries(
        Object.entries(landfill).filter(([fact]) => fact !== 'takesLoads'),
      );
      for (const payload of [
        oneFactShort,
        { ...landfill, latitude: 39.12 },
        { ...landfill, longitude: '75.7 W' },
        { ...landfill, activationDate: '12 Oct 2026' },
        { ...landfill, siteTypeKey: 'TDSR' },
      ]) {
        expect(told(await enter(payload))).toEqual([400, 'BAD_REQUEST']);
      }
      // A site type nobody has is not found.
      expect(told(await enter({ ...landfill, siteTypeId: project.id }))).toEqual([
        404,
        'NOT_FOUND',
      ]);
      expect(await tx.disposalSite.count({ where: { projectId: project.id } })).toBe(2);
    });
  });

  it('AC-01-54 "Haul-outs leave here" on Bayline County Landfill, a Final Disposal site, is not saved and she is told why; on Marsh Road TDSR it is, and its type can’t change away from TDSR/DMS while it is ticked', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { project, types, landfill, marshRoad, enter } = await p1Sites(api, dana, tx);
      expect(notSaved(await enter({ ...landfill, haulOutsLeaveHere: true }))).toEqual([
        'HAUL_OUTS_ONLY_FROM_TDSR',
        'Bayline County Landfill is a Final Disposal site: only a TDSR/DMS site can be marked Haul-outs leave here. A haul-out is reduced debris leaving a TDSR.',
      ]);
      expect(await tx.disposalSite.count({ where: { projectId: project.id } })).toBe(0);
      const tdsr = saved(createSiteEndpoint, await enter(marshRoad)).record;
      const ids = { siteId: tdsr.id };
      expect(
        notSaved(
          await ask(api, dana, changeSiteEndpoint, {
            ids,
            payload: { siteTypeId: types.finalDisposal },
          }),
        ),
      ).toEqual([
        'HAUL_OUTS_ONLY_FROM_TDSR',
        'Marsh Road TDSR is marked Haul-outs leave here, so it stays a TDSR/DMS site. Untick Haul-outs leave here before changing its type.',
      ]);
      // Unticked in the same change, the type may go.
      const changed = saved(
        changeSiteEndpoint,
        await ask(api, dana, changeSiteEndpoint, {
          ids,
          payload: { siteTypeId: types.finalDisposal, haulOutsLeaveHere: false },
        }),
      ).record;
      expect([changed.siteTypeId, changed.haulOutsLeaveHere]).toEqual([types.finalDisposal, false]);
    });
  });

  it('a site is changed: its permit number comes in, its GPS is corrected, its short code is emptied and it is given a close date, each audited with the value before; nothing stated, or a site nobody has, changes nothing; a close date before its activation is told plainly', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const { landfill, marshRoad, enter } = await p1Sites(api, dana, tx);
      const tdsr = saved(createSiteEndpoint, await enter(marshRoad)).record;
      const bcl = saved(createSiteEndpoint, await enter(landfill)).record;
      const answer = await ask(api, dana, changeSiteEndpoint, {
        ids: { siteId: tdsr.id },
        payload: { permitNumber: 'FDEP-DMS-2026-0117', latitude: '39.0905' },
      });
      const changed = saved(changeSiteEndpoint, answer);
      expect(changed.record).toEqual({
        ...tdsr,
        permitNumber: 'FDEP-DMS-2026-0117',
        latitude: '39.09050000',
      });
      expect([changed.queued?.jobs.length, changed.queued?.tickets]).toEqual([1, 0]);
      const [audited] = await tx.auditRecord.findMany({
        where: { requestId: answer.requestId, tableName: 'disposal_site' },
      });
      expect([audited?.operation, audited?.actorId, audited?.changedFields.sort()]).toEqual([
        'UPDATE',
        who.dana,
        ['latitude', 'permit_number'],
      ]);
      expect(audited?.priorValue).toMatchObject({ permit_number: null, latitude: 39.09 });
      const closed = saved(
        changeSiteEndpoint,
        await ask(api, dana, changeSiteEndpoint, {
          ids: { siteId: bcl.id },
          payload: { shortCode: null, activationDate: '2026-10-10', closeDate: '2026-12-18' },
        }),
      ).record;
      expect([closed.shortCode, closed.activationDate, closed.closeDate]).toEqual([
        null,
        '2026-10-10',
        '2026-12-18',
      ]);
      const reopened = saved(
        changeSiteEndpoint,
        await ask(api, dana, changeSiteEndpoint, {
          ids: { siteId: bcl.id },
          payload: { closeDate: null },
        }),
      ).record;
      expect(reopened.closeDate).toBeNull();
      expect(
        told(await ask(api, dana, changeSiteEndpoint, { ids: { siteId: bcl.id }, payload: {} })),
      ).toEqual([400, 'BAD_REQUEST']);
      expect(
        told(await ask(api, dana, changeSiteEndpoint, { payload: { name: 'Cypress Creek' } })),
      ).toEqual([404, 'NOT_FOUND']);
      const refused = await ask(api, dana, changeSiteEndpoint, {
        ids: { siteId: bcl.id },
        payload: { closeDate: '2026-10-01' },
      });
      expect(told(refused)).toEqual([422, 'REFUSED_BY_THE_DATABASE']);
      expect(plainly(refused)).toBe('Not saved: the site closes before it is activated.');
    });
  });

  it('a latitude past the pole is the database’s to refuse, and it is told plainly', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { landfill, enter } = await p1Sites(api, dana, tx);
      const refused = await enter({ ...landfill, latitude: '91' });
      expect(told(refused)).toEqual([422, 'REFUSED_BY_THE_DATABASE']);
      expect(plainly(refused)).toBe(
        'Not saved: a latitude is from -90 to 90 and a longitude from -180 to 180.',
      );
    });
  });

  it('AC-01-56 Dana draws Marsh Road TDSR its own shape: version 1, hers; a later shape is version 2 and the first is still there; what isn’t a shape is not saved, and she is told why', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const { marshRoad, enter } = await p1Sites(api, dana, tx);
      const tdsr = saved(createSiteEndpoint, await enter(marshRoad)).record;
      const ids = { siteId: tdsr.id };
      const draw = (payload: object) => ask(api, dana, addSiteShapeEndpoint, { ids, payload });
      const first = saved(
        addSiteShapeEndpoint,
        await draw({ source: 'DRAWN', shape: rectangle(-75.622, 39.088, -75.618, 39.092) }),
      );
      expect(first.record).toMatchObject({ siteId: tdsr.id, version: 1, source: 'DRAWN' });
      expect(first.queued?.tickets).toBe(0);
      expect(
        notSaved(
          await draw({ source: 'UPLOAD', shape: { type: 'Point', coordinates: [-75.62, 39.09] } }),
        )[0],
      ).toBe('SITE_SHAPE_NOT_READ');
      // A Feature with the map's own properties is read for its shape alone.
      const second = saved(
        addSiteShapeEndpoint,
        await draw({
          source: 'UPLOAD',
          shape: {
            type: 'Feature',
            properties: { SITE: 'Marsh Rd', acres: 11.5 },
            geometry: rectangle(-75.623, 39.088, -75.618, 39.092),
          },
        }),
      );
      expect(second.record.version).toBe(2);
      expect(
        (
          await tx.siteAreaVersion.findMany({
            where: { siteId: tdsr.id },
            orderBy: { version: 'asc' },
          })
        ).map((version) => [
          version.version,
          version.source,
          version.createdById === who.dana,
          version.westLongitude.toFixed(3),
        ]),
      ).toEqual([
        [1, 'DRAWN', true, '-75.622'],
        [2, 'UPLOAD', true, '-75.623'],
      ]);
      for (const payload of [
        { source: 'SURVEYED', shape: rectangle(-75.622, 39.088, -75.618, 39.092) },
        { source: 'DRAWN' },
      ]) {
        expect(told(await draw(payload))).toEqual([400, 'BAD_REQUEST']);
      }
      expect(
        told(
          await ask(api, dana, addSiteShapeEndpoint, {
            payload: { source: 'DRAWN', shape: rectangle(-75.622, 39.088, -75.618, 39.092) },
          }),
        ),
      ).toEqual([404, 'NOT_FOUND']);
    });
  });

  it('AC-01-57 Bayline County Landfill keeps the link to its tipping fee pay item TIP-FEE-CY-BCL, and to a second, TIP-FEE-TN-BCL; the same pay item linked twice is told plainly', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { project, landfill, enter, payItem, payableType } = await p1Sites(api, dana, tx);
      const bcl = saved(createSiteEndpoint, await enter(landfill)).record;
      const fee = async (code: string, unit: string) =>
        (
          (
            await payItem({
              code,
              description: 'Tipping fee, Bayline County Landfill',
              payableTypeId: await payableType('Tipping fee'),
              unit,
              rates: [],
            })
          ).body as { record: { id: string } }
        ).record.id;
      const link = (payItemId: string) =>
        ask(api, dana, linkTippingFeeEndpoint, { ids: { siteId: bcl.id }, payload: { payItemId } });
      const perCy = await fee('TIP-FEE-CY-BCL', 'CY');
      const first = saved(linkTippingFeeEndpoint, await link(perCy));
      expect(first.record).toEqual({
        id: first.record.id,
        projectId: project.id,
        siteId: bcl.id,
        payItemId: perCy,
        archived: false,
      });
      saved(linkTippingFeeEndpoint, await link(await fee('TIP-FEE-TN-BCL', 'TN')));
      expect(await tx.disposalSiteTippingFee.count({ where: { siteId: bcl.id } })).toBe(2);
      const twice = await link(perCy);
      expect(told(twice)).toEqual([409, 'ALREADY_HELD']);
      expect(plainly(twice)).toBe('Not saved: the site is already linked to that pay item.');
    });
  });
});

describe('step 3: Dana loads P1’s map through the endpoint', () => {
  it('AC-01-59 its boundary and three zones are map version 1, loaded by her; a corrected map is version 2 and version 1 is still there with its zones; a map whose zones can’t be read is not loaded, and she is told why', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const { project, ids } = await p1Priced(api, dana, tx);
      const zones = (line: number) => ({
        type: 'FeatureCollection',
        features: [
          ['Zone 1', -75.8, -75.67] as const,
          ['Zone 2', -75.67, line] as const,
          ['Zone 3', line, -75.4] as const,
        ].map(([name, west, east]) => ({
          type: 'Feature',
          properties: { ZONE_NAME: name },
          geometry: rectangle(west, 38.9, east, 39.3),
        })),
      });
      const map = {
        source: 'UPLOAD',
        sourceName: 'bayline-row-zones-v1.geojson',
        boundary: rectangle(-75.8, 38.9, -75.4, 39.3),
        zones: zones(-75.53),
        zoneNameField: 'ZONE_NAME',
      };
      const load = (payload: object) => ask(api, dana, loadMapEndpoint, { ids, payload });
      expect(notSaved(await load({ ...map, zoneNameField: 'NAME' }))).toEqual([
        'MAP_NOT_READ',
        'Not loaded: A zone has no name in the field NAME.',
      ]);
      expect(await tx.mapVersion.count({ where: { projectId: project.id } })).toBe(0);
      const first = saved(loadMapEndpoint, await load(map));
      expect(first.record).toMatchObject({
        projectId: project.id,
        version: 1,
        source: 'UPLOAD',
        sourceName: 'bayline-row-zones-v1.geojson',
        zoneNameField: 'ZONE_NAME',
      });
      expect(first.queued?.tickets).toBe(0);
      const second = saved(
        loadMapEndpoint,
        await load({
          ...map,
          sourceName: 'bayline-row-zones-v2.geojson',
          zones: zones(-75.56),
        }),
      );
      expect(second.record.version).toBe(2);
      // A map with a boundary and no zones is a map.
      const third = saved(
        loadMapEndpoint,
        await load({ ...map, sourceName: null, source: 'DRAWN', zones: null, zoneNameField: null }),
      );
      expect([third.record.version, third.record.zoneNameField]).toEqual([3, null]);
      expect(
        (
          await tx.mapVersion.findMany({
            where: { projectId: project.id },
            orderBy: { version: 'asc' },
            include: { zones: { orderBy: { name: 'asc' } } },
          })
        ).map((version) => [
          version.version,
          version.loadedById === who.dana,
          version.zones.map((zone) => `${zone.name} to ${zone.eastLongitude.toFixed(2)}`),
        ]),
      ).toEqual([
        [1, true, ['Zone 1 to -75.67', 'Zone 2 to -75.53', 'Zone 3 to -75.40']],
        [2, true, ['Zone 1 to -75.67', 'Zone 2 to -75.56', 'Zone 3 to -75.40']],
        [3, true, []],
      ]);
      for (const payload of [
        { ...map, source: 'SHAPEFILE' },
        { source: 'UPLOAD', sourceName: null, boundary: map.boundary },
        { ...map, projection: 'EPSG:4326' },
      ]) {
        expect(told(await load(payload))).toEqual([400, 'BAD_REQUEST']);
      }
    });
  });
});

describe('step 4: a sub typed twice at certification is merged through the endpoint', () => {
  it('AC-01-21 "Rivera Trucking Inc" is merged into "Rivera Trucking": it is archived, pointing at the one kept, its place on P1 taken off, each row audited with Dana as the actor and nothing deleted; merged again, into itself, or a prime merged, it is not saved and she is told why', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const { project, coastline, contractor } = await p1Priced(api, dana, tx);
      const kept = await contractor('Rivera Trucking');
      const typedAgain = await contractor('Rivera Trucking Inc');
      // As certifying a truck places the sub it was typed with (ADR-108): tier 1 under Coastline.
      for (const contractorId of [kept, typedAgain]) {
        await tx.projectContractor.create({
          data: {
            projectId: project.id,
            contractorId,
            position: 'SUB_TIER_1',
            primeId: coastline,
          },
        });
      }
      const merge = (duplicate: string, into: string) =>
        ask(api, dana, mergeContractorEndpoint, {
          ids: { contractorId: duplicate },
          payload: { intoContractorId: into },
        });
      expect(notSaved(await merge(kept, kept))).toEqual([
        'MERGE_INTO_ITSELF',
        'Not merged: Rivera Trucking can’t be merged into itself.',
      ]);
      expect(notSaved(await merge(coastline, kept))[0]).toBe('MERGE_OF_A_PRIME');
      const answer = await merge(typedAgain, kept);
      const merged = saved(mergeContractorEndpoint, answer);
      expect(merged.record).toMatchObject({
        id: typedAgain,
        name: 'Rivera Trucking Inc',
        mergedIntoId: kept,
        archived: true,
      });
      // No certification named it: nothing to queue, and the answer says so by saying nothing.
      expect(merged.queued).toBeUndefined();
      expect(
        (
          await tx.auditRecord.findMany({
            where: { requestId: answer.requestId },
            select: { tableName: true, operation: true, actorId: true },
            orderBy: { id: 'asc' },
          })
        ).map((record) => [record.tableName, record.operation, record.actorId === who.dana]),
      ).toEqual([
        ['project_contractor', 'UPDATE', true],
        ['contractor', 'UPDATE', true],
      ]);
      expect(
        (
          await tx.projectContractor.findMany({
            where: { projectId: project.id, position: 'SUB_TIER_1' },
            orderBy: { id: 'asc' },
          })
        ).map((place) => [place.contractorId === kept, place.archivedAt === null]),
      ).toEqual([
        [true, true],
        [false, false],
      ]);
      expect(notSaved(await merge(typedAgain, kept))).toEqual([
        'MERGE_ALREADY_MERGED',
        'Not merged: Rivera Trucking Inc was already merged into another contractor.',
      ]);
      expect(notSaved(await merge(kept, typedAgain))[0]).toBe('MERGE_INTO_ARCHIVED');
      // A contractor nobody has is not found; a body that names no contractor is refused.
      expect(told(await merge(project.id, kept))).toEqual([404, 'NOT_FOUND']);
      expect(
        told(
          await ask(api, dana, mergeContractorEndpoint, {
            ids: { contractorId: kept },
            payload: { into: typedAgain },
          }),
        ),
      ).toEqual([400, 'BAD_REQUEST']);
      expect(await tx.contractor.count({ where: { name: { startsWith: 'Rivera' } } })).toBe(2);
    });
  });
});

describe('the setup as it stands', () => {
  const standing = [setupCheckEndpoint, quantityLookupEndpoint, siteQuantityLookupEndpoint];

  it('AC-10-27 the setup check and the lookups are open to an admin and to a manager/analyst, with or without Setup; nobody not signed in and no read-only viewer is answered', async () => {
    await world(async (api, tx, who, within) => {
      for (const served of standing) {
        const { name, access, roles, method } = served;
        expect([name, access, roles, 'permission' in served, method]).toEqual([
          name,
          'SIGNED_IN',
          backOfficeRoles,
          false,
          'GET',
        ]);
      }
      const dana = await api.signedIn(danasEmail, long);
      const { ids, marshRoad, enter } = await p1Sites(api, dana, tx);
      const tdsr = saved(createSiteEndpoint, await enter(marshRoad)).record;
      const luis = await api.signedIn(luissEmail, longer);
      const viewer = await viewerSignsIn(api, tx, who.viewer, within);
      for (const served of standing) {
        const more = { ids: { ...ids, siteId: tdsr.id } };
        expect(told(await ask(api, undefined, served, more)), served.name).toEqual([
          401,
          'NOT_SIGNED_IN',
        ]);
        expect(told(await ask(api, viewer, served, more)), served.name).toEqual([
          403,
          'NOT_ALLOWED',
        ]);
        for (const signed of [dana, luis]) {
          expect(told(await ask(api, signed, served, more)), served.name).toEqual([200, undefined]);
        }
        // A project or a site nobody has is not found, never an empty answer.
        expect(told(await ask(api, luis, served)), served.name).toEqual([404, 'NOT_FOUND']);
        // Nothing more is taken: a query sent anyway is refused.
        expect(
          told(await ask(api, luis, served, { ...more, query: '?archived=true' })),
          served.name,
        ).toEqual([400, 'BAD_REQUEST']);
      }
    });
  });

  it('AC-01-70, 71 the setup check lists Bayline County Landfill, ticked "Charges a tipping fee" with no fee pay item linked, and Vegetative, which no rule of the load form pays; the pay item linked and "Pays when" saved, it lists neither, and nothing was kept between the two asks', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { ids, forms, landfill, enter, debrisType, payItem, payableType, veg15 } =
        await p1Sites(api, dana, tx);
      const check = async () =>
        saved(setupCheckEndpoint, await ask(api, dana, setupCheckEndpoint, { ids })).gaps;
      expect(await check()).toEqual([]);
      const bcl = saved(createSiteEndpoint, await enter(landfill)).record;
      const vegetative = saved(
        addFormDebrisTypeEndpoint,
        await ask(api, dana, addFormDebrisTypeEndpoint, {
          ids: { formId: forms.load },
          payload: {
            debrisTypeId: await debrisType('Vegetative'),
            reduced: false,
            hiddenOnPhones: false,
          },
        }),
      ).record;
      const open = await check();
      expect(open.map((gap) => [gap.code, gap.siteId, gap.debrisTypeId])).toEqual([
        ['TIPPING_FEE_SITE_NO_PAY_ITEM', bcl.id, null],
        ['DEBRIS_TYPE_NO_RULE', null, vegetative.id],
      ]);
      expect(open.map((gap) => gap.message).join(' ')).toMatch(
        /Bayline County Landfill.*Vegetative/,
      );
      const audited = await tx.auditRecord.count();
      const fee = (
        (
          await payItem({
            code: 'TIP-FEE-CY-BCL',
            description: 'Tipping fee, Bayline County Landfill',
            payableTypeId: await payableType('Tipping fee'),
            unit: 'CY',
            rates: [],
          })
        ).body as { record: { id: string } }
      ).record.id;
      saved(
        linkTippingFeeEndpoint,
        await ask(api, dana, linkTippingFeeEndpoint, {
          ids: { siteId: bcl.id },
          payload: { payItemId: fee },
        }),
      );
      const veg = ((await veg15()).body as { record: { id: string } }).record.id;
      saved(
        savePaysWhenEndpoint,
        await ask(api, dana, savePaysWhenEndpoint, {
          ids: { payItemId: veg },
          payload: {
            pays: [
              {
                formId: forms.load,
                slot: 1,
                criteria: [
                  { criterion: 'DEBRIS_TYPE', operator: 'EQUALS', picks: [vegetative.id] },
                ],
              },
            ],
          },
        }),
      );
      expect(await check()).toEqual([]);
      // The asks themselves wrote nothing: every audit record since is a change's.
      const since = await tx.auditRecord.count();
      await check();
      expect([since > audited, await tx.auditRecord.count()]).toEqual([true, since]);
    });
  });

  it('AC-01-74, 77 what each site’s phones ask for: a Vegetative load at Marsh Road TDSR on a Coastline truck, paid per CY, is asked for the load call; the pay item changed to per ton, the same ask answers the scale weight; a site’s own rows are its rows of the project’s', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { ids, forms, coastline, marshRoad, landfill, enter, debrisType, veg15 } =
        await p1Sites(api, dana, tx);
      const tdsr = saved(createSiteEndpoint, await enter(marshRoad)).record;
      const bcl = saved(createSiteEndpoint, await enter(landfill)).record;
      const vegetative = saved(
        addFormDebrisTypeEndpoint,
        await ask(api, dana, addFormDebrisTypeEndpoint, {
          ids: { formId: forms.load },
          payload: {
            debrisTypeId: await debrisType('Vegetative'),
            reduced: false,
            hiddenOnPhones: false,
          },
        }),
      ).record;
      const veg = ((await veg15()).body as { record: { id: string } }).record.id;
      saved(
        savePaysWhenEndpoint,
        await ask(api, dana, savePaysWhenEndpoint, {
          ids: { payItemId: veg },
          payload: {
            pays: [
              {
                formId: forms.load,
                slot: 1,
                criteria: [
                  { criterion: 'DEBRIS_TYPE', operator: 'EQUALS', picks: [vegetative.id] },
                ],
              },
            ],
          },
        }),
      );
      const luis = await api.signedIn(luissEmail, longer);
      const whole = async () =>
        saved(quantityLookupEndpoint, await ask(api, luis, quantityLookupEndpoint, { ids })).asks;
      const row = (siteId: string, asks: string) => ({
        siteId,
        form: 'LOAD',
        debrisTypeId: vegetative.id,
        primeId: coastline,
        asks,
      });
      const before = await whole();
      expect(before).toHaveLength(2);
      expect(before).toEqual(
        expect.arrayContaining([row(tdsr.id, 'LOAD_CALL'), row(bcl.id, 'LOAD_CALL')]),
      );
      saved(
        changePayItemEndpoint,
        await ask(api, dana, changePayItemEndpoint, {
          ids: { payItemId: veg },
          payload: { unit: 'TN' },
        }),
      );
      expect(
        saved(
          siteQuantityLookupEndpoint,
          await ask(api, luis, siteQuantityLookupEndpoint, { ids: { siteId: tdsr.id } }),
        ).asks,
      ).toEqual([row(tdsr.id, 'SCALE_WEIGHT')]);
      expect(await whole()).toEqual(
        expect.arrayContaining([row(tdsr.id, 'SCALE_WEIGHT'), row(bcl.id, 'SCALE_WEIGHT')]),
      );
    });
  });
});
