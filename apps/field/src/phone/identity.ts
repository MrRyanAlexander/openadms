// Which phone this is, to the server (ARCHITECTURE §7.1, §7.4; BACKLOG 3.2.2, C110, C111, C113;
// ADR-436…440, 572): enrolled once, online, under the firm's master passcode, with a device key it
// made itself (AC-02-18, AC-11-11); then, before what it asks, proven by signing the server's
// challenge with that key, the token it is given held in its keyring and never in the web layer's
// storage (AC-11-12). The enrolment the server answered is the first thing the phone keeps in its
// store. Nothing here asks any service but the firm's API (AC-11-13).
import {
  challengePhoneEndpoint,
  enrolPhoneEndpoint,
  phoneEnrolledAnswerSchema,
  provePhoneEndpoint,
  type Endpoint,
} from '@open-adms/contracts';
import { PhoneProofRules } from '@open-adms/domain';

import type { Asking, NotAnswered, Reply, Server } from '../server.ts';
import type { Keyring } from '../store/keyring.ts';
import type { PhoneStore } from '../store/phone-store.ts';

// The phone as the server enrolled it: its id from then on, what the dispatch board calls it,
// and the version of the master passcode it was enrolled under.
export interface Enrolment {
  readonly deviceId: string;
  readonly name: string;
  readonly masterPasscodeVersion: number;
}

// Where the store keeps it: an answer of the server's the phone holds (phone-store.ts).
const enrolmentShelf = 'keptAnswers';
const enrolmentId = 'enrolment';

// The token as the keyring holds it, and until when by the phone's clock.
interface HeldToken {
  readonly token: string;
  readonly until: string;
}

function heldToken(kept: string | undefined): HeldToken | undefined {
  if (kept === undefined) return undefined;
  try {
    const read = JSON.parse(kept) as Partial<HeldToken>;
    return typeof read.token === 'string' && typeof read.until === 'string'
      ? { token: read.token, until: read.until }
      : undefined;
  } catch {
    return undefined;
  }
}

export class PhoneIdentity {
  private readonly store: PhoneStore;
  private readonly keyring: Keyring;
  private readonly server: Server;
  private readonly now: () => Date;
  // A proof under way: the phone's requests at once wait on its one proof, never each spending a
  // challenge of its own.
  private proving: Promise<{ readonly token: string } | NotAnswered> | undefined;

  constructor(store: PhoneStore, keyring: Keyring, server: Server, now = () => new Date()) {
    this.store = store;
    this.keyring = keyring;
    this.server = server;
    this.now = now;
  }

  // Whether the enrolment form says what the server reads: the board's name and a passcode, as
  // the endpoint's own schema takes them.
  static enrolmentReadable(name: string, passcode: string): boolean {
    const { shape } = enrolPhoneEndpoint.body;
    return shape.name.safeParse(name).success && shape.passcode.safeParse(passcode).success;
  }

  // The enrolment the phone keeps, or none before it is enrolled.
  async enrolment(): Promise<Enrolment | undefined> {
    const kept = await this.store.read(enrolmentShelf, enrolmentId);
    if (typeof kept !== 'object' || kept === null || kept instanceof Uint8Array) return undefined;
    if (Array.isArray(kept)) return undefined;
    const { name, ...answer } = kept as Readonly<Record<string, unknown>>;
    const read = phoneEnrolledAnswerSchema.safeParse(answer);
    if (!read.success || !enrolPhoneEndpoint.body.shape.name.safeParse(name).success) {
      return undefined;
    }
    return { ...read.data, name: name as string };
  }

  // Enrolled under the master passcode (AC-02-18): a device key made anew, its public half sent
  // with the board's name and the passcode, and what the server answered kept. A try the server
  // didn't take leaves nothing kept, and the next try makes its own key. The passcode is sent
  // once and kept nowhere.
  async enrol(name: string, passcode: string): Promise<Reply<typeof enrolPhoneEndpoint>> {
    const key = await this.keyring.madeDeviceKey();
    await this.keyring.keep('phoneToken', undefined);
    const reply = await this.server.ask(enrolPhoneEndpoint, {
      json: { name, passcode, publicKey: key.publicKey },
    });
    if (reply.kind === 'answered') {
      // The name as the server keeps it, read by the endpoint's own schema.
      const kept = enrolPhoneEndpoint.body.shape.name.safeParse(name).data ?? name;
      const enrolment: Enrolment = { ...reply.answer, name: kept };
      await this.store.change([
        { shelf: enrolmentShelf, id: enrolmentId, value: { ...enrolment } },
      ]);
    }
    return reply;
  }

  // A request of the phone's, proven (AC-11-12): its token first, proving itself where it holds
  // none still good; answered `PHONE_NOT_PROVEN` (a token run out, or one the server no longer
  // takes), the token is dropped and the phone proves itself again and asks once more, asking
  // nobody anything. A proof refused is the answer.
  async asPhone<E extends Endpoint>(
    served: E,
    asking: Omit<Asking, 'token'> = {},
  ): Promise<Reply<E>> {
    for (let again = false; ; again = true) {
      const held = await this.token();
      if (!('token' in held)) return held;
      const reply = await this.server.ask(served, { ...asking, token: held.token });
      if (reply.kind !== 'refused' || reply.code !== 'PHONE_NOT_PROVEN' || again) return reply;
      await this.keyring.keep('phoneToken', undefined);
    }
  }

  private async token(): Promise<{ readonly token: string } | NotAnswered> {
    const held = heldToken(await this.keyring.secret('phoneToken'));
    if (held !== undefined && Date.parse(held.until) > this.now().getTime()) {
      return { token: held.token };
    }
    this.proving ??= this.proved().finally(() => {
      this.proving = undefined;
    });
    return this.proving;
  }

  // The phone proves itself (ARCHITECTURE §7.4): it asks a challenge by its id, signs the domain's
  // text for it with its device key, and sends both; the token it is given is held in the
  // keyring until it runs out by the phone's clock.
  private async proved(): Promise<{ readonly token: string } | NotAnswered> {
    const enrolment = await this.enrolment();
    const key = await this.keyring.deviceKey();
    // A phone holding no enrolment, or no key, has nothing to prove itself with.
    if (enrolment === undefined || key === undefined) {
      return { kind: 'refused', code: 'PHONE_NOT_PROVEN' };
    }
    const ids = { deviceId: enrolment.deviceId };
    const challenged = await this.server.ask(challengePhoneEndpoint, { ids });
    if (challenged.kind !== 'answered') return challenged;
    const { challenge } = challenged.answer;
    const signature = await key.signed(PhoneProofRules.signed(challenge));
    const asked = this.now();
    const proven = await this.server.ask(provePhoneEndpoint, {
      ids,
      json: { challenge, signature },
    });
    if (proven.kind !== 'answered') return proven;
    const { token, expiresInSeconds } = proven.answer;
    const until = new Date(asked.getTime() + expiresInSeconds * 1000).toISOString();
    await this.keyring.keep('phoneToken', JSON.stringify({ token, until }));
    return { token };
  }
}
