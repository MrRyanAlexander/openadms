---
title: Configuration
description: Where each setting lives - the release's policy defaults by name, the firm's settings, and each project's settings - and the rule that a threshold is policy, never a number in code.
---

**Thresholds are policy**: never a number in code, never relaxed to pass a test. Settings live in
three places, from the most general to the most particular.

| Where                             | Who changes it                                                                 | Examples                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **The release's policy defaults** | A release, or an installation's own service settings where a setting allows it | Sign-in limits, session lengths, rate limits, file sizes                     |
| **The firm's settings**           | An admin, in the back office, audited                                          | What the firm calls its ADMS, viewers' two-step sign-in, the master passcode |
| **A project's settings**          | Whoever holds _Set up_, in the back office, audited                            | Load call limits, split loads, stump checks, the site circle                 |

A project's settings start from the release's defaults; the firm changes what its contract needs.

## The release's policy defaults

The built-in defaults ship in one committed file, `packages/domain/policy.env`, read by the domain
package's `Policy`, which refuses a value that is missing or out of its permitted range. It holds no
secret. The settings, by name:

### Field work and pricing

| Setting                                                                       | What it sets                                                                                                            |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `LOAD_CALL_LOW_LIMIT`, `LOAD_CALL_HIGH_LIMIT`                                 | A new project's load call limits (a call at or under the low one, or at or over the high one, is flagged; 0% always is) |
| `DISPOSAL_SITE_PROXIMITY_M`                                                   | The circle round a site's GPS, in metres, for a site without its own shape                                              |
| `STUMP_FILL_DEPTH_INCHES`                                                     | The root-ball height the stump fill is worked out with                                                                  |
| `CREW_DAY_HOURS`                                                              | A crew day's length, for crew time paid by the crew day by exact division                                               |
| `TICKET_NUMBER_BLOCK_SIZE`, `CERT_NUMBER_BLOCK_SIZE`, `ROE_NUMBER_BLOCK_SIZE` | How many unused numbers a phone holds after a top-up                                                                    |
| `DEVICE_CLOCK_OFF_LIMIT_MINUTES`                                              | How far a phone's clock may stand from the server's at a sync before its field events are flagged                       |
| `FIELD_EVENT_WAYPOINTS_AT_MOST`                                               | The most waypoints one collection takes                                                                                 |

### Sign-in and sessions

| Setting                                                                                                                                                                             | What it sets                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `PASSWORD_MINIMUM_LENGTH`, `PASSWORD_MAXIMUM_LENGTH`                                                                                                                                | Password length for back-office and viewer users (NIST SP 800-63B: length over complexity) |
| `PASSWORD_RESET_MINUTES`                                                                                                                                                            | How long a password reset sent by email stays good                                         |
| `ACCESS_TOKEN_MINUTES`, `SESSION_INACTIVITY_MINUTES`, `SESSION_OVERALL_HOURS`                                                                                                       | A back-office session's access token, its quiet time and its longest life                  |
| `SIGN_IN_TRIES_BEFORE_WAIT`, `SIGN_IN_TRIES_BEFORE_LOCK`, `SIGN_IN_FIRST_WAIT_SECONDS`, `SIGN_IN_LONGEST_WAIT_MINUTES`                                                              | Wrong tries at one login: when waits start, how they grow, when it locks                   |
| `SIGN_IN_ADDRESS_WINDOW_MINUTES`, `SIGN_IN_WRONG_TRIES_PER_ADDRESS`, `SIGN_IN_WRONG_TRIES_PER_ADDRESS_AT_LOGIN`, `PASSWORD_RESET_ASKS_PER_ADDRESS`, `PASSWORD_RESET_ASKS_PER_LOGIN` | Limits by address, so a stranger is stopped before a login's own count is spent            |
| `TWO_STEP_CODE_STEPS_EITHER_SIDE`, `TWO_STEP_SETUP_MINUTES`                                                                                                                         | Authenticator codes taken either side of now; how long setting one up may take             |
| `MASTER_PASSCODE_MINIMUM_LENGTH`, `MASTER_PASSCODE_MAXIMUM_LENGTH`                                                                                                                  | The master passcode's length                                                               |

### Phones

| Setting                                                                                                                                        | What it sets                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `PHONE_CHALLENGE_SECONDS`, `PHONE_TOKEN_MINUTES`                                                                                               | How long a phone's challenge may be answered; how long the token its proof gives lasts                      |
| `MONITOR_SESSION_HOURS`                                                                                                                        | A monitor's sign-in on a phone (a new installation's firm setting starts from it)                           |
| `PHONE_SIGN_IN_TRIES_BEFORE_WAIT`, `PHONE_SIGN_IN_TRIES_BEFORE_LOCK`, `PHONE_SIGN_IN_FIRST_WAIT_SECONDS`, `PHONE_SIGN_IN_LONGEST_WAIT_MINUTES` | The phone's own count of wrong tries offline                                                                |
| `PHONE_INACTIVITY_LOCK_MINUTES`, `PHONE_INACTIVITY_WARNING_SECONDS`                                                                            | The phone's lock after nothing is touched, and its warning                                                  |
| `PHONE_SYNC_EVERY_MINUTES`                                                                                                                     | How often a phone with a monitor signed in syncs on its own                                                 |
| `LOGIN_LIST_ENTRIES_PER_CALL`                                                                                                                  | Login-list entries the server makes in one call                                                             |
| `PHONE_KEY_REVOKED_AFTER_HOURS`                                                                                                                | How long a lost or retired phone keeps its key before the worker revokes it (a firm setting starts from it) |
| `PHONE_HELD_BYTES_PER_DAY`, `PHONE_HELD_RECORDS_PER_DAY`                                                                                       | What one phone may make the server hold for a person in a day before admins are told                        |

### Requests, files and maps

| Setting                                                                                                                                                                                                        | What it sets                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `REQUEST_BODY_LIMIT_BYTES`                                                                                                                                                                                     | The largest body the API reads from one request                                |
| `RATE_LIMIT_WINDOW_SECONDS`, `RATE_LIMIT_REQUESTS_PER_ADDRESS`, `RATE_LIMIT_REQUESTS_PER_ACCOUNT`, `RATE_LIMIT_REQUESTS_PER_PHONE`, `RATE_LIMIT_COUNTS_KEPT`, `RATE_LIMIT_FILE_PARTS_PER_PHONE`                | Rate limits on every request; a caller over one is answered `429`              |
| `MEDIA_FILE_BYTES_AT_MOST`, `MEDIA_PART_BYTES_AT_MOST`, `MEDIA_RECEIVING_BYTES_AT_MOST`, `MEDIA_STORE_ANSWER_SECONDS`                                                                                          | Photograph files, their resumable parts, and the object store's time to answer |
| `MAP_FILE_BYTES_AT_MOST`, `MAP_FILE_UNZIPPED_BYTES_AT_MOST`, `MAP_FILE_ENTRIES_AT_MOST`, `MAP_FILE_RING_PAIRS_AT_MOST`, `MAP_FILE_READ_SECONDS`, `MAP_FILE_READ_MEMORY_MEBIBYTES`, `ESRI_LAYER_ANSWER_SECONDS` | A project map's file or Esri layer, and the bounds it is read within           |
| `ADDRESS_LOOKUP_ANSWER_SECONDS`, `MAP_SERVER_ANSWER_SECONDS`                                                                                                                                                   | How long the address and routing servers have to answer                        |

### The database and the worker

| Setting                                                                                                               | What it sets                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `STATEMENT_TIMEOUT_MS`                                                                                                | How long one statement of a service's database login may run                                                                 |
| `DATABASE_POOL_CONNECTIONS`, `DATABASE_CONNECTION_WAIT_MS`, `DATABASE_WORK_LONGEST_MS`, `DATABASE_BUSY_RETRY_SECONDS` | Each service's connection pool, and what a caller told the database is busy is told                                          |
| `JOB_TRIES_BEFORE_SET_ASIDE`, `RECONCILIATION_RUN_LONGEST_MINUTES`, `JOB_QUEUE_POLL_SECONDS`, `JOB_TICKETS_AT_MOST`   | The worker's job queue: tries before a job is set aside for a person, a run's longest hold, how often it looks, a job's size |

## The firm's settings

**The firm → The firm's settings**, each change audited with its note:

- **What the firm calls its ADMS** (one to forty characters), shown on every screen and phone and in
  reports and mail, beside the Open ADMS release it is built on;
- **revoke a lost phone's key after** so many hours, or keep it until the phone is turned in;
- **read-only viewers must use two-step sign-in** (optional by default);
- **a monitor's session lasts** so many hours;
- **the master passcode**: changing it takes an admin's session and their own password again.

## A project's settings

**Setup → Project setup**: allow split loads; the load call limits (empty turns a check off); the
stump fill depth and the stump checks (root ball wider than the stump; half or more exposed where
fill is paid); a site's circle where it has no shape; the active window, how tickets are numbered,
field tags, primes and contracts. See [Set up a project](/guides/back-office/set-up-a-project/).

## Each service's settings and secrets

Each service (the API, the worker, the local stack) reads its own git-ignored env file, written once
by the installer, holding its database login, its keys and its addresses. **Never commit, print or
share one.** A service's env file may state its own value for the few policy settings that say so
(statement time, pool size, job size). See [Install an installation](/get-started/install/).
