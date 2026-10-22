// The firm's lists (spec/LISTS.md): every pick-list the firm extends, one at a time. A value is
// added, renamed, archived and put back by a person who may set up; a built-in value can be renamed
// but not archived; nothing is deleted. Where a value drives behaviour, the behaviour is a setting
// on it, asked as it is added: a program type's "requires an ROE", a kind of work's count shape and
// photographs by stage, a vehicle type's crew or container, an incident sub-type's type, a reason's
// uses, an item name's kind of work. Debris types and payable types go into the library by their
// own requests. Field tags are a project's, added on its setup page.
import {
  addDebrisTypeEndpoint,
  addListValueEndpoint,
  addPayableTypeEndpoint,
  archiveListValueEndpoint,
  changeListValueSettingsEndpoint,
  firmLists,
  listListValuesEndpoint,
  reasonUses,
  renameListValueEndpoint,
  unarchiveListValueEndpoint,
  type FirmList,
} from '@open-adms/contracts';
import { Banner, Button, ScreenTitle } from '@open-adms/look';
import { useState } from 'react';

import type { NotAnswered } from '../api.ts';
import { ChoiceField, SelectField } from '../look/fields.tsx';
import {
  FormDialog,
  checked,
  picked,
  picks,
  text,
  type FieldSpec,
  type Values,
} from '../look/form-dialog.tsx';
import { PagedTable } from '../look/paged-table.tsx';
import { Trouble, useApi } from '../reading.tsx';
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

type Shown = 'false' | 'true';

interface ListRow {
  readonly id: string;
  readonly key: string | null;
  readonly name: string;
  readonly archived: boolean;
  readonly requiresRoe: boolean | null;
  readonly countShape: string | null;
  readonly photosByStage: boolean | null;
  readonly kindOfWorkId: string | null;
  readonly certifies: 'CONTAINER' | 'CREW' | null;
  readonly incidentTypeId: string | null;
  readonly uses: readonly string[] | null;
}

export function FirmLists() {
  const api = useApi();
  const { session } = useSigned();
  const mayChange = holds(session, 'SETUP');
  const said = words.lists;
  const [list, setList] = useState<FirmList>('program-types');
  const [shown, setShown] = useState<Shown>('false');
  const [open, setOpen] = useState<{ readonly row: ListRow | null } | null>(null);
  const [reloaded, setReloaded] = useState(0);
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const [told, tell] = useTold();
  const kinds = useListOptions('kinds-of-work');
  const incidentTypes = useListOptions('incident-types');

  const done = (written: SetupWritten) => {
    tell(written);
    setReloaded((count) => count + 1);
    changedLists();
  };

  const fieldsOf = (adding: boolean): FieldSpec[] => {
    const name: FieldSpec = {
      kind: 'text',
      key: 'name',
      label: said.value,
      required: true,
      longest: 200,
    };
    if (!adding) return [name];
    switch (list) {
      case 'program-types':
        return [
          name,
          {
            kind: 'check',
            key: 'requiresRoe',
            label: said.requiresRoe,
            hint: said.requiresRoeHint,
          },
        ];
      case 'kinds-of-work':
        return [
          name,
          {
            kind: 'pick',
            key: 'countShape',
            label: said.countShape,
            required: true,
            options: (['NUMBER', 'ITEM_COUNTS', 'ITEM_HOURS'] as const).map((shape) => ({
              id: shape,
              label: said.countShapes[shape],
            })),
          },
          {
            kind: 'check',
            key: 'photosByStage',
            label: said.photosByStage,
            hint: said.photosByStageHint,
          },
        ];
      case 'vehicle-types':
        return [
          name,
          {
            kind: 'pick',
            key: 'certifies',
            label: said.certifies,
            required: true,
            options: (['CONTAINER', 'CREW'] as const).map((kind) => ({
              id: kind,
              label: said.certifiesKinds[kind],
            })),
          },
        ];
      case 'incident-sub-types':
        return [
          name,
          {
            kind: 'pick',
            key: 'incidentTypeId',
            label: said.incidentType,
            required: true,
            options: incidentTypes,
          },
        ];
      case 'item-names':
        return [
          name,
          {
            kind: 'pick',
            key: 'kindOfWorkId',
            label: said.kindOfWork,
            required: true,
            options: kinds,
          },
        ];
      case 'reasons':
        return [
          name,
          {
            kind: 'picks',
            key: 'uses',
            label: said.uses,
            options: reasonUses.map((use) => ({ id: use, label: said.useNames[use] })),
          },
        ];
      default:
        return [name];
    }
  };

  const add = async (values: Values): Promise<NotAnswered | null> => {
    const name = text(values, 'name');
    const reply =
      list === 'debris-types'
        ? await api.ask(addDebrisTypeEndpoint, { body: { name } })
        : list === 'payable-types'
          ? await api.ask(addPayableTypeEndpoint, { body: { name } })
          : await api.ask(addListValueEndpoint, {
              params: { list },
              body: {
                name,
                ...(list === 'program-types'
                  ? { requiresRoe: checked(values, 'requiresRoe') }
                  : {}),
                ...(list === 'kinds-of-work'
                  ? {
                      countShape: (picked(values, 'countShape') ?? 'NUMBER') as
                        'NUMBER' | 'ITEM_COUNTS' | 'ITEM_HOURS',
                      photosByStage: checked(values, 'photosByStage'),
                    }
                  : {}),
                ...(list === 'vehicle-types'
                  ? {
                      certifies: (picked(values, 'certifies') ?? 'CONTAINER') as
                        'CONTAINER' | 'CREW',
                    }
                  : {}),
                ...(list === 'incident-sub-types'
                  ? { incidentTypeId: picked(values, 'incidentTypeId') ?? '' }
                  : {}),
                ...(list === 'item-names'
                  ? { kindOfWorkId: picked(values, 'kindOfWorkId') ?? '' }
                  : {}),
                ...(list === 'reasons'
                  ? { uses: picks(values, 'uses') as (typeof reasonUses)[number][] }
                  : {}),
              },
            });
    if (reply.kind !== 'answered') return reply;
    done(reply.answer);
    return null;
  };

  const rename = async (row: ListRow, values: Values): Promise<NotAnswered | null> => {
    const reply = await api.ask(renameListValueEndpoint, {
      params: { list, valueId: row.id },
      body: { name: text(values, 'name') },
    });
    if (reply.kind !== 'answered') return reply;
    done(reply.answer);
    return null;
  };

  const archiving = async (row: ListRow) => {
    setFailed(null);
    const served = row.archived ? unarchiveListValueEndpoint : archiveListValueEndpoint;
    const reply = await api.ask(served, { params: { list, valueId: row.id } });
    if (reply.kind === 'answered') done(reply.answer);
    else setFailed(reply);
  };

  const photosToggled = async (row: ListRow) => {
    setFailed(null);
    const reply = await api.ask(changeListValueSettingsEndpoint, {
      params: { list, valueId: row.id },
      body: { photosByStage: row.photosByStage !== true },
    });
    if (reply.kind === 'answered') done(reply.answer);
    else setFailed(reply);
  };

  const detail = (row: ListRow): string => {
    switch (list) {
      case 'program-types':
        return say(words.common.of, {
          what: said.requiresRoe,
          name: yesNo(row.requiresRoe === true),
        });
      case 'kinds-of-work':
        return [
          row.countShape === null ? '' : said.countShapes[row.countShape as 'NUMBER'],
          say(words.common.of, {
            what: said.photosByStage,
            name: yesNo(row.photosByStage === true),
          }),
        ]
          .filter(Boolean)
          .join(' · ');
      case 'vehicle-types':
        return row.certifies === null ? '' : said.certifiesKinds[row.certifies];
      case 'incident-sub-types':
        return nameIn(incidentTypes, row.incidentTypeId);
      case 'item-names':
        return nameIn(kinds, row.kindOfWorkId);
      case 'reasons':
        return (row.uses ?? []).map((use) => said.useNames[use as 'VOID']).join(', ');
      default:
        return '';
    }
  };

  return (
    <main data-screen="firm-lists" className="page" id="content">
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      {told}
      {failed === null ? null : <Trouble reply={failed} />}
      <div className="page-tools">
        <SelectField
          label={said.which}
          options={firmLists.map((name) => ({ id: name, label: said.names[name] }))}
          value={list}
          onChange={(value) => {
            if (value !== null) setList(value as FirmList);
          }}
        />
        <ChoiceField
          label={words.common.state}
          value={shown}
          onChange={(value) => {
            setShown(value as Shown);
          }}
          options={[
            { id: 'false', label: words.common.inService },
            { id: 'true', label: words.common.archived },
          ]}
        />
        {mayChange && list !== 'field-tags' ? (
          <Button
            main
            onPress={() => {
              setOpen({ row: null });
            }}
          >
            {said.add}
          </Button>
        ) : null}
      </div>
      {list === 'field-tags' ? (
        <Banner tone="info">
          <p>{said.fieldTagsOnProject}</p>
        </Banner>
      ) : null}
      <PagedTable
        caption={said.names[list]}
        served={listListValuesEndpoint}
        asking={{ params: { list }, query: { archived: shown, limit: '100' } }}
        rowsOf={(answer) => answer.values}
        nextOf={(answer) => answer.next}
        keyOf={(row: ListRow) => row.id}
        reloaded={reloaded}
        columns={[
          { label: said.value, names: true, cell: (row) => row.name },
          { label: said.builtIn, cell: (row) => yesNo(row.key !== null) },
          { label: words.common.details, cell: detail },
          ...(mayChange
            ? [
                {
                  label: words.common.actions,
                  cell: (row: ListRow) => (
                    <div className="row-actions">
                      <Button
                        onPress={() => {
                          setOpen({ row });
                        }}
                      >
                        {say(said.rename, { name: row.name })}
                      </Button>
                      {list === 'kinds-of-work' ? (
                        <Button onPress={() => void photosToggled(row)}>
                          {say(words.common.of, {
                            what: said.photosByStage,
                            name: yesNo(row.photosByStage !== true),
                          })}
                        </Button>
                      ) : null}
                      {row.key === null || row.archived ? (
                        <Button onPress={() => void archiving(row)}>
                          {row.archived ? words.common.unarchive : words.common.archive}
                        </Button>
                      ) : null}
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
      {open === null ? null : (
        <FormDialog
          title={open.row === null ? said.add : say(said.rename, { name: open.row.name })}
          fields={fieldsOf(open.row === null)}
          initial={open.row === null ? {} : { name: open.row.name }}
          save={(values) => (open.row === null ? add(values) : rename(open.row, values))}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
    </main>
  );
}
