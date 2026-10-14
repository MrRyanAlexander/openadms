# Open ADMS — The API's security checklist

✅ **Approved**: agent-written (task 2.7.3 part 2, ADR-509; corrected by ADR-510; four items settled by the user, ADR-511); the user approves. Building doesn't wait (ADR-230).

← [Index](INDEX.md) · The rows it answers: [acceptance file 10](acceptance/10-api-and-sync.md) · What the attacker goes for: [the threat model](THREAT-MODEL.md) · The standards: [ARCHITECTURE](ARCHITECTURE.md) §16

> **What this page is.** The checklist ARCHITECTURE §16 names for the API's layer: OWASP ASVS 5.0 Levels 1 and 2 and the OWASP API Security Top 10 (2023). Each item says one of these things: the **scenarios** of file 10 that answer it and the task that proves it; **built**, when an earlier task built and tested it but no scenario of file 10 names it yet (the test and the ADR are named); a **departure** an ADR records as an accepted risk; a **conflict** between the item and a recorded scenario; the **phase** that owns it; **not used** here, with the evidence; or **open**, when nothing recorded settles it. Nothing is marked proven that no run has shown: the task names the test that proves it (`agent_store/BACKLOG.md`).

> **Wording.** Each requirement is a shortened label of the published text, ASVS 5.0.0 (the `v5.0.0_release` tag of `OWASP/ASVS`, `5.0/en/`) and the API Top 10 at api-security.owasp.org. Every number and level here was checked against the full published text on 2026-10-14 (ADR-510). The labels are not the text: read the requirement itself before deciding an open item (§4).

**The counts:** 222 ASVS items: every Level 1 and 2 item of the chapters that apply (V1…V9, V11…V16) and the Level 3 items file 10 cites; V10 and V17 are not used, whole (below). ASVS: 71 answered by a scenario (1.3.6 open in part); 25 built without a scenario; 1 departure kept (6.4.1); 1 decided and to build (6.3.3); 46 owned by a phase or not used; 78 open. API: 8 of 10 answered, 2 partly open (§1).

## 1. The API Security Top 10 (2023)

| Risk | Published (read 2026-10-14) | Answered by: scenario (task) | Still open |
|---|---|---|---|
| **API1:2023** | Broken object level authorization: an object taken by id is checked against the caller's access | AC-10-29, AC-10-30, AC-02-69, AC-02-74 (task 2.2.3, 2.2.4, 2.4.5) | — |
| **API2:2023** | Broken authentication: a flawed sign-in or token lets an attacker act as someone else | AC-10-09, AC-10-12, AC-10-14, AC-10-16, AC-10-17, AC-10-18, AC-10-22, AC-10-44, AC-10-45, AC-10-46, AC-02-18, AC-02-35, AC-02-39, AC-02-60, AC-02-61, AC-05-03, AC-05-56 (task 2.2.3, 2.4.3, 2.5.1, 2.5.2, 2.5.4, 2.6.2, 2.6.5) | — |
| **API3:2023** | Broken object property level authorization: properties exposed or changed without checks | AC-10-30, AC-10-34, AC-10-35, AC-01-26, AC-02-37, AC-02-72, AC-05-48, AC-07-91 (task 2.1.3, 2.2.5, 2.4.4, 2.4.5, 2.5.3, 2.6.1, 2.6.2) | — |
| **API4:2023** | Unrestricted resource consumption: no limit on use, or on the cost of use | AC-10-39, AC-10-40, AC-10-41, AC-10-42, AC-10-47, AC-10-51, AC-05-05, AC-05-51, AC-05-53 (task 2.1.3, 2.1.4, 2.2.6, 2.3.3, 2.6.2, 2.6.4, 2.6.5, 2.7.2) | — |
| **API5:2023** | Broken function level authorization: role rules that reach admin functions | AC-10-27, AC-10-28, AC-10-31, AC-02-08, AC-02-12, AC-02-13, AC-03-55, AC-04-102, AC-04-103, AC-08-05, AC-09-18 (task 2.2.5, 2.4.4, 2.4.5, 2.7.3) | — |
| **API6:2023** | Unrestricted access to sensitive business flows: a flow automated and abused | AC-10-35 (task 2.4.4, 2.6.1) | — |
| **API7:2023** | Server-side request forgery: a request to a URL a caller can steer | AC-04-24 (task 2.5.3) | the address server is answered (AC-04-24); the mail sender, the media store and the worker's map servers make requests too, and no row answers them yet: open (ASVS 1.3.6) |
| **API8:2023** | Security misconfiguration: complex or poorly secured configuration | AC-10-01, AC-10-04, AC-10-05, AC-10-06, AC-10-07, AC-10-08, AC-10-32, AC-10-33, AC-10-55 (task 2.1.2, 2.1.3, 2.3.2) | — |
| **API9:2023** | Improper inventory management: undocumented or deprecated endpoints left open | AC-10-27, AC-10-36 (task 2.1.3, 2.6.1, 2.7.3). Part 3 reads AC-10-27 whole (every endpoint as each kind of caller) | — |
| **API10:2023** | Unsafe consumption of APIs: data from a third-party API trusted too much | AC-04-24 (task 2.5.3) | the address server's answer is taken with checks (AC-04-24); the map servers' and the mail sender's answers are not yet covered: open |

**Also checked at this layer (C155, ADR-507):** `/readiness`, a second endpoint anyone may call, answers only up or down, is counted by address, and asks the database once at a time. ASVS 16.5.1 (a generic answer) and API4:2023 (its limits). Proof: `apps/api/test/health.test.ts`, the readiness answer (task 2.7.2 part 4). The demo deploy's monitor asks `/readiness`, never `/health` (5a).

## 2. OWASP ASVS 5.0, Levels 1 and 2 (the Level 3 items the scenarios cite)

Columns: the requirement; its level; the label as read; the scenarios and tasks that answer it, if any; otherwise its owner: **built** (the test and ADR), a **departure** or a **conflict** (for the user), a phase, **not used** (with the evidence), or **open** (nothing yet settles it: a scenario to add, an owner to name, or not applicable, for the user to decide). "Grep" means a search of `apps/api`, `apps/worker` and `packages`, 2026-10-14.

### V1 Encoding and Sanitization

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 1.1.1 | 2 | input decoded into a canonical form once, and only where expected |  | **open** |
| 1.1.2 | 2 | output encoding as the last step before the interpreter |  | **open** |
| 1.2.1 | 1 | output encoding for an HTTP response, HTML or XML suits its context |  | **open** |
| 1.2.2 | 1 | untrusted data encoded when a URL is built from it |  | **open** (the address server's and the map servers' requests are built from GPS) |
| 1.2.3 | 1 | encoding when JavaScript or JSON is built dynamically |  | **open** |
| 1.2.4 | 1 | queries through parameterized queries or the ORM, including stored procedures | AC-10-56 (task 2.7.3) |  |
| 1.2.5 | 1 | OS command injection prevented; OS calls parameterized |  | not used: the product starts no process (no `child_process` in apps/api, apps/worker or packages/db; grep) |
| 1.2.6 | 2 | LDAP injection prevented |  | not used: no LDAP |
| 1.2.7 | 2 | XPath injection prevented |  | not used: no XML is read (1.5.1) |
| 1.2.8 | 2 | LaTeX processors configured securely |  | not used: no LaTeX |
| 1.2.9 | 2 | special characters escaped in regular expressions |  | not used: no regular expression is built from a caller's input (the product's one `new RegExp`, `packages/domain/src/two-step.ts`, is built from a policy number; grep) |
| 1.3.1 | 1 | WYSIWYG or similar HTML input sanitized by a known library |  | not used: no HTML is taken as input |
| 1.3.2 | 1 | no eval() or other dynamic code execution |  | not used: no `eval`, `new Function` or `vm` in the product's source (grep) |
| 1.3.3 | 2 | data sanitized before a potentially dangerous context |  | **open** |
| 1.3.4 | 2 | user-supplied SVG validated or sanitized |  | not used: no SVG is taken: a photograph is JPEG, HEIC, HEIF, PNG or TIFF by its first bytes (`apps/api/src/media/photograph-files.controller.ts`; AC-10-47); a map's file is a zipped shapefile or GeoJSON |
| 1.3.5 | 2 | user-supplied template, Markdown, CSS or XSL content sanitized or disabled |  | **open** |
| 1.3.6 | 2 | SSRF prevented: untrusted data checked against allow-lists of protocols, domains, paths and ports | AC-04-24 (task 2.5.3) | **open** in part: the mail sender, the media store and the map servers (as API7:2023) |
| 1.3.7 | 2 | templates never built from untrusted input |  | **open** |
| 1.3.8 | 2 | JNDI queries sanitized |  | not used: no JNDI (no Java) |
| 1.3.9 | 2 | content sanitized before memcache |  | not used: no memcache |
| 1.3.10 | 2 | format strings sanitized |  | **open** |
| 1.3.11 | 2 | input sanitized before mail systems (SMTP or IMAP injection) |  | **open** (a message goes only to an address the database holds, `apps/api/src/sign-in/mail.ts`; no row) |
| 1.4.1 | 2 | memory-safe strings, copies and pointer arithmetic |  | not used: managed memory (TypeScript on Node); the product has no native code of its own |
| 1.4.2 | 2 | sign, range and input checks prevent integer overflows |  | **open** |
| 1.4.3 | 2 | memory and resources released; no dangling pointers |  | not used: managed memory (TypeScript on Node) |
| 1.5.1 | 1 | XML parsers restrictive; external entities off |  | not used: no XML is parsed (no XML, KML or GPX reader; grep); a map's file is a zipped shapefile or GeoJSON (`apps/api/src/setup/map-file-reader.ts`) |
| 1.5.2 | 2 | deserialization of untrusted data handled safely |  | **open** |

### V2 Validation and Business Logic

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 2.1.1 | 1 | input validation rules documented | AC-10-36 (task 2.1.3, 2.6.1) |  |
| 2.1.2 | 2 | logical and contextual consistency documented |  | **open** |
| 2.1.3 | 2 | business logic limits documented |  | **open** |
| 2.2.1 | 1 | input validated against business or functional expectations | AC-10-34, AC-10-37 (task 2.1.3, 2.4.4) |  |
| 2.2.2 | 1 | input validation enforced at a trusted service layer | AC-10-36 (task 2.1.3, 2.6.1) |  |
| 2.2.3 | 2 | combinations of related data items reasonable | AC-10-38 (task 2.4.2) |  |
| 2.3.1 | 1 | business flows only in the expected order, per user |  | **open** (a candidate: a password somebody else set is changed before anything else, `apps/api/test/sessions.test.ts`, ADR-410) |
| 2.3.2 | 2 | business logic limits implemented | AC-10-54 (task 2.3.2, 2.3.3) |  |
| 2.3.3 | 2 | a business operation completes or is rolled back whole | AC-10-50, AC-05-16, AC-06-02, AC-06-03 (task 2.3.1, 2.3.3, 2.6.2) |  |
| 2.3.4 | 2 | locks on limited-quantity resources |  | **open** |
| 2.4.1 | 2 | anti-automation against excessive calls | AC-10-39, AC-10-40 (task 2.1.3, 2.2.6) |  |

### V3 Web Frontend Security

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 3.2.1 | 1 | browsers do not render content in an incorrect context |  | Phase 4 (web apps; THREAT-MODEL §6) |
| 3.2.2 | 1 | text rendered as text, not as HTML |  | Phase 4 (web apps; THREAT-MODEL §6) |
| 3.3.1 | 1 | cookies with the Secure attribute | AC-10-09 (task 2.2.3) |  |
| 3.3.2 | 2 | SameSite set for each cookie's purpose | AC-10-09 (task 2.2.3) |  |
| 3.3.3 | 2 | __Host- prefix unless a cookie is shared on purpose | AC-10-09 (task 2.2.3) |  |
| 3.3.4 | 2 | HttpOnly unless a script must read the value | AC-10-09 (task 2.2.3) |  |
| 3.4.1 | 1 | Strict-Transport-Security on every response, at least a year; at Level 2, all subdomains too | AC-10-04 (task 2.1.3; subdomains, ADR-511) |  |
| 3.4.2 | 1 | CORS origin a fixed value or checked against an allow-list | AC-10-05, AC-10-06, AC-10-07, AC-10-08 (task 2.1.3) |  |
| 3.4.3 | 2 | Content-Security-Policy response header |  | Phase 4 (web apps; THREAT-MODEL §6) |
| 3.4.4 | 2 | X-Content-Type-Options: nosniff on every response | AC-10-04 (task 2.1.3) |  |
| 3.4.5 | 2 | referrer policy set |  | Phase 4 (web apps; THREAT-MODEL §6) |
| 3.4.6 | 2 | frame-ancestors directive on every response |  | Phase 4 (web apps; THREAT-MODEL §6) |
| 3.5.1 | 1 | CORS preflight-less requests validated as the app's own | AC-10-16 (task 2.2.3) |  |
| 3.5.2 | 1 | sensitive functions not callable without a preflight |  | **open** |
| 3.5.3 | 1 | sensitive requests use POST, PUT, PATCH or DELETE | AC-10-16 (task 2.2.3) |  |
| 3.5.4 | 2 | separate applications on separate hostnames |  | **open** |
| 3.5.5 | 2 | postMessage messages from untrusted origins discarded |  | Phase 4 (web apps; THREAT-MODEL §6) |
| 3.7.1 | 2 | only supported, secure client-side technologies |  | Phase 4 (web apps; THREAT-MODEL §6) |
| 3.7.2 | 2 | automatic redirects only to allow-listed destinations |  | Phase 4 (web apps; THREAT-MODEL §6) |

### V4 API and Web Service

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 4.1.1 | 1 | Content-Type on every response with a body | AC-10-04 (task 2.1.3) |  |
| 4.1.2 | 2 | only user-facing endpoints redirect HTTP to HTTPS; other endpoints don't redirect | AC-10-02 (task 2.1.2; refused, ADR-511) |  |
| 4.1.3 | 2 | headers set by an intermediary are trusted only as documented |  | **built**: a caller's address is the one that connected unless a listed proxy says otherwise (`ADMS_TRUSTED_PROXIES`; `apps/api/test/limits.test.ts`, C85; ADR-416) |
| 4.2.1 | 2 | every component secured, including the proxy |  | **open** |
| 4.3.1 | 2 | GraphQL query limits |  | not used: no GraphQL endpoint (grep) |
| 4.3.2 | 2 | GraphQL introspection off in production |  | not used: no GraphQL endpoint (grep) |
| 4.4.1 | 1 | WebSockets only over TLS |  | not used: no WebSocket endpoint (grep) |
| 4.4.2 | 2 | WebSocket handshake checks the Origin |  | not used: no WebSocket endpoint (grep) |
| 4.4.3 | 2 | WebSocket session tokens when session management cannot be used |  | not used: no WebSocket endpoint (grep) |
| 4.4.4 | 2 | WebSocket tokens obtained and validated |  | not used: no WebSocket endpoint (grep) |

### V5 File Handling

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 5.1.1 | 2 | file types, extensions and sizes documented per upload |  | **open** |
| 5.2.1 | 1 | file size the app can process without denial of service | AC-10-47 (task 2.6.4) |  |
| 5.2.2 | 1 | file matches its extension and contents | AC-10-47, AC-05-09 (task 2.6.4) |  |
| 5.2.3 | 2 | compressed files checked against size and count before unpacking |  | **built**: a map's zip is counted from its directory and unzipped only within the policy's bounds (`apps/api/test/map-file-reader.test.ts`; ADR-485) |
| 5.3.1 | 1 | files from untrusted input never run as server code | AC-10-48 (task 2.6.4) |  |
| 5.3.2 | 1 | file paths built from trusted data | AC-10-49, AC-04-77 (task 2.6.4) |  |
| 5.4.1 | 2 | filenames validated or ignored; Content-Disposition set |  | **built**: a file is sent as an attachment under a name the server makes from the photograph's id, never the phone's (`apps/api/test/photo-files.test.ts`; ADR-483) |
| 5.4.2 | 2 | filenames encoded in headers and attachments |  | **built**: as 5.4.1, the name is the server's own (`apps/api/test/photo-files.test.ts`; ADR-483) |
| 5.4.3 | 2 | files from untrusted sources scanned for malware |  | **open** |

### V6 Authentication

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 6.1.1 | 1 | rate limiting and anti-automation documented |  | **built**: documented by ADR-409, 416, 417, 441 (`packages/domain/src/rate-limits.ts`) |
| 6.1.2 | 2 | context-specific words documented |  | **built**: the product's words (`contextWords`, `packages/domain/src/passwords.ts`; ADR-403) |
| 6.1.3 | 2 | multiple authentication pathways documented |  | **open** |
| 6.2.1 | 1 | passwords at least 8 characters (15 strongly advised) | AC-10-21 (task 2.2.2) |  |
| 6.2.2 | 1 | users can change their password |  | **built**: `changePasswordEndpoint` (`apps/api/test/sessions.test.ts`; ADR-410) |
| 6.2.3 | 1 | a change requires the current and the new password |  | **built**: as 6.2.2 (ADR-410) |
| 6.2.4 | 1 | new passwords checked against known-bad lists | AC-10-24 (task 2.2.2, 2.4.3) |  |
| 6.2.5 | 1 | any characters allowed; no composition rules | AC-10-21 (task 2.2.2) |  |
| 6.2.6 | 1 | password fields mask the entry |  | Phase 3 (phone) and Phase 4 (web apps) |
| 6.2.7 | 1 | paste and password managers permitted |  | Phase 3 (phone) and Phase 4 (web apps) |
| 6.2.8 | 1 | password verified exactly as received |  | **built**: compared exactly as typed, in Unicode's composed form (`packages/domain/test/passwords.test.ts`; ADR-402) |
| 6.2.9 | 2 | passwords of 64 characters or more permitted |  | **built**: the policy's longest is far over 64 (`packages/domain/policy.env`; `packages/domain/test/passwords.test.ts`; ADR-402) |
| 6.2.10 | 2 | a password stays valid until compromised or rotated by the user | AC-10-23 (task 2.2.2) |  |
| 6.2.11 | 2 | context-specific word list used against guessable passwords |  | **built**: as 6.1.2 (ADR-403) |
| 6.2.12 | 2 | passwords checked against breached sets | AC-10-24 (task 2.2.2, 2.4.3) |  |
| 6.3.1 | 1 | controls against credential stuffing and brute force | AC-10-18, AC-10-22, AC-02-07, AC-02-23 (task 2.2.3, 2.4.3, 2.5.1, 2.5.2, 2.5.4, 2.6.2) |  |
| 6.3.2 | 1 | default accounts absent or disabled | AC-10-17 (task 2.2.3) |  |
| 6.3.3 | 2 | multi-factor, or a combination of single factors |  | **the firm's choice, to build** (the user, ADR-511): back-office staff need two-step (AC-02-14) and a monitor's password works only from a proven phone (ADR-441); a viewer's two-step is optional today, each viewer's own choice (ADR-170), and the firm will be able to require it (BACKLOG C157). Shipped default: optional |
| 6.3.4 | 2 | no undocumented authentication pathways |  | **open** |
| 6.4.1 | 1 | initial passwords and activation codes securely random |  | **departure**, kept (the user, ADR-511): a monitor's first password is the firm's practice (their phone number without the area code), the accepted risk of ADR-105 and ADR-139, exempt by ADR-402 (5) |
| 6.4.2 | 1 | no password hints or secret questions |  | **open** |
| 6.4.3 | 2 | a secure reset that bypasses no enabled factor | AC-10-25 (task 2.2.2) |  |
| 6.4.4 | 2 | a lost factor: identity proofed again | AC-10-26 (task 2.2.4) |  |
| 6.5.1 | 2 | lookup secrets, out-of-band codes and TOTPs usable once |  | **built**: an authenticator's code is good once (`apps/api/test/two-step.test.ts`; ADR-412) |
| 6.5.2 | 2 | lookup secrets under 112 bits protected in storage |  | **open** |
| 6.5.3 | 2 | lookup secrets and TOTP seeds generated securely |  | **built**: 20 random bytes from the system's source (`apps/api/test/one-time-codes.test.ts`; ADR-412) |
| 6.5.4 | 2 | lookup secrets and out-of-band codes: at least 20 bits of entropy |  | **open** |
| 6.5.5 | 2 | out-of-band requests, codes and TOTPs: the published conditions | AC-02-14 (task 2.2.4) |  |
| 6.6.1 | 2 | PSTN delivery of one-time passwords |  | not used: no SMS, voice or email factor (AC-10-25, AC-10-26) |
| 6.6.2 | 2 | out-of-band requests bound to the original request |  | not used: no SMS, voice or email factor (AC-10-25, AC-10-26) |
| 6.6.3 | 2 | code-based out-of-band factor protected by rate limiting |  | not used: no SMS, voice or email factor (AC-10-25, AC-10-26) |
| 6.8.1 | 2 | identity providers cannot be spoofed |  | not used: one login store, no identity provider or SAML (ARCHITECTURE §8, 2.2.x) |
| 6.8.2 | 2 | signatures on authentication assertions checked |  | not used: no identity provider sends an assertion; the API's own signed tokens are V9's |
| 6.8.3 | 2 | SAML assertions processed once within their validity |  | not used: one login store, no identity provider or SAML (ARCHITECTURE §8, 2.2.x) |
| 6.8.4 | 2 | authentication strength of a separate IdP |  | not used: one login store, no identity provider or SAML (ARCHITECTURE §8, 2.2.x) |

### V7 Session Management

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 7.1.1 | 2 | inactivity timeout and maximum lifetime documented |  | **open** |
| 7.1.2 | 2 | concurrent sessions per account documented |  | **built**: documented, no limit on how many (ADR-408) |
| 7.1.3 | 2 | session-creating systems in a federation documented |  | not used: no federated identity |
| 7.2.1 | 1 | session tokens verified by a trusted backend |  | **open** |
| 7.2.2 | 1 | tokens dynamically generated, not static keys |  | **built**: each session's and each phone's tokens are made when it opens (`apps/api/test/session-tokens.test.ts`, `phone-proof.test.ts`; ADR-408, 440) |
| 7.2.3 | 1 | reference tokens unique, from a CSPRNG, 128 bits or more | AC-10-10 (task 2.2.1) |  |
| 7.2.4 | 1 | a new token on any authentication; the old one ended | AC-10-13 (task 2.2.3) |  |
| 7.3.1 | 2 | re-authentication after inactivity |  | **built**: a session ends after thirty quiet minutes (`apps/api/test/sessions.test.ts`; ADR-408) |
| 7.3.2 | 2 | re-authentication after the maximum lifetime | AC-10-12 (task 2.2.3) |  |
| 7.4.1 | 1 | a terminated session blocked, for each token kind | AC-10-14, AC-10-15 (task 2.2.3) |  |
| 7.4.2 | 1 | sessions ended when an account is disabled or deleted |  | **built**: an archive or a password set anew ends every session, a monitor's sign-ins on phones too (`apps/api/test/phone-sign-ins.test.ts`; ADR-410, 443) |
| 7.4.3 | 2 | option to end other sessions after a factor change |  | **built**: always, not as an option: a changed password or a cleared authenticator ends the person's other sessions (`apps/api/src/sign-in/sessions.ts`; ADR-410, 415) |
| 7.4.4 | 2 | visible logout on every page that needs sign-in |  | Phase 4 (web apps; THREAT-MODEL §6) |
| 7.4.5 | 2 | administrators can end a user's sessions |  | **built**: `POST /people/:userId/session-endings` (`apps/api/test/people.test.ts`; ADR-415) |
| 7.5.1 | 2 | full re-authentication before changing authentication details |  | **built** for the master passcode: the admin gives their own password (`apps/api/test/phones.test.ts`; ADR-428); a person's own password: 6.2.3 |
| 7.5.2 | 2 | users see and end their own active sessions |  | **open** |
| 7.6.1 | 2 | federated lifetimes behave as documented |  | not used: no federated identity |
| 7.6.2 | 2 | a session created only by an explicit action |  | **open** |

### V8 Authorization

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 8.1.1 | 1 | rules for function-level and data-level access documented |  | **open** |
| 8.1.2 | 2 | rules for field-level access documented |  | **open** |
| 8.2.1 | 1 | function-level access only with an explicit permission | AC-10-27, AC-10-28, AC-10-31, AC-02-08, AC-02-13, AC-02-39, AC-03-55, AC-04-102, AC-04-103, AC-08-05, AC-08-06, AC-09-18 (task 2.2.3, 2.2.5, 2.4.4, 2.4.5, 2.5.2, 2.6.2, 2.7.3) |  |
| 8.2.2 | 1 | data-level access only with an explicit permission | AC-10-29, AC-10-30, AC-02-45, AC-02-69, AC-02-74, AC-05-08 (task 2.2.3, 2.2.4, 2.4.5, 2.6.2, 2.6.3) |  |
| 8.2.3 | 2 | field-level access only with an explicit permission | AC-10-35 (task 2.4.4, 2.6.1) |  |
| 8.3.1 | 1 | rules enforced at a trusted service layer | AC-10-27, AC-10-28 (task 2.4.4, 2.7.3) |  |
| 8.3.2 | 3 | changes to authorization values applied at once | AC-02-12 (task 2.2.5, 2.4.4) |  |
| 8.4.1 | 2 | cross-tenant controls in multi-tenant applications |  | not used: one firm per installation (ADR-099) |

### V9 Self-contained Tokens

The API signs three tokens of its own with HMAC-SHA-256 (the access token, a phone's token and a phone's challenge: `apps/api/src/sign-in/session-tokens.ts`, `apps/api/src/phone/phone-tokens.ts`, `phone-challenges.ts`), each with a key of its purpose alone drawn from `ADMS_TOKEN_SIGNING_SECRET`. Each only names a session or a phone, which is then read from the database on every request.

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 9.1.1 | 1 | a token's signature or MAC checked before its content is taken | AC-10-46 (task 2.5.1, 2.6.5) | the access token: `apps/api/test/session-tokens.test.ts` |
| 9.1.2 | 1 | only allow-listed algorithms create and verify a token; never "None" |  | **built**: one algorithm, fixed in the code; no token names its own (`session-tokens.ts`, `phone-tokens.ts`, `phone-challenges.ts`) |
| 9.1.3 | 1 | key material from trusted, pre-configured sources only |  | **built**: every key is drawn from the installation's signing secret; none is taken from a token |
| 9.2.1 | 1 | a token taken only within its validity time span | AC-10-12 (task 2.2.3) |  |
| 9.2.2 | 2 | a token checked to be of the right type and purpose | AC-10-46 (task 2.5.1, 2.6.5) | the access token: `apps/api/test/session-tokens.test.ts` (another purpose's signature is refused) |
| 9.2.3 | 2 | a service takes only tokens meant for it (audience) |  | not used: each token is taken only by the API that signed it; none goes to another service |
| 9.2.4 | 2 | one issuer key for several audiences: the audience restricted |  | **built**: a key per purpose, so no token is taken for another (`phone-proof.test.ts`, `session-tokens.test.ts`) |

### V10 OAuth and OIDC, V17 WebRTC

Not used, whole: no OAuth or OpenID Connect client, resource server or authorization server (one login store, ARCHITECTURE §8), and no WebRTC (no OAuth, OIDC, SAML or WebRTC package in any workspace, nor in the product's source; grep). V10's 29 Level 1 and 2 items and V17's 7 are therefore not listed one by one; each would read "not used".

### V11 Cryptography

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 11.1.1 | 2 | key management policy and lifecycle documented |  | **open** |
| 11.1.2 | 2 | inventory of keys, algorithms and where keys may be used | AC-10-44, AC-02-61 (task 2.4.3, 2.5.1, 2.6.5) |  |
| 11.2.1 | 2 | industry-validated cryptographic implementations |  | **open** |
| 11.2.2 | 2 | crypto agility: algorithms and keys can be replaced |  | **open** |
| 11.2.3 | 2 | primitives give at least 128 bits of security |  | **open** in part: the phone's key is ECDSA on P-256 (`apps/api/test/phone-proof.test.ts`; ADR-437); the other primitives not yet listed |
| 11.3.1 | 1 | no ECB mode or PKCS#1 v1.5 padding |  | **open** |
| 11.3.2 | 1 | only approved ciphers and modes |  | **open** |
| 11.3.3 | 2 | encrypted data protected against modification |  | **open** |
| 11.4.1 | 1 | only approved hash functions | AC-10-10 (task 2.2.1) |  |
| 11.4.2 | 2 | passwords hashed with a computationally intensive function | AC-10-20, AC-02-41 (task 2.2.2, 2.5.3) |  |
| 11.4.3 | 2 | integrity hashes collision resistant |  | **open** |
| 11.4.4 | 2 | keys derived with stretching resistant to brute force |  | **open** |
| 11.5.1 | 2 | random values from a CSPRNG with 128 bits of entropy | AC-10-45, AC-02-18, AC-05-03 (task 2.5.1, 2.6.2) |  |
| 11.6.1 | 2 | approved algorithms for key generation and signatures |  | **built** for signatures: ECDSA on P-256 with SHA-256 (`apps/api/test/phone-proof.test.ts`; ADR-437) |

### V12 Secure Communication

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 12.1.1 | 1 | only current TLS versions | AC-10-03 (task 2.1.2) |  |
| 12.1.2 | 2 | recommended cipher suites, the strongest preferred |  | **open** |
| 12.1.3 | 2 | client certificates validated before their identity is used |  | not used: no mutual-TLS client certificates; a phone proves itself by its key (AC-10-44, 45) |
| 12.2.1 | 1 | TLS for every client connection to external HTTP services, no fallback | AC-10-01, AC-10-02 (task 2.1.2) |  |
| 12.2.2 | 1 | publicly trusted certificates for external services |  | Phase 5a (demo deploy; THREAT-MODEL §6) |
| 12.3.1 | 2 | an encrypted protocol for every connection, no fallback | AC-10-01, AC-10-02 (task 2.1.2) |  |
| 12.3.2 | 2 | TLS clients validate the server's certificate |  | **open** |
| 12.3.3 | 2 | internal HTTP-based connections encrypted, no fallback |  | **open** |
| 12.3.4 | 2 | internal certificates trusted only specifically |  | **open** |

### V13 Configuration

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 13.1.1 | 2 | communication needs, external services and endpoints documented |  | **open** |
| 13.2.1 | 2 | backend services authenticate with their own accounts or short-lived credentials |  | **open** |
| 13.2.2 | 2 | backend accounts with the minimum privileges | AC-10-49, AC-10-56 (task 2.6.4, 2.7.3) |  |
| 13.2.3 | 2 | no default or well-known service credentials |  | **open** |
| 13.2.4 | 2 | allow-list of external resources the app may reach |  | **open** |
| 13.2.5 | 2 | server allow-list of systems it may send requests to |  | **open** |
| 13.2.6 | 3 | service connections configured: limits, timeouts, retries | AC-10-42 (task 2.1.4) |  |
| 13.3.1 | 2 | secrets kept in a manager, out of source and artifacts |  | T-51: `tools/setup/test/secrets.test.ts` and `pnpm security` (ADR-508) |
| 13.3.2 | 2 | least-privilege access to secrets |  | **open** |
| 13.4.1 | 1 | no source-control metadata deployed |  | **open** |
| 13.4.2 | 2 | debug modes off in production |  | **open** |
| 13.4.3 | 2 | no directory listings |  | **open** |
| 13.4.4 | 2 | HTTP TRACE disabled in production |  | **open** |
| 13.4.5 | 2 | documentation and monitoring endpoints hidden unless intended | AC-10-36 (task 2.1.3, 2.6.1) |  |

### V14 Data Protection

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 14.1.1 | 2 | sensitive data classified into protection levels |  | **open** |
| 14.1.2 | 2 | protection requirements documented per level |  | **open** |
| 14.2.1 | 1 | sensitive data kept out of URLs and query strings |  | **open** in part: the master passcode is never in a path or a query (`apps/api/test/phone-setup-choices.test.ts`; ADR-463); every endpoint not yet checked |
| 14.2.2 | 2 | sensitive data not cached by servers, or purged |  | **open** |
| 14.2.3 | 2 | sensitive data not sent to untrusted third parties |  | **open** |
| 14.2.4 | 2 | sensitive-data controls (logs included) per protection level | AC-10-11 (task 2.2.1) |  |
| 14.2.6 | 3 | only the minimum sensitive data returned; full values masked | AC-02-72 (task 2.2.5) |  |
| 14.3.1 | 1 | authenticated data cleared from client storage when a session ends | AC-02-58 (task 2.6.5) |  |
| 14.3.2 | 2 | anti-caching headers (no-store) on sensitive responses | AC-10-04 (task 2.1.3) |  |
| 14.3.3 | 2 | sensitive data kept out of browser storage |  | Phase 3 (phone) and Phase 4 (web apps) |

### V15 Secure Coding and Architecture

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 15.1.1 | 1 | remediation timeframes for components documented |  | **open** |
| 15.1.2 | 2 | inventory of third-party components |  | **open** |
| 15.1.3 | 2 | resource-heavy functions documented |  | **open** |
| 15.2.1 | 1 | components within their documented update timeframes |  | **open** |
| 15.2.2 | 2 | defence against availability loss from heavy functions | AC-10-39 (task 2.1.3) |  |
| 15.2.3 | 2 | production holds only the functionality it needs |  | **open** |
| 15.3.1 | 1 | only the required fields of an object returned | AC-10-30 (task 2.4.5) |  |
| 15.3.2 | 2 | backend calls do not follow redirects unless intended |  | **open** |
| 15.3.3 | 2 | mass assignment prevented by allowed fields per action | AC-10-34, AC-10-35 (task 2.1.3, 2.4.4, 2.6.1) |  |
| 15.3.4 | 2 | real client IP from trusted fields, used for rate limits |  | **built**: as 4.1.3 (`apps/api/test/limits.test.ts`, C85; ADR-416) |
| 15.3.5 | 2 | variables type-checked; strict equality |  | **open** |
| 15.3.6 | 2 | prototype pollution prevented |  | **open** |
| 15.3.7 | 2 | HTTP parameter pollution defended |  | **open** |
| 15.4.1 | 3 | shared objects in threads accessed safely | AC-10-52 (task 2.3.2) |  |
| 15.4.2 | 3 | a state check and the action on it are one atomic operation | AC-10-50, AC-10-53 (task 2.3.1, 2.3.2, 2.3.3) |  |

### V16 Security Logging and Error Handling

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 16.1.1 | 2 | logging inventory per stack layer |  | **open** |
| 16.2.1 | 2 | each log entry carries when, where, who and what | AC-10-32, AC-10-43, AC-02-38, AC-05-40 (task 2.1.2, 2.1.3, 2.5.4) |  |
| 16.2.2 | 2 | time sources synchronized; UTC or explicit offsets | AC-05-04, AC-06-58 (task 2.6.2) |  |
| 16.2.3 | 2 | logs written only to documented places |  | **open** |
| 16.2.4 | 2 | logs readable by a common format |  | **open** |
| 16.2.5 | 2 | credentials never logged; tokens hashed or masked | AC-10-11, AC-10-32 (task 2.1.2, 2.2.1) |  |
| 16.3.1 | 2 | every authentication logged, successful or failed | AC-10-19, AC-10-22, AC-02-23 (task 2.2.1, 2.2.3, 2.4.3, 2.5.1, 2.5.4, 2.6.2) |  |
| 16.3.2 | 2 | failed authorization logged |  | **open** |
| 16.3.3 | 2 | defined security events and bypass attempts logged |  | **open** in part: every use of the master passcode is a security event (ADR-457, 458); bypass attempts not yet listed |
| 16.3.4 | 2 | unexpected errors and control failures logged |  | **open** |
| 16.4.1 | 2 | log injection prevented |  | **open** |
| 16.4.2 | 2 | logs protected from unauthorized access and change |  | **open** |
| 16.4.3 | 2 | logs sent to a separate system for analysis and alerts |  | Phase 5a (demo deploy; THREAT-MODEL §6) |
| 16.5.1 | 2 | generic message to the caller on unexpected or sensitive errors | AC-10-33, AC-10-38 (task 2.1.2, 2.4.2) |  |
| 16.5.2 | 2 | operation continues safely when an external resource fails |  | **open** |
| 16.5.3 | 2 | fails securely on exceptions; no fail-open | AC-10-55 (task 2.1.2, 2.3.2) |  |

## 3. What the page leaves for the user

**78 ASVS items and two API risks are open** (the Owner column says so, and §1 names the two API risks). For each open item the user answers one of three ways: a scenario added to file 10 with its task; a phase that owns it (written into its brief); or not used, with the reason. Nothing is decided here on the user's behalf.

**The four the user settled (2026-10-14, ADR-511):**

- **4.1.2:** plain HTTP is refused at the API's address, never redirected; a web page's name keeps the redirect. Built (AC-10-02).
- **3.4.1 at Level 2:** HSTS includes subdomains, at the API and the proxy. Built (AC-10-04). It binds only names under the host that sends it.
- **6.3.3:** the firm chooses whether a read-only viewer must use two-step; optional as shipped. To build (BACKLOG C157): today it is each viewer's own choice, and no firm-wide setting exists yet.
- **6.4.1:** a monitor's first password stays the accepted risk of ADR-105 and ADR-139.

The 25 **built** items are tested already but no scenario of file 10 names them; each wants a row (or a cited test) when file 10 is next touched. Task 2.7.3 part 3 then reads AC-10-27 and REQ-204 whole, and weighs C155's finding (`agent_store/BACKLOG.md`). The threat model's rows are checked against this page when it changes (`spec/THREAT-MODEL.md` §6).

## 4. How the list was made

- **The published texts:** OWASP ASVS 5.0.0, the chapter files at the `v5.0.0_release` tag of `OWASP/ASVS` (`5.0/en/`, read whole on 2026-10-14: 345 requirements); OWASP API Security Top 10 2023 (api-security.owasp.org). The chapter marks file 10 used before (written from memory, ADR-379) were replaced by the published numbers (ADR-509), and every number and level on this page was checked against the full text (ADR-510).

- **Which items are on the page:** every Level 1 and Level 2 item of every chapter, and the Level 3 items that file 10 cites; V10 and V17 are not used, whole, and named once. Levels above 2 are not checked.

- **The reach of each answer:** an item is answered by a scenario only when file 10 says so, in its Answers column (the same rows the tests name). An item an earlier task built and tested, citing it by number, is **built**, with that test and its ADR, never counted as answered. Nothing on this page is a claim the file or the cited test does not make.

- **The correction (ADR-509):** ADR-508 said ASVS V15 asks that data be reached only through the layer meant for it. The published V15 has no such item. The SQL requirement is 1.2.4 (queries through parameterized queries or the ORM), and the least-privilege requirement for each backend login is 13.2.2. ARCHITECTURE §16's list is unchanged.

- **The second correction (ADR-510):** the first version listed V1 only at 1.2.4, left out V9 (which the API's own signed tokens answer to), V10 and V17, called 22 built and tested items and two recorded departures "open", and named six items open that a file 10 row already answers (2.2.2, 3.3.3, 3.5.1, 12.2.1; and 3.4.4 and 14.3.2, the API's headers, AC-10-04). It marked 3.4.1 answered without its Level 2 part, missed 4.1.2's conflict with AC-10-02, and answered 2.3.1 (steps in order) with AC-10-35 and AC-05-08, which say nothing of order: AC-10-35 now answers 15.3.3 beside 8.2.3, and AC-05-08 (a submitted record isn't changed by sending it again) answers 8.2.2, as AC-02-45 does.
