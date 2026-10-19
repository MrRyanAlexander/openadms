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
import { PasscodeSessions } from './phone/passcode-sessions.ts';
import { PasscodeOnPhone } from './phone/passcode.ts';
import { PhoneReports } from './phone/reports.ts';
import { PhoneSetup } from './phone/setup.ts';
import { SigningIn } from './phone/signing-in.ts';
import { Server } from './server.ts';
import { Shell } from './shell.tsx';
import { BrowserKeyring } from './store/browser-keyring.ts';
import { BrowserStore } from './store/browser-store.ts';

const place = document.getElementById('app');
if (place === null) throw new Error('index.html has no element for the app.');

const server = new Server(import.meta.env.ADMS_API_ORIGIN);
const policy = Policy.from(import.meta.env.ADMS_POLICY);
const phone = BrowserStore.opened().then((store) => {
  const keyring = new BrowserKeyring();
  const identity = new PhoneIdentity(store, keyring, server);
  const reports = new PhoneReports(store);
  const monitor = new MonitorOnPhone(identity, keyring, reports);
  const lists = new PhoneLists(store, monitor);
  const loginList = new LoginList(store, SignInTries.onPhone(policy));
  const passcode = new PasscodeOnPhone(identity, monitor, loginList, reports);
  const setup = new PhoneSetup(store, identity, monitor, lists, loginList, passcode, reports);
  return {
    identity,
    monitor,
    lists,
    loginList,
    signingIn: new SigningIn(monitor, lists, loginList, passcode, reports, policy),
    setup,
    passcode,
    sessions: new PasscodeSessions(monitor, lists, loginList, passcode, setup, reports, policy),
    inactivity: {
      lockMinutes: policy.phoneInactivityLockMinutes,
      warningSeconds: policy.phoneInactivityWarningSeconds,
    },
  };
});

createRoot(place).render(
  <StrictMode>
    <Shell server={server} phone={phone} />
  </StrictMode>,
);
