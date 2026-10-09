// `pnpm installer:admin`, as a conversation (server-admin.ts; ARCHITECTURE §6; AC-02-13; ADR-413
// (2), 414 (2), 415): it asks whose login is meant and does one of two things. Where the firm has
// no admin yet it makes the first. Where the address is an admin's it sets their password anew
// and, if asked, clears their authenticator. Anything else it refuses and changes nothing.
//
// A password is typed twice, never shown, never an argument (a shell keeps its history) and
// never printed. What is said names the person and what was done, and no secret.
import type { ServerAdmin } from './server-admin.ts';

// Whoever is at the server's terminal; a scripted run answers one line a question.
export interface Questions {
  ask(question: string): Promise<string>;
  askSecret(question: string): Promise<string>;
  // Yes only when said: an empty answer is no.
  confirm(question: string): Promise<boolean>;
}

export class AdminCommand {
  private readonly admin: ServerAdmin;
  private readonly questions: Questions;
  private readonly say: (line: string) => void;

  constructor(admin: ServerAdmin, questions: Questions, say: (line: string) => void) {
    this.admin = admin;
    this.questions = questions;
    this.say = say;
  }

  // The process's exit code: 0 when it was done, 1 when it was refused.
  async run(): Promise<number> {
    const email = (await this.questions.ask('The admin’s email address')).trim();
    if (email === '') return this.refused('No address was given.');
    const standing = await this.admin.standing(email);
    if (standing.kind === 'NOT_AN_ADMIN') {
      return this.refused(
        'This firm has an admin, and that address is not an admin’s. An admin creates people in the back office.',
      );
    }
    if (standing.kind === 'NO_ADMIN_YET') {
      this.say('This installation has no admin yet: this makes the first one.');
      const name = (await this.questions.ask('Their name')).trim();
      if (name === '') return this.refused('No name was given.');
      const password = await this.password();
      if (password === undefined) return this.refused('The two didn’t match.');
      const outcome = await this.admin.makeFirst(name, email, password);
      if (!outcome.done) return this.refused(this.why(outcome));
      this.say(
        `${outcome.name} is the firm’s first admin. They sign in with that address and password, and set their authenticator up at their first sign-in.`,
      );
      return 0;
    }
    this.say(
      `${standing.name} is an admin. Their password is set anew, a lock on their login opens, and they are signed out everywhere.`,
    );
    const clear =
      standing.hasAuthenticator &&
      (await this.questions.confirm(
        'Clear their authenticator too? Only where the phone that held it is lost: they set one up again at their next sign-in',
      ));
    const password = await this.password();
    if (password === undefined) return this.refused('The two didn’t match.');
    const outcome = await this.admin.letBackIn(email, password, clear);
    if (!outcome.done) return this.refused(this.why(outcome));
    this.say(
      `${outcome.name}’s password is set${clear ? ' and their authenticator cleared' : ''}. ${String(outcome.sessionsEnded)} open session(s) ended. It is in the audit log, under their name, as done on the server.`,
    );
    return 0;
  }

  private async password(): Promise<string | undefined> {
    const first = await this.questions.askSecret('The new password');
    const again = await this.questions.askSecret('The same again');
    return first === again ? first : undefined;
  }

  private why(outcome: { readonly code: string; readonly message?: string }): string {
    if (outcome.message !== undefined) return outcome.message;
    if (outcome.code === 'ADMIN_EXISTS') return 'The firm has an admin already.';
    if (outcome.code === 'EMAIL_HELD') return 'Somebody already signs in with that address.';
    return 'That address is not an admin’s.';
  }

  private refused(why: string): number {
    this.say(`Refused: ${why} Nothing was changed.`);
    return 1;
  }
}
