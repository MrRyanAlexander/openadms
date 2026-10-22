// A story's mail (ARCHITECTURE §6; ADR-170, 405): where a world's people must read what the API
// sends them (a reset's code), each message is kept here, in the order sent, for the test to read
// as the person reads their inbox. Nothing leaves the machine; a story with no reader has no mail.
import type { Mail, Message } from '@open-adms/api';

export class StoryMail implements Mail {
  readonly available = true;
  private readonly sent: Message[] = [];

  send(message: Message): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  // Every message sent to the address, oldest first.
  to(address: string): readonly Message[] {
    const whose = address.trim().toLowerCase();
    return this.sent.filter((message) => message.to.trim().toLowerCase() === whose);
  }
}
