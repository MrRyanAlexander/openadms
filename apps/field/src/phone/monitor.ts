// The monitor signed in on the phone (ARCHITECTURE §7.1, §7.2; BACKLOG 3.2.3, C114, C115;
// ADR-441…444, 574): they sign in online on an enrolled phone with their Monitor ID and password,
// and the phone takes their assignment for the day from the answer, or is told why there is none
// (AC-02-35, 36). Their session's token is held in the keyring beside the phone's own and goes
// beside it on every request of theirs (AC-11-14); answered `NOT_SIGNED_IN` (signed out elsewhere,
// run out, ended by the server), the phone drops it and asks them to sign in again, keeping all it
// holds. The password is sent once and kept nowhere.
//
// **Signed in with no connection** (ARCHITECTURE §7.2; BACKLOG 3.2.4, C120, C141; ADR-531, 575):
// the password checked against the monitor's login-list entry (signing-in.ts), the phone keeps
// the sign-in and its proof in the keyring (`offlineSignIn`) in place of a session, and takes the
// assignment whose lists it holds. **Before anything else of theirs is asked, it reports that
// sign-in** (`POST /phones/current/offline-sign-ins`, AC-11-21) and holds the session the server
// gives for it, dropping the proof; refused, it drops the sign-in and the monitor signs in online,
// nothing the phone holds lost. Signing out, or the lock after inactivity, drops either.
//
// **What the phone reports besides its records goes next** (BACKLOG 3.3.1, C122; ADR-576): an
// unplanned assignment set up on it and the uses of the master passcode it logged, sent with the
// monitor's session ahead of the request asked for (reports.ts), so the lists the server answers
// take an assignment set up with no connection (AC-11-25).
import {
  monitorSignedInAnswerSchema,
  offlineSignInReportSchema,
  signInOnPhoneEndpoint,
  signOutOnPhoneEndpoint,
  takeOfflineSignInOnPhoneEndpoint,
  type Endpoint,
  type MonitorSignedInAnswer,
  type OfflineSignInReport,
  type PhoneAssignmentAnswer,
} from '@open-adms/contracts';
import { OfflineSignInRules, uuidv7, type NoAssignmentReason } from '@open-adms/domain';

import type { Asking, NotAnswered, Reply } from '../server.ts';
import type { Keyring } from '../store/keyring.ts';
import type { PhoneIdentity } from './identity.ts';
import type { LoginListEntry } from './login-list.ts';
import { signInProof } from './offline-check.ts';
import type { PhoneReports } from './reports.ts';

// Who is signed in, until when by the phone's clock, and the assignment the phone takes for them
// now, or why it takes none; and whether they signed in with no connection and the server hasn't
// yet taken it. Never the token or the proof.
export interface SignedIn {
  readonly userId: string;
  readonly monitorNumber: string;
  readonly name: string;
  readonly until: Date;
  readonly assignment: PhoneAssignmentAnswer | null;
  readonly noAssignment: NoAssignmentReason | null;
  readonly offline: boolean;
}

// The session as the keyring holds it: what the sign-in answered, and until when.
interface HeldSession {
  readonly answer: MonitorSignedInAnswer;
  readonly until: string;
}

function heldSession(kept: string | undefined): HeldSession | undefined {
  if (kept === undefined) return undefined;
  try {
    const { answer, until } = JSON.parse(kept) as { answer?: unknown; until?: unknown };
    const read = monitorSignedInAnswerSchema.safeParse(answer);
    return read.success && typeof until === 'string' && !Number.isNaN(Date.parse(until))
      ? { answer: read.data, until }
      : undefined;
  } catch {
    return undefined;
  }
}

// A sign-in made with no connection, as the keyring holds it until the server takes it: the
// report that proves it, who it is, the assignment the phone took, and until when.
interface HeldOffline {
  readonly report: OfflineSignInReport;
  readonly monitorNumber: string;
  readonly name: string;
  readonly assignment: PhoneAssignmentAnswer | null;
  readonly until: string;
}

const answerShape = monitorSignedInAnswerSchema.shape;

function heldOffline(kept: string | undefined): HeldOffline | undefined {
  if (kept === undefined) return undefined;
  try {
    const { report, monitorNumber, name, assignment, until } = JSON.parse(kept) as Partial<
      Readonly<Record<keyof HeldOffline, unknown>>
    >;
    const read = {
      report: offlineSignInReportSchema.safeParse(report),
      monitorNumber: answerShape.monitorNumber.safeParse(monitorNumber),
      name: answerShape.name.safeParse(name),
      assignment: answerShape.assignment.safeParse(assignment),
    };
    return read.report.success &&
      read.monitorNumber.success &&
      read.name.success &&
      read.assignment.success &&
      typeof until === 'string' &&
      !Number.isNaN(Date.parse(until))
      ? {
          report: read.report.data,
          monitorNumber: read.monitorNumber.data,
          name: read.name.data,
          assignment: read.assignment.data,
          until,
        }
      : undefined;
  } catch {
    return undefined;
  }
}

const offlineSignIns = new OfflineSignInRules();

export class MonitorOnPhone {
  private readonly identity: PhoneIdentity;
  private readonly keyring: Keyring;
  private readonly reports: PhoneReports;
  private readonly now: () => Date;
  // A report under way: the monitor's requests at once wait on its one report, never each sending
  // the sign-in again (the server takes it once).
  private reporting: Promise<HeldSession | NotAnswered> | undefined;

  constructor(
    identity: PhoneIdentity,
    keyring: Keyring,
    reports: PhoneReports,
    now = () => new Date(),
  ) {
    this.identity = identity;
    this.keyring = keyring;
    this.reports = reports;
    this.now = now;
  }

  // Whether what the sign-in form says is what the server reads, by the endpoint's own schema.
  static signInReadable(monitorNumber: string, password: string): boolean {
    return signInOnPhoneEndpoint.body.safeParse({ monitorNumber, password }).success;
  }

  // Signed in online (AC-02-35, 36): the phone proves itself, then sends the Monitor ID and the
  // password; the session the server answered is kept in the keyring, replacing any held. A
  // sign-in the server didn't take keeps nothing and leaves whoever was signed in as they were.
  async signIn(
    monitorNumber: string,
    password: string,
  ): Promise<Reply<typeof signInOnPhoneEndpoint>> {
    const asked = this.now();
    const reply = await this.identity.asPhone(signInOnPhoneEndpoint, {
      json: { monitorNumber, password },
    });
    if (reply.kind === 'answered') {
      const until = new Date(asked.getTime() + reply.answer.expiresInSeconds * 1000);
      await this.keyring.keep('offlineSignIn', undefined);
      await this.kept({ answer: reply.answer, until: until.toISOString() });
    }
    return reply;
  }

  // Signed in with no connection (AC-11-19, 21): the password already opened the monitor's entry,
  // its first slow hash handed in. The phone makes the report of the sign-in and its proof, keeps
  // them in the keyring in place of any session, and drops the hash with this call. The sign-in
  // lasts `seconds` by the phone's clock until the server takes it, and takes the assignment
  // whose lists the phone holds.
  async signInOffline(
    entry: LoginListEntry,
    firstHash: Uint8Array,
    assignment: PhoneAssignmentAnswer | null,
    seconds: number,
  ): Promise<SignedIn | undefined> {
    const enrolment = await this.identity.enrolment();
    if (enrolment === undefined) return undefined;
    const signedInAt = this.now();
    const said = {
      deviceId: enrolment.deviceId,
      id: uuidv7(signedInAt),
      kind: 'OWN_PASSWORD',
      personId: entry.monitorId,
      signedInAt,
      masterPasscodeVersion: null,
    } as const;
    const report: OfflineSignInReport = {
      id: said.id,
      kind: said.kind,
      personId: said.personId,
      signedInAt: signedInAt.toISOString(),
      // ADR-100: how far the phone's clock stands from UTC, in minutes.
      deviceUtcOffsetMinutes: 0 - signedInAt.getTimezoneOffset(),
      masterPasscodeVersion: null,
      proof: signInProof(firstHash, offlineSignIns.signed(said)),
    };
    const held: HeldOffline = {
      report,
      monitorNumber: entry.monitorNumber,
      name: entry.name,
      assignment,
      until: new Date(signedInAt.getTime() + seconds * 1000).toISOString(),
    };
    await this.keyring.keep('monitorSession', undefined);
    await this.keyring.keep('offlineSignIn', JSON.stringify(held));
    return this.signedIn();
  }

  // Who is signed in now by the phone's clock, or nobody. A session run out is dropped.
  async signedIn(): Promise<SignedIn | undefined> {
    const held = await this.held();
    if (held !== undefined) {
      const { userId, monitorNumber, name, assignment, noAssignment } = held.answer;
      const until = new Date(held.until);
      return { userId, monitorNumber, name, until, assignment, noAssignment, offline: false };
    }
    const offline = await this.offline();
    if (offline === undefined) return undefined;
    const { report, monitorNumber, name, assignment } = offline;
    return {
      userId: report.personId,
      monitorNumber,
      name,
      until: new Date(offline.until),
      assignment,
      noAssignment: null,
      offline: true,
    };
  }

  // A request of the monitor's (AC-11-14): the phone's proof and their session side by side.
  // With nobody signed in nothing is sent; answered `NOT_SIGNED_IN`, the session is dropped and
  // the answer is the caller's to show. A sign-in made offline is reported first (AC-11-21):
  // refused, it is dropped and the answer is `SIGN_IN_REFUSED`; not answered, it stays as it is.
  // Then the phone's held reports (AC-11-25): with no signal for them, nothing more is asked; a
  // report the server refused is the sync's to carry, and the request goes on.
  async ask<E extends Endpoint>(
    served: E,
    asking: Omit<Asking, 'token' | 'session'> = {},
  ): Promise<Reply<E>> {
    let held = await this.held();
    if (held === undefined) {
      const offline = await this.offline();
      if (offline === undefined) return { kind: 'refused', code: 'NOT_SIGNED_IN' };
      this.reporting ??= this.reported(offline).finally(() => {
        this.reporting = undefined;
      });
      const taken = await this.reporting;
      if (!('answer' in taken)) return taken;
      held = taken;
    }
    const session = held.answer.token;
    const unsent = await this.reports.sent((sent, more = {}) =>
      this.identity.asPhone(sent, { ...more, session }),
    );
    const notSignedIn = unsent?.kind === 'refused' && unsent.code === 'NOT_SIGNED_IN';
    const reply =
      unsent?.kind === 'unreachable' || notSignedIn
        ? unsent
        : await this.identity.asPhone(served, { ...asking, session });
    if (reply.kind === 'refused' && reply.code === 'NOT_SIGNED_IN') {
      await this.keyring.keep('monitorSession', undefined);
    }
    return reply;
  }

  // The assignment the phone takes now, as a later answer said (its lists read, ADR-450) or as
  // the phone was set up for this monitor under the master passcode (ADR-576): the session keeps
  // it in place of the one the sign-in answered. (A sign-in made offline always holds the lists'
  // assignment, so it is never set up from "No assignment today".)
  async took(
    assignment: PhoneAssignmentAnswer | null,
    noAssignment: NoAssignmentReason | null,
  ): Promise<void> {
    const held = await this.held();
    if (held === undefined) return;
    await this.kept({ ...held, answer: { ...held.answer, assignment, noAssignment } });
  }

  // Signed out, by the monitor or the lock after inactivity (AC-11-64): the server told where it
  // can be, and the session and any sign-in made offline, with its proof, dropped whatever it
  // answered. With no signal the server's session runs out by its own hours; a sign-in made
  // offline and never reported is never sent.
  async signOut(): Promise<void> {
    const held = await this.held();
    if (held !== undefined) {
      await this.identity.asPhone(signOutOnPhoneEndpoint, { session: held.answer.token });
    }
    await this.keyring.keep('monitorSession', undefined);
    await this.keyring.keep('offlineSignIn', undefined);
  }

  // The sign-in made offline reported: taken, the session the server gave is held from now, in
  // place of the sign-in and its proof.
  private async reported(offline: HeldOffline): Promise<HeldSession | NotAnswered> {
    const asked = this.now();
    const reply = await this.identity.asPhone(takeOfflineSignInOnPhoneEndpoint, {
      json: offline.report,
    });
    if (reply.kind !== 'answered') {
      if (reply.kind === 'refused' && reply.code === 'SIGN_IN_REFUSED') {
        await this.keyring.keep('offlineSignIn', undefined);
      }
      return reply;
    }
    const { token, userId, monitorNumber, name, expiresInSeconds } = reply.answer;
    const session: HeldSession = {
      answer: {
        token,
        userId,
        monitorNumber,
        name,
        expiresInSeconds,
        assignment: offline.assignment,
        noAssignment: null,
      },
      until: new Date(asked.getTime() + expiresInSeconds * 1000).toISOString(),
    };
    await this.kept(session);
    await this.keyring.keep('offlineSignIn', undefined);
    return session;
  }

  private async held(): Promise<HeldSession | undefined> {
    const held = heldSession(await this.keyring.secret('monitorSession'));
    if (held !== undefined && Date.parse(held.until) > this.now().getTime()) return held;
    if (held !== undefined) await this.keyring.keep('monitorSession', undefined);
    return undefined;
  }

  private async offline(): Promise<HeldOffline | undefined> {
    const held = heldOffline(await this.keyring.secret('offlineSignIn'));
    if (held !== undefined && Date.parse(held.until) > this.now().getTime()) return held;
    if (held !== undefined) await this.keyring.keep('offlineSignIn', undefined);
    return undefined;
  }

  private kept(session: HeldSession): Promise<void> {
    return this.keyring.keep('monitorSession', JSON.stringify(session));
  }
}
