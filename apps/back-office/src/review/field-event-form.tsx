// A field event's captured details as a reviewer types and picks them (spec/parts/08-review-and-
// corrections.md steps 3, 9; adms-exceptions; ADR-051, 156, 236): the same form corrects one in
// place and makes one in the back office because a phone failed. Only the details its kind records
// are offered (the domain's `fieldEventDetails`); every pick by name (invariant 6); a time is the
// project's day and time of day, read as an instant by the domain's `ProjectClock` only; a GPS fix
// as exact decimal text, both halves or none (invariant 15). A correction sends only what the
// person changed; nothing here judges whether the work was eligible (flag, never block).
import type { BodyOf, FieldEventRecord, ReviewNamesAnswer } from '@open-adms/contracts';
import type { correctFieldEventEndpoint } from '@open-adms/contracts';
import {
  fieldEventDetails,
  measuredAs,
  type FieldEventDetail,
  type FieldEventKindName,
  type ProjectClock,
  type WorkflowName,
} from '@open-adms/domain';

import {
  checked,
  nullable,
  picked,
  text,
  type FieldSpec,
  type Values,
} from '../look/form-dialog.tsx';
import { words } from '../words.ts';
import { optionsOf } from './reviewing.tsx';

type Captured = BodyOf<typeof correctFieldEventEndpoint>['changes'];

const records = (kind: FieldEventKindName, detail: FieldEventDetail): boolean =>
  (fieldEventDetails[detail] as readonly string[]).includes(kind);

// The kinds that dump or load at a site: a tower's, and both ends of a haul-out.
const sited: readonly FieldEventKindName[] = [
  'DISPOSAL',
  'HAUL_OUT_COLLECTION',
  'HAUL_OUT_DISPOSAL',
];

export const workflowOfKind = (kind: FieldEventKindName): WorkflowName =>
  kind === 'UNIT_RATE'
    ? 'UNIT_RATE'
    : kind === 'COLLECTION' || kind === 'DISPOSAL'
      ? 'LOAD'
      : 'HAUL_OUT';

// The fields a field event of this kind is entered with, in the order a reviewer reads one.
export function fieldEventFields(
  kind: FieldEventKindName,
  names: ReviewNamesAnswer,
  record: FieldEventRecord | null,
): readonly FieldSpec[] {
  const said = words.review.event;
  const workflow = workflowOfKind(kind);
  const fields: FieldSpec[] = [
    {
      kind: 'pick',
      key: 'monitorId',
      label: said.monitor,
      required: true,
      options: names.people
        .filter((person) => person.monitor && (!person.archived || person.id === record?.monitorId))
        .map((person) => ({
          id: person.id,
          label: `${person.name} (${person.monitorNumber ?? ''})`,
        })),
    },
    { kind: 'text', key: 'certNumber', label: said.certNumber, required: true, longest: 40 },
    { kind: 'heading', key: 'times', label: said.times },
    { kind: 'date', key: 'startDay', label: said.startDay, required: true },
    { kind: 'time', key: 'startTime', label: said.startTime },
    { kind: 'date', key: 'endDay', label: said.endDay, required: true },
    { kind: 'time', key: 'endTime', label: said.endTime },
    { kind: 'heading', key: 'gps', label: said.gps },
    { kind: 'decimal', key: 'startLatitude', label: said.startLatitude },
    { kind: 'decimal', key: 'startLongitude', label: said.startLongitude },
    { kind: 'decimal', key: 'endLatitude', label: said.endLatitude },
    { kind: 'decimal', key: 'endLongitude', label: said.endLongitude },
    { kind: 'text', key: 'address', label: said.address, longest: 2000 },
    { kind: 'heading', key: 'details', label: said.details },
  ];
  if (sited.includes(kind) || record?.siteId != null) {
    fields.push({
      kind: 'pick',
      key: 'siteId',
      label: said.site,
      options: optionsOf(names.sites, record?.siteId ?? null),
    });
  }
  if (records(kind, 'formDebrisTypeId')) {
    fields.push({
      kind: 'pick',
      key: 'formDebrisTypeId',
      label: said.debrisType,
      options: names.debrisTypes
        .filter(
          (entry) =>
            entry.documentType === workflow &&
            (!entry.archived || entry.id === record?.formDebrisTypeId),
        )
        .map((entry) => ({ id: entry.id, label: `${entry.name} (${entry.formName})` })),
    });
  }
  if (records(kind, 'loadCall')) {
    fields.push({ kind: 'whole', key: 'loadCall', label: said.loadCall, hint: said.loadCallHint });
  }
  if (records(kind, 'estimateCy')) {
    fields.push({ kind: 'decimal', key: 'estimateCy', label: said.estimateCy });
  }
  if (records(kind, 'carriedCount')) {
    fields.push({ kind: 'whole', key: 'carriedCount', label: said.carriedCount });
  }
  if (records(kind, 'kindOfWorkId')) {
    fields.push({
      kind: 'pick',
      key: 'kindOfWorkId',
      label: said.kindOfWork,
      options: optionsOf(names.kindsOfWork, record?.kindOfWorkId ?? null),
    });
  }
  if (records(kind, 'payableTypeId')) {
    fields.push({
      kind: 'pick',
      key: 'payableTypeId',
      label: said.payableType,
      options: optionsOf(names.payableTypes, record?.payableTypeId ?? null),
    });
  }
  if (records(kind, 'payItemId')) {
    fields.push({
      kind: 'pick',
      key: 'payItemId',
      label: said.payItem,
      hint: said.payItemHint,
      options: names.payItems
        .filter((item) => !item.archived || item.id === record?.payItemId)
        .map((item) => ({ id: item.id, label: `${item.code} · ${item.description}` })),
    });
  }
  if (records(kind, 'unitCount')) {
    fields.push({ kind: 'decimal', key: 'unitCount', label: said.unitCount });
  }
  if (records(kind, 'measurementInches')) {
    fields.push(
      { kind: 'decimal', key: 'measurementInches', label: said.measurementInches },
      {
        kind: 'pick',
        key: 'measuredAs',
        label: said.measuredAs,
        options: measuredAs.map((way) => ({ id: way, label: said.measuredAsWays[way] })),
      },
      { kind: 'decimal', key: 'rootBallInches', label: said.rootBallInches },
      { kind: 'check', key: 'rootBallHalfExposed', label: said.rootBallHalfExposed },
    );
  }
  if (records(kind, 'roeNumber')) {
    fields.push({ kind: 'text', key: 'roeNumber', label: said.roeNumber, longest: 40 });
  }
  if (records(kind, 'surveyNumber')) {
    fields.push({ kind: 'text', key: 'surveyNumber', label: said.surveyNumber, longest: 40 });
  }
  if (records(kind, 'markedIneligible')) {
    fields.push({ kind: 'check', key: 'markedIneligible', label: said.markedIneligible });
  }
  if (records(kind, 'fieldTagId')) {
    fields.push({
      kind: 'pick',
      key: 'fieldTagId',
      label: said.fieldTag,
      hint: said.fieldTagHint,
      options: optionsOf(names.fieldTags, record?.fieldTagId ?? null),
    });
  }
  fields.push({ kind: 'long', key: 'notes', label: words.common.notes, longest: 2000 });
  return fields;
}

const shown = (value: number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value);

// A field event's details as the form shows them.
export function fieldEventValues(record: FieldEventRecord, clock: ProjectClock): Values {
  const started = new Date(record.startedAt);
  const ended = new Date(record.endedAt);
  return {
    monitorId: record.monitorId,
    certNumber: record.certNumber,
    startDay: clock.day(started),
    startTime: clock.time(started),
    endDay: clock.day(ended),
    endTime: clock.time(ended),
    startLatitude: record.start?.latitude ?? '',
    startLongitude: record.start?.longitude ?? '',
    endLatitude: record.end?.latitude ?? '',
    endLongitude: record.end?.longitude ?? '',
    address: record.address ?? '',
    siteId: record.siteId ?? '',
    formDebrisTypeId: record.formDebrisTypeId ?? '',
    loadCall: shown(record.loadCall),
    estimateCy: shown(record.estimateCy),
    carriedCount: shown(record.carriedCount),
    kindOfWorkId: record.kindOfWorkId ?? '',
    payableTypeId: record.payableTypeId ?? '',
    payItemId: record.payItemId ?? '',
    unitCount: shown(record.unitCount),
    measurementInches: shown(record.measurementInches),
    measuredAs: record.measuredAs ?? '',
    rootBallInches: shown(record.rootBallInches),
    rootBallHalfExposed: record.rootBallHalfExposed === true,
    roeNumber: record.roeNumber ?? '',
    surveyNumber: record.surveyNumber ?? '',
    markedIneligible: record.markedIneligible === true,
    fieldTagId: record.fieldTagId ?? '',
    notes: record.notes ?? '',
  };
}

// A number as typed, or none; one that isn't a number is the server's to refuse.
const numeric = (values: Values, key: string): number | null => {
  const typed = text(values, key);
  return typed === '' ? null : Number(typed);
};

// A fix as typed: both halves, or none.
const fixOf = (values: Values, end: 'start' | 'end') => {
  const latitude = text(values, `${end}Latitude`);
  const longitude = text(values, `${end}Longitude`);
  return latitude === '' && longitude === '' ? null : { latitude, longitude };
};

// An instant from the project's day and time of day; a day with no time is its start.
const instantOf = (clock: ProjectClock, values: Values, end: 'start' | 'end'): string => {
  const day = text(values, `${end}Day`);
  const time = text(values, `${end}Time`) || '00:00';
  return clock.instantAt(day, time)?.toISOString() ?? `${day}T${time}`;
};

// Every detail the form holds for this kind, as the API takes it.
export function capturedOf(
  kind: FieldEventKindName,
  values: Values,
  clock: ProjectClock,
): Captured {
  const details: Record<string, unknown> = {
    monitorId: picked(values, 'monitorId') ?? '',
    certNumber: text(values, 'certNumber'),
    startedAt: instantOf(clock, values, 'start'),
    endedAt: instantOf(clock, values, 'end'),
    start: fixOf(values, 'start'),
    end: fixOf(values, 'end'),
    address: nullable(values, 'address'),
    // An address a person types is typed, never looked up.
    addressSource: nullable(values, 'address') === null ? null : 'TYPED',
    notes: nullable(values, 'notes'),
  };
  if (sited.includes(kind) || picked(values, 'siteId') !== null) {
    details['siteId'] = picked(values, 'siteId');
  }
  const kept: readonly [FieldEventDetail, () => unknown][] = [
    ['formDebrisTypeId', () => picked(values, 'formDebrisTypeId')],
    ['loadCall', () => numeric(values, 'loadCall')],
    ['estimateCy', () => numeric(values, 'estimateCy')],
    ['carriedCount', () => numeric(values, 'carriedCount')],
    ['kindOfWorkId', () => picked(values, 'kindOfWorkId')],
    ['payableTypeId', () => picked(values, 'payableTypeId')],
    ['payItemId', () => picked(values, 'payItemId')],
    ['unitCount', () => numeric(values, 'unitCount')],
    ['measurementInches', () => numeric(values, 'measurementInches')],
    ['measuredAs', () => picked(values, 'measuredAs')],
    ['rootBallInches', () => numeric(values, 'rootBallInches')],
    ['rootBallHalfExposed', () => checked(values, 'rootBallHalfExposed')],
    ['roeNumber', () => nullable(values, 'roeNumber')],
    ['surveyNumber', () => nullable(values, 'surveyNumber')],
    ['markedIneligible', () => checked(values, 'markedIneligible')],
    ['fieldTagId', () => picked(values, 'fieldTagId')],
  ];
  for (const [detail, read] of kept) {
    if (records(kind, detail)) details[detail] = read();
  }
  return details;
}

// What the person changed, detail by detail: nothing they left as it was is sent.
export function changedOf(before: Captured, after: Captured): Captured {
  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    const was = (before as Record<string, unknown>)[key];
    if (JSON.stringify(was) !== JSON.stringify(value)) changes[key] = value;
  }
  return changes;
}
