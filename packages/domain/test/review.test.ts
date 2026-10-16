// Who may act on a record after the worker has looked at it, and what a renumber, a picked
// reason and a quarantined record's resolution are told (spec/acceptance/
// 08-review-and-corrections.md AC-08-05, 21, 26, 27, 29, 30; ADR-364), and what a void, an
// unvoid and an acceptance are told (AC-08-33, 37, 40, 48, 49; ADR-365), and what a lock as
// invoiced, an unlock, a change to a locked ticket and a batch's name are told
// (spec/acceptance/09-invoice-deliver-closeout.md AC-09-02, 03, 04, 06, 07, 15, 22; AC-08-55, 62;
// ADR-367).
import { describe, expect, it } from 'vitest';

import {
  AcceptanceWithdrawal,
  BackOfficePhotograph,
  BatchName,
  FlagAccepting,
  FormAnswersGiven,
  InvoiceLocking,
  LockedTicket,
  PickedReason,
  HeldResolution,
  heldSentAs,
  QuarantineResolution,
  Renumber,
  ReprocessAsking,
  Reviewer,
  reviewPermissions,
  TicketOnItsOwn,
  TicketVoiding,
  type LockableTicket,
  type ReviewingPerson,
} from '../src/index.ts';

const luis: ReviewingPerson = {
  name: 'Luis Ortega',
  role: 'MANAGER_ANALYST',
  archived: false,
  granted: ['CORRECT', 'RENUMBER', 'VOID', 'ACCEPT_FLAG', 'QC', 'LOCK_INVOICED'],
};
const dana: ReviewingPerson = { name: 'Dana Reyes', role: 'ADMIN', archived: false, granted: [] };

describe('who may do a reviewer’s action', () => {
  it('AC-08-05 an admin may do each, with no grant of her own', () => {
    for (const permission of reviewPermissions) {
      expect(new Reviewer(dana).refusal(permission), permission).toBeNull();
    }
  });

  it('AC-08-05 a manager/analyst may do each action he is granted, and no other: Luis, granted no unlock, can’t unlock', () => {
    const reviewer = new Reviewer(luis);
    for (const permission of luis.granted) {
      expect(reviewer.refusal(permission as (typeof reviewPermissions)[number])).toBeNull();
    }
    expect(reviewer.refusal('UNLOCK_INVOICED')).toEqual({
      code: 'NOT_PERMITTED',
      message:
        'Luis Ortega may not unlock an invoiced ticket: it takes an admin, or a manager/analyst granted "unlock". Nothing was changed.',
    });
  });

  it('AC-08-05 a manager/analyst without void can’t void, in plain words', () => {
    const withoutVoid = { ...luis, granted: luis.granted.filter((grant) => grant !== 'VOID') };
    expect(new Reviewer(withoutVoid).refusal('VOID')?.message).toBe(
      'Luis Ortega may not void or unvoid a ticket: it takes an admin, or a manager/analyst granted "void". Nothing was changed.',
    );
    expect(new Reviewer(withoutVoid).refusal('CORRECT')).toBeNull();
  });

  it('AC-08-06 a monitor, a read-only viewer and the system actor may do none, whatever a row says they are granted', () => {
    for (const role of ['MONITOR', 'READ_ONLY_VIEWER', 'SYSTEM'] as const) {
      const person = { name: 'Ana Brooks', role, archived: false, granted: [...reviewPermissions] };
      for (const permission of reviewPermissions) {
        expect(new Reviewer(person).refusal(permission)?.code, `${role} ${permission}`).toBe(
          'NOT_PERMITTED',
        );
      }
    }
    expect(
      new Reviewer({ name: 'Ana Brooks', role: 'MONITOR', archived: false, granted: [] }).refusal(
        'CORRECT',
      )?.message,
    ).toBe(
      'Ana Brooks may not correct a record: it takes an admin, or a manager/analyst granted "correct". Nothing was changed.',
    );
  });

  it('a person who has been archived may do none, an admin included', () => {
    expect(new Reviewer({ ...dana, archived: true }).refusal('CORRECT')?.code).toBe(
      'NOT_PERMITTED',
    );
    expect(new Reviewer({ ...luis, archived: true }).refusal('RENUMBER')?.code).toBe(
      'NOT_PERMITTED',
    );
  });
});

const bare = (ticketNumber: string) => ({ ticketNumber, splitSuffix: '' });

describe('a renumber', () => {
  it('AC-08-22 changes the number and nothing else, taken as typed but for the spaces around it', () => {
    const renumber = new Renumber('DISPOSAL', bare('101060'), bare(' 101006 '));
    expect(renumber.refusal()).toBeNull();
    expect(renumber.to).toEqual({ ticketNumber: '101006', splitSuffix: '' });
  });

  it('AC-08-27 onto a number another field event of its kind holds is told so, the number as written', () => {
    expect(new Renumber('DISPOSAL', bare('101021'), bare('101020')).held()).toEqual({
      code: 'NUMBER_HELD',
      message:
        'Ticket 101020 already has a disposal: a ticket has one of each kind. Nothing was changed.',
    });
    expect(
      new Renumber(
        'COLLECTION',
        { ticketNumber: '102001', splitSuffix: 'C' },
        { ticketNumber: '102001', splitSuffix: 'A' },
      ).held().message,
    ).toBe(
      'Ticket 102001-A already has a collection: a ticket has one of each kind. Nothing was changed.',
    );
  });

  it('AC-08-29 of a split’s collection changes its suffix on the same base number', () => {
    const renumber = new Renumber(
      'COLLECTION',
      { ticketNumber: '102001', splitSuffix: 'C' },
      { ticketNumber: '102001', splitSuffix: 'B' },
    );
    expect(renumber.refusal()).toBeNull();
    expect(renumber.to).toEqual({ ticketNumber: '102001', splitSuffix: 'B' });
  });

  it('AC-08-30 of a phantom is refused nothing: whether the work is real is never asked', () => {
    expect(new Renumber('COLLECTION', bare('101031'), bare('101035')).refusal()).toBeNull();
  });

  it('is refused only what can’t be a number: a blank, the number it has, a suffix that isn’t capital letters, a suffix on a kind that takes none', () => {
    const refusalOf = (
      kind: ConstructorParameters<typeof Renumber>[0],
      to: { ticketNumber: string; splitSuffix: string },
    ) => new Renumber(kind, bare('101006'), to).refusal()?.code;
    expect(refusalOf('COLLECTION', bare('  '))).toBe('NUMBER_BLANK');
    expect(refusalOf('COLLECTION', bare('101006'))).toBe('NUMBER_UNCHANGED');
    expect(refusalOf('COLLECTION', { ticketNumber: '101006', splitSuffix: 'b' })).toBe(
      'SUFFIX_NOT_LETTERS',
    );
    expect(refusalOf('HAUL_OUT_COLLECTION', { ticketNumber: '201004', splitSuffix: 'A' })).toBe(
      undefined,
    );
    for (const kind of ['DISPOSAL', 'HAUL_OUT_DISPOSAL', 'UNIT_RATE'] as const) {
      expect(refusalOf(kind, { ticketNumber: '101006', splitSuffix: 'A' }), kind).toBe(
        'SUFFIX_NOT_ON_THIS_KIND',
      );
    }
    expect(
      new Renumber('DISPOSAL', bare('101006'), {
        ticketNumber: '101006',
        splitSuffix: 'A',
      }).refusal()?.message,
    ).toBe('A disposal takes no split suffix: only a split’s collections do. Nothing was changed.');
  });
});

describe('a reason picked from the firm’s list', () => {
  const deviceFailed = { name: 'Device failed', uses: ['BACK_OFFICE_RECORD'], archived: false };

  it('AC-08-21 is one the firm offers for that use: "Device failed" for a record created in the back office', () => {
    expect(new PickedReason(deviceFailed).refusal('BACK_OFFICE_RECORD')).toBeNull();
  });

  it('AC-08-21 another list’s reason, or one the firm archived, is refused in plain words', () => {
    expect(
      new PickedReason({ name: 'Photos confirm', uses: ['ACCEPT_FLAG'], archived: false }).refusal(
        'BACK_OFFICE_RECORD',
      ),
    ).toEqual({
      code: 'REASON_NOT_OFFERED',
      message:
        '"Photos confirm" isn’t a reason the firm offers for a record created in the back office. Nothing was saved.',
    });
    expect(
      new PickedReason({ ...deviceFailed, archived: true }).refusal('BACK_OFFICE_RECORD')?.code,
    ).toBe('REASON_NOT_OFFERED');
    expect(new PickedReason(deviceFailed).refusal('VOID')?.message).toBe(
      '"Device failed" isn’t a reason the firm offers for voiding a ticket. Nothing was saved.',
    );
  });
});

describe('a quarantined record’s resolution', () => {
  it('AC-08-26 says how it was resolved, in words its record keeps', () => {
    const waiting = new QuarantineResolution(null);
    expect(waiting.refusal()).toBeNull();
    expect(waiting.renumbered('101021')).toBe(
      'Renumbered to 101021: saved as a record of its own, with its photographs.',
    );
    expect(waiting.secondCopy()).toBe(
      'A second copy of the record that holds its number: nothing was made from it.',
    );
  });

  it('AC-08-26 is made once: a record already resolved stays as it was resolved', () => {
    expect(
      new QuarantineResolution(
        'Renumbered to 101021: saved as a record of its own, with its photographs.',
      ).refusal(),
    ).toEqual({
      code: 'ALREADY_RESOLVED',
      message:
        'This quarantined record is already resolved (Renumbered to 101021: saved as a record of its own, with its photographs.). Nothing was changed.',
    });
  });

  it('an ROE’s new number is one no ROE of the project holds, and never blank', () => {
    const waiting = new QuarantineResolution(null);
    expect(waiting.roeNumberHeld('R-0007').message).toBe(
      'ROE R-0007: this project already has an ROE with that number. Nothing was changed.',
    );
    expect(waiting.roeNumberHeld('').code).toBe('NUMBER_BLANK');
  });

  it('a quarantined field event is given a ticket number and a quarantined ROE an ROE number: the other kind is refused in plain words', () => {
    const waiting = new QuarantineResolution(null);
    expect(waiting.wrongKindOfNumber('FIELD_EVENT')).toEqual({
      code: 'NOT_THIS_KIND_OF_NUMBER',
      message:
        'This quarantined record is a field event: it is given a ticket number, not an ROE number. Nothing was changed.',
    });
    expect(waiting.wrongKindOfNumber('ROE').message).toBe(
      'This quarantined record is an ROE: it is given an ROE number, not a ticket number. Nothing was changed.',
    );
  });
});

describe('who may accept a flag', () => {
  it('AC-08-05 accept flags is a grant of its own: a manager/analyst granted correct alone can’t accept (the user, 2026-10-06, KD-74)', () => {
    const correctsOnly = new Reviewer({ ...luis, granted: ['CORRECT'] });

    expect(correctsOnly.refusal('CORRECT')).toBeNull();
    expect(correctsOnly.refusal('ACCEPT_FLAG')).toEqual({
      code: 'NOT_PERMITTED',
      message:
        'Luis Ortega may not accept a flag: it takes an admin, or a manager/analyst granted "accept flags". Nothing was changed.',
    });
    expect(new Reviewer({ ...luis, granted: ['ACCEPT_FLAG'] }).refusal('CORRECT')?.code).toBe(
      'NOT_PERMITTED',
    );
  });
});

describe('a person’s void and unvoid', () => {
  const ticket = { ticketNumber: '301003', fieldEvents: 1, voidInForce: false, standsVoid: false };

  it('AC-08-31 a ticket that isn’t void may be voided; whether the work happened isn’t asked', () => {
    expect(new TicketVoiding(ticket).voidRefusal()).toBeNull();
  });

  it('AC-08-33 a void names a ticket: a number no field event is under is refused', () => {
    expect(
      new TicketVoiding({ ...ticket, ticketNumber: '301099', fieldEvents: 0 }).voidRefusal(),
    ).toEqual({
      code: 'NOT_A_TICKET',
      message:
        'No field event of this project is under 301099: there is no such ticket to void. Nothing was saved.',
    });
  });

  it('a void ticket isn’t voided again, whether a person voided it or a rule did', () => {
    const already = {
      code: 'ALREADY_VOID',
      message: 'Ticket 301003 is already void. Nothing was saved.',
    };
    expect(new TicketVoiding({ ...ticket, voidInForce: true }).voidRefusal()).toEqual(already);
    expect(new TicketVoiding({ ...ticket, standsVoid: true }).voidRefusal()).toEqual(already);
  });

  it('AC-08-37, 38 an unvoid lifts a person’s void and a rule’s; a ticket that isn’t void has nothing to lift', () => {
    expect(new TicketVoiding({ ...ticket, voidInForce: true }).unvoidRefusal()).toBeNull();
    expect(new TicketVoiding({ ...ticket, standsVoid: true }).unvoidRefusal()).toBeNull();
    expect(new TicketVoiding(ticket).unvoidRefusal()).toEqual({
      code: 'NOT_VOID',
      message: 'Ticket 301003 isn’t void. Nothing was changed.',
    });
  });
});

describe('an acceptance taken back, answers given and a photograph added in the back office (ADR-534)', () => {
  it('AC-08-70 an acceptance standing may be taken back, once', () => {
    const message = 'Ticket 101003: load call 96%. Flagged for review.';
    expect(new AcceptanceWithdrawal({ message, withdrawn: false }).refusal()).toBeNull();
    expect(new AcceptanceWithdrawal({ message, withdrawn: true }).refusal()).toEqual({
      code: 'ALREADY_WITHDRAWN',
      message:
        'This acceptance was already taken back ("Ticket 101003: load call 96%. Flagged for review."). Nothing was changed.',
    });
  });

  it('AC-08-69 answers that don’t fit say which fields, by their labels; another form’s version and none at all are told so', () => {
    expect(FormAnswersGiven.notFitting(2, ['Photos taken?'])).toEqual({
      code: 'ANSWERS_DO_NOT_FIT',
      message:
        'The answers don’t fit the form’s own fields as version 2 has them (Photos taken?). Nothing was saved.',
    });
    expect(FormAnswersGiven.notFitting(1, []).message).toBe(
      'The answers don’t fit the form’s own fields as version 1 has them. Nothing was saved.',
    );
    expect(FormAnswersGiven.notThisForm('survey').code).toBe('ANSWERS_DO_NOT_FIT');
    expect(FormAnswersGiven.noFields().code).toBe('ANSWERS_DO_NOT_FIT');
  });

  it('AC-10-92 a photograph goes only on a record made in the back office, and a view only on a certification’s', () => {
    expect(BackOfficePhotograph.notMadeInTheBackOffice('ROE')).toEqual({
      code: 'NOT_MADE_IN_THE_BACK_OFFICE',
      message:
        'This ROE was made on a phone: its photographs are its phone’s, and none is added in the back office. Nothing was saved.',
    });
    expect(BackOfficePhotograph.viewOnlyOnACertification().code).toBe('VIEW_NOT_ON_THIS_RECORD');
  });
});

describe('accepting a flag', () => {
  const message = 'Ticket 101003: load call 96%. Flagged for review.';

  it('AC-08-43 a flag that stands and nobody has accepted may be accepted', () => {
    expect(new FlagAccepting({ message, cleared: false, accepted: false }).refusal()).toBeNull();
  });

  it('AC-08-49 a flag is accepted once', () => {
    expect(new FlagAccepting({ message, cleared: false, accepted: true }).refusal()).toEqual({
      code: 'ALREADY_ACCEPTED',
      message:
        'This flag is already accepted ("Ticket 101003: load call 96%. Flagged for review."). Nothing was saved.',
    });
  });

  it('AC-08-40 a flag the worker has cleared is history: there is nothing to accept', () => {
    expect(new FlagAccepting({ message, cleared: true, accepted: false }).refusal()).toEqual({
      code: 'FLAG_CLEARED',
      message:
        'This flag no longer stands ("Ticket 101003: load call 96%. Flagged for review."): there is nothing to accept. Nothing was saved.',
    });
  });
});

describe('locking a ticket as invoiced', () => {
  const approved: LockableTicket = {
    ticketNumber: '101001',
    dissolved: false,
    statuses: ['COMPLETED'],
    qcStatus: 'QC_APPROVED',
    locked: false,
  };

  it('AC-09-01, 06 a ticket that is whole, COMPLETED and QC Approved locks', () => {
    expect(new InvoiceLocking(approved).lockRefusal()).toBeNull();
  });

  it('AC-09-02 QC Review, QC Issues and QC Void all block: only a QC Approved ticket locks', () => {
    const told = (['QC_REVIEW', 'QC_ISSUES', 'QC_VOID'] as const).map(
      (qcStatus) => new InvoiceLocking({ ...approved, qcStatus }).lockRefusal()?.message,
    );
    expect(told).toEqual([
      'Ticket 101001 is at QC Review: only a QC Approved ticket can be locked as invoiced. Nothing was locked.',
      'Ticket 101001 is at QC Issues: only a QC Approved ticket can be locked as invoiced. Nothing was locked.',
      'Ticket 101001 is at QC Void: only a QC Approved ticket can be locked as invoiced. Nothing was locked.',
    ]);
    expect(new InvoiceLocking({ ...approved, qcStatus: 'QC_ISSUES' }).lockRefusal()?.code).toBe(
      'NOT_QC_APPROVED',
    );
  });

  it('AC-09-03, 04 a ticket in review is resolved first, QC Approved or not', () => {
    expect(
      new InvoiceLocking({
        ...approved,
        ticketNumber: '101003',
        statuses: ['MANUAL_REVIEW'],
      }).lockRefusal(),
    ).toEqual({
      code: 'NOT_COMPLETED',
      message:
        'Ticket 101003 is in review: every flag on it is fixed or accepted before it is locked as invoiced. Nothing was locked.',
    });
  });

  it('a void ticket bills nothing and isn’t locked; a ticket that isn’t completed yet neither', () => {
    expect(
      new InvoiceLocking({
        ...approved,
        ticketNumber: '301003',
        statuses: ['VOID'],
      }).lockRefusal(),
    ).toEqual({
      code: 'NOT_COMPLETED',
      message:
        'Ticket 301003 is void: it bills nothing and isn’t locked as invoiced. Nothing was locked.',
    });
    expect(new InvoiceLocking({ ...approved, statuses: ['PENDING'] }).lockRefusal()?.message).toBe(
      'Ticket 101001 isn’t completed yet. Nothing was locked.',
    );
    expect(new InvoiceLocking({ ...approved, statuses: [] }).lockRefusal()?.code).toBe(
      'NOT_COMPLETED',
    );
  });

  it('a ticket whose completed record was dissolved has nothing to lock', () => {
    expect(new InvoiceLocking({ ...approved, dissolved: true }).lockRefusal()).toEqual({
      code: 'NOT_WHOLE',
      message:
        'Ticket 101001 is no longer whole: there is nothing to lock until it is. Nothing was locked.',
    });
  });

  it('AC-09-07 a ticket has one lock in force: a second is refused in plain words', () => {
    expect(new InvoiceLocking({ ...approved, locked: true }).lockRefusal()).toEqual({
      code: 'ALREADY_LOCKED',
      message: 'Ticket 101001 is already locked as invoiced. Nothing was changed.',
    });
  });

  it('AC-09-22 an unlock asks only that the ticket is locked, whatever else has changed since', () => {
    expect(
      new InvoiceLocking({
        ...approved,
        locked: true,
        qcStatus: 'QC_ISSUES',
        statuses: ['MANUAL_REVIEW'],
      }).unlockRefusal(),
    ).toBeNull();
    expect(new InvoiceLocking(approved).unlockRefusal()).toEqual({
      code: 'NOT_LOCKED',
      message: 'Ticket 101001 isn’t locked as invoiced. Nothing was changed.',
    });
  });

  it('AC-09-15 a change to a locked ticket’s own records is refused: it is unlocked first', () => {
    expect(new LockedTicket([]).refusal()).toBeNull();
    expect(new LockedTicket(['101001', '101003']).refusal()).toEqual({
      code: 'LOCKED_AS_INVOICED',
      message: 'Ticket 101001 is locked as invoiced: unlock it first. Nothing was changed.',
    });
  });

  it('AC-08-55, 62 only a unit rate ticket is QC’d or locked as its one field event', () => {
    expect(new TicketOnItsOwn('UNIT_RATE').refusal()).toBeNull();
    expect(new TicketOnItsOwn('COLLECTION').refusal()).toEqual({
      code: 'NOT_QCD_ALONE',
      message:
        'A collection is never QC’d or locked on its own: its completed load or haul-out is, once the ticket is whole. Nothing was saved.',
    });
    expect(new TicketOnItsOwn('HAUL_OUT_DISPOSAL').refusal()?.code).toBe('NOT_QCD_ALONE');
  });

  it('AC-09-09 a batch has a name, used once on its project', () => {
    const named = new BatchName('  Bayline ROW, week of 12 Oct ');
    expect([named.name, named.refusal()]).toEqual(['Bayline ROW, week of 12 Oct', null]);
    expect(new BatchName('   ').refusal()).toEqual({
      code: 'BATCH_NAME_BLANK',
      message: 'An invoice batch needs a name. Nothing was saved.',
    });
    expect(named.used().message).toBe(
      'This project already has an invoice batch named "Bayline ROW, week of 12 Oct". Nothing was saved.',
    );
    expect(BatchName.onAnotherProject().code).toBe('BATCH_ON_ANOTHER_PROJECT');
  });
});

describe('a reprocess a person asks for with nothing changed (ADR-498)', () => {
  const ticket = (ticketNumber: string, fieldEvents = 2) => ({ ticketNumber, fieldEvents });

  it('asks for as many tickets as one job names at the most, each a ticket of the project', () => {
    const asking = new ReprocessAsking(3);
    expect(asking.ticketsRefusal([ticket('101001'), ticket('101003'), ticket('301001', 1)])).toBe(
      null,
    );
    expect(
      asking.ticketsRefusal([
        ticket('101001'),
        ticket('101002'),
        ticket('101003'),
        ticket('101004'),
      ]),
    ).toEqual({
      code: 'TOO_MANY_TICKETS',
      message:
        '4 tickets were named: a reprocess asks for 3 at the most. Ask for them in parts. Nothing was queued.',
    });
    expect(asking.countRefusal(3)).toBeNull();
    expect(asking.countRefusal(4)?.code).toBe('TOO_MANY_TICKETS');
    expect(asking.ticketsRefusal([ticket('101001'), ticket('101077', 0)])).toEqual({
      code: 'NOT_A_TICKET',
      message:
        'No field event of this project is under 101077: there is no such ticket to reprocess. Nothing was queued.',
    });
  });

  it('puts back only a job of the project the worker set aside', () => {
    expect(ReprocessAsking.jobRefusal({ onThisProject: true, setAside: true })).toBeNull();
    expect(ReprocessAsking.jobRefusal({ onThisProject: true, setAside: false })).toEqual({
      code: 'NOT_SET_ASIDE',
      message:
        'That job isn’t set aside: it waits for the worker, or the worker has finished it. Nothing was queued.',
    });
    expect(ReprocessAsking.jobRefusal({ onThisProject: false, setAside: true })).toEqual({
      code: 'NOT_ON_THIS_PROJECT',
      message: 'That job is another project’s. Nothing was queued.',
    });
  });
});

describe('what a sync held, resolved (ADR-526 (2), (3))', () => {
  const id = '0199c2d4-1a00-7000-8000-000000101022';

  it('AC-10-74 a held record is saved under the id its phone made, as the kind it was sent as; a report and one with no id are not saved so', () => {
    const waiting = new HeldResolution(null);
    expect(waiting.refusal()).toBeNull();
    for (const kind of heldSentAs.filter((one) => one !== 'REPORT')) {
      expect(waiting.savingRefusal({ sentId: id, sentAs: kind }, { id, kind }), kind).toBeNull();
    }
    // What was sent may say no kind: then it is saved as the reviewer says.
    expect(waiting.savingRefusal({ sentId: id, sentAs: null }, { id, kind: 'SURVEY' })).toBeNull();
    expect(
      [
        waiting.savingRefusal({ sentId: id, sentAs: 'REPORT' }, { id, kind: 'FIELD_EVENT' }),
        waiting.savingRefusal({ sentId: null, sentAs: 'FIELD_EVENT' }, { id, kind: 'FIELD_EVENT' }),
        waiting.savingRefusal(
          { sentId: id, sentAs: 'FIELD_EVENT' },
          { id: '0199c2d4-1a00-7000-8000-000000101023', kind: 'FIELD_EVENT' },
        ),
        waiting.savingRefusal({ sentId: id, sentAs: 'FIELD_EVENT' }, { id, kind: 'ROE' }),
        waiting.savingRefusal({ sentId: id, sentAs: 'PHOTO' }, { id, kind: 'CERTIFICATION' }),
      ].map((refusal) => refusal?.code),
    ).toEqual([
      'CLOSED_ONLY',
      'NO_ID_SENT',
      'NOT_THE_ID_SENT',
      'NOT_THE_KIND_SENT',
      'NOT_THE_KIND_SENT',
    ]);
    expect(
      waiting.savingRefusal({ sentId: id, sentAs: 'FIELD_EVENT' }, { id, kind: 'ROE' })?.message,
    ).toBe('This held record was sent as a field event: it is saved as one. Nothing was changed.');
    expect(
      waiting.savingRefusal(
        { sentId: id, sentAs: 'CERTIFICATION' },
        { id: '0199c2d4-1a00-7000-8000-000000101023', kind: 'CERTIFICATION' },
      )?.message,
    ).toBe(
      `A record saved from a held one keeps the id its phone made, ${id}. Nothing was changed.`,
    );
  });

  it('AC-10-75 says how it was resolved, in words its record keeps, and is resolved once', () => {
    const waiting = new HeldResolution(null);
    expect(waiting.saved('CERTIFICATION')).toBe(
      'Saved as corrected: a certification under the id its phone made, with its photographs.',
    );
    expect(waiting.closed()).toBe(
      'Closed, never to be saved: what was sent stays here, with its photographs.',
    );
    expect(new HeldResolution(null, 'SET_ASIDE_FILE').closed()).toBe(
      'Closed: the photograph’s own file won’t come; this file stays beside it.',
    );
    expect(new HeldResolution('Closed, never to be saved.').refusal()).toEqual({
      code: 'ALREADY_RESOLVED',
      message:
        'This held record is already resolved (Closed, never to be saved.). Nothing was changed.',
    });
    expect(new HeldResolution('Closed.', 'SET_ASIDE_FILE').refusal()?.message).toBe(
      'This file set aside is already resolved (Closed.). Nothing was changed.',
    );
    expect(waiting.certNumberHeld('730416')).toEqual({
      code: 'NUMBER_HELD',
      message: 'This project already has a certification 730416. Nothing was changed.',
    });
    expect(waiting.notInTheProjectSent().code).toBe('NOT_IN_THE_PROJECT_SENT');
  });
});
