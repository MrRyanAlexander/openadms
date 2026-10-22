// Setting up two-step sign-in (ARCHITECTURE §6; ADR-170, 412; RFC 6238): the server gives a key for
// the person's authenticator app, shown once, here; a code from the app proves the app holds it,
// and only then does the server keep it. An admin and a manager/analyst must have one; a read-only
// viewer may.
import {
  beginTwoStepSetupEndpoint,
  confirmTwoStepSetupEndpoint,
  type SessionAnswer,
  type TwoStepSetupAnswer,
} from '@open-adms/contracts';
import { Banner, Button, TextEntry } from '@open-adms/look';
import { useState } from 'react';

import type { NotAnswered } from '../api.ts';
import { trouble, useApi } from '../reading.tsx';
import { words } from '../words.ts';

export function TwoStepForm({ onSetUp }: { readonly onSetUp: (session: SessionAnswer) => void }) {
  const api = useApi();
  const said = words.twoStep;
  const [begun, setBegun] = useState<TwoStepSetupAnswer | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState<NotAnswered | null>(null);

  const begin = async () => {
    setFailed(null);
    setBusy(true);
    const reply = await api.ask(beginTwoStepSetupEndpoint);
    setBusy(false);
    if (reply.kind === 'answered') setBegun(reply.answer);
    else setFailed(reply);
  };

  const confirm = async () => {
    if (begun === null) return;
    setRefused(undefined);
    setFailed(null);
    setBusy(true);
    const reply = await api.ask(confirmTwoStepSetupEndpoint, {
      body: { setup: begun.setup, code: code.trim() },
    });
    setBusy(false);
    if (reply.kind === 'answered') {
      api.keepCsrf(reply.answer.csrf);
      onSetUp(reply.answer);
    } else if (reply.kind === 'refused' && reply.code === 'TWO_STEP_REFUSED') {
      setRefused(said.refused);
    } else {
      setFailed(reply);
    }
  };

  if (begun === null) {
    return (
      <div className="form">
        {failed === null ? null : (
          <Banner tone="problem" announced>
            <p>{trouble(failed)}</p>
          </Banner>
        )}
        <div className="form-actions">
          <Button main busy={busy} onPress={() => void begin()}>
            {busy ? said.beginning : said.begin}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        void confirm();
      }}
    >
      <p>{said.keyToType}</p>
      <dl className="facts">
        <dt>{said.secretLabel}</dt>
        <dd className="secret-key">{begun.secret}</dd>
      </dl>
      <p>{said.uri}</p>
      <p className="secret-key">{begun.uri}</p>
      <TextEntry
        label={said.code}
        value={code}
        onChange={setCode}
        autoComplete="one-time-code"
        whole
        longest={6}
        required
        problem={refused}
      />
      {failed === null ? null : (
        <Banner tone="problem" announced>
          <p>{trouble(failed)}</p>
        </Banner>
      )}
      <div className="form-actions">
        <Button main type="submit" busy={busy}>
          {busy ? said.confirming : said.confirm}
        </Button>
      </div>
    </form>
  );
}
