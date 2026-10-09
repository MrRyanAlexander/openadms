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
