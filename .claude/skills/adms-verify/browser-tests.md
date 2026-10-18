# The browser end-to-end tests (`pnpm e2e`; ADR-564, 565)

The field app's browser build as the local stack serves it: `https://field.adms.localhost`, over
HTTPS through Caddy, in Playwright 1.64.0's Chromium headless shell, as a phone (`devices['Pixel
7']`). **Needs `pnpm ready`.** `pnpm e2e` typechecks and builds the field app (`tsc --build && vite
build` into `apps/field/dist/web/`, which Caddy serves as it is: a build is live at once), fetches
the browser if it is missing (`playwright install --only-shell chromium`, into the person's own
cache), then runs `apps/field/e2e/*.e2e.ts`. A step of `pnpm chain` after the stories; its count is
`CHAIN.md`'s. Only these: `cd apps/field && node_modules/.bin/playwright test` (`-g <words>` for
some). Their output and any failure's context: `.cache/adms/e2e/`.

## What earlier tasks learned

- **The stack's root is trusted by checked keys, never by "take any certificate".** The config
  (`playwright.config.ts`) asks `e2e/stack.ts`'s `trustedKeys` first: Node connects to each name
  the page reaches, checks the chain against `infra/local/.generated/caddy-root.crt` and the name,
  and Chromium is told only those certificates' SPKI hashes (`--ignore-certificate-errors-spki-list`).
  `ignoreHTTPSErrors` is never used. A new name the page reaches joins the config's list. Node-side
  requests (Playwright's `page.request` doesn't hold the root) go through `servedOverHttps`.
- **A page of another origin is served from this machine's loopback** (`anotherOrigin()`: plain
  HTTP on `127.0.0.1`, a made-up port). Chromium's local network access check refuses a public page
  reaching `*.localhost` before our headers are read (`net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`):
  a page made up at `https://evil.example` by `page.route` "proves" CORS and framing whatever the
  stack sends (seen, task 3.1.2). The exact look-alike origins of AC-11-02 are held at the API
  (`apps/api/test/door.test.ts`, by their `Origin` header).
- **A refusal is read by its cause.** A refused frame is `requestfailed` with
  `net::ERR_BLOCKED_BY_RESPONSE` (the headless shell logs nothing to the console for it); a CORS
  refusal is a `TypeError` while the same request in `no-cors` mode reaches the API (opaque).
- **DevTools lets a test's own script past the page's policy** (`page.evaluate`: eval and
  `new Function` run). A try that must meet the policy as the page's own code would goes through a
  CDP session's `Runtime.evaluate` with `allowUnsafeEvalBlockedByCSP: false`.
- **The page's own `connect-src` names the API alone**: the page can't fetch its own files, so a
  header of the bundle is read from Node.
- **Every console error or warning is a failure** of the first test: Zod's probe for `new Function`
  was one (two "requires 'TrustedScript'" errors), answered in `packages/contracts/src/on-a-page.ts`.
- **A change to `infra/local/Caddyfile`** needs `docker restart open-adms-local-caddy-1` (a mounted
  file). A loosening of it, or of the app, runs with
  `"build": ["sh", "-c", "pnpm --filter @open-adms/field build >/dev/null 2>&1 && docker restart open-adms-local-caddy-1 >/dev/null && sleep 3"]`
  and `"run": ["sh", "-c", "cd apps/field && node_modules/.bin/playwright test"]`; `loosen.mjs`
  can't name the failed test from Playwright's output, so read each loosening's log for its `✘`.
- **A test's name starts with the scenario IDs it proves**, as Vitest's do.
