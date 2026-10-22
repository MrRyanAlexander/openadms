// The person's own account (ARCHITECTURE §6; ADR-408, 410, 412; ASVS 7.5.2): who they're signed in
// as, their password changed, their authenticator set up (a read-only viewer may remove theirs
// where the firm doesn't require one), their own sessions open now with one ended, and signing out.
import {
  endOwnSessionEndpoint,
  listOwnSessionsEndpoint,
  removeOwnTwoStepEndpoint,
} from '@open-adms/contracts';
import { Banner, Button, ScreenTitle, TextEntry } from '@open-adms/look';
import { useState } from 'react';

import type { NotAnswered } from '../api.ts';
import { Table } from '../look/paged-table.tsx';
import { Shown, Trouble, useApi, useRead } from '../reading.tsx';
import { useSigned } from '../session.tsx';
import { say, when, words } from '../words.ts';
import { PasswordForm } from './password-form.tsx';
import { TwoStepForm } from './two-step-form.tsx';

export function Account() {
  const api = useApi();
  const signed = useSigned();
  const { session } = signed;
  const said = words.account;
  const [sessions, reload] = useRead(listOwnSessionsEndpoint, {});
  const [told, setTold] = useState<string | null>(null);
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const [ending, setEnding] = useState<string | null>(null);
  const [removeCode, setRemoveCode] = useState('');
  const [removing, setRemoving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const end = async (sessionId: string) => {
    setFailed(null);
    setEnding(sessionId);
    const reply = await api.ask(endOwnSessionEndpoint, { body: { sessionId } });
    setEnding(null);
    if (reply.kind === 'answered') {
      setTold(said.ended);
      reload();
    } else setFailed(reply);
  };

  const remove = async () => {
    setFailed(null);
    setRemoving(true);
    const reply = await api.ask(removeOwnTwoStepEndpoint, { body: { code: removeCode.trim() } });
    setRemoving(false);
    if (reply.kind === 'answered') {
      setRemoveCode('');
      setTold(words.twoStep.removed);
      await signed.reread();
    } else setFailed(reply);
  };

  return (
    <main data-screen="account" className="page" id="content">
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{say(said.signedInAs, { name: session.user.name, role: said.role[session.user.role] })}</p>
      {told === null ? null : (
        <Banner tone="good" announced>
          <p>{told}</p>
        </Banner>
      )}
      {failed === null ? null : <Trouble reply={failed} />}

      <section className="panel" aria-labelledby="account-password">
        <h2 id="account-password">{words.password.title}</h2>
        <PasswordForm
          onChanged={() => {
            setTold(words.password.done);
            reload();
          }}
        />
      </section>

      <section className="panel" aria-labelledby="account-two-step">
        <h2 id="account-two-step">{words.twoStep.title}</h2>
        <p>{session.twoStepSetUp ? said.twoStepOn : said.twoStepOff}</p>
        {session.twoStepSetUp ? (
          session.user.role === 'READ_ONLY_VIEWER' ? (
            <form
              className="form"
              onSubmit={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              <TextEntry
                label={words.twoStep.removeCode}
                value={removeCode}
                onChange={setRemoveCode}
                autoComplete="one-time-code"
                whole
                longest={6}
                required
              />
              <div className="form-actions">
                <Button type="submit" busy={removing}>
                  {removing ? words.twoStep.removing : words.twoStep.remove}
                </Button>
              </div>
            </form>
          ) : null
        ) : (
          <>
            <p>{words.twoStep.optional}</p>
            <TwoStepForm
              onSetUp={() => {
                setTold(words.twoStep.done);
                void signed.reread();
              }}
            />
          </>
        )}
      </section>

      <section className="panel" aria-labelledby="account-sessions">
        <h2 id="account-sessions">{said.sessions}</h2>
        <p>{said.sessionsAbout}</p>
        <Shown read={sessions}>
          {(answer) => (
            <Table
              caption={said.sessions}
              rows={answer.sessions}
              keyOf={(one) => one.id}
              columns={[
                { label: said.opened, names: true, cell: (one) => when(one.openedAt) },
                { label: said.endsBy, cell: (one) => when(one.endsBy) },
                {
                  label: said.endColumn,
                  cell: (one) =>
                    one.current ? (
                      said.thisOne
                    ) : (
                      <Button busy={ending === one.id} onPress={() => void end(one.id)}>
                        {ending === one.id ? said.ending : said.end}
                      </Button>
                    ),
                },
              ]}
            />
          )}
        </Shown>
      </section>

      <div className="form-actions">
        <Button
          busy={signingOut}
          onPress={() => {
            setSigningOut(true);
            void signed.signOut();
          }}
        >
          {signingOut ? said.signingOut : said.signOut}
        </Button>
      </div>
    </main>
  );
}
