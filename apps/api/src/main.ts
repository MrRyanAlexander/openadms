// The API's start (BACKLOG 2.1.2; ADR-385): `node apps/api/dist/main.js`, in its container. The
// settings are read and checked before anything listens; a missing or malformed one stops the
// start and names its key, never its value (AC-10-55).
import { builtInPolicy } from './policy.ts';
import { ApiModule } from './process/api-module.ts';
import { ApiProcess } from './process/api-process.ts';
import { Settings, SettingsProblem } from './process/settings.ts';

let settings: Settings;
try {
  settings = Settings.read(process.env);
} catch (problem) {
  if (!(problem instanceof SettingsProblem)) throw problem;
  console.error(JSON.stringify({ level: 60, service: 'api', msg: problem.message }));
  process.exit(1);
}

const api = await ApiProcess.create(ApiModule, settings, builtInPolicy());
await api.listen();
