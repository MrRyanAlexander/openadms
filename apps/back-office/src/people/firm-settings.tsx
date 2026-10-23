// The firm's settings (ARCHITECTURE §7; ADR-428, 511, 530): what the firm calls its ADMS (the user,
// 2026-10-22, shown everywhere at once once changed); how long after a phone is marked lost its
// key is revoked by the firm's time, whether read-only viewers must use two-step sign-in, how long a
// monitor's session lasts; and the one master passcode, changed with the admin's own password, each
// phone taking the new one at its next sync. Each change audited with its note.
import {
  changeBrandNameEndpoint,
  changeMasterPasscodeEndpoint,
  changeMonitorSessionHoursEndpoint,
  changeReportContactEndpoint,
  changePhoneKeyHoursEndpoint,
  changeViewerTwoStepEndpoint,
  firmSettingsEndpoint,
} from '@open-adms/contracts';
import { Banner, Button, ScreenTitle } from '@open-adms/look';
import { useState } from 'react';

import {
  FormDialog,
  checked,
  nullable,
  numberOf,
  optional,
  secretOf,
  text,
} from '../look/form-dialog.tsx';
import { brandChanged } from '../brand.tsx';
import { Shown, useApi, useRead } from '../reading.tsx';
import { isAdmin, useSigned } from '../session.tsx';
import { say, words } from '../words.ts';
import { yesNo } from '../setup/common.tsx';

type Open = 'brand' | 'phoneKey' | 'viewers' | 'sessions' | 'passcode' | 'contact' | null;

export function FirmSettings() {
  const api = useApi();
  const said = words.firmSettings;
  const { session } = useSigned();
  const [read, reload] = useRead(firmSettingsEndpoint, {});
  const [open, setOpen] = useState<Open>(null);
  const [told, setTold] = useState<string | null>(null);
  const close = () => {
    setOpen(null);
  };
  const noted = (values: Parameters<typeof optional>[0]) => {
    const note = optional(values, 'note');
    return note === undefined ? {} : { note };
  };
  return (
    <main data-screen="firm-settings" className="page" id="content">
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      {told === null ? null : (
        <Banner tone="good" announced>
          <p>{told}</p>
        </Banner>
      )}
      <Shown read={read}>
        {(settings) => (
          <>
            <dl className="facts">
              <dt>{said.brandName}</dt>
              <dd>{settings.brandName}</dd>
              <dt>{said.phoneKey}</dt>
              <dd>
                {settings.phoneKeyRevokedAfterHours === null
                  ? words.common.none
                  : String(settings.phoneKeyRevokedAfterHours)}
              </dd>
              <dt>{said.viewerTwoStep}</dt>
              <dd>{yesNo(settings.viewerTwoStepRequired)}</dd>
              <dt>{said.monitorSessions}</dt>
              <dd>{String(settings.monitorSessionHours)}</dd>
              <dt>{said.reportContact}</dt>
              <dd>{settings.reportContactEmail ?? words.common.none}</dd>
            </dl>
            <div className="form-actions">
              <Button
                onPress={() => {
                  setOpen('brand');
                }}
              >
                {say(words.common.of, { what: said.change, name: said.brandName })}
              </Button>
              <Button
                onPress={() => {
                  setOpen('phoneKey');
                }}
              >
                {say(words.common.of, { what: said.change, name: said.phoneKey })}
              </Button>
              <Button
                onPress={() => {
                  setOpen('contact');
                }}
              >
                {say(words.common.of, { what: said.change, name: said.reportContact })}
              </Button>
              {isAdmin(session) ? (
                <>
                  <Button
                    onPress={() => {
                      setOpen('viewers');
                    }}
                  >
                    {say(words.common.of, { what: said.change, name: said.viewerTwoStep })}
                  </Button>
                  <Button
                    onPress={() => {
                      setOpen('sessions');
                    }}
                  >
                    {say(words.common.of, { what: said.change, name: said.monitorSessions })}
                  </Button>
                </>
              ) : null}
            </div>
            {isAdmin(session) ? (
              <section className="panel" aria-labelledby="firm-passcode">
                <h2 id="firm-passcode">{said.passcode}</h2>
                <p>{said.passcodeAbout}</p>
                <div className="form-actions">
                  <Button
                    onPress={() => {
                      setOpen('passcode');
                    }}
                  >
                    {said.changePasscode}
                  </Button>
                </div>
              </section>
            ) : null}
            {open === 'phoneKey' ? (
              <FormDialog
                title={said.phoneKey}
                fields={[
                  { kind: 'whole', key: 'hours', label: said.phoneKey, hint: said.phoneKeyHint },
                  { kind: 'text', key: 'note', label: said.note, longest: 500 },
                ]}
                initial={{
                  hours:
                    settings.phoneKeyRevokedAfterHours === null
                      ? ''
                      : String(settings.phoneKeyRevokedAfterHours),
                }}
                save={async (values) => {
                  const reply = await api.ask(changePhoneKeyHoursEndpoint, {
                    body: { hours: numberOf(values, 'hours'), ...noted(values) },
                  });
                  if (reply.kind !== 'answered') return reply;
                  setTold(words.common.saved);
                  reload();
                  return null;
                }}
                onClose={close}
              />
            ) : null}
            {open === 'viewers' ? (
              <FormDialog
                title={said.viewerTwoStep}
                fields={[
                  { kind: 'check', key: 'required', label: said.viewerTwoStep },
                  { kind: 'text', key: 'note', label: said.note, longest: 500 },
                ]}
                initial={{ required: settings.viewerTwoStepRequired }}
                save={async (values) => {
                  const reply = await api.ask(changeViewerTwoStepEndpoint, {
                    body: { required: checked(values, 'required'), ...noted(values) },
                  });
                  if (reply.kind !== 'answered') return reply;
                  setTold(words.common.saved);
                  reload();
                  return null;
                }}
                onClose={close}
              />
            ) : null}
            {open === 'sessions' ? (
              <FormDialog
                title={said.monitorSessions}
                fields={[
                  { kind: 'whole', key: 'hours', label: said.monitorSessions, required: true },
                  { kind: 'text', key: 'note', label: said.note, longest: 500 },
                ]}
                initial={{ hours: String(settings.monitorSessionHours) }}
                save={async (values) => {
                  const reply = await api.ask(changeMonitorSessionHoursEndpoint, {
                    body: { hours: numberOf(values, 'hours') ?? 0, ...noted(values) },
                  });
                  if (reply.kind !== 'answered') return reply;
                  setTold(words.common.saved);
                  reload();
                  return null;
                }}
                onClose={close}
              />
            ) : null}
            {open === 'brand' ? (
              <FormDialog
                title={said.brandName}
                fields={[
                  {
                    kind: 'text',
                    key: 'name',
                    label: said.brandName,
                    hint: said.brandNameHint,
                    required: true,
                    longest: 40,
                  },
                  { kind: 'text', key: 'note', label: said.note, longest: 500 },
                ]}
                initial={{ name: settings.brandName }}
                save={async (values) => {
                  const reply = await api.ask(changeBrandNameEndpoint, {
                    body: { name: text(values, 'name'), ...noted(values) },
                  });
                  if (reply.kind !== 'answered') return reply;
                  brandChanged(reply.answer.brandName);
                  setTold(words.common.saved);
                  reload();
                  return null;
                }}
                onClose={close}
              />
            ) : null}
            {open === 'contact' ? (
              <FormDialog
                title={said.reportContact}
                fields={[
                  {
                    kind: 'text',
                    key: 'email',
                    label: said.reportContact,
                    hint: said.reportContactHint,
                    longest: 320,
                  },
                  { kind: 'text', key: 'note', label: said.note, longest: 500 },
                ]}
                initial={{ email: settings.reportContactEmail ?? '' }}
                save={async (values) => {
                  const reply = await api.ask(changeReportContactEndpoint, {
                    body: { email: nullable(values, 'email'), ...noted(values) },
                  });
                  if (reply.kind !== 'answered') return reply;
                  setTold(words.common.saved);
                  reload();
                  return null;
                }}
                onClose={close}
              />
            ) : null}
            {open === 'passcode' ? (
              <PasscodeDialog
                onChanged={(version) => {
                  setTold(say(said.passcodeChanged, { version }));
                }}
                onClose={close}
              />
            ) : null}
          </>
        )}
      </Shown>
    </main>
  );
}

// The master passcode changed: the admin's own password, then the new passcode, neither shown.
function PasscodeDialog({
  onChanged,
  onClose,
}: {
  readonly onChanged: (version: number) => void;
  readonly onClose: () => void;
}) {
  const api = useApi();
  const said = words.firmSettings;
  return (
    <FormDialog
      title={said.changePasscode}
      fields={[
        {
          kind: 'secret',
          key: 'currentPassword',
          label: said.yourPasswordLabel,
          autoComplete: 'current-password',
        },
        { kind: 'secret', key: 'passcode', label: said.newPasscode, autoComplete: 'new-password' },
      ]}
      initial={{}}
      save={async (values) => {
        const reply = await api.ask(changeMasterPasscodeEndpoint, {
          body: {
            currentPassword: secretOf(values, 'currentPassword'),
            passcode: secretOf(values, 'passcode'),
          },
        });
        if (reply.kind !== 'answered') return reply;
        onChanged(reply.answer.version);
        return null;
      }}
      onClose={onClose}
    />
  );
}
