// The two cookies of a back-office session (ARCHITECTURE §6, Back-office sessions; AC-10-09;
// T-14, T-15; ADR-408; NIST SP 800-63B-4 §5.1.1; ASVS 3.3.1…3.3.4). Each is `HttpOnly`, so no
// page script reads it; `Secure`, so it travels over HTTPS only; `SameSite=Strict`, so a browser
// sends it only from a page of the firm's own site; and named `__Host-`, which a browser takes
// only with `Secure`, `Path=/` and no `Domain`: it belongs to the API's own host and no other. A
// cookie's age is only a courtesy to the browser: the server ends a session itself.
export const accessCookie = '__Host-adms-access';
export const refreshCookie = '__Host-adms-refresh';

const attributes = 'Path=/; HttpOnly; Secure; SameSite=Strict';

export function cookieSet(name: string, value: string, ageSeconds: number): string {
  return `${name}=${value}; Max-Age=${String(ageSeconds)}; ${attributes}`;
}

// What takes both cookies out of the browser.
export const cookiesCleared: readonly string[] = [
  cookieSet(accessCookie, '', 0),
  cookieSet(refreshCookie, '', 0),
];

// A request's cookies, by name. One sent twice is taken as not sent: nothing guesses which.
export function cookiesOf(header: string | undefined): ReadonlyMap<string, string> {
  const cookies = new Map<string, string>();
  const twice = new Set<string>();
  for (const sent of (header ?? '').split(';')) {
    const pair = sent.trim();
    const at = pair.indexOf('=');
    if (at < 1) continue;
    const name = pair.slice(0, at).trim();
    if (cookies.has(name)) twice.add(name);
    cookies.set(name, pair.slice(at + 1).trim());
  }
  for (const name of twice) cookies.delete(name);
  return cookies;
}
