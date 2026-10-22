// One field event of a ticket, as its monitor recorded it and as people corrected it (spec/parts/
// 08-review-and-corrections.md step 1; ADR-224, 236): side by side with the ticket's others, so
// a reviewer reads the collection's end beside the disposal's start, the cert numbers, the GPS and
// site, the debris types, and the photographs of the pile and the empty bed. Each captured detail
// is corrected in place by permission, the value before kept in the audit log (ADR-051); a number
// is renumbered (real work under the wrong number), never voided; a photograph removed from the
// record stays kept; a line, a carried ticket or a waypoint taken off stays, marked. Every act
// queues the ticket, and the worker draws its conclusions again.
import {
  correctCarriedTicketEndpoint,
  correctFieldEventEndpoint,
  correctItemLineEndpoint,
  correctScaleReceiptEndpoint,
  correctWaypointEndpoint,
  markPhotographEndpoint,
  readFieldEventEndpoint,
  renumberFieldEventEndpoint,
  type FieldEventAnswer,
  type FieldEventRead,
} from '@open-adms/contracts';
import { fieldEventDetails, type FieldEventDetail } from '@open-adms/domain';
import { Button } from '@open-adms/look';
import { useEffect, useState } from 'react';

import type { NotAnswered } from '../api.ts';
import {
  FormDialog,
  checked,
  nullable,
  picked,
  text,
  type FieldSpec,
  type Values,
} from '../look/form-dialog.tsx';
import { Photo } from '../look/photo.tsx';
import { Shown, useApi, useRead } from '../reading.tsx';
import { yesNo, type SetupWritten } from '../setup/common.tsx';
import { number, say, words } from '../words.ts';
import { capturedOf, changedOf, fieldEventFields, fieldEventValues } from './field-event-form.tsx';
import { at, debrisTypeOf, nameOf, payItemOf, personOf, useReviewing } from './reviewing.tsx';

type Open =
  | { readonly kind: 'correct' }
  | { readonly kind: 'renumber' }
  | { readonly kind: 'line'; readonly itemNameId: string | null }
  | { readonly kind: 'carried' }
  | { readonly kind: 'receipt' };

// What the card may do, by the person's grants and whether the ticket is locked as invoiced.
export interface Allowed {
  readonly correct: boolean;
  readonly renumber: boolean;
}

const records = (event: FieldEventRead, detail: FieldEventDetail): boolean =>
  (fieldEventDetails[detail] as readonly string[]).includes(event.kind);

const optionalNote = (values: Values): { note?: string } => {
  const note = text(values, 'note');
  return note === '' ? {} : { note };
};

export function FieldEventCard({
  event,
  allowed,
  reloaded,
  onDone,
  onFailed,
  onRenumbered,
}: {
  readonly event: FieldEventRead;
  readonly allowed: Allowed;
  readonly reloaded: number;
  // Told what an act saved; the ticket is read again.
  readonly onDone: (written: SetupWritten) => void;
  readonly onFailed: (reply: NotAnswered) => void;
  // Told the number a renumber gave it.
  readonly onRenumbered: (ticketNumber: string) => void;
}) {
  const [read, reload] = useRead(readFieldEventEndpoint, { params: { fieldEventId: event.id } });
  // Read again whenever the ticket is.
  useEffect(() => {
    if (reloaded > 0) reload();
  }, [reloaded, reload]);
  const title = say(words.review.event.title, {
    kind: words.review.kinds[event.kind],
    number:
      event.splitSuffix === '' ? event.ticketNumber : `${event.ticketNumber}-${event.splitSuffix}`,
  });
  return (
    <section className="event-card" aria-label={title}>
      <h3 className="event-title">{title}</h3>
      <Shown read={read}>
        {(answer) => (
          <EventOf
            answer={answer}
            allowed={allowed}
            onDone={onDone}
            onFailed={onFailed}
            onRenumbered={onRenumbered}
          />
        )}
      </Shown>
    </section>
  );
}

function EventOf({
  answer,
  allowed,
  onDone,
  onFailed,
  onRenumbered,
}: {
  readonly answer: FieldEventAnswer;
  readonly allowed: Allowed;
  readonly onDone: (written: SetupWritten) => void;
  readonly onFailed: (reply: NotAnswered) => void;
  readonly onRenumbered: (ticketNumber: string) => void;
}) {
  const api = useApi();
  const { names, clock } = useReviewing();
  const said = words.review.event;
  const event = answer.fieldEvent;
  const [open, setOpen] = useState<Open | null>(null);
  const closed = () => {
    setOpen(null);
  };
  const done = (written: SetupWritten): null => {
    onDone(written);
    return null;
  };
  const fix = (value: { latitude: string; longitude: string } | null) =>
    value === null ? words.common.none : `${value.latitude}, ${value.longitude}`;
  const facts: (readonly [string, string])[] = [
    [said.status, words.review.statuses[event.status]],
    [
      said.madeBy,
      event.source === 'BACK_OFFICE'
        ? say(said.madeInBackOffice, {
            person: personOf(names, event.createdById),
            reason: nameOf(names.reasons, event.createdReasonId),
          })
        : said.madeOnPhone,
    ],
    [said.monitor, personOf(names, event.monitorId)],
    [said.started, at(clock, event.startedAt)],
    [said.ended, at(clock, event.endedAt)],
    [said.startGps, fix(event.start)],
    [said.endGps, fix(event.end)],
    [said.address, event.address ?? words.common.none],
    [
      said.certNumber,
      event.certificationId === null
        ? say(said.certNotFound, { number: event.certNumber })
        : event.certNumber,
    ],
  ];
  if (event.certKeyedByHand) {
    facts.push([
      said.certKeyedByHand,
      say(said.typedCapacity, { capacity: event.typedCapacityCy ?? 0 }),
    ]);
  }
  if (event.numberTyped) {
    facts.push([said.numberTyped, nameOf(names.reasons, event.numberTypedReasonId)]);
  }
  if (event.siteId !== null) facts.push([said.site, nameOf(names.sites, event.siteId)]);
  if (records(event, 'formDebrisTypeId')) {
    facts.push([said.debrisType, debrisTypeOf(names, event.formDebrisTypeId)]);
  }
  if (records(event, 'loadCall')) {
    facts.push([
      said.loadCall,
      event.loadCall === null ? words.common.none : `${String(event.loadCall)}%`,
    ]);
  }
  const plain: readonly (readonly [FieldEventDetail, string, number | null])[] = [
    ['estimateCy', said.estimateCy, event.estimateCy],
    ['carriedCount', said.carriedCount, event.carriedCount],
    ['unitCount', said.unitCount, event.unitCount],
    ['measurementInches', said.measurementInches, event.measurementInches],
    ['rootBallInches', said.rootBallInches, event.rootBallInches],
  ];
  for (const [detail, label, value] of plain) {
    if (records(event, detail) && value !== null) facts.push([label, number(value)]);
  }
  if (records(event, 'kindOfWorkId')) {
    facts.push([said.kindOfWork, nameOf(names.kindsOfWork, event.kindOfWorkId)]);
    facts.push([said.payableType, nameOf(names.payableTypes, event.payableTypeId)]);
    facts.push([said.payItem, payItemOf(names, event.payItemId ?? event.workedOutPayItemId)]);
  }
  if (event.measuredAs !== null)
    facts.push([said.measuredAs, said.measuredAsWays[event.measuredAs]]);
  if (event.rootBallHalfExposed !== null) {
    facts.push([said.rootBallHalfExposed, yesNo(event.rootBallHalfExposed)]);
  }
  if (event.roeNumber !== null) {
    facts.push([
      said.roeNumber,
      event.roeId === null ? say(said.roeNotFound, { number: event.roeNumber }) : event.roeNumber,
    ]);
  }
  if (event.surveyNumber !== null) facts.push([said.surveyNumber, event.surveyNumber]);
  if (event.markedIneligible !== null)
    facts.push([said.markedIneligible, yesNo(event.markedIneligible)]);
  if (event.fieldTagId !== null)
    facts.push([said.fieldTag, nameOf(names.fieldTags, event.fieldTagId)]);
  if (event.zoneId !== null)
    facts.push([
      said.zone,
      nameOf(
        names.zones.map((zone) => ({ ...zone, archived: false })),
        event.zoneId,
      ),
    ]);
  facts.push([said.received, at(clock, event.receivedAt)]);
  if (event.notes !== null) facts.push([words.common.notes, event.notes]);

  // The act's answer, or why not: the card's own dialog keeps a refusal beside its fields.
  const sent = async (
    reply: Promise<{ kind: 'answered'; answer: SetupWritten } | NotAnswered>,
  ): Promise<NotAnswered | null> => {
    const answered = await reply;
    return answered.kind === 'answered' ? done(answered.answer) : answered;
  };
  const pressed = (reply: Promise<{ kind: 'answered'; answer: SetupWritten } | NotAnswered>) => {
    void reply.then((answered) => {
      if (answered.kind === 'answered') onDone(answered.answer);
      else onFailed(answered);
    });
  };
  const noteField: FieldSpec = {
    kind: 'text',
    key: 'note',
    label: words.review.note,
    longest: 500,
  };
  const correcting = fieldEventValues(event, clock);

  return (
    <>
      <dl className="facts">
        {facts.map(([label, value]) => (
          <div key={label} className="fact">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {allowed.correct || allowed.renumber ? (
        <div className="row-actions">
          {allowed.correct ? (
            <Button
              onPress={() => {
                setOpen({ kind: 'correct' });
              }}
            >
              {said.correct}
            </Button>
          ) : null}
          {allowed.renumber ? (
            <Button
              onPress={() => {
                setOpen({ kind: 'renumber' });
              }}
            >
              {said.renumber}
            </Button>
          ) : null}
        </div>
      ) : null}

      {answer.itemLines.length === 0 && !(allowed.correct && event.kind === 'UNIT_RATE') ? null : (
        <div className="event-part">
          <h4>{said.itemLines}</h4>
          <ul className="plain-list">
            {answer.itemLines.map((line) => (
              <li key={line.id} className="tag-list-item">
                <span>
                  {say(said.itemLine, {
                    item: nameOf(names.itemNames, line.itemNameId),
                    quantity: number(line.quantity),
                  })}
                  {line.takenOffAt === null ? '' : ` (${said.takenOff})`}
                </span>
                {allowed.correct ? (
                  <Button
                    onPress={() => {
                      setOpen({ kind: 'line', itemNameId: line.itemNameId });
                    }}
                  >
                    {say(words.common.of, {
                      what: said.correctLine,
                      name: nameOf(names.itemNames, line.itemNameId),
                    })}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {allowed.correct && event.kind === 'UNIT_RATE' ? (
            <Button
              onPress={() => {
                setOpen({ kind: 'line', itemNameId: null });
              }}
            >
              {said.addLine}
            </Button>
          ) : null}
        </div>
      )}

      {event.kind !== 'COLLECTION' ||
      (answer.carriedTickets.length === 0 && !allowed.correct) ? null : (
        <div className="event-part">
          <h4>{said.carried}</h4>
          {answer.carriedTickets.length === 0 ? (
            <p className="quiet">{words.common.none}</p>
          ) : (
            <ul className="plain-list">
              {answer.carriedTickets.map((carried) => (
                <li key={carried.id} className="tag-list-item">
                  <span>
                    {carried.carriedTicketNumber}
                    {carried.takenOffAt === null ? '' : ` (${said.takenOff})`}
                  </span>
                  {allowed.correct ? (
                    <Button
                      onPress={() => {
                        pressed(
                          api.ask(correctCarriedTicketEndpoint, {
                            params: { fieldEventId: event.id },
                            body: {
                              carriedTicketNumber: carried.carriedTicketNumber,
                              carried: carried.takenOffAt !== null,
                            },
                          }),
                        );
                      }}
                    >
                      {say(words.common.of, {
                        what: carried.takenOffAt === null ? said.takeOff : said.putBack,
                        name: carried.carriedTicketNumber,
                      })}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {allowed.correct ? (
            <Button
              onPress={() => {
                setOpen({ kind: 'carried' });
              }}
            >
              {said.addCarried}
            </Button>
          ) : null}
        </div>
      )}

      {answer.waypoints.length === 0 ? null : (
        <div className="event-part">
          <h4>{said.waypoints}</h4>
          <ol className="plain-list">
            {answer.waypoints.map((waypoint) => (
              <li key={waypoint.id} className="tag-list-item">
                <span>
                  {say(said.waypoint, {
                    position: waypoint.position,
                    at: at(clock, waypoint.markedAt),
                    fix: fix(waypoint.fix),
                  })}
                  {waypoint.takenOffAt === null ? '' : ` (${said.takenOff})`}
                </span>
                {allowed.correct ? (
                  <Button
                    onPress={() => {
                      pressed(
                        api.ask(correctWaypointEndpoint, {
                          params: { fieldEventId: event.id, position: String(waypoint.position) },
                          body: { changes: { takenOff: waypoint.takenOffAt === null } },
                        }),
                      );
                    }}
                  >
                    {say(words.common.of, {
                      what: waypoint.takenOffAt === null ? said.takeOff : said.putBack,
                      name: say(said.waypointNumbered, { position: waypoint.position }),
                    })}
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      )}

      {answer.scaleReceipt === null ? null : (
        <div className="event-part">
          <h4>{said.scaleReceipt}</h4>
          <dl className="facts">
            <div className="fact">
              <dt>{said.receiptNumber}</dt>
              <dd>{answer.scaleReceipt.receiptNumber}</dd>
            </div>
            <div className="fact">
              <dt>{said.site}</dt>
              <dd>{nameOf(names.sites, answer.scaleReceipt.siteId)}</dd>
            </div>
            <div className="fact">
              <dt>{said.netTons}</dt>
              <dd>
                {answer.scaleReceipt.netWeightTons === null
                  ? words.common.none
                  : number(answer.scaleReceipt.netWeightTons)}
              </dd>
            </div>
            <div className="fact">
              <dt>{said.netPounds}</dt>
              <dd>
                {answer.scaleReceipt.netWeightLb === null
                  ? words.common.none
                  : number(answer.scaleReceipt.netWeightLb)}
              </dd>
            </div>
          </dl>
          {allowed.correct ? (
            <Button
              onPress={() => {
                setOpen({ kind: 'receipt' });
              }}
            >
              {said.correctReceipt}
            </Button>
          ) : null}
        </div>
      )}

      <div className="event-part">
        <h4>{said.photos}</h4>
        {answer.photographs.length === 0 ? (
          <p className="quiet">{said.noPhotos}</p>
        ) : (
          <div className="photos">
            {answer.photographs.map((photo) => {
              const label = say(said.photoLabel, {
                what:
                  photo.label ??
                  (photo.stage === null
                    ? words.review.kinds[event.kind]
                    : said.stages[photo.stage]),
                at: at(clock, photo.capturedAt),
              });
              return (
                <div key={photo.id} className="photo-with-acts">
                  {photo.uploadedAt === null ? (
                    <p className="quiet">{say(said.photoNotArrived, { what: label })}</p>
                  ) : (
                    <Photo photoId={photo.id} label={label} />
                  )}
                  {photo.removedAt === null ? null : <p>{said.photoRemoved}</p>}
                  {allowed.correct ? (
                    <Button
                      onPress={() => {
                        pressed(
                          api.ask(markPhotographEndpoint, {
                            params: { photoId: photo.id },
                            body: { marks: { removed: photo.removedAt === null } },
                          }),
                        );
                      }}
                    >
                      {say(words.common.of, {
                        what: photo.removedAt === null ? said.removePhoto : said.putBack,
                        name: label,
                      })}
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {open?.kind === 'correct' ? (
        <FormDialog
          title={say(words.common.of, { what: said.correct, name: said.titleShort })}
          fields={[...fieldEventFields(event.kind, names, event), noteField]}
          initial={correcting}
          save={(values) => {
            const changes = changedOf(
              capturedOf(event.kind, correcting, clock),
              capturedOf(event.kind, values, clock),
            );
            if (Object.keys(changes).length === 0) {
              closed();
              return Promise.resolve(null);
            }
            return sent(
              api.ask(correctFieldEventEndpoint, {
                params: { fieldEventId: event.id },
                body: { changes, ...optionalNote(values) },
              }),
            );
          }}
          onClose={closed}
        >
          <p>{said.correctAbout}</p>
        </FormDialog>
      ) : null}
      {open?.kind === 'renumber' ? (
        <FormDialog
          title={said.renumber}
          fields={[
            {
              kind: 'text',
              key: 'ticketNumber',
              label: said.newNumber,
              required: true,
              longest: 40,
            },
            ...(event.splitSuffix === ''
              ? []
              : [
                  {
                    kind: 'text' as const,
                    key: 'splitSuffix',
                    label: said.splitSuffix,
                    longest: 4,
                  },
                ]),
            noteField,
          ]}
          initial={{ ticketNumber: event.ticketNumber, splitSuffix: event.splitSuffix }}
          saveLabel={said.renumber}
          save={(values) => {
            const suffix = text(values, 'splitSuffix');
            return api
              .ask(renumberFieldEventEndpoint, {
                params: { fieldEventId: event.id },
                body: {
                  ticketNumber: text(values, 'ticketNumber'),
                  ...(event.splitSuffix === '' ? {} : { splitSuffix: suffix.toUpperCase() }),
                  ...optionalNote(values),
                },
              })
              .then((reply) => {
                if (reply.kind !== 'answered') return reply;
                done(reply.answer);
                onRenumbered(reply.answer.record.ticketNumber);
                return null;
              });
          }}
          onClose={closed}
        >
          <p>{said.renumberAbout}</p>
        </FormDialog>
      ) : null}
      {open?.kind === 'line' ? (
        <FormDialog
          title={open.itemNameId === null ? said.addLine : said.correctLine}
          fields={[
            ...(open.itemNameId === null
              ? [
                  {
                    kind: 'pick' as const,
                    key: 'itemNameId',
                    label: said.item,
                    required: true,
                    options: names.itemNames
                      .filter((item) => !item.archived && item.kindOfWorkId === event.kindOfWorkId)
                      .map((item) => ({ id: item.id, label: item.name })),
                  },
                ]
              : []),
            { kind: 'decimal', key: 'quantity', label: said.quantity },
            { kind: 'check', key: 'takenOff', label: said.takeLineOff },
            noteField,
          ]}
          initial={{
            quantity: String(
              answer.itemLines.find((line) => line.itemNameId === open.itemNameId)?.quantity ?? '',
            ),
          }}
          save={(values) =>
            sent(
              api.ask(correctItemLineEndpoint, {
                params: {
                  fieldEventId: event.id,
                  itemNameId: open.itemNameId ?? picked(values, 'itemNameId') ?? '',
                },
                body: {
                  quantity: checked(values, 'takenOff')
                    ? 'TAKEN_OFF'
                    : Number(text(values, 'quantity')),
                  ...optionalNote(values),
                },
              }),
            )
          }
          onClose={closed}
        />
      ) : null}
      {open?.kind === 'carried' ? (
        <FormDialog
          title={said.addCarried}
          fields={[
            {
              kind: 'text',
              key: 'carried',
              label: said.carriedNumber,
              required: true,
              longest: 40,
            },
            noteField,
          ]}
          initial={{}}
          save={(values) =>
            sent(
              api.ask(correctCarriedTicketEndpoint, {
                params: { fieldEventId: event.id },
                body: {
                  carriedTicketNumber: text(values, 'carried'),
                  carried: true,
                  ...optionalNote(values),
                },
              }),
            )
          }
          onClose={closed}
        />
      ) : null}
      {open?.kind === 'receipt' && answer.scaleReceipt !== null ? (
        <ReceiptDialog receipt={answer.scaleReceipt} onClose={closed} onDone={done} />
      ) : null}
    </>
  );
}

// A scale receipt corrected as the site's paper has it: only what the person changed is sent.
function ReceiptDialog({
  receipt,
  onClose,
  onDone,
}: {
  readonly receipt: NonNullable<FieldEventAnswer['scaleReceipt']>;
  readonly onClose: () => void;
  readonly onDone: (written: SetupWritten) => null;
}) {
  const api = useApi();
  const { names } = useReviewing();
  const said = words.review.event;
  const shown = (value: number | null) => (value === null ? '' : String(value));
  const initial: Values = {
    receiptNumber: receipt.receiptNumber,
    siteId: receipt.siteId,
    grossWeightLb: shown(receipt.grossWeightLb),
    tareWeightLb: shown(receipt.tareWeightLb),
    netWeightLb: shown(receipt.netWeightLb),
    netWeightTons: shown(receipt.netWeightTons),
    notes: receipt.notes ?? '',
  };
  const bodyOf = (values: Values) => {
    const weight = (key: string) => {
      const typed = text(values, key);
      return typed === '' ? null : Number(typed);
    };
    return {
      receiptNumber: text(values, 'receiptNumber'),
      siteId: picked(values, 'siteId') ?? receipt.siteId,
      grossWeightLb: weight('grossWeightLb'),
      tareWeightLb: weight('tareWeightLb'),
      netWeightLb: weight('netWeightLb'),
      netWeightTons: weight('netWeightTons'),
      notes: nullable(values, 'notes'),
    };
  };
  return (
    <FormDialog
      title={said.correctReceipt}
      fields={[
        {
          kind: 'text',
          key: 'receiptNumber',
          label: said.receiptNumber,
          required: true,
          longest: 40,
        },
        {
          kind: 'pick',
          key: 'siteId',
          label: said.site,
          options: names.sites
            .filter((site) => !site.archived || site.id === receipt.siteId)
            .map((site) => ({ id: site.id, label: site.name })),
        },
        { kind: 'decimal', key: 'grossWeightLb', label: said.grossPounds },
        { kind: 'decimal', key: 'tareWeightLb', label: said.tarePounds },
        { kind: 'decimal', key: 'netWeightLb', label: said.netPounds },
        { kind: 'decimal', key: 'netWeightTons', label: said.netTons },
        { kind: 'long', key: 'notes', label: words.common.notes, longest: 2000 },
        { kind: 'text', key: 'note', label: words.review.note, longest: 500 },
      ]}
      initial={initial}
      save={async (values) => {
        const before = bodyOf(initial) as Record<string, unknown>;
        const changes = Object.fromEntries(
          Object.entries(bodyOf(values)).filter(
            ([key, value]) => JSON.stringify(before[key]) !== JSON.stringify(value),
          ),
        );
        if (Object.keys(changes).length === 0) {
          onClose();
          return null;
        }
        const note = text(values, 'note');
        const reply = await api.ask(correctScaleReceiptEndpoint, {
          params: { scaleReceiptId: receipt.id },
          body: { changes, ...(note === '' ? {} : { note }) },
        });
        return reply.kind === 'answered' ? onDone(reply.answer) : reply;
      }}
      onClose={onClose}
    />
  );
}
