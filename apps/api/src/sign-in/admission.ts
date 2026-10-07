// Who may call an endpoint, asked before anything the request sent is read (ARCHITECTURE §6,
// Back-office sessions, Authorization; AC-10-12, 15, 16, 27; T-14, T-15; ADR-408, 410). An
// endpoint says who in the contracts (`access`). A caller who isn't signed in learns nothing of
// what the endpoint takes: the session is checked first, the schemas after.
//
// A call that isn't a GET, made on the strength of a cookie, also carries the session's CSRF
// value in a header (NIST SP 800-63B-4 §5.1; ASVS 3.5.1). Another site's page can make a
// browser send the cookies; it can't read the value, and can't set the header without the
// browser first asking the CORS list.
import { csrfHeader, type Endpoint } from '@open-adms/contracts';
import type { FastifyRequest } from 'fastify';

import { Refusal } from '../process/refusal.ts';
import { accessCookie, cookiesOf, refreshCookie } from './session-cookies.ts';
import type { SessionTokens } from './session-tokens.ts';
import type { Caller, Sessions } from './sessions.ts';

// What a controller is handed about its caller.
export interface Admitted {
  // The signed-in person, on an endpoint that asks for one.
  readonly caller?: Caller;
  // The refresh token as it was sent, on an endpoint that works on it.
  readonly refreshToken?: string;
}

const admitted = new WeakMap<object, Admitted>();

// The signed-in person a request is from. Only an endpoint whose access is `SIGNED_IN` has one.
export function callerOf(request: object): Caller {
  const caller = admitted.get(request)?.caller;
  if (caller === undefined) throw new Error('This endpoint has no signed-in caller.');
  return caller;
}

export function refreshTokenOf(request: object): string {
  const token = admitted.get(request)?.refreshToken;
  if (token === undefined) throw new Error('This endpoint has no refresh token.');
  return token;
}

export class Admission {
  private readonly sessions: Sessions;
  private readonly tokens: SessionTokens;

  constructor(sessions: Sessions, tokens: SessionTokens) {
    this.sessions = sessions;
    this.tokens = tokens;
  }

  // Lets the request through, or refuses it with a plain code.
  async admit(endpoint: Endpoint, request: FastifyRequest): Promise<void> {
    if (endpoint.access === 'ANYBODY') return;
    const cookies = cookiesOf(request.headers.cookie);
    if (endpoint.access === 'REFRESH_TOKEN') {
      const refreshToken = cookies.get(refreshCookie);
      const read = this.tokens.readRefresh(refreshToken);
      if (refreshToken === undefined || read === undefined) throw new Refusal('NOT_SIGNED_IN', 401);
      this.proven(endpoint, request, read.sessionId);
      admitted.set(request, { refreshToken });
      return;
    }
    const caller = await this.sessions.caller(cookies.get(accessCookie));
    if (caller === undefined) throw new Refusal('NOT_SIGNED_IN', 401);
    this.proven(endpoint, request, caller.sessionId);
    if (caller.passwordChangeRequired && endpoint.beforePasswordChange !== true) {
      throw new Refusal('PASSWORD_CHANGE_REQUIRED', 403);
    }
    admitted.set(request, { caller });
  }

  private proven(endpoint: Endpoint, request: FastifyRequest, sessionId: string): void {
    if (endpoint.method === 'GET') return;
    if (!this.tokens.csrfMatches(sessionId, request.headers[csrfHeader])) {
      throw new Refusal('CSRF_REFUSED', 403);
    }
  }
}
