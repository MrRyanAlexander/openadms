// The firm's projects (ARCHITECTURE §14): the one paged table, open ones first by default, each
// project's name the way into it. Every screen of a project is reached from here or from the
// project picker in the header.
import { listProjectsEndpoint, type ProjectRecord } from '@open-adms/contracts';
import { ScreenTitle } from '@open-adms/look';
import { useState } from 'react';
import { Link } from 'react-aria-components';

import { ChoiceField } from '../look/fields.tsx';
import { PagedTable } from '../look/paged-table.tsx';
import { day, words } from '../words.ts';

type Which = 'false' | 'true' | 'every';

export function Home() {
  const said = words.home;
  const [which, setWhich] = useState<Which>('false');
  return (
    <main data-screen="projects" className="page" id="content">
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      <ChoiceField
        label={said.whichProjects}
        value={which}
        onChange={(value) => {
          setWhich(value as Which);
        }}
        options={[
          { id: 'false', label: said.openOnly },
          { id: 'true', label: said.closedOnly },
          { id: 'every', label: said.every },
        ]}
      />
      <PagedTable
        caption={said.title}
        served={listProjectsEndpoint}
        asking={{ query: { limit: '50', ...(which === 'every' ? {} : { closed: which }) } }}
        rowsOf={(answer) => answer.projects}
        nextOf={(answer) => answer.next}
        keyOf={(project: ProjectRecord) => project.id}
        columns={[
          {
            label: said.name,
            names: true,
            cell: (project) => (
              <Link className="link" href={`/projects/${project.id}`}>
                {project.name}
              </Link>
            ),
          },
          { label: said.timeZone, cell: (project) => project.timeZone },
          { label: said.activeFrom, cell: (project) => day(project.activeFrom) },
          {
            label: said.activeTo,
            cell: (project) =>
              project.activeTo === null ? words.common.none : day(project.activeTo),
          },
          {
            label: said.state,
            cell: (project) => (project.closedAt === null ? said.open : said.closed),
          },
        ]}
      />
    </main>
  );
}
