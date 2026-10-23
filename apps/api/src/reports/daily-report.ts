// The daily report as a PDF (REQ-410; spec/FROM-BUILD-1.md §9, the user: "a pretty dashboard that
// we convert to a PDF. Each page is a presentation in landscape view"), drawn by
// `@open-adms/receipts`' PDF writer with no dependency:
//
// 1. a title page, its content centred;
// 2. the email's outline repeated without its figures, the report's index, though it doesn't say
//    so;
// 3. one page per operation, in the outline's order (loads, haul-outs, unit rate): its details on
//    the left and, on the right, a map of what was done;
// 4. the project's additional stats, with each day of the range;
// 5. its estimates and objectives: the model holds none, and the page says so rather than
//    inventing any;
// 6. an end page: what the firm calls its ADMS centred, "Open Recover" small at the bottom right,
//    "Built on Open ADMS <version>" with its licence and source small at the bottom left, and the
//    firm's address for a reader who wants to be on its list.
//
// **The map is drawn as plain lines, no map tiles** (agent default, in BUILD.md): the project's
// boundary and zones as its newest map holds them, its sites, and each field event where it was
// recorded, so nothing leaves the installation and nothing needs a licence. Never a cost.
import {
  fitted,
  linesOf,
  PdfPage,
  pdfOf,
  textWidth,
  type PagePoint,
  type Rgb,
} from '@open-adms/receipts';
import type { BrandAnswer, DebrisTotalsAnswer } from '@open-adms/contracts';
import { builtOn, builtOnLine, ProjectClock } from '@open-adms/domain';

import type { ReportMap } from './debris-totals.ts';
import { grouped, summaryOf, summaryWords, type Summary, type SummarySection } from './summary.ts';

// US Letter, landscape.
const wide = 792;
const high = 612;
const margin = 40;

const colours = {
  ink: { r: 0.11, g: 0.14, b: 0.2 },
  muted: { r: 0.4, g: 0.44, b: 0.5 },
  rule: { r: 0.82, g: 0.84, b: 0.87 },
  band: { r: 0.95, g: 0.96, b: 0.97 },
  accent: { r: 0.05, g: 0.36, b: 0.42 },
  boundary: { r: 0.11, g: 0.14, b: 0.2 },
  zone: { r: 0.55, g: 0.6, b: 0.66 },
  site: { r: 0.6, g: 0.2, b: 0.1 },
  white: { r: 1, g: 1, b: 1 },
} as const satisfies Record<string, Rgb>;

// A point's colour by its group, in the order the groups first come: told apart by colour and by
// the legend that names each.
const groupColours: readonly Rgb[] = [
  { r: 0.13, g: 0.47, b: 0.71 },
  { r: 0.85, g: 0.37, b: 0.01 },
  { r: 0.17, g: 0.63, b: 0.17 },
  { r: 0.84, g: 0.15, b: 0.16 },
  { r: 0.58, g: 0.4, b: 0.74 },
  { r: 0.55, g: 0.34, b: 0.29 },
  { r: 0.89, g: 0.47, b: 0.76 },
  { r: 0.5, g: 0.5, b: 0.5 },
];

export const reportWords = {
  dailyReport: 'Daily Report',
  details: 'Details',
  map: 'Where the work was done',
  noMap: 'This project has no map loaded yet: only its sites and field events are drawn.',
  nothingToMap: 'Nothing to draw on the map for these days.',
  sites: 'Sites',
  equipment: 'Trucks, trailers and crews',
  byDay: 'Each day',
  day: 'Day',
  loadsCounted: 'Loads',
  loadCy: 'Load CY',
  haulOutsCounted: 'Haul-outs',
  haulOutCy: 'Haul-out CY',
  unitRateTickets: 'Unit rate tickets',
  estimates: 'Project Estimates and Objectives',
  noEstimates: (adms: string) =>
    `No estimates or objectives are recorded for this project in ${adms}, so none is shown here.`,
  endBrand: 'Open Recover',
  contact: (email: string) =>
    `To be added to the distribution list for this report, write to ${email}.`,
  noContact: 'To be added to the distribution list for this report, ask whoever sent it to you.',
  page: (at: number, of: number) => `${String(at)} / ${String(of)}`,
} as const;

function centred(page: PdfPage, y: number, size: number, bold: boolean, words: string): void {
  const shown = fitted(words, size, wide - margin * 2, bold);
  page.text((wide - textWidth(shown, size, bold)) / 2, y, size, bold, shown);
}

function right(page: PdfPage, x: number, y: number, size: number, bold: boolean, words: string) {
  page.text(x - textWidth(words, size, bold), y, size, bold, words);
}

// A page's heading band and its footer: the closing line and the page's number.
function framed(heading: string, subtitle: string): PdfPage {
  const page = new PdfPage(wide, high);
  page.fillColour(colours.accent);
  page.rect(0, high - 56, wide, 56, 'fill');
  page.fillColour(colours.white);
  page.text(margin, high - 34, 18, true, fitted(heading, 18, wide - margin * 2 - 220, true));
  right(page, wide - margin, high - 33, 10, false, subtitle);
  page.fillColour(colours.ink);
  return page;
}

function footed(page: PdfPage, at: number, of: number): void {
  page.strokeColour(colours.rule);
  page.lineWidth(0.5);
  page.line({ x: margin, y: 34 }, { x: wide - margin, y: 34 });
  page.fillColour(colours.muted);
  page.text(margin, 20, 8, false, summaryWords.pending);
  right(page, wide - margin, 20, 8, false, reportWords.page(at, of));
  page.fillColour(colours.ink);
}

// A section's lines as a table: its label, its figure, what it counted; its total ruled off.
function detailTable(
  page: PdfPage,
  section: SummarySection,
  x: number,
  top: number,
  width: number,
) {
  let y = top;
  page.fillColour(colours.muted);
  page.text(x, y, 9, true, reportWords.details.toUpperCase());
  y -= 18;
  const row = (label: string, figure: string, count: string, bold: boolean) => {
    page.fillColour(colours.ink);
    page.text(x, y, 11, bold, fitted(label, 11, width * 0.45, bold));
    // A section that counts nothing beside its figures sets them at the table's right edge.
    const counts = [...section.lines, ...(section.total === null ? [] : [section.total])].some(
      (line) => line.count !== '',
    );
    const edge = counts ? width * 0.78 : width;
    right(page, x + edge, y, 11, bold, fitted(figure, 11, edge - width * 0.47, bold));
    page.fillColour(colours.muted);
    right(page, x + width, y, 10, false, count);
    y -= 20;
  };
  if (section.lines.length === 0) {
    page.fillColour(colours.muted);
    page.text(x, y, 11, false, summaryWords.nothing);
    y -= 20;
  }
  for (const line of section.lines) row(line.label, line.figure, line.count, false);
  if (section.total !== null) {
    page.strokeColour(colours.rule);
    page.lineWidth(0.75);
    page.line({ x, y: y + 12 }, { x: x + width, y: y + 12 });
    row(section.total.label, section.total.figure, section.total.count, true);
  }
  const items = section.equipment.flatMap((line) => line.items);
  if (items.length > 0) {
    y -= 18;
    page.fillColour(colours.muted);
    page.text(x, y, 9, true, reportWords.equipment.toUpperCase());
    y -= 18;
    for (const item of items) row(item.name, grouped(String(item.count)), '', false);
  }
  return y;
}

type Ring = readonly (readonly number[])[];

// The rings of a kept shape (a Polygon or a MultiPolygon), each [longitude, latitude].
function ringsOf(shape: unknown): Ring[][] {
  if (typeof shape !== 'object' || shape === null) return [];
  const { type, coordinates } = shape as { type?: unknown; coordinates?: unknown };
  if (type === 'Polygon' && Array.isArray(coordinates)) return [coordinates as Ring[]];
  if (type === 'MultiPolygon' && Array.isArray(coordinates)) return coordinates as Ring[][];
  return [];
}

// A box on the page the map is drawn in, and how a place on the earth falls in it: longitude
// scaled by the cosine of the middle latitude, so the shapes keep their proportions.
function projection(
  places: readonly (readonly [number, number])[],
  box: { x: number; y: number; width: number; height: number },
): ((longitude: number, latitude: number) => PagePoint) | null {
  if (places.length === 0) return null;
  const longitudes = places.map(([longitude]) => longitude);
  const latitudes = places.map(([, latitude]) => latitude);
  let west = Math.min(...longitudes);
  let east = Math.max(...longitudes);
  let south = Math.min(...latitudes);
  let north = Math.max(...latitudes);
  // A single place, or a line of them, still gets a box around it.
  const least = 0.005;
  if (east - west < least) [west, east] = [west - least, east + least];
  if (north - south < least) [south, north] = [south - least, north + least];
  const stretch = Math.cos((((north + south) / 2) * Math.PI) / 180);
  const across = (east - west) * stretch * 1.08;
  const up = (north - south) * 1.08;
  const scale = Math.min(box.width / across, box.height / up);
  const x0 = box.x + (box.width - (east - west) * stretch * scale) / 2;
  const y0 = box.y + (box.height - (north - south) * scale) / 2;
  return (longitude, latitude) => ({
    x: x0 + (longitude - west) * stretch * scale,
    y: y0 + (latitude - south) * scale,
  });
}

// The map of one operation: the boundary, the zones, the sites and its own points, with a legend.
function drawMap(
  page: PdfPage,
  map: ReportMap,
  workflow: 'LOAD' | 'HAUL_OUT' | 'UNIT_RATE',
  box: { x: number; y: number; width: number; height: number },
): void {
  page.fillColour(colours.muted);
  page.text(box.x, box.y + box.height + 10, 9, true, reportWords.map.toUpperCase());
  page.fillColour(colours.band);
  page.strokeColour(colours.rule);
  page.lineWidth(0.75);
  page.rect(box.x, box.y, box.width, box.height, 'both');
  const points = map.points.filter((point) => point.workflow === workflow);
  const boundary = ringsOf(map.boundary);
  const zones = map.zones.map((zone) => ({ name: zone.name, rings: ringsOf(zone.geometry) }));
  const shapePlaces = [...boundary, ...zones.flatMap((zone) => zone.rings)]
    .flat(2)
    .map((position) => [position[0] ?? 0, position[1] ?? 0] as const);
  const places =
    shapePlaces.length > 0
      ? shapePlaces
      : [
          ...map.sites.map((site) => [site.longitude, site.latitude] as const),
          ...points.map((point) => [point.longitude, point.latitude] as const),
        ];
  const legendHeight = 40;
  const drawn = { ...box, y: box.y + legendHeight, height: box.height - legendHeight };
  const at = projection(places, {
    x: drawn.x + 8,
    y: drawn.y + 8,
    width: drawn.width - 16,
    height: drawn.height - 16,
  });
  if (at === null) {
    page.fillColour(colours.muted);
    centredIn(page, box, reportWords.nothingToMap);
    return;
  }
  page.save();
  page.clip(drawn.x, drawn.y, drawn.width, drawn.height);
  const pageRings = (rings: Ring[]) =>
    rings.map((ring) => ring.map((position) => at(position[0] ?? 0, position[1] ?? 0)));
  page.fillColour(colours.white);
  page.strokeColour(colours.boundary);
  page.lineWidth(1.25);
  for (const polygon of boundary) page.rings(pageRings(polygon), 'both');
  page.strokeColour(colours.zone);
  page.lineWidth(0.5);
  page.fillColour(colours.muted);
  for (const zone of zones) {
    for (const polygon of zone.rings) {
      page.rings(pageRings(polygon), 'stroke');
      const outline = polygon[0] ?? [];
      if (outline.length > 0) {
        const middle = at(
          outline.reduce((sum, position) => sum + (position[0] ?? 0), 0) / outline.length,
          outline.reduce((sum, position) => sum + (position[1] ?? 0), 0) / outline.length,
        );
        page.text(middle.x - textWidth(zone.name, 7) / 2, middle.y, 7, false, zone.name);
      }
    }
  }
  const groups = [...new Set(points.map((point) => point.group))];
  for (const point of points) {
    page.fillColour(groupColours[groups.indexOf(point.group) % groupColours.length] ?? colours.ink);
    page.circle(at(point.longitude, point.latitude), 2.4, 'fill');
  }
  for (const site of map.sites) {
    const spot = at(site.longitude, site.latitude);
    page.fillColour(colours.site);
    page.rect(spot.x - 3, spot.y - 3, 6, 6, 'fill');
    page.fillColour(colours.ink);
    page.text(spot.x + 5, spot.y - 3, 7, false, fitted(site.name, 7, 140));
  }
  page.restore();
  // The legend, under the map: each group's colour and name, then the sites' mark.
  let x = box.x + 8;
  const y = box.y + 14;
  const keyed = [
    ...groups.map((group, place) => ({
      name: group === '' ? summaryWords.nothing : group,
      colour: groupColours[place % groupColours.length] ?? colours.ink,
      square: false,
    })),
    { name: reportWords.sites, colour: colours.site, square: true },
  ];
  for (const key of keyed) {
    const name = fitted(key.name, 8, 120);
    if (x + textWidth(name, 8) + 18 > box.x + box.width) break;
    page.fillColour(key.colour);
    if (key.square) page.rect(x - 3, y - 1, 6, 6, 'fill');
    else page.circle({ x, y: y + 2 }, 3, 'fill');
    page.fillColour(colours.ink);
    page.text(x + 6, y, 8, false, name);
    x += textWidth(name, 8) + 22;
  }
  if (shapePlaces.length === 0) {
    page.fillColour(colours.muted);
    page.text(box.x + 8, box.y + 2, 7, false, reportWords.noMap);
  }
}

function centredIn(
  page: PdfPage,
  box: { x: number; y: number; width: number; height: number },
  words: string,
): void {
  page.text(
    box.x + (box.width - textWidth(words, 10)) / 2,
    box.y + box.height / 2,
    10,
    false,
    words,
  );
}

function titlePage(summary: Summary, totals: DebrisTotalsAnswer): PdfPage {
  const page = new PdfPage(wide, high);
  page.fillColour(colours.accent);
  page.rect(0, 0, wide, 10, 'fill');
  page.rect(0, high - 10, wide, 10, 'fill');
  page.fillColour(colours.ink);
  centred(page, 380, 30, true, totals.project.name);
  page.fillColour(colours.muted);
  centred(page, 346, 14, false, `${totals.project.reference} · ${totals.project.client}`);
  page.fillColour(colours.accent);
  centred(page, 290, 20, true, reportWords.dailyReport);
  page.fillColour(colours.ink);
  centred(page, 262, 14, false, summary.subtitle);
  return page;
}

// The outline again, without its figures: the report's index.
function outlinePage(summary: Summary): PdfPage {
  const page = new PdfPage(wide, high);
  let y = high - 80;
  page.fillColour(colours.ink);
  page.text(margin + 40, y, 16, true, fitted(summary.title, 16, wide - margin * 2 - 80, true));
  y -= 22;
  page.fillColour(colours.muted);
  page.text(margin + 40, y, 12, false, summary.subtitle);
  y -= 36;
  for (const section of summary.sections) {
    page.fillColour(colours.accent);
    page.text(margin + 40, y, 13, true, section.heading);
    y -= 19;
    page.fillColour(colours.ink);
    const labels = [
      ...section.equipment.map((line) => line.label),
      ...(section.lines.length === 0 ? [summaryWords.nothing] : []),
      ...section.lines.map((line) => line.label),
    ];
    for (const label of labels) {
      if (y < 70) break;
      page.text(margin + 56, y, 11, false, `• ${fitted(label, 11, wide - margin * 2 - 120)}`);
      y -= 16;
    }
    y -= 12;
  }
  return page;
}

function operationPage(
  section: SummarySection,
  subtitle: string,
  map: ReportMap,
  workflow: 'LOAD' | 'HAUL_OUT' | 'UNIT_RATE',
): PdfPage {
  const page = framed(section.heading.replace(/:$/, ''), subtitle);
  detailTable(page, section, margin, high - 90, 320);
  drawMap(page, map, workflow, { x: 400, y: 52, width: wide - 400 - margin, height: high - 140 });
  return page;
}

function statsPage(section: SummarySection, totals: DebrisTotalsAnswer, subtitle: string) {
  const page = framed(section.heading.replace(/:$/, ''), subtitle);
  let y = detailTable(page, section, margin, high - 90, 320) - 20;
  page.fillColour(colours.muted);
  page.text(margin, y, 9, true, reportWords.byDay.toUpperCase());
  y -= 18;
  const columns = [
    {
      title: reportWords.day,
      at: margin,
      value: (day: DebrisTotalsAnswer['byDay'][number]) => ProjectClock.dateOf(day.day),
    },
    {
      title: reportWords.loadsCounted,
      at: margin + 190,
      value: (day: DebrisTotalsAnswer['byDay'][number]) => grouped(String(day.loads)),
    },
    {
      title: reportWords.loadCy,
      at: margin + 300,
      value: (day: DebrisTotalsAnswer['byDay'][number]) => grouped(day.loadCy),
    },
    {
      title: reportWords.haulOutsCounted,
      at: margin + 410,
      value: (day: DebrisTotalsAnswer['byDay'][number]) => grouped(String(day.haulOuts)),
    },
    {
      title: reportWords.haulOutCy,
      at: margin + 520,
      value: (day: DebrisTotalsAnswer['byDay'][number]) => grouped(day.haulOutCy),
    },
    {
      title: reportWords.unitRateTickets,
      at: margin + 690,
      value: (day: DebrisTotalsAnswer['byDay'][number]) => grouped(String(day.unitRateTickets)),
    },
  ];
  page.fillColour(colours.ink);
  for (const [place, column] of columns.entries()) {
    if (place === 0) page.text(column.at, y, 9, true, column.title);
    else right(page, column.at, y, 9, true, column.title);
  }
  y -= 16;
  for (const day of totals.byDay) {
    if (y < 50) break;
    for (const [place, column] of columns.entries()) {
      if (place === 0) page.text(column.at, y, 9, false, column.value(day));
      else right(page, column.at, y, 9, false, column.value(day));
    }
    y -= 14;
  }
  return page;
}

function estimatesPage(subtitle: string, brand: BrandAnswer): PdfPage {
  const page = framed(reportWords.estimates, subtitle);
  page.fillColour(colours.muted);
  let y = high - 110;
  for (const line of linesOf(reportWords.noEstimates(brand.name), 13, wide - margin * 2)) {
    page.text(margin, y, 13, false, line);
    y -= 18;
  }
  return page;
}

function endPage(contactEmail: string | null, brand: BrandAnswer): PdfPage {
  const page = new PdfPage(wide, high);
  page.fillColour(colours.accent);
  page.rect(0, 0, wide, 10, 'fill');
  page.rect(0, high - 10, wide, 10, 'fill');
  page.fillColour(colours.ink);
  centred(page, 320, 40, true, brand.name);
  page.fillColour(colours.muted);
  centred(
    page,
    282,
    12,
    false,
    contactEmail === null ? reportWords.noContact : reportWords.contact(contactEmail),
  );
  right(page, wide - margin, 28, 9, false, reportWords.endBrand);
  // The AGPL-3.0 attribution, and where the source is (§13).
  const attribution = `${builtOnLine(brand.version)}, ${builtOn.licence}. Source: ${builtOn.source}`;
  page.text(margin, 28, 9, false, fitted(attribution, 9, wide - margin * 2 - 120, false));
  return page;
}

// The report's pages, in order, as one PDF.
export function dailyReportPdf(
  totals: DebrisTotalsAnswer,
  map: ReportMap,
  contactEmail: string | null,
  brand: BrandAnswer,
): Uint8Array<ArrayBuffer> {
  const summary = summaryOf(totals);
  const [loads, haulOuts, unitRate, stats] = summary.sections;
  if (
    loads === undefined ||
    haulOuts === undefined ||
    unitRate === undefined ||
    stats === undefined
  ) {
    throw new Error('The summary has lost a section.');
  }
  const subtitle = `${totals.project.name} · ${summary.subtitle.split(' - ').at(-1) ?? ''}`;
  const middle = [
    outlinePage(summary),
    operationPage(loads, subtitle, map, 'LOAD'),
    operationPage(haulOuts, subtitle, map, 'HAUL_OUT'),
    operationPage(unitRate, subtitle, map, 'UNIT_RATE'),
    statsPage(stats, totals, subtitle),
    estimatesPage(subtitle, brand),
  ];
  middle.forEach((page, place) => {
    footed(page, place + 2, middle.length + 2);
  });
  return pdfOf([titlePage(summary, totals), ...middle, endPage(contactEmail, brand)]);
}
