# Deployment

Three targets, one codebase. The installer collects the same answers for each
and pipes them into the matching Terraform stack.

```bash
npm run setup
# or unattended
node installer.js --yes --target=netlify \
  --database-url="postgresql://..." --api-url="https://api.example.org/api/v1"
```

## What the installer does

1. Asks for the deployment destination, the `DATABASE_URL`, the instance name,
   and whether to publish to a peer discovery registry.
2. Mints a fresh `INSTANCE_UNIQUE_KEY` with `crypto.randomBytes(32).toString('hex')`
   and an Ed25519 signing key pair.
3. Writes `backend/.env`, `frontend/.env`, `mobile/.env`, `database/.env`,
   `.instance`, and the key pair (private key `chmod 600`).
4. Optionally runs `database/setup.sh` with the schema test suite.
5. Optionally runs `terraform apply` for the chosen target.

## Netlify + Railway (default)

Two paths. The CLI one needs no tokens, no GitHub repo and no dashboard work.

### CLI (recommended)

```bash
npm run preflight            # tooling and sign-in check
npm run deploy:plan          # dry run: every command, executed none
npm run setup                # choose Netlify + Railway
npm run deploy:netlify       # re-deploy later without re-answering anything
```

What it does, in order:

| Step | Command |
|---|---|
| Create the project | `railway init --name <prefix>` |
| Provision Postgres | `railway add --database postgres` |
| Read the connection string | `railway variable list --service Postgres --json` |
| Apply the schema | `./database/setup.sh --with-demo --test` |
| Create the API service | `railway add --service api --variables ...` |
| Deploy it | `railway up --service api --detach --yes` |
| Give it a URL | `railway domain --service api --port 8080` |
| Build the frontends | `VITE_API_URL=<api> npm run build` in each |
| Link and create each site | `cd frontend && netlify sites:create --name <name>` |
| Deploy each frontend | `cd frontend && netlify deploy --prod --no-build --dir dist` |
| Open CORS to them | `railway variable set CORS_ORIGIN_REGEX=... --service api` |

`DATABASE_URL` on the API is set to the Railway reference
`${{Postgres.DATABASE_URL}}`, so the API talks to Postgres over the internal
network while migrations run from your laptop over the public proxy URL.

### Folder linking

Both CLIs bind a *directory* to a remote resource, which shapes where each
command runs:

- **Netlify** writes `.netlify/state.json` per folder. This repo has two sites,
  so `frontend/` and `mobile/` are each linked to their own, and every
  site-scoped command runs from inside that folder. Afterwards `cd frontend &&
  netlify open` does the right thing.
- **Railway** links one directory to a project. The repo root is linked, and
  the `api` service carries **Root Directory `/backend`**, so Railway builds
  `backend/Dockerfile` against `backend/` and reads `backend/railway.json`.

  That setting cannot be committed by the CLI. `railway environment edit
  --service-config` stages it the way the dashboard does, so it reports success
  while Railway keeps building whatever it was pointed at before. The
  provisioner writes it with Railway's public GraphQL API
  (`serviceInstanceUpdate`) and then reads the value back, and only reports it
  as set once Railway returns `/backend`. Auth comes from `railway login` or
  `RAILWAY_API_TOKEN`; nothing new to create.

  A matching `Dockerfile` and `railway.json` also sit at the repo root and
  build the same image from the root context, so a service left at `/` still
  deploys. Both are kept deliberately: whichever Root Directory the service
  ends up with, there is a valid build.

If a site already exists on your account, the provisioner runs `netlify link
--id` instead of creating a duplicate. If a folder is already linked, it leaves
the link alone and just deploys.

Only flags present in both netlify-cli 23 and 27 are used, since they differ:
23 has no `--json` on `sites:create`, and 27 added `--site-name` on `deploy`.
Verified against railway 5.x, netlify-cli 23.9.1 and netlify-cli 27.5.0.

### Terraform (declarative)

Use this when you want the deployment in version-controlled state. It needs a
GitHub repo and API tokens for both platforms.

```bash
cd deploy/netlify
terraform init
terraform apply \
  -var="netlify_token=$NETLIFY_TOKEN" \
  -var="railway_token=$RAILWAY_TOKEN" \
  -var="github_repo=your-org/openadms" \
  -var="database_url=$DATABASE_URL" \
  -var="jwt_secret=$(openssl rand -hex 32)" \
  -var="instance_key=$(openssl rand -hex 32)"
```

Each frontend ships its own `netlify.toml` with the SPA redirect, immutable
asset caching, and the security headers. The field app additionally allows
`geolocation` and `camera`.

## AWS

S3 + CloudFront for the frontends, App Runner for the API from
`Dockerfile` (repo root), RDS Postgres 16.

```bash
cd deploy/aws
terraform apply -var="image_uri=<ecr image>" -var="db_password=..." \
  -var="jwt_secret=..." -var="instance_key=..."
```

## Google Cloud

Firebase Hosting for the frontends, Cloud Run for the API from the same
Dockerfile, Cloud SQL Postgres 16.

```bash
cd deploy/gcp
terraform apply -var="project_id=..." -var="image_uri=<artifact registry image>" \
  -var="db_password=..." -var="jwt_secret=..." -var="instance_key=..."
```

## Environment

**Backend** — `DATABASE_URL` (the only database variable), `JWT_SECRET`,
`INSTANCE_KEY`, `CORS_ORIGIN_REGEX`, `PORT`, `ENVIRONMENT`, `LOG_LEVEL`,
`ACCESS_TOKEN_MINUTES`, `REFRESH_TOKEN_DAYS`, `PEER_SIGNATURE_SKEW_SECONDS`,
`REGISTRY_URL`.

**Frontends** — `VITE_API_URL` and nothing else that matters.

## Migrations in production

```bash
./database/migrate.sh --status   # what is applied, what is pending
./database/migrate.sh            # apply pending, one transaction per file
./database/migrate.sh --verify   # fail if an applied file changed on disk
```

Each file runs inside a single transaction and records its sha256. Editing an
applied migration is drift, and `--verify` is what catches it in CI. Add a new
file instead.

## Verifying independence

The OmniTodo pattern asks for the same tree to configure across all three
clouds, and for two instances to prove peer isolation. Both are covered:

```bash
# Instance Alpha and Instance Beta, each with its own DATABASE_URL
./database/setup.sh --with-demo
cd backend && python3 -m pytest -k peer
```

`test_a_restricted_project_needs_a_valid_signature` registers Beta on Alpha,
restricts a project to Beta's key, and asserts that Beta reads it, that a replayed
nonce is refused, that a forged signature is refused, that an unregistered third
party receives 403, and that an unsigned request receives 403.
