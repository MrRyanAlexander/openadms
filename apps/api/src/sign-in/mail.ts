// The firm's mail, where it has any (ARCHITECTURE §6; ADR-170, 405): email is optional. With no
// mail server (SMTP_URL left empty by the installer) nothing is sent and nothing needs it: an
// admin sets a password instead. A message goes only to an address the database holds for a
// person, never to one a caller typed.
import { isIP } from 'node:net';

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
    // sent, except to a mail catcher on this machine or in the local stack, which speaks none.
    const implicit = url.protocol === 'smtps:';
    const local = stackHost !== undefined || SmtpMail.isThisMachine(url.hostname);
    this.from = settings.mailFrom;
    this.transport = createTransport({
      host,
      port: Number(stackPort ?? (url.port === '' ? (implicit ? '465' : '587') : url.port)),
      secure: implicit,
      requireTLS: !implicit && !local,
      ignoreTLS: !implicit && local,
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

  private static isThisMachine(host: string): boolean {
    const bare = host.replace(/^\[|\]$/g, '');
    return bare === 'localhost' || bare === '::1' || (isIP(bare) === 4 && bare.startsWith('127.'));
  }
}

export function mailFor(settings: MailSettings): Mail {
  return settings.smtpUrl === '' ? new NoMail() : new SmtpMail(settings);
}
