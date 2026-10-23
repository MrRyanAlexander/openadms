// The worker's start (BACKLOG 2.3.2; ADR-419): `node apps/worker/dist/main.js`, in its container.
// The settings are read and checked before anything is opened; a missing or malformed one stops
// the start and names its key, never its value (AC-10-55); a policy value the installation
// states for itself is read with them and held the same way (ADR-395). Then it drains the queue
// until it is told to stop: the pass under way finishes first.
import { openDatabase } from '@open-adms/db';
import type { Policy } from '@open-adms/domain';

import { MapServers } from './mileage/map-servers.ts';
import { Mileages } from './mileage/mileages.ts';
import { PhoneKeyBackstop } from './phones/phone-keys.ts';
import { Health } from './process/health.ts';
import { JobLoop } from './process/job-loop.ts';
import { WorkerLog } from './process/logs.ts';
import { installationPolicy } from './process/policy.ts';
import { Settings, SettingsProblem } from './process/settings.ts';
import { Reconciliation } from './reconciliation/reconciliation.ts';

let settings: Settings;
let policy: Policy;
try {
  const environment = Settings.environment(process.env);
  settings = Settings.from(environment);
  policy = installationPolicy(environment);
} catch (problem) {
  if (!(problem instanceof SettingsProblem)) throw problem;
  console.error(JSON.stringify({ level: 60, service: 'worker', msg: problem.message }));
  process.exit(1);
}

const log = new WorkerLog(process.stdout, settings.logLevel);
const db = openDatabase({
  url: settings.databaseUrl,
  maxConnections: policy.databasePoolConnections,
  pieceOfWork: { waitMs: policy.databaseConnectionWaitMs, longestMs: policy.databaseWorkLongestMs },
});
const reconciliation = new Reconciliation(
  db,
  { now: () => new Date() },
  {
    crewItemHoursLimit: policy.crewDayHours,
    deviceClockOffLimitMinutes: policy.deviceClockOffLimitMinutes,
    longestRunMs: policy.reconciliationRunLongestMinutes * 60_000,
  },
  new Mileages(
    new MapServers({
      routing: settings.routingUrl,
      addresses: settings.addressesUrl,
      caFile: settings.mapCaFile,
      mapDataSha256: settings.mapExtractSha256,
      timeoutMs: policy.mapServerAnswerSeconds * 1_000,
      ...(settings.mapServersAt === undefined ? {} : { at: settings.mapServersAt }),
    }),
  ),
);
const loop = new JobLoop(
  db,
  reconciliation,
  {
    triesBeforeSetAside: policy.jobTriesBeforeSetAside,
    ticketsARun: policy.jobTicketsAtMost,
    pollMs: policy.jobQueuePollSeconds * 1_000,
    stalledAfterMs: JobLoop.stalledAfterMs(policy),
  },
  log,
  { now: () => new Date() },
  new PhoneKeyBackstop(db, log, { now: () => new Date() }),
);
const health = new Health(() => loop.standing);
await health.listen(settings.host, settings.port);
log.info('The worker started.');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    log.info('The worker was told to stop: the pass under way finishes first.');
    loop.stop();
  });
}
await loop.run();
await health.close();
await db.$disconnect();
log.info('The worker stopped.');
