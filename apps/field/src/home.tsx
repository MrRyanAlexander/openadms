// Home (ADR-561 (4)): the day's assignment, its project and its one site where the work is at one,
// with a large button for each kind of work it allows, at the bottom in thumb reach. What the
// assignment allows is the one the phone took at sign-in (task 3.2.3, ADR-574); this screen only
// shows it. A work whose capture screens are built starts from its button (the collection, task
// 3.5.1; a disposal and a haul-out's two ends, task 3.5.2); the others are shown and can't be
// pressed until their tasks (3.5.3…3.5.5).
//
// Task 3.5.1 (ADR-571, 573, 581): **the monitor's own count of today's tickets** (the user, Q-216;
// AC-11-80), nothing ranked or compared; **the open tickets**, each by its truck and number, opened
// where it was left (AC-11-75); and a word when fewer than two days' worth of ticket numbers are
// left (ADR-065).
import type { ReactNode } from 'react';

import { Banner, Button, ListRow, StatusStrip, type Standing } from './look/index.ts';
import type { Work } from './phone/works.ts';
import { words } from './words.ts';

export type { Work };

// One open ticket as home lists it.
export interface OpenRow {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
}

export function Home({
  standing,
  project,
  site,
  works,
  startable = [],
  onStart,
  today,
  open = [],
  onOpen,
  numbersLow = false,
  children,
  after,
}: {
  readonly standing: Standing;
  readonly project: string;
  // None for work at the curb.
  readonly site: string | null;
  readonly works: readonly Work[];
  // The works whose capture is built.
  readonly startable?: readonly Work[];
  readonly onStart?: (work: Work) => void;
  // "Today: 6 tickets", where the monitor's count is shown.
  readonly today?: string;
  readonly open?: readonly OpenRow[];
  readonly onOpen?: (id: string) => void;
  readonly numbersLow?: boolean;
  // Anything the screen shows below the assignment, and below the work's buttons.
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
        {today === undefined ? null : <p>{today}</p>}
        {numbersLow ? (
          <Banner tone="notice">
            <p>{words.home.numbersLow}</p>
          </Banner>
        ) : null}
        {open.length === 0 ? null : (
          <section aria-labelledby="open-tickets">
            <h2 id="open-tickets">{words.home.open.title}</h2>
            <ul className="list-rows">
              {open.map((row) => (
                <li key={row.id}>
                  <ListRow
                    label={row.label}
                    detail={row.detail}
                    onPress={() => {
                      onOpen?.(row.id);
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
        {children}
      </div>
      <div className="screen-actions">
        {works.map((work, place) => (
          <Button
            key={work}
            main={place === 0}
            wide
            isDisabled={onStart === undefined || !startable.includes(work)}
            onPress={() => {
              onStart?.(work);
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
