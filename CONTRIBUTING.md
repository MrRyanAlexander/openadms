<div align="center">

# Contributing to Open ADMS

**[Repository](README.md)** · [Code of conduct](CODE_OF_CONDUCT.md) · [Security](SECURITY.md) · [Spec](spec/INDEX.md)

</div>

---

Field experience counts as much as code here. A monitor who can describe exactly why a load call
gets disputed, or a data manager who knows which report a reviewer asks for first, is contributing
something a developer cannot supply.

<br>

## Ways to contribute that are not code

| | |
|---|---|
| **Describe how the work really goes** | How a contract prices a line, how a site runs its tower, what a reviewer asked for and what was missing. Open a [field practice](../../issues/new?template=field_practice.yml) issue. Most of it lands as the firm's own setup (pay items, rules, lists), not as code |
| **Describe a real dispute** | A load call argument, a deobligation, a scale receipt that didn't match. It is design input |
| **Correct the domain** | Words, practice that differs by state, county or contract, anything [`spec/`](spec/INDEX.md) gets wrong |
| **Try an install** | Run `pnpm start` on a machine nobody has tried and report exactly where it stopped |
| **Improve the docs** | The [docs site](apps/docs) and the [spec](spec/INDEX.md) can always be clearer |

<br>

## Development setup

You need **Node 24** (through [fnm](https://github.com/Schniz/fnm)), **pnpm 11** (through
Corepack) and **Docker**.

```bash
git clone https://github.com/MrRyanAlexander/openadms.git
cd openadms
eval "$(fnm env --shell zsh)" && fnm use   # every shell: Node 24, from .nvmrc
corepack enable
pnpm install
pnpm start                                 # the installer, then the whole local stack over HTTPS
```

`pnpm start` prints where the back office, the field app and the API answer
(`https://office.adms.localhost`, `https://field.adms.localhost`, `https://api.adms.localhost`).
Trust `infra/local/.generated/caddy-root.crt` in your browser. `pnpm local:accounts --show` lists
the dev stack's accounts; `pnpm sample` loads the sample projects.

<br>

## The workspace

| Path | What lives there |
|---|---|
| `apps/api` | The API (NestJS): sync, the back office's and the portal's endpoints |
| `apps/worker` | Reconciliation, pricing, repricing and media jobs |
| `apps/field` | The field app (React + Vite) |
| `apps/back-office` | The back office and the read-only viewer portal (React + Vite) |
| `apps/docs` | The documentation site (Astro Starlight) |
| `packages/domain` | Rules the phone and the server share; depends on no other workspace |
| `packages/contracts` | Zod schemas for every API and sync payload |
| `packages/db` | The Prisma schema, migrations and the database's hardening |
| `packages/look` | Tokens, components, the translation layer and accessibility test helpers |
| `packages/receipts` | The receipt model, rendered to ZPL and PDF |
| `packages/scenarios` | The stories and the golden mission |
| `infra/local` | The local HTTPS stack |
| `tools/` | The installer, the chain, the licence and security checks |
| `spec/` | How the system works; start at [`spec/INDEX.md`](spec/INDEX.md) |

**Shared code is shared properly:** a workspace package with its own tests, never copied between
apps or imported from inside another. A rule lives once, in `packages/domain`; a payload once, in
`packages/contracts`. Apps reach the server only through the API, over HTTPS.

<br>

## Testing

Prove each change with the **smallest run that covers it**, then run the whole chain once before
you open a pull request.

```bash
pnpm vitest run packages/domain/test/capacity.test.ts   # one test file
pnpm vitest run <file> -t "<test name>"                 # one test
pnpm scenarios golden-mission                           # one story
pnpm chain test scenarios                               # only the chain steps named
pnpm chain                                              # everything (about eleven minutes)
```

`pnpm chain` brings the stack up, checks the installation, then runs the typecheck, tests, stories,
browser tests, `pnpm security`, lint and `pnpm licences`, and prints one summary.

> [!IMPORTANT]
> A test that fails only under load is a real bug in the test or the app. Fix the cause; never
> rerun it until it happens to pass. **Never relax a threshold or a unique constraint to get green**:
> thresholds are policy.

<br>

## The rules that are not negotiable

> [!IMPORTANT]
> **Nothing is deleted.** Records are archived, closed or voided. `AuditRecord` is append-only, one
> per change, with a real actor. Transactions are regenerated, never reversed; each removed row is
> first copied in full to `AuditRecord`.

> [!IMPORTANT]
> **The database enforces the rules itself.** Roles, grants, constraints and triggers, not only the
> code. Schema changes go through Prisma migrations; never edit a generated or applied migration.

> [!IMPORTANT]
> **Flag, never block.** After setup nothing refuses field work or a record over eligibility. A
> problem gets a plain message and a flag a person resolves.

> [!IMPORTANT]
> **The firm's setup decides.** Before adding a ticket type, unit, criterion or behaviour, check
> whether projects, names, pay items, rules and lists already express it. Pick-lists are extendable;
> values are picked, never typed.

> [!IMPORTANT]
> **Field events are the evidence.** The completed load and haul-out, statuses, flags and
> transactions are written only by the worker, drawn from the events. Monitors never edit an event
> once submitted, and never see a rate or a code.

<br>

## Conventions

| | |
|---|---|
| **Words and examples** | [`spec/CONVENTIONS.md`](spec/CONVENTIONS.md): the industry's word or plain English; every example, fixture and seed from its example world (Gates Disaster Recovery, Bayline County, Hurricane Delphine) |
| **Fields, flags, lists** | The Prisma schema is the source of truth; [`spec/DATA-MODEL.md`](spec/DATA-MODEL.md), [`spec/FLAGS.md`](spec/FLAGS.md) (flag wording), [`spec/LISTS.md`](spec/LISTS.md) |
| **Screens** | Every screen translatable (no words typed into a component: they live in the app's `words/`), accessible to WCAG 2.2 AA in light and dark, at 320 px and 200% text, and tested in the browser |
| **Security** | [`spec/ARCHITECTURE.md`](spec/ARCHITECTURE.md) §16: HTTPS between services, CORS by exact allow-list, never log or print a secret, never commit an env file |
| **Formatting** | Prettier and ESLint (`pnpm format`, `pnpm lint`); TypeScript strict |

### Dependencies

A new dependency needs a sentence in the commit message on why what is already here doesn't do
it, and:

- an **exact version**, published **at least seven days ago** (the workspace refuses younger ones);
- a licence **compatible with Apache-2.0**, and a maintained project;
- `pnpm licences` and `pnpm security` passing after it is added.

Never edit `pnpm-lock.yaml` by hand: pnpm writes it.

### Commits

Conventional commits with a scope, the subject saying what now exists in plain words, because the
history is read later.

```
feat(back-office): the read-only viewer portal over /viewer/…
fix(local): the dev accounts are hashed and sealed under the API's own keys
docs: SECURITY.md (how to report a vulnerability)
chore(chain): recorded green on the sample projects
```

<br>

## What a good pull request looks like

- [ ] One concern. A schema change plus a screen plus a refactor is three reviews
- [ ] A test that fails without the change, named as the sentence you want to be true
- [ ] For a screen: translatable, the accessibility check passing, a browser test
- [ ] For a database guarantee: enforced by a constraint, grant or trigger, with a test that tries the thing refused
- [ ] Docs and spec updated in the same pull request when behaviour changed
- [ ] `pnpm chain` green

<br>

## Reporting things

| | |
|---|---|
| [Bug report](../../issues/new?template=bug_report.yml) | Something is broken |
| [Feature request](../../issues/new?template=feature_request.yml) | Something is missing |
| [Field practice](../../issues/new?template=field_practice.yml) | How a contract, a site or a review really works |
| [Security policy](SECURITY.md) | A vulnerability. **Never open a public issue** |

Never put a firm's real records, people's data or credentials in an issue. Reproduce with the
sample projects or the example world instead.

<br>

## Licensing of contributions

Open ADMS is licensed under the [Apache License 2.0](LICENSE). As its section 5 says, any
contribution you submit is licensed under the same terms, with no further conditions: inbound
equals outbound. There is no CLA to sign.

<br>

<div align="center">
<sub>

**[Repository](README.md)** · **[Spec](spec/INDEX.md)** · **[OpenRecover](https://openrecover.com)**

</sub>
</div>
