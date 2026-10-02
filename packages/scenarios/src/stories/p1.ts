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
import { NewProjectSettings, type Policy } from '@open-adms/domain';

export const p1TimeZone = 'America/New_York';
export const p1KindsOfWork = ['Hangers', 'Leaners', 'Stumps', 'White Goods', 'Crew time'];

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
