// The shell's first screen (BACKLOG 3.1.2, put in the look by 3.1.4): what the app is, that this
// build is for testing (AC-11-03), that the phone isn't set up yet, and whether the server
// answers, under the status strip. The phone's setup is Milestone 3.2's.
import { useEffect, useState } from 'react';

import { Banner, StatusStrip } from './look/index.ts';
import type { Server } from './server.ts';
import { words } from './words.ts';

type Reach = keyof typeof words.shell.server;

export function Shell({ server }: { readonly server: Server }) {
  const [reach, setReach] = useState<Reach>('checking');

  useEffect(() => {
    let shown = true;
    void server.answers().then((answers) => {
      if (shown) setReach(answers ? 'answers' : 'unreachable');
    });
    return () => {
      shown = false;
    };
  }, [server]);

  return (
    <main data-screen="shell" className="screen">
      <StatusStrip standing={{ signedIn: null, waiting: 0, lastSent: null, now: new Date() }} />
      <div className="screen-body">
        <h1>{words.app.name}</h1>
        <Banner tone="notice">
          <p>{words.shell.testBuild}</p>
        </Banner>
        <p>{words.shell.notSetUp}</p>
        <p role="status">{words.shell.server[reach]}</p>
      </div>
    </main>
  );
}
