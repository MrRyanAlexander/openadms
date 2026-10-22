// What the back office's page is allowed (ARCHITECTURE §6, Output; §14): its content security
// policy, said once here and read by the build (vite.config.ts) and by the test that holds Caddy's
// header to it (test/page.test.ts). The page runs no script but its own bundle, makes no HTML from
// a string (Trusted Types, with no policy to make one), loads nothing of another origin, and talks
// to one server, the firm's API. A photograph is fetched from the API with the session's cookies
// and shown from the bytes the page holds (`blob:`), never opened as a page of the API's; a file
// made for saving (an export, a PDF) is handed to the browser the same way.

// The API the page talks to: the build's, never the page's choice. The local stack's unless the
// build is told another (`ADMS_OFFICE_API_ORIGIN`): an HTTPS origin and nothing more.
export const localApiOrigin = 'https://api.adms.localhost';

export function apiOriginOf(environment: Readonly<Record<string, string | undefined>>): string {
  const stated = environment['ADMS_OFFICE_API_ORIGIN'];
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
      'ADMS_OFFICE_API_ORIGIN must be the API’s HTTPS origin alone, as https://api.example.org.',
    );
  }
  return origin;
}

// The policy the page states itself (the build writes it into index.html).
export function pagePolicy(apiOrigin: string): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' blob:",
    "font-src 'self'",
    `connect-src ${apiOrigin}`,
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "require-trusted-types-for 'script'",
    "trusted-types 'none'",
  ].join('; ');
}

// The policy the server sends with the page: the same, and nothing may frame it.
export function servedPolicy(apiOrigin: string): string {
  return `${pagePolicy(apiOrigin)}; frame-ancestors 'none'`;
}

// The other headers the page is served with (infra/local/Caddyfile), beside the stack's own (HSTS,
// nosniff, no referrer): it asks for no camera, place, microphone, payment or USB.
export const servedHeaders = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'x-frame-options': 'DENY',
} as const;
