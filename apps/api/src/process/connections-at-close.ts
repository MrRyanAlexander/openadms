// The connections that would hold the API's server open once it is told to close (ARCHITECTURE
// §6; W0, "the browser runs steady"), ended as it closes. Node's close ends each connection left
// idle after a request at that moment, and lets a request under way finish, but:
//
// - **A connection over HTTPS that has carried no request is never idle to it**: the server waits
//   for its other end to hang up. The proxy dials one and pools it unused (Go's transport keeps a
//   connection whose request went another way; Caddy holds an idle upstream connection two
//   minutes), so a process told to stop stood about that long, as the browser tests' worlds were
//   seen to. Nothing is in flight on one, so it is ended at once; the proxy dials again.
// - **A request under way is answered, then its connection would idle on** until the keep-alive
//   timeout. Its answer says the connection closes, or, already begun, its connection is ended
//   once the answer is sent.
import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { Server as TlsServer } from 'node:tls';

export class ConnectionsAtClose {
  private readonly unused = new Set<Socket>();
  private readonly underWay = new Set<ServerResponse>();
  private closing = false;

  // Watching the server from now on: each connection it takes, and each request it answers.
  constructor(server: HttpServer) {
    const opened = (socket: Socket) => {
      this.unused.add(socket);
      socket.once('close', () => this.unused.delete(socket));
    };
    // Over HTTPS a connection is the server's once its handshake is done.
    server.on(server instanceof TlsServer ? 'secureConnection' : 'connection', opened);
    server.on('request', (request: IncomingMessage, response: ServerResponse) => {
      this.unused.delete(request.socket);
      this.underWay.add(response);
      response.once('close', () => this.underWay.delete(response));
      if (this.closing) this.lastOn(response);
    });
  }

  // How many connections have carried no request, and how many requests are under way.
  get held(): { readonly unused: number; readonly underWay: number } {
    return { unused: this.unused.size, underWay: this.underWay.size };
  }

  // The server is closing: each unused connection ended, each request under way its connection's
  // last.
  close(): void {
    this.closing = true;
    for (const socket of this.unused) socket.destroy();
    this.unused.clear();
    for (const response of this.underWay) this.lastOn(response);
  }

  private lastOn(response: ServerResponse): void {
    if (!response.headersSent) {
      response.setHeader('connection', 'close');
      return;
    }
    // Held now: Node lets go of the connection as the answer finishes.
    const { socket } = response;
    response.once('finish', () => socket?.end());
  }
}
