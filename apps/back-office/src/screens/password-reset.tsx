// A password reset by email (ARCHITECTURE §6, Every way in; ADR-404): the person types the address
// the firm holds; if it signs in here, a code is sent to it (the answer is the same whether or not,
// so nobody learns who has a login). Then the code and a new password, twice. Where the firm has no
// mail server, an admin sets the password instead, and the page says so. A reset gives a password,
// never a session: the person signs in after, their authenticator still asked.
import { completePasswordResetEndpoint, requestPasswordResetEndpoint } from '@open-adms/contracts';
import { Banner, Button, ScreenTitle, TextEntry } from '@open-adms/look';
import { useState } from 'react';
import { Link } from 'react-aria-components';

import type { NotAnswered } from '../api.ts';
import { trouble, useApi } from '../reading.tsx';
import { words } from '../words.ts';

export function PasswordReset() {
  const api = useApi();
  const said = words.reset;
  const [email, setEmail] = useState('');
  const [asked, setAsked] = useState<'no' | 'sent' | 'noMail'>('no');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<{ field: 'code' | 'new' | 'again'; words: string } | null>(
    null,
  );
  const [failed, setFailed] = useState<NotAnswered | null>(null);

  const ask = async () => {
    setFailed(null);
    setBusy(true);
    const reply = await api.ask(requestPasswordResetEndpoint, { body: { email } });
    setBusy(false);
    if (reply.kind === 'answered') setAsked('sent');
    else if (reply.kind === 'refused' && reply.code === 'NO_MAIL') setAsked('noMail');
    else setFailed(reply);
  };

  const complete = async () => {
    setFailed(null);
    setProblem(null);
    if (password !== again) {
      setProblem({ field: 'again', words: said.mismatch });
      return;
    }
    setBusy(true);
    const reply = await api.ask(completePasswordResetEndpoint, {
      body: { code: code.trim(), password },
    });
    setBusy(false);
    if (reply.kind === 'answered') setDone(true);
    else if (reply.kind === 'refused' && reply.code === 'RESET_REFUSED') {
      setProblem({ field: 'code', words: said.refusedCode });
    } else if (reply.kind === 'refused' && reply.code.startsWith('PASSWORD_')) {
      setProblem({ field: 'new', words: trouble(reply) });
    } else setFailed(reply);
  };

  const problemOf = (field: 'code' | 'new' | 'again') =>
    problem?.field === field ? problem.words : undefined;
  return (
    <main data-screen="password-reset" className="page page-narrow" id="content">
      <ScreenTitle>{said.title}</ScreenTitle>
      {done ? (
        <Banner tone="good" announced>
          <p>{said.done}</p>
        </Banner>
      ) : asked === 'no' ? (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            void ask();
          }}
        >
          <p>{said.about}</p>
          <TextEntry
            label={words.signIn.email}
            value={email}
            onChange={setEmail}
            autoComplete="username"
            required
          />
          <div className="form-actions">
            <Button main type="submit" busy={busy}>
              {busy ? said.asking : said.ask}
            </Button>
          </div>
        </form>
      ) : asked === 'noMail' ? (
        <Banner tone="info" announced>
          <p>{said.noMail}</p>
        </Banner>
      ) : (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            void complete();
          }}
        >
          <Banner tone="info" announced>
            <p>{said.sent}</p>
          </Banner>
          <TextEntry
            label={said.code}
            value={code}
            onChange={setCode}
            autoComplete="one-time-code"
            required
            problem={problemOf('code')}
          />
          <TextEntry
            label={said.passwordLabel}
            value={password}
            onChange={setPassword}
            secret
            autoComplete="new-password"
            hint={words.password.hint}
            required
            problem={problemOf('new')}
          />
          <TextEntry
            label={said.again}
            value={again}
            onChange={setAgain}
            secret
            autoComplete="new-password"
            required
            problem={problemOf('again')}
          />
          <div className="form-actions">
            <Button main type="submit" busy={busy}>
              {busy ? said.completing : said.complete}
            </Button>
          </div>
        </form>
      )}
      {failed === null ? null : (
        <Banner tone="problem" announced>
          <p>{trouble(failed)}</p>
        </Banner>
      )}
      <p>
        <Link className="link" href="/">
          {said.toSignIn}
        </Link>
      </p>
    </main>
  );
}
