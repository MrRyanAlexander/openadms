// The domain rules shared by phone and server; depends on nothing (ARCHITECTURE §18).
// The rules arrive task by task in Phase 1 (BACKLOG, "Active — Phase 1").
export {
  lookedUpAddress,
  lookedUpAddressLongest,
  noAddressReasons,
  type NoAddressReason,
} from './addresses.ts';
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
  CertificationChecks,
  TicketChecks,
  workTimeOf,
  type CertificationPhotograph,
  type CheckSetup,
  type CheckedAround,
  type CheckedCertification,
  type CheckedFieldEvent,
  type ControlRangeRead,
  type Named,
} from './checks.ts';
export {
  Flags,
  certificationViews,
  flagBillings,
  flagCodes,
  type CertificationView,
  type Fact,
  type FlagBilling,
  type FlagCode,
  type FlagFacts,
  type FlagRaised,
  type FlagStanding,
  type FlagSubject,
  type FlagTold,
  type FlagsCompared,
} from './flags.ts';
export { ProjectClock } from './project-clock.ts';
export {
  QuantityChecks,
  type CarriedTicketRead,
  type CheckedReceipt,
  type QuantifiedAround,
  type QuantifiedFieldEvent,
  type QuantitySetup,
  type ReceiptDisposal,
} from './quantity-checks.ts';
export {
  RoeChecks,
  type CheckedRoe,
  type CheckedSurvey,
  type RoeFieldEvent,
  type RoeNamed,
  type RoeSetup,
} from './roe-checks.ts';
export {
  UnitRateChecks,
  countShapes,
  type CheckedKindOfWork,
  type CountShapeName,
  type PayItemWorkedOut,
  type UnitRateAround,
  type UnitRateFieldEvent,
  type UnitRateFound,
  type UnitRatePayItem,
  type UnitRateSetup,
} from './unit-rate-checks.ts';
export { Distance, type GpsPoint } from './geodesic.ts';
export {
  PlaceChecks,
  SiteChecks,
  type CheckedSite,
  type PlaceFound,
  type PlaceSetup,
  type PlacedFieldEvent,
  type ProjectMap,
  type ZoneAttached,
  type ZoneOnMap,
} from './place.ts';
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
  FieldEventDetails,
  fieldEventDetailNames,
  fieldEventDetails,
  fieldEventKinds,
  measuredAs,
  type DetailRefusal,
  type FieldEventDetail,
  type FieldEventKindName,
  type MeasuredAs,
  type RecordedDetails,
} from './field-event-details.ts';
export {
  DebrisTypeEntries,
  type DebrisTypeEntry,
  type DebrisTypeFormKind,
  type SetupWarning,
} from './form-debris-types.ts';
export { IncidentOffers, incidentOffers, type IncidentOffer } from './incident-offers.ts';
export {
  GpsFix,
  Quarantine,
  quarantineReasons,
  type FixReading,
  type QuarantineNotice,
  type QuarantineReason,
  type ReadableFix,
  type SentFix,
} from './intake.ts';
export {
  Mileage,
  mileageSources,
  type MapData,
  type MileageEnds,
  type MileageMeasured,
  type MileageSource,
  type RoadPoint,
} from './mileage.ts';
export {
  MapShapes,
  ShapeArea,
  type BoundingBox,
  type MapGeometry,
  type MapShape,
  type MultiPolygonShape,
  type NamedShape,
  type PolygonShape,
  type ShapeReading,
} from './map-shapes.ts';
export {
  ControlRanges,
  NewProjectNumbers,
  NumberSeriesBook,
  NumberSeriesRules,
  PhoneNumbers,
  numberSeries,
  ticketNumberSeries,
  ticketNumbers,
  type ControlRangeEntry,
  type HeldBlock,
  type NewSeries,
  type NumberRefusal,
  type NumberRun,
  type NumberSeriesName,
  type NumbersTaken,
  type SeriesPosition,
} from './numbers.ts';
export {
  TicketNeighbours,
  timesOverlap,
  type NeighbourEvent,
  type TicketKey,
} from './neighbours.ts';
export { Policy, policyNames, type PolicyName } from './policy.ts';
export {
  BreachedPasswords,
  PasswordRules,
  contextWords,
  passwordAsKept,
  passwordProblemCodes,
  type PasswordHolder,
  type PasswordProblem,
  type PasswordProblemCode,
} from './passwords.ts';
export {
  Access,
  DispatchRights,
  PeopleRules,
  SetupRights,
  actorOnly,
  actorsOnly,
  backOfficeCreated,
  backOfficeRolesChanged,
  permissions,
  type ActorOnly,
  type Asked,
  type BackOfficeCreated,
  type BackOfficeRole,
  type DispatchRightsRefusal,
  type Holder,
  type PeopleRefusalCode,
  type PermissionName,
  type SetupRightsRefusal,
} from './people.ts';
export {
  AssignmentRules,
  assignableRoles,
  assignmentFormDocumentTypes,
  noAssignmentReasons,
  unplannedAssignmentRefusals,
  type AssignmentFormDocumentType,
  type AssignmentRefusal,
  type AssignmentRefusalCode,
  type AssignmentTaken,
  type NoAssignmentReason,
  type StandingAssignment,
  type UnplannedAssignmentRefusal,
} from './assignments.ts';
export {
  MasterPasscodeRules,
  PhoneRules,
  phoneRemovals,
  type PhoneRemoval,
  type PhoneRemovalRefusal,
} from './phones.ts';
export { PhoneProofRules, phoneKeyKind, type PhoneProofPolicy } from './phone-proof.ts';
export {
  addressCounted,
  RateLimit,
  rateLimitNames,
  RateLimits,
  type Counted,
  type RateLimitName,
  type RateLimitsPolicy,
} from './rate-limits.ts';
export {
  MasterPasscodeTries,
  SignInTries,
  type SignInTriesPolicy,
  type WrongTry,
} from './sign-in-tries.ts';
export { TwoStepRules, twoStepCode, type TwoStepNeed, type TwoStepPolicy } from './two-step.ts';
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
  RuleReach,
  RuleValidity,
  ruleActionKinds,
  type QuantityFrom,
  type RuleActionKind,
  type RuleActionLine,
  type RuleCheck,
  type RuleEntry,
  type RuleRefusal,
} from './rules.ts';
export {
  CarriedTickets,
  HaulOutQuantities,
  LoadQuantities,
  ScaleWeight,
  StumpQuantities,
  quantityFor,
  quantitySources,
  type Amount,
  type CarriedQuantities,
  type CarriedTicketFound,
  type ContainerWeight,
  type HaulOutQuantitiesWorked,
  type HaulOutTaken,
  type LoadCollectionQuantities,
  type LoadCollectionTaken,
  type LoadQuantitiesWorked,
  type LoadTaken,
  type NetWeight,
  type PileCallNotHigher,
  type PileQuantities,
  type PileTaken,
  type QuantityAsked,
  type QuantityFigures,
  type QuantitySourceName,
  type ReceiptWeights,
  type SharesNotWorkedOut,
} from './quantities.ts';
export { SiteFacts, type SiteRefusal, type SiteSetting } from './site-facts.ts';
export {
  CriterionCheck,
  TicketReadings,
  TicketRules,
  type ReadingAttached,
  type ReadingSetup,
  type RuleContract,
  type RuleFieldEvent,
  type RuleReading,
  type TicketRead,
} from './ticket-rules.ts';
export {
  TicketPricing,
  crewTimeConversions,
  type BillingUnit,
  type CrewTimeConversionName,
  type PricedDumpSite,
  type PricedLine,
  type PricedPayItem,
  type PricedPiece,
  type PricingFlagRaised,
  type PricingSetup,
  type TicketPriced,
  type TicketToPrice,
} from './ticket-pricing.ts';
export {
  Ticket,
  Tickets,
  placeOf,
  workerStatuses,
  workflows,
  type GroupedFieldEvent,
  type RaisedFlag,
  type SplitShape,
  type WorkerStatus,
  type WorkflowName,
} from './tickets.ts';
export { ViewerSettings } from './viewer-settings.ts';
export {
  QuantityLookup,
  quantityAsks,
  type DumpedForm,
  type LookupForm,
  type LookupPayItem,
  type LookupSetup,
  type LookupSite,
  type QuantityAsk,
  type QuantityAskName,
  type QuantityAskedAt,
} from './quantity-lookup.ts';
export {
  SetupCheck,
  setupGapCodes,
  type CheckedFeeSite,
  type CheckedForm,
  type CheckedPayItem,
  type SetupChecked,
  type SetupGap,
  type SetupGapCode,
} from './setup-check.ts';
export {
  SizeBands,
  type BandCheck,
  type BandedPayItem,
  type SetupRefusal,
  type TreeMeasurement,
  type WorkedOutPayItem,
} from './size-bands.ts';
export {
  NewProjectSettings,
  type ProgramTypeSetting,
  type ProjectSettings,
} from './project-settings.ts';

export {
  BatchName,
  FlagAccepting,
  InvoiceLocking,
  LockedTicket,
  PickedReason,
  qcStatuses,
  QuarantineResolution,
  Renumber,
  Reviewer,
  reviewPermissions,
  TicketOnItsOwn,
  TicketVoiding,
  type LockableTicket,
  type NumberWritten,
  type QcStatusName,
  type ReasonUseName,
  type ReviewPermission,
  type ReviewRefusal,
  type ReviewerRole,
  type ReviewingPerson,
} from './review.ts';

// The wiring probe of BACKLOG 0.2.2: `contracts` proves it resolves this package by reading it.
export const workspace = 'domain';
