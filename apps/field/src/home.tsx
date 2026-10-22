// Home (ADR-561 (4)): the day's assignment, its project and its one site where the work is at one,
// with a large button for each kind of work it allows, at the bottom in thumb reach. What the
// assignment allows is the one the phone took at sign-in (task 3.2.3, ADR-574); this screen only
// shows it. Each work starts from its button (the collection, task 3.5.1; a disposal and a
// haul-out's two ends, task 3.5.2; unit rate work, task 3.5.3; the forms, task 3.5.4; certifying,
// task 3.5.5), once the lists of its project are held.
//
// Task 3.5.1 (ADR-571, 573, 581): **the monitor's own count of today's tickets** (the user, Q-216;
// AC-11-80), nothing ranked or compared; **the open tickets**, each by its truck and number, opened
// where it was left (AC-11-75); and a word when fewer than two days' worth of ticket numbers are
// left (ADR-065).
//
// Task 3.6.2 (ADR-595): **"Print a receipt again"**, once the monitor has submitted anything on the
// project on this phone: a receipt prints again at any time, and nothing is recorded of it.
//
// Task 3.6.3 (ADR-596): **"Scan a barcode"**, once the phone holds the project's lists: anything
// printed scans back, and the phone says what it holds under the number (`scan.tsx`).
import type { ReactNode } from 'react';

import {
  Banner,
  Button,
  ListRow,
  ScreenActions,
  ScreenTitle,
  StatusStrip,
  type Standing,
} from './look/index.ts';
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
  onReceipts,
  onScanBack,
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
  // Where the monitor has submitted anything here: its receipts printed again.
  readonly onReceipts?: () => void;
  // Where the phone holds the project's lists: a number scanned back.
  readonly onScanBack?: () => void;
  // Anything the screen shows below the assignment, and below the work's buttons.
  readonly children?: ReactNode;
  readonly after?: ReactNode;
}) {
  return (
    <main data-screen="home" className="screen">
      <StatusStrip standing={standing} />
      <div className="screen-body">
        <ScreenTitle>{words.home.title}</ScreenTitle>
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
        {onReceipts === undefined ? null : (
          <Button wide onPress={onReceipts}>
            {words.printing.home}
          </Button>
        )}
        {onScanBack === undefined ? null : (
          <Button wide onPress={onScanBack}>
            {words.scanning.home}
          </Button>
        )}
        {children}
      </div>
      <ScreenActions>
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
      </ScreenActions>
      {after}
    </main>
  );
}
