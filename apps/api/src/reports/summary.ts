// The email summary (REQ-410; spec/FROM-BUILD-1.md §9): the debris totals in the shape the user
// approved, as plain text to paste into an email, and the outline the daily report repeats on its
// unlabelled second page. **Its headings and lines are the project's own**: the program type, the
// names its forms give its loads, haul-outs and unit rate work, its debris types, its sites, its
// payable types and pay items, the firm's names for its trucks, trailers and crews. Only the
// frame is fixed, in the user's words, English first and US units; a firm's own wording is its
// forms' and lists' names. Never a cost (the user: "totals for debris, not costs").
import type { DebrisTotalsAnswer } from '@open-adms/contracts';

// The frame's words, in one place.
export const summaryWords = {
  operations: 'Current Operations / Monitoring',
  operationsOf: (heading: string) => `${heading} Operations:`,
  truckCount: 'Truck/Trailer Count',
  crewCount: 'Crew Count',
  totalOf: (heading: string) => `${heading} Total`,
  loads: (count: number) => `${grouped(String(count))} ${count === 1 ? 'load' : 'loads'}`,
  units: (units: string) => `${grouped(units)} units`,
  hours: (hours: string) => `${grouped(hours)} hours`,
  projectStats: 'Add’l Project Stats:',
  incidents: 'Incidents',
  incidentsCounted: (filed: number, open: number) => `${String(filed)} filed, ${String(open)} open`,
  monitorsOnShift: 'Monitors on shift',
  nothing: 'None recorded',
  noDebrisType: 'No debris type',
  noSite: 'No site',
  noPayableType: 'No payable type',
  pending: 'All figures in this report are pending final reconciliation',
} as const;

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// A range of calendar days as the user writes one: "October 12, 2026", "October 12–14, 2026",
// "September 30 – October 2, 2026", "December 30, 2026 – January 2, 2027".
export function daysInWords(from: string, to: string): string {
  const [fy = '', fm = '', fd = ''] = from.split('-');
  const [ty = '', tm = '', td = ''] = to.split('-');
  const month = (m: string) => months[Number(m) - 1] ?? '';
  const day = (d: string) => String(Number(d));
  if (from === to) return `${month(fm)} ${day(fd)}, ${fy}`;
  if (fy !== ty) return `${month(fm)} ${day(fd)}, ${fy} – ${month(tm)} ${day(td)}, ${ty}`;
  if (fm !== tm) return `${month(fm)} ${day(fd)} – ${month(tm)} ${day(td)}, ${ty}`;
  return `${month(fm)} ${day(fd)}–${day(td)}, ${ty}`;
}

// An exact decimal with its thousands grouped and no zeros after its last figure that counts:
// "4958.00" is "4,958", "62.40" is "62.4". Read as text, never through a float.
export function grouped(exact: string): string {
  const negative = exact.startsWith('-');
  const [whole = '0', part = ''] = (negative ? exact.slice(1) : exact).split('.');
  const kept = part.replace(/0+$/, '');
  const thousands = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${thousands}${kept === '' ? '' : `.${kept}`}`;
}

const isZero = (exact: string): boolean => /^-?0*(\.0*)?$/.test(exact);

// Yards, and tons where a weight was taken: "3,412 CY", "12.5 TN", "36 CY · 12.5 TN".
export function moved(cy: string, tons: string): string {
  const parts = [
    ...(isZero(cy) && !isZero(tons) ? [] : [`${grouped(cy)} CY`]),
    ...(isZero(tons) ? [] : [`${grouped(tons)} TN`]),
  ];
  return parts.join(' · ');
}

// What a section's lines say: its label and what it counts.
export interface SummaryLine {
  readonly label: string;
  readonly figure: string;
  readonly count: string;
}

// A count of trucks, trailers or crews: each kind's name and how many.
export interface SummaryEquipment extends SummaryLine {
  readonly items: readonly { readonly name: string; readonly count: number }[];
}

export interface SummarySection {
  readonly heading: string;
  // Its trucks, trailers or crews, first.
  readonly equipment: readonly SummaryEquipment[];
  readonly lines: readonly SummaryLine[];
  // Its total line, where it has one.
  readonly total: SummaryLine | null;
}

export interface Summary {
  readonly title: string;
  readonly subtitle: string;
  readonly sections: readonly SummarySection[];
  readonly closing: string;
}

const equipmentLines = (
  heading: string,
  equipment: DebrisTotalsAnswer['loads']['equipment'],
): SummaryEquipment[] =>
  [false, true].flatMap((crew) => {
    const counted = equipment.filter((each) => each.crew === crew);
    return counted.length === 0
      ? []
      : [
          {
            label: `${heading} ${crew ? summaryWords.crewCount : summaryWords.truckCount}`,
            figure: counted.map((each) => `(${String(each.count)}) ${each.name}`).join(' '),
            count: '',
            items: counted.map(({ name, count }) => ({ name, count })),
          },
        ];
  });

// The summary's parts, from the totals: what the email says and the report's pages repeat.
export function summaryOf(totals: DebrisTotalsAnswer): Summary {
  const { project, headings } = totals;
  const loadsHeading = `${project.programType} ${headings.loads}`;
  const haulOutSites = (siteId: string | undefined) =>
    totals.haulOuts.rows.filter((row) => row.site?.id === siteId).length;
  const payableRows = (payableTypeId: string | undefined) =>
    totals.unitRate.rows.filter((row) => row.payableType?.id === payableTypeId).length;
  return {
    title: `${project.reference} ${project.name}`,
    subtitle: `${summaryWords.operations} - ${daysInWords(totals.from, totals.to)}`,
    sections: [
      {
        heading: summaryWords.operationsOf(loadsHeading),
        equipment: equipmentLines(loadsHeading, totals.loads.equipment),
        lines: [
          ...totals.loads.rows.map((row) => ({
            label: row.debrisType?.name ?? summaryWords.noDebrisType,
            figure: moved(row.cy, row.tons),
            count: `(${summaryWords.loads(row.loads)})`,
          })),
        ],
        total: {
          label: summaryWords.totalOf(loadsHeading),
          figure: moved(totals.loads.total.cy, totals.loads.total.tons),
          count: summaryWords.loads(totals.loads.total.loads),
        },
      },
      {
        heading: summaryWords.operationsOf(headings.haulOuts),
        equipment: equipmentLines(headings.haulOuts, totals.haulOuts.equipment),
        lines: [
          ...totals.haulOuts.rows.map((row) => ({
            label:
              haulOutSites(row.site?.id) > 1
                ? `${row.site?.name ?? summaryWords.noSite} · ${row.debrisType?.name ?? summaryWords.noDebrisType}`
                : (row.site?.name ?? summaryWords.noSite),
            figure: moved(row.cy, row.tons),
            count: `(${summaryWords.loads(row.loads)})`,
          })),
        ],
        total: {
          label: summaryWords.totalOf(headings.haulOuts),
          figure: moved(totals.haulOuts.total.cy, totals.haulOuts.total.tons),
          count: summaryWords.loads(totals.haulOuts.total.loads),
        },
      },
      {
        heading: summaryWords.operationsOf(headings.unitRate),
        equipment: equipmentLines(headings.unitRate, totals.unitRate.equipment),
        lines: [
          ...totals.unitRate.rows.map((row) => ({
            label:
              payableRows(row.payableType?.id) > 1 && row.payItem !== null
                ? row.payItem.description
                : (row.payableType?.name ?? summaryWords.noPayableType),
            figure: row.hours ? summaryWords.hours(row.units) : grouped(row.units),
            count: '',
          })),
        ],
        total: {
          label: summaryWords.totalOf(headings.unitRate),
          figure: [
            summaryWords.units(totals.unitRate.total.units),
            ...(totals.unitRate.rows.some((row) => row.hours)
              ? [summaryWords.hours(totals.unitRate.total.hours)]
              : []),
          ].join(' · '),
          count: '',
        },
      },
      {
        heading: summaryWords.projectStats,
        equipment: [],
        lines: [
          {
            label: summaryWords.incidents,
            figure: summaryWords.incidentsCounted(totals.incidents.filed, totals.incidents.open),
            count: '',
          },
          {
            label: summaryWords.monitorsOnShift,
            figure: String(totals.monitorsOnShift),
            count: '',
          },
        ],
        total: null,
      },
    ],
    closing: summaryWords.pending,
  };
}

const rule = '------------------------------------------';

// The summary as the email's text: a bullet a line, each section's total under a rule.
export function emailText(summary: Summary): string {
  const widest = Math.max(
    18,
    ...summary.sections.flatMap((section) =>
      [
        ...section.equipment,
        ...section.lines,
        ...(section.total === null ? [] : [section.total]),
      ].map((line) => line.label.length),
    ),
  );
  const said = (line: SummaryLine, lead: string) =>
    `${lead}${line.label.padEnd(widest)}  ${line.figure}${line.count === '' ? '' : `    ${line.count}`}`.trimEnd();
  const sections = summary.sections.map((section) =>
    [
      section.heading,
      ...section.equipment.map((line) => said(line, '• ')),
      ...(section.lines.length === 0 ? [`• ${summaryWords.nothing}`] : []),
      ...section.lines.map((line) => said(line, '• ')),
      ...(section.total === null ? [] : [`  ${rule}`, said(section.total, '  ')]),
    ].join('\n'),
  );
  return (
    [`${summary.title}\n${summary.subtitle}`, ...sections, summary.closing].join('\n\n') + '\n'
  );
}
