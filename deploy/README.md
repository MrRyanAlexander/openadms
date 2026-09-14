# deploy/

Everything that stands this instance up, and nothing else.

## Entry points

| Command | Runs | Does |
|---|---|---|
| `npm run setup` | `deploy/setup.mjs` | Interactive install. Safe to re-run; resumes. |
| `npm run teardown` | `deploy/teardown.mjs` | The inverse. Makes the next setup a genuine first run. |
| `npm run preflight` | `setup.mjs --check` | Tooling and sign-in only. Changes nothing. |
| `npm run deploy:plan` | `setup.mjs --dry-run` | Prints the plan. Changes nothing. |
| `npm run deploy:netlify` | `setup.mjs --resume` | Re-provision without re-minting the instance key. |

## Layout

```
setup.mjs        owns the ORDER, and nothing else
teardown.mjs     the inverse of setup
lib/
  ui.mjs         what the operator sees and answers
  shell.mjs      what actually runs: processes, tools, validators
  state.mjs      .deploy-state.json, a resume hint and never evidence
  requirements.mjs  what each target needs installed and signed in to
  railway.mjs    Railway's GraphQL API, for the two things its CLI cannot do
steps/
  railway-project.mjs   the Railway project and a Postgres you can connect to
  database-schema.mjs   migrations and the optional worked demo
  github.mjs            get the commit onto GitHub, because that is what builds
  api-service.mjs       the api service, from nothing to a URL answering 200
  web-apps.mjs          both frontends built, on Netlify, CORS pointed back
terraform/
  railway-netlify/      the declarative equivalent of the CLI path above
  aws/                  S3 + CloudFront, App Runner, RDS
  gcp/                  Firebase Hosting, Cloud Run, Cloud SQL
```

Steps do not call each other. Each one returns a value and `setup.mjs` decides
what happens next. If you are looking for where something happens, the file
name is the answer.

## How the API gets built, and why there is no Root Directory here

Railway builds a GitHub service by looking for `Dockerfile` at the root of the
service's source directory. This repo has exactly one Dockerfile, at the
repository root, and it builds the API. The api service's **Root Directory is
left at its default and is never set, read, or repaired** by anything in this
folder or by `terraform/railway-netlify/`.

That is deliberate, and it is a change from an earlier design.

Previously a second, near-identical Dockerfile lived in `backend/` and the
installer tried to point Railway at it by setting Root Directory to `/backend`.
Setting that over the Railway CLI *stages* the change rather than committing
it, exactly as the dashboard does, so the installer reported success while
Railway carried on building the root Dockerfile. Because the root Dockerfile
produced a perfectly good image, nothing ever surfaced the failure. Two files
had to be hand-synced and which one you got was luck.

Railway's own docs are also clear that `railway.json` does **not** follow Root
Directory: with a root directory set, the config file is still read from the
repository root unless you separately point the service at
`/backend/railway.json`. Nothing did.

So the setting was deleted rather than made more reliable. The default is the
one build setting nobody has to apply or verify, which means it cannot drift.

If you ever do set Root Directory to `/backend` by hand, the build will now
fail loudly instead of silently falling back, because there is no longer a
Dockerfile there. That is the intended behaviour.
