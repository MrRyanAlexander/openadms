// Reading from the API on a screen, and saying what went wrong in plain words (ARCHITECTURE §14):
// a screen reads what the server answers and never works it out; a refusal's words are the API's
// where it gave any (the domain's rules and the database's constraints say why in `message`), and
// the page's own otherwise.
import type { AnswerOf, Endpoint } from '@open-adms/contracts';
import { Banner } from '@open-adms/look';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import type { Api, Asking, NotAnswered, Reply } from './api.ts';
import { say, words } from './words.ts';

export const ApiContext = createContext<Api | null>(null);

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (api === null) throw new Error('A screen asked for the API outside the app.');
  return api;
}

// What a read has come to so far.
export type Read<T> =
  { readonly kind: 'loading' } | { readonly kind: 'answered'; readonly answer: T } | NotAnswered;

// A read the screen shows, asked again whenever what it asks changes, and on `reload` (what it
// showed staying on the screen until the new answer comes).
export function useRead<E extends Endpoint>(
  served: E,
  asking: Asking<E> | null,
): readonly [Read<AnswerOf<E>>, () => void] {
  const api = useApi();
  const [read, setRead] = useState<Read<AnswerOf<E>>>({ kind: 'loading' });
  const [asked, setAsked] = useState(0);
  const key = asking === null ? null : JSON.stringify(asking);
  // What was last asked: read again on `reload`, the answer shown stays until the new one comes.
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (key === null) return;
    let shown = true;
    if (lastKey.current !== key) setRead({ kind: 'loading' });
    lastKey.current = key;
    void api.ask(served, JSON.parse(key) as Asking<E>).then((reply: Reply<E>) => {
      if (shown) setRead(reply);
    });
    return () => {
      shown = false;
    };
  }, [api, served, key, asked]);
  const reload = useCallback(() => {
    setAsked((count) => count + 1);
  }, []);
  return [read, reload];
}

// What a request that wasn't answered comes to, in plain words.
export function trouble(reply: NotAnswered): string {
  switch (reply.kind) {
    case 'unreachable':
      return words.common.unreachable;
    case 'unreadable':
      return words.common.unreadable;
    case 'refused':
      if (reply.message !== undefined) return reply.message;
      if (reply.code === 'NOT_ALLOWED') return words.common.notAllowed;
      if (reply.code === 'NOT_FOUND' || reply.code === 'UNKNOWN_RECORD') {
        return words.common.notFound;
      }
      if (reply.code === 'LIMITED') {
        return say(words.common.limited, { seconds: reply.waitSeconds ?? 60 });
      }
      return `${words.common.nothingSaved} (${reply.code})`;
  }
}

// A read or a write that didn't go, said on the screen.
export function Trouble({ reply }: { readonly reply: NotAnswered }) {
  return (
    <Banner tone="problem" announced>
      <p>{trouble(reply)}</p>
    </Banner>
  );
}

// A read as a screen shows it: the words while it loads, its trouble, or what it answered.
export function Shown<T>({
  read,
  children,
}: {
  readonly read: Read<T>;
  readonly children: (answer: T) => React.ReactNode;
}) {
  if (read.kind === 'loading') {
    return (
      <p className="quiet" role="status">
        {words.common.loading}
      </p>
    );
  }
  if (read.kind !== 'answered') return <Trouble reply={read} />;
  return <>{children(read.answer)}</>;
}
