// What every review screen reads beside its records (spec/parts/08-review-and-corrections.md
// step 1; ADR-224, 539): the project, for its time zone (every time a person reads or types is
// the project's, ADR-100) and whether it is closed, and the names its records are read by
// (`reviewNames`): a field event, a flag and a line name their records by id, and a person reads
// and picks them by name, never by id (invariant 6). Read once for the screen, and again on
// `reread` after an act that may have changed them.
import {
  readProjectEndpoint,
  reviewNamesEndpoint,
  type ProjectRecord,
  type ReviewNamesAnswer,
} from '@open-adms/contracts';
import { ProjectClock } from '@open-adms/domain';
import { createContext, useContext, type ReactNode } from 'react';

import type { Option } from '../look/fields.tsx';
import { Shown, useRead } from '../reading.tsx';
import { say, words } from '../words.ts';

export interface Reviewing {
  readonly project: ProjectRecord;
  readonly clock: ProjectClock;
  readonly names: ReviewNamesAnswer;
}

const ReviewingContext = createContext<Reviewing | null>(null);

export function useReviewing(): Reviewing {
  const reviewing = useContext(ReviewingContext);
  if (reviewing === null) throw new Error('A review screen read its names outside Reviewed.');
  return reviewing;
}

// The project and its names, read, then the screen's own content with them.
export function Reviewed({
  projectId,
  children,
}: {
  readonly projectId: string;
  readonly children: ReactNode;
}) {
  const [project] = useRead(readProjectEndpoint, { params: { projectId } });
  const [names] = useRead(reviewNamesEndpoint, { params: { projectId } });
  return (
    <Shown read={project}>
      {(read) => (
        <Shown read={names}>
          {(named) => (
            <ReviewingContext.Provider
              value={{
                project: read.project,
                clock: new ProjectClock(read.project.timeZone),
                names: named,
              }}
            >
              {children}
            </ReviewingContext.Provider>
          )}
        </Shown>
      )}
    </Shown>
  );
}

interface Named {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
}

// A record's name by its id among those read; one not among them is said to be unknown, never
// shown as an id.
export function nameOf(rows: readonly Named[], id: string | null): string {
  if (id === null) return words.common.none;
  const row = rows.find((each) => each.id === id);
  if (row === undefined) return words.review.unknown;
  return row.archived ? say(words.review.archivedName, { name: row.name }) : row.name;
}

// The records in service as options to pick from, and the one already picked kept among them
// even where it was archived since (an old ticket still names it).
export function optionsOf(
  rows: readonly Named[],
  picked: string | null = null,
  label: (row: Named) => string = (row) => row.name,
): readonly Option[] {
  return rows
    .filter((row) => !row.archived || row.id === picked)
    .map((row) => ({ id: row.id, label: label(row) }));
}

// A person as a reviewer reads them: a monitor with their Monitor ID.
export function personOf(names: ReviewNamesAnswer, id: string | null): string {
  if (id === null) return words.common.none;
  const person = names.people.find((each) => each.id === id);
  if (person === undefined) return words.review.unknown;
  return person.monitorNumber === null || !person.monitor
    ? person.name
    : say(words.review.monitorNamed, { name: person.name, monitorNumber: person.monitorNumber });
}

// The firm's reasons offered for one use, by name (spec/LISTS.md; ADR-302).
export function reasonsFor(names: ReviewNamesAnswer, use: string): readonly Option[] {
  return names.reasons
    .filter((reason) => !reason.archived && reason.uses.includes(use))
    .map((reason) => ({ id: reason.id, label: reason.name }));
}

// A debris type as its form offers it: its name, and the form where the project has more than
// one that offers it.
export function debrisTypeOf(names: ReviewNamesAnswer, id: string | null): string {
  if (id === null) return words.common.none;
  const entry = names.debrisTypes.find((each) => each.id === id);
  if (entry === undefined) return words.review.unknown;
  return say(words.review.debrisTypeOnForm, {
    name: nameOf([entry], entry.id),
    form: entry.formName,
  });
}

// A pay item by its code and description: a monitor never sees one, a reviewer does.
export function payItemOf(names: ReviewNamesAnswer, id: string | null): string {
  if (id === null) return words.common.none;
  const item = names.payItems.find((each) => each.id === id);
  return item === undefined ? words.review.unknown : `${item.code} · ${item.description}`;
}

// An instant as a person reads it, in the project's time zone: 12-Oct-2026 14:35.
export function at(clock: ProjectClock, instant: string): string {
  const moment = new Date(instant);
  return `${clock.date(moment)} ${clock.time(moment)}`;
}
