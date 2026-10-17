// A test's own HTTPS server on this machine, with the local stack's certificate for it
// (infra/local/src/certificates.ts, `host`; ADR-517): a client of the API's, told the stack's root
// as it is in the stack, checks it as it checks every server it asks. It answers as the test says
// and keeps what it was asked. It needs `pnpm local:up`, which makes the certificate.
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const generated = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'infra',
  'local',
  '.generated',
);

// The stack's root, which the server's certificate is checked against.
export const stackRootCert = join(generated, 'caddy-root.crt');
// The stack's certificate for this machine, and its key: read by the server alone.
export const hostCertFile = join(generated, 'tls', 'host.crt');
export const hostKeyFile = join(generated, 'tls', 'host.key');

export interface Heard {
  readonly method: string;
  readonly path: string;
}

export class StackHttpsServer {
  readonly heard: Heard[];
  private readonly server: Server;

  private constructor(server: Server, heard: Heard[]) {
    this.server = server;
    this.heard = heard;
  }

  // Listens on 127.0.0.1 at a port of its own; `answer` says what each request is answered.
  static async on(
    answer: (request: IncomingMessage, response: ServerResponse) => void,
  ): Promise<StackHttpsServer> {
    const heard: Heard[] = [];
    const server = createServer(
      { cert: readFileSync(hostCertFile), key: readFileSync(hostKeyFile) },
      (request, response) => {
        heard.push({ method: request.method ?? '', path: request.url ?? '' });
        answer(request, response);
      },
    );
    const made = new StackHttpsServer(server, heard);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return made;
  }

  get port(): number {
    return (this.server.address() as AddressInfo).port;
  }

  close(): Promise<void> {
    this.server.closeAllConnections();
    return new Promise((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }
}
