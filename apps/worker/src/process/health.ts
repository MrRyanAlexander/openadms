// The worker's health answer (BACKLOG 2.3.2; ADR-385 (5), 418 (6), 419): `GET /health` says that
// the process answers and how its queue stands: how many jobs wait and how many are set aside.
// No version, no setting, no id. It is asked from inside the stack only (the container's own
// check, the installer's): the worker publishes no port and no proxy leads to it.
import { createServer, type Server } from 'node:http';

import type { QueueStanding } from './job-loop.ts';

export class Health {
  private readonly server: Server;

  constructor(standing: () => QueueStanding) {
    this.server = createServer((request, answer) => {
      const found = request.method === 'GET' && request.url === '/health';
      const body = found ? { status: 'ok', ...standing() } : { code: 'NOT_FOUND' };
      answer.writeHead(found ? 200 : 404, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      answer.end(JSON.stringify(body));
    });
    // Nothing is read of a request but its first line; one that dawdles is let go.
    this.server.requestTimeout = 5_000;
    this.server.headersTimeout = 5_000;
  }

  listen(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, host, () => {
        resolve();
      });
    });
  }

  // The port it listens on (a test asks for any free one).
  get port(): number {
    const address = this.server.address();
    return typeof address === 'object' && address !== null ? address.port : 0;
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }
}
