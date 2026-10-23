// The firm's mail, said in the firm's own words for its ADMS (the user, 2026-10-22): every message
// the API writes names the product by its own name, and this puts what the firm calls its ADMS in
// that name's place, and ends the message with the line that says which Open ADMS it is built on
// (the AGPL-3.0 attribution, and where the source is). It wraps the firm's mail, whatever carries
// it, so a message written anywhere is branded alike. A firm that kept the product's name is read
// exactly as the messages are written.
import { builtOn, builtOnLine } from '@open-adms/domain';

import type { Mail, Message } from '../sign-in/mail.ts';
import type { Branding } from './branding.ts';

export class BrandedMail implements Mail {
  private readonly mail: Mail;
  private readonly branding: Pick<Branding, 'current'>;

  constructor(mail: Mail, branding: Pick<Branding, 'current'>) {
    this.mail = mail;
    this.branding = branding;
  }

  get available(): boolean {
    return this.mail.available;
  }

  async send(message: Message): Promise<void> {
    const brand = await this.branding.current();
    const named = (words: string): string => words.replaceAll(builtOn.product, () => brand.name);
    await this.mail.send({
      to: message.to,
      subject: named(message.subject),
      text: `${named(message.text).trimEnd()}\n\n-- \n${builtOnLine(brand.version)} (${builtOn.licence}). Source: ${builtOn.source}\n`,
    });
  }
}
