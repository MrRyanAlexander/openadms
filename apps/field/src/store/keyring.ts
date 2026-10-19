// The phone's secure hardware and secure storage (ARCHITECTURE §7.4, §8; BACKLOG 3.2.2, C110,
// C111; ADR-572): the device key the phone makes at enrolment, which signs its proofs and never
// leaves it (AC-02-18, AC-11-11), and the secrets the phone holds, kept apart from its store: the
// token a proof answered (AC-11-12), the session of the monitor signed in on it (AC-11-14;
// task 3.2.3, ADR-574), and a sign-in made offline (AC-11-21; task 3.2.4, ADR-575). This is the
// interface every build's keyring implements: the browser build's, a WebCrypto key in IndexedDB
// and its secrets in memory alone (browser-keyring.ts, for testing, never real work: AC-11-03),
// and the native builds' Secure Enclave or Keystore key and Keychain or Keystore secrets, this
// device only (3.8.1, 3.9.1). Nothing here asks Apple or Google to vouch for the phone (AC-11-13).

// The device key: ECDSA P-256 (the domain's `phoneKeyKind`), made inside the phone, its private
// half never out of it.
export interface DeviceKey {
  // The public half, as the server takes it at enrolment: base64 SubjectPublicKeyInfo (DER).
  readonly publicKey: string;
  // A signature over the text with SHA-256, as the server checks a proof: base64 DER.
  signed(text: string): Promise<string>;
}

// What the phone holds secret beside its store: a proof's token, the session of the monitor
// signed in on it, which goes beside the token on their requests (ADR-443), and a sign-in made
// with no connection with its proof, until the server takes it or the monitor signs out (ADR-531,
// 575).
export type Secret = 'phoneToken' | 'monitorSession' | 'offlineSignIn';

export interface Keyring {
  // The device key the phone holds, or none before enrolment.
  deviceKey(): Promise<DeviceKey | undefined>;
  // A device key made anew, replacing any held: each enrolment makes its own (one key, one phone).
  madeDeviceKey(): Promise<DeviceKey>;
  secret(name: Secret): Promise<string | undefined>;
  // A secret kept, or dropped where none is given.
  keep(name: Secret, value: string | undefined): Promise<void>;
  // The key and every secret gone, before the store's own erase (task 3.4.3's wipe).
  erase(): Promise<void>;
}
