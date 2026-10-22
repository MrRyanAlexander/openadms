// Changing one's own password (ARCHITECTURE §6; ADR-410; NIST SP 800-63B §3.1.1): the current one,
// then the new one twice, so a slip of the keyboard is caught here. What the firm's rules ask of a
// password (its length, never a breached or easily guessed one) is the server's to say: its words
// are shown as they come. The person's other sessions end; this one carries on.
import { changePasswordEndpoint } from '@open-adms/contracts';
import { Banner, Button, TextEntry } from '@open-adms/look';
import { useState } from 'react';

import type { NotAnswered } from '../api.ts';
import { trouble, useApi } from '../reading.tsx';
import { words } from '../words.ts';

export function PasswordForm({ onChanged }: { readonly onChanged: () => void }) {
  const api = useApi();
  const said = words.password;
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{
    field: 'current' | 'new' | 'again';
    words: string;
  } | null>(null);
  const [failed, setFailed] = useState<NotAnswered | null>(null);

  const change = async () => {
    setFailed(null);
    setProblem(null);
    if (password !== again) {
      setProblem({ field: 'again', words: said.mismatch });
      return;
    }
    setBusy(true);
    const reply = await api.ask(changePasswordEndpoint, { body: { current, password } });
    setBusy(false);
    if (reply.kind === 'answered') {
      setCurrent('');
      setPassword('');
      setAgain('');
      onChanged();
      return;
    }
    if (reply.kind === 'refused' && reply.code === 'PASSWORD_WRONG') {
      setProblem({ field: 'current', words: said.wrong });
    } else if (reply.kind === 'refused' && reply.code === 'PASSWORD_UNCHANGED') {
      setProblem({ field: 'new', words: said.unchanged });
    } else if (reply.kind === 'refused' && reply.code.startsWith('PASSWORD_')) {
      setProblem({ field: 'new', words: trouble(reply) });
    } else {
      setFailed(reply);
    }
  };

  const problemOf = (field: 'current' | 'new' | 'again') =>
    problem?.field === field ? problem.words : undefined;
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        void change();
      }}
    >
      <TextEntry
        label={said.current}
        value={current}
        onChange={setCurrent}
        secret
        autoComplete="current-password"
        required
        problem={problemOf('current')}
      />
      <TextEntry
        label={said.new}
        value={password}
        onChange={setPassword}
        secret
        autoComplete="new-password"
        hint={said.hint}
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
      {failed === null ? null : (
        <Banner tone="problem" announced>
          <p>{trouble(failed)}</p>
        </Banner>
      )}
      <div className="form-actions">
        <Button main type="submit" busy={busy}>
          {busy ? said.changing : said.change}
        </Button>
      </div>
    </form>
  );
}
