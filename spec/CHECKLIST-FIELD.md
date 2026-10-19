# Open ADMS — The field app's security checklist

✏️ **Draft**: agent-written (task 3.1.1, ADR-562); the user approves. Building doesn't wait (ADR-230). The profile (§1.3), certificate pinning (§4.1) and the app-switcher cover (§4.2) are put to the user.

← [Index](INDEX.md) · The rows it answers: [acceptance file 11](acceptance/11-field-app.md) · What the attacker goes for: [the threat model](THREAT-MODEL.md) §4.1 · The API's own checklist: [CHECKLIST-API](CHECKLIST-API.md) · The standards: [ARCHITECTURE](ARCHITECTURE.md) §16

> **What this page is.** The checklist ARCHITECTURE §16 names for the field app: OWASP MASVS, control by control, as `spec/CHECKLIST-API.md` does for the API with ASVS. Each control, and each published weakness under it, says one of these things: the **scenarios** of file 11 (or another file) that answer it and the task that proves it; **built**, when something already built and tested answers it (the test and the ADR named); a **departure**, an accepted risk a recorded decision makes; **proposed**, an agent default this page puts to the user (§4); the **phase** that owns it; **not used** here, with the evidence; or **not taken**, a weakness of a profile this app doesn't follow (§1.3). "File 11" is [acceptance file 11](acceptance/11-field-app.md). **Nothing is marked passing that no run has shown:** at this page's writing no line of `apps/field` exists, so every answer is the scenario and the task that will prove it.

> **Wording.** Each control is the published sentence of OWASP MASVS v2.1.0 (the `v2.1.0` tag of `OWASP/masvs`, `controls/`), each weakness the title and requirement of OWASP MASWE v1.0.0 (the `v1.0.0` tag of `OWASP/maswe`, `weaknesses/`), and the profiles the "MAS Testing Profiles" chapter of OWASP MASTG v2.0.0 (`Document/0x03b-Testing-Profiles.md`), all read whole on 2026-10-18. The labels in §3 are the published titles, not the requirements' full text: read the weakness itself before building its answer.

**The counts.** MASVS v2.1.0: **24 controls** in 8 groups. 16 answered by a scenario (written, none passing yet); 2 **proposed**, for the user (MASVS-NETWORK-2, MASVS-CODE-2); 1 owned by Phase 5a (MASVS-PRIVACY-3); 1 a departure by design (MASVS-PRIVACY-4); 4 **not taken** (MASVS-RESILIENCE-1…4, the R profile). MASWE v1.0.0: **78 weaknesses**: 29 of L1 and L2, 21 of L2 alone, 15 of R, 13 of P; under the profile followed (L2 + P), 63, every one answered below; of the 15 of R, 2 taken anyway (§1.3). New scenarios this page needed: AC-11-61…73 (file 11, section K).

---

## 1. What the standard asks, and what is chosen

The user's word on security (ADR-401): say what the standard asks before choosing.

### 1.1 The version

**MASVS v2.1.0** (released 18 January 2024) is the latest release. On 2026-10-18 the project's `master` branch held the same 24 controls word for word; what changed there since is the profiles' wording ("MAS Profiles", reworked with MASWE in 2026). Since v2.0 (April 2023) **a control carries no level**: the controls say what an app must do, the old levels L1, L2 and R moved out of MASVS and became the **MAS Testing Profiles**, kept in MASTG, and each weakness of MASWE names the profiles it belongs to. So a profile is read from MASWE, weakness by weakness, and a control is met when every weakness under it in the chosen profile is answered.

The eight groups: STORAGE, CRYPTO, AUTH, NETWORK, PLATFORM, CODE, RESILIENCE, PRIVACY. ARCHITECTURE §16 named five (storage, crypto, authentication, network, platform); this page answers all eight, so nothing is skipped without its reason.

### 1.2 What the profiles are (MASTG v2.0.0, as published)

| Profile | What it assumes | Recommended for (the text's words) |
|---|---|---|
| **MAS-L1**, essential | the phone's operating system can be trusted; **the person holding the phone is not an adversary**; other apps are | "all mobile apps as a baseline"; apps with low-risk data and no sensitive functionality |
| **MAS-L2**, advanced (L1 and more) | the operating system **can't** be trusted (rooted or jailbroken); the holder is not an adversary; other apps are; **a third party with or without physical access is** | apps that "handle high-risk sensitive data and contain sensitive functionality". Its examples of such data: "location, payment, health, access tokens, API keys, crypto key encrypting user data" |
| **MAS-R**, resilience (beside L1 or L2, never alone) | as L2, and **the holder is an adversary** (a reverse engineer or cheater) | apps "that have a strong need to safeguard their own business assets and logic": intellectual property, licence checks, cheating, piracy. "The absence of any MAS-R measures does not inherently introduce vulnerabilities" |
| **MAS-P**, privacy (beside the others) | — | "all mobile apps that deal with user-sensitive data" |

**What the standard asks of the choice:** a threat model first, then the profile chosen "risk-based … in consultation with business owners", tailored, with "any deviations from the recommended controls … carefully justified and documented"; a custom profile from a detailed threat model is the highest assurance; "the goal is not to comply with every profile or every test within a profile", and a test of a feature the app doesn't have is unnecessary.

### 1.3 The choice: **MAS-L2 + MAS-P, tailored; MAS-R not taken** *(proposed, agent default, ADR-562; for the user's approval)*

- **L2, not L1,** because the threat model's attacker P4 is "whoever finds or steals a phone" (§2): a third party with physical access, which L2 assumes and L1 doesn't; and the phone holds what MASTG itself calls high-risk: location (every field event's GPS), access tokens, a key encrypting the work, the login list. Its function is sensitive: every record may bill public money (`adms-domain` §1.1).
- **P,** because the phone holds personal details (monitors' names, a collection's address, an ROE's parcel and address, photographs with their location) and, as MASTG asks, the app's privacy is checked beside its security.
- **R is not taken,** though the threat model's P2, a dishonest monitor, is exactly R's "holder as adversary". The design answers P2 **on the server, not in the app**: the server never takes money, a capacity or a conclusion from a phone (T-12); a load needs two monitors who can't see each other (T-06); a record naming somebody who didn't hold the phone is flagged (T-13). A modified app can send only what an honest one can: field events, which the worker checks. R's own answers are refused by recorded decisions or buy nothing here: **attestation** (MASWE-0054, 0056) is the opposite of ADR-240 and AC-11-13, a phone asks no service of Apple's or Google's; **obfuscation** (0059, 0060) protects intellectual property, and the code is published under the AGPL; **root, emulator and debugger detection** (0051, 0053, 0064, 0065) would block a monitor's work on a phone the firm chose, and nothing here blocks field work (ADR-052). **Two of R's are taken anyway**, because they cost nothing and a release build should have them: debug artefacts removed (0061) and debug mechanisms off (0063), both AC-11-70.
- **Tailoring within L2:** biometrics are not used (sign-in is a Monitor ID and password, ADR-105), so MASWE-0021 and 0022 are "not used"; the local sign-in is not bound to the store's key, by the user's decision (ADR-096), a departure named at MASWE-0020.

---

## 2. The 24 controls

Columns: the control, as published (v2.1.0); the profiles its weaknesses belong to (MASWE v1.0.0); what answers it here; what is left, and whose.

| Control | Published | Profiles | Answered by: scenario (task) | Owner, or left |
|---|---|---|---|---|
| **MASVS-STORAGE-1** | The app securely stores sensitive data | L1, L2 | AC-11-07, 08 (3.2.1, 3.8.1, 3.9.1), AC-11-03 (3.1.2), AC-11-12 (3.2.2), AC-11-34 (3.4.3), AC-11-68, 72 | — |
| **MASVS-STORAGE-2** | The app prevents leakage of sensitive data | L1, L2 | AC-11-09 (3.8.1, 3.9.1), AC-11-10 (3.2.1, 3.8.4, 3.9.2), AC-11-23 (3.3.1), AC-11-62, 63, 65 | AC-11-65 is proposed (§4.2) |
| **MASVS-CRYPTO-1** | The app employs current strong cryptography and uses it according to industry best practices | L1, L2 | AC-11-07 (3.2.1), AC-11-11 (3.2.2), AC-11-19, 21 (3.2.4), AC-11-44 (3.6.1) | — |
| **MASVS-CRYPTO-2** | The app performs key management according to industry best practices | L1, L2 | AC-11-07, 08, 11, AC-11-34 (3.4.3), AC-11-73 | a key's life (MASWE-0015) is one enrolment, proposed (§4.4) |
| **MASVS-AUTH-1** | The app uses secure authentication and authorization protocols and follows the relevant best practices | L1, L2 | AC-11-12 (3.2.2), AC-11-14 (3.2.3), AC-11-21 (3.2.4), AC-11-22 (3.4.1), AC-11-54, 63; at the server AC-10-44…46, 89, 90 (✅ Phase 2) | — |
| **MASVS-AUTH-2** | The app performs local authentication securely according to the platform best practices | L2 | AC-11-19, 20, 21 (3.2.4); AC-02-40 (3.2.4); AC-11-83 (3.3.2: the master passcode's ten wrong tries offline lock the phone until the server takes it, ADR-577) | **departure** (ADR-096): the password gates using the app, not decrypting it (MASWE-0020) |
| **MASVS-AUTH-3** | The app secures sensitive operations with additional authentication | L1, L2 | AC-11-23 (3.3.1), AC-11-26 (3.3.2), AC-11-35 (3.4.3), AC-11-64 | — |
| **MASVS-NETWORK-1** | The app secures all network traffic according to the current best practices | L1, L2 (R: 0062, not taken) | AC-11-01, 02 (3.1.2), AC-11-28 (3.4.1), AC-11-66 (3.8.1, 3.9.1) | — |
| **MASVS-NETWORK-2** | The app performs identity pinning for all remote endpoints under the developer's control | L2 | AC-11-67 (3.8.1, 3.9.1) | **proposed** (§4.1): pinning, for the user |
| **MASVS-PLATFORM-1** | The app uses IPC mechanisms securely | L1, L2 | AC-11-62 (3.8.1, 3.9.1), AC-11-63 | — |
| **MASVS-PLATFORM-2** | The app uses WebViews securely | L1, L2 (R: 0063, taken) | AC-11-61 (3.1.2, 3.8.1, 3.9.1), AC-11-70 | — |
| **MASVS-PLATFORM-3** | The app uses the user interface securely | L2 | AC-11-63 (3.2.3, 3.2.4, 3.3.1), AC-11-43 (3.5.3), AC-11-65 | the app-switcher cover, **proposed** (§4.2) |
| **MASVS-CODE-1** | The app requires an up-to-date platform version | L1, L2 | AC-11-71 (3.8.1, 3.9.1) | each platform's minimum, by its build's ADR |
| **MASVS-CODE-2** | The app has a mechanism for enforcing app updates | L2 | AC-11-71 (3.8.1, 3.9.1) | **proposed** (§4.5): told to update, nothing lost |
| **MASVS-CODE-3** | The app only uses software components without known vulnerabilities | L1, L2 | `pnpm security`'s dependency audit (**built**, ADR-276; it reads the whole lockfile, so `apps/field` joined it with its first dependency, 3.1.2, ADR-563…565); AC-11-70, 72 | the native libraries (AC-11-72, 3.8.1, 3.9.1) |
| **MASVS-CODE-4** | The app validates and sanitizes all untrusted inputs | L1, L2 (R: 0057, not taken) | AC-11-28 (3.4.1), AC-11-61, AC-11-39, 40 (3.5.1, 3.5.2) | — |
| **MASVS-RESILIENCE-1** | The app validates the integrity of the platform | R | — | **not taken** (§1.3); attestation refused by ADR-240 (AC-11-13) |
| **MASVS-RESILIENCE-2** | The app implements anti-tampering mechanisms | R | — | **not taken** (§1.3); the server trusts no phone's conclusion (T-12) |
| **MASVS-RESILIENCE-3** | The app implements anti-static analysis mechanisms | R | AC-11-70 (0061, taken) | **not taken** (§1.3): the code is published (AGPL-3.0) |
| **MASVS-RESILIENCE-4** | The app implements anti-dynamic analysis techniques | R | AC-11-70 (0063, taken) | **not taken** (§1.3): detection would block a monitor's work (ADR-052) |
| **MASVS-PRIVACY-1** | The app minimizes access to sensitive data and resources | P | AC-11-68 (3.5.1, 3.6.1, 3.8.2, 3.9.1), AC-11-69 (3.1.2), AC-11-13 (3.2.2) | — |
| **MASVS-PRIVACY-2** | The app prevents identification of the user | P | AC-11-69, AC-11-68 | **departure by design** for the evidence itself: a record names its monitor, its phone and its place, which is what it proves (`adms-domain` §1.1) |
| **MASVS-PRIVACY-3** | The app is transparent about data collection and usage | P | — | **Phase 5a** (the store builds): the store's privacy declarations, the firm's privacy policy, reproducible builds |
| **MASVS-PRIVACY-4** | The app offers user control over their data | P | AC-02-46 (3.3.2) | **departure by design**: evidence is never deleted (invariant 1); the firm, whose records they are, answers a person's request (the operator's guide, REQ-517) |

---

## 3. The weaknesses, by group (MASWE v1.0.0)

Every weakness the published catalogue maps to a control, in its first group; one mapped to several groups is answered once, where it stands. **Profile** is the catalogue's. Answers name file 11's rows unless another file is named.

### STORAGE

| Weakness | Profile | Controls | Title | Answer |
|---|---|---|---|---|
| MASWE-0001 | L2 | STORAGE-1, 2, CRYPTO-2 | Sensitive data stored unencrypted in private storage | AC-11-07: one encrypted store, its random key in secure storage, this device only (3.2.1; SQLCipher 3.8.1, 3.9.1): **built** for the browser build (ADR-570: `apps/field/src/store/`, every value sealed and every id hidden; `e2e/store.e2e.ts`) |
| MASWE-0002 | L1, L2 | STORAGE-1, 2 | Sensitive data stored unencrypted outside of private storage | AC-11-07 (nothing in a plain file); AC-11-68 (a photograph never in the phone's shared library). The browser build's PDF receipt is a test build's (AC-11-03) |
| MASWE-0003 | L1, L2 | STORAGE-1, CRYPTO-2 | Cryptographic keys stored outside of platform keystore | AC-11-07 (the data key), AC-11-11 (the device key, made in the Secure Enclave or the Keystore), AC-11-12, 14 (the tokens in secure storage) |
| MASWE-0004 | L1, L2 | STORAGE-1 | Sensitive data hardcoded in the app package | AC-11-72: the app ships no secret; the secrets scan reads the built app: **built** for the browser build (ADR-565: `pnpm security` reads `apps/field/dist/web/`), the native packages at 3.8.1, 3.9.1. The master passcode's check reaches a phone as a list, never in the package (ADR-454) |
| MASWE-0005 | L1, L2 | STORAGE-2 | Insertion of sensitive data into logs | AC-11-10 (3.2.1, 3.8.4, 3.9.2): **built** for the browser build's source (ADR-570: the app writes nothing to the console, `test/what-it-holds.test.ts`; the store's refusals name only the shelf) |
| MASWE-0006 | L1, L2 | STORAGE-2 | Sensitive data not excluded from backup | AC-11-09 (3.8.1, 3.9.1) |

### CRYPTO

| Weakness | Profile | Controls | Title | Answer |
|---|---|---|---|---|
| MASWE-0007 | L1, L2 | CRYPTO-1, 2 | Improper encryption | AC-11-07: the browser build's AES-GCM by WebCrypto (3.2.1), the native store's SQLCipher (3.8.1, 3.9.1), each cipher named by its task's ADR from `CHECKLIST-API.md` V11's table or the store's own: **the browser build's built** (ADR-570: AES-256-GCM, a random 96-bit nonce each seal, bound to its shelf and name; HMAC-SHA-256 names) |
| MASWE-0008 | L1, L2 | CRYPTO-1 | Improper hashing | AC-11-44 (SHA-256 of a photograph's original, 3.6.1); AC-11-19 (Argon2id, 3.2.4) |
| MASWE-0009 | L1, L2 | CRYPTO-1, 2 | Improper use of message authentication code | AC-11-21: the offline sign-in's proof, an HMAC keyed by the first slow hash, kept only until sign-out (3.2.4; the server's half ✅ AC-10-90) |
| MASWE-0010 | L1, L2 | CRYPTO-1, 2 | Improper generation of cryptographic signatures | AC-11-11: ECDSA P-256 by the platform, DER (3.2.2, 3.8.1, 3.9.1); the server's half ✅ AC-10-44, 45 |
| MASWE-0011 | L1, L2 | CRYPTO-1 | Improper verification of cryptographic signature | not used: the phone checks no signature of its own; the server's identity is TLS's (NETWORK-1) |
| MASWE-0012 | L1, L2 | CRYPTO-1 | Improper random number generation | AC-11-07 (the data key, random), AC-11-11 (keys made by the platform); the UUIDv7 maker draws from the platform's cryptographic source: **built** (ADR-565: `packages/domain/src/ids.ts`, Web Crypto's `getRandomValues`; `packages/domain/test/ids.test.ts`) |
| MASWE-0013 | L1, L2 | CRYPTO-2 | Improper cryptographic key generation | AC-11-07, 11 |
| MASWE-0014 | L1, L2 | CRYPTO-2 | Improper cryptographic key derivation | AC-11-19 (Argon2id under the entry's salt); AC-11-08 (the data key comes from no password: **built** for the browser build, ADR-570: generated, never imported or derived, `test/what-it-holds.test.ts`) |
| MASWE-0015 | L2 | CRYPTO-2 | Cryptographic key rotation not implemented | **proposed** (§4.4): a key lives one enrolment: the store's key and the device key are erased at the wipe (AC-11-34; **built** for the browser build, 3.4.3, ADR-580: the keyring's erase, then the store's, only on the server's word) and the server revokes the device key at turn-in or after the firm's time (✅ ADR-488, 520); a phone enrolled again makes new ones |
| MASWE-0016 | L2 | CRYPTO-2, AUTH-2, 3 | Cryptographic key access not restricted | AC-11-07, 11 (this device only, usable by the app alone); how soon after the phone starts the key opens is 3.8.1's and 3.9.1's ADR (proposed: after the phone's first unlock, so a background sync can run) |
| MASWE-0017 | L2 | CRYPTO-2 | Device secure lock not enforced | AC-11-73: told, never refused (3.8.1, 3.9.1). ARCHITECTURE §7.2 (5) recommends a screen lock and leaves it to the firm's device management; the app says so, it doesn't stop work |

### AUTH

| Weakness | Profile | Controls | Title | Answer |
|---|---|---|---|---|
| MASWE-0018 | L1, L2 | AUTH-1, PLATFORM-1, STORAGE-2 | Lack of authentication or authorization on app components | AC-11-62: nothing of the app is open to another app (3.8.1, 3.9.1); every call is the server's to allow (✅ AC-10-27) |
| MASWE-0019 | L1, L2 | AUTH-1, 3 | Lack of auto-fill support for credential providers | AC-11-54, 63: a sign-in takes a paste and a password manager (3.2.3, 3.2.4, 3.3.1) |
| MASWE-0020 | L2 | AUTH-2, CRYPTO-2 | Local authentication can be bypassed | **departure** (the user, ADR-096; ARCHITECTURE §8): the monitor's password gates using the app, not decrypting its store, so a supervisor can turn in a phone its monitor walked away from. What a bypass gets is answered on the server: an offline sign-in's proof that isn't one is refused and the back office told (AC-11-21; ✅ AC-10-90); a record under somebody who didn't hold the phone is flagged (✅ AC-10-110) |
| MASWE-0021 | L2 | AUTH-2 | Fallback to non-biometric credentials allowed for sensitive transactions | not used: no biometric sign-in (ADR-105) |
| MASWE-0022 | L2 | AUTH-2, CRYPTO-2 | Crypto keys not invalidated on new biometric enrollment | not used: no key is bound to a biometric |
| MASWE-0023 | L2 | AUTH-3, PLATFORM-3 | Step-up authentication not implemented for sensitive actions | the master passcode for every supervisor's act: AC-11-23, 26 (3.3.1, 3.3.2), AC-11-35 (3.4.3); AC-02-42 |
| MASWE-0024 | L2 | AUTH-3 | Sensitive data accessible after session termination | AC-11-64: at sign-out, the inactivity lock or a switch, the session and the offline proof dropped and nothing of the monitor's on screen (3.2.4, 3.3.2) |
| MASWE-0025 | L2 | AUTH-3 | Lack of non-repudiation for critical actions | every record names its phone, proved by its key at every sync (✅ AC-10-44…46), and its monitor, by their session or their offline sign-in's proof (AC-11-21); AC-11-36 (3.5.1). Records are not signed one by one: they are evidence by the proven sync, the idempotency ledger and the audit log (T-05, T-11) |

### NETWORK

| Weakness | Profile | Controls | Title | Answer |
|---|---|---|---|---|
| MASWE-0026 | L1, L2 | NETWORK-1 | Network traffic not encrypted | AC-11-01 (the browser build, 3.1.2); AC-11-66 (no plain HTTP in a native build, 3.8.1, 3.9.1) |
| MASWE-0027 | L1, L2 | NETWORK-1 | Insecure certificate validation | AC-11-66: the platform's own check, never turned off; a release build trusts no root a person added, nor the local stack's |
| MASWE-0028 | L2 | NETWORK-2 | Insecure identity pinning | AC-11-67, **proposed** (§4.1) |
| MASWE-0047 | L1, L2 | CODE-3, AUTH-1, CRYPTO-1, NETWORK-1 | Using non-standard APIs for security-critical functionality | the platform's own: WebCrypto, the Keychain and Keystore, the system's TLS, SQLCipher; no cryptography of our own (as `CHECKLIST-API.md` V11). The one library outside them is the browser build's Argon2, chosen by 3.2.4's ADR |
| MASWE-0062 | R | RESILIENCE-3, NETWORK-1 | No application-level payload encryption | not taken (R, §1.3): TLS carries the sync; the server checks every record |

### PLATFORM

| Weakness | Profile | Controls | Title | Answer |
|---|---|---|---|---|
| MASWE-0029 | L1, L2 | PLATFORM-1, STORAGE-2, CODE-4 | Insecure deep links | AC-11-62: the app registers no link, scheme or share target |
| MASWE-0030 | L1, L2 | PLATFORM-1, STORAGE-2 | Improper use of the clipboard | AC-11-63: the app writes nothing to the clipboard; a monitor may paste into a sign-in (WCAG 3.3.8) |
| MASWE-0031 | L1, L2 (iOS) | PLATFORM-1, STORAGE-2 | Allowing untrusted app extensions | AC-11-62: the iPhone app refuses other makers' keyboards (3.8.1) |
| MASWE-0032 | L1, L2 (Android) | PLATFORM-1, STORAGE-2 | Insecure intents | AC-11-62: no component exported but the launcher (3.9.1) |
| MASWE-0033 | L1, L2 | PLATFORM-2, STORAGE-2 | Sensitive native functionality exposed in WebViews | AC-11-61: the WebView loads only the app's own files, so only its own code reaches the native plugins, and only the plugins it uses are installed |
| MASWE-0034 | L1, L2 | PLATFORM-2, STORAGE-2, CODE-4 | WebViews allow access to local resources with untrusted content | AC-11-61 |
| MASWE-0035 | L1, L2 | PLATFORM-2, CODE-4 | WebViews loading untrusted content | AC-11-61 |
| MASWE-0036 | L2 | PLATFORM-3, STORAGE-2 | Unnecessary exposure of sensitive data via the user interface | AC-11-63 (secrets masked); AC-11-43 (no rate or code shown, invariant 20); the lists carry no ROE owner, no driver and no contact (✅ ADR-451, 553) |
| MASWE-0037 | L2 | PLATFORM-3, STORAGE-2 | Unnecessary exposure of sensitive data via notifications | AC-11-65: the app sends no system notification; the time clock's nudges are on its own screen (`adms-field-app` §4A, 13) |
| MASWE-0038 | L2 | PLATFORM-3, STORAGE-2 | Insufficient protection of sensitive data from screenshots or screen recordings | AC-11-65, **proposed** (§4.2) |
| MASWE-0039 | L2 | PLATFORM-3, CODE-1 | App vulnerable to overlay attacks | 3.9.1 by ADR: the minimum Android version, and where it doesn't stop another app's overlay passing touches through, the submit and passcode controls ignore touches while covered. iOS lets no app draw over another |
| MASWE-0040 | L2 | PLATFORM-3, STORAGE-2 | Sensitive data leaked via accessibility services | AC-11-63: a masked field is spoken as secure, never read out. Everything else on screen is meant to be read aloud (WCAG 4.1.2, AC-11-57) |
| MASWE-0063 | R | RESILIENCE-4, PLATFORM-2 | Debug mechanisms not disabled | taken: AC-11-70 (3.8.1, 3.9.1) |

### CODE

| Weakness | Profile | Controls | Title | Answer |
|---|---|---|---|---|
| MASWE-0041 | L2 | CODE-1 | Running on a recent platform version not ensured | AC-11-71: a minimum version in each build, so the phone's own store refuses to install it lower (3.8.1, 3.9.1) |
| MASWE-0042 | L1, L2 | CODE-1 | Latest platform version not targeted | AC-11-71 |
| MASWE-0043 | L2 | CODE-2 | Enforced updating not implemented | AC-11-71, **proposed** (§4.5) |
| MASWE-0044 | L1, L2 | CODE-3 | Dependencies with known vulnerabilities | **built**: `pnpm security`'s audit (every advisory fails unless accepted by an ADR, ADR-276), over every workspace, `apps/field` once it exists; AC-11-72 adds the native libraries |
| MASWE-0045 | L2 | CODE-3, 4 | Compiler-provided security features not used | AC-11-70: the platform's release protections on, none turned off |
| MASWE-0046 | L2 | CODE-3, CRYPTO-2 | Use of deprecated APIs or functionality | **built** for the TypeScript: `@typescript-eslint/no-deprecated` is an error in the strict type-checked rules every workspace is linted with (`eslint.config.js`, ADR-257), `apps/field` too; the native build's warnings read at 3.8.1, 3.9.1 |
| MASWE-0048 | L1, L2 | CODE-3 | Malicious code included in the app | **built**: the workspace's supply-chain rules (exact versions, none younger than seven days, no install script unless named, exotic sub-dependencies refused; ADR-255); every dependency by ADR first, Zebra's SDK licence read before it is taken (Phase 3's brief) |
| MASWE-0049 | L2 | CODE-4 | Unsafe dynamic code loading | AC-11-61: no script but the app's own bundle, no `eval`, no code loaded at run time; an update comes only as a new build (no update over the air) |
| MASWE-0050 | L1, L2 | CODE-4 | Unsafe handling of untrusted data | AC-11-28: every answer read only through the contract's schemas (`syncAnswerRead`); AC-11-61: no HTML made from data; AC-11-39, 40: a typed or scanned number is a number |
| MASWE-0057 | R | RESILIENCE-2, CODE-4 | App resources integrity not verified | not taken (R, §1.3); the store's signature on the app is the platform's |

### RESILIENCE (R; not taken, §1.3)

| Weakness | Profile | Controls | Title | Answer |
|---|---|---|---|---|
| MASWE-0051 | R | RESILIENCE-1, 4 | Root/jailbreak detection not implemented | not taken: it would block a monitor's work (ADR-052); L2 already assumes a rooted phone, and the store's key in secure hardware is the answer to it |
| MASWE-0052 | R | RESILIENCE-1 | App virtualization environment detection not implemented | not taken (§1.3) |
| MASWE-0053 | R | RESILIENCE-1, 4 | Emulated or virtual device detection not implemented | not taken: the browser build and the simulators are how the app is tested (ARCHITECTURE §15) |
| MASWE-0054 | R | RESILIENCE-1 | Device attestation not implemented | not taken: refused by ADR-240 (AC-11-13): a phone asks no attestation service; it proves itself with its own key |
| MASWE-0055 | R | RESILIENCE-2 | Malware detection not implemented | not taken: the firm's device management (ARCHITECTURE §8) |
| MASWE-0056 | R | RESILIENCE-2 | App attestation not implemented | not taken: as MASWE-0054 |
| MASWE-0058 | R | RESILIENCE-2 | Runtime code integrity not verified | not taken: the server trusts no conclusion a phone sends (T-12) |
| MASWE-0059 | R | RESILIENCE-3 | Code obfuscation not implemented | not taken: the code is published (AGPL-3.0) |
| MASWE-0060 | R | RESILIENCE-3 | Resource obfuscation not implemented | not taken: as MASWE-0059 |
| MASWE-0061 | R | RESILIENCE-3 | Debug artifacts not removed | taken: AC-11-70 |
| MASWE-0064 | R | RESILIENCE-4 | Debugger detection not implemented | not taken: AC-11-70 turns debugging off in a release build; detecting it would add nothing the server doesn't already check |
| MASWE-0065 | R | RESILIENCE-4 | Dynamic analysis tools detection not implemented | not taken: as MASWE-0064 |

### PRIVACY (P)

| Weakness | Profile | Controls | Title | Answer |
|---|---|---|---|---|
| MASWE-0066 | P | PRIVACY-1 | Inadequate permission management | AC-11-68: the camera, location while in use and Bluetooth, each asked when first needed with its reason; nothing else |
| MASWE-0067 | P | PRIVACY-2 | Lack of anonymization or pseudonymisation measures | **departure by design**: the evidence names its monitor, phone and place, which is what makes it evidence (`adms-domain` §1.1). What a phone holds of anyone else is the least its work needs (✅ ADR-451, 553) |
| MASWE-0068 | P | PRIVACY-2 | Incorrect use of identifiers for user tracking | AC-11-69: no advertising or hardware identifier read; the phone is known by its enrolment alone |
| MASWE-0069 | P | PRIVACY-2 | Usage of non-privacy-preserving functionality | AC-11-68: a location read only when the monitor captures one (AC-11-37), never in the background |
| MASWE-0070 | P | PRIVACY-2 | Inadequate awareness for privacy relevant actions | AC-11-68: each permission asked with its reason, in the translation file's words |
| MASWE-0071 | P | PRIVACY-2 | Inadequate defaults for privacy relevant actions | AC-11-68, 69: nothing shared by default; the firm's own server is the only place anything goes |
| MASWE-0072 | P | PRIVACY-3 | Inadequate privacy policy | Phase 5a: the store listings name the firm's privacy policy; the firm, which runs the installation, writes it (the operator's guide, REQ-517) |
| MASWE-0073 | P | PRIVACY-3, 1 | Inadequate data collection declarations | Phase 5a: the store builds' declarations (Apple's privacy manifest and labels, Google's data safety form), from this page's data (§2, PRIVACY rows) and `CHECKLIST-API.md` §5.8 |
| MASWE-0074 | P | PRIVACY-3 | Inadequate tracking domains declarations | not used: no tracking domain (AC-11-69) |
| MASWE-0075 | P | PRIVACY-3 | Non-reproducible builds | Phase 5a (the store builds): the source is published and the lockfile pins every version; whether a store build is reproduced byte for byte is that phase's |
| MASWE-0076 | P | PRIVACY-4 | Lack of proper data management controls | **departure by design**: no hard delete (invariant 1); a monitor never edits a submitted record (ADR-477); a person's request is the firm's to answer |
| MASWE-0077 | P | PRIVACY-4 | Inadequate data visibility controls | AC-02-46: a monitor's unsynced work is hidden from the next monitor on the phone (3.3.2); what each viewer sees is the server's (✅ ADR-169) |
| MASWE-0078 | P | PRIVACY-4 | Inadequate or ambiguous user consent mechanisms | AC-11-68 (the platform's own prompts); the work is the firm's, done by its staff on its phones; anything more is the firm's employment terms, not the app's |

---

## 4. What the page leaves for the user

Each proposal says what the standard asks, then what is recommended. **All are agent defaults (ADR-562); building doesn't wait**, and each is built by the task named. §1.3 (the profile), §4.1 and §4.2 are put to the user.

### 4.1 Certificate pinning (MASVS-NETWORK-2, MASWE-0028, L2)

**What the standard asks:** "identity pinning for all remote endpoints under the developer's control": instead of every root the phone trusts, only "very specific CAs". Here the one endpoint is the firm's API, and the firm, not this project, controls its certificate.

**What could go wrong either way:** without a pin, a certificate wrongly issued for the API's name, or a root installed on the phone, lets somebody read and change a sync. With a pin, a firm that changes certificate authority without updating its app stops every phone syncing until the new build reaches it. Offline is normal, so nothing is lost (records wait on the phone, as they do all day), but the back office sees nothing new until then.

**Recommended:** pin, in the native builds only. **The pins are public-key hashes (SPKI SHA-256) of at least two certificate authorities' keys the installation names, one a backup, never the API's own certificate** (which a host renews every few months). They are set beside the API's address in the native build's configuration (it is the build's, `ADMS_FIELD_API_ORIGIN`, an HTTPS origin alone: ADR-565). A connection whose chain holds none of them sends nothing; the phone keeps every record and says "Can't reach the server safely. Your work is kept on this phone." The browser build doesn't pin (the browser decides; it is a test build). How each platform holds a pin depends on which layer makes the request (the WebView or a native one): 3.8.1 and 3.9.1 read the platform's own text before building it, and the operator's guide (REQ-517) says how to change certificate authority without stopping phones. *Scenario: AC-11-67.*

### 4.2 The screen in the app switcher (MASVS-PLATFORM-3, MASWE-0038, L2)

**What the standard asks:** sensitive data removed or masked "when moved to the background, when being recorded or when a screenshot is taken".

**What the screens hold:** a collection's address, an ROE's parcel, monitors' names, GPS. The passwords and the master passcode are masked already (AC-11-63).

**Recommended:** **cover the screen when the app goes to the background**, so the app switcher's picture shows a plain cover with the app's name; **leave screenshots and screen recording allowed** (the firm's training and support use them, ADR-561, and L2 doesn't treat the phone's holder as the adversary). Blocking screenshots outright (Android's secure-window flag) would also stop those. The cover is each platform's to build (3.8.1, 3.9.1); the browser build can't. *Scenario: AC-11-65.*

### 4.3 The profile: L2 + P, R not taken (§1.3)

**Recommended** as §1.3 says. Taking R would mean root and emulator detection that stops field work and attestation that ADR-240 refused. Instead the threat model's dishonest monitor is answered by the server (T-06, T-12, T-13).

### 4.4 A key's life is one enrolment (MASWE-0015, L2; agent default)

The store's data key and the device key are made at enrolment and erased at the wipe (AC-11-34); the server revokes the device key at turn-in or after the firm's time (ADR-488, 520). A phone is enrolled again with new keys. Nothing is rotated in place: changing the store's key under records not yet synced risks the evidence for no gain, since the key never leaves the phone's secure hardware.

### 4.5 An app too old (MASVS-CODE-2, MASWE-0043, L2; agent default)

**What the standard asks:** that the app "detects if it must be updated and reacts appropriately". **Proposed:** the installation states the oldest version of the app it takes, as a policy value (the release's own default: any). A phone older than that is told at its next proof "Update the app to send your work", and sends nothing until it is updated. **It loses nothing:** capture goes on, and an update keeps its store. The server half (the version a phone sends, the refusal and its code) is a Phase 3 server task by the endpoint recipe, in 3.8.1 (the first build that can be out of date; the browser build is always the one served). *Scenario: AC-11-71.*

---

## 5. The threat model's phone rows, read again (2026-10-18)

`spec/THREAT-MODEL.md` §4.1 and §6 were read against this page:

- **T-01, T-02, T-04, T-05** name the field app's half as "Phase 3": each now names its file 11 rows (AC-11-19, 20; AC-11-07, 09, 11; AC-11-23; and for T-05 the record sealed at submit, AC-02-45 and AC-08-06 at 3.5.1).
- **Two threats the phone meets were missing**, and are added: **T-08, a hostile app or page on the phone** (another app, a link, a web page or a keyboard reaching the field app or what it shows: AC-11-61…65), and **T-09, a modified field app** (P2 or P4 running a changed copy: answered by the server, never by the app, with MAS-R not taken: §1.3).
- **§6's line** for the field app's checklist points to this page.
- What the software only records (§5): unchanged. Point 6, a phone with no screen lock, now gets a warning (AC-11-73), and stays the firm's to fix.

---

## 6. How the list was made

- **The published texts, read whole on 2026-10-18:** OWASP MASVS v2.1.0 (`OWASP/masvs`, tag `v2.1.0`: `Document/` and `controls/`, 24 controls; `master` compared, the same controls); OWASP MASWE v1.0.0 (`OWASP/maswe`, tag `v1.0.0`, 17 August 2026: 78 weaknesses, each with its profiles and its MASVS v2 controls); OWASP MASTG v2.0.0 (`OWASP/mastg`, tag `v2.0.0`, 30 June 2026: the profiles chapter). The file 11 marks written before (control groups only, ADR-560 (b)) were replaced by the controls' numbers.
- **Which items are on the page:** every control and every weakness; the profile followed decides only whether an item is answered or not taken.
- **The reach of each answer:** an item is answered by a scenario only when file 11's Answers column names that control. Something built and tested is **built**, with its test and ADR. A scenario added by this page (AC-11-61…73) restates a recorded rule or an agent default of ADR-562, marked in its From column.
- **Answered whole at 3.10.2:** every row read again against what was built, each scenario's test named, the passing ones counted.
