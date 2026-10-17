// Tries at one secret, taken one at a time (ARCHITECTURE §6, Abuse; spec/THREAT-MODEL.md T-16;
// AC-10-108; the Phase 2 audit's F2; ADR-541). NIST SP 800-63B-4 §3.2.2; OWASP ASVS 5.0 6.1.1,
// 6.3.1. A try reads the count of wrong tries, checks the guess with a slow hash, then counts a
// wrong one: tries sent at once would all read the same count and all have their guess checked
// before the first wrong one was written, so the bound on guesses would be the burst's size, not
// the policy's. Here every try at one key (a login, the master passcode) waits for the one
// before it to be over, so each reads the count the one before left, and a login that waits or is
// locked refuses the rest of a burst unchecked.
//
// Kept in this process's memory, as the rate limits are: two API processes each take their own
// tries in turn, and a burst split between them is bounded by the policy times the processes
// (the shared store for several API processes is Phase 5a's, C93). Nothing is kept once a key's
// last try is over.
export class InTurn {
  private readonly last = new Map<string, Promise<void>>();

  // The work, once every earlier work under the same key is over, whether it worked or not.
  async run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const before = this.last.get(key);
    let over: () => void = () => undefined;
    const mine = new Promise<void>((resolve) => {
      over = resolve;
    });
    const line = before === undefined ? mine : before.then(() => mine);
    this.last.set(key, line);
    try {
      if (before !== undefined) await before;
      return await work();
    } finally {
      over();
      if (this.last.get(key) === line) this.last.delete(key);
    }
  }

  // How many keys have a try under way or waiting: what a test reads to see nothing is kept.
  get size(): number {
    return this.last.size;
  }
}
