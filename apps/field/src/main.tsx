// The field app (ARCHITECTURE §3, §7–§12): one React codebase, the browser build for testing
// first, then the iPhone and Android in Capacitor (ADR-099). It holds no rule and no payload
// shape of its own: the rules are `packages/domain`'s, the payloads `packages/contracts`'
// (AC-11-06; test/what-it-holds.test.ts). This is the browser build's start: its store and its
// keyring are IndexedDB's under WebCrypto keys (ADR-570, 572); the native builds hand in their own.
// The policy values are the build's (vite.config.ts), held by the domain's Policy (ADR-575).
import { Policy, SignInTries } from '@open-adms/domain';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { PhoneIdentity } from './phone/identity.ts';
import { PhoneLists } from './phone/lists.ts';
import { LoginList } from './phone/login-list.ts';
import { MonitorOnPhone } from './phone/monitor.ts';
import { PhoneOutbox } from './phone/outbox.ts';
import { PasscodeSessions } from './phone/passcode-sessions.ts';
import { PasscodeOnPhone } from './phone/passcode.ts';
import { AddressLookup, BrowserLocator } from './phone/place.ts';
import { PhoneReports } from './phone/reports.ts';
import { PhoneSetup } from './phone/setup.ts';
import { SigningIn } from './phone/signing-in.ts';
import { PhoneSync } from './phone/sync.ts';
import { PhoneTickets } from './phone/tickets.ts';
import { PhoneTurnIn } from './phone/turn-in.ts';
import { Server } from './server.ts';
import { Shell } from './shell.tsx';
import { BrowserKeyring } from './store/browser-keyring.ts';
import { BrowserStore } from './store/browser-store.ts';

const place = document.getElementById('app');
if (place === null) throw new Error('index.html has no element for the app.');

const server = new Server(import.meta.env.ADMS_API_ORIGIN);
const policy = Policy.from(import.meta.env.ADMS_POLICY);
const phone = BrowserStore.opened().then(async (store) => {
  const keyring = new BrowserKeyring();
  const identity = new PhoneIdentity(store, keyring, server);
  const reports = new PhoneReports(store);
  const monitor = new MonitorOnPhone(identity, keyring, reports);
  const lists = new PhoneLists(store, monitor);
  const loginList = new LoginList(store, SignInTries.onPhone(policy));
  const passcode = new PasscodeOnPhone(identity, monitor, loginList, reports);
  const setup = new PhoneSetup(store, identity, monitor, lists, loginList, passcode, reports);
  const outbox = await PhoneOutbox.opened(store, {
    // What a sync says the phone holds: its passcode's check and its lists, and their numbers.
    holding: async () => {
      const [check, held, lastUsed] = await Promise.all([
        loginList.passcode(),
        lists.held(),
        lists.lastUsed(),
      ]);
      return {
        holds: {
          masterPasscodeVersion: check?.version ?? null,
          listsProjectId: held?.assignment.project.id ?? null,
        },
        lastUsed,
      };
    },
    filePartBytesAtMost: policy.mediaPartBytesAtMost,
    fileBytesAtMost: policy.mediaFileBytesAtMost,
    // The keyring first, then the store (NIST SP 800-88; task 3.4.3's turn-in).
    wipe: async () => {
      await keyring.erase();
      await store.erase();
    },
  });
  const sync = new PhoneSync({ store, outbox, monitor, lists, loginList });
  // The tickets begun on the phone (task 3.5.1, ADR-581): a photograph's file the server would
  // never take is never kept.
  const tickets = await PhoneTickets.opened(store, lists, outbox, {
    photoBytesAtMost: policy.mediaFileBytesAtMost,
  });
  return {
    capture: {
      tickets,
      lists,
      locator: new BrowserLocator(),
      lookup: new AddressLookup(monitor),
      waypointsAtMost: policy.fieldEventWaypointsAtMost,
    },
    identity,
    monitor,
    lists,
    loginList,
    outbox,
    sync,
    signingIn: new SigningIn(monitor, lists, loginList, passcode, reports, policy),
    setup,
    passcode,
    sessions: new PasscodeSessions(monitor, lists, loginList, passcode, setup, reports, policy),
    inactivity: {
      lockMinutes: policy.phoneInactivityLockMinutes,
      warningSeconds: policy.phoneInactivityWarningSeconds,
    },
    turnIn: new PhoneTurnIn({ store, identity, outbox, sync }),
    // Erased, the store can't be used again: the page opens afresh, with a new store, at
    // enrolment (AC-11-34).
    reopened: () => {
      window.location.reload();
    },
  };
});

createRoot(place).render(
  <StrictMode>
    <Shell server={server} phone={phone} />
  </StrictMode>,
);
