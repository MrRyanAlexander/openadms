// The firm's mail, where it has any (ARCHITECTURE §6; ADR-170, 405): email is optional. With no
// mail server (SMTP_URL left empty by the installer) nothing is sent and nothing needs it: an
// admin sets a password instead. A message goes only to an address the database holds for a
// person, never to one a caller typed. Mail goes over TLS alone, to every server, the local
// stack's catcher among them (KD-78; ADR-517): the server's certificate is checked, against the
// root the settings name where they name one. Of a server's answer only whether the message went
// is taken: no reply's words are kept, logged or shown (API10:2023; spec/CHECKLIST-API.md §5.9).
import { readFileSync } from 'node:fs';

import { createTransport, type Transporter } from 'nodemailer';

export interface Message {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface Mail {
  // Whether the firm has a mail server.
  readonly available: boolean;
  send(message: Message): Promise<void>;
}

export class NoMail implements Mail {
  readonly available = false;

  send(): Promise<void> {
    return Promise.reject(new Error('The firm has no mail server.'));
  }
}

export interface MailSettings {
  // smtp:// or smtps://, with the login in it when the server asks for one. Never logged.
  readonly smtpUrl: string;
  // Where the mail server is when it isn't where the URL says: the local stack's own (Mailpit),
  // reached from the API's container by its service name.
  readonly smtpAddress: string | undefined;
  // The certificate authority the server is checked against, as a PEM file; none for the
  // machine's own trust store.
  readonly smtpCaFile: string | null;
  readonly mailFrom: string;
}

export class SmtpMail implements Mail {
  readonly available = true;
  private readonly from: string;
  private readonly transport: Transporter;

  constructor(settings: MailSettings) {
    const url = new URL(settings.smtpUrl);
    const [stackHost, stackPort] = settings.smtpAddress?.split(':') ?? [];
    const host = stackHost ?? url.hostname;
    // smtps:// is TLS from the first byte. smtp:// must turn to TLS (STARTTLS) before anything is
    // sent: a server that offers none is never sent a word in clear.
    const implicit = url.protocol === 'smtps:';
    this.from = settings.mailFrom;
    this.transport = createTransport({
      host,
      port: Number(stackPort ?? (url.port === '' ? (implicit ? '465' : '587') : url.port)),
      secure: implicit,
      requireTLS: !implicit,
      tls: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
        ...(settings.smtpCaFile === null ? {} : { ca: readFileSync(settings.smtpCaFile) }),
      },
      ...(url.username === ''
        ? {}
        : {
            auth: {
              user: decodeURIComponent(url.username),
              pass: decodeURIComponent(url.password),
            },
          }),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      // Nothing of a message or a login is written to a log.
      logger: false,
    });
  }

  async send(message: Message): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}

export function mailFor(settings: MailSettings): Mail {
  return settings.smtpUrl === '' ? new NoMail() : new SmtpMail(settings);
}
