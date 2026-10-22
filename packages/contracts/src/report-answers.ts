// What the back office reads of money, of its tickets to QC and lock, and of the debris a
// project moved (REQ-406, 409, 410; spec/parts/07 and 09; spec/FROM-BUILD-1.md §9;
// adms-ledger-audit §6.1, §6.1d; ADR-224, 228, 539). **Money is shown to whoever is let see
// review** (ADR-224, 539): a line with its rate and amount, as the ticket's own read shows it. A
// sum of money is the server's, worked out by the database exactly, never added up on a page
// and never through a float. **Debris totals carry no money at all** (the user: "totals for
// debris, not costs or billable amounts"). Every list is a page: `next` is what to send as `after`.
import { fieldEventKinds, mileageSources, qcStatuses, workflows } from '@open-adms/domain';
import { z } from 'zod';

import { ticketStatuses } from './api-answers.ts';
import { billingUnits } from './setup-answers.ts';

const id = z.uuid();
const at = z.iso.datetime();
const day = z.iso.date();
// A number the database keeps exactly, as exact decimal text, never a float.
const exact = z.string().regex(/^-?[0-9]+(\.[0-9]+)?$/);
const named = z.strictObject({ id, name: z.string() });
const count = z.number().int().min(0);

// A lock in force on a ticket, and the batch it names, if any.
const lockShown = z.strictObject({
  id,
  lockedAt: at,
  invoiceBatch: named.nullable(),
});

// ---------------------------------------------------------------------------------------------
// The ledger (REQ-406; AC-07-112, 113; AC-09-11, 28): every line of a project as it stands, the
// current truth (ADR-085), with the ticket it prices and what people have marked on it.

export const ledgerLineSchema = z.strictObject({
  id,
  workflow: z.enum(workflows),
  ticketNumber: z.string(),
  // The property or pile a split's line prices; '' on an ordinary ticket.
  splitSuffix: z.string(),
  // The rule action's # slot.
  slot: z.number().int(),
  payItem: z.strictObject({ id, code: z.string(), description: z.string() }),
  payableType: z.string(),
  unit: z.enum(billingUnits),
  quantity: exact,
  rate: exact,
  amount: exact,
  contract: named,
  prime: named,
  operatingSub: named.nullable(),
  rule: named,
  // The day the line's work counts on, in the project's time zone: its property's or pile's
  // collection, or the unit rate ticket's own field event (the rules' *Ticket date*).
  ticketDate: day,
  // The ticket's status as its field events stand.
  status: z.enum(ticketStatuses),
  qcStatus: z.enum(qcStatuses).nullable(),
  lock: lockShown.nullable(),
  // A load's or a haul-out's line: its property's or pile's mileage (ADR-350 (4)).
  mileage: exact.nullable(),
  mileageSource: z.enum(mileageSources).nullable(),
});

export type LedgerLine = z.infer<typeof ledgerLineSchema>;

// What the lines that match the filters come to, every page of them: how many, and their sum
// to the cent, as the database adds them.
export const ledgerTotalSchema = z.strictObject({ lines: count, amount: exact });

export const ledgerAnswerSchema = z.strictObject({
  lines: z.array(ledgerLineSchema),
  total: ledgerTotalSchema,
  next: id.nullable(),
});

export type LedgerAnswer = z.infer<typeof ledgerAnswerSchema>;

// ---------------------------------------------------------------------------------------------
// A project's tickets of one workflow, any status, to QC and lock (AC-09-08): each with what a
// mark or a lock is written against, its QC mark, its lock, what its lines come to, and, where
// it can't be locked as invoiced now, why, in the domain's own words.

// What a QC mark or a lock names: a load's or a haul-out's completed record (a split as one), or
// a unit rate ticket (ADR-168). None where the ticket has no completed record standing.
export const ticketTargetSchema = z.union([
  z.strictObject({ completedLoadId: id }),
  z.strictObject({ completedHaulOutId: id }),
  z.strictObject({ unitRateTicketId: id }),
]);

export const projectTicketSchema = z.strictObject({
  workflow: z.enum(workflows),
  ticketNumber: z.string(),
  statuses: z.array(z.enum(ticketStatuses)),
  // The day the ticket counts on: its first collection's, or the unit rate ticket's.
  ticketDate: day.nullable(),
  // Its field events by kind and split suffix, as the number shows them: `COL 101001-A`.
  fieldEvents: z.array(
    z.strictObject({ id, kind: z.enum(fieldEventKinds), splitSuffix: z.string() }),
  ),
  target: ticketTargetSchema.nullable(),
  qcStatus: z.enum(qcStatuses).nullable(),
  lock: lockShown.nullable(),
  lines: count,
  amount: exact,
  // Why it can't be locked as invoiced now (`NOT_COMPLETED`, `NOT_QC_APPROVED`, …), or none.
  lockRefusal: z.strictObject({ code: z.string(), message: z.string() }).nullable(),
});

export type ProjectTicket = z.infer<typeof projectTicketSchema>;

export const projectTicketsAnswerSchema = z.strictObject({
  tickets: z.array(projectTicketSchema),
  // The last ticket number of the page.
  next: z.string().nullable(),
});

export type ProjectTicketsAnswer = z.infer<typeof projectTicketsAnswerSchema>;

// ---------------------------------------------------------------------------------------------
// Debris totals (REQ-409; spec/FROM-BUILD-1.md §9): what a project moved in a range of days in
// its time zone, grouped as the email summary groups it. **Never a cost, a rate or an amount.**
// Read by the server each time, kept nowhere: a report is like a printout.

// Cubic yards and tons as exact decimal text; tons only where a weight was taken.
const moved = { cy: exact, tons: exact };

// The trucks, trailers or crews whose badges were scanned, counted by their kind's name.
const equipmentSchema = z.strictObject({
  // The vehicle type's name, or the crew type's.
  name: z.string(),
  crew: z.boolean(),
  count,
});

export const debrisTotalsAnswerSchema = z.strictObject({
  project: z.strictObject({
    id,
    name: z.string(),
    client: z.string(),
    declarationEvent: z.string(),
    // `DR-9001-FL`.
    reference: z.string(),
    programType: z.string(),
    timeZone: z.string(),
  }),
  from: day,
  to: day,
  // The headings, as the project's own forms name its work: the load form's name, …
  headings: z.strictObject({
    loads: z.string(),
    haulOuts: z.string(),
    unitRate: z.string(),
  }),
  // Completed loads by the debris type their collection named: one row a debris type (none where
  // a collection names none).
  loads: z.strictObject({
    rows: z.array(z.strictObject({ debrisType: named.nullable(), loads: count, ...moved })),
    total: z.strictObject({ loads: count, ...moved }),
    equipment: z.array(equipmentSchema),
  }),
  // Completed haul-outs by the site they were dumped at and their debris type.
  haulOuts: z.strictObject({
    rows: z.array(
      z.strictObject({
        site: named.nullable(),
        debrisType: named.nullable(),
        loads: count,
        ...moved,
      }),
    ),
    total: z.strictObject({ loads: count, ...moved }),
    equipment: z.array(equipmentSchema),
  }),
  // Unit rate tickets by the pay item they were worked out at, within its payable type: how
  // many tickets, and what their monitors counted: units, or hours where the work is counted in
  // hours (crew time: each item's hours).
  unitRate: z.strictObject({
    rows: z.array(
      z.strictObject({
        payableType: named.nullable(),
        payItem: z.strictObject({ id, code: z.string(), description: z.string() }).nullable(),
        tickets: count,
        units: exact,
        hours: z.boolean(),
      }),
    ),
    // Units and hours apart: an hour is never added to a count.
    total: z.strictObject({ tickets: count, units: exact, hours: exact }),
    equipment: z.array(equipmentSchema),
  }),
  incidents: z.strictObject({ filed: count, open: count }),
  // Each person with an assignment on the project on a day of the range, once.
  monitorsOnShift: count,
  // Each day of the range: what was moved that day, for a chart.
  byDay: z.array(
    z.strictObject({
      day,
      loads: count,
      loadCy: exact,
      haulOuts: count,
      haulOutCy: exact,
      unitRateTickets: count,
    }),
  ),
});

export type DebrisTotalsAnswer = z.infer<typeof debrisTotalsAnswerSchema>;

// The email summary (REQ-410; spec/FROM-BUILD-1.md §9): the user's shape, as plain text to paste.
export const emailSummaryAnswerSchema = z.strictObject({
  subject: z.string(),
  text: z.string(),
});

export type EmailSummaryAnswer = z.infer<typeof emailSummaryAnswerSchema>;
