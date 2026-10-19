// A monitor created (ADR-105, 120, 442, 572; AC-02-07): the Monitor ID the server issued, which is
// their username, said with their name as the server kept it. Never their password.
import type { MonitorCreatedAnswer } from '@open-adms/contracts';

import { Banner, Button, StatusStrip } from './look/index.ts';
import { say, words } from './words.ts';

export function MonitorCreated({
  created,
  onAnother,
  onDone,
}: {
  readonly created: MonitorCreatedAnswer;
  readonly onAnother: () => void;
  readonly onDone: () => void;
}) {
  const said = words.monitorCreated;
  return (
    <main data-screen="monitor-created" className="screen">
      <StatusStrip standing={{ signedIn: null, waiting: 0, lastSent: null, now: new Date() }} />
      <div className="screen-body">
        <h1>{said.title}</h1>
        <Banner tone="good">
          <p>{say(said.monitorId, { name: created.name, monitorNumber: created.monitorNumber })}</p>
        </Banner>
        <p>{said.username}</p>
      </div>
      <div className="screen-actions">
        <Button main wide onPress={onDone}>
          {said.done}
        </Button>
        <Button wide onPress={onAnother}>
          {said.another}
        </Button>
      </div>
    </main>
  );
}
