# Security policy

Open ADMS keeps evidence that public money is paid on: every ticket, photograph and audited change
may be read in a federal audit or a fraud case years later. A weakness in it matters. Thank you for
taking the time to report one.

## Reporting a vulnerability

**Please report it privately, never in a public issue, pull request or discussion.**

Use GitHub's private vulnerability reporting on this repository: the **Security** tab, then
**Report a vulnerability**. Your report is seen only by the maintainers until a fix is published.

Please include, as far as you can:

- what is affected: the part (the API, the worker, the back office, the viewer portal, the field
  app, the installer, the local stack) and the commit or release;
- what an attacker could do, and who they would need to be (nobody signed in, a monitor on an
  enrolled phone, a read-only viewer, a manager/analyst, an admin);
- the steps to reproduce it, with a proof of concept where you have one;
- anything you know of a fix.

Never include real people's data, real credentials or a firm's records in a report. Test against
your own installation (`pnpm start` brings one up locally) or the example world the stories use.

## What happens next

- We acknowledge a report within **3 working days**.
- We tell you within **10 working days** whether we can reproduce it, how severe we judge it and
  what we plan to do.
- We keep you told as the fix goes on, and we credit you in the advisory when it is published,
  unless you ask us not to.
- We aim to publish a fix for a critical or high-severity issue within **30 days** of confirming
  it, and we coordinate the advisory's date with you.

## Supported versions

Open ADMS is installed and run by each firm on its own. Fixes are made on the main branch and in
the newest release; a firm upgrades its installation to take them. Older releases get no fixes.

## Scope

In scope: the code in this repository, its default configuration and the local stack it ships
(`infra/local`). Out of scope: a firm's own cloud, its network and its identity provider; third
parties' services; denial of service by volume alone; reports from automated scanners without a
demonstrated impact; and social engineering.

## Safe harbour

We will not pursue or support legal action against anyone who finds and reports a vulnerability in
good faith and within this policy: who avoids harm to people's data and to anyone's service,
tests only against an installation they own or are allowed to test, and gives us a reasonable time
to fix it before saying anything in public.

## How Open ADMS is secured

The design is in `spec/ARCHITECTURE.md` §16 and `spec/THREAT-MODEL.md`; the API is checked against
OWASP ASVS 5.0 Level 2 (`spec/CHECKLIST-API.md`) and the field app against OWASP MASVS
(`spec/CHECKLIST-FIELD.md`); people sign in as NIST SP 800-63B asks. The database enforces its own
rules (roles, grants, constraints, triggers), its audit log is append-only, and every service
speaks HTTPS, locally too.
