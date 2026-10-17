// The worker's health answer (BACKLOG 2.3.2, 2.7.2 part 4; ADR-385 (5), 418 (6), 419, 507):
// `GET /health` says whether the worker is doing its work and how its queue stands: how many jobs
// wait, how many are set aside, how long the oldest has waited. Status 200 when it is well, 503
// when it isn't, with the problem named (job-loop.ts). No version, no setting, no id. It is asked
// from inside the stack only (the container's own check, the installer's): the worker publishes
// no port and no proxy leads to it.
import { createServer, type Server } from 'node:http';

import type { WorkerStanding } from './job-loop.ts';

export class Health {
  private readonly server: Server;

  constructor(standing: () => WorkerStanding) {
    this.server = createServer((request, answer) => {
      const found = request.method === 'GET' && request.url === '/health';
      const now = found ? standing() : undefined;
      const body = now ?? { code: 'NOT_FOUND' };
      answer.writeHead(now === undefined ? 404 : now.status === 'ok' ? 200 : 503, {
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
