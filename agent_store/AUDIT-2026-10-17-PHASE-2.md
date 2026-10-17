# Open ADMS — An independent check of everything built through Phase 2

**Written 2026-10-17, at the user's request** ("perform a thorough check of everything completed
thus far. Check security. Check workflows. Think as various roles step by step."). A point-in-time
report: **it decides nothing.** Each recommendation is the user's to take, and anything taken
becomes an ADR, a KD or a register line in the usual place. Branch `phase2-api-sync`, head
`a254e73`, through ADR-540.

---

## 1. The verdict in short

Phase 2 is **real, careful and mostly sound**. The server does what the records say it does: every
endpoint is defined once in `packages/contracts` and served through `@Serves`, who may call it is
asked before anything is read (`Admission`), permissions are read from the database on every
request, the database holds its own guards (roles, column grants, no deletes, append-only audit,
row-level security for viewers), and the obvious attack classes (SSRF in the Esri fetch, zip bombs,
XML entities, CSRF, token replay, SQL injection, secrets in logs) have deliberate, tested answers.

**But I found eleven things worth fixing or deciding, and a handful of stale records.** The one I'd
fix before any firm goes live: **a stranger on the internet can freeze the firm's master passcode**
(F1), which stops phone enrolment and every server act under the passcode for days. Three more go
to evidence and secrets: concurrent guesses get past the wrong-try counters (F2); the master
passcode's stored hash works as the key to an offline sign-in (F3); and a synced record may name
anyone as its monitor, which the threat model still lists as undecided (F4). Two workflow gaps
would bite in Phase 4: **nothing reads the audit trail** (F5), and **a set-aside job's tickets
wait with no flag and no way to list them** (F6).

| # | Finding | Severity | Kind |
|---|---|---|---|
| F1 | Anyone can hold the master passcode in its wait, then lock it | **High** | security / availability |
| F2 | Concurrent guesses race past the wrong-try counts | Medium | security |
| F3 | The passcode's stored hash is the offline sign-in key, and it is unkeyed | Medium | security |
| F4 | A synced record may name any person as its monitor (T-13 never decided) | Medium | evidence |
| F5 | The audit trail is write-only: no endpoint reads it | Medium | workflow |
| F6 | A set-aside job's tickets wait silently; nothing lists set-aside jobs | Low–Medium | workflow |
| F7 | No budget on what one proven phone can store | Low | security / availability |
| F8 | Every sign-in try reads every user's credentials into memory | Low | security / performance |
| F9 | Untrusted map files are parsed on the API's main thread | Low | availability |
| F10 | Rate limits keyed by address: one misconfigured proxy locks out the firm | Low (deploy) | security |
| F11 | One signing secret derives every key | Low (known, filed for 5a) | security |
| R1–R5 | Stale or open records (threat model, acceptance file 10, NEXT, ROADMAP) | — | records |

---

## 2. What I ran, and what I couldn't

**Seen on this Mac today:**
- `tsc --build`: clean.
- The five test projects that need no stack (`packages/domain`, `packages/contracts`, `tools/setup`,
  `tools/security`, `tools/chain`): **`Test Files 61 passed (61)`, `Tests 1115 passed (1115)`**,
  exactly `CHAIN.md`'s figures for them (848 + 91 + 20 + 141 + 15).
- `pnpm lint`: `All matched files use Prettier code style!`, exit 0.
- `pnpm licences`: `454 packages: 454 allowed, 0 refused, 0 undecided.`
- `pnpm audit --prod`: `3 ignored: 1 moderate | 2 high` (the three accepted by id in C32).

**Not run:** Docker Desktop's engine answered every call with `500 Internal Server Error`, so
`pnpm ready`, the database tests (1,087), the API's (727), the worker's and `infra/local`'s, the
23 stories and `pnpm security` couldn't run. **Their last whole run is `CHAIN.md`'s (2026-10-17,
ADR-539), not mine.** Once Docker is healthy: `pnpm chain` (about ten minutes), then
`pnpm local:down`.

**Read:** the threat model, the checklist's place in it, acceptance file 10's open points, the
register, the endpoint table (all 209 endpoints with their access, roles and permission), and the
code of the door, sign-in, password resets, enrolment, the master passcode's check, phone proofs,
the login list and offline checks, sync and intake, held records, the Esri fetch, the map reader,
the rate limits, the boundary, cookies, the viewers' reads and the worker's loop.

---

## 3. Findings

### F1 — Anyone can hold the master passcode in its wait, then lock it · High

**Where:** `POST /phones/enrolments` is `ANYBODY` (`packages/contracts/src/endpoints.ts`);
`apps/api/src/phone/master-passcode-check.ts`; `apps/api/src/phone/enrolment.controller.ts`.

**What happens.** The master passcode is one value for the whole firm, and its wrong tries are
counted on that one value, by sign-in's rule (a wait from the 5th, doubling to an hour; locked at
the 50th until an admin changes it). **While it waits, the right passcode is refused too.**
Enrolment needs no account and no email address: only the API's address. The limit per address is
four refused tries at the passcode an hour (`SIGN_IN_WRONG_TRIES_PER_ADDRESS_AT_LOGIN`).

**The story.** The night before a field day, somebody scripts one address against
`https://api.…/phones/enrolments`. Hour one: four wrong tries. Hours two and three: the waits
begin. From the 12th try the wait is an hour, and one wrong try an hour, inside the per-address
limit, keeps it shut. **From then on no supervisor can enrol a phone, create a monitor on a phone,
open a passcode session, or prove a revoked phone to turn it in**, and the refusal says only "not
enrolled". Admins are mailed only at the lock, about forty hours later; the lock then needs a new
passcode, which every supervisor must be told and every phone must sync to take. In a disaster
response this is a day or two of no new phones and no new monitors.

**Recommend** (the standards allow all of these; ADR-416 already names malicious lockout as
ASVS 6.1.1's question):
1. **Make the wait per address, not per passcode:** an address that has failed waits; the right
   passcode from an address that hasn't is let through. Keep the global count only for the lock,
   and consider raising it for the passcode, which has no second factor to fall back on.
2. **Tell the admins at the first wait**, not only at the lock, so a passcode under attack is
   known the same evening.
3. **Optionally, a second thing to enrol:** a one-time enrolment code the back office issues per
   phone (dispatch board), or an allow-list of the firm's networks for enrolment. This is the
   user's call (it changes what a supervisor does), so it's a question, with (1) and (2) as the
   agent default.
4. A test that holds a stranger at the passcode and proves the supervisor still enrols.

### F2 — Concurrent guesses race past the wrong-try counts · Medium

**Where:** `Sessions.signIn` (`apps/api/src/sign-in/sessions.ts`), `MasterPasscodeCheck.check`,
`Limits.mayTry` / `wrongTry` (`apps/api/src/process/limits.ts`).

**What happens.** Each check reads the count, then verifies the guess, then adds to the count.
Nothing reserves a try before the slow hash. **N requests sent at once all read the same count,
all pass `mayTry`, and all get their guess checked** before the first one's wrong try is written.
The atomic `increment` makes the count right afterwards, but the bound on guesses is the burst's
size, not the policy's 50 (or the address's 4). If one guess in the burst is right, it is taken,
and its success resets the count.

**Why it matters most for the master passcode:** at least 8 characters, chosen by a person, no
second factor, reachable by anybody. Back-office passwords (15 characters, screened, with an
authenticator) are much less exposed. Node's four-thread pool slows a burst, but doesn't bound it.

**Recommend:** reserve the try first (increment, then verify, then give it back on success), or
take the login's row `FOR UPDATE` around the check; count an address's tries in flight in
`Limits`. A test that fires, say, 20 wrong tries at once and finds at most the policy's number
checked.

### F3 — The passcode's stored hash is the offline sign-in key, and it is unkeyed · Medium

**Where:** `apps/api/src/phone/offline-checks.ts` (`signedWithPasscode(serverHash, …)`),
`apps/api/src/phone/offline-sign-ins.ts`, `apps/api/src/dispatch/master-passcode.ts`
(`hashWithoutKey`).

**What happens.** An offline sign-in under the master passcode is proven by an HMAC **keyed by the
server's own hash of the passcode** (`master_passcode.hash`), the same bytes a phone's "first step"
makes from what is typed. So the stored hash isn't only a verifier, it's the credential:
**whoever reads `master_passcode.hash`** (a database copy, a backup, the API's login) **and has any
enrolled phone can make a sign-in as any monitor on it without knowing the passcode.** And because
that hash is unkeyed, a database copy also lets someone guess the passcode offline.
`offline-checks.ts` itself says "whoever copies the database alone holds nothing a guess can be
tried against", and that's true of the monitors' seeds (sealed) but not of the passcode. T-43 in
the threat model reads the same way.

**Recommend:** give the passcode what the monitors' seeds already have. Keep its phone-side first
hash **sealed** under a key drawn from the signing secret (as `offlineSeed` is), and **key the
server's own verifier** (as passwords are, ADR-411). Then fix T-43 and the comment.

### F4 — A synced record may name any person as its monitor · Medium (evidence)

**Where:** `apps/api/src/sync/intake.ts` writes each record as `actorId: event.monitorId`;
`SUMMARY.md`: "A record under another monitor's assignment is saved as sent." The database refuses
only the system actor (`field_event_monitor_check`). `spec/acceptance/10-api-and-sync.md`, "Left to
the task that builds it", **point 9 is still unticked**, and `spec/THREAT-MODEL.md` **T-13 still
says "not recorded… decided and tested by 2.6.2"**. No test sends a record naming somebody else.

**The story.** Kim is signed in on `P1-COL-1`. Her phone sends a collection for 101044 naming Ana
Brooks (`M004127`), who was never on that phone that day, or naming Dana Reyes, an admin. It is
saved, and the audit record names Ana (or Dana) as its actor. Nothing flags it. A phone that
changed hands legitimately carries an earlier monitor's records (`05-sync.md` step 3), so refusing
would be wrong (and would break "flag, never block"). But silently accepting **any** name breaks
"a real actor" (invariant 3) and lets one dishonest monitor point the evidence at a coworker.

**Recommend:** decide point 9. Because this is evidence, ADR-230 makes it the user's question.
My recommendation: **save as sent, and flag** when the monitor named isn't a monitor in service,
had no session on that phone covering the field time (the sessions table already holds this), or
the assignment named isn't theirs or that phone's. A new flag in `spec/FLAGS.md` §3.10 ("Ticket
101044: recorded under a monitor not signed in on that phone."), wording for the user to approve.

### F5 — The audit trail is write-only · Medium (workflow)

**Where:** no endpoint in `packages/contracts` reads `AuditRecord`, and nothing in `apps/api/src`
queries it (`adms_api` holds `SELECT` on it but never uses it). REQ-407 (the audit-trail viewer) and
REQ-412's audit export are Phase 4's in `REQUIREMENTS-LATER.md`, but **no server task for them
stands in the register**, unlike every other Phase 4 screen, whose reads 2.8.8 built.

**Why it matters.** "Corrected in place, prior value kept" is a promise to an auditor, and today
only someone with database access can keep it. Luis can't see what Dana changed on 101008 before
he QC-approves it, and the state auditor's viewer login can't see a correction at all.

**Recommend:** a register line, with the user's say on which phase. My view is that by ADR-519's
own rule it's server work owed before Phase 4's screens: reads of a record's or a ticket's
history, by domain, for the back office (*view review*) and for client users and auditors through
a `viewer_*` view with the personal-detail columns masked as elsewhere.

### F6 — A set-aside job's tickets wait silently · Low–Medium (workflow)

**Where:** `SUMMARY.md` "Jobs and the worker": a job that fails whole five times is set aside,
"kept and shown, no new flag"; `POST /projects/:projectId/reprocesses` takes `{ setAsideJobId }`.
**But no endpoint lists set-aside jobs.** The id is only in the worker's log (`JOB_SET_ASIDE`) and
the count in its health answer. Alerts are Phase 5a's (C38).

**The story.** A pay item change queues 200 tickets; the job fails five times on a bad map server
answer and is set aside. Those tickets keep their old lines or stay `PENDING`, with nothing on
them to say so. Luis sees a quiet queue. Only whoever reads the worker's log knows, and only they
can find the id to put it back.

**Recommend:** `GET /projects/:projectId/set-aside-jobs` (*view review*: when, why by kind, how
many tickets, and which), and a mark on each such ticket in the review queue ("waiting on a job
that was set aside").

### F7 — No budget on what one proven phone can store · Low

**Where:** `apps/api/src/sync/held.ts`, `sync.ts`. A sync may weigh a mebibyte, a phone may make
600 requests a minute, and whatever can't be read is **held** whole (deduplicated only by
fingerprint, so changing one byte makes another), plus a `Sync` row a call. A stolen phone with a
monitor signed in, or a dishonest monitor scripting the phone's token, can write hundreds of
megabytes a minute into the database.

**Recommend:** a per-phone budget per day (bytes held, held records), past which the phone's
records are **still received** (flag, never block) but a security event is written, the admins are
told, and the dispatch board shows the phone. Taking it out of service stays a person's act.

### F8 — Every sign-in try reads every user's credentials into memory · Low

**Where:** `Sessions.named` (`apps/api/src/sign-in/sessions.ts`) loads **every** back-office and
viewer user with an email, with their password hash and sealed authenticator secret, on every
try, a stranger's included, then compares emails in JavaScript (deliberately, to avoid a pattern
match). That's O(users) per anonymous request, and every credential sits in the heap each time.

**Recommend:** a normalised email column (lower case, trimmed), held unique among those who sign
in, looked up by equality; the credential read only for the one row.

### F9 — Untrusted map files are parsed on the API's main thread · Low

**Where:** `apps/api/src/setup/map-file-reader.ts` (`inflateRawSync`, `shpjs`, `proj4`, xmldom),
up to 64 MiB unzipped. The ring-pair bound (ADR-524) stops the worst case, but parsing still holds
the event loop for every caller while it runs, and C140 notes a malformed `.shp` throws. Only a
person with *Setup* can send one.

**Recommend:** parse in a `worker_threads` worker with a time and memory limit; a crash there
becomes the plain "can't be read" answer.

### F10 — Rate limits keyed by address: one misconfigured proxy locks out the firm · Low (deploy)

**Where:** `Limits` keys on `request.ip`, which trusts `X-Forwarded-For` only from
`ADMS_TRUSTED_PROXIES`. If a firm runs the API behind a load balancer and doesn't list it, **every
caller shares the balancer's address**: 30 refused tries at any secret in an hour then shut the
whole firm out of signing in, resets and the passcode. The counts are also per process (known,
C93, Phase 5a).

**Recommend:** `installer:check` (or the API's start) warns when requests arrive carrying
`X-Forwarded-For` from an address that isn't listed; the operator's guide says so plainly.

### F11 — One signing secret derives every key · Low (known)

`ADMS_TOKEN_SIGNING_SECRET` derives the password pepper, the authenticator and offline-seed
sealing keys, the CSRF value, access tokens, reset codes and phone challenges. Lose it and every
password and authenticator is set anew; leak it and all of them fall together. **Already filed**
(register, Phase 5a: separate keys, or hardware; ADR-411 (4)). My only recommendation: do it
before a firm's first live mission, not after.

### Records that are stale or still open (R1–R5)

- **R1.** `spec/THREAT-MODEL.md` **T-13**: "not recorded… decided and tested by 2.6.2", still open
  (F4). **T-50**: "`pnpm security` (7 passed…, seen 2026-10-06)", but it's 12 today. **T-10**: "the
  six local services", but there are ten containers today. Several "Tested" cells still name a task
  number ("2.6.5", "2.4.4") where the test now exists. The page says it "is read again whenever a
  phase opens": it wants that pass before Phase 3.
- **R2.** `spec/acceptance/10-api-and-sync.md`, "Left to the task that builds it", **point 9** is
  unticked (F4); **point 12** (a file that fails its check) is unticked too, though ADR-482
  decided it (set aside for a person, the phone sends it again): tick it in place.
- **R3.** `agent_store/NEXT.md`, the road table near its end: Phase 2 is "🔄 exit met but for the
  user's answers (ADR-537)", but it's met (ADR-538…540).
- **R4.** `agent_store/ROADMAP.md` §2, Phase 3's row: "yours to open, after Phase 2's exit is met
  again". It's met.
- **R5.** `THREAT-MODEL.md` T-02 says the login list's entries make "a copy useless elsewhere". The
  entries are per phone, but **cracking one recovers the password itself**, which works on any
  phone: a seven-digit monitor password falls to an offline search in hours (≈12 ms an entry). The
  risk is the firm's, accepted (ADR-105, 449 (3)), but the sentence overstates it. The same is true
  of the passcode's check sent to every phone, which is one more reason for F1's and F3's
  passcode work and for a longer **generated** master passcode (four or five random words) as the
  installer's suggestion.

---

## 4. The roles, step by step

What each person can do through the API today (Phase 2 has no screens), where it holds, and where
it doesn't. The stories named are the ones that walk it.

**Dana Reyes, admin** (`first-admin`, `setup`, `dispatch-monday`)
1. `pnpm installer`, then `pnpm installer:admin` on the server: her first sign-in. ✅
2. Signs in; an authenticator is required before anything else; her password must be changed if
   someone else set it. ✅
3. Creates Luis and the viewers, grants permissions, sets viewers' projects. ✅ Nobody grants what
   they don't hold; the last admin can't be removed. ✅
4. Builds the setup spine: client → declaration event → project → contracts → forms and debris
   types → pay items and a rate per prime → rules → sites, shapes, map (file, KML or Esri) →
   number series, control ranges. ✅ The setup check lists gaps. ✅
5. Changes the master passcode, the phone-key hours, the viewers' two-step. ✅ **Gap:** she isn't
   told when the passcode starts waiting (F1), and can't see who changed what (F5).

**Luis Ortega, manager/analyst** (`p1-reviewed`, `p1-voided`, `p1-invoiced`)
1. Signs in with an authenticator; sees an area only with its view (ADR-539). ✅
2. Opens the review queue by cause, a ticket whole, its run decisions, its flags. ✅
3. Corrects, renumbers, voids with a reason, accepts a flag, resolves quarantined and held
   records, reprocesses. ✅ QC marks and invoice locks, one or many, batches. ✅
4. **Gaps:** can't see a ticket's history before he QCs it (F5); can't see that a job behind
   200 tickets was set aside (F6).

**A supervisor holding the master passcode** (`under-the-passcode`, `lost-phone-key`)
1. Enrols a phone. ✅ Creates a monitor on it, online. ✅ Sets it up with an unplanned
   assignment. ✅ Signs in as its monitor; syncs and turns it in. ✅
2. **Gap:** a stranger can stop steps 1's server half for days (F1), and the passcode's strength
   is the whole of its defence offline (R5).

**Kim Nguyen, monitor** (`p1-field-days`, `sync`, `held-for-review`, `interrupted-upload`)
1. Signs in on an enrolled phone; it takes her day's assignment; the lists carry no rate or code. ✅
2. Syncs whenever there's signal; each record stored once; a duplicate number quarantined whole;
   what can't be read held for a person, answered "not saved", never lost. ✅ Photographs upload
   in resumable parts, fingerprint-checked. ✅ A submitted record is sealed for her. ✅
3. **Gap:** her phone could send a record naming Ana, and nothing would say so (F4).

**Bayline County's debris manager, and the state auditor** (`p1-viewed`)
1. Sign in (two-step optional by the firm's setting); see their projects' tickets, lines with money,
   certifications, ROEs (private citizens masked where set), forms, setup without rates. ✅ The
   database filters every row itself (row-level security, fail closed). ✅
2. **Gap:** the auditor can't see a single correction's prior value (F5), which is most of what an
   auditor is there for.

**Coastline Haulers' office, a contractor user** (`p1-viewed`)
1. Sees only its own and its subs' tickets and transactions, never Summit's; no setup page. ✅
   Can write nothing; the read-only login holds only `SELECT`. ✅

**An outsider on the internet**
1. Reaches only `/health`, `/readiness`, sign-in, resets, enrolment and phone challenges and proofs
   without a credential. ✅ CORS by exact list; HSTS; nothing on plain HTTP at the API; no stack
   traces. ✅ Esri fetch guarded against SSRF and DNS rebinding. ✅
2. **Gaps:** can freeze the master passcode (F1); can make sign-in work O(users) (F8).

**The firm's operator** (installer, `pnpm security`)
1. Installs with one env file per service, nothing printed; the check re-verifies guards,
   migrations and timeouts. ✅
2. **Gaps (all filed for 5a already):** backups, alerts (a set-aside job, `INTERNAL_ERROR`),
   separate keys (F11), several API processes' limits. F10's proxy warning is new.

---

## 5. What I'd do, in order

1. **F1 and F2 together, now:** the passcode's wait per address, admins told at the first wait,
   tries reserved before the hash, and a test that a stranger can't hold the passcode. Ask the user
   whether enrolment should also take a code from the back office.
2. **F4:** put point 9 to the user (it's evidence) with the "save and flag" recommendation; build
   the flag; close T-13.
3. **F3:** seal the passcode's offline seed and key its verifier; fix T-43, T-02's sentence and
   the comment.
4. **F5 and F6:** register lines now (server reads of the audit trail and of set-aside jobs), so
   Phase 4 doesn't find them missing; the user says which phase.
5. **R1–R4:** one records pass (threat model reread as the page itself asks, file 10's points,
   NEXT's and ROADMAP's rows) before Phase 3 opens.
6. **F7–F10:** register lines under Phase 5a or "every task that…", as the user prefers.
7. **Re-run `pnpm chain`** once Docker answers, so this report's "not run" half is seen too.

None of these was changed in this session: the code, the threat model and the state files are as
they were. Taking any of them is a task with its own ADR.
