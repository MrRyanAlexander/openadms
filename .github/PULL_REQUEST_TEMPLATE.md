## What this changes

<!-- One or two sentences. What is different after this merges. -->

## Why

<!-- The operational problem, or the issue this closes. -->

Closes #

## Type

- [ ] Bug fix
- [ ] New feature
- [ ] Schema change (a new Prisma migration)
- [ ] A screen, its words or its accessibility
- [ ] Documentation or spec
- [ ] Refactor with no behaviour change

## Verification

<!-- The smallest runs that prove it, then the chain once. Paste the result lines. -->

```
pnpm vitest run <file> -t "<test name>"
pnpm chain
```

- [ ] A test fails without this change. Named here:
- [ ] `pnpm chain` green

## If this touches the database

- [ ] A new Prisma migration; no generated or applied migration edited
- [ ] Guarantees that must hold under audit are enforced by a constraint, grant or trigger, not only by the code
- [ ] Nothing hard-deletes a record or changes an `AuditRecord`
- [ ] No threshold or unique constraint relaxed to pass a test

## If this touches the engine or pricing

- [ ] Rules shared by phone and server live once, in `packages/domain`; payloads once, in `packages/contracts`
- [ ] Problems are flagged, never refused
- [ ] Transactions are regenerated from the events, never reversed or typed in
- [ ] Monitors still never see a rate or a code

## If this touches a screen

- [ ] Every word comes from the app's `words/`, so it can be translated
- [ ] The accessibility check passes in light and dark, at 320 px and 200% text
- [ ] A browser test covers it

## If this adds a dependency

- [ ] Exact version, published at least seven days ago, licence compatible with Apache-2.0
- [ ] `pnpm licences` and `pnpm security` pass; why it's needed is in the commit message

## Documentation

- [ ] Updated in this pull request, or
- [ ] Not needed, because nothing observable changed

## Notes for the reviewer

<!-- Anything you want looked at closely, or a decision you were unsure about. -->
