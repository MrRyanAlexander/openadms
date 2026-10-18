// What the field app's page is allowed (ARCHITECTURE §6, Output; AC-11-61; ADR-565): its content
// security policy, said once here and read by the build (vite.config.ts, the page's own policy)
// and by the tests that hold Caddy's header to it. The page runs no script but its own bundle,
// makes no HTML from a string (Trusted Types, with no policy to make one), loads nothing of
// another origin, and talks to one server, the firm's API: nothing else of the stack's, and no
// outside service (AC-11-01, AC-11-69).

// The API the app talks to: the build's, never the page's choice. The local stack's unless the
// build is told another (`ADMS_FIELD_API_ORIGIN`, a firm's own API, for its own build): an HTTPS
// origin and nothing more, written as a browser writes one.
export const localApiOrigin = 'https://api.adms.localhost';

export function apiOriginOf(environment: Readonly<Record<string, string | undefined>>): string {
  const stated = environment['ADMS_FIELD_API_ORIGIN'];
  if (stated === undefined || stated === '') return localApiOrigin;
  let origin: string | undefined;
  try {
    const url = new URL(stated);
    origin =
      url.protocol === 'https:' &&
      url.origin === stated &&
      /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(url.hostname)
        ? url.origin
        : undefined;
  } catch {
    origin = undefined;
  }
  if (origin === undefined) {
    throw new Error(
      'ADMS_FIELD_API_ORIGIN must be the API’s HTTPS origin alone, as https://api.example.org.',
    );
  }
  return origin;
}

// The policy a page can state itself (the build writes it into index.html, so the native builds,
// whose WebView no server answers for, keep it too).
export function pagePolicy(apiOrigin: string): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    `connect-src ${apiOrigin}`,
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "require-trusted-types-for 'script'",
    "trusted-types 'none'",
  ].join('; ');
}

// The prototype's page (task 3.1.4, prototype/): the app's own policy, with no server to talk to.
export const prototypePolicy = pagePolicy("'none'");

// The policy a server sends with the page: the same, and nothing may frame it, which only a
// header can say.
export function servedPolicy(apiOrigin: string): string {
  return `${pagePolicy(apiOrigin)}; frame-ancestors 'none'`;
}

// The other headers the browser build is served with (infra/local/Caddyfile), beside the
// stack's own (HSTS, nosniff, no referrer). The phone's camera, place and microphone are off
// until the screen that needs one is built (C176).
export const servedHeaders = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'x-frame-options': 'DENY',
} as const;
