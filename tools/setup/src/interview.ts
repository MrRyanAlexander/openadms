// The installer's questions, on Node's own readline (ADR-265). Answers come from a terminal or, for
// scripted runs, one per line on standard input. A secret's typing is never echoed.
import { createInterface, type Interface } from 'node:readline';
import { Writable } from 'node:stream';

export class Interview {
  private muted = false;
  private readonly terminal: boolean;
  private readonly readline: Interface;
  private readonly lines: AsyncIterator<string>;

  constructor() {
    this.terminal = process.stdin.isTTY;
    const echo = new Writable({
      write: (chunk: Buffer, _encoding, done) => {
        if (!this.muted) process.stdout.write(chunk);
        done();
      },
    });
    this.readline = createInterface({
      input: process.stdin,
      output: echo,
      terminal: this.terminal,
    });
    this.lines = this.readline[Symbol.asyncIterator]();
  }

  async ask(question: string, fallback?: string): Promise<string> {
    process.stdout.write(fallback === undefined ? `${question}: ` : `${question} [${fallback}]: `);
    const answer = (await this.next()).trim();
    if (!this.terminal) process.stdout.write('\n');
    return answer === '' && fallback !== undefined ? fallback : answer;
  }

  async askSecret(question: string): Promise<string> {
    process.stdout.write(`${question} (not shown): `);
    this.muted = true;
    try {
      return await this.next();
    } finally {
      this.muted = false;
      process.stdout.write('\n');
    }
  }

  async confirm(question: string): Promise<boolean> {
    for (;;) {
      const answer = (await this.ask(`${question} (y/n)`, 'y')).toLowerCase();
      if (answer === 'y' || answer === 'yes') return true;
      if (answer === 'n' || answer === 'no') return false;
      console.log('Please answer y or n.');
    }
  }

  close(): void {
    this.readline.close();
  }

  private async next(): Promise<string> {
    const line = await this.lines.next();
    if (line.done === true)
      throw new Error('The questions ran out of answers; nothing more was done.');
    return line.value;
  }
}
