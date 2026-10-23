// Every story, in the order `pnpm scenarios` runs them: the golden mission (ADR-368), then what
// it leaves out (ADR-369), then the firm's first admin (ADR-415), then the worker's queue
// (ADR-419), then what each read-only viewer reads (ADR-435), then one
// phone's day under the master passcode (ADR-464), then what a sync can't save, held for a
// person (ADR-475), then a photograph's file sent in parts and an upload interrupted (ADR-483),
// then a project's every phone syncing at once (ADR-505), then the sample projects a firm finds
// on a fresh installation.
import type { Story } from '../runner.ts';
import { burst } from './burst.ts';
import { lostPhoneKey } from './lost-phone-key.ts';
import { certification } from './certification.ts';
import { dispatchMonday } from './dispatch-monday.ts';
import { firstAdmin } from './first-admin.ts';
import { goldenMission } from './golden-mission.ts';
import { heldForReview } from './held-for-review.ts';
import { interruptedUpload } from './interrupted-upload.ts';
import { numbering } from './numbering.ts';
import { p1AnyOrder } from './p1-any-order.ts';
import { p1FieldDays } from './p1-field-days.ts';
import { p1Invoiced } from './p1-invoiced.ts';
import { p1LeftOut } from './p1-left-out.ts';
import { p1Priced } from './p1-priced.ts';
import { p1Queued } from './p1-queued.ts';
import { p1Reconciled } from './p1-reconciled.ts';
import { p1Reviewed } from './p1-reviewed.ts';
import { p1Viewed } from './p1-viewed.ts';
import { p1Voided } from './p1-voided.ts';
import { setup } from './setup.ts';
import { sync } from './sync.ts';
import { ticket101001 } from './ticket-101001.ts';
import { offlineSignIn } from './offline-sign-in.ts';
import { underThePasscode } from './under-the-passcode.ts';
import { sampleProjects } from './sample-projects.ts';
import { sampleStopped } from './sample-stopped.ts';

export const stories: readonly Story[] = [
  ticket101001,
  dispatchMonday,
  setup,
  certification,
  numbering,
  p1FieldDays,
  sync,
  p1AnyOrder,
  p1Reconciled,
  p1Priced,
  p1Reviewed,
  p1Voided,
  p1Invoiced,
  goldenMission,
  p1LeftOut,
  firstAdmin,
  p1Queued,
  p1Viewed,
  underThePasscode,
  offlineSignIn,
  heldForReview,
  interruptedUpload,
  burst,
  lostPhoneKey,
  sampleProjects,
  sampleStopped,
];
