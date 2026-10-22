// Signing in (ARCHITECTURE §6, Back-office sessions; ADR-408, 409, 412): the email address the firm
// holds and the password; where the person has an authenticator, the right password is answered
// "code needed" and the same sign-in is sent again with the app's code. Every refusal says the same
// thing, whatever was wrong (ADR-409). The fields name what they are, so a password manager fills
// them.
import { signInEndpoint, type SessionAnswer } from '@open-adms/contracts';
import { Banner, Button, ScreenTitle, TextEntry } from '@open-adms/look';
import { useState } from 'react';
import { Link } from 'react-aria-components';

import type { NotAnswered } from '../api.ts';
import { trouble, useApi } from '../reading.tsx';
import { words } from '../words.ts';

export type SignedOutWhy = 'ended' | 'signedOut' | null;

export function SignIn({
  why,
  onSignedIn,
}: {
  readonly why: SignedOutWhy;
  readonly onSignedIn: (session: SessionAnswer) => void;
}) {
  const api = useApi();
  const said = words.signIn;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeNeeded, setCodeNeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);
  const [failed, setFailed] = useState<NotAnswered | null>(null);

  const signIn = async () => {
    setRefused(false);
    setFailed(null);
    setBusy(true);
    const reply = await api.ask(signInEndpoint, {
      body: { email, password, ...(codeNeeded && code.trim() !== '' ? { code: code.trim() } : {}) },
    });
    setBusy(false);
    if (reply.kind === 'answered') {
      api.keepCsrf(reply.answer.csrf);
      onSignedIn(reply.answer);
    } else if (reply.kind === 'refused' && reply.code === 'TWO_STEP_CODE_NEEDED') {
      setCodeNeeded(true);
    } else if (reply.kind === 'refused' && reply.code === 'SIGN_IN_REFUSED') {
      setRefused(true);
      setCode('');
    } else {
      setFailed(reply);
    }
  };

  return (
    <main data-screen="sign-in" className="page page-narrow" id="content">
      <ScreenTitle>{said.title}</ScreenTitle>
      {why === null ? null : (
        <Banner tone="info" announced>
          <p>{why === 'ended' ? said.ended : said.signedOut}</p>
        </Banner>
      )}
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          void signIn();
        }}
      >
        <TextEntry
          label={said.email}
          value={email}
          onChange={setEmail}
          autoComplete="username"
          required
        />
        <TextEntry
          label={said.password}
          value={password}
          onChange={setPassword}
          secret
          autoComplete="current-password"
          required
        />
        {codeNeeded ? (
          <>
            <Banner tone="info" announced>
              <p>{said.codeNeeded}</p>
            </Banner>
            <TextEntry
              label={said.code}
              value={code}
              onChange={setCode}
              autoComplete="one-time-code"
              whole
              longest={6}
              hint={said.codeHint}
              required
            />
          </>
        ) : null}
        {refused ? (
          <Banner tone="problem" announced>
            <p>{said.refused}</p>
          </Banner>
        ) : null}
        {failed === null ? null : (
          <Banner tone="problem" announced>
            <p>{trouble(failed)}</p>
          </Banner>
        )}
        <div className="form-actions">
          <Button main type="submit" busy={busy}>
            {busy ? said.signingIn : said.signIn}
          </Button>
        </div>
      </form>
      <p>
        <Link className="link" href="/password-reset">
          {said.forgot}
        </Link>
      </p>
    </main>
  );
}
