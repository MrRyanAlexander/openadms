// The lists a phone takes with its assignment at sign-in, read from the server as the API's login
// (adms-field-app §4A.2a; ADR-207, 213, 240): a stand-in for the sync contract's manifest (Phase
// 2), with only what the harness's phones capture from. No rate, no rule and no load's pay item is
// read: none goes to a phone (invariant 20).
import type { Database } from '@open-adms/db';

import type { PhoneLists } from './device.ts';

export async function phoneLists(
  api: Database,
  phone: { readonly assignmentId: string; readonly deviceId: string },
): Promise<PhoneLists> {
  const assignment = await api.assignment.findUniqueOrThrow({ where: { id: phone.assignmentId } });
  const { projectId } = assignment;
  const blocks = await api.numberBlock.findMany({
    where: { deviceId: phone.deviceId, projectId, status: 'ISSUED' },
    orderBy: [{ issuedAt: 'asc' }, { firstNumber: 'asc' }],
  });
  const forms = await api.form.findMany({
    where: { projectId, documentType: { in: ['LOAD', 'HAUL_OUT'] } },
  });
  const entries = await api.formDebrisType.findMany({
    where: {
      formId: { in: forms.map((form) => form.id) },
      hiddenOnPhones: false,
      archivedAt: null,
    },
    include: { debrisType: true },
    orderBy: { createdAt: 'asc' },
  });
  const named = (documentType: 'LOAD' | 'HAUL_OUT') =>
    entries
      .filter((entry) => entry.documentType === documentType)
      .map((entry) => ({ id: entry.id, name: entry.debrisType.name }));
  const fieldTags = await api.fieldTag.findMany({
    where: { projectId, archivedAt: null },
    orderBy: { position: 'asc' },
  });
  const reasons = await api.reason.findMany({
    where: { uses: { has: 'TYPED_NUMBER' }, archivedAt: null },
    orderBy: { position: 'asc' },
  });
  const assigned = await api.assignmentPayItem.findMany({
    where: { assignmentId: assignment.id, archivedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  const payItems = await api.payItem.findMany({
    where: { id: { in: assigned.map((one) => one.payItemId) } },
    include: { payableType: true, kindOfWork: true },
    orderBy: { createdAt: 'asc' },
  });
  const kinds = [...new Set(assigned.map((one) => one.kindOfWorkId))];
  const itemNames = await api.itemName.findMany({
    where: { kindOfWorkId: { in: kinds }, archivedAt: null },
    orderBy: { position: 'asc' },
  });
  const incidentTypes = assignment.formDocumentTypes.includes('INCIDENT')
    ? await api.incidentType.findMany({
        where: { archivedAt: null },
        include: { subTypes: { where: { archivedAt: null }, orderBy: { position: 'asc' } } },
        orderBy: { position: 'asc' },
      })
    : [];
  const name = ({ id, name }: { id: string; name: string }) => ({ id, name });
  return {
    blocks: blocks.map(({ series, firstNumber, lastNumber, lastUsedNumber, status }) => ({
      series,
      firstNumber,
      lastNumber,
      lastUsedNumber,
      status,
    })),
    debrisTypes: { LOAD: named('LOAD'), HAUL_OUT: named('HAUL_OUT') },
    fieldTags: fieldTags.map(name),
    typedNumberReasons: reasons.map(name),
    payItems: payItems.flatMap((payItem) =>
      payItem.kindOfWork === null
        ? []
        : [
            {
              id: payItem.id,
              code: payItem.code,
              bandFrom: payItem.bandFrom?.toNumber() ?? null,
              bandTo: payItem.bandTo?.toNumber() ?? null,
              archived: payItem.archivedAt !== null,
              payableType: name(payItem.payableType),
              kindOfWork: name(payItem.kindOfWork),
            },
          ],
    ),
    itemNames: itemNames.map((item) => ({ ...name(item), kindOfWorkId: item.kindOfWorkId })),
    incidentTypes: incidentTypes.map((type) => ({
      ...name(type),
      subTypes: type.subTypes.map(name),
    })),
  };
}
