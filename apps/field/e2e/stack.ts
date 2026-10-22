// The local stack as the field app's browser tests reach it (ADR-564): its names; the keys the
// browser is told to trust and an answer asked from Node, as every web app's tests take them
// (@open-adms/look/testing); a page of another origin; and a built folder served from loopback.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

export { servedOverHttps, trustedKeys } from '@open-adms/look/testing';

export const fieldOrigin = 'https://field.adms.localhost';
export const apiOrigin = 'https://api.adms.localhost';

// A page of another origin, on this machine's own loopback as the stack is, so that the browser's
// own guard against a public page reaching this machine (its local network access check) stays
// out of it and only the stack's answers decide what that page may do. Plain HTTP, made up for
// the test: `http://127.0.0.1:<port>`, a page that frames the app, or one that holds nothing.
export async function anotherOrigin(): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = createServer((asked, answer) => {
    const framing = asked.url === '/framing';
    answer.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    answer.end(
      framing
        ? `<!doctype html><title>x</title><iframe src="${fieldOrigin}/"></iframe>`
        : '<!doctype html><title>x</title>',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No port.');
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
      }),
  };
}

// A built folder served from this machine's loopback, with the headers given, for a page the stack
// doesn't serve (the field app built for the run's own world, dist/world): plain HTTP on `127.0.0.1`, a made-up
// port; a path naming no file is "not found", and nothing outside the folder is served.
export async function servedFolder(
  folder: string,
  headers: Readonly<Record<string, string>>,
): Promise<{ origin: string; close: () => Promise<void> }> {
  const types: Readonly<Record<string, string>> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
  };
  const root = resolve(folder);
  const server = createServer((asked, answer) => {
    const path = new URL(asked.url ?? '/', 'http://127.0.0.1').pathname;
    const file = resolve(join(root, path === '/' ? 'index.html' : path));
    const type = types[extname(file)];
    if (!file.startsWith(`${root}${sep}`) || type === undefined) {
      answer.writeHead(404).end();
      return;
    }
    readFile(file).then(
      (body) => {
        answer.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', ...headers });
        answer.end(body);
      },
      () => {
        answer.writeHead(404).end();
      },
    );
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No port.');
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    close: () =>
      new Promise<void>((done, failed) => {
        server.close((error) => {
          if (error === undefined) done();
          else failed(error);
        });
      }),
  };
}
