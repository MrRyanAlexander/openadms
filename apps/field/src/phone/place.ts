// Where a field event happened (adms-field-app §4A.4; BACKLOG 3.5.1, C121, C176; AC-04-24,
// AC-11-37, 68; ADR-083, 111, 119, 571, 581): whatever fix the phone has when the monitor asks, and
// the street address our own address server finds there.
//
// - **Whatever fix it has** (ADR-083; AC-11-37): the phone's place is asked when the monitor
//   captures one (a ticket opened, "Capture GPS", "Mark waypoint", a photograph), a fix it already
//   holds taken as it is; it never judges the fix's accuracy and never holds the work for a better
//   one. No fix in a few seconds, or the place refused by the monitor, and there is none: the work
//   goes on, and the screen says so (AC-11-68). It is never read at any other time.
// - **A fix is two exact decimal strings of eight places** (invariant 15), as the sync contract and
//   the address lookup take it (C121).
// - **"Look up address"** asks the API, which asks our address server (ADR-119, 455): the street
//   number and name found, `LOOKED_UP`; none found, or no answer, and it asks once more on no
//   answer, then the monitor types the street number and name, `TYPED` (C121).
import { phoneAddressLookupEndpoint } from '@open-adms/contracts';

import type { Reply } from '../server.ts';
import type { MonitorOnPhone } from './monitor.ts';
import type { Fix } from './tickets.ts';

// How long the phone waits for a fix it doesn't already hold, and how old one it holds may be.
// *Agent defaults* (ADR-581): a few seconds is what a monitor waits at the curb.
const fixWaitMs = 4000;
const fixAgeMs = 60_000;

// What asking the phone's place came to: a fix, none in time, or the place refused.
export type Placed =
  | { readonly kind: 'fix'; readonly fix: Fix }
  | { readonly kind: 'none' }
  | { readonly kind: 'refused' };

// What the lookup came to: an address, none there, or no answer twice.
export type LookedUp =
  | { readonly kind: 'found'; readonly address: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'unanswered' };

// The phone's place, as the browser gives it: its own Permissions-Policy lets the app's own page
// ask (C176).
export interface Locator {
  where(): Promise<Placed>;
}

export class BrowserLocator implements Locator {
  where(): Promise<Placed> {
    if (!('geolocation' in navigator)) return Promise.resolve({ kind: 'none' });
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          resolve({
            kind: 'fix',
            fix: {
              latitude: coords.latitude.toFixed(8),
              longitude: coords.longitude.toFixed(8),
            },
          });
        },
        (failed) => {
          resolve({ kind: failed.code === failed.PERMISSION_DENIED ? 'refused' : 'none' });
        },
        { enableHighAccuracy: true, timeout: fixWaitMs, maximumAge: fixAgeMs },
      );
    });
  }
}

export class AddressLookup {
  private readonly monitor: MonitorOnPhone;

  constructor(monitor: MonitorOnPhone) {
    this.monitor = monitor;
  }

  async at(fix: Fix): Promise<LookedUp> {
    const asked = () =>
      this.monitor.ask(phoneAddressLookupEndpoint, {
        json: { latitude: fix.latitude, longitude: fix.longitude },
      });
    const first = await asked();
    const again =
      first.kind === 'unreachable' ||
      (first.kind === 'answered' && first.answer.noAddress === 'NOT_ANSWERED');
    const reply: Reply<typeof phoneAddressLookupEndpoint> = again ? await asked() : first;
    if (reply.kind !== 'answered') return { kind: 'unanswered' };
    const { address, noAddress } = reply.answer;
    if (address !== null) return { kind: 'found', address };
    return noAddress === 'NOT_ANSWERED' ? { kind: 'unanswered' } : { kind: 'none' };
  }
}
