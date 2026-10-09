// The sixteenth story (BACKLOG 2.2.5; ADR-415): the firm's first admin, and an admin's way back
// in, through the server's own command (ARCHITECTURE §6, Authorization: "the last admin can't be
// removed or locked out"; spec/acceptance/02-people-and-devices.md AC-02-13, 84; ADR-409 (5),
// 412 (9), 413 (2), 414 (2)). A new installation holds nobody who can sign in: the installer
// seeds only the system actor. Dana Reyes, at the firm's server, runs `pnpm installer:admin` and
// is made its first admin. A week on she is its only admin, her login is locked by wrong tries
// and the phone that held her authenticator is lost; the firm has no mail. She runs the command
// again: her password is set anew, the lock opens, the authenticator is cleared, and she is in.
// The command never makes a second admin, and the last admin can't be archived.
//
// It is told here, on a database of its own, because only such a database has no admin: the
// API's tests share the installation's.
import {
  AdminCommand,
  NoMail,
  OneTimeCodes,
  PasswordHasher,
  People,
  ServerAdmin,
  serverReason,
  Sessions,
  SessionTokens,
  shippedBreachedPasswords,
  TwoStepCheck,
  TwoStepSecrets,
  WrongTries,
  type Questions,
} from '@open-adms/api';
import { PasswordRules, SignInTries, TwoStepRules } from '@open-adms/domain';

import type { Story } from '../runner.ts';

const timeZone = 'America/New_York';
const at = (date: string, time: string): string => `2026-10-${date}T${time}:00-04:00`;

const danasEmail = 'dana.reyes@gates.example';
// Made up for this story; neither is on the list of known breached passwords.
const first = 'marsh heron delphine ferry';
const second = 'ferry delphine heron marsh';
// Stands for the installation's signing secret: made up, and only this story's database knows it.
const signingSecret = 'made-up-signing-secret-for-this-story-only';
// What Dana's authenticator app holds (RFC 6238's own test secret).
const authenticator = Buffer.from('12345678901234567890');

// The answers typed at the server's terminal, one a question, and what the command said.
class Typed implements Questions {
  readonly said: string[] = [];
  readonly asked: string[] = [];
  private readonly answers: string[];

  constructor(answers: readonly string[]) {
    this.answers = [...answers];
  }

  ask(question: string): Promise<string> {
    return this.next(question);
  }

  askSecret(question: string): Promise<string> {
    return this.next(question);
  }

  async confirm(question: string): Promise<boolean> {
    return (await this.next(question)) === 'y';
  }

  private next(question: string): Promise<string> {
    this.asked.push(question);
    const answer = this.answers.shift();
    if (answer === undefined) return Promise.reject(new Error('The answers ran out.'));
    return Promise.resolve(answer);
  }
}

export const firstAdmin: Story = {
  name: 'first-admin',
  title:
    'the server’s own command makes the firm’s first admin, and lets its only admin back in when her login is locked and her authenticator lost',
  timeZone,
  start: at('05', '09:00'),

  async run(story) {
    const { api, clock, policy } = story;
    const requestNow = (): undefined => undefined;
    const mail = new NoMail();
    const hasher = new PasswordHasher(signingSecret);
    const rules = new PasswordRules(policy, shippedBreachedPasswords());
    const codes = new OneTimeCodes();
    const check = new TwoStepCheck(
      new TwoStepRules(policy),
      codes,
      new TwoStepSecrets(signingSecret),
    );
    const sessions = new Sessions(api, {
      tokens: new SessionTokens(signingSecret, policy.accessTokenMinutes),
      hasher,
      tries: new WrongTries(api, { rules: new SignInTries(policy), clock, mail, requestNow }),
      twoStep: check,
      clock,
      policy,
      requestNow,
    });
    const admin = new ServerAdmin(api, { rules, hasher, sessions, clock });
    const people = new People(api, { clock, sessions, mail });
    const command = async (answers: readonly string[]) => {
      const typed = new Typed(answers);
      const exit = await new AdminCommand(admin, typed, (line) => typed.said.push(line)).run();
      return { exit, said: typed.said, asked: typed.asked };
    };
    const code = (): string =>
      codes.codeAt(authenticator, Math.floor(clock.now().getTime() / 30_000));
    const signIn = async (password: string, withCode?: string) => {
      const outcome = await sessions.signIn(danasEmail, password, withCode);
      return outcome.signedIn
        ? { in: true, mustSetUpAuthenticator: outcome.caller.twoStepSetupRequired }
        : { in: false, why: outcome.why };
    };
    const admins = () => api.user.count({ where: { role: 'ADMIN' } });
    const credential = (userId: string) =>
      api.userCredential.findUniqueOrThrow({
        where: { userId },
        select: {
          failedSignIns: true,
          lockedUntil: true,
          passwordChangeRequired: true,
          twoStepSecret: true,
        },
      });

    // ------------------------------------------------------------------------------------------
    story.at(
      at('05', '09:00'),
      'the installer has run: the installation holds nobody who can sign in',
    );
    story.check(
      'no person is on record: only the seed’s three actors, the system actor, the master passcode’s and the device key’s',
      await api.user.count(),
      3,
    );
    story.check('the firm has no admin yet', await admin.standing(danasEmail), {
      kind: 'NO_ADMIN_YET',
    });
    story.check('nobody signs in', await signIn(first), { in: false, why: 'NOBODY' });

    // ------------------------------------------------------------------------------------------
    story.at(at('05', '09:10'), 'at the server, Dana Reyes runs pnpm installer:admin');
    const short = await command([danasEmail, 'Dana Reyes', 'heron', 'heron']);
    story.check(
      'a password the rules refuse is told in plain words, and nobody is made',
      [short.exit, short.said.at(-1), await admins()],
      [1, 'Refused: A password needs at least 15 characters. Nothing was changed.', 0],
    );
    const mistyped = await command([danasEmail, 'Dana Reyes', first, second]);
    story.check(
      'two passwords that don’t match make nobody',
      [mistyped.exit, mistyped.said.at(-1), await admins()],
      [1, 'Refused: The two didn’t match. Nothing was changed.', 0],
    );
    const made = await command([danasEmail, 'Dana Reyes', first, first]);
    story.check(
      'the command makes her the firm’s first admin',
      [made.exit, made.said],
      [
        0,
        [
          'This installation has no admin yet: this makes the first one.',
          'Dana Reyes is the firm’s first admin. They sign in with that address and password, and set their authenticator up at their first sign-in.',
        ],
      ],
    );
    story.check('it asked her name and the password twice, and nothing else', made.asked, [
      'The admin’s email address',
      'Their name',
      'The new password',
      'The same again',
    ]);
    story.check('nothing it said holds the password', made.said.join(' ').includes(first), false);
    const dana = await api.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
    story.check(
      'Dana Reyes is an admin, with her address and no Monitor ID',
      [dana.name, dana.email, dana.monitorNumber, dana.archivedAt],
      ['Dana Reyes', danasEmail, null, null],
    );
    story.check(
      'her password is her own: nothing to change first, no authenticator yet',
      await credential(dana.id),
      { failedSignIns: 0, lockedUntil: null, passwordChangeRequired: false, twoStepSecret: null },
    );
    const written = await api.auditRecord.findMany({
      where: { recordId: dana.id, tableName: 'user' },
    });
    story.check(
      'the audit log names her as the actor and says it was done on the server',
      written.map(({ actorId, operation, reason, domain }) => [actorId, operation, reason, domain]),
      [[dana.id, 'INSERT', serverReason, 'SECURITY']],
    );
    story.check(
      'she signs in, to a session that opens nothing but setting her authenticator up',
      await signIn(first),
      { in: true, mustSetUpAuthenticator: true },
    );

    // ------------------------------------------------------------------------------------------
    story.at(at('05', '09:20'), 'the command is run again, for somebody else');
    const another = await command(['priya.shah@gates.example']);
    story.check(
      'it never makes a second admin: an admin creates people in the back office',
      [another.exit, another.said, await admins()],
      [
        1,
        [
          'Refused: This firm has an admin, and that address is not an admin’s. An admin creates people in the back office. Nothing was changed.',
        ],
        1,
      ],
    );
    story.check(
      'the service refuses a first admin where the firm has one',
      await admin.makeFirst('Priya Shah', 'priya.shah@gates.example', second),
      { done: false, code: 'ADMIN_EXISTS' },
    );
    const luis = await people.create(dana.id, {
      name: 'Luis Ortega',
      role: 'MANAGER_ANALYST',
      email: 'luis.ortega@gates.example',
    });
    story.check('Dana creates Luis Ortega, a manager/analyst, as an admin does', luis.done, true);
    const notHis = await command(['luis.ortega@gates.example']);
    story.check(
      'the command is an admin’s way in alone: Luis’s address is refused',
      [notHis.exit, await admin.letBackIn('luis.ortega@gates.example', second, true)],
      [1, { done: false, code: 'NOT_AN_ADMIN' }],
    );

    // ------------------------------------------------------------------------------------------
    story.at(at('05', '09:30'), 'Dana sets her authenticator up; she is the firm’s only admin');
    await api.$write({ actorId: dana.id, source: 'BACK_OFFICE' }, (tx) =>
      tx.userCredential.update({
        where: { userId: dana.id },
        data: { twoStepSecret: check.secrets.seal(dana.id, authenticator) },
      }),
    );
    story.check('her password alone now opens nothing', await signIn(first), {
      in: false,
      why: 'CODE_NEEDED',
    });
    story.check('with her authenticator’s code she is in', await signIn(first, code()), {
      in: true,
      mustSetUpAuthenticator: false,
    });
    story.check(
      'the last admin can’t be archived, by herself',
      await people.archive(dana.id, dana.id),
      { done: false, code: 'LAST_ADMIN' },
    );
    const byTheDatabase = await api
      .$write({ actorId: dana.id, source: 'BACK_OFFICE' }, (tx) =>
        tx.user.update({ where: { id: dana.id }, data: { role: 'MANAGER_ANALYST' } }),
      )
      .then(
        () => 'changed',
        () => 'refused',
      );
    story.check('nor made anything else: the database refuses it', byTheDatabase, 'refused');

    // ------------------------------------------------------------------------------------------
    story.at(
      at('12', '08:00'),
      'a week on: ten wrong tries have locked her login, and the phone that held her authenticator is lost',
    );
    await api.$write({ actorId: dana.id, source: 'BACK_OFFICE' }, (tx) =>
      tx.userCredential.update({
        where: { userId: dana.id },
        data: { failedSignIns: policy.signInTriesBeforeLock },
      }),
    );
    story.check(
      'her right password and code are refused: the login is locked',
      await signIn(first, code()),
      {
        in: false,
        why: 'LOCKED',
      },
    );
    const open = await api.session.count({ where: { userId: dana.id, revokedAt: null } });
    story.check('two sessions of hers are still open', open, 2);

    story.at(at('12', '08:10'), 'at the server, she runs pnpm installer:admin again');
    const weak = await command([danasEmail, 'n', 'heron', 'heron']);
    story.check(
      'a password the rules refuse opens nothing: her login stays locked',
      [weak.exit, weak.said.at(-1), (await credential(dana.id)).failedSignIns],
      [
        1,
        'Refused: A password needs at least 15 characters. Nothing was changed.',
        policy.signInTriesBeforeLock,
      ],
    );
    const kept = await command([danasEmail, 'n', second, second]);
    story.check(
      'asked, she may keep her authenticator: only the password is set',
      [kept.exit, kept.said.at(-1), (await credential(dana.id)).twoStepSecret !== null],
      [
        0,
        'Dana Reyes’s password is set. 2 open session(s) ended. It is in the audit log, under their name, as done on the server.',
        true,
      ],
    );
    const back = await command([`  ${danasEmail.toUpperCase()} `, 'y', second, second]);
    story.check(
      'the command lets her back in',
      [back.exit, back.said],
      [
        0,
        [
          'Dana Reyes is an admin. Their password is set anew, a lock on their login opens, and they are signed out everywhere.',
          'Dana Reyes’s password is set and their authenticator cleared. 0 open session(s) ended. It is in the audit log, under their name, as done on the server.',
        ],
      ],
    );
    story.check(
      'the lock is open, the authenticator gone, and nothing is marked to change',
      await credential(dana.id),
      { failedSignIns: 0, lockedUntil: null, passwordChangeRequired: false, twoStepSecret: null },
    );
    story.check(
      'every session she had is ended',
      await api.session.count({ where: { userId: dana.id, revokedAt: null } }),
      0,
    );
    const events = await api.securityEvent.findMany({
      where: { userId: dana.id, kind: 'TWO_STEP_CLEARED' },
    });
    story.check('clearing the authenticator is a security event about her', events.length, 1);
    const cleared = await api.auditRecord.findMany({
      where: { tableName: 'security_event', recordId: events[0]?.id ?? '' },
    });
    story.check(
      'audited under her name, as done on the server',
      cleared.map(({ actorId, reason }) => [actorId, reason]),
      [[dana.id, serverReason]],
    );
    story.check('the old password is dead', await signIn(first), { in: false, why: 'WRONG' });
    story.check(
      'with the new one she is in, and sets an authenticator up again before anything else',
      await signIn(second),
      { in: true, mustSetUpAuthenticator: true },
    );
    story.check('the firm still has one admin', await admins(), 1);
  },
};
