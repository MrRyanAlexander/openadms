// The checks on a load's and a haul-out's quantity (spec/acceptance/06-reconciliation.md
// AC-06-80, 85…90, 92…95, 129, 132, 138, 158, 162; spec/FLAGS.md §3.5, §3.10; ADR-347, 348). Each message is the
// catalogue's, word for word. The values are the example world's (spec/CONVENTIONS.md §6), the
// golden mission's (101003, 201004, the tandem 101050 and 101051) and the catalogue's own
// example tickets: P1 on America/New_York, its load-call limits 5 and 95.
import { describe, expect, it } from 'vitest';

import {
  QuantityChecks,
  Tickets,
  type CarriedTicketRead,
  type CheckedReceipt,
  type FieldEventKindName,
  type FlagRaised,
  type Named,
  type QuantifiedFieldEvent,
  type QuantitySetup,
  type ReceiptWeights,
  type WorkflowName,
} from '../src/index.ts';

const p1 = '0199a000-0000-7000-8000-0000000000a1';

const at = (day: string, time: string): Date => new Date(`${day}T${time}:00-04:00`);
const mon = '2026-10-12';

const vegetative: Named = { id: 'entry-vegetative', name: 'Vegetative' };
const cAndD: Named = { id: 'entry-c-and-d', name: 'C&D' };

const workflowOf: Record<FieldEventKindName, WorkflowName> = {
  COLLECTION: 'LOAD',
  DISPOSAL: 'LOAD',
  HAUL_OUT_COLLECTION: 'HAUL_OUT',
  HAUL_OUT_DISPOSAL: 'HAUL_OUT',
  UNIT_RATE: 'UNIT_RATE',
};

let made = 0;
// A field event as written, "101003" or "201004-A", half an hour long, ending at `end`.
function recorded(
  kind: FieldEventKindName,
  written: string,
  end: Date,
  more: Partial<QuantifiedFieldEvent> = {},
): QuantifiedFieldEvent {
  const [ticketNumber = '', splitSuffix = ''] = written.split('-');
  made += 1;
  return {
    id: `0199d000-0000-7000-8000-${String(made).padStart(12, '0')}`,
    projectId: p1,
    workflow: workflowOf[kind],
    kind,
    ticketNumber,
    splitSuffix,
    startedAt: new Date(end.getTime() - 30 * 60_000),
    endedAt: end,
    loadCall: null,
    scaleReceipt: null,
    ...more,
  };
}

const collection = (written: string) => recorded('COLLECTION', written, at(mon, '09:40'));
const disposal = (written: string, more: Partial<QuantifiedFieldEvent> = {}) =>
  recorded('DISPOSAL', written, at(mon, '10:30'), more);
const called = (written: string, loadCall: number) => [
  collection(written),
  disposal(written, { loadCall }),
];
const pile = (written: string, loadCall: number | null, time: string) =>
  recorded('HAUL_OUT_COLLECTION', written, at(mon, time), { loadCall });
const haulOutDisposal = (written: string, more: Partial<QuantifiedFieldEvent> = {}) =>
  recorded('HAUL_OUT_DISPOSAL', written, at(mon, '15:00'), more);

const p1Setup = (more: Partial<QuantitySetup> = {}): QuantitySetup => ({
  timeZone: 'America/New_York',
  loadCallLowLimit: 5,
  loadCallHighLimit: 95,
  ...more,
});

function flagsOf(
  events: readonly QuantifiedFieldEvent[],
  setup: Partial<QuantitySetup> = {},
  carried: readonly CarriedTicketRead[] = [],
): readonly FlagRaised[] {
  const [ticket] = new Tickets(events).tickets;
  if (ticket === undefined) throw new Error('No ticket.');
  return new QuantityChecks(p1Setup(setup)).of(ticket, { carried });
}
const messagesOf = (flags: readonly FlagRaised[]): string[] => flags.map((flag) => flag.message);

const weighed = (more: Partial<ReceiptWeights> = {}): ReceiptWeights => ({
  grossWeightLb: null,
  tareWeightLb: null,
  netWeightLb: null,
  netWeightTons: null,
  ...more,
});

describe('the load call', () => {
  it('AC-06-85 a 0% call is flagged whatever the limits, and with them switched off: not billed, and said once', () => {
    const [col, dis] = called('101032', 0);
    if (col === undefined || dis === undefined) throw new Error('No load.');
    const flags = flagsOf([col, dis]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101032: load call 0%. Flagged for review; not billed.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'LOAD_CALL_ZERO',
      billing: 'NOT_BILLED',
      fieldEventId: dis.id,
      facts: { loadCall: 0 },
    });
    expect(
      messagesOf(flagsOf([col, dis], { loadCallLowLimit: null, loadCallHighLimit: null })),
    ).toEqual(['Ticket 101032: load call 0%. Flagged for review; not billed.']);
  });

  it('AC-06-86 at P1’s low limit of 5, a call of 4% is flagged and still bills; 5% too; 6% is not', () => {
    const flags = flagsOf(called('101033', 4));

    expect(messagesOf(flags)).toEqual(['Ticket 101033: load call 4%. Flagged for review.']);
    expect(flags[0]).toMatchObject({
      code: 'LOAD_CALL_LOW',
      billing: 'BILLS',
      facts: { loadCall: 4, limit: 5 },
    });
    expect(flagsOf(called('101033', 5)).map((flag) => flag.code)).toEqual(['LOAD_CALL_LOW']);
    expect(flagsOf(called('101033', 6))).toEqual([]);
  });

  it('AC-06-87 at P1’s high limit of 95, 101003’s call of 96% is flagged and still bills; 95% too; 94% is not', () => {
    const flags = flagsOf(called('101003', 96));

    expect(messagesOf(flags)).toEqual(['Ticket 101003: load call 96%. Flagged for review.']);
    expect(flags[0]).toMatchObject({ code: 'LOAD_CALL_HIGH', billing: 'BILLS' });
    expect(flagsOf(called('101003', 95)).map((flag) => flag.code)).toEqual(['LOAD_CALL_HIGH']);
    expect(flagsOf(called('101003', 94))).toEqual([]);
  });

  it('AC-06-138 a load-call flag keeps the call and the limit it was raised on: a changed limit that still flags it is a new flag', () => {
    const load = called('101003', 96);
    const [at95] = flagsOf(load);
    const [at96] = flagsOf(load, { loadCallHighLimit: 96 });

    expect(at95?.facts).toEqual({ loadCall: 96, limit: 95 });
    expect(at96?.facts).toEqual({ loadCall: 96, limit: 96 });
    expect(at96?.factsSha256).not.toBe(at95?.factsSha256);
    expect(flagsOf(load)[0]?.factsSha256).toBe(at95?.factsSha256);
  });

  it('AC-06-88 the limits are the project’s settings: raised to 98, or switched off, a 96% call is no longer flagged', () => {
    const load = called('101003', 96);

    expect(flagsOf(load, { loadCallHighLimit: 98 })).toEqual([]);
    expect(flagsOf(load, { loadCallLowLimit: null, loadCallHighLimit: null })).toEqual([]);
    expect(flagsOf(called('101033', 4), { loadCallLowLimit: null })).toEqual([]);
  });

  it('a load still waiting for its disposal has no call to judge', () => {
    expect(flagsOf([collection('101005')])).toEqual([]);
  });

  it('a haul-out’s call is its collection’s, at the loading end: judged before its disposal syncs', () => {
    expect(messagesOf(flagsOf([pile('201001', 97, '13:00')]))).toEqual([
      'Ticket 201001: load call 97%. Flagged for review.',
    ]);
  });
});

describe('a split haul-out’s piles', () => {
  const piles201004 = (a: number | null, b: number | null, c: number | null) => [
    pile('201004-A', a, '13:00'),
    pile('201004-B', b, '13:30'),
    pile('201004-C', c, '14:00'),
    haulOutDisposal('201004'),
  ];

  it('AC-06-89 calls of 10%, 35%, 85% flag nothing; a first pile called 4% isn’t flagged either: the limits judge only the last pile’s call', () => {
    expect(flagsOf(piles201004(10, 35, 85))).toEqual([]);
    expect(flagsOf(piles201004(4, 35, 85))).toEqual([]);
  });

  it('AC-06-89 the last pile’s call is the haul-out’s: at 96% it is flagged, about that pile', () => {
    const events = piles201004(10, 35, 96);
    const flags = flagsOf(events);

    expect(messagesOf(flags)).toEqual(['Ticket 201004: load call 96%. Flagged for review.']);
    expect(flags[0]?.fieldEventId).toBe(events[2]?.id);
  });

  it('AC-06-90 pile -B at 30% after pile -A at 35% is flagged, not billed, with every pile’s call kept', () => {
    const a = pile('201004-A', 35, '13:00');
    const b = pile('201004-B', 30, '13:30');
    const flags = flagsOf([a, b, haulOutDisposal('201004')]);

    expect(messagesOf(flags)).toEqual([
      "Ticket 201004: pile -B's load call 30% is not higher than pile -A's 35%. Flagged for review; not billed.",
    ]);
    expect(flags[0]).toMatchObject({
      code: 'PILE_CALL_NOT_HIGHER',
      billing: 'NOT_BILLED',
      fieldEventId: b.id,
      facts: {
        piles: [
          ['A', 35],
          ['B', 30],
        ],
      },
    });
  });

  it('AC-06-90 a pile called the same as the one before it added nothing that can be worked out', () => {
    expect(flagsOf(piles201004(10, 10, 85)).map((flag) => flag.code)).toEqual([
      'PILE_CALL_NOT_HIGHER',
    ]);
  });

  it('until its disposal is in, a split haul-out’s piles aren’t read: another may still be to sync', () => {
    expect(flagsOf([pile('201004-A', 35, '13:00'), pile('201004-B', 30, '13:30')])).toEqual([]);
    expect(flagsOf([pile('201004-A', 10, '13:00'), pile('201004-B', 97, '13:30')])).toEqual([]);
  });

  it('a pile with no call isn’t worded here: its missing detail is flagged as that', () => {
    expect(flagsOf(piles201004(10, null, 85))).toEqual([]);
  });
});

describe('a scale receipt', () => {
  // The tandem's one receipt at Bayline County Landfill: 62,400 lb gross, 28,200 lb tare,
  // 17.10 tons, on the truck body's disposal (30 CY) and the trailer's (40 CY).
  const body = disposal('101050');
  const trailer = disposal('101051');
  const tandem = (more: Partial<CheckedReceipt> = {}): CheckedReceipt => ({
    id: 'receipt-bcl-88241',
    receiptNumber: 'BCL-88241',
    weights: weighed({
      grossWeightLb: '62400.00',
      tareWeightLb: '28200.00',
      netWeightLb: '34200.00',
      netWeightTons: '17.1000',
    }),
    disposals: [
      { fieldEventId: body.id, ticketNumber: '101050', capacityCy: 30, debrisType: vegetative },
      {
        fieldEventId: trailer.id,
        ticketNumber: '101051',
        capacityCy: 40,
        debrisType: vegetative,
      },
    ],
    ...more,
  });
  const on = (event: QuantifiedFieldEvent, scaleReceipt: CheckedReceipt) => [
    collection(event.ticketNumber),
    { ...event, scaleReceipt },
  ];

  it('AC-06-80 one weight on two containers’ disposals: both tickets are flagged, each at its share by certified capacity', () => {
    const onBody = flagsOf(on(body, tandem()));
    const onTrailer = flagsOf(on(trailer, tandem()));

    expect(messagesOf(onBody)).toEqual([
      'Ticket 101050: one scale weight shared by two containers, split by certified capacity (7.33 of 17.10 tons). Flagged for review.',
    ]);
    expect(messagesOf(onTrailer)).toEqual([
      'Ticket 101051: one scale weight shared by two containers, split by certified capacity (9.77 of 17.10 tons). Flagged for review.',
    ]);
    expect(onBody[0]).toMatchObject({
      code: 'SHARED_SCALE_WEIGHT',
      billing: 'BILLS',
      fieldEventId: body.id,
      facts: {
        scaleReceiptId: 'receipt-bcl-88241',
        netTons: '17.1000',
        shareTons: '7.3300',
        containers: [
          [body.id, 30],
          [trailer.id, 40],
        ],
      },
    });
  });

  it('AC-06-80 a container weighed by itself is no tandem: one disposal on its receipt, no flag', () => {
    const alone = tandem({ disposals: tandem().disposals.slice(0, 1) });
    expect(flagsOf(on(body, alone))).toEqual([]);
  });

  it('a shared weight where a container has no capacity yet gives no share, and none is said', () => {
    const [first, second] = tandem().disposals;
    if (first === undefined || second === undefined) throw new Error('No tandem.');
    const uncertified = tandem({ disposals: [first, { ...second, capacityCy: null }] });
    expect(flagsOf(on(body, uncertified))).toEqual([]);
  });

  it('a truck and trailer hauled out and weighed once are flagged exactly as loads are', () => {
    const dumped = haulOutDisposal('201005');
    const receipt = tandem({
      disposals: [
        { fieldEventId: dumped.id, ticketNumber: '201005', capacityCy: 30, debrisType: vegetative },
        { fieldEventId: 'other', ticketNumber: '201006', capacityCy: 40, debrisType: vegetative },
      ],
    });
    expect(
      flagsOf([pile('201005', 80, '13:00'), { ...dumped, scaleReceipt: receipt }]).map(
        (flag) => flag.code,
      ),
    ).toEqual(['SHARED_SCALE_WEIGHT']);
  });

  it('AC-06-92 the two tickets on one receipt carry Vegetative and C&D: both are flagged and its weight is not used', () => {
    const [first, second] = tandem().disposals;
    if (first === undefined || second === undefined) throw new Error('No tandem.');
    const one = disposal('101052');
    const two = disposal('101053');
    const mixed = tandem({
      disposals: [
        { ...first, fieldEventId: one.id, ticketNumber: '101052' },
        { ...second, fieldEventId: two.id, ticketNumber: '101053', debrisType: cAndD },
      ],
    });
    const flags = flagsOf(on(one, mixed));

    expect(messagesOf(flags)).toEqual([
      'Ticket 101052: scale receipt BCL-88241 covers two debris types (Vegetative, C&D). Flagged for review; its weight is not used.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'RECEIPT_TWO_DEBRIS_TYPES',
      billing: 'LINE_NOT_BILLED',
      fieldEventId: one.id,
      facts: {
        scaleReceiptId: 'receipt-bcl-88241',
        debrisTypes: ['entry-c-and-d', 'entry-vegetative'],
      },
    });
    // The other ticket's own run says the same of it, and neither is told a share.
    expect(flagsOf(on(two, mixed)).map((flag) => flag.code)).toEqual(['RECEIPT_TWO_DEBRIS_TYPES']);
  });

  const lone = (event: QuantifiedFieldEvent, weights: ReceiptWeights): CheckedReceipt => ({
    id: 'receipt-bcl-88250',
    receiptNumber: 'BCL-88250',
    weights,
    disposals: [
      {
        fieldEventId: event.id,
        ticketNumber: event.ticketNumber,
        capacityCy: 65,
        debrisType: vegetative,
      },
    ],
  });

  it('AC-06-93 a net below zero is flagged and its weight is not used; the figures stay as written', () => {
    const dis = disposal('101053');
    const weights = weighed({
      grossWeightLb: '28200.00',
      tareWeightLb: '62400.00',
      netWeightLb: '-34200.00',
    });
    const flags = flagsOf(on(dis, lone(dis, weights)));

    expect(messagesOf(flags)).toEqual([
      'Ticket 101053: scale receipt BCL-88250 has no usable net weight. Flagged for review; its weight is not used.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'SCALE_WEIGHT_UNUSABLE',
      billing: 'LINE_NOT_BILLED',
      fieldEventId: dis.id,
      facts: {
        scaleReceiptId: 'receipt-bcl-88250',
        grossWeightLb: '28200.00',
        tareWeightLb: '62400.00',
        netWeightLb: '-34200.00',
        netWeightTons: null,
      },
    });
  });

  it('AC-06-93 no net written and only a gross, or only a tare, to work one out from: flagged, and never worked out from the one figure', () => {
    const dis = disposal('101053');
    for (const weights of [
      weighed({ grossWeightLb: '62400.00' }),
      weighed({ tareWeightLb: '28200.00' }),
    ]) {
      expect(flagsOf(on(dis, lone(dis, weights))).map((flag) => flag.code)).toEqual([
        'SCALE_WEIGHT_UNUSABLE',
      ]);
    }
  });

  it('AC-06-93 a receipt-book slip with no weight, a net of nought and a real weighing are no fault; no weight is tested against a legal limit', () => {
    const dis = disposal('101054');
    for (const weights of [
      weighed(),
      weighed({ netWeightTons: '0.0000' }),
      weighed({ grossWeightLb: '62400.00', tareWeightLb: '28200.00' }),
      weighed({ netWeightTons: '480.0000' }),
    ]) {
      expect(flagsOf(on(dis, lone(dis, weights)))).toEqual([]);
    }
  });

  it('AC-06-129 weighed haul-out 201004, 24.00 tons against a loading-end call of 85%: nothing compares the weight with the call', () => {
    const dumped = haulOutDisposal('201004');
    const receipt: CheckedReceipt = {
      id: 'receipt-ccl-5521',
      receiptNumber: 'CCL-5521',
      weights: weighed({ netWeightTons: '24.0000' }),
      disposals: [
        { fieldEventId: dumped.id, ticketNumber: '201004', capacityCy: 110, debrisType: null },
      ],
    };
    expect(
      flagsOf([
        pile('201004-A', 10, '13:00'),
        pile('201004-B', 35, '13:30'),
        pile('201004-C', 85, '14:00'),
        { ...dumped, scaleReceipt: receipt },
      ]),
    ).toEqual([]);
  });
});

describe('a load that carries tickets', () => {
  const load = () => [collection('101014'), disposal('101014')];
  const listed = (
    events: readonly QuantifiedFieldEvent[],
    carriedTicketNumber: string,
    more: Partial<CarriedTicketRead> = {},
  ): CarriedTicketRead => ({
    fieldEventId: events[0]?.id ?? '',
    carriedTicketNumber,
    found: true,
    otherLoadNumbers: [],
    ...more,
  });

  it('AC-06-94 carried ticket 301099 matches no ticket: flagged, and the load bills from the tickets found', () => {
    const events = load();
    const flags = flagsOf(events, {}, [
      listed(events, '301004'),
      listed(events, '301099', { found: false }),
    ]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101014: carried ticket 301099 not found. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'CARRIED_TICKET_NOT_FOUND',
      billing: 'BILLS',
      fieldEventId: events[0]?.id,
      facts: { carriedTicketNumber: '301099' },
    });
  });

  it('AC-06-95 carried ticket 301004 is already on load 101007: flagged, and it still bills', () => {
    const events = load();
    const flags = flagsOf(events, {}, [listed(events, '301004', { otherLoadNumbers: ['101007'] })]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101014: carried ticket 301004 is already on load 101007. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'CARRIED_TICKET_ON_ANOTHER_LOAD',
      billing: 'BILLS',
      facts: { carriedTicketNumber: '301004', otherLoadNumber: '101007' },
    });
  });

  it('AC-06-132 a load of stumps whose stumps were each paid on a unit rate ticket: nothing is flagged as paid twice', () => {
    const events = load();
    expect(
      flagsOf(events, {}, [
        listed(events, '301004'),
        listed(events, '301008'),
        listed(events, '301016'),
      ]),
    ).toEqual([]);
  });
});

describe('a scale receipt that should not have been possible', () => {
  const receipt = (
    event: QuantifiedFieldEvent,
    receiptNumber: string,
    weights: ReceiptWeights,
  ): CheckedReceipt => ({
    id: `receipt-${receiptNumber.toLowerCase()}`,
    receiptNumber,
    weights,
    disposals: [
      {
        fieldEventId: event.id,
        ticketNumber: event.ticketNumber,
        capacityCy: 65,
        debrisType: vegetative,
      },
    ],
  });
  const flagsOn = (event: QuantifiedFieldEvent, scaleReceipt: CheckedReceipt) =>
    flagsOf([collection(event.ticketNumber), { ...event, scaleReceipt }]);
  // 62,400 lb gross less 28,200 lb tare is 34,200 lb: 17.10 tons.
  const grossAndTare = { grossWeightLb: '62400.00', tareWeightLb: '28200.00' };

  it('AC-06-158 a net of 17.60 tons where the gross less the tare is 17.10: flagged, the weights as typed, and it still bills', () => {
    const dis = disposal('101054');
    const weights = weighed({ ...grossAndTare, netWeightTons: '17.6000' });
    const flags = flagsOn(dis, receipt(dis, 'BCL-88251', weights));

    expect(messagesOf(flags)).toEqual([
      "Ticket 101054: scale receipt BCL-88251's net (17.60 tons) is not its gross less its tare (17.10 tons). Flagged for review.",
    ]);
    expect(flags[0]).toMatchObject({
      code: 'SCALE_NET_DISAGREES',
      billing: 'BILLS',
      fieldEventId: dis.id,
      facts: {
        scaleReceiptId: 'receipt-bcl-88251',
        grossWeightLb: '62400.00',
        tareWeightLb: '28200.00',
        netWeightLb: null,
        netWeightTons: '17.6000',
      },
    });
  });

  it('AC-06-158 a net in pounds is compared to the pound; a net in tons to the hundredth, as a scale house rounds it', () => {
    const dis = disposal('101054');
    const on = (weights: Partial<ReceiptWeights>) =>
      flagsOn(dis, receipt(dis, 'BCL-88251', weighed({ ...grossAndTare, ...weights })));

    expect(on({ netWeightLb: '34200.00' })).toEqual([]);
    expect(messagesOf(on({ netWeightLb: '34201.00' }))).toEqual([
      "Ticket 101054: scale receipt BCL-88251's net (17.1005 tons) is not its gross less its tare (17.10 tons). Flagged for review.",
    ]);
    expect(on({ netWeightTons: '17.1000' })).toEqual([]);
    expect(on({ tareWeightLb: '28191.00', netWeightTons: '17.1000' })).toEqual([]);
    expect(on({ netWeightTons: '17.1100' }).map((flag) => flag.code)).toEqual([
      'SCALE_NET_DISAGREES',
    ]);
  });

  it('AC-06-158 a receipt with no gross or no tare has nothing for its net to disagree with', () => {
    const dis = disposal('101054');
    for (const weights of [
      weighed({ netWeightTons: '17.6000' }),
      weighed({ grossWeightLb: '62400.00', netWeightTons: '17.6000' }),
      weighed(grossAndTare),
    ]) {
      expect(flagsOn(dis, receipt(dis, 'BCL-88251', weights))).toEqual([]);
    }
  });

  it('AC-06-162 a disposal with a load call and a scale weight is flagged for holding both, and still bills; the two are never compared', () => {
    const dis = disposal('101055', { loadCall: 80 });
    const weights = weighed({ netWeightTons: '7.3300' });
    const flags = flagsOn(dis, receipt(dis, 'BCL-88252', weights));

    expect(messagesOf(flags)).toEqual([
      'Ticket 101055: disposal has both a load call and a scale weight. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'TWO_QUANTITIES',
      billing: 'BILLS',
      fieldEventId: dis.id,
      facts: { loadCall: 80, scaleReceiptId: 'receipt-bcl-88252', netTons: '7.3300' },
    });
  });

  it('AC-06-162 a receipt-book slip with no weight beside a load call is one quantity; so is a weight with no call', () => {
    const called80 = disposal('101055', { loadCall: 80 });
    const weighedOnly = disposal('101055');

    expect(flagsOn(called80, receipt(called80, 'BCL-88252', weighed()))).toEqual([]);
    expect(
      flagsOn(weighedOnly, receipt(weighedOnly, 'BCL-88252', weighed({ netWeightTons: '7.3300' }))),
    ).toEqual([]);
  });
});
