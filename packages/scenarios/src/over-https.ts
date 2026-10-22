// A story's way to the API (ARCHITECTURE §6, §15; BACKLOG 2.7.1, C31; ADR-491): HTTPS to the local
// stack's proxy, as a phone reaches the API, at the name the proxy keeps for the stories' own API
// process (`stories.adms.localhost`, infra/local/Caddyfile). The certificate is checked against
// the stack's own authority alone, never the machine's trust store (OWASP ASVS 5.0 12.3.2), and
// TLS is the proxy's (1.2 and 1.3 only, as `door.test.ts` proves of the API's own name). What a
// request carries is the contracts': a body as JSON, or a file's part as bytes.
import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { Agent, request } from 'node:https';
import process from 'node:process';

import { errorAnswerSchema, type Endpoint } from '@open-adms/contracts';

export const storiesHostname = 'stories.adms.localhost';

const rootCert = new URL('../../../infra/local/.generated/caddy-root.crt', import.meta.url);

export interface Asked {
  readonly status: number;
  // The answer read as JSON; none where it had no body, or answered a file.
  readonly body: unknown;
  // A file's bytes, where the answer is one: always a download (ADR-483, 535 (6)).
  readonly bytes?: Buffer;
  // The cookies it set, each as its `set-cookie` line: a person's session travels only so.
  readonly setCookies: readonly string[];
}

export interface AskedWith {
  // The endpoint's path parameters.
  readonly ids?: Readonly<Record<string, string>>;
  // Its query, as the endpoint takes it.
  readonly query?: Readonly<Record<string, string>>;
  readonly headers?: Readonly<Record<string, string>>;
  // A body sent as JSON, or bytes sent as the given type.
  readonly json?: unknown;
  readonly bytes?: { readonly of: Uint8Array; readonly contentType: string };
}

// An endpoint's path with each parameter given, and its query.
export function pathOf(served: Endpoint, more: AskedWith = {}): string {
  const path = served.path.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const id = more.ids?.[name];
    if (id === undefined) throw new Error(`${served.name} is asked without its ${name}.`);
    return encodeURIComponent(id);
  });
  const query = new URLSearchParams(more.query ?? {}).toString();
  return query === '' ? path : `${path}?${query}`;
}

export class OverHttps {
  private readonly agent: Agent;
  private readonly port: number;

  constructor() {
    if (!existsSync(rootCert)) {
      throw new Error('The local stack is not up: run `pnpm local:up` (after `pnpm installer`).');
    }
    this.port = Number(process.env['ADMS_HTTPS_PORT'] ?? '443');
    // One connection kept open between requests, as a phone keeps one while it syncs.
    this.agent = new Agent({ keepAlive: true, ca: readFileSync(rootCert) });
  }

  ask(served: Endpoint, more: AskedWith = {}): Promise<Asked> {
    const body =
      more.bytes !== undefined
        ? Buffer.from(more.bytes.of)
        : more.json === undefined
          ? undefined
          : Buffer.from(JSON.stringify(more.json), 'utf8');
    const headers: Record<string, string> = {
      host: storiesHostname,
      accept: 'application/json',
      ...(body === undefined
        ? {}
        : {
            'content-type': more.bytes?.contentType ?? 'application/json',
            'content-length': String(body.length),
          }),
      ...more.headers,
    };
    return new Promise((resolve, reject) => {
      const asked = request(
        {
          agent: this.agent,
          host: '127.0.0.1',
          port: this.port,
          servername: storiesHostname,
          method: served.method,
          path: pathOf(served, more),
          headers,
        },
        (answer: IncomingMessage) => {
          const parts: Buffer[] = [];
          answer.on('data', (part: Buffer) => parts.push(part));
          answer.on('error', reject);
          answer.on('end', () => {
            const whole = Buffer.concat(parts);
            if ((answer.headers['content-disposition'] ?? '').startsWith('attachment')) {
              resolve({
                status: answer.statusCode ?? 0,
                body: undefined,
                bytes: whole,
                setCookies: answer.headers['set-cookie'] ?? [],
              });
              return;
            }
            const text = whole.toString('utf8');
            try {
              resolve({
                status: answer.statusCode ?? 0,
                body: text === '' ? undefined : (JSON.parse(text) as unknown),
                setCookies: answer.headers['set-cookie'] ?? [],
              });
            } catch {
              reject(
                new Error(
                  `${served.name} was answered ${String(answer.statusCode)} with no JSON` +
                    (answer.statusCode === 502
                      ? ': the stories’ API isn’t listening, or the stack’s proxy can’t reach it.'
                      : '.'),
                ),
              );
            }
          });
        },
      );
      asked.on('error', (problem) => {
        reject(
          new Error(
            `The local stack does not answer at https://${storiesHostname}: run \`pnpm local:up\` ` +
              `(${problem.message}).`,
          ),
        );
      });
      asked.end(body);
    });
  }

  close(): void {
    this.agent.destroy();
  }
}

// The code an answer was refused with, where it is an error answer.
export function codeOf(answer: Asked): string | undefined {
  return errorAnswerSchema.safeParse(answer.body).data?.code;
}

// How a request was answered, as a story checks a refusal (ADR-496, 497): `saved` for a 200;
// otherwise its status and code, and where an endpoint's rule refused it (422 `NOT_SAVED`), the
// rule's own code and its plain words. The door's refusal of a person without the grant has no
// words (403 `NOT_ALLOWED`).
export function refusalOf(answer: Asked): string {
  if (answer.status === 200) return 'saved';
  const read = errorAnswerSchema.safeParse(answer.body).data;
  if (read === undefined) return `${String(answer.status)} no error answer`;
  const words = read.reason === undefined ? '' : ` · ${read.reason}: ${read.message ?? ''}`;
  return `${String(answer.status)} ${read.code}${words}`;
}

// The body of a 200; anything else stops the story, saying what came back.
export function answered(served: Endpoint, answer: Asked): unknown {
  // A file's answer is its bytes (ADR-483); any other, its JSON.
  if (answer.status === 200) return served.answersFile === true ? answer.bytes : answer.body;
  const code = codeOf(answer) ?? 'no error answer';
  throw new Error(`${served.name} was answered ${String(answer.status)} ${code}.`);
}
