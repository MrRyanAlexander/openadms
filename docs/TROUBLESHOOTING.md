<div align="center">
<sub>

[Docs index](README.md) · [Architecture](ARCHITECTURE.md) · [Data model](DATA_MODEL.md) · [ERD](ERD.md) · [Ticket types](TICKET_TYPES.md) · [Rules](RULES_ENGINE.md) · [Access](ACCESS_CONTROL.md) · [Federation](FEDERATION.md) · [API](API.md) · [Deploy](DEPLOYMENT.md) · [Testing](TESTING.md) · **Troubleshooting**

</sub>
</div>

# When something does not work

## `could not translate host name "host"`

```
psql: error: could not translate host name "host" to address
socket.gaierror: [Errno 8] nodename nor servname provided, or not known
```

`host` is a placeholder, not a hostname. A connection string needs a real one.

Get a database first, then use its actual URL:

```bash
# Fastest, if you have Docker
docker compose up -d db
export DATABASE_URL=postgresql://adms:adms@localhost:5432/openadms

# Homebrew instead
brew install postgresql@16 && brew services start postgresql@16
createdb openadms
export DATABASE_URL=postgresql://$(whoami)@localhost:5432/openadms

# Or a hosted one: Railway, Neon, Supabase all hand you a full URL
```

The installer now checks this for you: it validates the shape, actually
connects, and tells you which part is wrong instead of letting the failure
surface later inside asyncpg.

## Migrations stop after 0001, then seeding fails with `relation "roles" does not exist`

Fixed. `migrate.sh` timed each migration with `date +%s%3N`, and `%N` is a GNU
coreutils extension that BSD `date` on macOS does not support. It returned the
epoch seconds followed by the literal characters `3N`, the arithmetic on the
next line failed, and that error aborted the whole migration loop without
tripping `set -e`. The script then printed `Applied 1 migration(s).` and exited
**0**, so `setup.sh` went straight on to seeding a schema that had thirteen
migrations missing.

Three changes:

- `now_ms()` uses GNU `date` where available and falls back to python3, perl,
  then whole seconds.
- `migrate.sh` compares the migration files on disk against the rows in
  `schema_migrations` before it exits, and fails loudly on a mismatch.
- `setup.sh` re-checks the same thing before seeding, so a half-migrated schema
  can never reach the seed files.

`sha256sum` was the same class of problem waiting to happen; it now falls back
to `shasum -a 256`, then `openssl dgst`.

Recovery needs no cleanup: `0001` is all `CREATE ... IF NOT EXISTS` and
`CREATE OR REPLACE`, so re-running is safe.

## `Invalid single-argument block definition` from Terraform

Fixed. The `deploy/*/main.tf` files had `variable "x" { type = string, sensitive = true }`,
which is not valid HCL: a single-line block may hold only one argument. All
three stacks now use multi-line blocks and parse cleanly.

If you pulled an older copy, re-pull `deploy/`.

## The installer says Netlify is not signed in, but `netlify status` shows my account

Fixed. `netlify status` reports on the **linked project**, so in a folder that
has not been linked it errors out even when you are signed in perfectly well.
The old check read that error as "not logged in".

The check now asks the API who you are (`netlify api getCurrentUser`), which
does not care about the current directory, and falls back to parsing the
account block out of `netlify status` for older CLIs. Verified against
netlify-cli 23.9.1 and 27.5.0.

Note that both commands exit 0 whether they succeed or fail, so the check reads
their output rather than the exit code.

## Which folder gets linked to which Netlify site?

Each frontend links its own directory, because the Netlify CLI keys a site to a
folder via `.netlify/state.json` and this repo has two sites:

| Folder | Site | Deployed from |
|---|---|---|
| `frontend/` | `<prefix>-back-office` | `frontend/dist` |
| `mobile/` | `<prefix>-field` | `mobile/dist` |

So after provisioning, these work by hand:

```bash
cd frontend && netlify open          # opens the back office site
cd mobile   && netlify deploy --prod --no-build --dir dist
```

The provisioner handles all three states: folder already linked, site already
exists on your account but the folder is not linked (it runs `netlify link
--id`), and neither exists (it runs `netlify sites:create`, which links the
folder as a side effect). `.netlify/` is gitignored in both apps.

Railway works the same way but links a single directory to a project, so the
repo root is linked and the `api` service carries Root Directory `/backend`,
which is where the API code and `backend/railway.json` live.

## The API URL answers 404 "Application not found"

That 404 comes from Railway's edge, not from the API. It means the domain
exists but no deployment is serving it, so the usual causes are a build that
failed and a service that never built at all.

Check which one it is:

```bash
railway status                         # is the api service there, and linked?
railway logs --service api --build     # the build log, if a build ran
railway redeploy --service api --yes   # start one if none has
```

Two bugs produced this repeatedly and are both fixed in the provisioner:

- `railway service redeploy` is not a command. `redeploy` is top level, so the
  old call always failed, and because the variables were set with
  `--skip-deploys` the service could sit with no deployment at all. There is a
  Railway API fallback now, since a service with zero deployments cannot be
  redeployed.
- Root Directory was staged rather than committed, so Railway built the wrong
  tree. It is written through the Railway API and read back for confirmation.

While it waits for `/health`, the provisioner now prints the Railway deployment
status each round, so `FAILED` shows up immediately instead of as a silent
three-minute timeout.

## The installer quit when I typed the connection string wrong

Also fixed. Every prompt now re-asks on bad input instead of exiting, and the
error says what is wrong with what you typed.

## I do not want to click around in dashboards

You do not have to. The Netlify + Railway target is driven entirely by the two
CLIs:

```bash
npm run preflight            # what is installed, what you are signed in to
npm run deploy:plan          # the exact commands, without running them
npm run setup                # do it
```

If a CLI is missing, the installer names it, says what it is for, shows the
install command, offers to run it, and then re-checks. If you are not signed
in, it offers to run the login flow. Either way you land back in the same
place.

## A deploy stopped halfway

Re-run it. Progress is recorded in `.deploy-state.json`, so completed steps are
skipped:

```bash
npm run deploy:netlify
```

Delete that file to start over from scratch.

## `railway init` says it needs a workspace

Railway asks for an explicit workspace when it cannot prompt. The installer
catches this and asks you for the name. By hand:

```bash
railway init --name openadms --workspace "Your Workspace"
```

## Netlify says the site name is taken

Site names are globally unique across Netlify. The provisioner retries with a
short random suffix automatically. To pick your own:

```bash
npm run setup -- --site-prefix=openrecover-adms
```

## The frontend loads but every request fails with a CORS error

The API only accepts origins matching `CORS_ORIGIN_REGEX`. The provisioner sets
this to your real site URLs at the end of a deploy. If you created the sites by
hand, set it on the API service:

```
CORS_ORIGIN_REGEX=^https://([a-z0-9-]+--)?(your-back-office\.netlify\.app|your-field\.netlify\.app)$
```

The `([a-z0-9-]+--)?` part is what lets Netlify deploy previews through.

## `permission denied` running the scripts

```bash
chmod +x database/setup.sh database/migrate.sh installer.js deploy/deploy.mjs
```

## Migrations fail with a checksum warning

You edited a migration that was already applied. That is drift, and
`./database/migrate.sh --verify` exists to catch it in CI. Add a new migration
file instead of editing history. To reset a development database:

```bash
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
./database/setup.sh --with-demo --test
```

## Is the schema suite safe to run twice?

Yes. It normalises anything a previous interrupted run left behind and picks
records that are still in a clean state, so `--test` is repeatable against a
database it has already touched.

<br>

<div align="center">
<sub>

**[Docs index](README.md)** · **[Repository](../README.md)**

</sub>
</div>
