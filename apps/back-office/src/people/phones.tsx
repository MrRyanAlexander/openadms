// The firm's phones (ARCHITECTURE §7.4; adms-field-app §4A; ADR-436, 530): each enrolled once, its
// name, whether it is in service, which master passcode it holds, and its sign-ins. A person who may
// dispatch renames one, takes one out of service (lost or retired, from a time, with a reason; a lost
// phone's key is revoked by the firm's time) and returns it.
import {
  listListValuesEndpoint,
  listPhoneSessionsEndpoint,
  listPhonesEndpoint,
  removePhoneEndpoint,
  renamePhoneEndpoint,
  returnPhoneEndpoint,
  type PhonesAnswer,
} from '@open-adms/contracts';
import { Button, ScreenTitle } from '@open-adms/look';
import { useState } from 'react';

import { ChoiceField } from '../look/fields.tsx';
import { FormDialog, optional, picked, text } from '../look/form-dialog.tsx';
import { PagedTable, Table } from '../look/paged-table.tsx';
import { Shown, useApi, useRead } from '../reading.tsx';
import { holds, useSigned } from '../session.tsx';
import { useTold, yesNo, type SetupWritten } from '../setup/common.tsx';
import { say, when, words } from '../words.ts';

type Phone = PhonesAnswer['phones'][number];
type Open =
  | { readonly kind: 'rename'; readonly phone: Phone }
  | { readonly kind: 'out'; readonly phone: Phone }
  | { readonly kind: 'return'; readonly phone: Phone }
  | { readonly kind: 'sessions'; readonly phone: Phone };

export function Phones() {
  const api = useApi();
  const said = words.phones;
  const { session } = useSigned();
  const mayDispatch = holds(session, 'DISPATCH');
  const [which, setWhich] = useState<'false' | 'true'>('false');
  const [open, setOpen] = useState<Open | null>(null);
  const [reloaded, setReloaded] = useState(0);
  const [told, tell] = useTold();
  const [reasons] = useRead(listListValuesEndpoint, {
    params: { list: 'reasons' },
    query: { archived: 'false', limit: '200' },
  });
  const done = (answer: SetupWritten): null => {
    tell(answer);
    setReloaded((count) => count + 1);
    return null;
  };
  const close = () => {
    setOpen(null);
  };
  return (
    <main data-screen="phones" className="page" id="content">
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      {told}
      <div className="page-tools">
        <ChoiceField
          label={said.which}
          value={which}
          onChange={(value) => {
            setWhich(value as 'false' | 'true');
          }}
          options={[
            { id: 'false', label: said.inService },
            { id: 'true', label: said.outOfServiceOnly },
          ]}
        />
      </div>
      <PagedTable
        caption={said.title}
        served={listPhonesEndpoint}
        asking={{ query: { outOfService: which, limit: '100' } }}
        rowsOf={(answer) => answer.phones}
        nextOf={(answer) => answer.next}
        keyOf={(phone: Phone) => phone.id}
        reloaded={reloaded}
        columns={[
          { label: said.name, names: true, cell: (phone) => phone.name },
          { label: said.status, cell: (phone) => said.statuses[phone.status] },
          { label: said.enrolledAt, cell: (phone) => when(phone.enrolledAt) },
          {
            label: said.outOfService,
            cell: (phone) => (phone.outOfServiceAt === null ? '' : when(phone.outOfServiceAt)),
          },
          {
            label: said.passcode,
            cell: (phone) =>
              phone.holdsCurrentPasscode
                ? said.current
                : say(said.old, { version: phone.masterPasscodeVersion }),
          },
          { label: said.keyRevoked, cell: (phone) => yesNo(phone.keyRevokedAt !== null) },
          {
            label: words.common.actions,
            cell: (phone) => (
              <div className="row-actions">
                <Button
                  onPress={() => {
                    setOpen({ kind: 'sessions', phone });
                  }}
                >
                  {say(said.sessionsOpen, { name: phone.name })}
                </Button>
                {mayDispatch ? (
                  <>
                    <Button
                      onPress={() => {
                        setOpen({ kind: 'rename', phone });
                      }}
                    >
                      {say(said.rename, { name: phone.name })}
                    </Button>
                    {phone.status === 'ACTIVE' ? (
                      <Button
                        onPress={() => {
                          setOpen({ kind: 'out', phone });
                        }}
                      >
                        {say(said.markOut, { name: phone.name })}
                      </Button>
                    ) : (
                      <Button
                        onPress={() => {
                          setOpen({ kind: 'return', phone });
                        }}
                      >
                        {say(said.returnPhone, { name: phone.name })}
                      </Button>
                    )}
                  </>
                ) : null}
              </div>
            ),
          },
        ]}
      />
      {open?.kind === 'rename' ? (
        <FormDialog
          title={say(said.rename, { name: open.phone.name })}
          fields={[{ kind: 'text', key: 'name', label: said.name, required: true, longest: 80 }]}
          initial={{ name: open.phone.name }}
          save={async (values) => {
            const reply = await api.ask(renamePhoneEndpoint, {
              params: { deviceId: open.phone.id },
              body: { name: text(values, 'name') },
            });
            return reply.kind === 'answered' ? done(reply.answer) : reply;
          }}
          onClose={close}
        />
      ) : null}
      {open?.kind === 'out' ? (
        <FormDialog
          title={say(said.markOut, { name: open.phone.name })}
          fields={[
            {
              kind: 'pick',
              key: 'status',
              label: said.outStatus,
              required: true,
              options: (['LOST', 'RETIRED'] as const).map((status) => ({
                id: status,
                label: said.statuses[status],
              })),
            },
            {
              kind: 'pick',
              key: 'reasonId',
              label: said.reason,
              options:
                reasons.kind === 'answered'
                  ? reasons.answer.values.map((value) => ({ id: value.id, label: value.name }))
                  : [],
            },
            { kind: 'text', key: 'note', label: said.note, longest: 500 },
          ]}
          initial={{ status: 'LOST' }}
          save={async (values) => {
            const reason = picked(values, 'reasonId');
            const note = optional(values, 'note');
            const reply = await api.ask(removePhoneEndpoint, {
              params: { deviceId: open.phone.id },
              body: {
                status: (picked(values, 'status') ?? 'LOST') as 'LOST' | 'RETIRED',
                ...(reason === null ? {} : { reasonId: reason }),
                ...(note === undefined ? {} : { note }),
              },
            });
            return reply.kind === 'answered' ? done(reply.answer) : reply;
          }}
          onClose={close}
        />
      ) : null}
      {open?.kind === 'return' ? (
        <FormDialog
          title={say(said.returnPhone, { name: open.phone.name })}
          fields={[{ kind: 'text', key: 'note', label: said.note, required: true, longest: 500 }]}
          initial={{}}
          save={async (values) => {
            const reply = await api.ask(returnPhoneEndpoint, {
              params: { deviceId: open.phone.id },
              body: { note: text(values, 'note') },
            });
            return reply.kind === 'answered' ? done(reply.answer) : reply;
          }}
          onClose={close}
        />
      ) : null}
      {open?.kind === 'sessions' ? <PhoneSessions phone={open.phone} onClose={close} /> : null}
    </main>
  );
}

// A phone's sign-ins, newest first: whose, how, and when each opened and ended.
function PhoneSessions({
  phone,
  onClose,
}: {
  readonly phone: Phone;
  readonly onClose: () => void;
}) {
  const said = words.phones;
  const [read] = useRead(listPhoneSessionsEndpoint, {
    params: { deviceId: phone.id },
    query: { limit: '50' },
  });
  return (
    <FormDialog
      title={say(said.sessions, { name: phone.name })}
      fields={[]}
      initial={{}}
      saveLabel={words.common.close}
      save={() => Promise.resolve(null)}
      onClose={onClose}
    >
      <Shown read={read}>
        {(answer) => (
          <Table
            caption={say(said.sessions, { name: phone.name })}
            rows={answer.sessions}
            keyOf={(one) => one.id}
            columns={[
              {
                label: said.opened,
                names: true,
                cell: (one) => when(one.signedInAt ?? one.createdAt),
              },
              {
                label: said.kind,
                cell: (one) =>
                  one.masterPasscodeSession === null
                    ? said.kinds.own
                    : said.kinds[one.masterPasscodeSession],
              },
              { label: said.offline, cell: (one) => yesNo(one.offlineSignIn) },
              { label: said.endsBy, cell: (one) => when(one.expiresAt) },
              {
                label: said.ended,
                cell: (one) => (one.revokedAt === null ? '' : when(one.revokedAt)),
              },
            ]}
          />
        )}
      </Shown>
    </FormDialog>
  );
}
