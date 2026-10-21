# Open ADMS — The Book

**Start here.** This is the index of Open ADMS. It tells you what the system is, breaks it into
its parts in the order a mission uses them, and links each part to a page that walks through it
step by step. From each page you can reach the rules (skills), the code, what's built, and
what's still open.

✅ **Approved**

> **Approved by the user 2026-09-29** (ADR-269), with the part pages, `VISION.md`, `LISTS.md`,
> `RULES.md` and `RATE-SHEET.md`. Agent-written from the skills, ADRs and the user's answers. Part
> pages give the **sequence**; the **rules** and their reasons live in the skills under
> `.claude/skills/`. If a page and a skill disagree, the skill wins — log a KD
> in `agent_store/DEVIATIONS.md`.

| You want to… | Read |
|---|---|
| **Know** what Open ADMS is | Chapter 1, then `spec/VISION.md`, then the `adms-domain` skill |
| **Know** how one part works | Chapter 2 to find the part, then its page in `spec/parts/` |
| **See** one whole mission: every kind of record, each one's life, the ledger | `spec/golden/MISSION.md` (approved, ADR-297) |
| **Check** what a part must do, as scenarios a test passes or fails | `spec/acceptance/` (draft, ADR-300): one file per part, written before the part is built |
| **Name** a thing, or write an example, fixture or seed | `spec/CONVENTIONS.md`: today's words, code names, the pay item code convention, the example world |
| **Know** how it's built and secured | Chapter 4a: `spec/ARCHITECTURE.md` |
| **Find** a record's fields, or a flag's code and wording | `spec/DATA-MODEL.md` · `spec/FLAGS.md` (approved 2026-10-01, ADR-289, 290) |
| **Build** the next thing, or see where it ends up | Chapter 4: `agent_store/PLAN.md`, where things stand, the road to done, and the next item (its first unticked box; ADR-599, 600) |
| **Maintain** it: fix, change, or answer a question | Chapter 5 |

---

## Chapter 1 — What Open ADMS is

After a disaster, a jurisdiction hires contractors to haul debris away and a **monitoring firm**
to document every load, because FEMA or USACE only reimburse work that is proven eligible,
measured and documented. The contractor is paid per unit **and** reports the units, so the
record has to be hard to fake.

Open ADMS is the system of record for that documentation. It is a **chain-of-custody and
billing-integrity system that happens to run in the field**, not a logistics app.

Five ideas carry the whole design. Each has a home in the `adms-domain` skill:

1. **Two witnesses per load.** A load is recorded as two field events by two monitors who can't see
   each other: a **collection** at the curb and a **disposal** at the dump. Only the server joins
   them, and it flags anything their independently captured facts disagree on. *(§1.2)*
2. **The load call is money.** Billable volume = the container's certified capacity × the
   percentage full called at the dump. *(§1.3)*
3. **Everything is offline.** Curb and dump alike, all day. Phones sync whenever there's signal, in
   any order. Every check happens after the fact. *(§1.1, ADR-030, 240)*
4. **Flag, never block.** After a project is set up nothing stops field work. Problems are
   flagged for review with a plain message, and people fix them. *(ADR-052)*
5. **Nothing is lost, and everything is audited.** Records are correctable by permission, and
   every change is kept. The audit log is append-only; the ledger of money always shows the
   current truth and is regenerated when a ticket changes. *(§1.5, ADR-051/085)*

**The output:** a clean ledger where every dollar traces back to a certified container,
two witnesses, GPS and photos. The back office assembles it by hand, with the tickets, photos and
receipts, into the **client package** (a zip). *(ADR-057/088)*

**Who's involved:** a **firm** installs and runs its own installation; its users are its back office
(admins, managers/analysts), field monitors on enrolled phones that take each day's assignment,
and read-only web viewers it issues
(client users, contractor users, auditors). Clients, contractors and property owners are records.
*(`adms-domain` §1.4, ADR-050)*

---

## Chapter 2 — The parts

A mission flows through the parts in this order:

```
 ┌────────────┐   ┌──────────────┐   ┌───────────────┐
 │ 1 SET UP   │──►│ 2 PEOPLE &   │──►│ 3 CERTIFY     │     back office, before any ticket
 │ the project│   │   DEVICES    │   │ containers,   │
 └────────────┘   └──────────────┘   │ crews         │
                                     └───────┬───────┘
                                             ▼
                              ┌──────────────────────────┐
                              │ 4 CAPTURE in the field   │   offline, all day
                              │ collection · disposal ·  │
                              │ haul-out · unit rate ·   │
                              │ splits · forms           │
                              └────────────┬─────────────┘
                                           ▼  whenever there's signal
                              ┌──────────────────────────┐
                              │ 5 SYNC                   │   any order; duplicates quarantined
                              └────────────┬─────────────┘
                                           ▼
                              ┌──────────────────────────┐
                              │ 6 RECONCILE              │   group by number, validate
                              └──────┬─────────────┬─────┘
                             all clear│             │flagged
                                      ▼             ▼
                   ┌────────────────────┐   ┌──────────────────────┐
                   │ 7 PRICE, LEDGER &  │◄──│ 8 REVIEW & CORRECT   │  fix → reprocess → 6
                   │   AUDIT            │   │ correct·renumber·void│
                   └─────────┬──────────┘   └──────────────────────┘
                             ▼
                   ┌────────────────────┐
                   │ 9 INVOICE, DELIVER │   lock as invoiced · client package · closeout
                   │   & CLOSE OUT      │
                   └────────────────────┘
```

| # | Part | What it does | Page | Rules live in | Will live in (ARCHITECTURE §18) | Phase |
|---|---|---|---|---|---|---|
| 1 | **Set up** | Client → declaration event → project, then contracts, forms and debris types, pay items, sites, rules, certifications, ROEs; the setup check | [01-setup](parts/01-setup.md) | `adms-ticket-workflows` §4.0, `adms-data-model` | `packages/db`, `apps/back-office` | 1 (data), 4 (UI) |
| 2 | **People & devices** | Users, Monitor IDs and roles; phones enrolled once, the day's **assignment** from the dispatch board (setup by master passcode as the fallback), offline sign-in, switching monitors, turn-in; the time clock; read-only viewers | [02-people-and-devices](parts/02-people-and-devices.md) | `adms-domain` §1.4, `adms-field-app` §4A.0 | `apps/api`, `apps/field`, `apps/back-office` | 0 (model), 2 (auth), 3–4 |
| 3 | **Certify** | Measure a container or certify a crew; its number is the placard and badge number | [03-certification](parts/03-certification.md) | `adms-certifications` | `packages/domain`, `apps/field` | 1 |
| 4 | **Capture** | What each monitor records as a field event, offline, workflow by workflow | [04-field-capture](parts/04-field-capture.md) | `adms-ticket-workflows`, `adms-field-app` | `apps/field` | 1 (data), 3 (app) |
| 5 | **Sync** | Get the field events from the phones to the server without losing or duplicating any | [05-sync](parts/05-sync.md) | `adms-exceptions` §4.3a | `apps/api`, `packages/contracts` | 2 |
| 6 | **Reconcile** | Join each ticket's field events by ticket number, check, attach zone and mileage, run the rules, write the completed record | [06-reconciliation](parts/06-reconciliation.md) | `adms-validation`, `adms-ticket-workflows` §4.7 | `packages/domain`, `apps/worker` | 1 |
| 7 | **Price, ledger & audit** | Run the rules, write the transactions, audit every change | [07-pricing-ledger-audit](parts/07-pricing-ledger-audit.md) | `adms-ledger-audit`, `adms-scale-receipts`, `spec/RULES.md` | `packages/domain`, `apps/worker`, `packages/db` | 1 |
| 8 | **Review & correct** | One review queue: correct, renumber, void, accept flags, QC; reprocess | [08-review-and-corrections](parts/08-review-and-corrections.md) | `adms-exceptions`, `adms-validation` §5.4b | `apps/api`, `apps/back-office` | 1 (data), 4 (UI) |
| 9 | **Invoice, deliver & close out** | Lock QC Approved tickets as invoiced (in batches), build the client package, close the project | [09-invoice-deliver-closeout](parts/09-invoice-deliver-closeout.md) | `adms-ledger-audit` | `apps/api`, `apps/back-office` | 1 (data), 4 (UI) |

The product isn't built yet: Phase 0 left the scaffold, the local HTTPS stack, the installer, the
database's guards and a provisional schema (ADR-255…287). **Phase 1, open since 2026-10-01
(ADR-299), builds the data and the engine of every part**, in `agent_store/BACKLOG.md` order. The
code in `database/` is historical and never built on (ADR-093).

**There is no USACE mode** (ADR-077): every project uses the same parts and rules; the only
USACE-specific capture is an optional "USACE approved" flag on the load call.
The **time clock** (an optional per-project add-on for workers' own hours, on the assignment,
**never related to crew-time billing**) is in [Part 2](parts/02-people-and-devices.md) (ADR-063, 241).

---

## Chapter 3 — Every part, step by step

Each page in `spec/parts/` has the same shape, so you always know where to look:

1. **What it does**: two or three sentences.
2. **Step by step**: numbered, in the order it happens.
3. **Rules it follows**: links into the skills. The page doesn't restate the reasons.
4. **Where it will live**: the rebuild's packages and apps (ARCHITECTURE §18), and the phase.
5. **Open questions**: none today (ADR-230); a new one would be an ID in `spec/QUESTIONS.md`.

---

## Chapter 4 — Building it

| File | What it holds |
|---|---|
| `agent_store/PLAN.md` | The one plan (ADR-599, 600): where things stand, the milestones and their items (the next is its first unticked box), every open requirement and carried concern, the gates, what waits on the user |
| `agent_store/history/` | Everything older, grep only: the old backlog and register, requirements, roadmap, next-page and archive, and ADR-001…598 |
| `spec/ARCHITECTURE.md` §18 | The rebuild's layout (`apps/`, `packages/`, `infra/`, `tools/`); `database/AGENTS.md` describes only the historical tree |
| `adms-verify` skill | How to prove it works — real output only |

Phases: **0** foundation (done 2026-10-01: architecture and security approved, scaffold, database
hardening, scenario harness) → **1** data core + engine, rebuilt (**active**, ADR-299) → **2** HTTP API → **3** field
app (browser, then iPhone, then Android) → **4** back office → **5** later features + the demo
deploy. The part pages say which phase owns each step. The code in `database/` is **historical**
(ADR-093); nothing is built on it.

---

## Chapter 4a — How it's built and secured

**`spec/ARCHITECTURE.md`** (**approved in full**, ADR-104, 139, 141, 143, 144) says how every layer is
built, how the layers connect, and the security rules each must meet:
- principles and the write boundary;
- the stack (TypeScript end to end, Prisma);
- environments and install (local HTTPS first, the Railway + Netlify demo);
- database hardening (the database enforces the rules itself);
- API hardening;
- phone enrolment, assignments and offline sign-in, and data on the phone (encrypted, never backed up);
- sync, time, photos, printing and scanning;
- the worker, testing, and the standards we test against.

Code is written against it in `PLAN.md` order, each dependency pinned by an ADR (ADR-143).

---

## Chapter 5 — Maintaining it

| Situation | Do this |
|---|---|
| You don't know how something behaves | Load the owning skill (table in `AGENTS.md`), then check `spec/QUESTIONS.md`. Never guess |
| The user answers a question | Record it as an ADR, update the skill **and the part page** it changes, flip the entry in `QUESTIONS.md` |
| You need what's decided **now** | `agent_store/DECISIONS.md` (ADR-599 on), then `agent_store/SUMMARY.md` (frozen at ADR-598): rules by topic, ADRs to cite, superseded ones |
| You make a real decision (product, money, evidence, security, a dependency, the architecture) | Append a short ADR to `agent_store/DECISIONS.md` in the same work (`adms-decisions`) |
| Code disagrees with a skill, or a page disagrees with a skill | Append a KD to `agent_store/DEVIATIONS.md`; don't silently fix either side |
| A step gets built | Update the part page's **Where it will live** section and tick the item and its REQ in `PLAN.md` |

---

## The library — every document and what it's for

| Path | Purpose | Who edits |
|---|---|---|
| `AGENTS.md` (= `CLAUDE.md`) | Operating rules for agents; routes to skills | Agent, carefully (≤ ~150 lines) |
| `spec/INDEX.md` | This book's front door | Approved (ADR-269); agent keeps it current, user approves changes |
| `spec/parts/*.md` | Each part, step by step | Approved (ADR-269); agent keeps them current, user approves changes |
| `spec/VISION.md` | What the finished system is and guarantees | Approved (ADR-269) |
| `spec/QUESTIONS.md` | Every product question and its status | Agent appends; user answers |
| `spec/ARCHITECTURE.md` | How it's built and secured, layer by layer | **Approved in full** (ADR-143, 144); later notes marked with their ADR |
| `spec/RULES.md` | The back office's rule builder and how rules price tickets | Approved (ADR-269) |
| `spec/RATE-SHEET.md` | A real prime contractor rate sheet set up line by line as pay items and rules | Approved (ADR-269) |
| `spec/FROM-BUILD-1.md` | The user's own answers from Build 1, verbatim (no code from it) | Kept as written; agent adds where each lands |
| `spec/golden/MISSION.md` | The golden mission: one worked mission, every kind of record, its statuses, flags and ledger | Approved, numbers included (ADR-297) |
| `spec/LISTS.md` | Every pick-list: which a firm can extend after install, which are fixed, and why | Approved (ADR-269) |
| `spec/DATA-MODEL.md` | The schema on paper: every record, its fields, who may write it, what the database refuses, the export columns | Approved (ADR-289; changed at the user's word, ADR-292…295) |
| `spec/FLAGS.md` | The flag catalogue: every flag's code, trigger, message, whether it still bills, the facts it keeps | Approved (ADR-290) |
| `spec/acceptance/*.md` | The acceptance scenarios: what each part must do, each naming the decision it restates and where a test proves it | **Draft** (ADR-300); agent drafts part by part, user approves |
| `spec/acceptance/10-api-and-sync.md` | How the server behaves towards any caller (the door, sessions, lockout, the CORS list, limits, errors, logs, a phone's proof, uploads, the job queue), and every earlier scenario with a Phase 2 part beside its task | **Draft** (ADR-379); for the user's approval |
| `spec/acceptance/11-field-app.md` | How the phone itself behaves (the app and its door, the store on the phone, its identity, signing in, the master passcode on the phone, sync from the phone, what every capture shares, photographs, printing and scanning, accessibility at WCAG 2.2 AA, the MASVS checklist), and every earlier scenario with a field app part beside its task | **Draft** (ADR-560); for the user's approval |
| `spec/THREAT-MODEL.md` | Who attacks what, layer by layer, the control that answers each and where it is tested; what the software records but doesn't stop | **Draft** (ADR-379); for the user's approval |
| `spec/CHECKLIST-FIELD.md` | The field app's security checklist: OWASP MASVS v2.1.0, every control and every MASWE weakness under it, at the profile MAS-L2 + MAS-P, each with the scenario that answers it, its owner phase, a departure or "not taken" | **Draft** (ADR-562); for the user's approval |
| `spec/CHECKLIST-API.md` | The API's security checklist: every ASVS 5.0 Level 1 and 2 item and the API Top 10 (2023), each with the scenario that answers it, the test that built it, its owner phase, or open | **Draft** (ADR-509, 510); for the user's approval |
| `.claude/skills/adms-*/SKILL.md` | Domain rules and their reasons, one topic each | User-owned; agent edits only to record a user decision, marked with its ADR |
| `agent_store/SUMMARY.md` | What was decided, by topic, through ADR-598 (frozen, ADR-599) | Nobody: read by topic |
| `agent_store/*.md` | The plan, decisions from ADR-599 on, deviations, the chain's counts; `history/` for everything older | Agent |
| `.claude/skills/adms-build/SKILL.md` | How code is written here: the recipes for endpoints, tables, tests, stories and screens (ADR-599) | Agent |
| `database/` | **Historical** early code (ADR-093); reference only | Nobody (read-only) |
| `development/` | Reference specs (USACE, First Principles). Read-only | Nobody |
| `README.md` | Human quick start | User |
