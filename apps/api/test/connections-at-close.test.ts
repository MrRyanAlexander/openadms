// The connections a closing server ends (`ConnectionsAtClose`; W0, "the browser runs steady"), on
// a server of this test's over HTTPS with the local stack's certificate for this machine, a client
// checking it against the stack's root as the proxy does: one that has carried no request holds
// Node's close until its other end hangs up, and is ended; a request under way is answered whole,
// its connection closed after it rather than left to idle out the keep-alive. It needs
// `pnpm local:up`, which makes the certificate.
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { connect, type TLSSocket } from 'node:tls';

import { afterEach, describe, expect, it } from 'vitest';

import { ConnectionsAtClose } from '../src/process/connections-at-close.ts';
import { hostCertFile, hostKeyFile, stackRootCert } from './support/stack-https.ts';

const opened: TLSSocket[] = [];
const servers: Server[] = [];

afterEach(() => {
  for (const socket of opened.splice(0)) socket.destroy();
  for (const server of servers.splice(0)) server.closeAllConnections();
});

// A server on the loopback, keeping connections alive as the API does, that answers each request
// when the test says.
async function served(): Promise<{ server: Server; port: number; asked: Promise<ServerResponse> }> {
  let heard: (response: ServerResponse) => void = () => undefined;
  const asked = new Promise<ServerResponse>((resolve) => {
    heard = resolve;
  });
  const server = createServer(
    { cert: readFileSync(hostCertFile), key: readFileSync(hostKeyFile) },
    (_request, response) => {
      heard(response);
    },
  );
  server.keepAliveTimeout = 72_000;
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, port: (server.address() as AddressInfo).port, asked };
}

async function connected(port: number): Promise<TLSSocket> {
  const socket = connect({
    host: '127.0.0.1',
    port,
    servername: 'localhost',
    ca: readFileSync(stackRootCert),
  });
  opened.push(socket);
  await once(socket, 'secureConnect');
  return socket;
}

// Whether the server's close is done within the time given.
async function closedWithin(server: Server, milliseconds: number): Promise<boolean> {
  return Promise.race([
    new Promise<boolean>((resolve) => {
      server.close(() => {
        resolve(true);
      });
    }),
    new Promise<boolean>((resolve) => {
      setTimeout(() => {
        resolve(false);
      }, milliseconds);
    }),
  ]);
}

describe('the connections a closing server ends', () => {
  it('a connection that has carried no request holds Node’s close until its other end hangs up', async () => {
    const { server, port } = await served();
    await connected(port);
    expect(await closedWithin(server, 500)).toBe(false);
  });

  it('a connection that has carried no request is ended as the server closes, and holds nothing', async () => {
    const { server, port } = await served();
    const connections = new ConnectionsAtClose(server);
    const socket = await connected(port);
    await expect.poll(() => connections.held).toEqual({ unused: 1, underWay: 0 });
    const hungUp = once(socket, 'close');
    connections.close();
    expect(await closedWithin(server, 1_000)).toBe(true);
    await hungUp;
    expect(connections.held).toEqual({ unused: 0, underWay: 0 });
  });

  it('a request under way is answered whole, and its connection then closes rather than idle out the keep-alive', async () => {
    const { server, port, asked } = await served();
    const connections = new ConnectionsAtClose(server);
    const socket = await connected(port);
    let heard = '';
    socket.on('data', (chunk: Buffer) => {
      heard += chunk.toString();
    });
    socket.write('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n');
    const response = await asked;
    expect(connections.held).toEqual({ unused: 0, underWay: 1 });
    connections.close();
    const closing = closedWithin(server, 1_000);
    const hungUp = once(socket, 'close');
    response.end('ok');
    expect(await closing).toBe(true);
    await hungUp;
    expect(heard).toMatch(/^HTTP\/1\.1 200 OK\r\n/);
    expect(heard).toMatch(/\r\nConnection: close\r\n/i);
    expect(heard).toMatch(/ok$/);
  });

  it('a request whose answer had begun is answered whole, and its connection ended after it', async () => {
    const { server, port, asked } = await served();
    const connections = new ConnectionsAtClose(server);
    const socket = await connected(port);
    let heard = '';
    socket.on('data', (chunk: Buffer) => {
      heard += chunk.toString();
    });
    socket.write('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n');
    const response = await asked;
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.write('o');
    connections.close();
    const closing = closedWithin(server, 1_000);
    const hungUp = once(socket, 'close');
    response.end('k');
    expect(await closing).toBe(true);
    await hungUp;
    expect(heard).toMatch(/^HTTP\/1\.1 200 OK\r\n/);
    expect(heard).toMatch(/\r\n\r\n.*o.*k/s);
  });
});
