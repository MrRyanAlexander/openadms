// Tickets of the golden mission and the pricing scenarios that the example world doesn't hold,
// each with the setup that pays it, for the tests of a priced line (spec/CONVENTIONS.md §6;
// spec/golden/MISSION.md §1, §2; ADR-353, 358). Each is written as it would be: the setup by Dana
// through the API's login, the field events by a phone, the completed record by the worker. A
// test then writes the lines it is about, as the worker, with `transactionLike`.
import {
  actionLike,
  boxLike,
  certificationLike,
  eventInsertOf,
  fieldEventLike,
  insertOf,
  payItemLike,
  ruleLike,
  siteLike,
  transactionLike,
} from './example-world.ts';
import type { Tested } from './lifecycle.ts';

type Row = Record<string, unknown>;

export class PricedTickets {
  private readonly tested: Tested;

  constructor(tested: Tested) {
    this.tested = tested;
  }

  // As the worker's login, writing as the system actor.
  async asTheWorker(): Promise<void> {
    const { db, world } = this.tested;
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
  }

  // As the API's login, for Ana's phone at sync.
  async asThePhone(): Promise<void> {
    const { db, world } = this.tested;
    await db.as('adms_api');
    await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
  }

  // As the API's login, for Dana in the back office.
  async asTheBackOffice(): Promise<void> {
    const { db, world } = this.tested;
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
  }

  // Adds a row as whoever the test is acting as; its id.
  async add(table: string, row: Row): Promise<string> {
    return (await this.tested.db.one<{ id: string }>(...insertOf(table, row))).id;
  }

  // The refusal's code when the row is not taken.
  async refused(table: string, row: Row): Promise<string> {
    return (await this.tested.db.refused(...insertOf(table, row))).code;
  }

  // A priced line, written as the worker; its id.
  async line(more: Row): Promise<string> {
    await this.asTheWorker();
    return this.add('transaction', transactionLike(this.tested.world, more));
  }

  // A pay item of P1 with Coastline's rate, and the rule that adds it as #slot on a form, naming
  // a contract (Coastline's unless told): as the pay item's "Pays when" writes one.
  async paid(
    payItem: Row,
    rate: string,
    rule: Row,
    slot = 1,
  ): Promise<{ payItem: string; rule: string }> {
    const { world } = this.tested;
    await this.asTheBackOffice();
    const payItemId = await this.add('pay_item', payItemLike(world, payItem));
    await this.add('pay_item_rate', {
      project_id: world.p1,
      pay_item_id: payItemId,
      prime_id: world.coastline,
      rate,
    });
    const ruleId = await this.add(
      'rule',
      ruleLike(world, {
        name: `${String(payItem['code'])} - ${String(payItem['description'])}`,
        ...rule,
      }),
    );
    await this.add('rule_action', actionLike(world, ruleId, slot, payItemId));
    return { payItem: payItemId, rule: ruleId };
  }

  private async payableType(name: string): Promise<string> {
    return (
      await this.tested.db.one<{ id: string }>(
        `SELECT "id"::text FROM "payable_type" WHERE "name" = $1`,
        [name],
      )
    ).id;
  }

  // A field event a phone synced from P1; its id.
  async synced(more: Row): Promise<string> {
    const { db, world } = this.tested;
    await this.asThePhone();
    return (await db.one<{ id: string }>(...eventInsertOf(fieldEventLike(world, more)))).id;
  }

  // What pays the example world's 101002, C&D to the Landfill on Rivera's self-loader: the
  // hauling pay item CD-HAUL-CY-15 ($8.25) with its rule, and the Landfill's tipping fee pay
  // item TIP-FEE-CY-BCL ($4.00), linked to the site, with its rule (#2).
  async cdToTheLandfill(): Promise<{
    haul: { payItem: string; rule: string };
    fee: { payItem: string; rule: string };
  }> {
    const { world } = this.tested;
    const haul = await this.paid(
      {
        code: 'CD-HAUL-CY-15',
        description: 'ROW C&D haul 0–15 mi',
        payable_type_id: await this.payableType('C&D'),
      },
      '8.2500',
      {},
    );
    const fee = await this.paid(
      {
        code: 'TIP-FEE-CY-BCL',
        description: 'Tipping fee, Bayline County Landfill (per CY)',
        payable_type_id: await this.payableType('Tipping fee'),
      },
      '4.0000',
      {},
      2,
    );
    await this.add('disposal_site_tipping_fee', {
      project_id: world.p1,
      site_id: world.landfill,
      pay_item_id: fee.payItem,
    });
    return { haul, fee };
  }

  // Summit's load 101044 on its own truck `88120` (28 CY, called 50% = 14.0 CY), with Summit's
  // rate on VEG-HAUL-CY-15, $7.80, and Summit's own rule naming "Summit, Bayline ROW 2026".
  async summits101044(): Promise<{ completedLoad: string; property: string; rule: string }> {
    const { world } = this.tested;
    await this.asTheBackOffice();
    await this.add('pay_item_rate', {
      project_id: world.p1,
      pay_item_id: world.payItems.vegHaul15,
      prime_id: world.summit,
      rate: '7.8000',
    });
    const rule = await this.add(
      'rule',
      ruleLike(world, {
        name: 'VEG-HAUL-CY-15 - ROW VEG haul 0–15 mi (Summit)',
        contract_id: world.contracts.summitP1,
      }),
    );
    await this.add('rule_action', actionLike(world, rule, 1, world.payItems.vegHaul15));
    const { db } = this.tested;
    await db.as('adms_api');
    await db.actor(world.certifier, 'DEVICE', { deviceId: world.certifyingDevice });
    const certification = await this.add(
      'certification',
      certificationLike(world, { cert_number: '88120', prime_id: world.summit, capacity_cy: 28 }),
    );
    await this.add('certification_box', boxLike(certification, 0));
    const truck = {
      ticket_number: '101044',
      cert_number: '88120',
      certification_id: certification,
    };
    const collection = await this.synced(truck);
    const disposal = await this.synced({
      ...truck,
      kind: 'DISPOSAL',
      site_id: world.site,
      load_call: 50,
      started_at: '2026-10-13T14:00:00Z',
      ended_at: '2026-10-13T14:05:00Z',
    });
    await this.asTheWorker();
    const completedLoad = await this.add('completed_load', {
      project_id: world.p1,
      ticket_number: '101044',
      disposal_event_id: disposal,
      quantity_source: 'LOAD_CALL',
      capacity_cy: 28,
      load_call: 50,
      volume_cy: '14.00',
      weight_is_share: false,
      updated_at: '2026-10-13T22:00:00Z',
    });
    const property = await this.add('completed_load_collection', {
      project_id: world.p1,
      completed_load_id: completedLoad,
      collection_event_id: collection,
      split_suffix: '',
      share_fraction: '1',
      volume_cy: '14.00',
    });
    return { completedLoad, property, rule };
  }

  // The split haul-out 201004: three piles into the walking floor `730419` at Marsh Road TDSR,
  // one dump at Cypress Creek Landfill, 24.00 tons weighed and shared by the piles' calls (2.82,
  // 7.06 and 14.12 tons); paid by MULCH-HO-TN, $20.00 a ton, once per pile.
  async haulOut201004(): Promise<{
    completedHaulOut: string;
    piles: { a: string; b: string; c: string };
    payItem: string;
    rule: string;
  }> {
    const { world } = this.tested;
    const { payItem, rule } = await this.paid(
      {
        code: 'MULCH-HO-TN',
        description: 'Mulch haul-out to FDS, by weight',
        payable_type_id: world.payableTypes.vegetative,
        unit: 'TN',
      },
      '20.0000',
      { form_id: world.forms.haulOut, document_type: 'HAUL_OUT' },
    );
    const cypressCreek = await this.add(
      'disposal_site',
      siteLike(world, world.siteTypes.finalDisposal, {
        name: 'Cypress Creek Landfill',
        short_code: 'CCL',
        site_type_key: 'FINAL_DISPOSAL',
        permit_number: 'FDEP-SW-0131',
        latitude: '39.24000000',
        longitude: '-75.60000000',
      }),
    );
    const haulOut = {
      workflow: 'HAUL_OUT',
      ticket_number: '201004',
      cert_number: '730419',
      certification_id: world.certifications.c730419,
    };
    const loaded: string[] = [];
    for (const [suffix, call, ended] of [
      ['A', 10, '2026-10-13T19:30:00Z'],
      ['B', 35, '2026-10-13T19:45:00Z'],
      ['C', 85, '2026-10-13T20:05:00Z'],
    ] as const) {
      loaded.push(
        await this.synced({
          ...haulOut,
          kind: 'HAUL_OUT_COLLECTION',
          split_suffix: suffix,
          load_call: call,
          site_id: world.site,
          started_at: '2026-10-13T19:20:00Z',
          ended_at: ended,
        }),
      );
    }
    const disposal = await this.synced({
      ...haulOut,
      kind: 'HAUL_OUT_DISPOSAL',
      site_id: cypressCreek,
      started_at: '2026-10-13T21:10:00Z',
      ended_at: '2026-10-13T21:15:00Z',
    });
    await this.asTheWorker();
    const completedHaulOut = await this.add('completed_haul_out', {
      project_id: world.p1,
      ticket_number: '201004',
      disposal_event_id: disposal,
      quantity_source: 'SCALE_WEIGHT',
      capacity_cy: 110,
      load_call: 85,
      volume_cy: '93.50',
      weight_tons: '24.0000',
      weight_is_share: false,
      updated_at: '2026-10-13T22:00:00Z',
    });
    const rows: string[] = [];
    for (const [index, [suffix, call, fraction, cy, tons]] of (
      [
        ['A', 10, '0.11764706', '11.00', '2.8200'],
        ['B', 25, '0.29411765', '27.50', '7.0600'],
        ['C', 50, '0.58823529', '55.00', '14.1200'],
      ] as const
    ).entries()) {
      rows.push(
        await this.add('completed_haul_out_collection', {
          project_id: world.p1,
          completed_haul_out_id: completedHaulOut,
          collection_event_id: loaded[index],
          split_suffix: suffix,
          pile_load_call: call,
          share_fraction: fraction,
          volume_cy: cy,
          weight_tons: tons,
          mileage: '13.9516',
          mileage_source: 'ROAD_ROUTE',
        }),
      );
    }
    const [a = '', b = '', c = ''] = rows;
    return { completedHaulOut, piles: { a, b, c }, payItem, rule };
  }

  // The unit rate ticket 301001: the bucket truck crew `730417`, Hangers, one tree, which the
  // phone worked out as HNG-RMV-EA ($68.00); P1's unit rate form and the pay item's own rule.
  async unitRate301001(): Promise<{ fieldEvent: string; rule: string }> {
    const { world } = this.tested;
    await this.asTheBackOffice();
    const form = await this.add('form', {
      project_id: world.p1,
      name: 'Unit rate',
      document_type: 'UNIT_RATE',
      enabled: true,
    });
    const rule = await this.add(
      'rule',
      ruleLike(world, {
        form_id: form,
        document_type: 'UNIT_RATE',
        name: 'HNG-RMV-EA - Hanger removal',
        from_pay_item_id: world.payItems.hangers,
      }),
    );
    await this.add('rule_action', actionLike(world, rule, 1, world.payItems.hangers));
    const fieldEvent = await this.synced({
      workflow: 'UNIT_RATE',
      kind: 'UNIT_RATE',
      ticket_number: '301001',
      cert_number: '730417',
      certification_id: world.certifications.c730417,
      pay_item_id: world.payItems.hangers,
      started_at: '2026-10-12T15:00:00Z',
      ended_at: '2026-10-12T15:20:00Z',
    });
    return { fieldEvent, rule };
  }
}
