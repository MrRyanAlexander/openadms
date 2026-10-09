// The API's start (BACKLOG 2.1.2; ADR-385): `node apps/api/dist/main.js`, in its container. The
// settings are read and checked before anything listens; a missing or malformed one stops the
// start and names its key, never its value (AC-10-55); a policy value the installation states for
// itself is read with them and held the same way (ADR-395).
import type { Policy } from '@open-adms/domain';

import { installationPolicy } from './policy.ts';
import { ApiModule } from './process/api-module.ts';
import { ApiProcess } from './process/api-process.ts';
import { Settings, SettingsProblem } from './process/settings.ts';

let settings: Settings;
let policy: Policy;
try {
  const environment = Settings.environment(process.env);
  settings = Settings.from(environment);
  policy = installationPolicy(environment);
} catch (problem) {
  if (!(problem instanceof SettingsProblem)) throw problem;
  console.error(JSON.stringify({ level: 60, service: 'api', msg: problem.message }));
  process.exit(1);
}

const api = await ApiProcess.create(ApiModule, settings, policy);
await api.listen();
