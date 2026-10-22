// The firm's API, the one server the page talks to (ARCHITECTURE §6, §14): asked at the origin the
// build names, by the endpoints of `packages/contracts`, each answer read by its own schema before
// anything of it is used. The page never works an answer out: what it shows is what the API said.
//
// - **The session is the API's cookies** (`__Host-`, HttpOnly, Secure, SameSite), sent with every
//   call and never read here; the page holds only the session's CSRF value, in memory, and sends
//   it with every call that isn't a GET (OWASP ASVS 5.0 3.5.1). A page loaded anew asks for it
//   with the refresh token's cookie (`GET /sessions/csrf`).
// - **The access token runs out in five minutes**: a call answered `NOT_SIGNED_IN` gets new
//   tokens with the refresh token, once for all the calls waiting on it, and is sent again once.
//   Where the session itself has ended, the page is told (`onEnded`) and shows the sign-in.
// - **A refusal keeps the API's words**: its code, and where the domain's rules or the database
//   refused, its `reason` and plain `message`, shown beside what it names.
// - **A file** (a photograph, an export, a PDF) is read as bytes with the same cookies, for the
//   page to show or hand to the browser to save; never opened as a page of the API's.
import {
  csrfAnswerSchema,
  csrfHeader,
  errorAnswerSchema,
  refreshSessionEndpoint,
  sessionCsrfEndpoint,
  type AnswerOf,
  type BodyOf,
  type Endpoint,
  type ErrorCode,
  type ParamsOf,
  type QueryOf,
} from '@open-adms/contracts';

// What a request came to: the endpoint's answer, read by its schema; a refusal, with the API's
// words; no answer at all; or an answer no schema reads.
export type Reply<E extends Endpoint> =
  | { readonly kind: 'answered'; readonly answer: AnswerOf<E> }
  | Refused
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'unreadable' };

export interface Refused {
  readonly kind: 'refused';
  readonly code: ErrorCode;
  readonly message?: string;
  readonly reason?: string;
  readonly waitSeconds?: number;
}

export type NotAnswered = Exclude<Reply<Endpoint>, { readonly kind: 'answered' }>;

// What a request sends, each part as its endpoint's schema types it.
export interface Asking<E extends Endpoint> {
  readonly params?: ParamsOf<E>;
  readonly query?: QueryOf<E>;
  readonly body?: BodyOf<E>;
  // A file's bytes, sent as they are, where the endpoint takes one.
  readonly bytes?: { readonly data: Blob; readonly type: string };
}

// A file read from the API: its bytes, with its type and the name it is saved under.
export interface ReadFile {
  readonly kind: 'file';
  readonly blob: Blob;
  readonly name: string | null;
}

export class Api {
  readonly origin: string;
  private csrf: string | null = null;
  private refreshing: Promise<boolean> | null = null;
  // Told once a session has ended under the page: signed out, run out, revoked.
  onEnded: () => void = () => undefined;

  constructor(origin: string) {
    this.origin = origin;
  }

  // The session's CSRF value, from an answer that holds one (a sign-in, a refresh, who is signed
  // in), or none once signed out.
  keepCsrf(csrf: string | null): void {
    this.csrf = csrf;
  }

  // A page loaded anew: the CSRF value of the session its refresh token belongs to, if any.
  async resumed(): Promise<boolean> {
    const reply = await this.send(sessionCsrfEndpoint, {});
    if (reply.kind !== 'answered') return false;
    this.csrf = csrfAnswerSchema.parse(reply.answer).csrf;
    return true;
  }

  async ask<E extends Endpoint>(served: E, asking: Asking<E> = {}): Promise<Reply<E>> {
    const first = await this.send(served, asking);
    if (first.kind !== 'refused' || first.code !== 'NOT_SIGNED_IN' || !this.needsSession(served)) {
      return first;
    }
    if (!(await this.refreshed())) {
      this.onEnded();
      return first;
    }
    const again = await this.send(served, asking);
    if (again.kind === 'refused' && again.code === 'NOT_SIGNED_IN') this.onEnded();
    return again;
  }

  // A file the endpoint answers with, as bytes; or why not.
  async file<E extends Endpoint>(
    served: E,
    asking: Asking<E> = {},
  ): Promise<ReadFile | NotAnswered> {
    let answer = await this.fetched(served, asking);
    if (answer instanceof Response && answer.status === 401 && (await this.refreshed())) {
      answer = await this.fetched(served, asking);
    }
    if (!(answer instanceof Response)) return answer;
    if (!answer.ok) return this.refusal(answer);
    const disposition = answer.headers.get('content-disposition') ?? '';
    const named = /filename="([^"]+)"/.exec(disposition)?.[1] ?? null;
    return { kind: 'file', blob: await answer.blob(), name: named };
  }

  private needsSession(served: Endpoint): boolean {
    return served.access === 'SIGNED_IN';
  }

  // New tokens with the refresh token, once for every call waiting on them.
  private refreshed(): Promise<boolean> {
    this.refreshing ??= this.send(refreshSessionEndpoint, {})
      .then((reply) => {
        if (reply.kind !== 'answered') return false;
        this.csrf = reply.answer.csrf;
        return true;
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  private async send<E extends Endpoint>(served: E, asking: Asking<E>): Promise<Reply<E>> {
    const answer = await this.fetched(served, asking);
    if (!(answer instanceof Response)) return answer;
    if (!answer.ok) return this.refusal(answer);
    let body: unknown;
    try {
      body = await answer.json();
    } catch {
      return { kind: 'unreadable' };
    }
    const read = served.answer.safeParse(body);
    return read.success
      ? { kind: 'answered', answer: read.data as AnswerOf<E> }
      : { kind: 'unreadable' };
  }

  private async fetched<E extends Endpoint>(
    served: E,
    asking: Asking<E>,
  ): Promise<Response | { readonly kind: 'unreachable' }> {
    const params = (asking.params ?? {}) as Readonly<Record<string, string>>;
    const path = served.path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_, name: string) => {
      const id = params[name];
      if (id === undefined) throw new Error(`${served.name} is asked without its ${name}.`);
      return encodeURIComponent(id);
    });
    const url = new URL(path, this.origin);
    const query = (asking.query ?? {}) as Readonly<Record<string, string | undefined>>;
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(name, value);
    }
    const headers: Record<string, string> = { accept: 'application/json' };
    if (served.method !== 'GET' && this.csrf !== null) headers[csrfHeader] = this.csrf;
    let body: BodyInit | undefined;
    if (asking.bytes !== undefined) {
      headers['content-type'] = asking.bytes.type;
      body = asking.bytes.data;
    } else if (asking.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(asking.body);
    }
    try {
      return await fetch(url, {
        method: served.method,
        headers,
        ...(body === undefined ? {} : { body }),
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
      });
    } catch {
      return { kind: 'unreachable' };
    }
  }

  private async refusal(answer: Response): Promise<Refused | { readonly kind: 'unreadable' }> {
    let body: unknown;
    try {
      body = await answer.json();
    } catch {
      return { kind: 'unreadable' };
    }
    const refused = errorAnswerSchema.safeParse(body);
    if (!refused.success) return { kind: 'unreadable' };
    const { code, message, reason, retryAfterSeconds } = refused.data;
    return {
      kind: 'refused',
      code,
      ...(message === undefined ? {} : { message }),
      ...(reason === undefined ? {} : { reason }),
      ...(retryAfterSeconds === undefined ? {} : { waitSeconds: retryAfterSeconds }),
    };
  }
}
