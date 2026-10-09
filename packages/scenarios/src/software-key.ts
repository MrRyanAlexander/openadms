// A phone's device key, made in software (ARCHITECTURE §7.4, §15; ADR-437, 440): the harness's
// phone holds one as a real phone holds its own in secure hardware. The private half never
// leaves this object; the public half travels as a phone sends it, and a challenge is signed as
// both phones' own signing does (ECDSA P-256 with SHA-256, DER, in base64). Real secure
// hardware is the field app's (Phase 3).
import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';

import { PhoneProofRules } from '@open-adms/domain';

export class SoftwareKey {
  private readonly privateKey: KeyObject;
  // The public half: base64 SubjectPublicKeyInfo.
  readonly publicKey: string;

  constructor() {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    this.privateKey = pair.privateKey;
    this.publicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  }

  // The phone's answer to a challenge: its signature over what the domain says a phone signs.
  signed(challenge: string): string {
    return createSign('SHA256')
      .update(PhoneProofRules.signed(challenge))
      .sign({ key: this.privateKey, dsaEncoding: 'der' })
      .toString('base64');
  }
}

// A phone the story enrolled: the id the server knows it by, what the dispatch board calls it,
// and the key only it holds.
export interface EnrolledPhone {
  readonly id: string;
  readonly name: string;
  readonly key: SoftwareKey;
}
