// What a browser test needs of the run's own world (e2e/world-setup.ts; ADR-572, 574): the page of
// the field app built for it, its made-up master passcode, and its cast of monitors (each with
// their Monitor ID and made-up password, and the board Luis wrote for them: Kim Nguyen on
// disposals and the drop-off log at Marsh Road TDSR, Ana Brooks on collections and incidents,
// Lee Morgan on two assignments, Tariq Patel on none, and Jo Kim on the collections of the
// PARKS project, which numbers its loads from control tickets: task 3.5.1), as the run's setup
// handed them on. The world
// also holds P2, with nobody's work, for the setup tests' own monitors (ADR-576), and P1-TWR-LF,
// marked lost, whose key the firm's time revoked, with its key for a test to plant (ADR-580).
function handedOn(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} isn't set: the run's setup (e2e/world-setup.ts) didn't make a world.`);
  }
  return value;
}

export const worldOrigin = (): string => handedOn('ADMS_E2E_WORLD_ORIGIN');
export const worldPasscode = (): string => handedOn('ADMS_E2E_WORLD_PASSCODE');
export const worldApiOrigin = 'https://stories.adms.localhost';

export interface CastMonitor {
  readonly name: string;
  readonly monitorNumber: string;
  readonly password: string;
}

// The lost tower phone: its id, name and passcode version as enrolled, and its key's two halves in
// base64 DER (SubjectPublicKeyInfo, PKCS #8).
export interface LostPhone {
  readonly deviceId: string;
  readonly name: string;
  readonly masterPasscodeVersion: number;
  readonly publicKey: string;
  readonly privateKey: string;
}

export const worldLostPhone = (): LostPhone =>
  JSON.parse(handedOn('ADMS_E2E_WORLD_LOST_PHONE')) as LostPhone;

export const worldCast = (): Readonly<
  Record<'kim' | 'ana' | 'lee' | 'tariq' | 'jo', CastMonitor>
> =>
  JSON.parse(handedOn('ADMS_E2E_WORLD_CAST')) as Readonly<
    Record<'kim' | 'ana' | 'lee' | 'tariq' | 'jo', CastMonitor>
  >;
