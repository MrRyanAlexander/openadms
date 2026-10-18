// Home (ADR-561 (4)): the day's assignment, its project and its one site where the work is at one,
// with a large button for each kind of work it allows, at the bottom in thumb reach. What the
// assignment allows is the phone's lists' (task 3.2.3); this screen only shows it.
import type { ReactNode } from 'react';

import { Button, StatusStrip, type Standing } from './look/index.ts';
import { words } from './words.ts';

export type Work = keyof typeof words.home.start;

export function Home({
  standing,
  project,
  site,
  works,
  onStart,
  children,
  after,
}: {
  readonly standing: Standing;
  readonly project: string;
  // None for work at the curb.
  readonly site: string | null;
  readonly works: readonly Work[];
  readonly onStart: (work: Work) => void;
  // Anything the screen shows below the assignment, and below the work's buttons (none yet).
  readonly children?: ReactNode;
  readonly after?: ReactNode;
}) {
  return (
    <main data-screen="home" className="screen">
      <StatusStrip standing={standing} />
      <div className="screen-body">
        <h1>{words.home.title}</h1>
        <dl className="facts">
          <dt>{words.home.project}</dt>
          <dd>{project}</dd>
          {site === null ? null : (
            <>
              <dt>{words.home.site}</dt>
              <dd>{site}</dd>
            </>
          )}
        </dl>
        {children}
      </div>
      <div className="screen-actions">
        {works.map((work, place) => (
          <Button
            key={work}
            main={place === 0}
            wide
            onPress={() => {
              onStart(work);
            }}
          >
            {words.home.start[work]}
          </Button>
        ))}
      </div>
      {after}
    </main>
  );
}
