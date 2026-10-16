// How a setup endpoint answers what its service said (ARCHITECTURE §6, Output; AC-01-80;
// AC-10-33; ADR-316, 422, 424): a saved change with its record, its warnings and what it queued;
// a setting the domain's rules refuse as `NOT_SAVED`, with the rule's own code and its plain
// words; a person who may not change the setup as `NOT_ALLOWED`, the service having asked inside
// its own piece of work. What the database's own constraints refuse is thrown past here and
// answered plainly by the error filter (process/database-refusal.ts). The log says what was done
// or why not, by code: never a name or a value.
import type { FastifyRequest } from 'fastify';

import { Refusal } from '../process/refusal.ts';
import type { Outcome, QueuedBySetup } from './setup-service.ts';

export interface SavedAnswer<A> {
  readonly record: A;
  readonly warnings: { readonly code: string; readonly message: string }[];
  readonly queued?: QueuedBySetup;
}

export function answered<T, A>(
  request: FastifyRequest,
  outcome: Outcome<T>,
  shown: (record: T) => A,
  done: string,
): SavedAnswer<A> {
  if (!outcome.saved) {
    const { code, message } = outcome.refusal;
    request.log.info({ why: code }, 'A setup change was refused.');
    if (code === 'NOT_ALLOWED') throw new Refusal('NOT_ALLOWED', 403);
    throw new Refusal('NOT_SAVED', 422, message, code);
  }
  request.log.info(
    outcome.queued === undefined
      ? {}
      : { tickets: outcome.queued.tickets, lockedAsInvoiced: outcome.queued.lockedAsInvoiced },
    done,
  );
  return {
    record: shown(outcome.record),
    warnings: outcome.warnings.map(({ code, message }) => ({ code, message })),
    ...(outcome.queued === undefined ? {} : { queued: outcome.queued }),
  };
}

// What a body stated: a field left out is left out, never handed on as undefined.
export function stated<T extends object>(sent: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(sent).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}

// A page's size where a search names none.
const searchPage = 50;

// A search as its query says it (ADR-527 (3)): what the name holds (everything where nothing is
// typed), those in service unless the archived ones are asked for, after the last record of the
// page before, 50 at most where no limit is said.
export function searched(query: {
  readonly search?: string | undefined;
  readonly archived?: 'true' | 'false' | undefined;
  readonly after?: string | undefined;
  readonly limit?: string | undefined;
}): { search: string; archived: boolean; after?: string; limit: number } {
  return {
    search: query.search ?? '',
    archived: query.archived === 'true',
    ...(query.after === undefined ? {} : { after: query.after }),
    limit: query.limit === undefined ? searchPage : Number(query.limit),
  };
}

// What a preview answers (ADR-535 (3)): what its save would have said, or why it wouldn't be saved,
// as `wouldSave`; a person who may not change the setup is refused as a save would be.
export function previewed<T, A>(
  request: FastifyRequest,
  outcome: Outcome<T>,
  shown: (record: T) => A,
):
  | {
      wouldSave: true;
      record: A;
      warnings: { code: string; message: string }[];
      queued?: { tickets: number; lockedAsInvoiced: number };
    }
  | { wouldSave: false; reason: string; message: string } {
  if (!outcome.saved) {
    const { code, message } = outcome.refusal;
    request.log.info({ why: code }, 'A setup change was previewed: it would be refused.');
    if (code === 'NOT_ALLOWED') throw new Refusal('NOT_ALLOWED', 403);
    return { wouldSave: false, reason: code, message };
  }
  if (outcome.previewed !== true) throw new Error('A preview saved its change.');
  request.log.info(
    outcome.queued === undefined
      ? {}
      : { tickets: outcome.queued.tickets, lockedAsInvoiced: outcome.queued.lockedAsInvoiced },
    'A setup change was previewed.',
  );
  return {
    wouldSave: true,
    record: shown(outcome.record),
    warnings: outcome.warnings.map(({ code, message }) => ({ code, message })),
    ...(outcome.queued === undefined
      ? {}
      : {
          queued: {
            tickets: outcome.queued.tickets,
            lockedAsInvoiced: outcome.queued.lockedAsInvoiced,
          },
        }),
  };
}
