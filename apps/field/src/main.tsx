// The field app (ARCHITECTURE §3, §7–§12): one React codebase, the browser build for testing
// first, then the iPhone and Android in Capacitor (ADR-099). It holds no rule and no payload
// shape of its own: the rules are `packages/domain`'s, the payloads `packages/contracts`'
// (AC-11-06; test/what-it-holds.test.ts).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Server } from './server.ts';
import { Shell } from './shell.tsx';

const place = document.getElementById('app');
if (place === null) throw new Error('index.html has no element for the app.');

createRoot(place).render(
  <StrictMode>
    <Shell server={new Server(import.meta.env.ADMS_API_ORIGIN)} />
  </StrictMode>,
);
