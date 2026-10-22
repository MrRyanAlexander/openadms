// The golden mission's world for the back office's run of it (playwright.mission.config.ts): the
// scenario harness's `OfficeWorld` with the mission told to Wednesday morning, before any review,
// and the worker's job loop behind it (`cli.ts office <origin> mission`).
import { madeWorld } from './world-setup.ts';

export default function missionWorldSetup(): Promise<() => Promise<void>> {
  return madeWorld('mission');
}
