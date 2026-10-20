// Enrolment, the phone's proof and "Create monitor" in the browser build (BACKLOG 3.2.2; ADR-572),
// through the screens, against the real API in the run's own world (e2e/world-setup.ts): a phone
// enrolled under the master passcode with a key it made, proven by signing the server's challenge,
// its token held nowhere but its keyring and proven again when the server stops taking it, and a
// monitor created under the passcode with the Monitor ID the server issued shown.
import { createPublicKey, verify } from 'node:crypto';

import { PhoneProofRules } from '@open-adms/domain';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { enrolled, filled, rawlyHeld, recorded, toApi } from './phone-page.ts';
import { worldApiOrigin, worldOrigin, worldPasscode } from './world.ts';

test('AC-02-18, AC-11-11, AC-11-13: enrolled online under the master passcode, the phone makes its key in the browser and can’t read it out, sends its public half alone, and proves itself by signing the server’s challenge in DER; it asks nothing of anyone but the firm’s API', async ({
  page,
}) => {
  const asked = recorded(page);
  await enrolled(page, 'P1-COL-1');
  const api = toApi(asked);
  const [enrolment, challenge, proof] = api.slice(1);
  const deviceId = (enrolment?.answer as { deviceId: string }).deviceId;
  expect(api.map(({ method, path, status }) => `${method} ${path} ${String(status)}`)).toEqual([
    'GET /health 200',
    'POST /phones/enrolments 200',
    `POST /phones/${deviceId}/challenges 200`,
    `POST /phones/${deviceId}/proofs 200`,
    'GET /phones/current 200',
  ]);

  // Its name, the passcode and the public half of a P-256 key: nothing else.
  const sent = enrolment?.body as { name: string; passcode: string; publicKey: string };
  expect(Object.keys(sent).sort()).toEqual(['name', 'passcode', 'publicKey']);
  expect(sent.name).toBe('P1-COL-1');
  const publicKey = createPublicKey({
    key: Buffer.from(sent.publicKey, 'base64'),
    format: 'der',
    type: 'spki',
  });
  expect(publicKey.asymmetricKeyDetails).toEqual({ namedCurve: 'prime256v1' });

  // The proof: the domain's text for the server's challenge, signed in DER by that key.
  const madeChallenge = (challenge?.answer as { challenge: string }).challenge;
  const proven = proof?.body as { challenge: string; signature: string };
  expect(Object.keys(proven).sort()).toEqual(['challenge', 'signature']);
  expect(proven.challenge).toBe(madeChallenge);
  expect(
    verify(
      'sha256',
      Buffer.from(PhoneProofRules.signed(madeChallenge)),
      { key: publicKey, dsaEncoding: 'der' },
      Buffer.from(proven.signature, 'base64'),
    ),
  ).toBe(true);
  // The token the proof answered is what the phone's request carried.
  const { token } = proof?.answer as { token: string };
  expect(api[4]?.authorization).toBe(`Bearer ${token}`);

  // The private half is the browser's, used and never read out; the public half is the one sent.
  const held = await rawlyHeld(page, []);
  expect(held.deviceKey).toEqual({
    type: 'private',
    extractable: false,
    algorithm: { name: 'ECDSA', namedCurve: 'P-256' },
    usages: ['sign'],
    readOut: 'InvalidAccessError',
    publicKey: sent.publicKey,
  });

  // Its own page and the firm's API: no other service, and no attestation of Apple's or Google's.
  expect(new Set(asked.map(({ url }) => new URL(url).origin))).toEqual(
    new Set([worldOrigin(), worldApiOrigin]),
  );
});

test('AC-11-12, AC-02-07: the token is kept in the keyring alone, never the web layer’s storage; opened again the phone proves itself afresh, and answered PHONE_NOT_PROVEN it proves itself again and carries on, asking nobody anything; the monitor created is shown their Monitor ID', async ({
  page,
}) => {
  const asked = recorded(page);
  await enrolled(page, 'P1-COL-2');
  const proofs = () => toApi(asked).filter(({ path }) => path.endsWith('/proofs'));
  const { token } = proofs()[0]?.answer as { token: string };

  // Kept nowhere the browser writes down: not in the store, the keyring or the web layer.
  const held = await rawlyHeld(page, [token, worldPasscode()]);
  expect(held.storeRows).toBe(1);
  expect(held.foundInStore).toEqual([]);
  expect(held.databases).toEqual(['open-adms-keyring', 'open-adms-phone']);
  expect(held.webStorage).toEqual([0, 0, '']);

  // Opened again: the store kept the enrolment, and the token, held in memory, is gone with the
  // page: the phone proves itself afresh, asking nobody.
  await page.reload();
  await expect(page.getByRole('status')).toHaveText(english.phone.standing.inService);
  expect(proofs()).toHaveLength(2);
  const { token: second } = proofs()[1]?.answer as { token: string };
  expect(second).not.toBe(token);

  // The server stops taking the phone's token (as one run out by its clock): the next request
  // carries one it doesn't take, is refused, and the phone proves itself again and asks again.
  let altered = false;
  await page.route(`${worldApiOrigin}/phones/current/monitors`, async (route) => {
    if (altered) {
      await route.continue();
      return;
    }
    altered = true;
    await route.continue({
      headers: { ...route.request().headers(), authorization: 'Bearer a-token-no-longer-taken' },
    });
  });
  await checkScreen(page);
  await page.getByRole('button', { name: english.phone.createMonitor }).click();
  await page.getByLabel(english.createMonitor.name).fill('Ana Brooks');
  await page.getByLabel(english.createMonitor.passwordLabel).fill('5550101');
  await page.getByLabel(english.createMonitor.passcode).fill(worldPasscode());
  const from = toApi(asked).length;
  await checkScreen(page);
  await page.getByRole('button', { name: english.createMonitor.create }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.monitorCreated.title);
  const after = toApi(asked).slice(from);
  expect(after.map(({ method, path, status }) => `${method} ${path} ${String(status)}`)).toEqual([
    'POST /phones/current/monitors 401',
    expect.stringMatching(/^POST \/phones\/[0-9a-f-]+\/challenges 200$/),
    expect.stringMatching(/^POST \/phones\/[0-9a-f-]+\/proofs 200$/),
    'POST /phones/current/monitors 200',
  ]);
  expect(after[0]?.answer).toMatchObject({ code: 'PHONE_NOT_PROVEN' });
  const { token: third } = after[2]?.answer as { token: string };
  expect(after[3]?.authorization).toBe(`Bearer ${third}`);
  expect(after[3]?.body).toEqual({
    name: 'Ana Brooks',
    password: '5550101',
    passcode: worldPasscode(),
  });

  // The Monitor ID the server issued, which is their username (its body is read after the screen
  // may already show it).
  // Polled on the requests as they are now: `toApi` copies each, so a copy made before the answer
  // came never gets it.
  await expect.poll(() => toApi(asked).slice(from)[3]?.answer).toBeDefined();
  const created = toApi(asked).slice(from)[3]?.answer as { monitorNumber: string; name: string };
  expect(created.monitorNumber).toMatch(/^M\d{6,}$/);
  await expect(
    page.getByText(
      filled(english.monitorCreated.monitorId, {
        name: 'Ana Brooks',
        monitorNumber: created.monitorNumber,
      }),
    ),
  ).toBeVisible();
  await expect(page.getByText(english.monitorCreated.username)).toBeVisible();
});

test('AC-02-18, AC-02-07: without a connection nothing is enrolled or created and the screen says so; a passcode the server doesn’t take is said plainly; a monitor’s phone number goes where one is given', async ({
  page,
  context,
}) => {
  const asked = recorded(page);
  await page.goto(worldOrigin());
  await expect(page.getByRole('status')).toHaveText(english.shell.server.answers);

  // Nothing typed: nothing made or sent.
  await page.getByRole('button', { name: english.enrol.enrol }).click();
  await expect(page.getByText(english.enrol.incomplete)).toBeVisible();

  // A passcode that isn't the firm's: refused, the field emptied, nothing kept.
  await page.getByLabel(english.enrol.name).fill('P1-TWR-1');
  await page.getByLabel(english.enrol.passcode).fill('not-the-firms-passcode');
  await page.getByRole('button', { name: english.enrol.enrol }).click();
  await expect(page.getByText(english.refusals.passcode)).toBeVisible();
  await expect(page.getByLabel(english.enrol.passcode)).toHaveValue('');

  // No signal: the phone says enrolling needs one, and is still not enrolled.
  await context.setOffline(true);
  await page.getByLabel(english.enrol.passcode).fill(worldPasscode());
  await page.getByRole('button', { name: english.enrol.enrol }).click();
  await expect(page.getByText(english.refusals.unreachable)).toBeVisible();
  await checkScreen(page);
  // The try with no signal never reached the server: it has no answer.
  expect(toApi(asked).map(({ path, status }) => `${path} ${String(status)}`)).toEqual([
    '/health 200',
    '/phones/enrolments 401',
    '/phones/enrolments undefined',
  ]);

  // Signal again: enrolled.
  await context.setOffline(false);
  await page.getByLabel(english.enrol.passcode).fill(worldPasscode());
  await page.getByRole('button', { name: english.enrol.enrol }).click();
  await expect(page.getByRole('status')).toHaveText(english.phone.standing.inService);

  // Create monitor with no signal: nothing created, and the screen says so.
  await page.getByRole('button', { name: english.phone.createMonitor }).click();
  await expect(page.getByText(english.createMonitor.needs)).toBeVisible();
  await page.getByLabel(english.createMonitor.name).fill('Sam Grant');
  await page.getByLabel(english.createMonitor.passwordLabel).fill('5550102');
  await page.getByLabel(english.createMonitor.phone).fill('302-555-0102');
  await context.setOffline(true);
  await page.getByLabel(english.createMonitor.passcode).fill(worldPasscode());
  await page.getByRole('button', { name: english.createMonitor.create }).click();
  await expect(page.getByText(english.refusals.unreachable)).toBeVisible();
  await context.setOffline(false);

  // A wrong passcode, said plainly; then the right one.
  await page.getByLabel(english.createMonitor.passcode).fill('not-the-firms-passcode');
  await page.getByRole('button', { name: english.createMonitor.create }).click();
  await expect(page.getByText(english.refusals.passcode)).toBeVisible();
  await expect(page.getByLabel(english.createMonitor.passcode)).toHaveValue('');
  await checkScreen(page);
  await page.getByLabel(english.createMonitor.passcode).fill(worldPasscode());
  await page.getByRole('button', { name: english.createMonitor.create }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.monitorCreated.title);
  const monitors = toApi(asked).filter(({ path }) => path === '/phones/current/monitors');
  expect(monitors.map(({ status }) => status)).toEqual([undefined, 401, 200]);
  expect(monitors[2]?.body).toEqual({
    name: 'Sam Grant',
    password: '5550102',
    phone: '302-555-0102',
    passcode: worldPasscode(),
  });
  await checkScreen(page);

  // Done: back to the phone, nobody signed in.
  await page.getByRole('button', { name: english.monitorCreated.done }).click();
  await expect(page.getByText(english.phone.nobody)).toBeVisible();
});
