---
title: Security
description: How Open ADMS protects evidence that public money is paid on - the standards it is checked against, sign-in and sessions, phones, the database that enforces its own rules - and how to report a vulnerability.
---

Open ADMS keeps evidence that public money is paid on: every ticket, photograph and audited change
may be read in a federal audit or a fraud case years later. **Security comes first, at every layer.**

:::caution[Reporting a vulnerability]
Please report it **privately**, never in a public issue: use GitHub's private vulnerability
reporting on the repository (the **Security** tab, then **Report a vulnerability**). The full policy
is the repository's [SECURITY.md](https://github.com/MrRyanAlexander/openadms/blob/main/SECURITY.md).
:::

## The standards it is checked against

- **OWASP ASVS** (current release), **Level 2**, for the API and the web apps.
- **OWASP MASVS** for the field app.
- **OWASP API Security Top 10.**
- **NIST SP 800-63B** for passwords and authenticators.
- **CIS PostgreSQL Benchmark** for the database's configuration.

## In transit

- **HTTPS everywhere, locally too.** Every hop inside the local stack is TLS: Caddy reaches every
  service over TLS, the API serves HTTPS alone, and Postgres takes TLS alone. TLS 1.2 or later, HSTS
  on. Plain HTTP is redirected for the web apps' pages and refused at the API's address.
- **CORS by an exact allow-list** of origins from configuration: no wildcards, no patterns.
- The web apps send a strict Content Security Policy, `frame-ancestors 'none'`, `nosniff` and a
  referrer policy.

## People: sign-in and sessions

- **Two-step sign-in is required** for admins and managers/analysts (an authenticator app), optional
  for read-only viewers unless the firm requires it.
- **Passwords** are hashed with Argon2id and follow NIST SP 800-63B: length over complexity, known
  breached passwords refused, no forced rotation.
- **Sessions** are a short-lived access token and a rotating refresh token, in `HttpOnly`, `Secure`,
  `SameSite` `__Host-` cookies, never in browser storage; refresh tokens are kept only as hashes and
  can be revoked; cookie-authenticated writes carry a CSRF value. A quiet session ends, and every
  session ends a set time after sign-in.
- **Permissions are checked on the server on every request**, from the database, so a revoked
  permission refuses the very next request. Nobody can grant a permission they don't hold, and the
  last admin can't be removed or locked out.
- **Wrong tries** make a login wait, then lock it; limits by address stop a stranger first. Every
  sign-in, failure, lockout, phone setup and use of the master passcode is a security event.

## Phones

- A phone is **enrolled once** with the master passcode and proves itself before every sync by
  signing a server challenge with its own device key (ECDSA P-256), which never leaves it.
- Monitor credentials work **only on enrolled phones**, never on the web. Offline sign-in checks a
  login list of slow hashes, salted per phone, inside the encrypted store; it waits after 5 wrong
  tries and locks after 10 until the master passcode.
- The phone's store is **encrypted at rest** and **never backed up**. A phone taken out of service
  wipes itself only after the server confirms it holds everything; a lost phone's key is revoked.

## The database enforces its own rules

The database is the last line of defence; it doesn't trust the code above it.

- **A login role per service**, each with only the grants its work needs: the API can't write a
  completed load or a transaction, the worker can't change setup, nobody can change the audit log.
- **No hard deletes** of operational data.
- **The audit log is written by the database itself**, by trigger, for every change, and a write
  with no actor is refused.
- **Row-level security** limits what each read-only viewer can read.
- Constraints carry the rules that keep money right: a pay item's code unique on its project, a
  load's links to its field events unique so it bills once.

## Requests

- Every request body is checked against the shared schema at the boundary; unknown fields are
  refused; size limits apply.
- Rate limits per address, per account and per phone.
- Errors are plain codes: no stack traces or internal errors in responses.
- Logs are structured with a request id, and never hold a secret, a token, a password or full
  personal details.
- Files come in only through their own routes (photographs, a project's map file), checked for type
  and size, a photograph's hash verified, stored outside the web root and never executed.

## The supply chain

- Every dependency is pinned to an exact version, at least seven days old, with a licence compatible
  with Apache-2.0 for what ships (`pnpm licences`).
- No dependency runs an install script unless the workspace allows it by name.
- `pnpm security` runs the dependency audit (every advisory fails it unless accepted by name, with
  why it can't be reached), a secrets scan and the database's grant tests.

## Secrets

Secrets are generated at setup, stored outside the repository (git-ignored env files locally, the
provider's secret store in a cloud), and never logged, printed or committed. The installer never
rotates its secrets on a resume and never prints one.

## Related

- [Install an installation](/get-started/install/)
- [Architecture](/reference/architecture/)
