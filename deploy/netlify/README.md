# Netlify + Railway

The default target. Both frontends deploy to Netlify; the API runs as a
container on Railway next to a managed Postgres.

## What you need

- A Netlify personal access token
- A Railway API token
- A GitHub repository holding this monorepo
- A Postgres connection string (Railway can provision one, or bring your own
  from Neon, Supabase or RDS)

## Run it

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

`npm run install` at the repo root collects the same values interactively and
calls this for you.

## After the first apply

```bash
DATABASE_URL=... ./database/setup.sh --with-demo --test
```

The migrations are idempotent, so re-running the setup script against an
existing database applies only what is new.
