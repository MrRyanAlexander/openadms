// The domain rules shared by phone and server; depends on nothing (ARCHITECTURE §18).
// The rules arrive task by task in Phase 1 (BACKLOG, "Active — Phase 1").
export { builtInKeys, type BuiltInKey, type ListWithBuiltInValues } from './built-in-keys.ts';
export {
  Capacity,
  boxShapes,
  boxSigns,
  type BoxShape,
  type BoxSign,
  type BoxVolume,
  type CapacityReading,
  type CapacityRefusal,
  type CertificationKind,
  type MeasuredBox,
} from './capacity.ts';
export {
  CertificationChanges,
  CertificationSubs,
  ContractorMerge,
  type CertificationRefusal,
  type ContractorPlace,
  type KnownContractor,
  type MergeMove,
  type MergeParty,
  type MergeRefusal,
  type SubPlacement,
  type SubTier,
} from './certifications.ts';
export {
  DebrisTypeEntries,
  type DebrisTypeEntry,
  type DebrisTypeFormKind,
  type SetupWarning,
} from './form-debris-types.ts';
export {
  MapShapes,
  type BoundingBox,
  type MapGeometry,
  type MapShape,
  type MultiPolygonShape,
  type NamedShape,
  type PolygonShape,
  type ShapeReading,
} from './map-shapes.ts';
export { Policy, policyNames, type PolicyName } from './policy.ts';
export {
  PaysWhen,
  type PaysWhenContract,
  type PaysWhenOnForm,
  type PaysWhenPayItem,
} from './pays-when.ts';
export {
  RuleCriteria,
  ruleCriterionKeys,
  ruleOperators,
  type RuleCriterionKey,
  type RuleCriterionLine,
  type RuleForm,
  type RuleOperator,
  type RulePick,
  type RuleValueKind,
} from './rule-criteria.ts';
export {
  ProjectRules,
  RuleValidity,
  type QuantityFrom,
  type RuleActionKind,
  type RuleActionLine,
  type RuleCheck,
  type RuleEntry,
  type RuleRefusal,
} from './rules.ts';
export { SiteFacts, type SiteRefusal, type SiteSetting } from './site-facts.ts';
export { SizeBands, type BandCheck, type BandedPayItem, type SetupRefusal } from './size-bands.ts';
export {
  NewProjectSettings,
  type ProgramTypeSetting,
  type ProjectSettings,
} from './project-settings.ts';

// The wiring probe of BACKLOG 0.2.2: `contracts` proves it resolves this package by reading it.
export const workspace = 'domain';
