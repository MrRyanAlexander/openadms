// The API (ARCHITECTURE §6, §18). Phase 1 builds what a person or a phone writes as plain service
// classes, with no HTTP and no sign-in: each takes the service's own database client (the login
// adms_api) and writes through db.$write as the person it is told. Phase 2 wraps them in endpoints
// (ADR-316). The setup services are spec/parts/01-setup.md's steps, one class per group of records.
export { builtInPolicy } from './policy.ts';
export { ContractorSetup, type NewContract, type NewContractor } from './setup/contractor-setup.ts';
export { FormSetup, type NewForm, type NewFormDebrisType } from './setup/form-setup.ts';
export { ListSetup } from './setup/list-setup.ts';
export {
  PayItemSetup,
  type NewPayItem,
  type PaysWhenInput,
  type RulesKept,
} from './setup/pay-item-setup.ts';
export {
  ProjectSetup,
  type NewClient,
  type NewDeclarationEvent,
  type NewMap,
  type NewProject,
} from './setup/project-setup.ts';
export type { ActionInput, CriterionInput } from './setup/rule-book.ts';
export { RuleSetup, type RuleInput, type SavedRule } from './setup/rule-setup.ts';
export { SetupService, type Clock, type Outcome, type Refusal } from './setup/setup-service.ts';
export {
  SiteSetup,
  type NewSite,
  type SiteChanges,
  type SiteFactSettings,
} from './setup/site-setup.ts';

export const workspace = 'api';
