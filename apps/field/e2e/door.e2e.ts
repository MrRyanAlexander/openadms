// The field app's door (BACKLOG 3.1.2; ADR-565): its browser build served over HTTPS at a name of
// its own through Caddy, the page's policy and headers, the API reached across origins with a
// phone's token, and the shell's first screen in the translation file's words.
import { request } from 'node:http';

import type { Page } from '@playwright/test';

import { localApiOrigin, pagePolicy, servedHeaders, servedPolicy } from '../page.ts';
import english from '../src/words/en.json' with { type: 'json' };
import { expect, test } from './accessible.ts';
import { anotherOrigin, apiOrigin, fieldOrigin, servedOverHttps } from './stack.ts';

// Every word the translation file holds, at any depth.
function wordsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(wordsOf);
  return [];
}

// The shell, once it has asked the server; what the page asked for, and what it was told off for.
async function opened(page: Page) {
  const asked: string[] = [];
  const complaints: string[] = [];
  page.on('request', (sent) => asked.push(sent.url()));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') complaints.push(message.text());
  });
  page.on('pageerror', (error) => complaints.push(error.message));
  const answer = await page.goto('/');
  await expect(page.getByRole('status')).toHaveText(english.shell.server.answers);
  return { answer, asked, complaints };
}

test('AC-11-01, AC-11-03: the browser build is served over HTTPS at its own name, says it is for testing, and reaches the API and nothing else of the stack’s', async ({
  page,
}) => {
  const { answer, asked, complaints } = await opened(page);
  expect(answer?.url()).toBe(`${fieldOrigin}/`);
  expect(answer?.status()).toBe(200);
  expect(new URL(page.url()).protocol).toBe('https:');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.app.name);
  await expect(page.getByText(english.shell.testBuild)).toBeVisible();
  await expect(page.getByText(english.shell.notSetUp)).toBeVisible();
  // Its own files, then the API's health answer: no other name, and nothing outside the stack.
  expect(new Set(asked.map((url) => new URL(url).origin))).toEqual(
    new Set([fieldOrigin, apiOrigin]),
  );
  expect(asked.filter((url) => url.startsWith(apiOrigin))).toEqual([`${apiOrigin}/health`]);
  expect(apiOrigin).toBe(localApiOrigin);
  expect(complaints).toEqual([]);
});

test('AC-11-01: plain HTTP at the field app’s name is sent to HTTPS, never answered with the app', async () => {
  const answer = await new Promise<{ status: number; location: string; body: string }>(
    (resolve, reject) => {
      const sent = request(
        { host: '127.0.0.1', port: 80, path: '/', headers: { host: 'field.adms.localhost' } },
        (received) => {
          let body = '';
          received.setEncoding('utf8');
          received.on('data', (chunk: string) => (body += chunk));
          received.on('end', () => {
            resolve({
              status: received.statusCode ?? 0,
              location: received.headers.location ?? '',
              body,
            });
          });
        },
      );
      sent.on('error', reject);
      sent.end();
    },
  );
  expect(answer).toEqual({ status: 308, location: `${fieldOrigin}/`, body: '' });
});

test('AC-11-61: the page is served with its policy and headers, and states the same policy itself', async ({
  page,
}) => {
  const { answer } = await opened(page);
  const headers = answer?.headers() ?? {};
  expect(headers['content-security-policy']).toBe(servedPolicy(apiOrigin));
  expect(headers).toMatchObject({
    ...servedHeaders,
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cache-control': 'no-cache',
  });
  expect(headers['server']).toBeUndefined();
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    pagePolicy(apiOrigin),
  );
  // Its bundle: its own name, kept as long as it holds what it holds.
  const src = (await page.locator('script[type="module"]').getAttribute('src')) ?? '';
  expect(src).toMatch(/^\/assets\/index-[\w-]+\.js$/);
  const bundle = await servedOverHttps(`${fieldOrigin}${src}`);
  expect([bundle.status, bundle.headers['cache-control']]).toEqual([
    200,
    'public, max-age=31536000, immutable',
  ]);
});

test('AC-11-61: on the page no script but its own runs, no HTML is made from a string, eval is refused, and nothing of another origin is reached', async ({
  page,
}) => {
  await opened(page);
  // A test's own script runs through the browser's DevTools, which let it past the policy unless
  // told not to: it is told, so each try meets the page's policy as the page's own code would.
  const devtools = await page.context().newCDPSession(page);
  const asPage = async (expression: string): Promise<unknown> => {
    const { result } = (await devtools.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      allowUnsafeEvalBlockedByCSP: false,
    })) as { result: { value?: unknown } };
    return result.value;
  };
  const outcome = (attempt: string) =>
    asPage(`(() => {
      try { ${attempt}; return 'done'; } catch (error) { return error.name; }
    })()`);
  const reached = (url: string) =>
    asPage(`fetch(${JSON.stringify(url)}, { cache: 'no-store' }).then(
      () => 'reached',
      (error) => error.name,
    )`);
  const tried = {
    eval: await outcome("eval('1 + 1')"),
    newFunction: await outcome("new Function('return 1')"),
    innerHtml: await outcome("document.body.innerHTML = '<p>made from a string</p>'"),
    inlineScript: await outcome(
      "const script = document.createElement('script'); script.textContent = 'document.title = 1'; document.body.append(script)",
    ),
    objectStore: await reached('https://s3.adms.localhost/'),
    mailCatcher: await reached('https://mail.adms.localhost/'),
    outside: await reached('https://example.org/'),
  };
  expect(tried).toEqual({
    eval: 'EvalError',
    newFunction: 'EvalError',
    innerHtml: 'TypeError',
    inlineScript: 'TypeError',
    objectStore: 'TypeError',
    mailCatcher: 'TypeError',
    outside: 'TypeError',
  });
  await expect(page).toHaveTitle(english.app.name);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.app.name);
});

test('AC-11-61: a page of another origin can’t frame the app', async ({ page }) => {
  const elsewhere = await anotherOrigin();
  try {
    // The app's page comes back, and the browser shows nothing of it: its answer refuses the frame.
    const refused = page.waitForEvent(
      'requestfailed',
      (failed) => failed.url() === `${fieldOrigin}/`,
    );
    await page.goto(`${elsewhere.origin}/framing`);
    expect((await refused).failure()?.errorText).toBe('net::ERR_BLOCKED_BY_RESPONSE');
    const framed = page.frames().find((frame) => frame !== page.mainFrame());
    expect(await framed?.locator('h1').count()).toBe(0);
  } finally {
    await elsewhere.close();
  }
});

test('AC-11-02, AC-10-08: the app’s page sends a phone’s token to the API as Authorization and reads the answer; a page of another origin reads nothing', async ({
  page,
}) => {
  await opened(page);
  const ask = (mode: 'cors' | 'no-cors') =>
    page.evaluate(
      async ({ api, mode }) => {
        try {
          const answer = await fetch(`${api}/phones/current`, {
            mode,
            headers: mode === 'cors' ? { authorization: 'Bearer not-a-phone-token' } : {},
            credentials: 'omit',
          });
          if (answer.type === 'opaque') return { reached: 'opaque' };
          return { status: answer.status, body: (await answer.json()) as { code?: string } };
        } catch (error) {
          return { refused: error instanceof Error ? error.name : 'refused' };
        }
      },
      { api: apiOrigin, mode },
    );
  expect(await ask('cors')).toMatchObject({ status: 401, body: { code: 'PHONE_NOT_PROVEN' } });

  // The API is reached from the other page (its answer is opaque to it), and nothing is read.
  const elsewhere = await anotherOrigin();
  try {
    await page.goto(`${elsewhere.origin}/`);
    expect(await ask('no-cors')).toEqual({ reached: 'opaque' });
    expect(await ask('cors')).toEqual({ refused: 'TypeError' });
  } finally {
    await elsewhere.close();
  }
});

test('AC-11-04: every word on the shell’s screen is the translation file’s', async ({ page }) => {
  await opened(page);
  const shown = await page.evaluate(() => {
    const texts: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? '';
      if (text !== '') texts.push(text);
    }
    return { texts, title: document.title, language: document.documentElement.lang };
  });
  expect(shown.texts.length).toBeGreaterThan(0);
  const words = new Set(wordsOf(english));
  expect(shown.texts.filter((text) => !words.has(text))).toEqual([]);
  expect(shown.title).toBe(english.app.name);
  expect(shown.language).toBe(english.language);
});
