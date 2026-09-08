# The OmniTodo build pattern

The original engineering prompt this system follows. Kept verbatim, because the
architecture decisions below are the ones Open ADMS inherits: a decoupled
monorepo, a single `DATABASE_URL`, a single `VITE_API_URL`, regex CORS for
dynamically generated frontend hosts, a container for the backend, Terraform for
three clouds, an interactive installer that mints an `INSTANCE_UNIQUE_KEY`, and
per-record cryptographic sharing between peer instances.

---

### Engineering Prompt: How to Build OmniTodo (what we will eventually make into Open ADMS)

You are an expert full-stack engineer and cloud architect. Your task is to build **OmniTodo**, a self-hosted, highly portable, serverless Todo platform with granular cryptographic sharing. Follow this precise execution sequence to build the entire codebase from scratch.

### Phase 1: Local Development & Decoupled Architecture

1. Initialize a Monorepo
   * Create a root directory named omnitodo.
   * Initialize two separate subdirectories: /frontend and /backend.
2. Build the Backend API (/backend)
   * Initialize a Node.js project using Express or a Python project using FastAPI.
   * Create standard CRUD endpoints for tasks.
   * Set up a database connection layer that maps strictly to a single environment variable: DATABASE_URL.
   * Enforce a flexible Cross-Origin Resource Sharing (CORS) setup using regex or wildcard configurations so it accepts incoming traffic from varying dynamically generated frontend URLs.
3. Build the Portable Static Frontend (/frontend)
   * Scaffold a lightweight Single Page Application (SPA) using Vite with React or Vue.
   * Abstract all API network interaction by pulling the base URL exclusively from a build-time environment variable: VITE_API_URL.
4. Containerize the Backend Compute
   * Write a localized, optimized Dockerfile in the /backend directory.
   * Expose a generic web port (EXPOSE 8080) and use a lightweight base runtime image.

### Phase 2: Configuration & The Cryptographic Visibility Engine

1. Design the Shared Database Schema, including owner_instance_key, visibility_flag (private, public, restricted) and allowed_viewers.
2. Implement Access Control Middleware screening all read operations:
   * private aborts unless the request originates from the local owner.
   * public bypasses checks.
   * restricted requires an X-Signature and timestamp, verified against an ID listed in allowed_viewers.
3. Code the Outbound Share Client: a Share Panel widget for toggling visibility flags and appending peer strings.

### Phase 3: Infrastructure as Code (IaC) & The Installation Wizard

1. Author cloud provisioning manifests under /deploy for netlify, aws and gcp.
2. Build an interactive CLI installer linked to npm run install that:
   * Prompts for the hosting destination, the DATABASE_URL, and registry opt-in.
   * Generates a cryptographically safe INSTANCE_UNIQUE_KEY using crypto.randomBytes(32).toString('hex').
   * Writes the responses into a fresh workspace-isolated .env file.
   * Invokes the corresponding Terraform automation for the chosen target.

### Phase 4: Verification & Integration Testing

1. Validate system independence by running the install pipeline against three unique namespaces.
2. Verify peer isolation: create Instance Alpha and Instance Beta, restrict a record on Alpha to Beta's key, and assert that Beta reads it while an unauthenticated third party receives 403.

---

## How Open ADMS maps onto it

| OmniTodo phase | Open ADMS |
|---|---|
| Monorepo, /frontend + /backend | `database/`, `backend/`, `frontend/` (back office), `mobile/` (field app), `deploy/` |
| CRUD endpoints | Full ADMS surface: projects, tickets, stages, rules, transactions, invoices, audit |
| Single `DATABASE_URL` | Unchanged, plus a PostGIS layer that is optional so the schema runs anywhere |
| Regex CORS | Unchanged, defaulting to Netlify, Railway, Render, Firebase and CloudFront hosts |
| Dockerfile, EXPOSE 8080 | `backend/Dockerfile`, python:3.11-slim, non-root user, healthcheck |
| `owner_instance_key`, `visibility_flag`, `allowed_viewers` | On both `projects` and `tickets` |
| X-Signature middleware | Ed25519 over a canonical payload, with timestamp skew and single-use nonces |
| Share Panel | Sharing & Peers screen in the back office |
| /deploy/{netlify,aws,gcp} | Terraform for all three |
| installer.js + npm run install | `installer.js`, interactive or `--yes` for CI |
| Peer isolation test | `test_a_restricted_project_needs_a_valid_signature` |
