# Open ADMS — The API's security checklist

✅ **Approved**: agent-written (task 2.7.3 part 2, ADR-509; corrected by ADR-510; four items settled by the user, ADR-511; the 78 open items' proposed answers, §3.1, ADR-512, approved whole by the user, ADR-513; 21 of them answered by a scenario in part 4, 40 more marked in its second piece, ADR-514, and 14 written in its third, §5, ADR-515); the user approves. Building doesn't wait (ADR-230).

← [Index](INDEX.md) · The rows it answers: [acceptance file 10](acceptance/10-api-and-sync.md) · What the attacker goes for: [the threat model](THREAT-MODEL.md) · The standards: [ARCHITECTURE](ARCHITECTURE.md) §16

> **What this page is.** The checklist ARCHITECTURE §16 names for the API's layer: OWASP ASVS 5.0 Levels 1 and 2 and the OWASP API Security Top 10 (2023). Each item says one of these things: the **scenarios** of file 10 that answer it and the task that proves it; **built**, when an earlier task built and tested it but no scenario of file 10 names it yet (the test and the ADR are named); a **departure** an ADR records as an accepted risk; a **conflict** between the item and a recorded scenario; the **phase** that owns it; **not used** here, with the evidence; **to do**, as the user approved it (§3.1) and not yet done; or **open**, when nothing recorded settles it. "File 10" is [acceptance file 10](acceptance/10-api-and-sync.md), the API's own scenarios: an answer "by a scenario" is a row there with the test that proves it. Nothing is marked proven that no run has shown: the task names the test that proves it (`agent_store/BACKLOG.md`).

> **Wording.** Each requirement is a shortened label of the published text, ASVS 5.0.0 (the `v5.0.0_release` tag of `OWASP/ASVS`, `5.0/en/`) and the API Top 10 at api-security.owasp.org. Every number and level here was checked against the full published text on 2026-10-14 (ADR-510). The labels are not the text: read the requirement itself before deciding an open item (§4).

**The counts:** 222 ASVS items: every Level 1 and 2 item of the chapters that apply (V1…V9, V11…V16) and the Level 3 items file 10 cites; V10 and V17 are not used, whole (below). ASVS: 92 answered by a scenario (11.4.1 among them, with a departure proposed for one use, ADR-514); 64 built without a scenario, 14 of them written answers (§5; ADR-515); 1 departure kept (6.4.1); 1 decided and to build (6.3.3); 61 owned by a phase, not used, or an accepted risk; 3 to do, as the user approved them (§3.1; ADR-513): 4.2.1, 12.3.3 and 15.3.2, in part 5. None open. API: 9 of 10 answered; API10's last two answers proposed (§5.9; ADR-515), for the user, to build in part 5.

## 1. The API Security Top 10 (2023)

| Risk | Published (read 2026-10-14) | Answered by: scenario (task) | Still open |
|---|---|---|---|
| **API1:2023** | Broken object level authorization: an object taken by id is checked against the caller's access | AC-10-29, AC-10-30, AC-02-69, AC-02-74 (task 2.2.3, 2.2.4, 2.4.5) | — |
| **API2:2023** | Broken authentication: a flawed sign-in or token lets an attacker act as someone else | AC-10-09, AC-10-12, AC-10-14, AC-10-16, AC-10-17, AC-10-18, AC-10-22, AC-10-44, AC-10-45, AC-10-46, AC-02-18, AC-02-35, AC-02-39, AC-02-60, AC-02-61, AC-05-03, AC-05-56 (task 2.2.3, 2.4.3, 2.5.1, 2.5.2, 2.5.4, 2.6.2, 2.6.5) | — |
| **API3:2023** | Broken object property level authorization: properties exposed or changed without checks | AC-10-30, AC-10-34, AC-10-35, AC-01-26, AC-02-37, AC-02-72, AC-05-48, AC-07-91 (task 2.1.3, 2.2.5, 2.4.4, 2.4.5, 2.5.3, 2.6.1, 2.6.2) | — |
| **API4:2023** | Unrestricted resource consumption: no limit on use, or on the cost of use | AC-10-39, AC-10-40, AC-10-41, AC-10-42, AC-10-47, AC-10-51, AC-05-05, AC-05-51, AC-05-53 (task 2.1.3, 2.1.4, 2.2.6, 2.3.3, 2.6.2, 2.6.4, 2.6.5, 2.7.2) | — |
| **API5:2023** | Broken function level authorization: role rules that reach admin functions | AC-10-27, AC-10-28, AC-10-31, AC-02-08, AC-02-12, AC-02-13, AC-03-55, AC-04-102, AC-04-103, AC-08-05, AC-09-18 (task 2.2.5, 2.4.4, 2.4.5, 2.7.3) | — |
| **API6:2023** | Unrestricted access to sensitive business flows: a flow automated and abused | AC-10-35 (task 2.4.4, 2.6.1) | — |
| **API7:2023** | Server-side request forgery: a request to a URL a caller can steer | AC-04-24 (task 2.5.3), AC-10-64 (task 2.7.3 part 4, ADR-513): no endpoint takes an address the server asks; the address server, the mail sender, the media store and the worker's map servers are asked only where their settings say | — |
| **API8:2023** | Security misconfiguration: complex or poorly secured configuration | AC-10-01, AC-10-04, AC-10-05, AC-10-06, AC-10-07, AC-10-08, AC-10-32, AC-10-33, AC-10-55 (task 2.1.2, 2.1.3, 2.3.2) | — |
| **API9:2023** | Improper inventory management: undocumented or deprecated endpoints left open | AC-10-27, AC-10-36 (task 2.1.3, 2.6.1, 2.7.3). AC-10-27 read whole in part 3 (ADR-512): the 120 endpoints held as one list, each asked by nine kinds of caller (`every-endpoint.test.ts`) | — |
| **API10:2023** | Unsafe consumption of APIs: data from a third-party API trusted too much | AC-04-24 (task 2.5.3) | the address server's answer is taken with checks (AC-04-24); the map servers' answers found short and the mail sender's read as it stands: each answer **proposed** (§5.9; ADR-515), for the user; built in part 5 |

**Also checked at this layer (C155, ADR-507):** `/readiness`, a second endpoint anyone may call, answers only up or down, is counted by address, and asks the database once at a time. ASVS 16.5.1 (a generic answer) and API4:2023 (its limits). Proof: `apps/api/test/health.test.ts`, the readiness answer (task 2.7.2 part 4). The demo deploy's monitor asks `/readiness`, never `/health` (5a).

## 2. OWASP ASVS 5.0, Levels 1 and 2 (the Level 3 items the scenarios cite)

Columns: the requirement; its level; the label as read; the scenarios and tasks that answer it, if any; otherwise its owner: **built** (the test and ADR), a **departure** or a **conflict** (for the user), a phase, **not used** (with the evidence), or **open** (nothing yet settles it: a scenario to add, an owner to name, or not applicable, for the user to decide). "Grep" means a search of `apps/api`, `apps/worker` and `packages`, 2026-10-14.

### V1 Encoding and Sanitization

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 1.1.1 | 2 | input decoded into a canonical form once, and only where expected | AC-10-57 (task 2.7.3 part 4, ADR-513) |  |
| 1.1.2 | 2 | output encoding as the last step before the interpreter | AC-10-60 (task 2.7.3 part 4, ADR-513) |  |
| 1.2.1 | 1 | output encoding for an HTTP response, HTML or XML suits its context | AC-10-60 (task 2.7.3 part 4, ADR-513) |  |
| 1.2.2 | 1 | untrusted data encoded when a URL is built from it | AC-04-24 (task 2.5.3; the point held to its form, ADR-513) |  |
| 1.2.3 | 1 | encoding when JavaScript or JSON is built dynamically | AC-10-60 (task 2.7.3 part 4, ADR-513) |  |
| 1.2.4 | 1 | queries through parameterized queries or the ORM, including stored procedures | AC-10-56 (task 2.7.3) |  |
| 1.2.5 | 1 | OS command injection prevented; OS calls parameterized |  | not used: the product starts no process (no `child_process` in apps/api, apps/worker or packages/db; grep) |
| 1.2.6 | 2 | LDAP injection prevented |  | not used: no LDAP |
| 1.2.7 | 2 | XPath injection prevented |  | not used: no XML is read (1.5.1) |
| 1.2.8 | 2 | LaTeX processors configured securely |  | not used: no LaTeX |
| 1.2.9 | 2 | special characters escaped in regular expressions |  | not used: no regular expression is built from a caller's input (the product's one `new RegExp`, `packages/domain/src/two-step.ts`, is built from a policy number; grep) |
| 1.3.1 | 1 | WYSIWYG or similar HTML input sanitized by a known library |  | not used: no HTML is taken as input |
| 1.3.2 | 1 | no eval() or other dynamic code execution |  | not used: no `eval`, `new Function` or `vm` in the product's source (grep) |
| 1.3.3 | 2 | data sanitized before a potentially dangerous context |  | Phase 4: the exports (REQ-412): a cell that begins with `=`, `+`, `-`, `@`, a tab or a carriage return is written as text (ADR-514) |
| 1.3.4 | 2 | user-supplied SVG validated or sanitized |  | not used: no SVG is taken: a photograph is JPEG, HEIC, HEIF, PNG or TIFF by its first bytes (`apps/api/src/media/photograph-files.controller.ts`; AC-10-47); a map's file is a zipped shapefile or GeoJSON |
| 1.3.5 | 2 | user-supplied template, Markdown, CSS or XSL content sanitized or disabled |  | not used: no template, Markdown, CSS or XSL is taken, and no template or Markdown engine is a dependency of any workspace; the mail's text is the code's own (grep, ADR-514) |
| 1.3.6 | 2 | SSRF prevented: untrusted data checked against allow-lists of protocols, domains, paths and ports | AC-04-24 (task 2.5.3), AC-10-64 (task 2.7.3 part 4, ADR-513) |  |
| 1.3.7 | 2 | templates never built from untrusted input |  | not used: as 1.3.5, no template engine runs (grep, ADR-514) |
| 1.3.8 | 2 | JNDI queries sanitized |  | not used: no JNDI (no Java) |
| 1.3.9 | 2 | content sanitized before memcache |  | not used: no memcache |
| 1.3.10 | 2 | format strings sanitized |  | not used: no format string is built from a caller's input: every log line's message is a fixed string of the code (the API's and the worker's 62 calls), and nothing calls `util.format` (grep, ADR-514) |
| 1.3.11 | 2 | input sanitized before mail systems (SMTP or IMAP injection) | AC-10-65 (task 2.7.3 part 4, ADR-513) |  |
| 1.4.1 | 2 | memory-safe strings, copies and pointer arithmetic |  | not used: managed memory (TypeScript on Node); the product has no native code of its own |
| 1.4.2 | 2 | sign, range and input checks prevent integer overflows | AC-10-63 (task 2.7.3 part 4, ADR-513) |  |
| 1.4.3 | 2 | memory and resources released; no dangling pointers |  | not used: managed memory (TypeScript on Node) |
| 1.5.1 | 1 | XML parsers restrictive; external entities off |  | not used: no XML is parsed (no XML, KML or GPX reader; grep); a map's file is a zipped shapefile or GeoJSON (`apps/api/src/setup/map-file-reader.ts`) |
| 1.5.2 | 2 | deserialization of untrusted data handled safely | AC-10-58 (task 2.7.3 part 4, ADR-513) |  |

### V2 Validation and Business Logic

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 2.1.1 | 1 | input validation rules documented | AC-10-36 (task 2.1.3, 2.6.1) |  |
| 2.1.2 | 2 | logical and contextual consistency documented |  | **built** (written): §5.2, the rules of consistency where they are held (ADR-515) |
| 2.1.3 | 2 | business logic limits documented |  | **built** (written): §5.2, the limits where they are held (ADR-515) |
| 2.2.1 | 1 | input validated against business or functional expectations | AC-10-34, AC-10-37 (task 2.1.3, 2.4.4) |  |
| 2.2.2 | 1 | input validation enforced at a trusted service layer | AC-10-36 (task 2.1.3, 2.6.1) |  |
| 2.2.3 | 2 | combinations of related data items reasonable | AC-10-38 (task 2.4.2) |  |
| 2.3.1 | 1 | business flows only in the expected order, per user |  | **built**: a person whose password somebody else set changes it before anything else, and an admin or a manager/analyst sets an authenticator up first (the door's `PASSWORD_CHANGE_REQUIRED`, `TWO_STEP_SETUP_REQUIRED`; `apps/api/test/sessions.test.ts`, `two-step.test.ts`; ADR-410, 412) |
| 2.3.2 | 2 | business logic limits implemented | AC-10-54 (task 2.3.2, 2.3.3) |  |
| 2.3.3 | 2 | a business operation completes or is rolled back whole | AC-10-50, AC-05-16, AC-06-02, AC-06-03 (task 2.3.1, 2.3.3, 2.6.2) |  |
| 2.3.4 | 2 | locks on limited-quantity resources |  | **built**: a number series' blocks, from which tickets' and cert numbers come, are taken only where the series hasn't moved on, and never overlap by the database's own refusal (`number_blocks_never_overlap`; `apps/api/test/sync.test.ts`, `SeriesMovedOn`; the story `burst`; ADR-505) |
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
| 3.5.2 | 1 | sensitive functions not callable without a preflight | AC-10-59 (task 2.7.3 part 4, ADR-513) |  |
| 3.5.3 | 1 | sensitive requests use POST, PUT, PATCH or DELETE | AC-10-16 (task 2.2.3) |  |
| 3.5.4 | 2 | separate applications on separate hostnames |  | Phase 4 and 5a: each web app on a hostname of its own, the API on its own (`api.adms.localhost` today; REQ-517; ADR-514) |
| 3.5.5 | 2 | postMessage messages from untrusted origins discarded |  | Phase 4 (web apps; THREAT-MODEL §6) |
| 3.7.1 | 2 | only supported, secure client-side technologies |  | Phase 4 (web apps; THREAT-MODEL §6) |
| 3.7.2 | 2 | automatic redirects only to allow-listed destinations |  | Phase 4 (web apps; THREAT-MODEL §6) |

### V4 API and Web Service

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 4.1.1 | 1 | Content-Type on every response with a body | AC-10-04 (task 2.1.3) |  |
| 4.1.2 | 2 | only user-facing endpoints redirect HTTP to HTTPS; other endpoints don't redirect | AC-10-02 (task 2.1.2; refused, ADR-511) |  |
| 4.1.3 | 2 | headers set by an intermediary are trusted only as documented |  | **built**: a caller's address is the one that connected unless a listed proxy says otherwise (`ADMS_TRUSTED_PROXIES`; `apps/api/test/limits.test.ts`, "a caller's address is the one that connected, unless a listed proxy says whose request it carries"; C85; ADR-416; confirmed, ADR-515) |
| 4.2.1 | 2 | every component secured, including the proxy |  | **to do**, part 5 (ADR-514): found not to hold whole. The API, the worker and the mail catcher run unprivileged with no capability, the routing server with none, and every image is pinned; the proxy, Postgres, the object store and the address server keep their capabilities and a writable root. Part 5 reworks those containers for its certificates and hardens each, held by a test of `compose.yaml`; the deploy's, Phase 5a (REQ-517) |
| 4.3.1 | 2 | GraphQL query limits |  | not used: no GraphQL endpoint (grep) |
| 4.3.2 | 2 | GraphQL introspection off in production |  | not used: no GraphQL endpoint (grep) |
| 4.4.1 | 1 | WebSockets only over TLS |  | not used: no WebSocket endpoint (grep) |
| 4.4.2 | 2 | WebSocket handshake checks the Origin |  | not used: no WebSocket endpoint (grep) |
| 4.4.3 | 2 | WebSocket session tokens when session management cannot be used |  | not used: no WebSocket endpoint (grep) |
| 4.4.4 | 2 | WebSocket tokens obtained and validated |  | not used: no WebSocket endpoint (grep) |

### V5 File Handling

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 5.1.1 | 2 | file types, extensions and sizes documented per upload |  | **built** (written): §5.3, the two uploads (ADR-515) |
| 5.2.1 | 1 | file size the app can process without denial of service | AC-10-47 (task 2.6.4) |  |
| 5.2.2 | 1 | file matches its extension and contents | AC-10-47, AC-05-09 (task 2.6.4) |  |
| 5.2.3 | 2 | compressed files checked against size and count before unpacking |  | **built**: a map's zip is counted from its directory and unzipped only within the policy's bounds (`apps/api/test/map-file-reader.test.ts`, "a zip that unzips past the bound stops at it, unread" and "a zip of more files than the bound isn't read, counted before any is unzipped"; ADR-485; confirmed, ADR-515) |
| 5.3.1 | 1 | files from untrusted input never run as server code | AC-10-48 (task 2.6.4) |  |
| 5.3.2 | 1 | file paths built from trusted data | AC-10-49, AC-04-77 (task 2.6.4) |  |
| 5.4.1 | 2 | filenames validated or ignored; Content-Disposition set |  | **built**: a file is sent as an attachment under a name the server makes from the photograph's id, never the phone's (`apps/api/test/photo-files.test.ts`, "AC-10-48 answers an admin and a manager/analyst the bytes that were kept": `attachment; filename="<id>-photo.jpg"`; ADR-483; confirmed, ADR-515) |
| 5.4.2 | 2 | filenames encoded in headers and attachments |  | **built**: as 5.4.1, the name is the server's own, an id and a fixed word, so nothing in it needs encoding (the same test; ADR-483; confirmed, ADR-515) |
| 5.4.3 | 2 | files from untrusted sources scanned for malware |  | an accepted risk now (the user, ADR-513): a file is never run, never answered inline and never opened by the server but a map's file by its own reader (AC-10-48); a malware scan the firm may add, Phase 5a (REQ-517) |

### V6 Authentication

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 6.1.1 | 1 | rate limiting and anti-automation documented |  | **built**: documented, each limit with its reason, in `packages/domain/policy.env` (`RATE_LIMIT_*`, `SIGN_IN_*`, `PASSWORD_RESET_ASKS_*`) and by ADR-409, 416, 417, 441; held to the policy by `packages/domain/test/rate-limits.test.ts`, "AC-10-40 the counts are policy values" (confirmed, ADR-515) |
| 6.1.2 | 2 | context-specific words documented |  | **built**: the product's words (`contextWords`, `packages/domain/src/passwords.ts`; `packages/domain/test/passwords.test.ts`, "is refused when it is made only of their own name or address and the product's words"; ADR-403; confirmed, ADR-515) |
| 6.1.3 | 2 | multiple authentication pathways documented |  | **built** (written): ARCHITECTURE §6, "Every way in" (§5.1; ADR-515) |
| 6.2.1 | 1 | passwords at least 8 characters (15 strongly advised) | AC-10-21 (task 2.2.2) |  |
| 6.2.2 | 1 | users can change their password |  | **built**: `changePasswordEndpoint` (`apps/api/test/sessions.test.ts`, "is changed by its owner at their next sign-in, before anything else"; ADR-410; confirmed, ADR-515) |
| 6.2.3 | 1 | a change requires the current and the new password |  | **built**: as 6.2.2: a wrong current password is `PASSWORD_WRONG` and a wrong try at the login (the same test; ADR-410; confirmed, ADR-515) |
| 6.2.4 | 1 | new passwords checked against known-bad lists | AC-10-24 (task 2.2.2, 2.4.3) |  |
| 6.2.5 | 1 | any characters allowed; no composition rules | AC-10-21 (task 2.2.2) |  |
| 6.2.6 | 1 | password fields mask the entry |  | Phase 3 (phone) and Phase 4 (web apps) |
| 6.2.7 | 1 | paste and password managers permitted |  | Phase 3 (phone) and Phase 4 (web apps) |
| 6.2.8 | 1 | password verified exactly as received |  | **built**: compared exactly as typed, in Unicode's composed form (`packages/domain/test/passwords.test.ts`, "is compared and hashed in Unicode's composed form, and otherwise exactly as typed"; ADR-402; confirmed, ADR-515) |
| 6.2.9 | 2 | passwords of 64 characters or more permitted |  | **built**: the policy's longest is 128 (`PASSWORD_MAXIMUM_LENGTH`, `packages/domain/policy.env`; `packages/domain/test/passwords.test.ts`, "is refused under the policy's shortest length and over its longest"; ADR-402; confirmed, ADR-515) |
| 6.2.10 | 2 | a password stays valid until compromised or rotated by the user | AC-10-23 (task 2.2.2) |  |
| 6.2.11 | 2 | context-specific word list used against guessable passwords |  | **built**: as 6.1.2 (the same test; ADR-403; confirmed, ADR-515) |
| 6.2.12 | 2 | passwords checked against breached sets | AC-10-24 (task 2.2.2, 2.4.3) |  |
| 6.3.1 | 1 | controls against credential stuffing and brute force | AC-10-18, AC-10-22, AC-02-07, AC-02-23 (task 2.2.3, 2.4.3, 2.5.1, 2.5.2, 2.5.4, 2.6.2) |  |
| 6.3.2 | 1 | default accounts absent or disabled | AC-10-17 (task 2.2.3) |  |
| 6.3.3 | 2 | multi-factor, or a combination of single factors |  | **the firm's choice, to build** (the user, ADR-511): back-office staff need two-step (AC-02-14) and a monitor's password works only from a proven phone (ADR-441); a viewer's two-step is optional today, each viewer's own choice (ADR-170), and the firm will be able to require it (BACKLOG C157). Shipped default: optional |
| 6.3.4 | 2 | no undocumented authentication pathways | AC-10-27 (task 2.7.3 part 3; read as answering it, ADR-513) |  |
| 6.4.1 | 1 | initial passwords and activation codes securely random |  | **departure**, kept (the user, ADR-511): a monitor's first password is the firm's practice (their phone number without the area code), the accepted risk of ADR-105 and ADR-139, exempt by ADR-402 (5) |
| 6.4.2 | 1 | no password hints or secret questions |  | not used: no password hint or secret question: no such field in the schema (`packages/db/prisma/schema`; grep, ADR-514) |
| 6.4.3 | 2 | a secure reset that bypasses no enabled factor | AC-10-25 (task 2.2.2) |  |
| 6.4.4 | 2 | a lost factor: identity proofed again | AC-10-26 (task 2.2.4) |  |
| 6.5.1 | 2 | lookup secrets, out-of-band codes and TOTPs usable once |  | **built**: an authenticator's code is good once (`apps/api/test/two-step.test.ts`, "a code is good once"; ADR-412; confirmed, ADR-515) |
| 6.5.2 | 2 | lookup secrets under 112 bits protected in storage |  | not used: no lookup secret (no recovery code): a lost authenticator is cleared by an admin (AC-10-26); nothing of the kind in the schema (grep, ADR-514) |
| 6.5.3 | 2 | lookup secrets and TOTP seeds generated securely |  | **built**: 20 random bytes from the system's source (`apps/api/test/one-time-codes.test.ts`, "a new secret is twenty random bytes, never the same twice"; ADR-412; confirmed, ADR-515) |
| 6.5.4 | 2 | lookup secrets and out-of-band codes: at least 20 bits of entropy |  | not used: no lookup secret and no out-of-band code (no SMS, voice or email factor; AC-10-25, 26); a password reset's code is a 256-bit signature, not a factor (`apps/api/src/sign-in/reset-codes.ts`; ADR-404, 514) |
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
| 7.1.1 | 2 | inactivity timeout and maximum lifetime documented |  | **built**: documented: thirty minutes' inactivity, twelve hours at most, a five-minute access token, a monitor's session twelve hours (`packages/domain/policy.env`: `SESSION_INACTIVITY_MINUTES`, `SESSION_OVERALL_HOURS`, `ACCESS_TOKEN_MINUTES`, `MONITOR_SESSION_HOURS`; ADR-408) |
| 7.1.2 | 2 | concurrent sessions per account documented |  | **built**: documented, no limit on how many (ADR-408); `apps/api/test/sessions.test.ts`, "a person may hold two sessions at once" (confirmed, ADR-515) |
| 7.1.3 | 2 | session-creating systems in a federation documented |  | not used: no federated identity |
| 7.2.1 | 1 | session tokens verified by a trusted backend |  | **built**: every token is read and checked by the API itself, and the session or phone it names read from the database, on every request (V9's note; `apps/api/test/session-tokens.test.ts`, `phone-proof.test.ts`; ADR-408, 440) |
| 7.2.2 | 1 | tokens dynamically generated, not static keys |  | **built**: each session's and each phone's tokens are made when it opens (`apps/api/test/session-tokens.test.ts`, "AC-10-10 is its session and 32 random bytes"; `phone-proof.test.ts`, "AC-05-03 names its phone, runs out by itself, and is new each time"; ADR-408, 440; confirmed, ADR-515) |
| 7.2.3 | 1 | reference tokens unique, from a CSPRNG, 128 bits or more | AC-10-10 (task 2.2.1) |  |
| 7.2.4 | 1 | a new token on any authentication; the old one ended | AC-10-13 (task 2.2.3) |  |
| 7.3.1 | 2 | re-authentication after inactivity |  | **built**: a session ends after thirty quiet minutes (`apps/api/test/sessions.test.ts`, "ends after thirty minutes with nothing asked of it"; ADR-408; confirmed, ADR-515) |
| 7.3.2 | 2 | re-authentication after the maximum lifetime | AC-10-12 (task 2.2.3) |  |
| 7.4.1 | 1 | a terminated session blocked, for each token kind | AC-10-14, AC-10-15 (task 2.2.3) |  |
| 7.4.2 | 1 | sessions ended when an account is disabled or deleted |  | **built**: an archive or a password set anew ends every session, a monitor's sign-ins on phones too (`apps/api/test/phone-sign-ins.test.ts`, "ASVS 7.4.2 when an admin sets their password anew or archives them"; `sessions.test.ts`, "ends at once for a person who is archived"; ADR-410, 443; confirmed, ADR-515) |
| 7.4.3 | 2 | option to end other sessions after a factor change |  | **built**: always, not as an option: a changed password or a cleared authenticator ends the person's other sessions (`apps/api/test/sessions.test.ts`, "is changed by its owner…": the other session refused; `two-step.test.ts`, "AC-10-26 … he is signed out everywhere"; ADR-410, 415; the test cited anew, ADR-515: the row named only the source) |
| 7.4.4 | 2 | visible logout on every page that needs sign-in |  | Phase 4 (web apps; THREAT-MODEL §6) |
| 7.4.5 | 2 | administrators can end a user's sessions |  | **built**: `POST /people/:userId/session-endings` (`apps/api/test/people.test.ts`, "an admin ends anybody's sessions"; ADR-415; confirmed, ADR-515) |
| 7.5.1 | 2 | full re-authentication before changing authentication details |  | **built** for the master passcode: the admin gives their own password (`apps/api/test/phones.test.ts`, "a session is not enough (ASVS 7.5.1)"; ADR-428); a person's own password: 6.2.3 (confirmed, ADR-515) |
| 7.5.2 | 2 | users see and end their own active sessions |  | Phase 4: an endpoint and its screen where a person sees their own sessions and ends one; today an admin ends a person's (7.4.5) (ADR-514) |
| 7.6.1 | 2 | federated lifetimes behave as documented |  | not used: no federated identity |
| 7.6.2 | 2 | a session created only by an explicit action |  | not used: the item is federated re-authentication's (V7.6), and there is none (ADR-514) |

### V8 Authorization

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 8.1.1 | 1 | rules for function-level and data-level access documented | AC-10-27 (task 2.7.3 part 3; read as answering it, ADR-513) |  |
| 8.1.2 | 2 | rules for field-level access documented | AC-10-30, 35 (tasks 2.4.5; read as answering it, ADR-513) |  |
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
| 9.1.2 | 1 | only allow-listed algorithms create and verify a token; never "None" |  | **built**: one algorithm, fixed in the code; no token names its own (`session-tokens.ts`, `phone-tokens.ts`, `phone-challenges.ts`); held by `apps/api/test/session-tokens.test.ts`, "can't be made or changed by anybody else" and "reads nothing from what isn't shaped like one", and `phone-proof.test.ts`, "AC-10-46 is the server's own, for that purpose alone" (the tests cited anew, ADR-515) |
| 9.1.3 | 1 | key material from trusted, pre-configured sources only |  | **built**: every key is drawn from the installation's signing secret; none is taken from a token (§5.6); a token another secret signed is refused (`session-tokens.test.ts`, "another secret"; `phone-proof.test.ts`, "one another installation made"; the tests cited anew, ADR-515) |
| 9.2.1 | 1 | a token taken only within its validity time span | AC-10-12 (task 2.2.3) |  |
| 9.2.2 | 2 | a token checked to be of the right type and purpose | AC-10-46 (task 2.5.1, 2.6.5) | the access token: `apps/api/test/session-tokens.test.ts` (another purpose's signature is refused) |
| 9.2.3 | 2 | a service takes only tokens meant for it (audience) |  | not used: each token is taken only by the API that signed it; none goes to another service |
| 9.2.4 | 2 | one issuer key for several audiences: the audience restricted |  | **built**: a key per purpose, so no token is taken for another (`session-tokens.test.ts`, "another purpose's signature"; `phone-proof.test.ts`, "a challenge, and one signed with the challenge's key"; confirmed, ADR-515) |

### V10 OAuth and OIDC, V17 WebRTC

Not used, whole: no OAuth or OpenID Connect client, resource server or authorization server (one login store, ARCHITECTURE §8), and no WebRTC (no OAuth, OIDC, SAML or WebRTC package in any workspace, nor in the product's source; grep). V10's 29 Level 1 and 2 items and V17's 7 are therefore not listed one by one; each would read "not used".

### V11 Cryptography

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 11.1.1 | 2 | key management policy and lifecycle documented |  | **built** (written): §5.6, every key, its life and how it is replaced (ADR-515) |
| 11.1.2 | 2 | inventory of keys, algorithms and where keys may be used | AC-10-44, AC-02-61 (task 2.4.3, 2.5.1, 2.6.5) |  |
| 11.2.1 | 2 | industry-validated cryptographic implementations |  | **built**: only Node's own cryptography, `node:crypto` (OpenSSL), Argon2id included; no other cryptographic package in any workspace (grep, ADR-514) |
| 11.2.2 | 2 | crypto agility: algorithms and keys can be replaced |  | **built** (written): §5.6, "Agility": what is kept names its algorithm and key; replacing a key in place with its data re-sealed is not built, proposed for Phase 5a (REQ-517; ADR-515) |
| 11.2.3 | 2 | primitives give at least 128 bits of security |  | **built**: every primitive at 128 bits or more (the list, below the table; ADR-514) |
| 11.3.1 | 1 | no ECB mode or PKCS#1 v1.5 padding |  | **built**: no ECB, no RSA and no PKCS#1 v1.5 anywhere (the list, below the table; grep, ADR-514) |
| 11.3.2 | 1 | only approved ciphers and modes |  | **built**: AES-256-GCM alone (the list, below the table; ADR-514) |
| 11.3.3 | 2 | encrypted data protected against modification |  | **built**: what is encrypted is AES-256-GCM, authenticated, a random 12-byte nonce each time (`apps/api/src/sign-in/two-step-secrets.ts`, `apps/api/src/phone/offline-checks.ts`; ADR-412, 454, 514) |
| 11.4.1 | 1 | only approved hash functions | AC-10-10 (task 2.2.1) | **departure proposed** (ADR-514, for the user): an authenticator's code is HMAC-SHA-1, as RFC 6238 and the authenticator apps have it; the published Appendix C rates HMAC-SHA-1 "legacy", kept "for compatibility" only. Every other use is SHA-256 |
| 11.4.2 | 2 | passwords hashed with a computationally intensive function | AC-10-20, AC-02-41 (task 2.2.2, 2.5.3) |  |
| 11.4.3 | 2 | integrity hashes collision resistant |  | **built**: SHA-256 for every file's and record's fingerprint, the only hash taken alone (AC-10-47; grep, ADR-514) |
| 11.4.4 | 2 | keys derived with stretching resistant to brute force |  | **built**: a key from a password is Argon2id's (a person's password, the master passcode, a phone's offline check; ADR-402, 454); every other key is an HMAC of the installation's random secret, never a password (ADR-514) |
| 11.5.1 | 2 | random values from a CSPRNG with 128 bits of entropy | AC-10-45, AC-02-18, AC-05-03 (task 2.5.1, 2.6.2) |  |
| 11.6.1 | 2 | approved algorithms for key generation and signatures |  | **built** for signatures: ECDSA on P-256 with SHA-256 (`apps/api/test/phone-proof.test.ts`, "AC-10-44 is taken as the public half of a P-256 key" and "is refused when it isn't a public key of the kind"; ADR-437); keys are made by the phone's own hardware (Phase 3) (confirmed, ADR-515) |

**Every primitive the product uses** (11.2.3, 11.3.1…11.3.3; read by grep of `apps`, `packages` and `tools` on 2026-10-14, ADR-514), each by its rating in ASVS 5.0's Appendix C ("A" approved, "L" legacy). All are `node:crypto`'s; no other cryptographic package is a dependency.

| Primitive | Where | Strength | Appendix C |
|---|---|---|---|
| HMAC-SHA-256 | the access token, a phone's token and challenge, a password reset's code, each purpose's key drawn from the installation's secret (`session-tokens.ts`, `phone-tokens.ts`, `phone-challenges.ts`, `reset-codes.ts`, `password-hasher.ts`, `two-step-secrets.ts`, `offline-checks.ts`; `tools/setup/src/secrets.ts`) | a 256-bit key | A |
| HMAC-SHA-1 | an authenticator's six-digit code, RFC 6238 (`one-time-codes.ts`) | a 160-bit random seed (6.5.3) | **L**: 11.4.1's departure, proposed |
| SHA-256 | every file's and record's fingerprint, a token's stored hash, the rate limits' keys (`photo-files.ts`, `photograph-files.ts`, `map-files.ts`, `sync.ts`, `session-tokens.ts`, `limits.ts`) | 256-bit output | A |
| AES-256-GCM | an authenticator's seed at rest, a phone's offline checks (`two-step-secrets.ts`, `offline-checks.ts`), a random 12-byte nonce each time | a 256-bit key, authenticated | A |
| ECDSA P-256 with SHA-256 | a phone's proof of itself (`device-keys.ts`) | 128 bits | A |
| Argon2id | a person's password, the master passcode, a phone's offline check (`password-hasher.ts`, `offline-checks.ts`) | OWASP's setting, 19 MiB, 2 passes (ADR-402) | A |

No ECB, no RSA and no PKCS#1 padding anywhere (grep).

### V12 Secure Communication

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 12.1.1 | 1 | only current TLS versions | AC-10-03 (task 2.1.2) |  |
| 12.1.2 | 2 | recommended cipher suites, the strongest preferred |  | **built** (local): Caddy's own suites, TLS 1.2 and 1.3 only, forward-secret AEAD (`infra/local/Caddyfile` names none of its own; AC-10-03's test); the deploy's, Phase 5a (REQ-517) (ADR-514) |
| 12.1.3 | 2 | client certificates validated before their identity is used |  | not used: no mutual-TLS client certificates; a phone proves itself by its key (AC-10-44, 45) |
| 12.2.1 | 1 | TLS for every client connection to external HTTP services, no fallback | AC-10-01, AC-10-02 (task 2.1.2) |  |
| 12.2.2 | 1 | publicly trusted certificates for external services |  | Phase 5a (demo deploy; THREAT-MODEL §6) |
| 12.3.1 | 2 | an encrypted protocol for every connection, no fallback | AC-10-01, AC-10-02 (task 2.1.2) |  |
| 12.3.2 | 2 | TLS clients validate the server's certificate |  | **built**: each TLS client the API and the worker hold (the address server, the map servers, the object store) checks the server's certificate against the root its setting names; none turns the check off (grep: no `rejectUnauthorized`; `apps/worker/test/container.test.ts`, `apps/api/test/media-store.test.ts`; ADR-455, 480) |
| 12.3.3 | 2 | internal HTTP-based connections encrypted, no fallback |  | **to do**, part 5 (the user, ADR-513; KD-78) |
| 12.3.4 | 2 | internal certificates trusted only specifically |  | **built**: as 12.3.2, the stack's own root named exactly (`ADMS_MAP_CA_FILE`, `ADMS_MEDIA_CA_FILE`), never added to a trust store (ADR-514) |

### V13 Configuration

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 13.1.1 | 2 | communication needs, external services and endpoints documented |  | **built** (written): §5.5, what each service talks to (ADR-515) |
| 13.2.1 | 2 | backend services authenticate with their own accounts or short-lived credentials |  | **built**: each service its own login: the database's (`packages/db/test/grants.test.ts`), the API's own identity at the object store (`apps/api/test/media-store.test.ts`; ADR-480), one settings file per container (`infra/local/compose.yaml`) |
| 13.2.2 | 2 | backend accounts with the minimum privileges | AC-10-49, AC-10-56 (task 2.6.4, 2.7.3) |  |
| 13.2.3 | 2 | no default or well-known service credentials |  | **built**: the installer makes every secret at random (`tools/setup/test/secrets.test.ts`), and the local accounts are held out of what ships (`infra/local/test/dev-accounts.test.ts`) (ADR-514) |
| 13.2.4 | 2 | allow-list of external resources the app may reach | AC-10-64 (task 2.7.3 part 4, ADR-513) |  |
| 13.2.5 | 2 | server allow-list of systems it may send requests to | AC-10-64 (task 2.7.3 part 4, ADR-513) |  |
| 13.2.6 | 3 | service connections configured: limits, timeouts, retries | AC-10-42 (task 2.1.4) |  |
| 13.3.1 | 2 | secrets kept in a manager, out of source and artifacts |  | T-51: `tools/setup/test/secrets.test.ts` and `pnpm security` (ADR-508) |
| 13.3.2 | 2 | least-privilege access to secrets |  | **built**: as 13.2.1, each container reads only its own settings file, as a secret, never in its description (`infra/local/compose.yaml`) (ADR-514) |
| 13.4.1 | 1 | no source-control metadata deployed |  | **built** (local): the containers run the built code and its dependencies, mounted by name, no checkout (`infra/local/compose.yaml`; `packages/scenarios/test/app-exports.test.ts`; ADR-503); the image a firm deploys, Phase 5a (REQ-517) |
| 13.4.2 | 2 | debug modes off in production |  | **built**: `NODE_ENV: production` in both containers, and no debug endpoint (AC-10-27's list, `every-endpoint.test.ts`) (ADR-514) |
| 13.4.3 | 2 | no directory listings |  | not used: the API serves no file from disk (no static-file plugin; grep), and the proxy only passes requests on (`reverse_proxy`; no `file_server` in `infra/local/Caddyfile`) (ADR-514) |
| 13.4.4 | 2 | HTTP TRACE disabled in production | AC-10-61 (task 2.7.3 part 4, ADR-513) |  |
| 13.4.5 | 2 | documentation and monitoring endpoints hidden unless intended | AC-10-36 (task 2.1.3, 2.6.1) |  |

### V14 Data Protection

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 14.1.1 | 2 | sensitive data classified into protection levels |  | **built** (written): §5.8, four levels (ADR-515) |
| 14.1.2 | 2 | protection requirements documented per level |  | **built** (written): §5.8, each level's protection (ADR-515) |
| 14.2.1 | 1 | sensitive data kept out of URLs and query strings | AC-10-64 (task 2.7.3 part 4, ADR-513) |  |
| 14.2.2 | 2 | sensitive data not cached by servers, or purged |  | **built** (the API): `Cache-Control: no-store` on every answer (AC-10-04; `apps/api/test/door.test.ts`); a CDN, Phase 5a (REQ-517) (ADR-514) |
| 14.2.3 | 2 | sensitive data not sent to untrusted third parties |  | **built** (written): §5.5, personal data only to the firm's own servers (ADR-515) |
| 14.2.4 | 2 | sensitive-data controls (logs included) per protection level | AC-10-11 (task 2.2.1) |  |
| 14.2.6 | 3 | only the minimum sensitive data returned; full values masked | AC-02-72 (task 2.2.5) |  |
| 14.3.1 | 1 | authenticated data cleared from client storage when a session ends | AC-02-58 (task 2.6.5) |  |
| 14.3.2 | 2 | anti-caching headers (no-store) on sensitive responses | AC-10-04 (task 2.1.3) |  |
| 14.3.3 | 2 | sensitive data kept out of browser storage |  | Phase 3 (phone) and Phase 4 (web apps) |

### V15 Secure Coding and Architecture

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 15.1.1 | 1 | remediation timeframes for components documented |  | Phase 5a: how quickly a dependency's fix is taken up, in the operator's guide (REQ-517); every dependency pinned by an ADR today (ADR-514) |
| 15.1.2 | 2 | inventory of third-party components |  | **built**: the lockfile, and `pnpm licences` (every package by name, version and licence) (ADR-514) |
| 15.1.3 | 2 | resource-heavy functions documented |  | **built** (written): §5.4, the heavy functions, bounded and measured (ADR-515) |
| 15.2.1 | 1 | components within their documented update timeframes |  | Phase 5a: as 15.1.1 (REQ-517) (ADR-514) |
| 15.2.2 | 2 | defence against availability loss from heavy functions | AC-10-39 (task 2.1.3) |  |
| 15.2.3 | 2 | production holds only the functionality it needs |  | **built** (local): as 13.4.1: no tests, tools or source control in a container (`app-exports.test.ts`; ADR-503); the image, Phase 5a (REQ-517) |
| 15.3.1 | 1 | only the required fields of an object returned | AC-10-30 (task 2.4.5) |  |
| 15.3.2 | 2 | backend calls do not follow redirects unless intended |  | **to do**, part 5: its test needs an HTTPS server of its own (ADR-513 (e)) |
| 15.3.3 | 2 | mass assignment prevented by allowed fields per action | AC-10-34, AC-10-35 (task 2.1.3, 2.4.4, 2.6.1) |  |
| 15.3.4 | 2 | real client IP from trusted fields, used for rate limits |  | **built**: as 4.1.3 (the same test; C85; ADR-416; confirmed, ADR-515) |
| 15.3.5 | 2 | variables type-checked; strict equality |  | **built**: TypeScript `strict`, typescript-eslint's `strictTypeChecked`, and ESLint's `eqeqeq` (`== null` alone kept) (`eslint.config.js`; ADR-514) |
| 15.3.6 | 2 | prototype pollution prevented | AC-10-58 (task 2.7.3 part 4, ADR-513) |  |
| 15.3.7 | 2 | HTTP parameter pollution defended | AC-10-57 (task 2.7.3 part 4, ADR-513) |  |
| 15.4.1 | 3 | shared objects in threads accessed safely | AC-10-52 (task 2.3.2) |  |
| 15.4.2 | 3 | a state check and the action on it are one atomic operation | AC-10-50, AC-10-53 (task 2.3.1, 2.3.2, 2.3.3) |  |

### V16 Security Logging and Error Handling

| Requirement | Level | Label, as read | Answered by | Owner, or open |
|---|---|---|---|---|
| 16.1.1 | 2 | logging inventory per stack layer |  | **built** (written): §5.7, the log inventory (ADR-515) |
| 16.2.1 | 2 | each log entry carries when, where, who and what | AC-10-32, AC-10-43, AC-02-38, AC-05-40 (task 2.1.2, 2.1.3, 2.5.4) |  |
| 16.2.2 | 2 | time sources synchronized; UTC or explicit offsets | AC-05-04, AC-06-58 (task 2.6.2) |  |
| 16.2.3 | 2 | logs written only to documented places |  | **built** (written): §5.7, every log written only where it says; no service writes a log file (grep, ADR-515) |
| 16.2.4 | 2 | logs readable by a common format |  | **built** (written): §5.7, the two services' lines JSON, the tables by SQL (ADR-515) |
| 16.2.5 | 2 | credentials never logged; tokens hashed or masked | AC-10-11, AC-10-32 (task 2.1.2, 2.2.1) |  |
| 16.3.1 | 2 | every authentication logged, successful or failed | AC-10-19, AC-10-22, AC-02-23 (task 2.2.1, 2.2.3, 2.4.3, 2.5.1, 2.5.4, 2.6.2) |  |
| 16.3.2 | 2 | failed authorization logged | AC-10-66 (task 2.7.3 part 4, ADR-513) |  |
| 16.3.3 | 2 | defined security events and bypass attempts logged | AC-10-66 (task 2.7.3 part 4, ADR-513) |  |
| 16.3.4 | 2 | unexpected errors and control failures logged |  | **built**: an unexpected error logged with its kind and frames, the caller told only that it failed (AC-10-33; `apps/api/test/error-filter.test.ts`) (ADR-514) |
| 16.4.1 | 2 | log injection prevented | AC-10-62 (task 2.7.3 part 4, ADR-513) |  |
| 16.4.2 | 2 | logs protected from unauthorized access and change |  | Phase 5a: logs kept where only the operator reads them (REQ-517; THREAT-MODEL §6) (ADR-514) |
| 16.4.3 | 2 | logs sent to a separate system for analysis and alerts |  | Phase 5a (demo deploy; THREAT-MODEL §6) |
| 16.5.1 | 2 | generic message to the caller on unexpected or sensitive errors | AC-10-33, AC-10-38 (task 2.1.2, 2.4.2) |  |
| 16.5.2 | 2 | operation continues safely when an external resource fails |  | **built**: the address server not answering, the phone is told so and the monitor types the address (AC-04-24; `apps/api/test/phone-address-lookups.test.ts`); a map server not answering is a fault, never "no route", and the job waits for its next try (`apps/worker/test/mileages.test.ts`, `job-loop.test.ts`; ADR-418); the object store not answering, the part is the server's failure, nothing is called kept, and the phone sends the file again (`apps/api/test/photo-files.test.ts`, "16.5.2"; ADR-514) |
| 16.5.3 | 2 | fails securely on exceptions; no fail-open | AC-10-55 (task 2.1.2, 2.3.2) |  |

## 3. What the page leaves for the user

**The 78 open ASVS items were answered by the user on 2026-10-14 (ADR-513): §3.1 approved whole.** 21 are answered by a scenario now (task 2.7.3 part 4), 40 more are marked built, owned by a phase or not used (part 4's second piece, ADR-514), and 14 are written (§5; part 4's third piece, ADR-515); the other 3 are **to do** in part 5 (the Owner column). API10:2023's last two answers are proposed (§5.9), for the user.

**The four the user settled (2026-10-14, ADR-511):**

- **4.1.2:** plain HTTP is refused at the API's address, never redirected; a web page's name keeps the redirect. Built (AC-10-02).
- **3.4.1 at Level 2:** HSTS includes subdomains, at the API and the proxy. Built (AC-10-04). It binds only names under the host that sends it.
- **6.3.3:** the firm chooses whether a read-only viewer must use two-step; optional as shipped. To build (BACKLOG C157): today it is each viewer's own choice, and no firm-wide setting exists yet.
- **6.4.1:** a monitor's first password stays the accepted risk of ADR-105 and ADR-139.

### 3.1 The 78, each with its answer (proposed by ADR-512; approved by the user, ADR-513)

Each item that was open, with what the agent proposed. **User, 2026-10-14:** "those all make sense so approved all". Each kind is built as it says, in task 2.7.3 part 4 (12.3.3 and 15.3.2 in part 5). The kinds: **scenario**, a file 10 row and its test, built in part 4 (expected to pass on today's code where the evidence says so); **built**, what today's code already does, its test named or to be written in part 4; **docs**, a written answer (a section of ARCHITECTURE or this page), part 4; a **phase** that owns it; **not used**, with its evidence; **for the user**, where the choice is theirs.

| Item | Proposed | Kind | Evidence, read 2026-10-14 |
|---|---|---|---|
| 1.1.1 | A path or query sent encoded twice is refused, never decoded a second time | scenario | Fastify decodes a URL once; the contracts' schemas read the decoded value |
| 1.1.2, 1.2.1, 1.2.3 | Every answer is JSON written by the serializer, never built by hand: a stored value holding `</script>`, quotes or a line break comes back as a JSON string, under `application/json` | scenario | AC-10-04 (`Content-Type` on every answer); the error filter's answers |
| 1.2.2 | The address server's and the map servers' requests are built from coordinates held to their form, never from text a caller sent | scenario (with AC-04-24) | `apps/api/src/phone/address-server.ts` (the two coordinates held to their form again before the request) |
| 1.3.3 | Data sanitized before a dangerous context: the exports' spreadsheet cells (formula injection) | Phase 4 (exports) | no export exists yet |
| 1.3.5, 1.3.7 | No template, Markdown, CSS or XSL is taken, and no template engine runs | not used | no template engine in any workspace; mail text is the code's own (grep, to confirm in part 4) |
| 1.3.10 | No format string is built from a caller's input | not used | no `util.format` in the API's source (grep); the log's messages are fixed strings |
| 1.3.11 | A message goes only to an address the database holds, taken by the email schema; a name with a line break can't add a header | scenario | `apps/api/src/sign-in/mail.ts` |
| 1.4.2 | A number past a column's range (a load call of 2³¹, a quantity of 10³⁰) is refused 400, never a 500 | scenario | the contracts' number schemas |
| 1.5.2, 15.3.6 | A body is read only by `JSON.parse` and then its schema; one holding `__proto__` or `constructor.prototype` is refused and pollutes nothing | scenario | Fastify's parser refuses prototype poisoning by default; the schemas are strict objects |
| 15.3.7 | A query key sent twice is refused 400 | scenario | the query schemas take one string per key |
| 2.1.2, 2.1.3 | The rules of consistency and the limits are documented where they live: each endpoint's schema (`packages/contracts`, the OpenAPI description) and the policy values (`packages/domain/policy.env`) | docs | AC-10-36 |
| 2.3.1 | Steps in order: a person whose password somebody else set changes it before anything else; an admin or manager/analyst sets an authenticator up first | built | `sessions.test.ts` (ADR-410), `two-step.test.ts` (ADR-412); the door's `PASSWORD_CHANGE_REQUIRED`, `TWO_STEP_SETUP_REQUIRED` |
| 2.3.4 | Locks on what is limited: a number series' blocks and the cert numbers, taken under the database's locks | built | ADR-505 (`SeriesMovedOn`; the story `burst`) |
| 3.5.2 | A write sent as a simple request (a form, plain text) is refused: only `application/json` or a file part is read | scenario | the boundary's `UNSUPPORTED_MEDIA_TYPE` (ADR-385) |
| 3.5.4 | The API and each web app on a hostname of its own | Phase 4 and 5a | the local stack's `api.adms.localhost` and `adms.localhost` |
| 4.2.1 | Every component hardened, the proxy included: no capability, a read-only root, an unprivileged user, pinned images | built (local), 5a (the deploy) | `infra/local/compose.yaml` (`cap_drop: ALL`, `read_only`, `user: 1000:1000`, digests) |
| 5.1.1 | The two uploads documented: a photograph (JPEG, HEIC, HEIF, PNG, TIFF by its first bytes; its size limit) and a map's file (zipped shapefile or GeoJSON; 16 MiB) | docs | ADR-482, 485 |
| 5.4.3 | A file is never run, never answered inline and never opened by the server but a map's file, read by its own reader; scanning for malware is left to the firm's store | an accepted risk now; a scan the firm may add in 5a (the user, ADR-513) | AC-10-48 |
| 6.1.3 | Every way in, documented in one table: a person's password and authenticator, a session's refresh, a password reset, a phone's proof, a monitor on a phone, the master passcode | docs (ARCHITECTURE §6) | ADR-408, 412, 437, 443, 462 |
| 6.3.4 | No way in that table doesn't name | scenario | AC-10-27's inventory (`every-endpoint.test.ts`, ADR-512) |
| 6.4.2 | No password hint or secret question | not used | no such field in the schema (`user`, `user_credential`) |
| 6.5.2, 6.5.4 | Lookup secrets (recovery codes) and out-of-band codes | not used | none: a lost authenticator is cleared by an admin (AC-10-26); no SMS, voice or email factor |
| 7.1.1 | The thirty minutes' inactivity and the maximum lifetime documented | built | ADR-408; `packages/domain/policy.env` |
| 7.2.1 | Every token is read and checked by the API itself, against the database, on every request | built | V9's note; `session-tokens.test.ts`, `phone-proof.test.ts` |
| 7.5.2 | A person sees their own sessions and ends one | Phase 4 (an endpoint and its screen) | today an admin ends a person's sessions (7.4.5) |
| 7.6.2 | A session made only by an explicit sign-in | not used | the item is federation's; there is none |
| 8.1.1 | Who may call each endpoint, documented and held whole | scenario | AC-10-27 (`every-endpoint.test.ts`, ADR-512), ARCHITECTURE §6 |
| 8.1.2 | Which fields each reader is shown, documented | scenario | AC-10-30, AC-10-35 (a viewer's columns, ADR-434, 435) |
| 11.1.1, 11.2.2 | Each key, its life and how it is replaced, documented: the token signing secret, the two-step sealing key, the offline checks' seed, a phone's key, the master passcode's versions | docs | `apps/api/src/sign-in/session-tokens.ts`, `two-step-secrets.ts`, `apps/api/src/phone/offline-checks.ts`; ADR-428, 437 |
| 11.2.1 | Only Node's own cryptography (OpenSSL) and the Argon2 library | built | `node:crypto` throughout (grep) |
| 11.2.3, 11.3.1, 11.3.2, 11.3.3 | Every primitive listed: HMAC-SHA-256, ECDSA P-256, AES-256-GCM (authenticated, a random nonce each time), SHA-256, Argon2id; no ECB, no PKCS#1 v1.5 | built (listed in part 4) | `two-step-secrets.ts` and `offline-checks.ts` (`aes-256-gcm`) |
| 11.4.3 | Integrity hashes collision resistant | built | SHA-256 for every file and record fingerprint (AC-10-47) |
| 11.4.4 | Keys derived from secrets: each purpose's key is an HMAC of the installation's secret, which is random and long (not a password); passwords and the passcode under Argon2id | built | `offline-checks.ts`, `session-tokens.ts`; ADR-402 |
| 12.1.2 | The proxy's cipher suites: Caddy's defaults (TLS 1.2 and 1.3, forward-secret AEAD suites) | built (local), 5a (the deploy) | `infra/local/Caddyfile` |
| 12.3.2, 12.3.4 | The API's and the worker's TLS clients check the server's certificate against the stack's own root, named exactly | built | `ADMS_MAP_CA_FILE`, `ADMS_MEDIA_CA_FILE` (`compose.yaml`) |
| 12.3.3 | Every internal connection encrypted, locally too: no hop in plain HTTP, no data in flight unencrypted (the user, ADR-513; KD-78) | part 5 | the proxy reaches the API, the object store and the map servers in plain HTTP inside the stack's network, and the services reach Postgres without TLS |
| 13.1.1 | What the API talks to and why, documented | docs | ARCHITECTURE §4 lists the services |
| 13.2.1, 13.3.2 | Each service its own login and only its own secrets | built | the database's logins (`grants.test.ts`); the API's own identity at the object store (ADR-480); one env file per container (`compose.yaml`) |
| 13.2.3 | No default or well-known credential | built | the installer makes every secret at random; the dev accounts held out of what ships (`dev-accounts.test.ts`, AC-10-26) |
| 13.2.4, 13.2.5 | The API and the worker reach only the addresses their settings name; no request goes to an address a caller sent | scenario (with 1.3.6) | `ADMS_*_ADDRESS` settings; no URL in any endpoint's schema (to confirm in part 4) |
| 13.4.1, 15.2.3 | What runs is the built code and its dependencies only: no source control, no tests | built (local), 5a (the image) | `compose.yaml` mounts `dist` folders by name; `app-exports.test.ts` (ADR-503) |
| 13.4.2 | No debug mode in production | built | `NODE_ENV: production`; no debug endpoint (AC-10-27's inventory) |
| 13.4.3 | No directory listing | not used | the API serves no files from disk; the proxy runs no file server |
| 13.4.4 | `TRACE` (and any method not listed) answered 404 or 405 | scenario | `endpointMethods` is GET, POST, PUT, PATCH |
| 14.1.1, 14.1.2 | Sensitive data in levels, each with its protection: secrets (passwords, codes, tokens, the passcode), personal details (phone and licence numbers, an ROE owner), evidence | docs | AC-10-11, 32; AC-02-72 |
| 14.2.1 | No secret in any endpoint's path or query | scenario | AC-10-27's inventory: no path parameter or query names one (to confirm in part 4); ADR-463 |
| 14.2.2 | Nothing sensitive cached by a server | built (the API), 5a (a CDN) | `Cache-Control: no-store` on every answer (AC-10-04) |
| 14.2.3 | Sensitive data goes only to the firm's own servers (address, routing, object store, mail) | docs (with 13.1.1) | ARCHITECTURE §4 |
| 15.1.1, 15.2.1 | How quickly a dependency's fix is taken up, written down and kept | Phase 5a (the operator's guide) | dependencies pinned by ADR |
| 15.1.2 | The inventory of third-party components | built | the lockfile and `pnpm licences` |
| 15.1.3 | The heavy functions documented: a sync, a map's file, a reconciliation run | docs | ADR-504, 506 (measured) |
| 15.3.2 | A backend request never follows a redirect | scenario, part 5 (its test needs an HTTPS server of its own, which part 5's certificates give) | `address-server.ts` (a redirect throws); the worker's `map-servers.ts` (`node:https`, which follows none; a redirect is not 200) |
| 15.3.5 | Types checked and equality strict | built | TypeScript strict; ESLint's type-checked rules (to confirm `eqeqeq` in part 4) |
| 16.1.1, 16.2.3, 16.2.4 | The log inventory: one structured JSON line per event on standard output, per service; the security events in their table | built (written in part 4) | AC-10-32; ADR-399 |
| 16.3.2, 16.3.3 | A refusal at the door (no session, not allowed, a CSRF value missing, a phone not proven) logged with who and what, never a secret | scenario | to check in part 4: whether the door's refusals are logged today |
| 16.3.4 | An unexpected error logged, its kind and frames | built | AC-10-33 (`error-filter.test.ts`) |
| 16.4.1 | A line break or a quote in anything logged stays inside its JSON line | scenario | pino writes JSON |
| 16.4.2 | Logs kept where only the operator reads them | Phase 5a | THREAT-MODEL §6 |
| 16.5.2 | When an outside server fails, the request ends safely: the address server down answers the phone with no address; the map servers down sets the job aside to retry; the object store down refuses a file part to send again | built (cited in part 4) | AC-04-24; ADR-418, 482 |

**Done in part 4 (ADR-513):** 1.1.1, 1.1.2, 1.2.1, 1.2.2, 1.2.3, 1.3.11, 1.4.2, 1.5.2, 3.5.2, 6.3.4, 8.1.1, 8.1.2, 13.2.4, 13.2.5, 13.4.4, 14.2.1, 15.3.6, 15.3.7, 16.3.2, 16.3.3, 16.4.1: AC-10-57…66 added (their tests in `apps/api/test/boundary.test.ts`, `every-endpoint.test.ts`, `setup-endpoints.test.ts` and `packages/contracts/test/endpoints.test.ts`), and AC-10-27, 30, 35 and AC-04-24 read as answering the rest. Two were found not to hold and were fixed: a form's body was read like JSON (Nest's own parser; 3.5.2), and a project's setting past what its column holds answered 500 (1.4.2).

**Done in part 4's second piece (ADR-514):** 40 of the 57. **Not used**, each confirmed by grep: 1.3.5, 1.3.7, 1.3.10, 6.4.2, 6.5.2, 6.5.4, 7.6.2, 13.4.3. **A phase**, each told in its brief (`agent_store/REQUIREMENTS-LATER.md`, Phase 4's carried items and REQ-517): 1.3.3, 3.5.4, 7.5.2, 15.1.1, 15.2.1, 16.4.2, and 5.4.3 an accepted risk until 5a. **Built**, each test named: 2.3.1, 2.3.4, 7.1.1, 7.2.1, 11.2.1, 11.2.3, 11.3.1, 11.3.2, 11.3.3, 11.4.3, 11.4.4, 12.1.2, 12.3.2, 12.3.4, 13.2.1, 13.2.3, 13.3.2, 13.4.1, 13.4.2, 14.2.2, 15.1.2, 15.2.3, 15.3.5, 16.3.4, 16.5.2. Three were found short: **15.3.5**, strict equality was the habit but no rule held it (ESLint's `eqeqeq` added); **16.5.2**, no test had the object store away (one added); **4.2.1**, only the API, the worker, the mail catcher and the routing server were hardened as §3.1 said (moved to part 5). And one use of a legacy primitive was found: **11.4.1**, an authenticator's HMAC-SHA-1 (a departure proposed). **Still to do:** 14 written answers (2.1.2, 2.1.3, 5.1.1, 6.1.3, 11.1.1, 11.2.2, 13.1.1, 14.1.1, 14.1.2, 14.2.3, 15.1.3, 16.1.1, 16.2.3, 16.2.4), §2's 25 built items' rows, and API10's answers (part 4, next piece); 4.2.1, 12.3.3 and 15.3.2 (part 5).

**Done in part 4's third piece (ADR-515):** the 14 written answers (§5: 2.1.2, 2.1.3, 5.1.1, 6.1.3 in ARCHITECTURE §6, 11.1.1, 11.2.2, 13.1.1, 14.1.1, 14.1.2, 14.2.3, 15.1.3, 16.1.1, 16.2.3, 16.2.4); §2's 25 earlier built items each read again against the test it names, the test's own words quoted: 21 held as written, and 4 named only the source or nothing (7.4.3, 9.1.2, 9.1.3, and 6.1.1 a document), each now citing the test that holds it; API10's last two answers proposed (§5.9). Writing them found two things short: **11.2.2**, a key can't yet be replaced in place with its data re-sealed (proposed for 5a); **API10**, the worker reads the map servers' answers unbounded and unchecked (proposed for part 5).

The 25 earlier **built** items are tested and each row names its test; none has a file 10 row of its own (agent default, ADR-515: a cited test, as this page's rule for **built** allows). Part 3 (ADR-512) read AC-10-27 and REQ-204 whole and weighed C155's finding; it found KD-78 (12.3.3). The threat model's rows are checked against this page when it changes (`spec/THREAT-MODEL.md` §6).

## 4. How the list was made

- **The published texts:** OWASP ASVS 5.0.0, the chapter files at the `v5.0.0_release` tag of `OWASP/ASVS` (`5.0/en/`, read whole on 2026-10-14: 345 requirements); OWASP API Security Top 10 2023 (api-security.owasp.org). The chapter marks file 10 used before (written from memory, ADR-379) were replaced by the published numbers (ADR-509), and every number and level on this page was checked against the full text (ADR-510).

- **Which items are on the page:** every Level 1 and Level 2 item of every chapter, and the Level 3 items that file 10 cites; V10 and V17 are not used, whole, and named once. Levels above 2 are not checked.

- **The reach of each answer:** an item is answered by a scenario only when file 10 says so, in its Answers column (the same rows the tests name). An item an earlier task built and tested, citing it by number, is **built**, with that test and its ADR, never counted as answered. Nothing on this page is a claim the file or the cited test does not make.

- **The correction (ADR-509):** ADR-508 said ASVS V15 asks that data be reached only through the layer meant for it. The published V15 has no such item. The SQL requirement is 1.2.4 (queries through parameterized queries or the ORM), and the least-privilege requirement for each backend login is 13.2.2. ARCHITECTURE §16's list is unchanged.

- **The second correction (ADR-510):** the first version listed V1 only at 1.2.4, left out V9 (which the API's own signed tokens answer to), V10 and V17, called 22 built and tested items and two recorded departures "open", and named six items open that a file 10 row already answers (2.2.2, 3.3.3, 3.5.1, 12.2.1; and 3.4.4 and 14.3.2, the API's headers, AC-10-04). It marked 3.4.1 answered without its Level 2 part, missed 4.1.2's conflict with AC-10-02, and answered 2.3.1 (steps in order) with AC-10-35 and AC-05-08, which say nothing of order: AC-10-35 now answers 15.3.3 beside 8.2.3, and AC-05-08 (a submitted record isn't changed by sending it again) answers 8.2.2, as AC-02-45 does.

## 5. The written answers

✍️ *Agent-written (task 2.7.3 part 4, ADR-515), as §3.1 approved them (ADR-513).* The fourteen items whose answer is a page, each written down here or where §3.1 said, read from the code on 2026-10-14. Where writing one found something short, the answer says so and names who owns it.

### 5.1 Every way in (6.1.3)

ARCHITECTURE §6, "Every way in": one table of every way a person, a phone or a command is let in, which `every-endpoint.test.ts` holds the 120 endpoints to (AC-10-27, which also answers 6.3.4).

### 5.2 Consistency and limits (2.1.2, 2.1.3)

What may be sent, together and how much, is written where it is held, so the page and the code can't drift apart:

- **One field's form and its bounds:** each endpoint's own schemas in `packages/contracts` (a strict object, every string and list bounded, every number held to its column, AC-10-34, 36, 63), published as the OpenAPI description by `pnpm openapi` (`apps/api/openapi.json`).
- **Fields that must agree with each other, and with the records they name (2.1.2):** for the back office's setup and review, the domain's rules (`packages/domain`), asked inside the service's own piece of work and refused with a plain code (AC-10-37, 38); for what a phone records in the field, nothing is refused for disagreeing: a ticket's events are checked against each other and the setup after sync and **flagged** (invariant 19), each check's trigger and words in `spec/FLAGS.md` and its rule in `adms-validation`. The database's own constraints hold what must hold even if the code is wrong (ARCHITECTURE §5.4).
- **The limits (2.1.3):** every number a firm may change is a policy value with its reason beside it (`packages/domain/policy.env`: body and file sizes, sign-in tries, rate limits, timeouts, a run's size); a sync's own counts are the contract's (`packages/contracts/src/sync.ts`: 200 records, 200 photographs' records, 1 MiB as sent, 256 KiB a record). An installation may state its own value for any policy value, a whole number within the range the domain holds it to (`ranges` in `packages/domain/src/policy.ts`); one outside it stops the start and names its key.

### 5.3 The uploads (5.1.1)

Only two endpoints take a file (`file: true` in `packages/contracts/src/endpoints.ts`); every other body is JSON within the body limit.

| | A photograph's file, and its depth file | A map's file |
|---|---|---|
| **Endpoint, and who** | `PATCH /phones/current/photos/:photoId/files/:file` (`photo` or `depth`), a proven phone, only the one that took it, once its record is saved | `POST /projects/:projectId/map-files`, an admin or a manager/analyst holding *setup* |
| **Kinds** | JPEG, HEIC, HEIF, PNG or TIFF, told by its own first bytes (`packages/domain/src/photo-files.ts`); no name or type the phone says is read | a zipped shapefile (its `.shp`, `.dbf`, `.prj`; a projected one converted to longitude and latitude) or a GeoJSON file, told by its first bytes |
| **Extensions** | none taken: the file's place and its download name are the server's own, from the photograph's id (5.4.1) | none taken: a zip's parts are found by what they hold, a Mac's own copies left out |
| **Size** | 32 MiB a file, in parts of at most 4 MiB as `application/offset+octet-stream`, going on where the last ended; 256 MiB at most held in the API's memory across every phone; 300 parts a phone in the rate limits' minute | 16 MiB, sent whole; unzipped 64 MiB at most and 1,000 files, counted before any is unzipped |
| **Checked** | its size before it is read, then the whole file's SHA-256 against the record's; one that doesn't match is set aside for a person, and the phone sends it again | each layer read, a file that can't be read refused with why, never kept |
| **Kept** | once, at `projects/<project>/photos/<photograph>` in the object store; read back only as a download (AC-10-48) | once by its SHA-256, at `projects/<project>/maps/<SHA-256>` |
| **Where it is decided** | ADR-482, 483; AC-10-47, 48; `MEDIA_*` in the policy | ADR-485, 486; `MAP_FILE_*` in the policy |

### 5.4 The heavy functions (15.1.3)

What costs the server most, what bounds each, and what was measured. The defence against them is 15.2.2's (AC-10-39) and the rate limits (AC-10-40, 41).

| Function | Why it is heavy | Bounded by | Measured |
|---|---|---|---|
| **A sync** (`POST /phones/current/syncs`) | many records written in one request, each queuing its ticket's job | 1 MiB as sent, 200 records, 256 KiB a record (AC-10-41); 600 requests a phone a minute; the statement timeout (30 s) | the story `burst`: a thousand loads from 54 phones at once from one address, every record kept once (ADR-505) |
| **A photograph's file** | bytes held in memory while its parts come, and the whole file's SHA-256 | 4 MiB a part, 32 MiB a file, 256 MiB held across every phone (the longest waiting let go past it), 300 parts a phone a minute | 2,000 photographs in `burst` (ADR-505) |
| **A map's file** | a zip unzipped, every feature read, a projected one converted | 16 MiB sent, 64 MiB and 1,000 files unzipped, only the parts a layer needs unzipped; only the back office with *setup* | not yet on a firm's own files (Phase 4, `policy.env`) |
| **A password or passcode checked** | Argon2id at 19 MiB and 2 passes, on purpose | a sign-in's waits and lockout, the wrong tries counted by address and by login (AC-10-18, 40) | OWASP's setting (ADR-402) |
| **A phone's login list** | two slow hashes for each monitor a phone doesn't hold | 50 entries a call, the phone asking again (`LOGIN_LIST_ENTRIES_PER_CALL`); entries a phone holds are never made again | about four seconds for three hundred monitors (2026-10-09, ADR-454) |
| **A reconciliation run** (the worker) | every ticket's events, its neighbours, the map servers, the rules | 200 tickets a run, 10 minutes at most (`JOB_TICKETS_AT_MOST`, `RECONCILIATION_RUN_LONGEST_MINUTES`); 30 s a map server's answer | 200 tickets about 1.5 s, 1,000 about 7 s; the neighbour read about 4 ms a record; `burst`'s 4,631 jobs in 5 runs (ADR-506) |
| **A setup change** (a map loaded, a rate set) | every ticket of the project not locked queued again | one job, worked as runs of 200 | as a run |

### 5.5 What each service talks to (13.1.1, 14.2.3)

At run time the API and the worker talk only to the firm's own servers, each named by a setting, and to nothing a caller names (AC-10-64). No telemetry, no outside lookup: the breached-password list ships with the release (ADR-403).

| From | To | Why, and what goes | How |
|---|---|---|---|
| A phone, a browser | the proxy (Caddy), then the API | every request | HTTPS; HSTS; plain HTTP refused at the API's name (AC-10-01, 02) |
| The API | Postgres | its records, as `adms_api` and `adms_readonly` | its own login (§5.1); TLS in part 5 (KD-78) |
| The API | the object store | a photograph's and a map's file, put and read | HTTPS, its own identity, put and get only (ADR-480); the stack's root named exactly |
| The API | the address server (our own Nominatim) | a GPS point, for a phone's lookup | HTTPS, 5 s, the answer bounded and checked (AC-04-24) |
| The API | the firm's mail server, if it has one | a person's address, a reset's code, a notice | SMTP with TLS (`smtps`, or STARTTLS required); the local stack's catcher in plain SMTP until part 5 |
| The worker | Postgres | runs, completed records, flags, transactions, as `adms_worker` | its own login; TLS in part 5 |
| The worker | the routing server (our own Valhalla), the address server | a load's GPS points, for its mileage and address | HTTPS, 30 s an answer |
| The proxy | the API, the object store, the map servers, the mail catcher's page | requests passed on | plain HTTP inside the stack's network today: every hop encrypted in part 5 (KD-78) |
| The installer | Postgres | the roles, migrations and seed, as `adms_owner` | on the firm's own server; never a running service |

**Personal data goes nowhere else (14.2.3).** A GPS point goes only to the firm's own map servers; an email address only to the firm's own mail server. The local stack downloads its map extract once at `pnpm local:up` (its SHA-256 checked), sending nothing. A firm's own hosting (the demo deploy's Railway, Netlify and bucket) is its own processor's (REQ-517); the phone's side is Phase 3's.

### 5.6 Keys and their lives (11.1.1, 11.2.2)

In NIST SP 800-57's terms: what each key is, who makes it, where it is kept, how long it lives (its cryptoperiod), and how it is replaced. Every primitive is V11's table's.

| Key or secret | Made by, and kept | Used for | Life | Replaced, and what that costs |
|---|---|---|---|---|
| **The installation's signing secret** (`ADMS_TOKEN_SIGNING_SECRET`) | the installer, 32 random bytes, in `apps/api/.env` alone (owner-only); never in the database, never printed | nothing directly: a key for each purpose is drawn from it by HMAC-SHA-256 and a label (`open-adms/<purpose>/v1`): the access token, the CSRF value, a phone's token and challenge, a reset's code, the password key, the authenticators' and the offline seeds' seals, the login list's mark | the installation's: the installer never makes it again on a resume (ARCHITECTURE §4) | **not in place today** (below): a new one ends every token and code harmlessly, but every password must be set anew, every authenticator set up again and every phone's login list made again (ADR-411, 412) |
| **The password key** | drawn from the signing secret | Argon2id's secret input for every person's password (ADR-411) | as the signing secret | each hash names its key (`keyid=djE`); one under another key is made again at its owner's next sign-in, as one under lower settings is |
| **An authenticator's seed** | the API, 20 random bytes, per person; kept sealed with AES-256-GCM, bound to that person | their six-digit codes | until an admin clears it (AC-10-26) or the person sets one up again | cleared, then set up again at the next sign-in |
| **A monitor's offline seed** | the API, from their password, per monitor; kept sealed | their phones' login-list entries | until their password is set anew | made again with a new password; the phones' entries then fail their mark and are made again |
| **A phone's key** (ECDSA P-256) | the phone, in its own secure hardware; the server keeps the public half alone, one key one phone | a phone's proof of itself | from enrolment until turn-in, when it is revoked; a phone out of service proves nothing (ADR-441, 488, 495) | never re-keyed: a phone is enrolled anew with a new key |
| **The master passcode** | the firm, at the installer; kept as Argon2id versions, never edited; phones hold a check of one version | enrolment and a supervisor's acts | until an admin changes it | a new version, with the admin's own password (ADR-428); a phone takes the new check when it next reads its login list (ADR-454) |
| **Each service's database password, the object store's keys, the mail login** | the installer and `pnpm local:up`, at random, each in its own service's env file | that service's login alone (13.2.1) | the installation's | **not in place today**: a teardown and a new installation |

**Agility (11.2.2).** What is kept names how it was made, so a later algorithm or key can be told from today's: a password's or a passcode's hash is a PHC string carrying Argon2id's settings (and the key's id); a sealed seed begins `v1.`; every drawn key's label ends `/v1`; a phone's key kind is named once (`phoneKeyKind`). A hash made under weaker settings is made again at a sign-in (`stale`). **What is short:** a key cannot yet be replaced in place with its data re-sealed: replacing the signing secret, or a service's password, means what the table says. That is a command an operator runs (the new secret beside the old until every seed and hash is re-made under it), with the key in hardware ADR-411 left to the deploy: proposed for Phase 5a's operator's guide (REQ-517) (agent default, ADR-515).

### 5.7 The log inventory (16.1.1, 16.2.3, 16.2.4)

Every log is one of these, written only here; no service writes a log file (grep: the API's one file write is `pnpm openapi`'s description).

| Layer | Where | Format | What a line holds | What it never holds |
|---|---|---|---|---|
| **The API** | its standard output | one JSON object a line (pino), `service: "api"`, a numeric `level`, `time` in milliseconds since 1970 (UTC) | the request's id (the server's own), its method and path, the status; a refusal at the door or the boundary and why (AC-10-66); an error's kind and frames | a query, a header, a body, an error's message, a secret, a full personal detail (AC-10-32, 62) |
| **The worker** | its standard output | the same, `service: "worker"` | a run, a job, a project by id; a job set aside, coded `JOB_SET_ASIDE` | the same (AC-10-32) |
| **Security events** | the table `security_event`, copied into `audit_record` in the security domain | rows: kind, who, phone, request, when | every sign-in and failure, lockout, enrolment, switch, use of the master passcode, turn-in (ADR-399) | a password, a code, a token (AC-10-11) |
| **The audit log** | the table `audit_record`, written by the database alone | rows: before, after, fields changed, actor, source, phone, request, reason | every change to a tracked record (ARCHITECTURE §5.3) | a secret's value: it says that one changed (AC-10-11) |
| **The stack's own servers** (Caddy, Postgres, the object store, the mail catcher, the map servers) | each container's output (`docker compose logs`) | each server's own | their own starts and faults; Caddy keeps no access log (no `log` in `infra/local/Caddyfile`) | — |

A firm's tools read the two services' lines as JSON (16.2.4) and the tables by SQL. Where the logs are kept, who reads them and a separate system for alerts are the deploy's (16.4.2, 16.4.3; REQ-517). The phone's own log is Phase 3's.

### 5.8 The data's levels (14.1.1, 14.1.2)

Four levels, each with what protects it (agent default, ADR-515: the user may reclassify).

| Level | What | Protection |
|---|---|---|
| **1. Secrets** | the signing secret; each service's password and keys; the master passcode; a person's password; an authenticator's seed; a monitor's offline seed; every token, CSRF value and reset code; a phone's private key | never kept as given: slow-hashed (keyed), sealed, or kept only as a SHA-256; never logged, never in the audit log, a path or a query (AC-10-11, 32, 64); env files owner-only, one per service (13.3.2); the secrets scan (`pnpm security`, T-51); a phone's key never leaves its hardware |
| **2. Personal details** | a person's email address; a monitor's phone number; a driver's name, phone, licence number and state on a certification; an ROE's owner and parcel; a client's or contractor's contact; a caller's network address | shown only to whom it is for: a monitor's phone number to admins alone (AC-02-72), no read-only viewer sees a personal phone or licence number (ADR-169; AC-10-30, 35); never in full in a log (AC-10-32); a caller's network address held only in the API's memory, for the rate limits (at most `RATE_LIMIT_COUNTS_KEPT` counts), never logged or written, and a login typed held there only as its SHA-256; encrypted in flight (V12) |
| **3. The firm's business** | rates, pay items, rules, contracts | the back office, and the read-only viewers as ADR-169 has it (a client user or an auditor their whole project, a contractor user only its own tickets and transactions); never on a phone: a monitor never sees a rate or a code (invariant 20) |
| **4. Evidence** | field events, photographs and their GPS, certifications, ROEs, completed records, transactions | kept for good and never deleted (invariants 1, 2); every change audited with its actor (invariant 3); fingerprinted (SHA-256) and kept once; read by project, row-level security for viewers (ARCHITECTURE §5.5); `Cache-Control: no-store` on every answer (14.2.2) |

At rest, the database and the object store are the host's to encrypt, with their backups (ARCHITECTURE §4; REQ-517); the phone's own store is encrypted (Phase 3, ARCHITECTURE §8).

### 5.9 API10:2023: the map servers' and the mail sender's answers (proposed, ADR-515)

Read on 2026-10-14. **The address server's answer** is taken as API10 asks (AC-04-24): over HTTPS, its certificate checked, the whole exchange timed, its size bounded, its JSON read by the domain's `lookedUpAddress`.

- **The map servers' answers, read by the worker** (`apps/worker/src/mileage/map-servers.ts`), are **short of that**: an answer is read whole however large it is; the time limit is for a quiet stretch, not the whole exchange; a road point's coordinates and a route's length are taken as the routing server's JSON says, without being held to a number in range (a length that isn't a finite number of miles at zero or more would reach a mileage). What holds already: HTTPS only, the certificate checked against the named root, a status not known throws, the address read by the domain's rule, the map data's date held to its form. **Proposed:** held as the address server's are: the answer bounded in bytes, the whole exchange timed, each value checked before it is taken (two coordinates in range, written as exact decimals; a length finite and at zero or more, in miles); anything else a fault, so the job waits for its next try and never becomes "no route" or a straight line. Its test needs a map server that answers wrongly over HTTPS: **built in part 5**, beside 15.3.2's, which needs the same.
- **The mail server's answers** (`apps/api/src/sign-in/mail.ts`, nodemailer): **nothing of an answer is taken** but whether a message went: no reply's text is kept, logged (`logger: false`) or shown, and a failure is an error the caller is told nothing of. TLS is required to any server but a catcher on the same machine or in the stack, its certificate checked (nodemailer's own default); its three timeouts bound a server that stalls. **Proposed:** answered as it stands, with a test that a mail server's refusal leaves a reset asked for answered as one that wasn't and logs no word of the server's: in part 5 too.
