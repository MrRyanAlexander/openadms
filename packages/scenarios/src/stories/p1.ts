// P1's first four setup steps, as both of today's stories need them (spec/parts/01-setup.md steps
// 1–4; spec/golden/MISSION.md §1; ADR-303, 305): the client Bayline County, the declaration event
// Hurricane Delphine, the project "Bayline County ROW, Hurricane Delphine" with the kinds of unit
// rate work it allows, then its prime, Coastline Haulers LLC, added to the project, and the
// contract "Coastline, Bayline ROW 2026". The project's settings start as a new project's do, from
// the release's policy values (the domain's NewProjectSettings); the firm then ticks Allow split
// loads, for haul-outs loaded from more than one pile. No sub is set up: Rivera Trucking is typed in
// when its truck is certified (ADR-108). The whole setup, P2 included, told in the spine's order
// through the API's setup services, is its own story (BACKLOG 1.1.11).
import type { Prisma } from '@open-adms/db';
import { NewProjectNumbers, NewProjectSettings, type Policy } from '@open-adms/domain';

export const p1TimeZone = 'America/New_York';
export const p1KindsOfWork = ['Hangers', 'Leaners', 'Stumps', 'White Goods', 'Crew time'];

// Where P1's number series start (spec/CONVENTIONS.md §6): loads, haul-outs, unit rate tickets,
// and the cert numbers' seed (Q-96).
export const p1NumbersFrom = {
  LOAD: 101001,
  HAUL_OUT: 201001,
  UNIT_RATE: 301001,
  CERTIFICATION: 730415,
} as const;

// A generated project's number series, as the setup service starts them with the project
// (ADR-323): each from the number given, or its usual start.
export async function startSeries(
  tx: Prisma.TransactionClient,
  projectId: string,
  numbersFrom: Readonly<
    Partial<Record<'LOAD' | 'HAUL_OUT' | 'UNIT_RATE' | 'CERTIFICATION', number>>
  >,
): Promise<void> {
  const numbers = new NewProjectNumbers('GENERATED').series(numbersFrom);
  if (numbers.refusal !== null) throw new Error(numbers.refusal.message);
  for (const { series, firstNumber } of numbers.series) {
    await tx.projectNumberSeries.create({
      data: { projectId, series, firstNumber, nextNumber: firstNumber },
    });
  }
}

export interface P1 {
  readonly client: string;
  readonly declarationEvent: string;
  readonly project: string;
  // Coastline Haulers LLC, P1's prime, and its contract.
  readonly prime: string;
  readonly contract: string;
}

// Written inside the caller's own piece of work, as whoever it states (Dana Reyes).
export async function setUpP1(tx: Prisma.TransactionClient, policy: Policy): Promise<P1> {
  const client = await tx.client.create({ data: { name: 'Bayline County' } });
  const fema = await tx.declarationReferenceType.findFirstOrThrow({
    where: { name: 'FEMA disaster (DR)' },
  });
  const declarationEvent = await tx.declarationEvent.create({
    data: { name: 'Hurricane Delphine', reference: 'DR-9001-FL', referenceTypeId: fema.id },
  });
  const row = await tx.programType.findFirstOrThrow({ where: { name: 'ROW' } });
  const project = await tx.project.create({
    data: {
      name: 'Bayline County ROW, Hurricane Delphine',
      clientId: client.id,
      declarationEventId: declarationEvent.id,
      programTypeId: row.id,
      timeZone: p1TimeZone,
      activeFrom: new Date('2026-10-12'),
      activeTo: new Date('2027-01-31'),
      ticketNumberSource: 'GENERATED',
      workflows: ['LOAD', 'HAUL_OUT', 'UNIT_RATE'],
      ...new NewProjectSettings(policy).for(row),
      allowSplitLoads: true,
    },
  });
  await startSeries(tx, project.id, p1NumbersFrom);
  const kinds = await tx.kindOfWork.findMany({
    where: { name: { in: p1KindsOfWork } },
    orderBy: { position: 'asc' },
  });
  for (const kind of kinds) {
    await tx.projectKindOfWork.create({ data: { projectId: project.id, kindOfWorkId: kind.id } });
  }
  // The prime is added to the project first, then its contract (ADR-146).
  const coastline = await tx.contractor.create({
    data: { name: 'Coastline Haulers LLC', kind: 'HAULER' },
  });
  await tx.projectContractor.create({
    data: {
      projectId: project.id,
      contractorId: coastline.id,
      position: 'PRIME',
      asPrimeId: coastline.id,
    },
  });
  const contract = await tx.contract.create({
    data: { projectId: project.id, name: 'Coastline, Bayline ROW 2026', primeId: coastline.id },
  });
  return {
    client: client.id,
    declarationEvent: declarationEvent.id,
    project: project.id,
    prime: coastline.id,
    contract: contract.id,
  };
}

export interface P1Sites {
  // Marsh Road TDSR (TDSR/DMS: takes loads, haul-outs leave here) and Bayline County Landfill
  // (Final Disposal, BCL: takes loads, charges a tipping fee), as the golden mission §1 has them.
  readonly tdsr: string;
  readonly landfill: string;
}

// P1's two sites of setup step 7, each with its type, the four site facts, its GPS and a permit,
// active from the project's first day (spec/parts/01-setup.md step 7; ADR-215, 311). A TDSR/DMS
// site states its type's key too, as the database holds Haul-outs leave here to it. Its tipping
// fee pay item, Cypress Creek Landfill and P1's map are the whole setup's story (BACKLOG 1.1.11).
export async function setUpP1Sites(
  tx: Prisma.TransactionClient,
  project: string,
): Promise<P1Sites> {
  const tdsrType = await tx.siteType.findUniqueOrThrow({ where: { key: 'TDSR' } });
  const landfillType = await tx.siteType.findUniqueOrThrow({ where: { key: 'FINAL_DISPOSAL' } });
  const opened = { projectId: project, activationDate: new Date('2026-10-12'), takesLoads: true };
  const tdsr = await tx.disposalSite.create({
    data: {
      ...opened,
      name: 'Marsh Road TDSR',
      siteTypeId: tdsrType.id,
      siteTypeKey: tdsrType.key,
      haulOutsLeaveHere: true,
      chargesTippingFee: false,
      ineligibleSite: false,
      permitNumber: 'FDEP-DMS-2026-0117',
      latitude: '27.98150000',
      longitude: '-82.39720000',
    },
  });
  const landfill = await tx.disposalSite.create({
    data: {
      ...opened,
      name: 'Bayline County Landfill',
      shortCode: 'BCL',
      siteTypeId: landfillType.id,
      siteTypeKey: landfillType.key,
      haulOutsLeaveHere: false,
      chargesTippingFee: true,
      ineligibleSite: false,
      permitNumber: 'FDEP-SW-0098',
      latitude: '27.89340000',
      longitude: '-82.32160000',
    },
  });
  return { tdsr: tdsr.id, landfill: landfill.id };
}
