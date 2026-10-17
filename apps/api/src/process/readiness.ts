// Whether the API can serve now (BACKLOG 2.7.2 part 4, C38; ADR-507): its database answers it, as
// the API's own login, within the statement time limit the login works under. The health answer
// stays the process's alone, so a container's check never fails over the database; this one is
// for whatever decides whether to send the API work (a firm's monitor, a deploy's proxy).
//
// Anybody may ask, so the database is never asked more than once at a time: callers who ask
// while a question is out share its answer. Every request is already counted by address
// (limits.ts). What failed is logged by its kind; the caller hears only `UNAVAILABLE`.
import type { Database } from '@open-adms/db';

import { Refusal } from './refusal.ts';

export const apiReadiness = Symbol('whether the API can serve now');

export class Unavailable extends Refusal {
  constructor() {
    super('UNAVAILABLE', 503);
  }
}

export class Readiness {
  private readonly db: Database;
  private readonly answerMs: number;
  private asking: Promise<boolean> | undefined;

  constructor(db: Database, answerMs: number) {
    this.db = db;
    this.answerMs = answerMs;
  }

  // Answers when the database has; throws `Unavailable` when it didn't, in time or at all.
  async ready(): Promise<void> {
    this.asking ??= this.ask().finally(() => {
      this.asking = undefined;
    });
    if (!(await this.asking)) throw new Unavailable();
  }

  private async ask(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const late = new Promise<false>((resolve) => {
      timer = setTimeout(() => {
        resolve(false);
      }, this.answerMs);
    });
    const answered = this.db
      .$read(async (tx) => {
        await tx.$queryRaw`SELECT 1`;
        return true;
      })
      .catch(() => false);
    try {
      return await Promise.race([answered, late]);
    } finally {
      clearTimeout(timer);
    }
  }
}
