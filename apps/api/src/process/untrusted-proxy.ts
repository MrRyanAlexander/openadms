// A proxy the API doesn't trust, seen (ARCHITECTURE §6, Abuse; AC-10-116; ADR-416, 549; the
// Phase 2 audit's F10). Every rate limit and every count of refused tries is kept by the caller's
// address, and the API believes a proxy's word for it (`X-Forwarded-For`) only from one named in
// `ADMS_TRUSTED_PROXIES`. Behind a load balancer the firm didn't name, every caller is the
// balancer's one address: thirty refused tries anywhere would keep the whole firm out of signing
// in, a reset and the master passcode for an hour. That can't be told from the settings alone, so
// the API says it when it sees it: a request that carries the header, from an address it doesn't
// believe, is logged as a warning, at most once in the policy's window for the address counts
// (`SIGN_IN_ADDRESS_WINDOW_MINUTES`), naming the setting and never an address. Nothing is refused:
// the request is answered as the one address it came from.
import type { FastifyRequest } from 'fastify';

import type { Clock } from '../setup/setup-service.ts';

export class UntrustedProxy {
  private readonly clock: Clock;
  private readonly everyMs: number;
  private lastSaid: number | undefined;

  constructor(clock: Clock, everyMinutes: number) {
    this.clock = clock;
    this.everyMs = everyMinutes * 60_000;
  }

  // Whether this request came through a proxy the API doesn't believe, and the warning is due.
  seen(request: Pick<FastifyRequest, 'headers' | 'ip' | 'socket'>): boolean {
    if (request.headers['x-forwarded-for'] === undefined) return false;
    // A proxy the API believes gives the caller's address in place of its own.
    if (request.ip !== request.socket.remoteAddress) return false;
    const now = this.clock.now().getTime();
    if (this.lastSaid !== undefined && now - this.lastSaid < this.everyMs) return false;
    this.lastSaid = now;
    return true;
  }
}
