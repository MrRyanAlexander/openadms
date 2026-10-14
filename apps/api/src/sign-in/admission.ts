// Who may call an endpoint, asked before anything the request sent is read (ARCHITECTURE §6,
// Back-office sessions, Authorization; AC-02-12, AC-10-12, 15, 16, 27; T-14, T-15; ADR-408, 410,
// 412, 415). An endpoint says who in the contracts (`access`, and for a signed-in person its
// `roles` and the `permission` it takes). A caller who isn't signed in learns nothing of what
// the endpoint takes: the session is checked first, the schemas after.
//
// The person's role and the permissions they hold are read from the database for this request
// (sessions.ts), never from the token: a grant an admin took away a moment ago refuses now. The
// rule itself is the domain's (`Access`); a service behind an endpoint asks again inside its own
// piece of work (ADR-364).
//
// A call that isn't a GET, made on the strength of a cookie, also carries the session's CSRF
// value in a header (NIST SP 800-63B-4 §5.1; ASVS 3.5.1). Another site's page can make a
// browser send the cookies; it can't read the value, and can't set the header without the
// browser first asking the CORS list.
//
// A phone that has proved itself sends its proof's token as `Authorization: Bearer`, never as a
// cookie (ARCHITECTURE §6, Device sessions; AC-10-46; ADR-440): no browser sends that header by
// itself, so such a call needs no CSRF value. The phone is read from the database for this
// request too: a key revoked a moment ago refuses now, whatever the token says.
//
// A monitor signed in on that phone (ADR-443) sends their session's token beside it, in a header
// of its own, never as a cookie: the phone is read first, then the session, both from the
// database on every request, so an archived monitor, a password set anew, a sign-out and a
// revoked key each refuse at once. The session must be that phone's.
//
// Every refusal here is logged (OWASP ASVS 5.0 16.3.2; AC-10-66; ADR-513): the endpoint, the
// refusal's code, and whose call it was where the door knows: a person's id or a phone's, never
// a name, a Monitor ID, a token or anything the request sent.
import {
  csrfHeader,
  monitorSessionHeader,
  type Endpoint,
  type ErrorCode,
} from '@open-adms/contracts';
import { Access } from '@open-adms/domain';
import type { FastifyRequest } from 'fastify';

import type { PhoneProofs, ProvenPhone } from '../phone/phone-proofs.ts';
import type { MonitorOnPhone, PhoneSignIns } from '../phone/phone-sign-ins.ts';
import type { Limits } from '../process/limits.ts';
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
  // The phone that proved itself, on an endpoint open to one.
  readonly phone?: ProvenPhone;
  // The monitor signed in on that phone, on an endpoint open to them.
  readonly monitor?: MonitorOnPhone;
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

// The proven phone a request is from. Only an endpoint whose access is `PROVEN_PHONE` has one.
export function phoneOf(request: object): ProvenPhone {
  const phone = admitted.get(request)?.phone;
  if (phone === undefined) throw new Error('This endpoint has no proven phone.');
  return phone;
}

// The monitor signed in on the phone a request is from. Only an endpoint whose access is
// `MONITOR_ON_PHONE` has one.
export function monitorOf(request: object): MonitorOnPhone {
  const monitor = admitted.get(request)?.monitor;
  if (monitor === undefined) throw new Error('This endpoint has no monitor signed in on a phone.');
  return monitor;
}

const bearer = /^Bearer ([A-Za-z0-9._-]{1,400})$/;

export class Admission {
  private readonly sessions: Sessions;
  private readonly tokens: SessionTokens;
  private readonly limits: Pick<Limits, 'asked' | 'phoneAsked'>;
  private readonly phones: Pick<PhoneProofs, 'proven'>;
  private readonly monitors: Pick<PhoneSignIns, 'onPhone'>;

  constructor(
    sessions: Sessions,
    tokens: SessionTokens,
    limits: Pick<Limits, 'asked' | 'phoneAsked'>,
    phones: Pick<PhoneProofs, 'proven'>,
    monitors: Pick<PhoneSignIns, 'onPhone'>,
  ) {
    this.sessions = sessions;
    this.tokens = tokens;
    this.limits = limits;
    this.phones = phones;
    this.monitors = monitors;
  }

  // Lets the request through, or refuses it with a plain code.
  async admit(endpoint: Endpoint, request: FastifyRequest): Promise<void> {
    if (endpoint.access === 'ANYBODY') return;
    if (endpoint.access === 'PROVEN_PHONE' || endpoint.access === 'MONITOR_ON_PHONE') {
      const sent = request.headers.authorization;
      const phone = await this.phones.proven(bearer.exec(sent ?? '')?.[1]);
      if (phone === undefined) throw refused(request, endpoint, 'PHONE_NOT_PROVEN', 401);
      // Counted for the phone, as well as for its address (ADR-490).
      this.limits.phoneAsked(phone.deviceId);
      if (endpoint.access === 'PROVEN_PHONE') {
        admitted.set(request, { phone });
        return;
      }
      const token = request.headers[monitorSessionHeader];
      const monitor = await this.monitors.onPhone(
        phone.deviceId,
        typeof token === 'string' ? token : undefined,
      );
      if (monitor === undefined) {
        throw refused(request, endpoint, 'NOT_SIGNED_IN', 401, { deviceId: phone.deviceId });
      }
      // Counted for the monitor, as a signed-in person is (ADR-416).
      this.limits.asked(`person ${monitor.userId}`);
      admitted.set(request, { phone, monitor });
      return;
    }
    const cookies = cookiesOf(request.headers.cookie);
    if (endpoint.access === 'REFRESH_TOKEN') {
      const refreshToken = cookies.get(refreshCookie);
      const read = this.tokens.readRefresh(refreshToken);
      if (refreshToken === undefined || read === undefined) {
        throw refused(request, endpoint, 'NOT_SIGNED_IN', 401);
      }
      // Only the token says whose call this is, so it is counted for its session (ADR-416).
      this.limits.asked(`session ${read.sessionId}`);
      this.proven(endpoint, request, read.sessionId, {});
      admitted.set(request, { refreshToken });
      return;
    }
    const caller = await this.sessions.caller(cookies.get(accessCookie));
    if (caller === undefined) throw refused(request, endpoint, 'NOT_SIGNED_IN', 401);
    const who = { userId: caller.userId };
    // Counted for the person, whatever address and whichever of their sessions it came by.
    this.limits.asked(`person ${caller.userId}`);
    this.proven(endpoint, request, caller.sessionId, who);
    if (caller.passwordChangeRequired && endpoint.beforePasswordChange !== true) {
      throw refused(request, endpoint, 'PASSWORD_CHANGE_REQUIRED', 403, who);
    }
    // An admin or a manager/analyst with no authenticator sets one up before anything else.
    if (caller.twoStepSetupRequired && endpoint.beforeTwoStepSetup !== true) {
      throw refused(request, endpoint, 'TWO_STEP_SETUP_REQUIRED', 403, who);
    }
    // Their role, and the permission the endpoint takes, as the database has both now.
    const access = new Access({ role: caller.role, archived: false, granted: caller.granted });
    if (!access.allowed({ roles: endpoint.roles ?? [], permission: endpoint.permission })) {
      throw refused(request, endpoint, 'NOT_ALLOWED', 403, who);
    }
    admitted.set(request, { caller });
  }

  private proven(endpoint: Endpoint, request: FastifyRequest, sessionId: string, who: Whose): void {
    if (endpoint.method === 'GET') return;
    if (!this.tokens.csrfMatches(sessionId, request.headers[csrfHeader])) {
      throw refused(request, endpoint, 'CSRF_REFUSED', 403, who);
    }
  }
}

// Whose call the door refused, where it knows: by id alone.
interface Whose {
  readonly userId?: string;
  readonly deviceId?: string;
}

function refused(
  request: FastifyRequest,
  endpoint: Endpoint,
  code: ErrorCode,
  status: number,
  who: Whose = {},
): Refusal {
  request.log.warn(
    { endpoint: endpoint.name, refused: code, ...who },
    'The door refused a request.',
  );
  return new Refusal(code, status);
}
