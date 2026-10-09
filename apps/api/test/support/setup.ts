// What the tests of setup's endpoints share (task 2.4.2; ADR-424, 425): a browser's side of a
// request by its endpoint's own definition, an answer read by its endpoint's own schema, a
// refusal's plain body, and P1 as Dana enters it (spec/CONVENTIONS.md §6) through the endpoints.
import { randomUUID } from 'node:crypto';

import {
  addPrimeEndpoint,
  createClientEndpoint,
  createContractEndpoint,
  createContractorEndpoint,
  createDeclarationEventEndpoint,
  createFormEndpoint,
  createPayItemEndpoint,
  createProjectEndpoint,
  errorAnswerSchema,
  type AnswerOf,
  type Endpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { expect } from 'vitest';

import type { Tx } from './database.ts';
import type { Answer, Served, Signed } from './served.ts';
import { Outbox, signInOn } from './sign-in.ts';

export const viewersEmail = 'debris@baylinecounty.example';
export const viewersPassword = 'delphine marsh ferry heron';

export type Browser = Pick<Signed, 'cookies' | 'csrf'>;

export const told = (answer: Answer): [number, string | undefined] => [answer.status, answer.code];

// A saved change's or a search's answer, read by its endpoint's own schema.
export function saved<E extends Endpoint>(served: E, answer: Answer): AnswerOf<E> {
  expect(told(answer), served.name).toEqual([200, undefined]);
  return served.answer.parse(answer.body) as AnswerOf<E>;
}

// The endpoint's path, each parameter given.
export const at = (served: Endpoint, ids: Readonly<Record<string, string>> = {}): string =>
  served.path.replace(/:([A-Za-z]+)/g, (_, name: string) => ids[name] ?? randomUUID());

export const ask = (
  api: Served,
  signed: Browser | undefined,
  served: Endpoint,
  more: { ids?: Readonly<Record<string, string>>; payload?: object; query?: string } = {},
): Promise<Answer> =>
  api.ask(served.method, at(served, more.ids) + (more.query ?? ''), {
    ...(signed === undefined ? {} : served.method === 'GET' ? { cookies: signed.cookies } : signed),
    ...(more.payload === undefined ? {} : { payload: more.payload }),
  });

// The read-only viewer is given a password, so that they can sign in.
export async function viewerSignsIn(served: Served, tx: Tx, viewer: string, within: Database) {
  await tx.userCredential.create({
    data: {
      userId: viewer,
      passwordHash: await signInOn(within, new Outbox()).hasher.hash(viewersPassword),
    },
  });
  return served.signedIn(viewersEmail, viewersPassword);
}

// What the firm's lists hold, picked by name (never typed): the release's own values.
export async function picked(tx: Tx) {
  const fema = await tx.declarationReferenceType.findFirstOrThrow({
    where: { name: 'FEMA disaster (DR)' },
  });
  const row = await tx.programType.findFirstOrThrow({ where: { name: 'ROW' } });
  const kinds = await tx.kindOfWork.findMany({ orderBy: { position: 'asc' } });
  return { fema: fema.id, row: row.id, kindOfWorkIds: kinds.map((kind) => kind.id) };
}

// P1 as Dana enters it (spec/CONVENTIONS.md §6), through the endpoints: the client, the
// declaration event and the project.
export async function p1Through(api: Served, dana: Browser, tx: Tx, more: object = {}) {
  const lists = await picked(tx);
  const client = saved(
    createClientEndpoint,
    await ask(api, dana, createClientEndpoint, { payload: { name: 'Bayline County' } }),
  ).record;
  const declarationEvent = saved(
    createDeclarationEventEndpoint,
    await ask(api, dana, createDeclarationEventEndpoint, {
      payload: { name: 'Hurricane Delphine', reference: 'DR-9001-FL', referenceTypeId: lists.fema },
    }),
  ).record;
  const payload = {
    name: 'Bayline County ROW, Hurricane Delphine',
    clientId: client.id,
    declarationEventId: declarationEvent.id,
    programTypeId: lists.row,
    timeZone: 'America/New_York',
    activeFrom: '2026-10-12',
    activeTo: '2027-01-31',
    ticketNumberSource: 'GENERATED',
    workflows: ['LOAD', 'HAUL_OUT', 'UNIT_RATE'],
    kindOfWorkIds: lists.kindOfWorkIds,
    ...more,
  };
  return { client, declarationEvent, payload, lists };
}

export async function p1(api: Served, dana: Browser, tx: Tx) {
  const entered = await p1Through(api, dana, tx);
  const answer = await ask(api, dana, createProjectEndpoint, { payload: entered.payload });
  return { ...entered, answer, project: saved(createProjectEndpoint, answer).record };
}

// A refusal's body: a plain code, the request's id and plain words; nothing from inside.
export function plainly(answer: Answer): string {
  const refusal = errorAnswerSchema.parse(answer.body);
  expect(Object.keys(refusal).sort()).toEqual(['code', 'message', 'requestId']);
  expect(answer.text).not.toMatch(/constraint|prisma|violates|_check|_key|_fkey|\.ts|stack/i);
  return refusal.message ?? '';
}

// A refusal by the domain's rules: `NOT_SAVED`, the rule's own code, and its plain words.
export function notSaved(answer: Answer): [string | undefined, string | undefined] {
  expect(told(answer)).toEqual([422, 'NOT_SAVED']);
  const refusal = errorAnswerSchema.parse(answer.body);
  return [refusal.reason, refusal.message];
}

// No capture setting has a default: whoever enters a pay item states each (ADR-309).
export const unticked = {
  kindOfWorkId: null,
  bandFrom: null,
  bandTo: null,
  countIsAlwaysOne: false,
  gpsRequired: false,
  measurementRequired: false,
  decimalsAllowed: false,
  photosRequired: false,
  monitorMayMarkIneligible: false,
  quantityFromCarriedTickets: false,
  crewTimeConversion: null,
  crewDayHours: null,
};

// P1 with Coastline as its prime, Coastline's contract and the three forms that take rules, all
// through the endpoints; and what the firm's lists hold, picked by name (never typed).
export async function p1Priced(api: Served, dana: Browser, tx: Tx) {
  const { project } = await p1(api, dana, tx);
  const ids = { projectId: project.id };
  const contractor = async (name: string) =>
    saved(
      createContractorEndpoint,
      await ask(api, dana, createContractorEndpoint, { payload: { name, kind: 'HAULER' } }),
    ).record.id;
  const coastline = await contractor('Coastline Haulers LLC');
  saved(
    addPrimeEndpoint,
    await ask(api, dana, addPrimeEndpoint, { ids, payload: { contractorId: coastline } }),
  );
  const contract = saved(
    createContractEndpoint,
    await ask(api, dana, createContractEndpoint, {
      ids,
      payload: { name: 'Coastline, Bayline ROW 2026', primeId: coastline },
    }),
  ).record.id;
  const form = async (documentType: string, name: string, more: object = {}) =>
    saved(
      createFormEndpoint,
      await ask(api, dana, createFormEndpoint, {
        ids,
        payload: { documentType, name, enabled: true, ...more },
      }),
    ).record;
  const forms = {
    load: (await form('LOAD', 'Load')).id,
    haulOut: (await form('HAUL_OUT', 'Haul-out')).id,
    unitRate: (await form('UNIT_RATE', 'Unit rate')).id,
  };
  const named = async (rows: Promise<{ id: string } | null>) => (await rows)?.id ?? '';
  const payableType = (name: string) => named(tx.payableType.findFirstOrThrow({ where: { name } }));
  const kindOfWork = (name: string) => named(tx.kindOfWork.findFirstOrThrow({ where: { name } }));
  const debrisType = (name: string) => named(tx.debrisType.findFirstOrThrow({ where: { name } }));
  const payItem = (payload: object) =>
    ask(api, dana, createPayItemEndpoint, { ids, payload: { ...unticked, ...payload } });
  // A unit rate pay item, one a monitor picks by its payable type: by the each, one at a time.
  const each = async (
    code: string,
    description: string,
    work: string,
    rate: string,
    band?: { from: number | null; to: number | null },
  ) =>
    payItem({
      code,
      description,
      payableTypeId: await payableType(work),
      unit: 'EA',
      kindOfWorkId: await kindOfWork(work),
      countIsAlwaysOne: true,
      photosRequired: true,
      measurementRequired: band !== undefined,
      bandFrom: band?.from ?? null,
      bandTo: band?.to ?? null,
      rates: [{ primeId: coastline, rate }],
    });
  const veg15 = async () =>
    payItem({
      code: 'VEG-HAUL-CY-15',
      description: 'ROW VEG haul 0–15 mi',
      payableTypeId: await payableType('Vegetative'),
      unit: 'CY',
      rates: [{ primeId: coastline, rate: '7.50' }],
    });
  return {
    project,
    ids,
    contractor,
    coastline,
    contract,
    form,
    forms,
    payableType,
    kindOfWork,
    debrisType,
    payItem,
    each,
    veg15,
  };
}
