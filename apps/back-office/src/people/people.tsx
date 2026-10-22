// The firm's people (ARCHITECTURE §7; adms-domain §1.4; FROM-BUILD-1 §11): its admins and
// managers/analysts, its field monitors and the read-only viewers it issues, a page at a time,
// filtered by role, by whether they're archived and by name. An admin adds a back-office person or a
// viewer (a monitor is created on a phone, online, under the master passcode). Each person's page is
// a profile card: their details changed, their permissions as a list ticked and saved, a viewer's
// projects, their role, a password set, their authenticator cleared, their sessions ended, archived
// and put back, and their assignments of the last thirty days. Every change is audited by the API.
import {
  archivePersonEndpoint,
  clearTwoStepEndpoint,
  changePersonEndpoint,
  createPersonEndpoint,
  endPersonSessionsEndpoint,
  findContractorsEndpoint,
  listPeopleEndpoint,
  listProjectsEndpoint,
  readPersonEndpoint,
  searchBoardEndpoint,
  setPermissionsEndpoint,
  setPersonPasswordEndpoint,
  setPersonRoleEndpoint,
  setViewerProjectsEndpoint,
  unarchivePersonEndpoint,
  type PeopleAnswer,
  type PersonAnswer,
} from '@open-adms/contracts';
import { permissions, ProjectClock, type PermissionName } from '@open-adms/domain';
import { Banner, Button, ScreenTitle, TextEntry } from '@open-adms/look';
import { useState } from 'react';
import { Link } from 'react-aria-components';

import type { NotAnswered } from '../api.ts';
import { ChecksField, ChoiceField } from '../look/fields.tsx';
import { FormDialog, checked, nullable, picked, secretOf, text } from '../look/form-dialog.tsx';
import { PagedTable, Table } from '../look/paged-table.tsx';
import { Shown, Trouble, useApi, useRead } from '../reading.tsx';
import { holds, isAdmin, useSigned } from '../session.tsx';
import { counted, day, say, words } from '../words.ts';

type Person = PeopleAnswer['people'][number];
type Role = Person['role'];
type WhichRole = Role | 'every';
type Shown = 'false' | 'true';

const roles: readonly Role[] = ['ADMIN', 'MANAGER_ANALYST', 'MONITOR', 'READ_ONLY_VIEWER'];

export function People() {
  const api = useApi();
  const said = words.people;
  const { session } = useSigned();
  const [role, setRole] = useState<WhichRole>('every');
  const [shown, setShown] = useState<Shown>('false');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [reloaded, setReloaded] = useState(0);
  const [contractors] = useRead(findContractorsEndpoint, { query: { limit: '200' } });
  return (
    <main data-screen="people" className="page" id="content">
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      <p>{said.monitorsAbout}</p>
      <div className="page-tools">
        <TextEntry label={words.common.search} value={name} onChange={setName} />
        <ChoiceField
          label={said.whichRole}
          value={role}
          onChange={(value) => {
            setRole(value as WhichRole);
          }}
          options={[
            { id: 'every', label: said.everyone },
            ...roles.map((one) => ({ id: one, label: said.roles[one] })),
          ]}
        />
        <ChoiceField
          label={said.state}
          value={shown}
          onChange={(value) => {
            setShown(value as Shown);
          }}
          options={[
            { id: 'false', label: words.common.inService },
            { id: 'true', label: words.common.archived },
          ]}
        />
        {isAdmin(session) ? (
          <Button
            main
            onPress={() => {
              setAdding(true);
            }}
          >
            {said.add}
          </Button>
        ) : null}
      </div>
      <PagedTable
        caption={said.title}
        served={listPeopleEndpoint}
        asking={{
          query: {
            archived: shown,
            order: 'NAME',
            limit: '50',
            ...(role === 'every' ? {} : { role }),
            ...(name.trim() === '' ? {} : { name: name.trim() }),
          },
        }}
        rowsOf={(answer) => answer.people}
        nextOf={(answer) => answer.next}
        keyOf={(person: Person) => person.id}
        reloaded={reloaded}
        columns={[
          {
            label: said.name,
            names: true,
            cell: (person) => (
              <Link className="link" href={`/people/${person.id}`}>
                {person.name}
              </Link>
            ),
          },
          { label: said.role, cell: (person) => said.roles[person.role] },
          { label: said.monitorId, cell: (person) => person.monitorId ?? '' },
          { label: said.email, cell: (person) => person.email ?? '' },
          {
            label: said.state,
            cell: (person) => (person.archived ? words.common.archived : words.common.inService),
          },
        ]}
      />
      {adding ? (
        <FormDialog
          title={said.add}
          fields={[
            { kind: 'text', key: 'name', label: said.name, required: true, longest: 200 },
            { kind: 'text', key: 'email', label: said.email, required: true, longest: 320 },
            { kind: 'text', key: 'phone', label: said.phone, longest: 40 },
            {
              kind: 'pick',
              key: 'role',
              label: said.role,
              required: true,
              options: (['ADMIN', 'MANAGER_ANALYST', 'READ_ONLY_VIEWER'] as const).map((one) => ({
                id: one,
                label: said.roles[one],
              })),
            },
            {
              kind: 'pick',
              key: 'viewerKind',
              label: said.viewerKind,
              options: (['CLIENT', 'CONTRACTOR', 'AUDITOR'] as const).map((one) => ({
                id: one,
                label: said.viewerKinds[one],
              })),
            },
            {
              kind: 'pick',
              key: 'contractorId',
              label: said.contractor,
              options:
                contractors.kind === 'answered'
                  ? contractors.answer.records
                      .filter((row) => !row.archived)
                      .map((row) => ({ id: row.id, label: row.name }))
                  : [],
            },
            { kind: 'check', key: 'seesPrivateCitizens', label: said.seesPrivateCitizens },
          ]}
          initial={{ role: 'MANAGER_ANALYST' }}
          save={async (values): Promise<NotAnswered | null> => {
            const base = {
              name: text(values, 'name'),
              email: text(values, 'email'),
              ...(nullable(values, 'phone') === null ? {} : { phone: text(values, 'phone') }),
            };
            const chosen = picked(values, 'role');
            const kind = picked(values, 'viewerKind') ?? 'CLIENT';
            const body =
              chosen === 'READ_ONLY_VIEWER'
                ? kind === 'CONTRACTOR'
                  ? {
                      ...base,
                      role: 'READ_ONLY_VIEWER' as const,
                      viewerKind: 'CONTRACTOR' as const,
                      contractorId: picked(values, 'contractorId') ?? '',
                      seesPrivateCitizens: checked(values, 'seesPrivateCitizens'),
                    }
                  : {
                      ...base,
                      role: 'READ_ONLY_VIEWER' as const,
                      viewerKind: kind as 'CLIENT' | 'AUDITOR',
                      seesPrivateCitizens: checked(values, 'seesPrivateCitizens'),
                    }
                : { ...base, role: (chosen ?? 'MANAGER_ANALYST') as 'ADMIN' | 'MANAGER_ANALYST' };
            const reply = await api.ask(createPersonEndpoint, { body });
            if (reply.kind !== 'answered') return reply;
            setReloaded((count) => count + 1);
            return null;
          }}
          onClose={() => {
            setAdding(false);
          }}
        />
      ) : null}
    </main>
  );
}

type Open = 'details' | 'role' | 'password' | null;

export function PersonPage({ userId }: { readonly userId: string }) {
  const api = useApi();
  const said = words.people;
  const { session } = useSigned();
  const admin = isAdmin(session);
  const [read, reload] = useRead(readPersonEndpoint, { params: { userId } });
  const [projects] = useRead(listProjectsEndpoint, { query: { limit: '200' } });
  const [open, setOpen] = useState<Open>(null);
  const [granted, setGranted] = useState<readonly string[] | null>(null);
  const [seen, setSeen] = useState<readonly string[] | null>(null);
  const [told, setTold] = useState<string | null>(null);
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (
    reply: Promise<{ readonly kind: 'answered' } | NotAnswered>,
    saying: string,
  ) => {
    setFailed(null);
    setTold(null);
    setBusy(true);
    const answered = await reply;
    setBusy(false);
    if (answered.kind === 'answered') {
      setTold(saying);
      reload();
    } else setFailed(answered);
  };

  // The last thirty days by the browser's own calendar: a person's history spans projects.
  const here = new ProjectClock(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const today = here.day(new Date());
  const monthAgo = here.day(new Date(Date.now() - 30 * 86_400_000));
  return (
    <main data-screen="person" className="page" id="content">
      <Shown read={read}>
        {(person: PersonAnswer) => (
          <>
            <ScreenTitle>{say(said.page, { name: person.name })}</ScreenTitle>
            <p>
              <Link className="link" href="/people">
                {said.title}
              </Link>
            </p>
            {told === null ? null : (
              <Banner tone="good" announced>
                <p>{told}</p>
              </Banner>
            )}
            {failed === null ? null : <Trouble reply={failed} />}
            <section className="panel" aria-labelledby="person-details">
              <h2 id="person-details">{said.details}</h2>
              <dl className="facts">
                <dt>{said.role}</dt>
                <dd>{said.roles[person.role]}</dd>
                {person.monitorId === null ? null : (
                  <>
                    <dt>{said.monitorId}</dt>
                    <dd>{person.monitorId}</dd>
                  </>
                )}
                <dt>{said.email}</dt>
                <dd>{person.email ?? words.common.none}</dd>
                <dt>{said.phone}</dt>
                <dd>{person.phone ?? words.common.none}</dd>
                {person.viewerKind === null ? null : (
                  <>
                    <dt>{said.viewerKind}</dt>
                    <dd>{said.viewerKinds[person.viewerKind]}</dd>
                  </>
                )}
                <dt>{said.state}</dt>
                <dd>{person.archived ? words.common.archived : words.common.inService}</dd>
              </dl>
              {admin ? (
                <div className="form-actions">
                  <Button
                    onPress={() => {
                      setOpen('details');
                    }}
                  >
                    {said.changeDetails}
                  </Button>
                  {person.role === 'ADMIN' || person.role === 'MANAGER_ANALYST' ? (
                    <Button
                      onPress={() => {
                        setOpen('role');
                      }}
                    >
                      {said.changeRole}
                    </Button>
                  ) : null}
                  {person.role === 'MONITOR' ? null : (
                    <>
                      <Button
                        onPress={() => {
                          setOpen('password');
                        }}
                      >
                        {said.setPassword}
                      </Button>
                      <Button
                        busy={busy}
                        onPress={() =>
                          void act(
                            api.ask(clearTwoStepEndpoint, { params: { userId } }),
                            said.cleared,
                          )
                        }
                      >
                        {said.clearTwoStep}
                      </Button>
                    </>
                  )}
                  <Button
                    busy={busy}
                    onPress={() => {
                      setFailed(null);
                      void api
                        .ask(endPersonSessionsEndpoint, { params: { userId } })
                        .then((reply) => {
                          if (reply.kind === 'answered')
                            setTold(counted(said.ended, reply.answer.sessions));
                          else setFailed(reply);
                        });
                    }}
                  >
                    {said.endSessions}
                  </Button>
                  <Button
                    busy={busy}
                    onPress={() =>
                      void act(
                        api.ask(person.archived ? unarchivePersonEndpoint : archivePersonEndpoint, {
                          params: { userId },
                        }),
                        words.common.saved,
                      )
                    }
                  >
                    {person.archived ? said.unarchive : said.archive}
                  </Button>
                </div>
              ) : null}
            </section>

            {person.role === 'MANAGER_ANALYST' ? (
              <section className="panel" aria-labelledby="person-permissions">
                <h2 id="person-permissions">{said.permissions}</h2>
                <p>{said.permissionsAbout}</p>
                <ChecksField
                  label={said.permissions}
                  options={permissions.map((one) => ({
                    id: one,
                    label: said.permissionNames[one],
                  }))}
                  value={granted ?? person.permissions}
                  onChange={setGranted}
                />
                {admin ? (
                  <div className="form-actions">
                    <Button
                      main
                      busy={busy}
                      onPress={() =>
                        void act(
                          api.ask(setPermissionsEndpoint, {
                            params: { userId },
                            body: {
                              permissions: [...(granted ?? person.permissions)] as PermissionName[],
                            },
                          }),
                          words.common.saved,
                        )
                      }
                    >
                      {said.savePermissions}
                    </Button>
                  </div>
                ) : null}
              </section>
            ) : null}

            {person.role === 'READ_ONLY_VIEWER' ? (
              <section className="panel" aria-labelledby="person-projects">
                <h2 id="person-projects">{said.projects}</h2>
                <ChecksField
                  label={said.projects}
                  options={
                    projects.kind === 'answered'
                      ? projects.answer.projects.map((one) => ({ id: one.id, label: one.name }))
                      : []
                  }
                  value={seen ?? person.projectIds}
                  onChange={setSeen}
                />
                {admin ? (
                  <div className="form-actions">
                    <Button
                      main
                      busy={busy}
                      onPress={() =>
                        void act(
                          api.ask(setViewerProjectsEndpoint, {
                            params: { userId },
                            body: { projectIds: [...(seen ?? person.projectIds)] },
                          }),
                          words.common.saved,
                        )
                      }
                    >
                      {said.saveProjects}
                    </Button>
                  </div>
                ) : null}
              </section>
            ) : null}

            {person.role === 'MONITOR' && holds(session, 'VIEW_DISPATCH') ? (
              <History userId={userId} from={monthAgo} to={today} />
            ) : null}

            {open === 'details' ? (
              <FormDialog
                title={said.changeDetails}
                fields={[
                  { kind: 'text', key: 'name', label: said.name, required: true, longest: 200 },
                  { kind: 'text', key: 'email', label: said.email, longest: 320 },
                  { kind: 'text', key: 'phone', label: said.phone, longest: 40 },
                  ...(person.role === 'MONITOR'
                    ? [
                        {
                          kind: 'text',
                          key: 'employerNumber',
                          label: said.employerNumber,
                          longest: 60,
                        } as const,
                      ]
                    : []),
                ]}
                initial={{
                  name: person.name,
                  email: person.email ?? '',
                  phone: person.phone ?? '',
                  employerNumber: person.employerNumber ?? '',
                }}
                save={async (values) => {
                  const reply = await api.ask(changePersonEndpoint, {
                    params: { userId },
                    body: {
                      name: text(values, 'name'),
                      ...(nullable(values, 'email') === null
                        ? {}
                        : { email: text(values, 'email') }),
                      phone: nullable(values, 'phone'),
                      ...(person.role === 'MONITOR'
                        ? { employerNumber: nullable(values, 'employerNumber') }
                        : {}),
                    },
                  });
                  if (reply.kind !== 'answered') return reply;
                  setTold(words.common.saved);
                  reload();
                  return null;
                }}
                onClose={() => {
                  setOpen(null);
                }}
              />
            ) : null}
            {open === 'role' ? (
              <FormDialog
                title={said.changeRole}
                fields={[
                  {
                    kind: 'pick',
                    key: 'role',
                    label: said.role,
                    required: true,
                    options: (['ADMIN', 'MANAGER_ANALYST'] as const).map((one) => ({
                      id: one,
                      label: said.roles[one],
                    })),
                  },
                ]}
                initial={{ role: person.role }}
                save={async (values) => {
                  const reply = await api.ask(setPersonRoleEndpoint, {
                    params: { userId },
                    body: {
                      role: (picked(values, 'role') ?? 'MANAGER_ANALYST') as
                        'ADMIN' | 'MANAGER_ANALYST',
                    },
                  });
                  if (reply.kind !== 'answered') return reply;
                  setTold(words.common.saved);
                  reload();
                  return null;
                }}
                onClose={() => {
                  setOpen(null);
                }}
              />
            ) : null}
            {open === 'password' ? (
              <FormDialog
                title={said.setPassword}
                fields={[
                  {
                    kind: 'secret',
                    key: 'password',
                    label: said.newPassword,
                    hint: said.setPasswordAbout,
                    autoComplete: 'new-password',
                  },
                ]}
                initial={{}}
                save={async (values) => {
                  const reply = await api.ask(setPersonPasswordEndpoint, {
                    params: { userId },
                    body: { password: secretOf(values, 'password') },
                  });
                  if (reply.kind !== 'answered') return reply;
                  setTold(said.passwordSet);
                  return null;
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

// A monitor's assignments of the last thirty days, as the board holds them.
function History({
  userId,
  from,
  to,
}: {
  readonly userId: string;
  readonly from: string;
  readonly to: string;
}) {
  const said = words.people;
  const [read] = useRead(searchBoardEndpoint, { query: { userId, from, to, limit: '200' } });
  return (
    <section className="panel" aria-labelledby="person-history">
      <h2 id="person-history">{said.history}</h2>
      <Shown read={read}>
        {(answer) =>
          answer.assignments.length === 0 ? (
            <p>{said.noHistory}</p>
          ) : (
            <Table
              caption={said.history}
              rows={answer.assignments}
              keyOf={(entry) => entry.assignment.id}
              columns={[
                {
                  label: words.dispatch.day,
                  names: true,
                  cell: (entry) => day(entry.assignment.workDate),
                },
                {
                  label: words.dispatch.work,
                  cell: (entry) =>
                    entry.assignment.fieldEventKinds
                      .map((kind) => words.dispatch.kinds[kind])
                      .join(', '),
                },
                {
                  label: words.dispatch.site,
                  cell: (entry) => entry.assignment.site?.name ?? words.dispatch.noSite,
                },
                {
                  label: words.dispatch.phone,
                  cell: (entry) => entry.assignment.phone?.name ?? words.dispatch.noPhone,
                },
              ]}
            />
          )
        }
      </Shown>
    </section>
  );
}
