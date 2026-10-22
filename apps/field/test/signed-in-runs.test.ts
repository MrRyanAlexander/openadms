// A signed-in phone's run, as its screens act on it (src/phone/signed-in-runs.ts; AC-02-46,
// AC-11-14, AC-11-27; ADR-603): a session ended on this phone while the run went on, by a
// handover or a sign-out, is that act's to follow, and the run never says the sign-in "has
// ended"; a session the server ended is the run's to say. Here against a server of the test's
// own, its sync held until the test lets it answer; in a real browser, e2e/switching.e2e.ts.
import { syncPhoneEndpoint, type Endpoint } from '@open-adms/contracts';
import { describe, expect, it } from 'vitest';

import { SignedInRuns } from '../src/phone/signed-in-runs.ts';
import type { Asking, Reply } from '../src/server.ts';
import { ana, kim, passwords, phone } from './phone-world.ts';

// Ana signed in online on P1-TWR-LF; the phone's next sync held at the server until released,
// or answered NOT_SIGNED_IN where the server ended her session meanwhile.
async function anasPhone(syncAnswer: 'held' | 'sessionEnded') {
  const held = await phone();
  expect(await held.signingIn.signIn(ana.number, passwords[ana.id] ?? '')).toMatchObject({
    kind: 'signedIn',
  });
  const { promise: released, resolve: release } = Promise.withResolvers<undefined>();
  const { promise: syncReached, resolve: reached } = Promise.withResolvers<undefined>();
  const asked = held.server.ask.bind(held.server);
  held.server.ask = async <E extends Endpoint>(served: E, asking?: Asking): Promise<Reply<E>> => {
    if (served.name === syncPhoneEndpoint.name) {
      reached(undefined);
      if (syncAnswer === 'sessionEnded') return { kind: 'refused', code: 'NOT_SIGNED_IN' };
      await released;
    }
    return asked(served, asking);
  };
  const runs = new SignedInRuns({ sync: held.sync, monitor: held.monitor, lists: held.lists });
  return {
    held,
    runs,
    release: () => {
      release(undefined);
    },
    syncReached,
  };
}

describe('a signed-in phone’s run', () => {
  it('AC-02-46, AC-11-27: Ana hands the phone to Kim while its run is still syncing: her session, dropped by the handover, is the handover’s to follow; the run is overtaken and never says her sign-in has ended', async () => {
    const { held, runs, release, syncReached } = await anasPhone('held');
    const running = runs.run();
    await syncReached;
    // The handover's own step: whoever else is signed in is signed out (setup.ts `passedOn`).
    await held.setup.passedOn(kim.id);
    expect(await held.monitor.signedIn()).toBeUndefined();
    release();
    expect(await running).toEqual({ kind: 'overtaken' });
  });

  it('AC-11-64: Ana signs out while the run goes on: overtaken too', async () => {
    const { held, runs, release, syncReached } = await anasPhone('held');
    const running = runs.run();
    await syncReached;
    await held.monitor.signOut();
    release();
    expect(await running).toEqual({ kind: 'overtaken' });
  });

  it('AC-11-14: the server ended her session (NOT_SIGNED_IN): the run says her sign-in has ended, and she signs in again', async () => {
    const { runs } = await anasPhone('sessionEnded');
    expect(await runs.run()).toEqual({ kind: 'signedOut', why: 'ended' });
  });

  it('AC-11-14: nothing ended: the run reads what it kept, Ana signed in', async () => {
    const { runs, release } = await anasPhone('held');
    release();
    const outcome = await runs.run();
    expect(outcome.kind).toBe('read');
    if (outcome.kind === 'read') expect(outcome.session.userId).toBe(ana.id);
  });
});
