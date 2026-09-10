## What this changes

<!-- One or two sentences. What is different after this merges. -->

## Why

<!-- The operational problem, or the issue this closes. -->

Closes #

## Type

- [ ] Bug fix
- [ ] New feature
- [ ] Ticket type or seed data
- [ ] Schema change (new migration)
- [ ] Documentation
- [ ] Refactor with no behavior change

## Verification

```
./database/migrate.sh --verify
./database/setup.sh --test
cd backend && python3 -m pytest
npm run build
```

- [ ] No applied migration drifted
- [ ] Schema assertions pass
- [ ] API tests pass
- [ ] Both frontends build
- [ ] A test fails without this change

<!-- Name the test that covers this, or say why one is not possible. -->

New or changed tests:

## If this touches the schema

- [ ] It is a new numbered migration, not an edit to an applied one
- [ ] Guarantees that have to hold under audit are enforced by constraint or trigger, not only by the API
- [ ] Nothing added a path that updates or deletes a transaction or an audit event
- [ ] `adms_attach_audit` is attached to any new table that needs a trail

## If this touches billing

- [ ] Quantity still comes from recorded ticket data, never from typed input
- [ ] Effective dating still holds. A rate change does not rewrite a computed transaction
- [ ] Re-processing a processed ticket still writes nothing

## If this adds a way to record a new kind of work

- [ ] It is `stage_schema`, `field_schema`, `rule_operands` or `unit_types` data, not a code branch

## Documentation

- [ ] Updated in this PR, or
- [ ] Not needed, because nothing observable changed

## Notes for the reviewer

<!-- Anything you want looked at closely, or a decision you were unsure about. -->
