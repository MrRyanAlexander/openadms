<div align="center">
<sub>

**[Repository](README.md)** · [Documentation](docs/) · [Contributing](CONTRIBUTING.md) · [Code of conduct](CODE_OF_CONDUCT.md)

</sub>
</div>

# Security policy

Open ADMS holds project records that get read years later under audit, and it carries a cryptographic identity that other instances trust. Both of those raise the stakes on a vulnerability above the usual.

<br>

## Reporting a vulnerability

**Do not open a public issue.**

Use [GitHub private vulnerability reporting](../../security/advisories/new), which is enabled on this repository. If that is not available to you, email **ryanalex314@gmail.com** with `OPENADMS SECURITY` in the subject.

Please include:

- What you found, and the impact you believe it has
- Steps to reproduce, or a proof of concept
- The commit or release you tested against
- Whether you would like to be credited in the advisory

| | |
|---|---|
| Acknowledgement | Within 72 hours |
| Initial assessment | Within 7 days |
| Fix or mitigation plan | Communicated with the assessment |
| Public disclosure | Coordinated with you, after a fix is available |

<br>

## In scope

| Area | Examples |
|---|---|
| **Authentication and sessions** | Token forgery, refresh token reuse, session fixation, rank escalation past what [access control](docs/ACCESS_CONTROL.md) permits |
| **The peer signing scheme** | Signature forgery, nonce replay, timestamp manipulation, reading a project you are not in `allowed_viewers` for |
| **Data exposure** | Reading tickets, transactions, documents or audit events across a project or an instance boundary |
| **Injection** | Anywhere, and the [query builder](docs/ACCESS_CONTROL.md#the-query-builder) in particular |
| **Audit integrity** | Any path that writes, edits or deletes a transaction or an audit event outside the sanctioned reversal flow |
| **The installer and deploy scripts** | Secret leakage into logs, state files or version control |

<br>

## Out of scope

- The default `JWT_SECRET` of `change-me-in-production`. It is a documented development default, the installer replaces it, and [the deployment guide](docs/DEPLOYMENT.md) says so
- The demo seed and its shared `openadms` password. It exists to make the system explorable and the README warns against running it on a real instance
- Anything requiring an attacker to already hold `DATABASE_URL` or admin credentials
- Denial of service through raw volume against an instance you do not operate
- Findings from an automated scanner with no demonstrated impact

<br>

## Deploying safely

| | |
|---|---|
| `JWT_SECRET` | Set it. `openssl rand -hex 32`. Never ship the default |
| `INSTANCE_UNIQUE_KEY` | Minted at install. Do not copy one instance's key onto another |
| Ed25519 private key | Written `chmod 600`. It is in `.gitignore`. Keep it that way |
| `CORS_ORIGIN_REGEX` | Scope it to your real hostnames. A permissive pattern is a real finding |
| `.env` files | All gitignored. Check before your first push anyway |
| Database | Do not expose Postgres publicly beyond the window a migration needs. [Deployment](docs/DEPLOYMENT.md) covers the Railway proxy path |
| Peers | `is_trusted` is a deliberate decision, not a formality. Rotate with `POST /instance/rotate-keys` if a key is ever exposed |

<br>

## What the system already enforces

Worth knowing before you report something as a finding, and worth verifying if you are testing it.

| Property | Enforced by |
|---|---|
| Transactions never change | Database trigger, not application logic |
| Audit events never change | Database trigger |
| Every write is attributed | Transaction local settings read by the audit trigger |
| Refresh tokens are never stored in the clear | sha256 digest in `user_sessions` |
| Refresh tokens are single use | Rotation on every refresh |
| Passwords are bcrypt | 12 rounds by default |
| Query builder columns are validated server side | Against the live view definition |
| Every query builder value is a bound parameter | No interpolation reaches the driver |
| Peer nonces are single use | `peer_request_nonces` |
| Peer timestamps expire | `PEER_SIGNATURE_SKEW_SECONDS`, default 300 |

<br>

## Supported versions

The project is pre 1.0. Security fixes land on `main` and are noted in the release that follows.

<br>

<div align="center">
<sub>

**[Repository](README.md)** · **[Access control](docs/ACCESS_CONTROL.md)** · **[Federation](docs/FEDERATION.md)**

</sub>
</div>
