# Acceptance scenarios — The API and sync, as a server

✅ ** Approved**: agent-written (task 2.1.1, ADR-379); the user approves. Building doesn't wait
(ADR-230).

← [Acceptance scenarios](README.md) · What they prove: [ARCHITECTURE](../ARCHITECTURE.md) §6, §7.4,
§9, §13 · Who attacks what: [the threat model](../THREAT-MODEL.md)

> Each scenario restates a recorded rule; **From** names it. Values are the example world's
> (`spec/CONVENTIONS.md` §6). How to read the columns: [README](README.md).
>
> **This file has no part page.** Files 01…09 say what the product does for a firm, a monitor
> and the back office. This one says how the server in front of it behaves towards any caller:
> the door, sessions, lockout, the CORS list, limits, what is refused at the boundary, what an
> error and a log say, a phone's proof of itself, uploads and the job queue. It adds no rule to
> the domain (BACKLOG, Phase 2's brief).
>
> **Two parts.** Sections A…L are the new scenarios, `AC-10-01`…`AC-10-56`. Section M lists, by
> ID, every scenario of files 01…09 that has a Phase 2 part, with the task that proves it.

**One more column: Answers.** The checklist item a scenario answers (ARCHITECTURE §16):

| Written | Means |
|---|---|
| **ASVS V6** | OWASP Application Security Verification Standard, Level 2, by chapter: V2 Validation and Business Logic · V3 Web Frontend Security · V4 API and Web Service · V5 File Handling · V6 Authentication · V7 Session Management · V8 Authorization · V11 Cryptography · V12 Secure Communication · V13 Configuration · V14 Data Protection · V15 Secure Coding and Architecture · V16 Security Logging and Error Handling |
| **API1**…**API10** | OWASP API Security Top 10: 1 Broken object level authorization · 2 Broken authentication · 3 Broken object property level authorization · 4 Unrestricted resource consumption · 5 Broken function level authorization · 6 Unrestricted access to sensitive business flows · 7 Server-side request forgery · 8 Security misconfiguration · 9 Improper inventory management · 10 Unsafe consumption of APIs |
| **800-63B** | NIST SP 800-63B, by topic: passwords · rate limiting · authenticator codes · sessions |

The chapters are those of ASVS 5.0 and the Top 10 of 2023, written from memory of both. **Task
2.7.3 reads the published texts and replaces each chapter with its numbered requirement**; which
revision of 800-63B is followed is 2.2.2's ADR (point 3 below).

| Mark in **Proven at** | Meaning |
|---|---|
| **API (2.x.y)** | A test of the API layer (ARCHITECTURE §15), named by this ID, run from the terminal against the local stack over HTTPS; the task is `agent_store/BACKLOG.md`'s |
| **database (2.x.y)** | A test in `packages/db/test`: a table's guard, a grant, a refusal |
| **domain (2.x.y)** | A unit test of a rule in `packages/domain` |
| **story (2.7.x)** | The scenario harness, once its phones go through the real endpoints |
| **back office (Phase 4)** · **field app (Phase 3)** | The rule is recorded; nothing in Phase 2 builds that layer |

**Throughout:** a number that is policy (a lifetime, a count of tries, a limit, a size) is a
policy value, never a literal, and never relaxed to pass a test (invariant 16). No scenario here
states one that nothing records: they are listed under "Left to the task that builds it".

---

## A. The door: HTTPS only

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-10-01 | **Given** the local stack is up, **when** the API's health answer is asked for at `https://api.adms.localhost`, **then** it answers, under a certificate of the stack's own authority; the API publishes no port of its own and is reached only through the proxy | ARCHITECTURE §4, §6 (Transport); ADR-098; BACKLOG C24 · REQ-006 | ASVS V12 · API8 | API (2.1.2) | ✅ 2.1.2 (ADR-385): `apps/api/test/door.test.ts` |
| AC-10-02 | **When** the same address is asked for over plain HTTP, **then** the caller is redirected to HTTPS and nothing is answered over HTTP | ARCHITECTURE §6 (Transport) · REQ-204 | ASVS V12 | API (2.1.2) | ✅ 2.1.2 (ADR-385): `apps/api/test/door.test.ts` |
| AC-10-03 | **When** a caller offers nothing newer than TLS 1.1, **then** no connection is made; TLS 1.2 and 1.3 are taken | ARCHITECTURE §6 (Transport) | ASVS V12 | API (2.1.2) | ✅ 2.1.2 (ADR-385): `apps/api/test/door.test.ts` |
| AC-10-04 | **Given** any answer of the API, **then** it carries HSTS and the security headers ARCHITECTURE §6 names for an answer; the page headers (the content security policy, `frame-ancestors 'none'`) are the web apps' | ARCHITECTURE §6 (Transport, Output) · REQ-204 | ASVS V3, V12 · API8 | API (2.1.3); the web apps' pages: back office (Phase 4) | ✅ the API's answers, 2.1.3 (ADR-392): `apps/api/test/boundary.test.ts`, `door.test.ts`; the web apps' pages: Phase 4 |

## B. The CORS list

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-10-05 | **Given** the API's configuration lists the origin `https://adms.localhost`, **when** a browser page at that origin calls the API, **then** the answer allows exactly that origin, by name | ADR-098; ARCHITECTURE §6 (CORS) · REQ-204 | ASVS V3 · API8 | API (2.1.3) | ✅ 2.1.3 (ADR-391): `apps/api/test/boundary.test.ts`, `door.test.ts` |
| AC-10-06 | **When** a page at `https://evil.example`, an origin not on the list, calls the API, **then** the answer allows no origin, and the browser keeps the answer from that page | ADR-098; ARCHITECTURE §6 (CORS) | ASVS V3 · API8 | API (2.1.3) | ✅ 2.1.3 (ADR-391): `apps/api/test/boundary.test.ts`, `door.test.ts` |
| AC-10-07 | **When** a page at a look-alike origin calls (`https://adms.localhost.evil.example`, or `http://adms.localhost` over plain HTTP), **then** it is treated as any origin off the list: origins are matched whole, never by pattern, ending or hosting domain | ADR-098; ARCHITECTURE §6 (CORS), §17 (Build 1 allowed any `*.netlify.app`) | ASVS V3 · API8 | API (2.1.3) | ✅ 2.1.3 (ADR-391): `apps/api/test/boundary.test.ts`, `door.test.ts` |
| AC-10-08 | **Given** the API's configuration, **then** its origins are a list of exact values read from it: the back office's where it isn't served same-origin, the field app's native origins (`capacitor://localhost`, `https://localhost`) and the browser test build's. A `*` or a pattern is not a value the list takes (a malformed setting, AC-10-55); CORS is never switched off | ADR-098; ARCHITECTURE §4, §6 (CORS) | ASVS V13 · API8 | API (2.1.3) | ✅ 2.1.3 (ADR-391): `apps/api/test/settings.test.ts`, `door.test.ts` |

## C. Back-office sessions

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-10-09 | **When** Dana Reyes signs in to the back office, **then** her access token and her refresh token arrive only as cookies marked `HttpOnly`, `Secure` and `SameSite`; no token is in the body of the answer, so no page script can read or keep one | ARCHITECTURE §6 (Back-office sessions), §17 · REQ-202 | ASVS V3, V7 · API2 · 800-63B sessions | API (2.2.3) | ✅ 2.2.3 (ADR-408): `apps/api/test/sessions.test.ts` (two `__Host-` cookies, each `HttpOnly; Secure; SameSite=Strict`; the body holds who is signed in and the session's CSRF value, which is neither token and opens nothing), `session-tokens.test.ts` |
| AC-10-10 | **Given** Dana is signed in, **then** the server holds her refresh token only as a hash: nothing in the database is the token itself | ARCHITECTURE §6 (Back-office sessions) · REQ-202 | ASVS V7, V11 | database (2.2.1) | ✅ 2.2.1 (ADR-398): `packages/db/test/sign-in.test.ts` (the token itself is refused; nothing kept or audited is a token); a real sign-in writes it so, 2.2.3 (ADR-408): `apps/api/test/sessions.test.ts` |
| AC-10-11 | **When** a person's password hash or authenticator secret is written or changed, **then** the audit log says that it changed and never holds the value, before or after; no read-only viewer reads either | ADR-281 (7); BACKLOG C21 | ASVS V14, V16 | database (2.2.1) | ✅ 2.2.1 (ADR-397): `packages/db/test/sign-in.test.ts` |
| AC-10-12 | **Given** Dana's access token has run past its lifetime, **when** she sends a request with it and nothing else, **then** it is refused; her page gets a new one with her refresh token and carries on | ARCHITECTURE §6 (short-lived access token) · REQ-202 | ASVS V7 · API2 | API (2.2.3) | ✅ 2.2.3 (ADR-408): `apps/api/test/sessions.test.ts`, `session-tokens.test.ts` (five minutes, the policy value `ACCESS_TOKEN_MINUTES`) |
| AC-10-13 | **When** Dana's refresh token is used, **then** she is given a new one and the old one is no longer good: a refresh token is used once | ARCHITECTURE §6 (a rotating refresh token) · REQ-202 | ASVS V7 · 800-63B sessions | API (2.2.3) | ✅ 2.2.3 (ADR-408): `apps/api/test/sessions.test.ts` |
| AC-10-14 | **Given** a refresh token of Dana's was copied, **when** the same token is presented a second time, by her or by whoever copied it, **then** every token that came from that sign-in stops working and she signs in again | ARCHITECTURE §6 (rotating, revocable); BACKLOG task 2.2.3 | ASVS V7 · API2 | API (2.2.3) | ✅ 2.2.3 (ADR-408): `apps/api/test/sessions.test.ts` (the session is revoked, with its reason in the audit log; both cookies cleared) |
| AC-10-15 | **When** Dana signs out, **then** her session is revoked on the server: her cookies, sent again afterwards, are refused | ARCHITECTURE §6 (revocable) · REQ-202 | ASVS V7 · 800-63B sessions | API (2.2.3) | ✅ 2.2.3 (ADR-408): `apps/api/test/sessions.test.ts` |
| AC-10-16 | **Given** Dana is signed in, **when** a page on another site makes her browser send a void for ticket `101031` with her cookies and without what the back office's own page sends with a write, **then** the request is refused and nothing changes | ARCHITECTURE §6 (CSRF protection on cookie-authenticated writes) · REQ-202 | ASVS V3 · API2 | API (2.2.3) | ✅ 2.2.3 (ADR-408): `apps/api/test/sessions.test.ts` (a write of the test's own standing in for the void, which is 2.4.4's endpoint; a change of password; a refresh and a sign-out), `session-tokens.test.ts` |
| AC-10-17 | **When** anybody tries to sign in as the system actor, **then** it is refused: role `SYSTEM` is the worker's own actor, has no password and is never a login | ADR-273 (4); BACKLOG C21 | ASVS V6 · API2 | API (2.2.3) | ✅ 2.2.3 (ADR-409): `apps/api/test/sessions.test.ts`; no password can be kept for it: `packages/db/test/sign-in.test.ts` |

## D. Wrong tries, lockout and what is logged

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-10-18 | **Given** somebody keeps trying Luis Ortega's login with wrong passwords, **then** tries are made to wait longer and longer, and after the policy's count the login is locked: while it is locked the right password is refused too | ARCHITECTURE §6 (Abuse: sign-in back-off and lockout) · REQ-204 | ASVS V6 · API2 · 800-63B rate limiting | API (2.2.3) | ✅ 2.2.3 (ADR-409): `packages/domain/test/sign-in-tries.test.ts` (a wait from the fifth wrong try in a row, 30 seconds and doubling; a lock at the tenth, until the password is set anew), `apps/api/test/sessions.test.ts`, `packages/db/test/sign-in.test.ts` |
| AC-10-19 | **Given** a sign-in that worked, one that failed and a lockout, **then** each is a security event with who, when and from which request; a billing reviewer reading the audit log by domain doesn't read them among the billing entries | ARCHITECTURE §5.3 (domains), §6 (Abuse) · REQ-202b | ASVS V16 | API (2.2.3); where a security event is kept: database (2.2.1) | ✅ 2.2.1 (ADR-399): where one is kept (`packages/db/test/sign-in.test.ts`); 2.2.3 (ADR-408, 409): a real sign-in, a failure and a lockout each write one, in the security domain alone (`apps/api/test/sessions.test.ts`) |
| AC-10-20 | **When** a person's password is set, **then** the server keeps an Argon2id hash of it and nothing else | ARCHITECTURE §6 (Passwords) · REQ-202 | ASVS V6, V11 · 800-63B passwords | database and domain (2.2.2) | ✅ 2.2.2 (ADR-402): `apps/api/test/password-set.test.ts` (an admin sets one: only an Argon2id hash on the person's sign-in record, the audit log holding neither it nor the password), `passwords.test.ts` (the hash); the database's own check: `packages/db/test/sign-in.test.ts` |
| AC-10-21 | **When** a back-office or outside user sets the password `marsh heron delphine ferry`, **then** it is taken: long is enough, and it is never refused for lacking a capital, a digit or a symbol | ARCHITECTURE §6 (length over complexity) | ASVS V6 · 800-63B passwords | domain (2.2.2) | ✅ 2.2.2 (ADR-402): `packages/domain/test/passwords.test.ts`, `project-settings.test.ts` (15 characters at least, a policy value); through the service: `apps/api/test/password-set.test.ts` |
| AC-10-22 | **Given** a phone being enrolled, **when** the master passcode is entered wrong again and again, **then** the server makes each try wait longer; and every use of the master passcode, right or wrong, is a security event | ARCHITECTURE §6 (Abuse), §7.5; BACKLOG task 2.5.1 · REQ-202b, 209 | ASVS V6, V16 · API2 | API (2.5.1, 2.5.4) |  |
| AC-10-23 | **Given** Luis set his password a year ago, **then** nothing makes him change it because time has passed | ARCHITECTURE §6 (no forced rotation) | ASVS V6 · 800-63B passwords | domain (2.2.2) | ✅ 2.2.2 (ADR-402): `packages/domain/test/passwords.test.ts` (no rule and no policy value knows a password's age; no column says when one was set) |
| AC-10-24 | **When** a back-office or outside user sets the password `1q2w3e4r5t6y7u8i`, or the firm sets `password1234` as its master passcode, **then** it is refused as a known breached password; the check asks no outside service *(the person's example changed from `password1234` at the user's word, ADR-407 (3): that one is refused first for being under 15 characters)* | ARCHITECTURE §6 (breached-password screening); BACKLOG C35, task 2.2.2 | ASVS V6 · 800-63B passwords | domain (2.2.2); the master passcode: the installer and API (2.2.2, 2.4.3) | ✅ 2.2.2 (ADR-403): `packages/domain/test/passwords.test.ts`, `apps/api/test/passwords.test.ts` (the release's own list, 46,483 entries; `password1234` is refused as too short first, and as breached wherever the firm lets a password be that short), `password-set.test.ts` and `sessions.test.ts` (`1q2w3e4r5t6y7u8i` refused as breached, as shipped); the master passcode at the installer: `tools/setup/test/secrets.test.ts`; changed through the API: 2.4.3 |
| AC-10-25 | **Given** a firm with no mail server, **when** Luis forgets his password, **then** Dana, an admin, sets him a new one; **given** a firm with mail, he may instead reset it by a message to his own address. Email is never required | ADR-170; ARCHITECTURE §6 | ASVS V6 | API (2.2.2) | ✅ 2.2.5 (ADR-415): Dana's endpoint, `POST /people/:userId/passwords`, `apps/api/test/people.test.ts`; the reset by email and `NO_MAIL`, 2.2.2 (ADR-404, 406): `password-set.test.ts`, `passwords.test.ts`, `door.test.ts` |
| AC-10-26 | **Given** Luis lost the phone that holds his authenticator, **when** Dana clears his two-step sign-in, **then** he sets it up again at his next sign-in and the clearing is a security event. A shipped build holds no seeded account and no known authenticator secret: those are the dev stack's only | ADR-170; BACKLOG task 2.2.4 | ASVS V6 · 800-63B authenticator codes | API (2.2.4) | ✅ 2.2.4 (ADR-412): `apps/api/test/two-step.test.ts`; the shipped folders, `infra/local/test/dev-accounts.test.ts` |

## E. Who may call what

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-10-27 | **Given** any endpoint of the back office, **when** it is called with no session, **then** it is refused; and each endpoint is tried as an admin, a manager/analyst with and without its grant, a monitor, each kind of read-only viewer and nobody, the refusals included | ARCHITECTURE §6 (Authorization), §15 (API); BACKLOG, Phase 2's brief · REQ-201 | ASVS V8 · API5, API9 | API (every task that adds an endpoint; the list read whole: 2.7.3) | in part, 2.2.5 (ADR-415): every signed-in endpoint names its roles (one that doesn't can't be defined) and the door asks them and the permission on each request; the endpoints of the firm's people tried as an admin, a manager/analyst, a read-only viewer and nobody, `apps/api/test/people.test.ts` (a monitor can't sign in here, AC-02-39). The list read whole: 2.7.3 |
| AC-10-28 | **Given** Luis holds *correct* and not *void*, **when** he sends a void for `101031`, **then** the request is refused at the door, and the service behind it would refuse him again inside its own piece of work: the grant is read from the database both times | ARCHITECTURE §6 (Authorization); ADR-364; AC-02-12, AC-08-05 · REQ-201 | ASVS V8 · API5 | API (2.4.4) |  |
| AC-10-29 | **Given** Coastline Haulers' contractor user, **when** they ask for Summit's ticket `101044` by its own id, **then** they get nothing of it; asked for their own `101001`, they get it | ADR-169; ARCHITECTURE §5.5 · REQ-201 | ASVS V8 · API1 | API (2.4.5) |  |
| AC-10-30 | **Given** a read-only viewer's request, **then** the API states that viewer to the database from one shared place before it reads, and reads their money only through the viewer's own view; a read on which no viewer was stated returns nothing | ADR-270 (7), 315; BACKLOG C22, C76 · REQ-201 | ASVS V8, V15 · API1, API3 | API (2.4.5); the database's half: built (`row-level-security.test.ts`, `viewers.test.ts`) |  |
| AC-10-31 | **When** a client user, a contractor user or an auditor sends any write, **then** it is refused: a read-only viewer changes nothing | ADR-050; ARCHITECTURE §5.1 | ASVS V8 · API5 | API (2.4.5); the login's grants: built (`grants.test.ts`) |  |

## F. What an error and a log say

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-10-32 | **Given** Dana signed in with her password and an authenticator code, and a phone was enrolled with the master passcode, **when** the API's log is read, **then** every line is structured and carries its request's id, and none holds a password, a code, a token, a cookie, the master passcode, or a full personal detail (a monitor's phone number, a driver's licence number) | ARCHITECTURE §6 (Logs) · REQ-204 | ASVS V14, V16 · API8 | API (2.1.2, and each task that adds an endpoint: a test reads the log) | in part, 2.1.2 (ADR-385): the log is structured, a request's lines carry its id, and nothing a caller sends or a failure says is in it (`error-filter.test.ts`, `door.test.ts`); a real sign-in, a failed one, a refresh, a change of password and a sign-out, 2.2.3 (ADR-408): `sessions.test.ts`, and a refused sign-in through the container (`door.test.ts`); an authenticator code: 2.2.4; an enrolment: 2.5.1; a sign-in with an authenticator code, a wrong code, a setup and a clearing, 2.2.4 (ADR-412): `two-step.test.ts`, and a code sent through the container (`door.test.ts`) |
| AC-10-33 | **When** something fails inside the server, **then** the caller gets a plain error code and no stack trace, query, file path or internal message | ARCHITECTURE §6 (Output) · REQ-204 | ASVS V16 · API8 | API (2.1.2) | ✅ 2.1.2 (ADR-385): `apps/api/test/error-filter.test.ts`, `door.test.ts` |

## G. The boundary: what is taken in

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-10-34 | **When** a back-office request carries a field its schema doesn't name, **then** the whole request is refused and nothing is saved | ARCHITECTURE §6 (Input) · REQ-004 | ASVS V2 · API3 | API (2.1.3) | ✅ 2.1.3 (ADR-387): `packages/contracts/test/endpoints.test.ts`, `apps/api/test/boundary.test.ts`, `door.test.ts`; no endpoint that saves exists yet, and none can be defined that takes an unnamed field |
| AC-10-35 | **When** any caller sends an amount, a rate, a transaction, a certified capacity or a completed load, **then** nothing takes it: no schema names such a field, no endpoint writes a transaction, a flag or a completed record, and the API's database login couldn't | VISION §5.7; ARCHITECTURE §2, §5.1, §6; invariants 4, 7 · REQ-201 | ASVS V2, V8 · API3, API6 | API (2.4.4, 2.6.1); the login's grants: built (`grants.test.ts`, `derived-records.test.ts`) |  |
| AC-10-36 | **Given** any endpoint, **then** its body, its query and its path are each checked against a schema of `packages/contracts`, and the OpenAPI description is generated from those schemas by one command; the chain fails when the description is out of date | ADR-094; ARCHITECTURE §3, §6 (Input); BACKLOG C23 · REQ-004 | ASVS V2, V4 · API9 | API (2.1.3); the last payload: 2.6.1 | ✅ 2.1.3 (ADR-387, 388): `packages/contracts/test/endpoints.test.ts`, `apps/api/test/boundary.test.ts` (the routes held to the contracts' list; `apps/api/openapi.json` held to what `pnpm openapi` makes); the last payload's schema: 2.6.1 |
| AC-10-37 | **When** Luis sends a correction of `101001`'s load call to 140, or a photograph's label that is blank, **then** the request is refused in plain words by its schema, before any service runs | ARCHITECTURE §5.4 (a load call 0–100); ADR-337; BACKLOG C79, task 2.4.4 | ASVS V2 | API (2.4.4) |  |
| AC-10-38 | **When** Dana sends a second rate for Coastline on `VEG-HAUL-CY-15`, which the database's own constraint refuses, **then** she is told so plainly; the answer is never an internal error | AC-01-80; BACKLOG task 2.4.2 | ASVS V2, V16 | API (2.4.2) |  |

## H. Limits

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-10-39 | **When** a caller sends a body larger than the limit for that endpoint, **then** it is refused before it is read whole | ARCHITECTURE §6 (Input: size limits) · REQ-204 | ASVS V2 · API4 | API (2.1.3) | ✅ 2.1.3 (ADR-389): `apps/api/test/boundary.test.ts`; one limit for every endpoint today, an endpoint's own with the task that needs it |
| AC-10-40 | **Given** one address sending requests faster than the policy allows, or one login tried from many addresses, **then** the caller is limited by address and by login, each on its own count; the counts are policy values | ARCHITECTURE §6 (Abuse); invariant 16 · REQ-204 | ASVS V2 · API4 · 800-63B rate limiting | API (2.2.6) | ✅ 2.2.6 (ADR-416): `packages/domain/test/rate-limits.test.ts` (the rule, the nine policy values and their ranges), `apps/api/test/limits.test.ts` (by address: 429 `LIMITED` with `Retry-After`; by login: the login's own wait, AC-10-18; by signed-in person; one address stopped at its fifth try at one login before the login is touched) |
| AC-10-41 | **Given** a phone held back by a limit in the middle of a sync, **then** it was told "saved" only for what was stored; the rest is still on the phone and is taken at its next try. A limit never loses field work | ARCHITECTURE §6 (per device), §9; ADR-030; AC-05-51 · REQ-204, 308c | API4 | API (2.6.5); the burst: story (2.7.2) |  |
| AC-10-42 | **Given** the API's and the worker's database logins, **then** each has a statement timeout, set by the installer from a policy value and checked by the installer's own check | ARCHITECTURE §5.7; ADR-276 (7); BACKLOG C34 · REQ-208 | ASVS V13 · API4 | database (2.1.4: `configuration.test.ts`) | ✅ 2.1.4 (ADR-394): `packages/db/test/configuration.test.ts`, `actor.test.ts`; `tools/setup/test/policy.test.ts`; `pnpm installer:check` |
| AC-10-43 | **Given** a write the API makes for a request, **then** the audit record the database writes carries that request's id, the same one the log lines carry | ARCHITECTURE §5.3 (the request ID), §6 (Logs); BACKLOG task 2.1.3 | ASVS V16 | API (2.1.3) | ✅ 2.1.3 (ADR-390): `apps/api/test/request-id.test.ts`, `packages/db/test/actor.test.ts` |

## I. A phone's proof of itself

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-10-44 | **When** `P1-COL-1` is enrolled, **then** the server is sent and keeps its public key only; the private key never leaves the phone, and nothing the server holds could sign as it | ARCHITECTURE §7.4 · REQ-202a | ASVS V11 · API2 | API (2.5.1); the key in real secure hardware: field app (Phase 3) |  |
| AC-10-45 | **Given** `P1-COL-1` proved itself at 12:05 by signing the server's challenge, **when** somebody who recorded that exchange sends the same signed answer again, **then** it proves nothing: each sync signs a challenge the server has just made | ARCHITECTURE §7.4, §9 (1) · REQ-202a | ASVS V11 · API2 | API (2.5.1) |  |
| AC-10-46 | **When** a caller that holds no enrolled phone's key tries to sync, **then** nothing it sends is taken. A phone that was merely taken out of service is not such a caller: it still proves itself and its work is received (AC-02-60) | ARCHITECTURE §7.4; ADR-134 · REQ-202a | API2 | API (2.5.1, 2.6.5) |  |

## J. Photographs and files

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-10-47 | **Given** every endpoint, **then** only the media endpoint takes a file, and it checks each file's type and size before it is stored | ARCHITECTURE §6 (Uploads), §11 · REQ-203 | ASVS V5 · API4 | API (2.6.4) |  |
| AC-10-48 | **Given** a stored photograph, **then** it is kept outside anything the web server serves as a page, and is never run: asked for, it comes back as the bytes that were stored | ARCHITECTURE §6 (Uploads) | ASVS V5 | API (2.6.4) |  |
| AC-10-49 | **Given** a photograph already stored, **then** it is one object that is never overwritten or deleted, and the identity the API uses at the store can't delete a bucket | ADR-101, 263; ARCHITECTURE §11; BACKLOG C24 | ASVS V5, V13 | API (2.6.4) |  |

## K. Jobs and the worker's process

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-10-50 | **Given** Luis's correction of `101001`'s load call, **then** the correction and the job that reprocesses `101001` are written in one piece of work: if either fails, neither exists | ARCHITECTURE §3 (jobs transactional with the data), §13; BACKLOG task 2.3.1 · REQ-206 | ASVS V15 | API (2.3.1, 2.3.3) |  |
| AC-10-51 | **Given** every endpoint, **then** none reconciles while its caller waits: a sync, a correction, a renumber, a void, an unvoid, an acceptance, an unlock and a rate or rule change each queue work and answer | ARCHITECTURE §9 (7), §13; AC-05-53, AC-06-02 · REQ-206 | API4 | API (2.3.3, 2.6.2) |  |
| AC-10-52 | **Given** two jobs for P1 waiting at once, **then** the worker's process runs one at a time for that project, under the database's lock, so no group is reconciled twice | ARCHITECTURE §13 (one run per project at a time) · REQ-206 | ASVS V15 | API (2.3.2) |  |
| AC-10-53 | **When** the same job is worked a second time over unchanged field events and setup, **then** nothing is written: no new transaction, no audit record | ARCHITECTURE §13 (Idempotent) | ASVS V15 | API (2.3.2) |  |
| AC-10-54 | **Given** a job that names tickets `101001` and `101003`, **then** the run works those two and no other; ticket `101031`, voided by a person and settled, is not drawn again until it or its setup changes | ADR-360; BACKLOG C71, C75 · REQ-206 | ASVS V15 | API (2.3.2, 2.3.3) |  |

## L. Starting, and who reaches the database

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-10-55 | **When** the API or the worker is started with a setting missing or malformed, **then** it doesn't start, and says which key, never its value | ARCHITECTURE §4 (Secrets); BACKLOG tasks 2.1.2, 2.3.2 | ASVS V13 · API8 | API (2.1.2, 2.3.2) | ✅ the API, 2.1.2 (ADR-385): `apps/api/test/settings.test.ts`; the worker: 2.3.2 |
| AC-10-56 | **Given** the repository, **then** only `packages/db`, `apps/api` and `apps/worker` open a connection to Postgres, and no model is written in SQL by hand | ADR-094; ARCHITECTURE §18; invariant 12 · REQ-205 | ASVS V15 | a check in the chain (2.7.3) |  |

---

## M. Every earlier scenario with a Phase 2 part, and the task that proves it

Read from the **Proven at** column of files 01…09 on 2026-10-07: **48 rows name Phase 2**, 37 of
them as "API (Phase 2)". Their words stay in their own files; nothing here restates or changes
them. One more, AC-06-36, is named by the plan though its row doesn't say "Phase 2".

| ID | Its Phase 2 part, in short | Task | Answers |
|---|---|---|---|
| AC-01-26 | A debris type *Hidden on phones* is left off a phone's lists | 2.5.3 | API3 |
| AC-02-07 | A monitor created on a phone, online, under the master passcode | 2.5.2 (the actor stated: 2.5.1) | ASVS V6 |
| AC-02-08 | An admin creates back-office and outside users; never a monitor there | 2.2.5 | ASVS V8 · API5 |
| AC-02-12 | Permissions read on every request: a revoke bites at once | 2.2.5; each review call: 2.4.4 | ASVS V8 · API5 |
| AC-02-13 | Nobody grants what they don't hold; the last admin stays | 2.2.5 | ASVS V8 · API5 |
| AC-02-14 | An authenticator code: required, optional or none, by kind of user | 2.2.4 ✅ (ADR-412): `apps/api/test/two-step.test.ts`, `packages/domain/test/two-step.test.ts` | ASVS V6 · 800-63B authenticator codes |
| AC-02-18 | Enrolment: online, the master passcode, the device key; each sync signs a challenge | 2.5.1 | ASVS V11 · API2 |
| AC-02-23 | A changed master passcode reaches each phone at its next sync; each use a security event | 2.4.3 (the change), 2.6.2 (the new check sent), 2.5.4 (the uses) | ASVS V6, V16 |
| AC-02-35 | A monitor signs in online and the phone takes their assignment | 2.5.2 | API2 |
| AC-02-37 | What a phone's lists carry, and never carry | 2.5.3 | API3 |
| AC-02-38 | An unplanned assignment arrives, marked | 2.5.4 | ASVS V16 |
| AC-02-39 | A monitor's ID and password refused everywhere but a phone's calls | 2.2.3 (the web), 2.5.2 (a phone's calls) | ASVS V6 · API2 |
| AC-02-41 | The login list: a slow hash per entry, salted for that phone | 2.5.3 | ASVS V11 · 800-63B passwords |
| AC-02-45 | A monitor's own reopen before the shift ends, as the edit log | 2.6.3 | ASVS V16 |
| AC-02-56 | A phone that was dark for a day syncs and all of it is received | 2.6.2; told by the story: 2.7.1 | — |
| AC-02-58 | Sync and turn in: every record confirmed, numbers returned, then the wipe | 2.6.5 | ASVS V14 |
| AC-02-60 | A phone taken out of service is received; what it made after is flagged | 2.6.5 | API2 |
| AC-02-61 | After the confirmed sync and the wipe, the key is revoked and the phone refused | 2.6.5 (the removal itself: 2.4.3) | ASVS V11 · API2 |
| AC-02-69 | The viewer stated on every read | 2.4.5 | ASVS V8 · API1 |
| AC-02-72 | A manager/analyst never reads a monitor's phone number | 2.2.5 | ASVS V14 · API3 |
| AC-02-74 | A read-only viewer's sign-in and their own projects' reads | 2.2.3, 2.2.4 (sign-in ✅ ADR-408, 412: `sessions.test.ts`, `two-step.test.ts`), 2.4.5 (the reads) | ASVS V8 · API1 |
| AC-03-09 | A phone refreshes its lists at any time and picks up a new certification | 2.5.3 | — |
| AC-03-55 | Only an admin revokes a certification | 2.4.4 | ASVS V8 · API5 |
| AC-04-24 | An address looked up for a phone's GPS, through the API | 2.5.3 | API7, API10 |
| AC-04-77 | A photograph's file, kept and never overwritten | 2.6.4 | ASVS V5 |
| AC-04-102 | Who may mark a photograph removed, and put it back | 2.4.4 (`Corrections`) | ASVS V8 · API5 |
| AC-04-103 | Who may label a photograph | 2.4.4 (`Corrections`) | ASVS V8 · API5 |
| AC-05-01 | A phone syncs whenever it has a connection | 2.6.2; told by the story: 2.7.1 | — |
| AC-05-03 | A sync begins with the phone's proof and its clock | 2.5.1, 2.6.2 | ASVS V11 · API2 |
| AC-05-04 | The clock difference kept with the sync | 2.6.2 | ASVS V16 |
| AC-05-05 | Records first, photographs after | 2.6.2, 2.6.4 | API4 |
| AC-05-08 | The edit log written to the audit log under the monitor | 2.6.3 | ASVS V16 |
| AC-05-09 | A resumable upload, its fingerprint checked | 2.6.4 | ASVS V5 |
| AC-05-16 | The idempotency ledger's own records | 2.6.2 | ASVS V2 |
| AC-05-20 | A quarantined record answered "not saved", with the reason | 2.6.2 | — |
| AC-05-40 | An unplanned assignment's own arrival | 2.5.4 | ASVS V16 |
| AC-05-45 | Each record its own answer | 2.6.2 | — |
| AC-05-48 | Fresh lists, a setup version and any new passcode check at each sync | 2.5.3, 2.6.2 | API3 |
| AC-05-51 | Every phone of a project at once: each record stored once, none lost | 2.7.2 | API4 |
| AC-05-53 | Reconciliation queued, never waited for | 2.3.3, 2.6.2 | API4 |
| AC-05-56 | The refusal after a confirmed sync and wipe | 2.6.5 | API2 |
| AC-06-02 | What a reviewer's action queues | 2.3.3 | ASVS V15 |
| AC-06-03 | What a setup change queues: the un-invoiced tickets it touches | 2.3.3 | ASVS V15 |
| AC-06-58 | The clock difference and its threshold as a policy value | 2.6.2 | ASVS V16 |
| AC-07-91 | Nothing sent to a phone carries a rate, a load's code, a rule or a transaction | 2.5.3 | API3 |
| AC-08-05 | The refusal of a reviewer's action without its grant, at the request | 2.4.4 | ASVS V8 · API5 |
| AC-08-06 | A monitor's reopen reprocesses the ticket; refused after the shift ends | 2.6.3 | ASVS V8 |
| AC-09-18 | Unlocking is a grant of its own | 2.2.5, 2.4.4 | ASVS V8 · API5 |
| *AC-06-36* | *A certification made after a field event scanned its number is linked to it again and its tickets queued (BACKLOG C83)* | *2.3.3* | — |

**Every one of the 48 has a task, and so has each of this file's 56.** A scenario is marked
passing in its own file, from a run that was seen, by the task named.

---

## The count

| | Scenarios |
|---|---|
| Written in this file (A…L) | **56** |
| Passing | **32** (AC-10-25; task 2.2.5, ADR-415; AC-10-01, 02, 03, 33, 55; task 2.1.2, ADR-385; AC-10-04…08, 34, 36, 39, 43; task 2.1.3, ADR-387…392; AC-10-42; task 2.1.4, ADR-394; AC-10-10, 11; task 2.2.1, ADR-397, 398; AC-10-20, 21, 23, 24; task 2.2.2, ADR-402, 403; AC-10-09, 12…19; task 2.2.3, ADR-408, 409; AC-10-26; task 2.2.4, ADR-412), and AC-10-27 and 32 in part |
| Earlier scenarios with a Phase 2 part (M) | 48, and AC-06-36 |
| **Phase 2 proves, at the API** | **104**, and AC-06-36's link |

By task: 2.1.2: 5 (AC-10-01, 02, 03, 33, 55) · 2.1.3: 9 (04…08, 34, 36, 39, 43) · 2.1.4: 1 (42) ·
2.2.1: 2 (10, 11) · 2.2.2: 5 (20, 21, 23, 24, 25) · 2.2.3: 9 (09, 12…19) · 2.2.4: 1 (26) ·
2.2.6: 1 (40) · 2.3.1: 1 (50) · 2.3.2: 3 (52, 53, 54) · 2.3.3: 1 (51) · 2.4.2: 1 (38) · 2.4.4:
3 (28, 35, 37) · 2.4.5: 3 (29, 30, 31) · 2.5.1: 4 (22, 44, 45, 46) · 2.6.4: 3 (47, 48, 49) ·
2.6.5: 1 (41) · 2.7.3: 2 (27, 56) · every endpoint's task: AC-10-32. A scenario with two tasks is
counted at the first.

---

## Left to the task that builds it

Nothing recorded settles these, so no scenario asserts them. Each is decided in the ADR of the
task named, as an agent default the user may overturn, unless that task finds it changes money,
evidence or a monitor's work (ADR-230).

| # | What isn't settled | Decided with |
|---|---|---|
| 1 | **The numbers.** How long an access token and a refresh token live; how many wrong tries before the wait grows and before a login locks; each rate limit; each size limit; the statement timeout. All policy values, none recorded (ARCHITECTURE §7.2's 5 and 10 are the phone's own sign-in screen). **The size limit ✅ ADR-389, an agent default:** one mebibyte for a request's body, the policy value `REQUEST_BODY_LIMIT_BYTES`. **The statement timeout ✅ ADR-394, an agent default:** thirty seconds, the policy value `STATEMENT_TIMEOUT_MS` **The token lifetimes ✅ ADR-408, agent defaults:** an access token of 5 minutes, a session of 30 quiet minutes and 12 hours at most (`ACCESS_TOKEN_MINUTES`, `SESSION_INACTIVITY_MINUTES`, `SESSION_OVERALL_HOURS`; never over the standard's hour and day). **The wrong tries ✅ ADR-409, agent defaults:** a wait from the 5th in a row, 30 seconds and doubling to an hour at most; a lock at the 10th (`SIGN_IN_TRIES_BEFORE_WAIT`, `SIGN_IN_TRIES_BEFORE_LOCK`, `SIGN_IN_FIRST_WAIT_SECONDS`, `SIGN_IN_LONGEST_WAIT_MINUTES`; a lock never later than the standard's 100). **The rate limits ✅ ADR-416, agent defaults:** 3,000 requests a minute from one address and 600 from one signed-in person; in an hour, 30 refused tries from one address and 4 at one login, 10 resets asked by one address and 3 for one login (`RATE_LIMIT_…`, `SIGN_IN_WRONG_TRIES_PER_ADDRESS…`, `PASSWORD_RESET_ASKS_PER_…`) | ~~2.1.3~~, ~~2.1.4~~, ~~2.2.3~~, ~~2.2.6~~ |
| 2 | **How a locked login opens again** (after a time, as `lockedUntil` suggests, or by an admin), and how "the last admin can't be … locked out" (ARCHITECTURE §6) stands beside a lockout that anybody's wrong tries can cause **✅ in part, ADR-409 (5), an agent default:** a lock opens only when the password is set anew (a reset by email, or an admin), as NIST SP 800-63B-4 §3.2.2 asks, never by time; a wait opens by itself. **✅ ADR-415 (12), the user's decision (ADR-413 (2), 414 (2)): the command `pnpm installer:admin` on the firm's server sets an admin's password anew, which opens the lock (AC-02-84).** *Was still open, 2.2.5:* the last admin of a firm with no mail, whom nothing in the product can open yet | ~~2.2.3~~, 2.2.5 |
| 3 | ~~**Which revision of NIST SP 800-63B**, the shortest password allowed, and Argon2id's parameters~~ ✅ ADR-402, an agent default: SP 800-63B-4 (August 2025) with ASVS 5.0; 15 characters at least for every back-office and outside user, the policy value `PASSWORD_MINIMUM_LENGTH` (never under 8), 128 at most; Argon2id at 19 MiB, 2 passes, 1 lane | ~~2.2.2~~ |
| 4 | **Whether any password rule applies to a monitor's password.** By the firm's practice it is their phone number without the area code (the user, ADR-105), which no length rule or breached-password list would pass; BACKLOG 2.2.2 says "every password a person sets". Scenarios AC-10-21 and 24 are written for back-office and outside users only. *Read as:* ADR-105 is the user's and stands, so a monitor's password is exempt, and the controls of ARCHITECTURE §7.2 protect it **✅ ADR-402 (5), recorded as read:** exempt from the length, the breached list and the words; never empty; kept as the same slow hash | ~~2.2.2~~ |
| 3a | *Added by task 2.2.2 (ADR-406):* whether a password an admin set must be changed by its owner at their next sign-in (ASVS Level 3 asks that an admin never chooses one; Level 2 doesn't), and whether a password is also run through a keyed hash with a secret kept apart from the database (NIST: SHOULD) **✅ ADR-410, 411, at the user's word (ADR-407):** its owner sets their own at their next sign-in, before anything else; a person's password hash is keyed with a secret kept out of the database (the master passcode's: 2.5.1) | 2.2.3 |
| 5 | **How CSRF protection works** (what the back office's page sends with a write), and the cookies' `SameSite` value **✅ ADR-408 (6), (7), an agent default:** the session's own value, a signature over its id, sent in the header `x-adms-csrf` with every call that isn't a GET; the cookies are `SameSite=Strict` | 2.2.3 |
| 6 | **What a failed sign-in is told**, and whether it says the same for a name nobody has and a wrong password (the checklist asks that it does) **✅ ADR-409 (6), an agent default:** `SIGN_IN_REFUSED` and nothing else, the same for a name nobody has, a wrong password, a login that waits or is locked, a monitor and the system actor | 2.2.3 |
| 7 | **What ends a session besides signing out**: a person archived, a password reset, two-step cleared, a role or a grant changed **✅ ADR-408 (8), 410 (4), agent defaults:** thirty quiet minutes, twelve hours, a refresh token used twice, the password set anew, the person archived or no longer a kind of user that signs in here (read on every request). A role or a grant changed ends nothing, being read each time (2.2.5); **two-step cleared ends the person's sessions (✅ ADR-412 (9))** | 2.2.3, 2.2.5 |
| 8 | **Where a security event is kept**, what it holds, and who reads it. **✅ ADR-399, an agent default:** its own record, `SecurityEvent`, added and never edited, copied by the database into the audit log's security domain; it holds a kind, who it is about, the phone, the request and when, never a typed name or an address; the API alone reads the table. **The actor of a wrong try ✅ ADR-409 (9), an agent default:** the person whose login was tried; a try at a name nobody has writes nothing. **Still open:** the actor under the master passcode (2.5.1). **Agent default, ADR-401 (3):** a try at a name nobody has writes no row, and a locked account's further wrong tries add nothing | ~~2.2.1~~; the actor: 2.2.3, 2.5.1 |
| 9 | **A record that disagrees with who sent it**: a field event naming another monitor, another phone or another project than the phone and monitor that synced it; and a record a phone sends that fails its schema. Sync refuses nothing over eligibility (ADR-052), and "saved" is said only for what was stored: the answer must hold both (`05-sync.md` point 11; BACKLOG C69) | 2.6.1, 2.6.2 |
| 10 | **A challenge's lifetime**, the key's kind, and the device session token's lifetime | 2.5.1, 2.5.2 |
| 11 | **Who the record names for an act under the master passcode** (BACKLOG C45) | 2.5.1 |
| 12 | **A file that fails its check**: a fingerprint that doesn't match the one taken at capture, a type that isn't media, a size over the limit. What the phone is told, whether the file is kept aside for a person, and whether the ticket is flagged; a photograph is evidence, and nothing recorded says it may be turned away | 2.6.4 |
| 13 | **What a limited caller is told**, and what a phone does with it **✅ in part, ADR-416 (6), an agent default:** status 429, the code `LIMITED`, and the whole seconds to wait in the header `Retry-After` and in the body as `retryAfterSeconds`; never which limit. What a phone does with it: 2.6.5 | ~~2.2.6~~, 2.6.5 |
| 14 | **The queue**: the library or a guarded table of our own; how often a failed job is tried again and what one that keeps failing becomes; what each database login may do to it | 2.3.1 |
| 15 | **Whether two projects' runs may go at once** (ARCHITECTURE §13 says one run per project at a time) | 2.3.2 |
| 16 | ~~**Which headers an API answer carries** beyond HSTS, since ARCHITECTURE §6 lists the page headers "on the web apps"~~ ✅ ADR-392, an agent default: HSTS, `nosniff`, no referrer, a content security policy that lets nothing load or frame it, `no-store`, and the request's id | 2.1.3 |
| 17 | ~~**The health answer**: what it says, and to whom~~ ✅ ADR-385 (5), an agent default: `{"status":"ok"}`, to anybody, that the process answers and nothing else. Whether it also says the database answers | 2.7.2 |
