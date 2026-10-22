// A project's own page (ARCHITECTURE §14): its name, client, time zone, active window and whether
// it is closed, its kinds of work and contracts, as the API reads them; the way into each of its
// screens is the menu.
import { readProjectEndpoint } from '@open-adms/contracts';
import { ScreenTitle } from '@open-adms/look';

import { Shown, useRead } from '../reading.tsx';
import { day, say, words } from '../words.ts';

export function Project({ projectId }: { readonly projectId: string }) {
  const [read] = useRead(readProjectEndpoint, { params: { projectId } });
  const said = words.project;
  return (
    <main data-screen="project" className="page" id="content">
      <Shown read={read}>
        {(answer) => (
          <>
            <ScreenTitle>{say(said.title, { name: answer.project.name })}</ScreenTitle>
            <dl className="facts">
              <dt>{words.home.timeZone}</dt>
              <dd>{answer.project.timeZone}</dd>
              <dt>{words.home.activeFrom}</dt>
              <dd>{day(answer.project.activeFrom)}</dd>
              <dt>{words.home.activeTo}</dt>
              <dd>
                {answer.project.activeTo === null
                  ? words.common.none
                  : day(answer.project.activeTo)}
              </dd>
              <dt>{words.home.state}</dt>
              <dd>{answer.project.closedAt === null ? words.home.open : words.home.closed}</dd>
            </dl>
          </>
        )}
      </Shown>
    </main>
  );
}
