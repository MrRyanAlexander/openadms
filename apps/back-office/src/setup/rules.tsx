// The firm's pricing rules (spec/RULES.md; adms-ledger-audit; ADR-109, 118, 239): each names one
// contract and runs only on its prime's tickets (blank on a rule that only removes or voids). Its
// "ifs" are criteria the domain offers on its form, each with the tests its kind of value takes
// (`RuleCriteria`); its actions add a numbered transaction of a pay item, remove one, or void the
// ticket. All passing rules run in number order. The API says whether a rule is valid and why not;
// a change is previewed first, saying how many tickets it would draw again.
import {
  changeRuleEndpoint,
  createRuleEndpoint,
  listFormsEndpoint,
  listListValuesEndpoint,
  listMapVersionsEndpoint,
  listPayItemsEndpoint,
  listRulesEndpoint,
  listSitesEndpoint,
  previewNewRuleEndpoint,
  previewRuleChangeEndpoint,
  quantityFroms,
  readProjectEndpoint,
  type RulesAnswer,
} from '@open-adms/contracts';
import { RuleCriteria, type RuleCriterionKey, type RuleOperator } from '@open-adms/domain';
import { Banner, Button, ScreenTitle, TextEntry } from '@open-adms/look';
import { useEffect, useState } from 'react';
import { Link } from 'react-aria-components';

import type { NotAnswered } from '../api.ts';
import { CheckField, ChecksField, DateEntry, SelectField, type Option } from '../look/fields.tsx';
import { PagedTable } from '../look/paged-table.tsx';
import { navigate } from '../router.tsx';
import { Shown, Trouble, trouble, useApi, useRead } from '../reading.tsx';
import { holds, useSigned } from '../session.tsx';
import { counted, say, words } from '../words.ts';
import { nameIn, useListOptions, yesNo } from './common.tsx';

type Rule = RulesAnswer['rules'][number];
type RuleForm = 'LOAD' | 'HAUL_OUT' | 'UNIT_RATE';
type ActionKind = 'ADD_TRANSACTION' | 'REMOVE_TRANSACTION' | 'VOID_TICKET';
type QuantityFrom = (typeof quantityFroms)[number];

export function Rules({ projectId }: { readonly projectId: string }) {
  const said = words.rules;
  const { session } = useSigned();
  const [forms] = useRead(listFormsEndpoint, { params: { projectId } });
  const [project] = useRead(readProjectEndpoint, { params: { projectId } });
  const formName = (id: string) =>
    forms.kind === 'answered'
      ? (forms.answer.forms.find((entry) => entry.form.id === id)?.form.name ?? '…')
      : '…';
  const contractName = (id: string | null) =>
    id === null
      ? words.common.none
      : project.kind === 'answered'
        ? (project.answer.contracts.find((contract) => contract.id === id)?.name ?? '…')
        : '…';
  return (
    <main data-screen="rules" className="page" id="content">
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      {holds(session, 'SETUP') ? (
        <div className="page-tools">
          <Button
            main
            onPress={() => {
              navigate(`/projects/${projectId}/setup/rules/new`);
            }}
          >
            {said.add}
          </Button>
        </div>
      ) : null}
      <PagedTable
        caption={said.title}
        served={listRulesEndpoint}
        asking={{ params: { projectId }, query: { archived: 'false', limit: '100' } }}
        rowsOf={(answer) => answer.rules}
        nextOf={(answer) => answer.next}
        keyOf={(rule: Rule) => rule.id}
        columns={[
          {
            label: said.name,
            names: true,
            cell: (rule) => (
              <Link className="link" href={`/projects/${projectId}/setup/rules/${rule.id}`}>
                {rule.name}
              </Link>
            ),
          },
          { label: said.form, cell: (rule) => formName(rule.formId) },
          { label: said.contract, cell: (rule) => contractName(rule.contractId) },
          { label: said.active, cell: (rule) => yesNo(rule.active) },
          { label: said.valid, cell: (rule) => yesNo(rule.valid) },
          { label: said.reasons, cell: (rule) => rule.reasons.join(' ') },
        ]}
      />
    </main>
  );
}

// One "if" as the builder holds it.
interface Criterion {
  readonly key: string;
  readonly criterion: RuleCriterionKey;
  readonly operator: RuleOperator;
  readonly picks: readonly string[];
  readonly numberFrom: string;
  readonly numberTo: string;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly text: string;
}

interface Action {
  readonly key: string;
  readonly kind: ActionKind;
  readonly slot: string;
  readonly payItemId: string | null;
  readonly quantityFrom: QuantityFrom | null;
  readonly itemNameIds: readonly string[];
}

const blankCriterion = (criterion: RuleCriterionKey): Criterion => ({
  key: crypto.randomUUID(),
  criterion,
  operator: RuleCriteria.operatorsOf(criterion)[0] ?? 'EQUALS',
  picks: [],
  numberFrom: '',
  numberTo: '',
  dateFrom: '',
  dateTo: '',
  text: '',
});

export function RuleBuilder({
  projectId,
  ruleId,
}: {
  readonly projectId: string;
  readonly ruleId: string | null;
}) {
  const [rules, reload] = useRead(listRulesEndpoint, {
    params: { projectId },
    query: { archived: 'false', limit: '200' },
  });
  // What the last save came to, said above the rule whatever its address becomes.
  const [told, setTold] = useState<Told | null>(null);
  useEffect(() => {
    reload();
  }, [ruleId, reload]);
  return (
    <main data-screen="rule-builder" className="page" id="content">
      {told === null ? null : (
        <Banner tone={told.tone} announced>
          {told.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </Banner>
      )}
      {ruleId === null ? (
        <BuilderBody projectId={projectId} rule={null} onSaved={setTold} />
      ) : (
        <Shown read={rules}>
          {(answer) => {
            const rule = answer.rules.find((one) => one.id === ruleId);
            return rule === undefined ? (
              <Trouble reply={{ kind: 'refused', code: 'NOT_FOUND' }} />
            ) : (
              <BuilderBody key={rule.id} projectId={projectId} rule={rule} onSaved={setTold} />
            );
          }}
        </Shown>
      )}
    </main>
  );
}

// What a save or a preview came to, in the API's words.
interface Told {
  readonly tone: 'info' | 'notice' | 'good';
  readonly lines: readonly string[];
}

function BuilderBody({
  projectId,
  rule,
  onSaved,
}: {
  readonly projectId: string;
  readonly rule: Rule | null;
  readonly onSaved: (told: Told) => void;
}) {
  const api = useApi();
  const said = words.rules;
  const { session } = useSigned();
  const mayChange = holds(session, 'SETUP');
  const [forms] = useRead(listFormsEndpoint, { params: { projectId } });
  const [project] = useRead(readProjectEndpoint, { params: { projectId } });
  const [sites] = useRead(listSitesEndpoint, { params: { projectId }, query: { limit: '200' } });
  const [payItems] = useRead(listPayItemsEndpoint, {
    params: { projectId },
    query: { limit: '200' },
  });
  const [maps] = useRead(listMapVersionsEndpoint, { params: { projectId }, query: { limit: '1' } });
  const [tags] = useRead(listListValuesEndpoint, {
    params: { list: 'field-tags' },
    query: { archived: 'false', limit: '200' },
  });
  const debrisTypes = useListOptions('debris-types');
  const siteTypes = useListOptions('site-types');
  const itemNames = useListOptions('item-names');

  const [name, setName] = useState(rule?.name ?? '');
  const [formId, setFormId] = useState<string | null>(rule?.formId ?? null);
  const [contractId, setContractId] = useState<string | null>(rule?.contractId ?? null);
  const [active, setActive] = useState(rule?.active ?? true);
  const [criteria, setCriteria] = useState<readonly Criterion[]>(
    (rule?.criteria ?? []).map((line) => ({
      key: crypto.randomUUID(),
      criterion: line.criterion as RuleCriterionKey,
      operator: line.operator as RuleOperator,
      picks: line.picks.map((pick) => pick.value),
      numberFrom: line.numberFrom === null ? '' : String(line.numberFrom),
      numberTo: line.numberTo === null ? '' : String(line.numberTo),
      dateFrom: line.dateFrom ?? '',
      dateTo: line.dateTo ?? '',
      text: line.text ?? '',
    })),
  );
  const [actions, setActions] = useState<readonly Action[]>(
    (rule?.actions ?? []).map((action) => ({
      key: crypto.randomUUID(),
      kind: action.kind as ActionKind,
      slot: action.slot === null ? '' : String(action.slot),
      payItemId: action.payItemId,
      quantityFrom: action.quantityFrom,
      itemNameIds: action.itemNameIds,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const [outcome, setOutcome] = useState<Told | null>(null);

  const formEntries = forms.kind === 'answered' ? forms.answer.forms : [];
  const pricedForms = formEntries.filter((entry) =>
    (['LOAD', 'HAUL_OUT', 'UNIT_RATE'] as const).includes(entry.form.documentType as RuleForm),
  );
  const form = formEntries.find((entry) => entry.form.id === formId);
  const formKind = (form?.form.documentType ?? null) as RuleForm | null;
  const offered = formKind === null ? [] : new RuleCriteria(formKind).offered();

  // The values a criterion picks from, by its key: what its picks name.
  const picksOf = (criterion: RuleCriterionKey): readonly Option[] => {
    switch (criterion) {
      case 'CONTRACTOR':
        return project.kind === 'answered'
          ? project.answer.contractors.map((place) => ({
              id: place.contractorId,
              label: place.name,
            }))
          : [];
      case 'DEBRIS_TYPE':
        return (form?.debrisTypes ?? []).map((entry) => ({
          id: entry.id,
          label: nameIn(debrisTypes, entry.debrisTypeId),
        }));
      case 'FIELD_TAG':
        return tags.kind === 'answered'
          ? tags.answer.values
              .filter((value) => value.projectId === projectId)
              .map((value) => ({ id: value.id, label: value.name }))
          : [];
      case 'DISPOSAL_SITE':
      case 'FROM_SITE':
        return sites.kind === 'answered'
          ? sites.answer.sites.map((entry) => ({ id: entry.site.id, label: entry.site.name }))
          : [];
      case 'DISPOSAL_SITE_TYPE':
        return siteTypes;
      case 'PAY_ITEM':
        return payItems.kind === 'answered'
          ? payItems.answer.payItems.map((entry) => ({
              id: entry.payItem.id,
              label: `${entry.payItem.code}, ${entry.payItem.description}`,
            }))
          : [];
      case 'ITEM':
        return itemNames;
      case 'ZONE': {
        const [map] = maps.kind === 'answered' ? maps.answer.mapVersions : [];
        return (map?.zones ?? []).map((zone) => ({ id: zone.name, label: zone.name }));
      }
      default:
        return [];
    }
  };

  const changedCriterion = (at: number, change: Partial<Criterion>) => {
    setCriteria((before) =>
      before.map((line, index) => (index === at ? { ...line, ...change } : line)),
    );
  };
  const changedAction = (at: number, change: Partial<Action>) => {
    setActions((before) =>
      before.map((line, index) => (index === at ? { ...line, ...change } : line)),
    );
  };

  const body = () => ({
    formId: formId ?? '',
    name: name.trim(),
    contractId,
    active,
    criteria: criteria.map((line) => {
      const kind = RuleCriteria.kindOf(line.criterion);
      const empty = line.operator === 'IS_EMPTY' || line.operator === 'IS_NOT_EMPTY';
      const between = line.operator === 'BETWEEN';
      return {
        criterion: line.criterion,
        operator: line.operator,
        ...((kind === 'PICK' && !empty) || kind === 'ITEM_COUNT' ? { picks: [...line.picks] } : {}),
        ...((kind === 'NUMBER' || kind === 'ITEM_COUNT') && !empty
          ? {
              numberFrom: Number(line.numberFrom),
              ...(between ? { numberTo: Number(line.numberTo) } : {}),
            }
          : {}),
        ...(kind === 'DATE' && !empty
          ? { dateFrom: line.dateFrom, ...(between ? { dateTo: line.dateTo } : {}) }
          : {}),
        ...(kind === 'TEXT' && !empty ? { text: line.text } : {}),
      };
    }),
    actions: actions.map((line) => ({
      kind: line.kind,
      ...(line.kind === 'VOID_TICKET' ? {} : { slot: Number(line.slot) }),
      ...(line.kind === 'ADD_TRANSACTION' && line.payItemId !== null
        ? { payItemId: line.payItemId }
        : {}),
      ...(line.kind === 'ADD_TRANSACTION' && line.quantityFrom !== null
        ? { quantityFrom: line.quantityFrom, itemNameIds: [...line.itemNameIds] }
        : {}),
    })),
  });

  const preview = async () => {
    setFailed(null);
    setBusy(true);
    const reply =
      rule === null
        ? await api.ask(previewNewRuleEndpoint, { params: { projectId }, body: body() })
        : await api.ask(previewRuleChangeEndpoint, { params: { ruleId: rule.id }, body: body() });
    setBusy(false);
    if (reply.kind !== 'answered') {
      setFailed(reply);
      return;
    }
    const answer = reply.answer;
    if (!answer.wouldSave) {
      setOutcome({
        tone: 'notice',
        lines: [say(words.setup.wouldNot, { message: answer.message })],
      });
      return;
    }
    setOutcome({
      tone: 'info',
      lines: [
        words.setup.wouldSave,
        ...(answer.queued === undefined
          ? []
          : [counted(words.setup.queued, answer.queued.tickets)]),
        ...(answer.record.valid ? [] : answer.record.reasons),
        ...answer.warnings.map((warning) => warning.message),
      ],
    });
  };

  const save = async () => {
    setFailed(null);
    setBusy(true);
    const reply =
      rule === null
        ? await api.ask(createRuleEndpoint, { params: { projectId }, body: body() })
        : await api.ask(changeRuleEndpoint, { params: { ruleId: rule.id }, body: body() });
    setBusy(false);
    if (reply.kind !== 'answered') {
      setFailed(reply);
      return;
    }
    setOutcome(null);
    onSaved({
      tone: reply.answer.record.valid ? 'good' : 'notice',
      lines: [
        words.common.saved,
        ...(reply.answer.queued === undefined
          ? []
          : [counted(words.setup.queued, reply.answer.queued.tickets)]),
        ...reply.answer.record.reasons,
      ],
    });
    if (rule === null)
      navigate(`/projects/${projectId}/setup/rules/${reply.answer.record.id}`, { replace: true });
  };

  const contracts =
    project.kind === 'answered' ? project.answer.contracts.filter((one) => !one.archived) : [];
  const payItemOptions = picksOf('PAY_ITEM');
  return (
    <>
      <ScreenTitle>
        {rule === null ? said.newTitle : say(said.editTitle, { name: rule.name })}
      </ScreenTitle>
      <p>
        <Link className="link" href={`/projects/${projectId}/setup/rules`}>
          {said.back}
        </Link>
      </p>
      {rule === null || rule.valid ? null : (
        <Banner tone="notice">
          {rule.reasons.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
        </Banner>
      )}
      <form
        className="form form-wide"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <TextEntry label={said.name} value={name} onChange={setName} required longest={200} />
        <SelectField
          label={said.form}
          options={pricedForms.map((entry) => ({ id: entry.form.id, label: entry.form.name }))}
          value={formId}
          onChange={(next) => {
            setFormId(next);
            setCriteria([]);
          }}
          required
        />
        <SelectField
          label={said.contract}
          options={[
            { id: '', label: said.noContract },
            ...contracts.map((one) => ({ id: one.id, label: one.name })),
          ]}
          value={contractId ?? ''}
          onChange={(next) => {
            setContractId(next === null || next === '' ? null : next);
          }}
        />
        <CheckField label={said.active} value={active} onChange={setActive} />

        <fieldset className="panel">
          <legend>{said.ifs}</legend>
          {criteria.map((line, at) => {
            const kind = RuleCriteria.kindOf(line.criterion);
            const empty = line.operator === 'IS_EMPTY' || line.operator === 'IS_NOT_EMPTY';
            const several = line.operator === 'IS_ONE_OF' || line.operator === 'IS_NOT_ONE_OF';
            const between = line.operator === 'BETWEEN';
            const options = picksOf(line.criterion);
            const number = `${said.ifs} ${String(at + 1)}`;
            return (
              <fieldset key={line.key} className="rule-line">
                <legend>{number}</legend>
                <SelectField
                  label={said.criterion}
                  options={offered.map((key) => ({ id: key, label: said.criteria[key] }))}
                  value={line.criterion}
                  onChange={(next) => {
                    if (next !== null) {
                      setCriteria((before) =>
                        before.map((one, index) =>
                          index === at
                            ? { ...blankCriterion(next as RuleCriterionKey), key: one.key }
                            : one,
                        ),
                      );
                    }
                  }}
                />
                <SelectField
                  label={said.operator}
                  options={RuleCriteria.operatorsOf(line.criterion).map((operator) => ({
                    id: operator,
                    label: said.operators[operator],
                  }))}
                  value={line.operator}
                  onChange={(next) => {
                    if (next !== null) changedCriterion(at, { operator: next as RuleOperator });
                  }}
                />
                {empty && kind !== 'ITEM_COUNT' ? null : kind === 'PICK' ? (
                  several ? (
                    <ChecksField
                      label={said.values}
                      options={options}
                      value={line.picks}
                      onChange={(picks) => {
                        changedCriterion(at, { picks });
                      }}
                    />
                  ) : (
                    <SelectField
                      label={said.value}
                      options={options}
                      value={line.picks[0] ?? null}
                      onChange={(next) => {
                        changedCriterion(at, { picks: next === null ? [] : [next] });
                      }}
                    />
                  )
                ) : kind === 'DATE' ? (
                  <>
                    <DateEntry
                      label={said.dateFrom}
                      value={line.dateFrom}
                      onChange={(dateFrom) => {
                        changedCriterion(at, { dateFrom });
                      }}
                    />
                    {between ? (
                      <DateEntry
                        label={said.dateTo}
                        value={line.dateTo}
                        onChange={(dateTo) => {
                          changedCriterion(at, { dateTo });
                        }}
                      />
                    ) : null}
                  </>
                ) : kind === 'TEXT' ? (
                  <TextEntry
                    label={said.text}
                    value={line.text}
                    onChange={(text) => {
                      changedCriterion(at, { text });
                    }}
                    longest={500}
                  />
                ) : (
                  <>
                    {kind === 'ITEM_COUNT' ? (
                      <SelectField
                        label={said.items}
                        options={options}
                        value={line.picks[0] ?? null}
                        onChange={(next) => {
                          changedCriterion(at, { picks: next === null ? [] : [next] });
                        }}
                      />
                    ) : null}
                    {empty ? null : (
                      <>
                        <TextEntry
                          label={said.numberFrom}
                          value={line.numberFrom}
                          decimal
                          onChange={(numberFrom) => {
                            changedCriterion(at, { numberFrom });
                          }}
                        />
                        {between ? (
                          <TextEntry
                            label={said.numberTo}
                            value={line.numberTo}
                            decimal
                            onChange={(numberTo) => {
                              changedCriterion(at, { numberTo });
                            }}
                          />
                        ) : null}
                      </>
                    )}
                  </>
                )}
                <div className="form-actions">
                  <Button
                    onPress={() => {
                      setCriteria((before) => before.filter((_, index) => index !== at));
                    }}
                  >
                    {`${said.removeIf} (${String(at + 1)})`}
                  </Button>
                </div>
              </fieldset>
            );
          })}
          <div className="form-actions">
            <Button
              isDisabled={offered.length === 0}
              onPress={() => {
                const [first] = offered;
                if (first !== undefined)
                  setCriteria((before) => [...before, blankCriterion(first)]);
              }}
            >
              {said.addIf}
            </Button>
          </div>
        </fieldset>

        <fieldset className="panel">
          <legend>{said.then}</legend>
          {actions.map((line, at) => (
            <fieldset key={line.key} className="rule-line">
              <legend>{`${said.then} ${String(at + 1)}`}</legend>
              <SelectField
                label={said.kind}
                options={(['ADD_TRANSACTION', 'REMOVE_TRANSACTION', 'VOID_TICKET'] as const).map(
                  (kind) => ({
                    id: kind,
                    label: said.actions[kind],
                  }),
                )}
                value={line.kind}
                onChange={(next) => {
                  if (next !== null) changedAction(at, { kind: next as ActionKind });
                }}
              />
              {line.kind === 'VOID_TICKET' ? null : (
                <TextEntry
                  label={said.slot}
                  value={line.slot}
                  whole
                  onChange={(slot) => {
                    changedAction(at, { slot });
                  }}
                />
              )}
              {line.kind === 'ADD_TRANSACTION' ? (
                <>
                  <SelectField
                    label={said.payItem}
                    options={payItemOptions}
                    value={line.payItemId}
                    onChange={(payItemId) => {
                      changedAction(at, { payItemId });
                    }}
                  />
                  {formKind === 'UNIT_RATE' ? (
                    <>
                      <SelectField
                        label={said.quantityFrom}
                        options={[
                          { id: '', label: words.common.none },
                          ...quantityFroms.map((from) => ({
                            id: from,
                            label: said.quantityFroms[from],
                          })),
                        ]}
                        value={line.quantityFrom ?? ''}
                        onChange={(next) => {
                          changedAction(at, {
                            quantityFrom:
                              next === null || next === '' ? null : (next as QuantityFrom),
                          });
                        }}
                      />
                      {line.quantityFrom === 'CHOSEN_ITEMS' ? (
                        <ChecksField
                          label={said.items}
                          options={itemNames}
                          value={line.itemNameIds}
                          onChange={(itemNameIds) => {
                            changedAction(at, { itemNameIds });
                          }}
                        />
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : null}
              <div className="form-actions">
                <Button
                  onPress={() => {
                    setActions((before) => before.filter((_, index) => index !== at));
                  }}
                >
                  {`${said.removeAction} (${String(at + 1)})`}
                </Button>
              </div>
            </fieldset>
          ))}
          <div className="form-actions">
            <Button
              onPress={() => {
                setActions((before) => [
                  ...before,
                  {
                    key: crypto.randomUUID(),
                    kind: 'ADD_TRANSACTION',
                    slot: String(before.length + 1),
                    payItemId: null,
                    quantityFrom: null,
                    itemNameIds: [],
                  },
                ]);
              }}
            >
              {said.addAction}
            </Button>
          </div>
        </fieldset>

        {failed === null ? null : (
          <Banner tone="problem" announced>
            <p>{trouble(failed)}</p>
          </Banner>
        )}
        {outcome === null ? null : (
          <Banner tone={outcome.tone} announced>
            {outcome.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </Banner>
        )}
        {mayChange ? (
          <div className="form-actions">
            <Button busy={busy} onPress={() => void preview()}>
              {busy ? words.common.previewing : words.common.preview}
            </Button>
            <Button main type="submit" busy={busy}>
              {busy ? words.common.saving : said.save}
            </Button>
          </div>
        ) : null}
      </form>
    </>
  );
}
