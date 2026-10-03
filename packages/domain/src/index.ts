// The domain rules shared by phone and server; depends on nothing (ARCHITECTURE §18).
// The rules arrive task by task in Phase 1 (BACKLOG, "Active — Phase 1").
export { builtInKeys, type BuiltInKey, type ListWithBuiltInValues } from './built-in-keys.ts';
export {
  DebrisTypeEntries,
  type DebrisTypeEntry,
  type DebrisTypeFormKind,
  type SetupWarning,
} from './form-debris-types.ts';
export { Policy, policyNames, type PolicyName } from './policy.ts';
export { SizeBands, type BandCheck, type BandedPayItem, type SetupRefusal } from './size-bands.ts';
export {
  NewProjectSettings,
  type ProgramTypeSetting,
  type ProjectSettings,
} from './project-settings.ts';

// The wiring probe of BACKLOG 0.2.2: `contracts` proves it resolves this package by reading it.
export const workspace = 'domain';
