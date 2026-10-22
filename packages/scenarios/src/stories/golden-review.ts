// The golden mission's review (spec/golden/MISSION.md §2, §4; ADR-368, 500, 603), shared by the
// story `golden-mission`, which checks each act as it goes, and the field app's browser world for
// the golden mission (`MissionWorld`), which does them in a row once the field days are in. Each
// act is Luis Ortega's, at his browser, at its endpoint, by the grants Dana gave him; each one is
// followed by the worker's run of what it queued (`QueueRuns`), whose answer it hands back.
// Nothing here moves the clock: the caller tells it.
//
// - 101003: its flag for the 96% call accepted, Photos confirm, "Heaped; photos confirm".
// - 101060: Kim's disposal renumbered to 101006 (real work: renumber, never void), then its
//   typed-number flag accepted, "Cert, times and photos match 101006".
// - 301003: voided, Duplicate ticket, "Duplicate of 301001" (renumbering it would double-bill).
// - 301005: voided, Not eligible work, "Under 24 in; goes out as vegetative debris".
import {
  acceptFlagEndpoint,
  renumberFieldEventEndpoint,
  voidTicketEndpoint,
  type AnswerOf,
  type Endpoint,
} from '@open-adms/contracts';
import type { RunOutcome } from '@open-adms/worker';

import type { AskedWith } from '../over-https.ts';
import type { StoryContext } from '../runner.ts';
import type { P1BackOffice, QueueRuns } from './p1-office.ts';

export interface Reviewed<A> {
  readonly answer: A;
  // The worker's run of what the act queued.
  readonly run: RunOutcome;
}

export class MissionReview {
  private readonly story: StoryContext;
  private readonly p1: string;
  private readonly backOffice: P1BackOffice;
  private readonly queue: QueueRuns;

  constructor(story: StoryContext, p1: string, backOffice: P1BackOffice, queue: QueueRuns) {
    this.story = story;
    this.p1 = p1;
    this.backOffice = backOffice;
    this.queue = queue;
  }

  // The whole review, in the mission's order.
  async done(): Promise<void> {
    await this.acceptLoadCall();
    await this.renumberTypedDisposal();
    await this.acceptTypedNumber();
    await this.voidDuplicateHanger();
    await this.voidUnderSizeStump();
  }

  acceptLoadCall(): Promise<Reviewed<AnswerOf<typeof acceptFlagEndpoint>>> {
    return this.accepting('101003', 'Heaped; photos confirm');
  }

  async renumberTypedDisposal(): Promise<Reviewed<AnswerOf<typeof renumberFieldEventEndpoint>>> {
    const disposal = await this.story.api.fieldEvent.findFirstOrThrow({
      where: { projectId: this.p1, ticketNumber: '101060', kind: 'DISPOSAL' },
    });
    return this.reviewed(renumberFieldEventEndpoint, {
      ids: { fieldEventId: disposal.id },
      json: { ticketNumber: '101006' },
    });
  }

  acceptTypedNumber(): Promise<Reviewed<AnswerOf<typeof acceptFlagEndpoint>>> {
    return this.accepting('101006', 'Cert, times and photos match 101006');
  }

  voidDuplicateHanger(): Promise<Reviewed<AnswerOf<typeof voidTicketEndpoint>>> {
    return this.voiding('301003', 'Duplicate ticket', 'Duplicate of 301001');
  }

  voidUnderSizeStump(): Promise<Reviewed<AnswerOf<typeof voidTicketEndpoint>>> {
    return this.voiding(
      '301005',
      'Not eligible work',
      'Under 24 in; goes out as vegetative debris',
    );
  }

  // The first flag standing on the ticket, accepted with Photos confirm and the note.
  private async accepting(ticketNumber: string, note: string) {
    const { api } = this.story;
    const flag = await api.flag.findFirstOrThrow({
      where: { projectId: this.p1, ticketNumber, clearedAt: null },
      orderBy: { id: 'asc' },
    });
    return this.reviewed(acceptFlagEndpoint, {
      ids: { flagId: flag.id },
      json: { reasonId: await this.reasonId('Photos confirm'), note },
    });
  }

  private async voiding(ticketNumber: string, reason: string, note: string) {
    return this.reviewed(voidTicketEndpoint, {
      ids: { projectId: this.p1 },
      json: { workflow: 'UNIT_RATE', ticketNumber, reasonId: await this.reasonId(reason), note },
    });
  }

  private async reasonId(name: string): Promise<string> {
    return (await this.story.api.reason.findFirstOrThrow({ where: { name } })).id;
  }

  // Luis's act at his browser, saved, then the worker's run on P1.
  private async reviewed<E extends Endpoint>(
    served: E,
    more: AskedWith,
  ): Promise<Reviewed<AnswerOf<E>>> {
    const answer = await (await this.backOffice.luiss()).answered(served, more);
    return { answer, run: await this.queue.settled(this.p1) };
  }
}
