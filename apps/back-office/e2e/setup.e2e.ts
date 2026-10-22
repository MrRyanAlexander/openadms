// Setting up a project in the back office (adms-ticket-workflows, the setup spine; spec/CONVENTIONS.md
// §6's example world), each test its own admin in the run's world, where P1 stands as Dana set it
// up for its field days. The firm's records; its lists; a new project and its own setup; forms, pay
// items and a rule priced on P1; a site, the map and the setup check; a certification and an ROE
// entered from paper. Every screen is checked as it is left.
import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { choose, dialog, pick, tick, type } from './fill.ts';
import { signedIn, worldIds } from './world.ts';

const p1Name = 'Bayline County ROW, Hurricane Delphine';
const heading = (page: import('@playwright/test').Page) => page.getByRole('heading', { level: 1 });

test('the firm’s records: a client with its contact changed, a declaration event, a contractor', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Emery Hale', 'ADMIN');
  const said = english;
  await page.goto('/clients');
  await expect(heading(page)).toHaveText(said.clients.title);
  await page.getByRole('button', { name: said.clients.add }).click();
  const adding = dialog(page, said.clients.add);
  await type(adding, said.clients.name, 'Town of Egret Point');
  await type(adding, said.common.contactName, 'Egret Point debris manager');
  await type(adding, said.common.contactPhone, '555-0100');
  await adding.getByRole('button', { name: said.common.save }).click();
  await expect(page.getByText(said.common.saved)).toBeVisible();
  const egret = page.getByRole('row', { name: /Town of Egret Point/ });
  await expect(egret).toBeVisible();
  await egret.getByRole('button', { name: 'Change Town of Egret Point' }).click();
  const changing = dialog(page, 'Change Town of Egret Point');
  await type(changing, said.common.contactPhone, '555-0142');
  await changing.getByRole('button', { name: said.common.save }).click();
  await expect(changing).toBeHidden();
  await checkScreen(page);

  await page.goto('/declaration-events');
  await page.getByRole('button', { name: said.events.add }).click();
  const event = dialog(page, said.events.add);
  await type(event, said.events.name, 'Tropical Storm Calder');
  await type(event, said.events.reference, 'BC-EM-2027-01');
  await pick(event, said.events.referenceType, 'Local');
  await event.getByRole('button', { name: said.common.save }).click();
  await expect(page.getByRole('row', { name: /Tropical Storm Calder/ })).toContainText(
    'BC-EM-2027-01',
  );
  await checkScreen(page);

  await page.goto('/contractors');
  await page.getByRole('button', { name: said.contractors.add }).click();
  const contractor = dialog(page, said.contractors.add);
  await type(contractor, said.contractors.name, 'Summit Debris Services');
  await pick(contractor, said.contractors.kind, said.contractors.kinds.HAULER);
  await contractor.getByRole('button', { name: said.common.save }).click();
  await expect(page.getByRole('row', { name: /Summit Debris Services/ })).toContainText(
    said.contractors.kinds.HAULER,
  );
});

test('the firm’s lists: its own program type MARINE, requiring an ROE, archived and put back', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Finley Ross', 'ADMIN');
  const said = english.lists;
  await page.goto('/lists');
  await expect(heading(page)).toHaveText(said.title);
  await expect(page.getByRole('rowheader', { name: 'ROW', exact: true })).toBeVisible();
  await page.getByRole('button', { name: said.add }).click();
  const adding = dialog(page, said.add);
  await type(adding, said.value, 'MARINE');
  await tick(adding, said.requiresRoe);
  await adding.getByRole('button', { name: english.common.save }).click();
  const marine = page.getByRole('row', { name: /MARINE/ });
  await expect(marine).toContainText(`${said.requiresRoe}: ${english.common.yes}`);
  await marine.getByRole('button', { name: english.common.archive }).click();
  await expect(page.getByRole('row', { name: /MARINE/ })).toBeHidden();
  await choose(page, english.common.state, english.common.archived);
  await page
    .getByRole('row', { name: /MARINE/ })
    .getByRole('button', { name: english.common.unarchive })
    .click();
  await expect(page.getByRole('row', { name: /MARINE/ })).toBeHidden();
  await checkScreen(page);
});

test('a new project from the dialog, its series started, then its own setup: settings, the cert number series, a field tag, a prime and its contract', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Gray Ellis', 'ADMIN');
  const said = english.newProject;
  await page.goto('/');
  await page.getByRole('button', { name: said.add }).click();
  const adding = dialog(page, said.title);
  await type(adding, said.name, 'Bayline County PARKS, Hurricane Delphine');
  await pick(adding, said.client, 'Bayline County');
  await pick(adding, said.event, 'Hurricane Delphine (DR-9001-FL)');
  await pick(adding, said.programType, 'PARKS');
  await pick(adding, said.timeZone, 'America/New_York');
  await type(adding, said.activeFrom, '2026-10-12');
  await adding.getByRole('button', { name: english.common.save }).click();

  const setup = english.projectSetup;
  await expect(heading(page)).toHaveText(
    `${setup.title}: Bayline County PARKS, Hurricane Delphine`,
  );
  await page.getByRole('button', { name: setup.changeSettings }).click();
  const settings = dialog(page, setup.changeSettings);
  await tick(settings, setup.allowSplitLoads);
  await type(settings, setup.siteCircle, '1000');
  await settings.getByRole('button', { name: english.common.save }).click();
  await expect(settings).toBeHidden();
  await expect(page.getByText(english.common.saved)).toBeVisible();

  // A new project starts its ticket series at 100,001 and its ROEs at 1; its cert numbers start
  // where the firm says (Q-96): 730415.
  const numbering = page.getByRole('table', { name: setup.numbering });
  await expect(
    numbering.getByRole('row', { name: new RegExp(said.seriesNames.LOAD) }),
  ).toContainText('100001');
  await expect(
    numbering.getByRole('row', { name: new RegExp(said.seriesNames.ROE) }),
  ).toContainText('1');
  await page.getByRole('button', { name: setup.startSeries }).click();
  const series = dialog(page, setup.startSeries);
  await pick(series, setup.series, said.seriesNames.CERTIFICATION);
  await type(series, setup.firstNumber, '730415');
  await series.getByRole('button', { name: english.common.save }).click();
  await expect(series).toBeHidden();
  await expect(
    numbering.getByRole('row', { name: new RegExp(said.seriesNames.CERTIFICATION) }),
  ).toContainText('730415');

  await page.getByRole('button', { name: setup.addFieldTag }).click();
  const tag = dialog(page, setup.addFieldTag);
  await type(tag, setup.fieldTag, 'Mixed');
  await tag.getByRole('button', { name: english.common.save }).click();
  await expect(
    page.getByRole('table', { name: setup.fieldTags }).getByRole('cell', { name: 'Mixed' }),
  ).toBeVisible();

  await page.getByRole('button', { name: setup.addPrime }).click();
  const prime = dialog(page, setup.addPrime);
  await pick(prime, setup.prime, 'Coastline Haulers LLC');
  await prime.getByRole('button', { name: english.common.save }).click();
  await expect(
    page
      .getByRole('table', { name: setup.primes })
      .getByRole('rowheader', { name: 'Coastline Haulers LLC' }),
  ).toBeVisible();

  await page.getByRole('button', { name: setup.addContract }).click();
  const contract = dialog(page, setup.addContract);
  await type(contract, setup.contract, 'Coastline, Bayline PARKS 2026');
  await pick(contract, setup.prime, 'Coastline Haulers LLC');
  await contract.getByRole('button', { name: english.common.save }).click();
  await expect(
    page
      .getByRole('table', { name: setup.contracts })
      .getByRole('row', { name: /Coastline, Bayline PARKS 2026/ }),
  ).toContainText('Coastline Haulers LLC');
  await checkScreen(page);
});

test('on P1: Ash on the haul-out form; the incident form’s police report number; a tipping fee pay item at $6.00, changed after a preview; a rule paying it at the Landfill, valid', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Harper Quinn', 'ADMIN');
  const { p1 } = await worldIds();
  const said = english.forms;
  await page.goto(`/projects/${p1}/setup/forms`);
  await expect(heading(page)).toHaveText(said.title);
  await page.getByRole('button', { name: `${said.addDebrisType}: Haul-out` }).click();
  const debris = dialog(page, said.addDebrisType);
  await type(debris, said.newDebrisType, 'Ash');
  await debris.getByRole('button', { name: english.common.save }).click();
  await expect(
    page
      .getByRole('table', { name: 'Debris types on Haul-out' })
      .getByRole('rowheader', { name: 'Ash' }),
  ).toBeVisible();
  await page.getByRole('button', { name: `${said.editFields}: Incident` }).click();
  const fields = dialog(page, 'The firm’s own fields on Incident');
  await fields.getByRole('button', { name: said.addField }).click();
  const added = fields.getByRole('group').last();
  await added.getByLabel(said.fieldLabel, { exact: true }).fill('Police report number');
  await fields.getByRole('button', { name: english.common.save }).click();
  await expect(page.getByRole('rowheader', { name: 'Police report number' })).toBeVisible();
  await checkScreen(page);

  const items = english.payItems;
  await page.goto(`/projects/${p1}/setup/pay-items`);
  await page.getByRole('button', { name: items.add }).click();
  const item = dialog(page, items.add);
  await type(item, items.code, 'TIP-FEE-TN-BCL');
  await type(item, items.description, 'Tipping fee, Bayline County Landfill');
  await pick(item, items.payableType, 'Tipping fee');
  await pick(item, items.unit, items.units.TN);
  await type(item, 'Rate for Coastline Haulers LLC ($)', '6.00');
  await item.getByRole('button', { name: english.common.save }).click();
  const row = page.getByRole('row', { name: /TIP-FEE-TN-BCL/ });
  await expect(row).toContainText('$6.00');
  await row.getByRole('button', { name: 'Change TIP-FEE-TN-BCL' }).click();
  const changing = dialog(page, 'Change TIP-FEE-TN-BCL');
  await type(changing, items.description, 'Tipping fee at Bayline County Landfill, by the ton');
  await changing.getByRole('button', { name: english.common.preview }).click();
  await expect(changing.getByText(english.setup.wouldSave)).toBeVisible();
  await changing.getByRole('button', { name: english.common.save }).click();
  await expect(page.getByRole('row', { name: /TIP-FEE-TN-BCL/ })).toContainText('by the ton');
  await checkScreen(page);

  const rules = english.rules;
  await page.goto(`/projects/${p1}/setup/rules`);
  await page.getByRole('button', { name: rules.add }).click();
  await expect(heading(page)).toHaveText(rules.newTitle);
  await type(page, rules.name, 'Tipping fee at the Landfill');
  await pick(page, rules.form, 'Load');
  await pick(page, rules.contract, 'Coastline, Bayline ROW 2026');
  await page.getByRole('button', { name: rules.addIf }).click();
  const condition = page.getByRole('group', { name: `${rules.ifs} 1` });
  await pick(condition, rules.criterion, rules.criteria.DISPOSAL_SITE);
  await pick(condition, rules.value, 'Bayline County Landfill');
  await page.getByRole('button', { name: rules.addAction }).click();
  const action = page.getByRole('group', { name: `${rules.then} 1` });
  await action.getByLabel(rules.slot, { exact: true }).fill('2');
  await pick(
    action,
    rules.payItem,
    'TIP-FEE-TN-BCL, Tipping fee at Bayline County Landfill, by the ton',
  );
  await page.getByRole('button', { name: english.common.preview }).click();
  await expect(page.getByText(english.setup.wouldSave)).toBeVisible();
  await page.getByRole('button', { name: rules.save }).click();
  await expect(page.getByText(english.common.saved)).toBeVisible();
  await expect(heading(page)).toHaveText('Tipping fee at the Landfill');
  await checkScreen(page);
  await page.getByRole('link', { name: rules.back }).click();
  await expect(page.getByRole('row', { name: /Tipping fee at the Landfill/ })).toContainText(
    'Coastline, Bayline ROW 2026',
  );
  await checkScreen(page);
});

test('on P1: Old Quarry Pit, an ineligible site; what Marsh Road TDSR’s phones ask; the map loaded from a file with its three zones; the setup check', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Indigo Park', 'ADMIN');
  const { p1 } = await worldIds();
  const said = english.sites;
  await page.goto(`/projects/${p1}/setup/sites`);
  await expect(heading(page)).toHaveText(said.title);
  await page.getByRole('button', { name: said.add }).click();
  const site = dialog(page, said.add);
  await type(site, said.name, 'Old Quarry Pit');
  await pick(site, said.siteType, 'Other');
  await tick(site, said.takesLoads);
  await tick(site, said.ineligibleSite);
  await type(site, said.latitude, '39.20000000');
  await type(site, said.longitude, '-75.65000000');
  await type(site, said.activation, '2026-10-12');
  await site.getByRole('button', { name: english.common.save }).click();
  await expect(
    page.getByRole('table', { name: said.title }).getByRole('row', { name: /Old Quarry Pit/ }),
  ).toBeVisible();
  await expect(page.getByRole('table', { name: `${said.lookup}: Marsh Road TDSR` })).toBeVisible();
  await checkScreen(page);

  const map = english.map;
  await page.goto(`/projects/${p1}/setup/map`);
  await expect(heading(page)).toHaveText(map.title);
  await page.getByRole('button', { name: map.upload }).click();
  const loading = dialog(page, map.upload);
  const zone = (name: string, west: number, east: number) => ({
    type: 'Feature',
    properties: { ZONE_NAME: name },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [west, 38.9],
          [east, 38.9],
          [east, 39.3],
          [west, 39.3],
          [west, 38.9],
        ],
      ],
    },
  });
  await loading.getByLabel(map.file).setInputFiles({
    name: 'bayline-row-zones-v1.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(
      JSON.stringify({
        type: 'FeatureCollection',
        features: [
          zone('Zone 1', -75.8, -75.67),
          zone('Zone 2', -75.67, -75.53),
          zone('Zone 3', -75.53, -75.4),
        ],
      }),
    ),
  });
  await expect(loading.getByRole('table', { name: map.layers })).toBeVisible();
  await pick(loading, map.boundaryLayer, `${map.layer} (3 ${map.features})`);
  await pick(loading, map.zonesLayer, `${map.layer} (3 ${map.features})`);
  await pick(loading, map.zoneNameField, 'ZONE_NAME');
  await loading.getByRole('button', { name: map.load }).click();
  await expect(
    page.getByRole('img', { name: 'The project’s boundary with 3 zones and its sites' }),
  ).toBeVisible();
  await expect(page.getByRole('table', { name: map.versions })).toContainText(
    'Zone 1, Zone 2, Zone 3',
  );
  await checkScreen(page);

  await page.goto(`/projects/${p1}/setup/check`);
  await expect(heading(page)).toHaveText(english.setupCheck.title);
  await expect(
    page
      .getByText(english.setupCheck.none)
      .or(page.getByRole('table', { name: english.setupCheck.title })),
  ).toBeVisible();
});

test('on P1: Coastline’s walking floor 730419 entered from paper, its radius corners taken away, 110 CY by the server; revoked from a day; and ROE 2026-0412 from paper with Vegetative in its scope', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Jules Tran', 'ADMIN');
  const { p1 } = await worldIds();
  const said = english.certifications;
  await page.goto(`/projects/${p1}/certifications`);
  await expect(heading(page)).toHaveText(said.title);
  await page.getByRole('button', { name: said.add }).click();
  const intake = dialog(page, said.add);
  await type(intake, said.certNumber, '730419');
  await pick(intake, said.prime, 'Coastline Haulers LLC');
  const first = intake.getByRole('group', { name: 'Box 1' });
  await first.getByLabel(said.length, { exact: true }).fill('576');
  await first.getByLabel(said.width, { exact: true }).fill('96');
  await first.getByLabel(said.height, { exact: true }).fill('93');
  await intake.getByRole('button', { name: said.addBox }).click();
  const second = intake.getByRole('group', { name: 'Box 2' });
  await pick(second, said.shape, said.shapes.RADIUS_CORNER);
  await pick(second, said.sign, said.signs.SUBTRACT);
  await pick(second, said.feature, 'Curved/Angled Sides/Floor');
  await second.getByLabel(said.radius, { exact: true }).fill('6');
  await second.getByLabel(said.run, { exact: true }).fill('576');
  await second.getByLabel(said.corners, { exact: true }).fill('2');
  await type(intake, said.vehicleTypeOther, 'Walking floor trailer');
  await type(intake, said.certifiedOn, '2026-10-10');
  await type(intake, said.certifiedAt, '09:40');
  await pick(intake, said.certifiedBy, 'Sam Grant');
  await pick(intake, said.reason, 'Device failed');
  await intake.getByRole('button', { name: english.common.save }).click();
  const row = page.getByRole('row', { name: /730419/ });
  await expect(row).toContainText('110');
  await checkScreen(page);

  await row.getByRole('link', { name: '730419' }).click();
  await expect(heading(page)).toHaveText('Certification 730419');
  await page.getByRole('button', { name: said.revoke }).click();
  const revoking = dialog(page, said.revoke);
  await type(revoking, said.revokeFrom, '2026-10-20');
  await revoking.getByLabel(said.revokeReason).fill('Tailgate missing');
  await revoking.getByRole('button', { name: english.common.save }).click();
  await expect(page.getByText('Revoked from Oct 20, 2026').first()).toBeVisible();
  await checkScreen(page);

  const roes = english.roes;
  await page.goto(`/projects/${p1}/roes`);
  await expect(heading(page)).toHaveText(roes.title);
  await page.getByRole('button', { name: roes.add }).click();
  const roe = dialog(page, roes.add);
  await type(roe, roes.roeNumber, 'ROE 2026-0412');
  await type(roe, roes.owner, 'Rosa Delgado');
  await type(roe, roes.address, '412 Cedar Ct');
  await tick(roe, roes.signed);
  await type(roe, roes.signedDate, '2026-10-09');
  await roe.getByRole('button', { name: english.common.save }).click();
  const entered = page.getByRole('row', { name: /ROE 2026-0412/ });
  await expect(entered).toContainText(roes.noScope);
  await entered.getByRole('button', { name: `${roes.addScope}: ROE 2026-0412` }).click();
  const scope = dialog(page, `${roes.addScope}: ROE 2026-0412`);
  await pick(scope, roes.scopeKind, `${roes.scopeKinds.debris}: Vegetative (Load)`);
  await scope.getByRole('button', { name: english.common.save }).click();
  await expect(page.getByRole('row', { name: /ROE 2026-0412/ })).toContainText('Vegetative (Load)');
  await checkScreen(page);
});

test('P1’s setup at a glance: its project page and setup page', async ({ page, context }) => {
  await signedIn(context, 'Kai Morgan', 'ADMIN');
  const { p1 } = await worldIds();
  await page.goto(`/projects/${p1}`);
  await expect(heading(page)).toHaveText(p1Name);
  await page.goto(`/projects/${p1}/setup`);
  await expect(page.getByRole('table', { name: english.projectSetup.contracts })).toContainText(
    'Coastline, Bayline ROW 2026',
  );
});
