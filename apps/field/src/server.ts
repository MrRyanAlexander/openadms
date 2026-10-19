// The firm's API, the one server the app talks to (AC-11-01; ADR-565): asked at the origin the
// build names, by the endpoints of `packages/contracts`, each answer read by its own schema
// before anything of it is used (MASWE-0050). It sends no cookie and follows no redirect. A
// phone's token goes as `Authorization: Bearer` (ADR-440), and the session of the monitor signed in
// on it beside it in the contracts' header (ADR-443), neither kept here: the phone's identity and
// its monitor hand them in with each request (phone/identity.ts, phone/monitor.ts).
import {
  errorAnswerSchema,
  healthEndpoint,
  monitorSessionHeader,
  type AnswerOf,
  type Endpoint,
  type ErrorCode,
} from '@open-adms/contracts';

// What a request came to: the endpoint's answer, read by its schema; a refusal, by its code
// (and how long to wait, where it says); no answer at all, which on a phone is no signal; or an
// answer that no schema reads, which the phone takes for nothing.
export type Reply<E extends Endpoint> =
  | { readonly kind: 'answered'; readonly answer: AnswerOf<E> }
  | { readonly kind: 'refused'; readonly code: ErrorCode; readonly waitSeconds?: number }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'unreadable' };

// What a request came to, but an answer: the same for every endpoint.
export type NotAnswered = Exclude<Reply<Endpoint>, { readonly kind: 'answered' }>;

// Something that asks the server as one caller, its token (and any session) already beside what
// it sends: the monitor signed in, or the master user at the phone for one act.
export type Sender = <E extends Endpoint>(
  served: E,
  asking?: Omit<Asking, 'token' | 'session'>,
) => Promise<Reply<E>>;

export interface Asking {
  // The endpoint's path parameters, by name.
  readonly ids?: Readonly<Record<string, string>>;
  // Its body, sent as JSON.
  readonly json?: unknown;
  // A proof's token, sent as `Authorization: Bearer`.
  readonly token?: string;
  // The monitor's session token, sent beside it in the contracts' header.
  readonly session?: string;
}

export class Server {
  readonly origin: string;

  constructor(origin: string) {
    this.origin = origin;
  }

  // Whether the API answers now. Nothing waits on it: a phone with no signal works all day.
  async answers(): Promise<boolean> {
    return (await this.ask(healthEndpoint)).kind === 'answered';
  }

  async ask<E extends Endpoint>(served: E, asking: Asking = {}): Promise<Reply<E>> {
    const path = served.path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_, name: string) => {
      const id = asking.ids?.[name];
      if (id === undefined) throw new Error(`${served.name} is asked without its ${name}.`);
      return encodeURIComponent(id);
    });
    const headers: Record<string, string> = { accept: 'application/json' };
    if (asking.json !== undefined) headers['content-type'] = 'application/json';
    if (asking.token !== undefined) headers['authorization'] = `Bearer ${asking.token}`;
    if (asking.session !== undefined) headers[monitorSessionHeader] = asking.session;
    let answer: Response;
    try {
      answer = await fetch(new URL(path, this.origin), {
        method: served.method,
        headers,
        ...(asking.json === undefined ? {} : { body: JSON.stringify(asking.json) }),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
      });
    } catch {
      return { kind: 'unreachable' };
    }
    let body: unknown;
    try {
      body = await answer.json();
    } catch {
      return { kind: 'unreadable' };
    }
    if (answer.ok) {
      const read = served.answer.safeParse(body);
      return read.success
        ? { kind: 'answered', answer: read.data as AnswerOf<E> }
        : { kind: 'unreadable' };
    }
    const refused = errorAnswerSchema.safeParse(body);
    if (!refused.success) return { kind: 'unreadable' };
    const { code, retryAfterSeconds } = refused.data;
    return retryAfterSeconds === undefined
      ? { kind: 'refused', code }
      : { kind: 'refused', code, waitSeconds: retryAfterSeconds };
  }
}
