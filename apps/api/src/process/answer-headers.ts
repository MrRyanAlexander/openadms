// What every answer carries, and which pages may read one (ARCHITECTURE §6, Transport, CORS,
// Output; AC-10-04…08; T-15; ADR-098, 391, 392). The headers are the API's own, so they don't
// hang on the proxy a firm puts in front. CORS answers an origin only when it is, whole, one of
// the configured list: no wildcard, no pattern, nothing by ending or hosting domain. An origin off
// the list is told nothing about itself; the browser then keeps the answer from its page.
import { csrfHeader, endpointMethods } from '@open-adms/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';

// An API answer is data, never a page: nothing may frame it, run it, guess its type or keep it.
export const answerHeaders = {
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'cache-control': 'no-store',
} as const;

// The request's id, also as a header: an answer that worked has no body field for it.
export const requestIdHeader = 'x-request-id';

// `door`: asked of every request once its answer has its headers, a browser's asking-first
// included; what it returns refuses the request (a caller over a rate limit, ADR-416).
export function answersWith(
  server: FastifyInstance,
  corsOrigins: readonly string[],
  door: (request: FastifyRequest) => Error | undefined = () => undefined,
): void {
  const listed = new Set(corsOrigins);
  server.addHook('onRequest', (request, reply, done) => {
    void reply.headers({ ...answerHeaders, [requestIdHeader]: request.id, vary: 'Origin' });
    const origin = request.headers.origin;
    const listedOrigin = origin !== undefined && listed.has(origin);
    if (listedOrigin) {
      // A listed origin's page may send the session's cookies with its calls (ADR-408): allowed
      // only beside an origin named whole, never beside a wildcard.
      void reply.headers({
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
        'access-control-expose-headers': `${requestIdHeader}, retry-after`,
      });
    }
    const refused = door(request);
    if (refused !== undefined) {
      done(refused);
      return;
    }
    if (!listedOrigin) {
      done();
      return;
    }
    // A browser asking first whether its page may send the real request.
    if (
      request.method === 'OPTIONS' &&
      request.headers['access-control-request-method'] !== undefined
    ) {
      void reply
        .headers({
          'access-control-allow-methods': endpointMethods.join(', '),
          // The field app's pages send a proven phone's token as Authorization (ADR-440).
          'access-control-allow-headers': `content-type, ${csrfHeader}, authorization`,
        })
        .status(204)
        .send();
      return;
    }
    done();
  });
}
