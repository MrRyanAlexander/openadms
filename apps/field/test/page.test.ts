// The page's policy and headers, said once (page.ts; AC-11-61; ADR-565): Caddy serves the browser
// build with them word for word, and the build writes the same policy into the page itself. The
// API's origin is the build's, and only an HTTPS origin is taken.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { apiOriginOf, localApiOrigin, pagePolicy, servedHeaders, servedPolicy } from '../page.ts';

const repository = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// The field app's site in the stack's Caddyfile, and the headers it sets on every answer.
function caddyHeaders(): Record<string, string> {
  const caddyfile = readFileSync(join(repository, 'infra/local/Caddyfile'), 'utf8');
  const site = /^field\.adms\.localhost \{\n([\s\S]*?)\n\}$/m.exec(caddyfile)?.[1] ?? '';
  const block = /\n\theader \{\n([\s\S]*?)\n\t\}/.exec(`\n${site}`)?.[1] ?? '';
  return Object.fromEntries(
    block
      .split('\n')
      .map((line) => /^\t\t([A-Za-z-]+) "(.*)"$/.exec(line))
      .filter((found) => found !== null)
      .map((found) => [found[1]?.toLowerCase() ?? '', found[2] ?? '']),
  );
}

describe('AC-11-61 the page’s policy', () => {
  it('is the one Caddy serves the browser build with, word for word, beside the page’s other headers', () => {
    expect(caddyHeaders()).toEqual({
      'content-security-policy': servedPolicy(localApiOrigin),
      ...servedHeaders,
    });
  });

  it('lets in no script but the app’s own, no HTML made from a string, and one server to talk to', () => {
    const policy = pagePolicy('https://api.adms.localhost');
    const directives = new Map(
      policy.split('; ').map((directive) => {
        const [name = '', ...values] = directive.split(' ');
        return [name, values.join(' ')];
      }),
    );
    expect(directives.get('default-src')).toBe("'none'");
    expect(directives.get('script-src')).toBe("'self'");
    expect(directives.get('connect-src')).toBe('https://api.adms.localhost');
    expect(directives.get('require-trusted-types-for')).toBe("'script'");
    expect(directives.get('trusted-types')).toBe("'none'");
    expect(policy).not.toMatch(/unsafe-|data:|blob:|\*/);
    // Framing is a header's to refuse; a page's own policy can't say it.
    expect(policy).not.toContain('frame-ancestors');
    expect(servedPolicy('https://api.adms.localhost')).toBe(`${policy}; frame-ancestors 'none'`);
  });
});

describe('the API the field app talks to', () => {
  it('is the local stack’s unless the build is told another', () => {
    expect(apiOriginOf({})).toBe('https://api.adms.localhost');
    expect(apiOriginOf({ ADMS_FIELD_API_ORIGIN: '' })).toBe('https://api.adms.localhost');
    expect(apiOriginOf({ ADMS_FIELD_API_ORIGIN: 'https://api.gates-dr.example' })).toBe(
      'https://api.gates-dr.example',
    );
    expect(apiOriginOf({ ADMS_FIELD_API_ORIGIN: 'https://api.gates-dr.example:8443' })).toBe(
      'https://api.gates-dr.example:8443',
    );
  });

  it.each([
    'http://api.gates-dr.example',
    'https://api.gates-dr.example/',
    'https://api.gates-dr.example/v1',
    'https://API.gates-dr.example',
    'https://*.gates-dr.example',
    'api.gates-dr.example',
    'capacitor://localhost',
  ])('is never %s: an HTTPS origin alone', (stated) => {
    expect(() => apiOriginOf({ ADMS_FIELD_API_ORIGIN: stated })).toThrow(/HTTPS origin alone/);
  });
});
