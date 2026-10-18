// The shell's first screen (BACKLOG 3.1.2): what the app is, that this build is for testing
// (AC-11-03), that the phone isn't set up yet, and whether the server answers. Task 3.1.4 puts
// it in the look; the phone's setup is Milestone 3.2's.
import { useEffect, useState } from 'react';

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
    <main>
      <h1>{words.app.name}</h1>
      <p>{words.shell.testBuild}</p>
      <p>{words.shell.notSetUp}</p>
      <p role="status">{words.shell.server[reach]}</p>
    </main>
  );
}
