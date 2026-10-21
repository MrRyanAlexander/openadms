// The eighth story (BACKLOG 1.4.2; ADR-338; spec/acceptance/05-sync.md AC-05-50; adms-exceptions
// Scenario C): P1's Monday and Tuesday again, exactly as the story `p1-field-days` records them
// on its six phones, but nothing reaches the server until Wednesday, and then backwards: the
// newest record first, Tuesday's work ahead of Monday's, every disposal ahead of its collection.
// What is saved is what `p1-field-days` saves in field order: arrival order changes nothing but
// each record's received time.
//
// One thing can't arrive backwards: a scale receipt is sent before the disposal that points at
// it (ADR-326), so each receipt goes first. That is the phone's own order, not the server's wish.
//
// Each record arrives in a sync of its own, through the API's `Sync` (BACKLOG 2.6.2 part 4;
// ADR-475): a phone on a thin connection, a record a call.
import type { RecordAnswer } from '@open-adms/contracts';
import type { FieldEventKind } from '@open-adms/db';

import { projectTime } from '../clock.ts';
import type { PhoneRecord } from '../device.ts';
import type { Story } from '../runner.ts';
import { sentAlone } from './board.ts';
import { p1FieldDays } from './p1-field-days.ts';
import { p1FieldDaysHeld } from './p1-office.ts';
import { p1TimeZone as timeZone } from './p1.ts';

const short: Record<FieldEventKind, string> = {
  COLLECTION: 'COL',
  DISPOSAL: 'DIS',
  HAUL_OUT_COLLECTION: 'HOC',
  HAUL_OUT_DISPOSAL: 'HOD',
  UNIT_RATE: 'URT',
};

export const p1AnyOrder: Story = {
  name: 'p1-any-order',
  title:
    'P1’s Monday and Tuesday reach the server on Wednesday, newest first: what is saved is the same as in field order',
  timeZone,
  start: p1FieldDays.start,

  async run(story) {
    const { api } = story;
    // The two days as `p1-field-days` tells them, with every phone's sync held back: each record
    // a phone sends is kept, unanswered by the server, and that story's own checks of what the
    // server holds along the way aren't asked.
    const held: PhoneRecord[] = (await p1FieldDaysHeld(story)).held.map(({ sent }) => sent);
    story.at(
      '2026-10-14T07:30:00-04:00',
      'Wednesday: nothing has reached the server. Every record of both days arrives now, the newest first',
    );
    story.check(
      'the phones held 25 field events, a scale receipt, an incident and a drop-off log; the server has none',
      [
        held.filter((sent) => sent.record === 'FIELD_EVENT').length,
        held.filter((sent) => sent.record !== 'FIELD_EVENT').map((sent) => sent.record),
        await api.fieldEvent.count(),
      ],
      [25, ['SCALE_RECEIPT', 'INCIDENT', 'DROP_OFF_LOG'], 0],
    );
    const when = (sent: PhoneRecord): number => {
      switch (sent.record) {
        case 'FIELD_EVENT':
          return sent.fieldEvent.endedAt.getTime();
        case 'SCALE_RECEIPT':
          return sent.scaleReceipt.enteredAt.getTime();
        case 'INCIDENT':
          return sent.incident.madeAt.getTime();
        case 'DROP_OFF_LOG':
          return sent.dropOffLog.madeAt.getTime();
        case 'SURVEY':
          return sent.survey.madeAt.getTime();
        case 'ROE':
          return sent.roe.madeAt.getTime();
        case 'CLOCK_ENTRY':
          return sent.clockEntry.at.getTime();
      }
    };
    const backwards = [
      ...held.filter((sent) => sent.record === 'SCALE_RECEIPT'),
      ...held.filter((sent) => sent.record !== 'SCALE_RECEIPT').sort((a, b) => when(b) - when(a)),
    ];
    const answers: RecordAnswer[] = [];
    for (const sent of backwards) answers.push(await sentAlone(story, timeZone, sent));
    const firstFieldEvents = backwards.flatMap((sent) =>
      sent.record === 'FIELD_EVENT' ? [sent.fieldEvent] : [],
    );
    story.check(
      'AC-05-50 Tuesday’s last haul-out disposal arrives ahead of Monday’s first collection, and every record is answered "saved"',
      [
        firstFieldEvents
          .filter((_, index) => index === 0 || index === firstFieldEvents.length - 1)
          .map(
            (event) =>
              `${event.ticketNumber} ${short[event.kind]} ${projectTime(timeZone, event.endedAt)}`,
          ),
        [...new Set(answers.map((one) => one.answer))],
        answers.length,
      ],
      [['201004 HOD Tue 13 Oct 17:15', '101001 COL Mon 12 Oct 08:40'], ['SAVED'], 28],
    );
    const events = await api.fieldEvent.findMany({
      include: { formDebrisType: { include: { debrisType: true } }, payItem: true, items: true },
      orderBy: [{ ticketNumber: 'asc' }, { splitSuffix: 'asc' }, { endedAt: 'asc' }],
    });
    const users = new Map((await api.user.findMany()).map((user) => [user.id, user.name]));
    story.check(
      'AC-05-50 what is saved is what field order saves (the story p1-field-days, AC-04-93): the same twenty-five field events, each as recorded, each PENDING',
      events.map((event) =>
        [
          event.splitSuffix === ''
            ? event.ticketNumber
            : `${event.ticketNumber}-${event.splitSuffix}`,
          short[event.kind],
          projectTime(timeZone, event.endedAt),
          users.get(event.monitorId),
          event.certNumber,
          event.formDebrisType?.debrisType.name ?? event.payItem?.code ?? 'no pay item',
          event.loadCall === null ? 'no call' : `${String(event.loadCall)}%`,
          event.status,
        ].join(' · '),
      ),
      [
        '101001 · COL · Mon 12 Oct 08:40 · Ana Brooks · 730415 · Vegetative · no call · PENDING',
        '101001 · DIS · Mon 12 Oct 09:25 · Kim Nguyen · 730415 · Vegetative · 80% · PENDING',
        '101002 · COL · Mon 12 Oct 10:10 · Ana Brooks · 730416 · C&D · no call · PENDING',
        '101002 · DIS · Mon 12 Oct 10:50 · Tariq Patel · 730416 · C&D · 75% · PENDING',
        '101003 · COL · Mon 12 Oct 11:30 · Ana Brooks · 730415 · Vegetative · no call · PENDING',
        '101003 · DIS · Mon 12 Oct 12:05 · Kim Nguyen · 730415 · Vegetative · 96% · PENDING',
        '101004 · COL · Mon 12 Oct 17:50 · Ana Brooks · 730416 · Vegetative · no call · PENDING',
        '101004 · DIS · Tue 13 Oct 07:15 · Kim Nguyen · 730416 · Vegetative · 50% · PENDING',
        '101005 · COL · Tue 13 Oct 10:05 · Ana Brooks · 730415 · Vegetative · no call · PENDING',
        '101005 · DIS · Tue 13 Oct 10:40 · Kim Nguyen · 730415 · Vegetative · 70% · PENDING',
        '101006 · COL · Tue 13 Oct 11:30 · Ana Brooks · 730416 · Vegetative · no call · PENDING',
        '101060 · DIS · Tue 13 Oct 12:10 · Kim Nguyen · 730416 · Vegetative · 60% · PENDING',
        '201001 · HOC · Tue 13 Oct 13:00 · Sam Grant · 730419 · Mulch · 90% · PENDING',
        '201001 · HOD · Tue 13 Oct 14:10 · Tariq Patel · 730419 · Mulch · no call · PENDING',
        '201004 · HOD · Tue 13 Oct 17:15 · Lee Morgan · 730419 · Mulch · no call · PENDING',
        '201004-A · HOC · Tue 13 Oct 15:30 · Sam Grant · 730419 · Mulch · 10% · PENDING',
        '201004-B · HOC · Tue 13 Oct 15:45 · Sam Grant · 730419 · Mulch · 35% · PENDING',
        '201004-C · HOC · Tue 13 Oct 16:05 · Sam Grant · 730419 · Mulch · 85% · PENDING',
        '301001 · URT · Mon 12 Oct 09:55 · Jo Kim · 730417 · HNG-RMV-EA · no call · PENDING',
        '301002 · URT · Mon 12 Oct 11:10 · Jo Kim · 730417 · LNR-RMV-EA-24 · no call · PENDING',
        '301003 · URT · Mon 12 Oct 13:10 · Jo Kim · 730417 · HNG-RMV-EA · no call · PENDING',
        '301004 · URT · Tue 13 Oct 08:50 · Jo Kim · 730418 · STP-RMV-EA-36 · no call · PENDING',
        '301005 · URT · Tue 13 Oct 09:20 · Jo Kim · 730418 · no pay item · no call · PENDING',
        '301006 · URT · Tue 13 Oct 11:15 · Jo Kim · 730417 · WG-RMV-EA · no call · PENDING',
        '301007 · URT · Tue 13 Oct 17:05 · Jo Kim · 730418 · CREW-TIME-HR · no call · PENDING',
      ],
    );
    const sentEvents = new Map(firstFieldEvents.map((event) => [event.id, event]));
    story.check(
      'each is the record its phone made, by id, with its item lines; the receipt, the incident and the drop-off log are there once; arrival order changed nothing but the received time, Wednesday 07:30 for all of it',
      [
        events.every((event) => sentEvents.has(event.id)),
        events.reduce((sum, event) => sum + event.items.length, 0),
        firstFieldEvents.reduce((sum, event) => sum + event.items.length, 0),
        await api.scaleReceipt.count(),
        await api.incident.count(),
        await api.dropOffLog.count(),
        await api.quarantinedRecord.count(),
        [...new Set(events.map((event) => projectTime(timeZone, event.receivedAt)))],
      ],
      [true, 6, 6, 1, 1, 1, 0, ['Wed 14 Oct 07:30']],
    );
  },
};
