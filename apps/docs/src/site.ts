// The documentation site's own facts, in one place: its name, what it says it is, where its source
// lives, and the order of its pages. Read by astro.config.ts (the sidebar), by the Markdown twins and
// by llms.txt / llms-full.txt, so the navigation a person sees is the one an agent is handed.

export const site = {
  title: 'Open ADMS',
  tagline: 'Debris management and field reconciliation for disaster recovery',
  description:
    'Open ADMS is offline-capable, open-source debris management and field reconciliation for ' +
    'disaster recovery: two monitors record each load at the curb and at the dump, the server ' +
    'joins them on the ticket number, flags what disagrees, and keeps an audited ledger.',
  repository: 'https://github.com/MrRyanAlexander/openadms',
  branch: 'main',
  licence: 'Apache-2.0',
} as const;

/** A sidebar group: its label and its pages (content ids), or a nested group of pages. */
export interface NavGroup {
  label: string;
  items: (string | { label: string; items: string[] })[];
}

export const navigation: NavGroup[] = [
  {
    label: 'Get started',
    items: [
      'get-started/what-is-open-adms',
      'get-started/quick-start',
      'get-started/server',
      'get-started/install',
    ],
  },
  {
    label: 'Concepts',
    items: [
      'concepts/two-field-events',
      'concepts/load-call',
      'concepts/statuses',
      'concepts/flags',
      'concepts/ledger-and-audit',
      'concepts/certifications',
      'concepts/assignments-and-phones',
      'concepts/offline-and-sync',
    ],
  },
  {
    label: 'Guides',
    items: [
      {
        label: 'Back office',
        items: [
          'guides/back-office/set-up-a-project',
          'guides/back-office/dispatch',
          'guides/back-office/review-and-correct',
          'guides/back-office/qc-lock-and-deliver',
        ],
      },
      'guides/field-monitors',
      'guides/viewers',
    ],
  },
  {
    label: 'Reference',
    items: [
      'reference/architecture',
      'reference/data-model',
      'reference/flags',
      'reference/lists',
      'reference/configuration',
      'reference/commands',
      'reference/api',
      'reference/glossary',
    ],
  },
  {
    label: 'Project',
    items: ['security', 'contributing', 'licence'],
  },
];

/** Every page id in the order the sidebar shows it, the home page first. */
export function pageOrder(): string[] {
  const ids = ['index'];
  for (const group of navigation) {
    for (const item of group.items) {
      if (typeof item === 'string') ids.push(item);
      else ids.push(...item.items);
    }
  }
  return ids;
}

/** The sidebar section a page sits in, as llms.txt names it ("Guides: Back office"). */
export function sectionOf(id: string): string | undefined {
  for (const group of navigation) {
    for (const item of group.items) {
      if (item === id) return group.label;
      if (typeof item !== 'string' && item.items.includes(id))
        return `${group.label}: ${item.label}`;
    }
  }
  return undefined;
}
