// The back office's page policy and headers, said once (page.ts; ARCHITECTURE §6, Output): Caddy
// serves the build with them word for word, and the build writes the same policy into the page. The
// API's origin is the build's, and only an HTTPS origin is taken.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { apiOriginOf, localApiOrigin, pagePolicy, servedHeaders, servedPolicy } from '../page.ts';

const repository = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// The back office's site in the stack's Caddyfile, and the headers it sets on every answer.
function caddySite(name = 'office'): string {
  const caddyfile = readFileSync(join(repository, 'infra/local/Caddyfile'), 'utf8');
  const site = new RegExp(String.raw`^${name}\.adms\.localhost \{\n([\s\S]*?)\n\}$`, 'm');
  return site.exec(caddyfile)?.[1] ?? '';
}

function caddyHeaders(name = 'office'): Record<string, string> {
  const block = /\n\theader \{\n([\s\S]*?)\n\t\}/.exec(`\n${caddySite(name)}`)?.[1] ?? '';
  return Object.fromEntries(
    block
      .split('\n')
      .map((line) => /^\t\t([A-Za-z-]+) "(.*)"$/.exec(line))
      .filter((found) => found !== null)
      .map((found) => [found[1]?.toLowerCase() ?? '', found[2] ?? '']),
  );
}

describe('the back office’s page policy', () => {
  it('is the one Caddy serves the build with, word for word, beside the page’s other headers', () => {
    expect(caddyHeaders()).toEqual({
      'content-security-policy': servedPolicy(localApiOrigin),
      ...servedHeaders,
    });
  });

  it('answers every path that names no file with the page, so a reload keeps its screen', () => {
    expect(caddySite()).toContain('\ttry_files {path} /index.html');
  });

  it('is the same for the build of its browser tests’ own world, whose one server is the stories’ API', () => {
    expect(caddyHeaders('office-world')).toEqual({
      'content-security-policy': servedPolicy('https://stories.adms.localhost'),
      ...servedHeaders,
    });
    expect(caddySite('office-world')).toContain('\ttry_files {path} /index.html');
  });

  it('lets in no script but its own, no HTML made from a string, one server to talk to, and images only of its own or from bytes it fetched', () => {
    const policy = pagePolicy('https://api.adms.localhost');
    const directives = new Map(
      policy.split('; ').map((directive) => {
        const [name = '', ...values] = directive.split(' ');
        return [name, values.join(' ')];
      }),
    );
    expect(directives.get('default-src')).toBe("'none'");
    expect(directives.get('script-src')).toBe("'self'");
    expect(directives.get('style-src')).toBe("'self'");
    expect(directives.get('img-src')).toBe("'self' blob:");
    expect(directives.get('connect-src')).toBe('https://api.adms.localhost');
    expect(directives.get('require-trusted-types-for')).toBe("'script'");
    expect(directives.get('trusted-types')).toBe("'none'");
    expect(policy).not.toMatch(/unsafe-|data:|\*/);
    expect(policy).not.toContain('frame-ancestors');
    expect(servedPolicy('https://api.adms.localhost')).toBe(`${policy}; frame-ancestors 'none'`);
  });

  it('asks for no camera, place, microphone, payment or USB', () => {
    expect(servedHeaders['permissions-policy']).toBe(
      'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
    );
  });
});

describe('the API the back office talks to', () => {
  it('is the local stack’s unless the build is told another HTTPS origin, and nothing else', () => {
    expect(apiOriginOf({})).toBe('https://api.adms.localhost');
    expect(apiOriginOf({ ADMS_OFFICE_API_ORIGIN: 'https://api.gates-dr.example' })).toBe(
      'https://api.gates-dr.example',
    );
    for (const wrong of [
      'http://api.gates-dr.example',
      'https://api.gates-dr.example/',
      'https://api.gates-dr.example/sessions',
      'not a url',
    ]) {
      expect(() => apiOriginOf({ ADMS_OFFICE_API_ORIGIN: wrong })).toThrow(
        'ADMS_OFFICE_API_ORIGIN must be',
      );
    }
  });
});
