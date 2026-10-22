// A project's pay items (adms-ledger-audit; ADR-206, 207, 213, 221, 301): each priced line of the
// contract as set up, its code unique on the project, the firm's own description, the work it prices
// (a payable type), its unit, a size band where it has one, what its unit rate capture asks, and a
// rate for each prime: the only place a rate lives. A change is previewed first: the API says
// whether it would save and how many tickets it would draw again (only those not locked as
// invoiced). Crew time paid by the day may step its hours to days.
import {
  billingUnits,
  changePayItemEndpoint,
  createPayItemEndpoint,
  listPayItemRatesEndpoint,
  listPayItemsEndpoint,
  previewPayItemChangeEndpoint,
  previewPayItemRateEndpoint,
  readProjectEndpoint,
  setCrewDayStepsEndpoint,
  setPayItemRateEndpoint,
  type PayItemsAnswer,
} from '@open-adms/contracts';
import { crewTimeConversions } from '@open-adms/domain';
import { Banner, Button, ScreenTitle, TextEntry } from '@open-adms/look';
import { useState } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';

import type { NotAnswered } from '../api.ts';
import {
  FormDialog,
  checked,
  numberOf,
  picked,
  text,
  type FieldSpec,
  type Values,
} from '../look/form-dialog.tsx';
import { PagedTable } from '../look/paged-table.tsx';
import { Trouble, trouble, useApi, useRead } from '../reading.tsx';
import { holds, useSigned } from '../session.tsx';
import { counted, money, say, words } from '../words.ts';
import { nameIn, useListOptions, useTold, type SetupWritten } from './common.tsx';

type Entry = PayItemsAnswer['payItems'][number];
type PayItem = Entry['payItem'];

type Open =
  | { readonly kind: 'item'; readonly entry: Entry | null }
  | {
      readonly kind: 'rate';
      readonly item: PayItem;
      readonly primeId: string;
      readonly primeName: string;
      readonly rate: string | null;
    }
  | { readonly kind: 'steps'; readonly entry: Entry };

const flags = [
  'countIsAlwaysOne',
  'gpsRequired',
  'measurementRequired',
  'decimalsAllowed',
  'photosRequired',
  'monitorMayMarkIneligible',
  'quantityFromCarriedTickets',
] as const;

export function PayItems({ projectId }: { readonly projectId: string }) {
  const api = useApi();
  const { session } = useSigned();
  const mayChange = holds(session, 'SETUP');
  const said = words.payItems;
  const [project] = useRead(readProjectEndpoint, { params: { projectId } });
  const [rates, reloadRates] = useRead(listPayItemRatesEndpoint, {
    params: { projectId },
    query: { limit: '200' },
  });
  const payableTypes = useListOptions('payable-types');
  const kinds = useListOptions('kinds-of-work');
  const [open, setOpen] = useState<Open | null>(null);
  const [reloaded, setReloaded] = useState(0);
  const [told, tell] = useTold();

  const primes =
    project.kind === 'answered'
      ? project.answer.contractors
          .filter((place) => place.position === 'PRIME' && !place.archived)
          .map((place) => ({ id: place.contractorId, name: place.name }))
      : [];
  const rateOf = (payItemId: string, primeId: string): string | null =>
    rates.kind === 'answered'
      ? (rates.answer.rates.find(
          (rate) => rate.payItemId === payItemId && rate.primeId === primeId && !rate.archived,
        )?.rate ?? null)
      : null;

  const done = (answer: SetupWritten): null => {
    tell(answer);
    setReloaded((count) => count + 1);
    reloadRates();
    return null;
  };

  const itemFields = (adding: boolean): FieldSpec[] => [
    {
      kind: 'text',
      key: 'code',
      label: said.code,
      hint: said.codeHint,
      required: true,
      longest: 60,
    },
    { kind: 'text', key: 'description', label: said.description, required: true, longest: 200 },
    ...(adding
      ? [
          {
            kind: 'pick',
            key: 'payableTypeId',
            label: said.payableType,
            options: payableTypes,
            required: true,
          } as const,
          {
            kind: 'pick',
            key: 'kindOfWorkId',
            label: said.kindOfWork,
            hint: said.kindOfWorkHint,
            options: kinds,
          } as const,
        ]
      : []),
    {
      kind: 'pick',
      key: 'unit',
      label: said.unit,
      required: true,
      options: billingUnits.map((unit) => ({ id: unit, label: said.units[unit] })),
    },
    { kind: 'decimal', key: 'bandFrom', label: said.bandFrom },
    { kind: 'decimal', key: 'bandTo', label: said.bandTo },
    ...flags.map((flag): FieldSpec => ({ kind: 'check', key: flag, label: said[flag] })),
    {
      kind: 'pick',
      key: 'crewTimeConversion',
      label: said.crewTimeConversion,
      options: crewTimeConversions.map((way) => ({ id: way, label: said.conversions[way] })),
    },
    { kind: 'decimal', key: 'crewDayHours', label: said.crewDayHours },
    ...(adding
      ? [
          { kind: 'heading', key: 'ratesHeading', label: said.rates } as const,
          ...primes.map((prime): FieldSpec => ({
            kind: 'decimal',
            key: `rate-${prime.id}`,
            label: say(said.rateFor, { prime: prime.name }),
            hint: said.rateHint,
          })),
        ]
      : []),
  ];

  const settingsOf = (values: Values) =>
    ({
      code: text(values, 'code'),
      description: text(values, 'description'),
      unit: (picked(values, 'unit') ?? 'CY') as (typeof billingUnits)[number],
      bandFrom: numberOf(values, 'bandFrom'),
      bandTo: numberOf(values, 'bandTo'),
      ...Object.fromEntries(flags.map((flag) => [flag, checked(values, flag)])),
      crewTimeConversion: picked(values, 'crewTimeConversion') as
        (typeof crewTimeConversions)[number] | null,
      crewDayHours: numberOf(values, 'crewDayHours'),
    }) as {
      code: string;
      description: string;
      unit: (typeof billingUnits)[number];
      bandFrom: number | null;
      bandTo: number | null;
      crewTimeConversion: (typeof crewTimeConversions)[number] | null;
      crewDayHours: number | null;
    } & Record<(typeof flags)[number], boolean>;

  const itemDialog = (entry: Entry | null) => {
    const item = entry?.payItem ?? null;
    return (
      <PreviewedDialog
        title={item === null ? said.add : say(said.edit, { code: item.code })}
        fields={itemFields(item === null)}
        initial={
          item === null
            ? { unit: 'CY' }
            : {
                code: item.code,
                description: item.description,
                unit: item.unit,
                bandFrom: item.bandFrom === null ? '' : String(item.bandFrom),
                bandTo: item.bandTo === null ? '' : String(item.bandTo),
                ...Object.fromEntries(flags.map((flag) => [flag, item[flag]])),
                crewTimeConversion: item.crewTimeConversion,
                crewDayHours: item.crewDayHours === null ? '' : String(item.crewDayHours),
              }
        }
        preview={
          item === null
            ? null
            : async (values) => {
                const reply = await api.ask(previewPayItemChangeEndpoint, {
                  params: { payItemId: item.id },
                  body: settingsOf(values),
                });
                return reply.kind === 'answered' ? reply.answer : reply;
              }
        }
        save={async (values) => {
          if (item !== null) {
            const reply = await api.ask(changePayItemEndpoint, {
              params: { payItemId: item.id },
              body: settingsOf(values),
            });
            return reply.kind === 'answered' ? done(reply.answer) : reply;
          }
          const reply = await api.ask(createPayItemEndpoint, {
            params: { projectId },
            body: {
              ...settingsOf(values),
              payableTypeId: picked(values, 'payableTypeId') ?? '',
              kindOfWorkId: picked(values, 'kindOfWorkId'),
              rates: primes.flatMap((prime) => {
                const rate = text(values, `rate-${prime.id}`);
                return rate === '' ? [] : [{ primeId: prime.id, rate }];
              }),
            },
          });
          return reply.kind === 'answered' ? done(reply.answer) : reply;
        }}
        onClose={() => {
          setOpen(null);
        }}
      />
    );
  };

  const rateDialog = (open: Extract<Open, { kind: 'rate' }>) => (
    <PreviewedDialog
      title={say(said.rateTitle, { code: open.item.code, prime: open.primeName })}
      fields={[
        {
          kind: 'decimal',
          key: 'rate',
          label: say(said.rateFor, { prime: open.primeName }),
          hint: said.rateHint,
          required: true,
        },
      ]}
      initial={{ rate: open.rate ?? '' }}
      preview={async (values) => {
        const reply = await api.ask(previewPayItemRateEndpoint, {
          params: { payItemId: open.item.id, primeId: open.primeId },
          body: { rate: text(values, 'rate') },
        });
        return reply.kind === 'answered' ? reply.answer : reply;
      }}
      save={async (values) => {
        const reply = await api.ask(setPayItemRateEndpoint, {
          params: { payItemId: open.item.id, primeId: open.primeId },
          body: { rate: text(values, 'rate') },
        });
        return reply.kind === 'answered' ? done(reply.answer) : reply;
      }}
      onClose={() => {
        setOpen(null);
      }}
    />
  );

  return (
    <main data-screen="pay-items" className="page" id="content">
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      {told}
      {project.kind !== 'answered' && project.kind !== 'loading' ? (
        <Trouble reply={project} />
      ) : null}
      {mayChange ? (
        <div className="page-tools">
          <Button
            main
            onPress={() => {
              setOpen({ kind: 'item', entry: null });
            }}
          >
            {said.add}
          </Button>
        </div>
      ) : null}
      <PagedTable
        caption={said.title}
        served={listPayItemsEndpoint}
        asking={{ params: { projectId }, query: { limit: '100' } }}
        rowsOf={(answer) => answer.payItems}
        nextOf={(answer) => answer.next}
        keyOf={(entry: Entry) => entry.payItem.id}
        reloaded={reloaded}
        columns={[
          { label: said.code, names: true, cell: (entry) => entry.payItem.code },
          { label: said.description, cell: (entry) => entry.payItem.description },
          {
            label: said.payableType,
            cell: (entry) => nameIn(payableTypes, entry.payItem.payableTypeId),
          },
          { label: said.unit, cell: (entry) => said.units[entry.payItem.unit] },
          {
            label: said.band,
            cell: (entry) =>
              entry.payItem.bandFrom === null && entry.payItem.bandTo === null
                ? words.common.none
                : `${String(entry.payItem.bandFrom ?? '')}–${String(entry.payItem.bandTo ?? '')}`,
          },
          ...primes.map((prime) => ({
            label: say(said.rateFor, { prime: prime.name }),
            numeric: true,
            cell: (entry: Entry) => {
              const rate = rateOf(entry.payItem.id, prime.id);
              const shown = rate === null ? said.noRate : money(rate);
              return mayChange ? (
                <Button
                  onPress={() => {
                    setOpen({
                      kind: 'rate',
                      item: entry.payItem,
                      primeId: prime.id,
                      primeName: prime.name,
                      rate,
                    });
                  }}
                >
                  {say(said.rateButton, {
                    rate: shown,
                    code: entry.payItem.code,
                    prime: prime.name,
                  })}
                </Button>
              ) : (
                shown
              );
            },
          })),
          ...(mayChange
            ? [
                {
                  label: words.common.actions,
                  cell: (entry: Entry) => (
                    <div className="row-actions">
                      <Button
                        onPress={() => {
                          setOpen({ kind: 'item', entry });
                        }}
                      >
                        {say(said.edit, { code: entry.payItem.code })}
                      </Button>
                      {entry.payItem.crewTimeConversion === 'PER_DAY_STEPS' ? (
                        <Button
                          onPress={() => {
                            setOpen({ kind: 'steps', entry });
                          }}
                        >
                          {say(words.common.of, { what: said.editSteps, name: entry.payItem.code })}
                        </Button>
                      ) : null}
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
      {open?.kind === 'item' ? itemDialog(open.entry) : null}
      {open?.kind === 'rate' ? rateDialog(open) : null}
      {open?.kind === 'steps' ? (
        <StepsEditor
          entry={open.entry}
          onSaved={(written) => {
            done(written);
            setOpen(null);
          }}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
    </main>
  );
}

// What a preview answers: whether the change would save, its warnings and what it would queue, or
// why not.
type Previewed =
  | {
      readonly wouldSave: true;
      readonly warnings: readonly { readonly code: string; readonly message: string }[];
      readonly queued?: { readonly tickets: number; readonly lockedAsInvoiced: number } | undefined;
    }
  | { readonly wouldSave: false; readonly reason: string; readonly message: string };

// A form dialog whose change can be previewed before it is saved (where `preview` is given).
export function PreviewedDialog({
  title,
  fields,
  initial,
  preview,
  save,
  onClose,
}: {
  readonly title: string;
  readonly fields: readonly FieldSpec[];
  readonly initial: Values;
  readonly preview: ((values: Values) => Promise<Previewed | NotAnswered>) | null;
  readonly save: (values: Values) => Promise<NotAnswered | null>;
  readonly onClose: () => void;
}) {
  const [shown, setShown] = useState<Previewed | NotAnswered | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [latest, setLatest] = useState<Values>(initial);
  return (
    <FormDialog
      title={title}
      fields={fields}
      initial={initial}
      save={save}
      onClose={onClose}
      onValues={setLatest}
    >
      {preview === null ? null : (
        <div className="preview">
          <Button
            busy={previewing}
            onPress={() => {
              setPreviewing(true);
              void preview(latest).then((answer) => {
                setPreviewing(false);
                setShown(answer);
              });
            }}
          >
            {previewing ? words.common.previewing : words.common.preview}
          </Button>
          {shown === null ? null : 'wouldSave' in shown ? (
            shown.wouldSave ? (
              <Banner tone="info" announced>
                <p>{words.setup.wouldSave}</p>
                {shown.queued === undefined ? null : (
                  <p>{counted(words.setup.queued, shown.queued.tickets)}</p>
                )}
                {shown.warnings.map((warning) => (
                  <p key={warning.code}>{warning.message}</p>
                ))}
              </Banner>
            ) : (
              <Banner tone="notice" announced>
                <p>{say(words.setup.wouldNot, { message: shown.message })}</p>
              </Banner>
            )
          ) : (
            <Banner tone="problem" announced>
              <p>{trouble(shown)}</p>
            </Banner>
          )}
        </div>
      )}
    </FormDialog>
  );
}

// A crew day's steps: from so many hours to so many, so many days.
function StepsEditor({
  entry,
  onSaved,
  onClose,
}: {
  readonly entry: Entry;
  readonly onSaved: (written: SetupWritten) => void;
  readonly onClose: () => void;
}) {
  const api = useApi();
  const said = words.payItems;
  interface Step {
    readonly key: string;
    readonly fromHours: string;
    readonly toHours: string;
    readonly quantity: string;
  }
  const [steps, setSteps] = useState<readonly Step[]>(
    entry.crewDaySteps.map((step) => ({
      key: step.id,
      fromHours: step.fromHours,
      toHours: step.toHours,
      quantity: step.quantity,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const changed = (at: number, change: Partial<Step>) => {
    setSteps((before) =>
      before.map((step, index) => (index === at ? { ...step, ...change } : step)),
    );
  };
  return (
    <ModalOverlay
      className="dialog-overlay"
      isOpen
      isDismissable={!busy}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Modal className="dialog-modal">
        <Dialog className="dialog">
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              setFailed(null);
              void api
                .ask(setCrewDayStepsEndpoint, {
                  params: { payItemId: entry.payItem.id },
                  body: {
                    steps: steps.map(({ fromHours, toHours, quantity }) => ({
                      fromHours,
                      toHours,
                      quantity,
                    })),
                  },
                })
                .then((reply) => {
                  setBusy(false);
                  if (reply.kind === 'answered') onSaved(reply.answer);
                  else setFailed(reply);
                });
            }}
          >
            <Heading slot="title" className="dialog-title">
              {say(words.common.of, { what: said.steps, name: entry.payItem.code })}
            </Heading>
            {failed === null ? null : (
              <Banner tone="problem" announced>
                <p>{trouble(failed)}</p>
              </Banner>
            )}
            {steps.map((step, at) => (
              <fieldset key={step.key} className="panel">
                <legend>{`${said.steps} ${String(at + 1)}`}</legend>
                <TextEntry
                  label={said.fromHours}
                  value={step.fromHours}
                  decimal
                  onChange={(fromHours) => {
                    changed(at, { fromHours });
                  }}
                />
                <TextEntry
                  label={said.toHours}
                  value={step.toHours}
                  decimal
                  onChange={(toHours) => {
                    changed(at, { toHours });
                  }}
                />
                <TextEntry
                  label={said.quantity}
                  value={step.quantity}
                  decimal
                  onChange={(quantity) => {
                    changed(at, { quantity });
                  }}
                />
                <div className="form-actions">
                  <Button
                    onPress={() => {
                      setSteps((before) => before.filter((_, index) => index !== at));
                    }}
                  >
                    {`${said.removeStep} (${String(at + 1)})`}
                  </Button>
                </div>
              </fieldset>
            ))}
            <div className="form-actions">
              <Button
                onPress={() => {
                  setSteps((before) => [
                    ...before,
                    { key: crypto.randomUUID(), fromHours: '', toHours: '', quantity: '' },
                  ]);
                }}
              >
                {said.addStep}
              </Button>
            </div>
            <div className="form-actions">
              <Button main type="submit" busy={busy}>
                {busy ? words.common.saving : words.common.save}
              </Button>
              <Button busy={busy} onPress={onClose}>
                {words.common.cancel}
              </Button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
