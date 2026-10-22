// A project's forms (adms-ticket-workflows; ADR-160, 211, 214): one per kind of document. A load's
// or a haul-out's form takes debris types from the firm's library, each named as the contract names
// the work, with whether it is reduced, how, and whether phones show it. A survey, ROE, incident or
// drop-off log may carry the firm's own questions: each change is a new version, the answers kept
// with the version they were given under.
import {
  addDebrisTypeEndpoint,
  addFormDebrisTypeEndpoint,
  addFormDefinitionEndpoint,
  changeFormDebrisTypeEndpoint,
  changeFormEndpoint,
  createFormEndpoint,
  formDocumentTypes,
  formFieldTypes,
  listFormsEndpoint,
  type FormField,
  type FormsAnswer,
} from '@open-adms/contracts';
import { incidentOffers } from '@open-adms/domain';
import { Banner, Button, ScreenTitle, TextEntry } from '@open-adms/look';
import { useState } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';

import type { NotAnswered } from '../api.ts';
import { CheckField, SelectField, TextBlock } from '../look/fields.tsx';
import {
  FormDialog,
  checked,
  optional,
  picked,
  picks,
  text,
  type FieldSpec,
  type Values,
} from '../look/form-dialog.tsx';
import { Table } from '../look/paged-table.tsx';
import { Shown, trouble, useApi, useRead } from '../reading.tsx';
import { holds, useSigned } from '../session.tsx';
import { say, words } from '../words.ts';
import {
  changedLists,
  nameIn,
  useListOptions,
  useTold,
  yesNo,
  type SetupWritten,
} from './common.tsx';

type FormEntry = FormsAnswer['forms'][number];
type DebrisEntry = FormEntry['debrisTypes'][number];
type DocumentType = (typeof formDocumentTypes)[number];

const withDebrisTypes: readonly DocumentType[] = ['LOAD', 'HAUL_OUT'];
const withFields: readonly DocumentType[] = ['ROE', 'SURVEY', 'INCIDENT', 'DROP_OFF_LOG'];

type Open =
  | { readonly kind: 'form'; readonly form: FormEntry['form'] | null }
  | {
      readonly kind: 'debris';
      readonly form: FormEntry['form'];
      readonly entry: DebrisEntry | null;
    }
  | { readonly kind: 'fields'; readonly entry: FormEntry };

export function Forms({ projectId }: { readonly projectId: string }) {
  const api = useApi();
  const { session } = useSigned();
  const mayChange = holds(session, 'SETUP');
  const said = words.forms;
  const [read, reload] = useRead(listFormsEndpoint, { params: { projectId } });
  const debrisTypes = useListOptions('debris-types');
  const methods = useListOptions('reduction-methods');
  const [open, setOpen] = useState<Open | null>(null);
  // The kind of document a new form is for, as it is picked: what the form may state beside its
  // name ("GPS required" on an ROE form, what an incident offers on an incident form, no other).
  const [kindPicked, setKindPicked] = useState<DocumentType>('LOAD');
  const [told, tell] = useTold();

  const done = (answer: SetupWritten): null => {
    tell(answer);
    reload();
    return null;
  };

  const formDialog = (form: FormEntry['form'] | null) => {
    const documentType = form?.documentType ?? kindPicked;
    const fields: FieldSpec[] = [
      ...(form === null
        ? [
            {
              kind: 'pick',
              key: 'documentType',
              label: said.documentType,
              required: true,
              options: formDocumentTypes.map((type) => ({
                id: type,
                label: said.documentTypes[type],
              })),
            } as const,
          ]
        : []),
      { kind: 'text', key: 'name', label: said.name, required: true, longest: 200 },
      ...(documentType === 'ROE'
        ? [{ kind: 'check', key: 'gpsRequired', label: said.gpsRequired } as const]
        : []),
      ...(documentType === 'INCIDENT'
        ? [
            {
              kind: 'picks',
              key: 'incidentOffers',
              label: said.incidentOffers,
              options: incidentOffers.map((offer) => ({ id: offer, label: said.offers[offer] })),
            } as const,
          ]
        : []),
    ];
    // What only an ROE form or an incident form states.
    const stated = (values: Values) => ({
      ...(documentType === 'ROE' ? { gpsRequired: checked(values, 'gpsRequired') } : {}),
      ...(documentType === 'INCIDENT'
        ? {
            incidentOffers: picks(values, 'incidentOffers') as (typeof incidentOffers)[number][],
          }
        : {}),
    });
    return (
      <FormDialog
        title={form === null ? said.add : say(said.edit, { name: form.name })}
        fields={fields}
        initial={
          form === null
            ? { documentType: 'LOAD' }
            : {
                name: form.name,
                gpsRequired: form.gpsRequired === true,
                incidentOffers: form.incidentOffers,
              }
        }
        save={async (values: Values): Promise<NotAnswered | null> => {
          const reply =
            form === null
              ? await api.ask(createFormEndpoint, {
                  params: { projectId },
                  body: { documentType, name: text(values, 'name'), ...stated(values) },
                })
              : await api.ask(changeFormEndpoint, {
                  params: { formId: form.id },
                  body: { name: text(values, 'name'), ...stated(values) },
                });
          return reply.kind === 'answered' ? done(reply.answer) : reply;
        }}
        onValues={(values) => {
          if (form !== null) return;
          setKindPicked(
            formDocumentTypes.find((type) => type === picked(values, 'documentType')) ?? 'LOAD',
          );
        }}
        onClose={() => {
          setOpen(null);
          setKindPicked('LOAD');
        }}
      />
    );
  };

  const debrisDialog = (
    form: FormEntry['form'],
    entry: DebrisEntry | null,
    held: readonly DebrisEntry[],
  ) => {
    const taken = new Set(held.map((one) => one.debrisTypeId));
    const fields: FieldSpec[] = [
      ...(entry === null
        ? [
            {
              kind: 'pick',
              key: 'debrisTypeId',
              label: said.debrisType,
              options: debrisTypes.filter((option) => !taken.has(option.id)),
            } as const,
            {
              kind: 'text',
              key: 'newName',
              label: said.newDebrisType,
              hint: said.newDebrisTypeHint,
              longest: 200,
            } as const,
          ]
        : []),
      { kind: 'check', key: 'reduced', label: said.reduced },
      { kind: 'pick', key: 'reductionMethodId', label: said.reductionMethod, options: methods },
      { kind: 'check', key: 'hiddenOnPhones', label: said.hiddenOnPhones, hint: said.hiddenHint },
    ];
    return (
      <FormDialog
        title={
          entry === null
            ? said.addDebrisType
            : say(said.editDebrisType, { name: nameIn(debrisTypes, entry.debrisTypeId) })
        }
        fields={fields}
        initial={
          entry === null
            ? {}
            : {
                reduced: entry.reduced,
                reductionMethodId: entry.reductionMethodId,
                hiddenOnPhones: entry.hiddenOnPhones,
              }
        }
        save={async (values: Values): Promise<NotAnswered | null> => {
          const method = picked(values, 'reductionMethodId');
          if (entry !== null) {
            const reply = await api.ask(changeFormDebrisTypeEndpoint, {
              params: { formDebrisTypeId: entry.id },
              body: {
                reduced: checked(values, 'reduced'),
                reductionMethodId: method,
                hiddenOnPhones: checked(values, 'hiddenOnPhones'),
              },
            });
            return reply.kind === 'answered' ? done(reply.answer) : reply;
          }
          let debrisTypeId = picked(values, 'debrisTypeId');
          const newName = optional(values, 'newName');
          if (newName !== undefined) {
            const made = await api.ask(addDebrisTypeEndpoint, { body: { name: newName } });
            if (made.kind !== 'answered') return made;
            debrisTypeId = made.answer.record.id;
            changedLists();
          }
          const reply = await api.ask(addFormDebrisTypeEndpoint, {
            params: { formId: form.id },
            body: {
              debrisTypeId: debrisTypeId ?? '',
              reduced: checked(values, 'reduced'),
              ...(method === null ? {} : { reductionMethodId: method }),
              hiddenOnPhones: checked(values, 'hiddenOnPhones'),
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

  return (
    <main data-screen="forms" className="page" id="content">
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      {told}
      {mayChange ? (
        <div className="page-tools">
          <Button
            main
            onPress={() => {
              setOpen({ kind: 'form', form: null });
            }}
          >
            {said.add}
          </Button>
        </div>
      ) : null}
      <Shown read={read}>
        {(answer) => (
          <>
            <Table
              caption={said.title}
              rows={answer.forms}
              keyOf={(entry) => entry.form.id}
              columns={[
                { label: said.name, names: true, cell: (entry) => entry.form.name },
                {
                  label: said.documentType,
                  cell: (entry) => said.documentTypes[entry.form.documentType],
                },
                {
                  label: said.gpsRequired,
                  cell: (entry) => yesNo(entry.form.gpsRequired === true),
                },
                ...(mayChange
                  ? [
                      {
                        label: words.common.actions,
                        cell: (entry: FormEntry) => (
                          <Button
                            onPress={() => {
                              setOpen({ kind: 'form', form: entry.form });
                            }}
                          >
                            {say(said.edit, { name: entry.form.name })}
                          </Button>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            {answer.forms
              .filter((entry) => withDebrisTypes.includes(entry.form.documentType))
              .map((entry) => (
                <section
                  key={entry.form.id}
                  className="panel"
                  aria-labelledby={`debris-${entry.form.id}`}
                >
                  <h2 id={`debris-${entry.form.id}`}>
                    {say(said.debrisTypes, { name: entry.form.name })}
                  </h2>
                  <Table
                    caption={say(said.debrisTypes, { name: entry.form.name })}
                    rows={entry.debrisTypes}
                    keyOf={(row) => row.id}
                    columns={[
                      {
                        label: said.debrisType,
                        names: true,
                        cell: (row) => nameIn(debrisTypes, row.debrisTypeId),
                      },
                      { label: said.reduced, cell: (row) => yesNo(row.reduced) },
                      {
                        label: said.reductionMethod,
                        cell: (row) => nameIn(methods, row.reductionMethodId),
                      },
                      { label: said.hiddenOnPhones, cell: (row) => yesNo(row.hiddenOnPhones) },
                      ...(mayChange
                        ? [
                            {
                              label: words.common.actions,
                              cell: (row: DebrisEntry) => (
                                <Button
                                  onPress={() => {
                                    setOpen({ kind: 'debris', form: entry.form, entry: row });
                                  }}
                                >
                                  {say(said.editDebrisType, {
                                    name: nameIn(debrisTypes, row.debrisTypeId),
                                  })}
                                </Button>
                              ),
                            },
                          ]
                        : []),
                    ]}
                  />
                  {mayChange ? (
                    <div className="form-actions">
                      <Button
                        onPress={() => {
                          setOpen({ kind: 'debris', form: entry.form, entry: null });
                        }}
                      >
                        {say(words.common.of, { what: said.addDebrisType, name: entry.form.name })}
                      </Button>
                    </div>
                  ) : null}
                </section>
              ))}
            {answer.forms
              .filter((entry) => withFields.includes(entry.form.documentType))
              .map((entry) => (
                <section
                  key={entry.form.id}
                  className="panel"
                  aria-labelledby={`fields-${entry.form.id}`}
                >
                  <h2 id={`fields-${entry.form.id}`}>
                    {say(said.fields, { name: entry.form.name })}
                  </h2>
                  {entry.definition === null || entry.definition.fields.length === 0 ? (
                    <p>{said.noFields}</p>
                  ) : (
                    <Table
                      caption={`${say(said.fields, { name: entry.form.name })}, ${say(said.fieldsVersion, { version: entry.definition.version })}`}
                      rows={entry.definition.fields}
                      keyOf={(field) => field.id}
                      columns={[
                        { label: said.fieldLabel, names: true, cell: (field) => field.label },
                        { label: said.fieldType, cell: (field) => said.fieldTypes[field.type] },
                        { label: said.fieldRequired, cell: (field) => yesNo(field.required) },
                        {
                          label: said.fieldChoices,
                          cell: (field) => (field.choices ?? []).join(', '),
                        },
                      ]}
                    />
                  )}
                  {mayChange ? (
                    <div className="form-actions">
                      <Button
                        onPress={() => {
                          setOpen({ kind: 'fields', entry });
                        }}
                      >
                        {say(words.common.of, { what: said.editFields, name: entry.form.name })}
                      </Button>
                    </div>
                  ) : null}
                </section>
              ))}
            {open?.kind === 'form' ? formDialog(open.form) : null}
            {open?.kind === 'debris'
              ? debrisDialog(
                  open.form,
                  open.entry,
                  answer.forms.find((entry) => entry.form.id === open.form.id)?.debrisTypes ?? [],
                )
              : null}
            {open?.kind === 'fields' ? (
              <FieldsEditor
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
          </>
        )}
      </Shown>
    </main>
  );
}

// The firm's own questions on a form, changed as a whole and saved as its next version.
function FieldsEditor({
  entry,
  onSaved,
  onClose,
}: {
  readonly entry: FormEntry;
  readonly onSaved: (written: SetupWritten) => void;
  readonly onClose: () => void;
}) {
  const api = useApi();
  const said = words.forms;
  interface Row {
    readonly id: string;
    readonly label: string;
    readonly type: FormField['type'];
    readonly required: boolean;
    readonly choices: string;
  }
  const [rows, setRows] = useState<readonly Row[]>(
    (entry.definition?.fields ?? []).map((field) => ({
      id: field.id,
      label: field.label,
      type: field.type,
      required: field.required,
      choices: (field.choices ?? []).join('\n'),
    })),
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const changed = (at: number, change: Partial<Row>) => {
    setRows((before) => before.map((row, index) => (index === at ? { ...row, ...change } : row)));
  };
  const save = async () => {
    setBusy(true);
    setFailed(null);
    const fields = rows.map((row) => ({
      id: row.id,
      label: row.label.trim(),
      type: row.type,
      required: row.required,
      ...(row.type === 'PICK'
        ? {
            choices: row.choices
              .split('\n')
              .map((choice) => choice.trim())
              .filter(Boolean),
          }
        : {}),
    }));
    const reply = await api.ask(addFormDefinitionEndpoint, {
      params: { formId: entry.form.id },
      body: { fields },
    });
    setBusy(false);
    if (reply.kind === 'answered') onSaved(reply.answer);
    else setFailed(reply);
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
              void save();
            }}
          >
            <Heading slot="title" className="dialog-title">
              {say(said.fields, { name: entry.form.name })}
            </Heading>
            {failed === null ? null : (
              <Banner tone="problem" announced>
                <p>{trouble(failed)}</p>
              </Banner>
            )}
            {rows.map((row, at) => (
              <fieldset key={row.id} className="panel">
                <legend>{`${said.fieldLabel} ${String(at + 1)}`}</legend>
                <TextEntry
                  label={said.fieldLabel}
                  value={row.label}
                  onChange={(label) => {
                    changed(at, { label });
                  }}
                  required
                  longest={200}
                />
                <SelectField
                  label={said.fieldType}
                  options={formFieldTypes.map((type) => ({
                    id: type,
                    label: said.fieldTypes[type],
                  }))}
                  value={row.type}
                  onChange={(type) => {
                    if (type !== null) changed(at, { type: type as FormField['type'] });
                  }}
                />
                <CheckField
                  label={said.fieldRequired}
                  value={row.required}
                  onChange={(required) => {
                    changed(at, { required });
                  }}
                />
                {row.type === 'PICK' ? (
                  <TextBlock
                    label={said.fieldChoices}
                    value={row.choices}
                    onChange={(choices) => {
                      changed(at, { choices });
                    }}
                  />
                ) : null}
                <div className="form-actions">
                  <Button
                    onPress={() => {
                      setRows((before) => before.filter((_, index) => index !== at));
                    }}
                  >
                    {`${said.removeField} (${String(at + 1)})`}
                  </Button>
                </div>
              </fieldset>
            ))}
            <div className="form-actions">
              <Button
                onPress={() => {
                  setRows((before) => [
                    ...before,
                    {
                      id: crypto.randomUUID(),
                      label: '',
                      type: 'TEXT',
                      required: false,
                      choices: '',
                    },
                  ]);
                }}
              >
                {said.addField}
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
