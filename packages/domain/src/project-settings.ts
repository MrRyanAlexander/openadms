// What a new project's settings start as, before the firm changes any (spec/parts/01-setup.md
// step 3; spec/DATA-MODEL.md §3 "The project"; ADR-137, 142, 164, 203, 241, 303). The numbers come
// from the policy values, never from here (invariant 16); every one is the firm's to change on the
// project afterwards, audited. The database gives a project's settings no default of its own, so
// whoever creates a project starts from these.
import type { Policy } from './policy.ts';

// A project's settings, named as its record names them.
export interface ProjectSettings {
  // Whether "normal or split?" is asked on the project (ADR-137).
  allowSplitLoads: boolean;
  // A load call at or under the low limit, or at or over the high one, is flagged; null = off. A 0%
  // call is flagged either way (ADR-164, 181).
  loadCallLowLimit: number | null;
  loadCallHighLimit: number | null;
  // The root-ball height the stump fill is worked out with (ADR-203).
  stumpFillDepthInches: number;
  // The two built-in stump checks (ADR-203).
  stumpCheckRootBallWider: boolean;
  stumpCheckFillNeedsExposure: boolean;
  // The circle round a site's GPS, for every site without its own shape (ADR-142).
  siteCircleMeters: number;
  // Whether the project offers its workers the time clock, to log their own hours (ADR-241).
  timeClockEnabled: boolean;
}

// What of a program type decides a new project's settings: its own setting, never its name.
export interface ProgramTypeSetting {
  readonly requiresRoe: boolean;
}

export class NewProjectSettings {
  private readonly policy: Policy;

  constructor(policy: Policy) {
    this.policy = policy;
  }

  // The settings a new project of this program type starts with.
  for(programType: ProgramTypeSetting): ProjectSettings {
    return {
      // Ticked where the program type requires ROEs (ADR-137).
      allowSplitLoads: programType.requiresRoe,
      loadCallLowLimit: this.policy.loadCallLowLimit,
      loadCallHighLimit: this.policy.loadCallHighLimit,
      stumpFillDepthInches: this.policy.stumpFillDepthInches,
      // Both checks start on, like the load-call limits (ADR-203).
      stumpCheckRootBallWider: true,
      stumpCheckFillNeedsExposure: true,
      siteCircleMeters: this.policy.siteCircleMeters,
      // Switched off: not offered to the project's workers until the firm switches it on for the
      // projects that use it (ADR-241, 303, 304).
      timeClockEnabled: false,
    };
  }
}
