// The back office (ARCHITECTURE §14): one React app on the API, served at its own name behind the
// proxy with its own page policy (page.ts). It holds no rule and no payload of its own: the rules
// are `packages/domain`'s, the payloads `packages/contracts'`, the look `packages/look`'s.
//
// **Who is signed in decides the screen**: a page loaded anew asks the API for its session by the
// refresh token's cookie; with none, the sign-in. A person whose password somebody else set
// chooses their own first, and an admin or a manager/analyst with no authenticator sets one up,
// before anything else (the API serves them nothing else until then, ADR-410, 412), each as a
// window on an empty desktop. Signed in, the desktop (shell.tsx), where the address names the
// window shown.
import './look/win95.css';
import './look/office.css';

import { currentSessionEndpoint, signOutEndpoint, type SessionAnswer } from '@open-adms/contracts';
import { ScreenTitle } from '@open-adms/look';
import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Api } from './api.ts';
import { ApiContext } from './reading.tsx';
import { keptTheme, showTheme } from './desk/preferences.ts';
import { isViewer, portal } from './portal/portal.tsx';
import { office } from './routes.tsx';
import { navigate, Routed, useWhere } from './router.tsx';
import { PasswordForm } from './screens/password-form.tsx';
import { PasswordReset } from './screens/password-reset.tsx';
import { SignIn, type SignedOutWhy } from './screens/sign-in.tsx';
import { TwoStepForm } from './screens/two-step-form.tsx';
import { SignedContext, type Signed } from './session.tsx';
import { Shell, SignedOutDesk } from './shell.tsx';
import { words } from './words.ts';

type Standing =
  | { readonly kind: 'opening' }
  | { readonly kind: 'out'; readonly why: SignedOutWhy }
  | { readonly kind: 'in'; readonly session: SessionAnswer };

function App({ api }: { readonly api: Api }) {
  const [standing, setStanding] = useState<Standing>({ kind: 'opening' });
  const { path } = useWhere();

  const reread = useCallback(async () => {
    const reply = await api.ask(currentSessionEndpoint);
    if (reply.kind === 'answered') {
      api.keepCsrf(reply.answer.csrf);
      setStanding({ kind: 'in', session: reply.answer });
    }
  }, [api]);

  useEffect(() => {
    api.onEnded = () => {
      api.keepCsrf(null);
      setStanding({ kind: 'out', why: 'ended' });
    };
    void api.resumed().then(async (resumed) => {
      if (!resumed) {
        setStanding({ kind: 'out', why: null });
        return;
      }
      const reply = await api.ask(currentSessionEndpoint);
      if (reply.kind === 'answered') {
        api.keepCsrf(reply.answer.csrf);
        setStanding({ kind: 'in', session: reply.answer });
      } else setStanding({ kind: 'out', why: null });
    });
  }, [api]);

  const signOut = useCallback(async () => {
    await api.ask(signOutEndpoint);
    api.keepCsrf(null);
    navigate('/');
    setStanding({ kind: 'out', why: 'signedOut' });
  }, [api]);

  const signed = useMemo<Signed | null>(
    () => (standing.kind === 'in' ? { session: standing.session, reread, signOut } : null),
    [standing, reread, signOut],
  );

  if (standing.kind === 'opening') return null;
  if (standing.kind === 'out' || signed === null) {
    return (
      <SignedOutDesk>
        {path === '/password-reset' ? (
          <PasswordReset />
        ) : (
          <SignIn
            why={standing.kind === 'out' ? standing.why : null}
            onSignedIn={(session) => {
              setStanding({ kind: 'in', session });
            }}
          />
        )}
      </SignedOutDesk>
    );
  }
  const { session } = signed;
  if (session.passwordChangeRequired) {
    return (
      <SignedContext.Provider value={signed}>
        <SignedOutDesk>
          <main data-screen="password-required" className="page page-narrow" id="content">
            <ScreenTitle>{words.password.title}</ScreenTitle>
            <p>{words.password.required}</p>
            <PasswordForm onChanged={() => void reread()} />
          </main>
        </SignedOutDesk>
      </SignedContext.Provider>
    );
  }
  if (session.twoStepSetupRequired) {
    return (
      <SignedContext.Provider value={signed}>
        <SignedOutDesk>
          <main data-screen="two-step-required" className="page page-narrow" id="content">
            <ScreenTitle>{words.twoStep.title}</ScreenTitle>
            <p>{words.twoStep.required}</p>
            <TwoStepForm
              onSetUp={(next) => {
                setStanding({ kind: 'in', session: next });
              }}
            />
          </main>
        </SignedOutDesk>
      </SignedContext.Provider>
    );
  }
  if (path === '/password-reset') navigate('/', { replace: true });
  return (
    <SignedContext.Provider value={signed}>
      <Shell key={session.user.id} workplace={isViewer(session) ? portal : office} />
    </SignedContext.Provider>
  );
}

// The theme the person chose in this browser, before anything is drawn (desk/preferences.ts).
showTheme(keptTheme());

const place = document.getElementById('app');
if (place === null) throw new Error('index.html has no element for the app.');
const api = new Api(import.meta.env.ADMS_API_ORIGIN);

createRoot(place).render(
  <StrictMode>
    <ApiContext.Provider value={api}>
      <Routed>
        <App api={api} />
      </Routed>
    </ApiContext.Provider>
  </StrictMode>,
);
