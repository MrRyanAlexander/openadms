// What a browser test needs of the run's own world (e2e/world-setup.ts; ADR-572, 574): the page of
// the field app built for it, its made-up master passcode, and its cast of monitors (each with
// their Monitor ID and made-up password, and the board Luis wrote for them: Kim Nguyen on
// disposals and the drop-off log at Marsh Road TDSR, Ana Brooks on collections and incidents,
// Lee Morgan on two assignments, Tariq Patel on none), as the run's setup handed them on. The world
// also holds P2, with nobody's work, for the setup tests' own monitors (ADR-576).
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

export const worldCast = (): Readonly<Record<'kim' | 'ana' | 'lee' | 'tariq', CastMonitor>> =>
  JSON.parse(handedOn('ADMS_E2E_WORLD_CAST')) as Readonly<
    Record<'kim' | 'ana' | 'lee' | 'tariq', CastMonitor>
  >;
