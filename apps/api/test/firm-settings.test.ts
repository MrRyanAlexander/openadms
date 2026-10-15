// The firm's own settings, against the database (REQ-214, 215; ARCHITECTURE §6, §7.4;
// spec/acceptance/10-api-and-sync.md AC-10-83, 85; ADR-170, 412, 511, 520, 530). OWASP ASVS 5.0
// 6.3.3, 8.2.1; API Security Top 10 API5. The real process, in this test's own memory, on the
// installation's database as `adms_api`: it needs `pnpm local:up` after `pnpm installer`, and
// fails saying so. Each test's work is undone (support/database.ts).
import {
  changePhoneKeyHoursEndpoint,
  changeViewerTwoStepEndpoint,
  firmSettingsEndpoint,
  sessionAnswerSchema,
} from '@open-adms/contracts';
import { randomUUID } from 'node:crypto';

import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FirmSettings } from '../src/firm/firm-settings.ts';
import { installationSettings, openInstallation } from './support/database.ts';
import { danasEmail, long, longer, luissEmail, worldOn, type Served } from './support/served.ts';
import { ask, saved, told, viewerSignsIn, type Browser } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

// A write any signed-in person may send (support/served.ts): whether the door lets them through.
const write = (served: Served, signed: Browser) =>
  served.ask('POST', '/test/voids', { ...signed, payload: { status: 'ok' } });

describe('who may read and change them', () => {
  it('AC-10-83 AC-10-27 are read by an admin and a manager/analyst holding Setup; the hours are changed by either; whether viewers need two-step, by an admin alone', async () => {
    await world(async (served, tx, who, within) => {
      const dana = await served.signedIn(danasEmail, long);
      const luis = await served.signedIn(luissEmail, longer);
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      expect(told(await ask(served, undefined, firmSettingsEndpoint))).toEqual([
        401,
        'NOT_SIGNED_IN',
      ]);
      for (const nobody of [luis, viewer]) {
        for (const [served_, more] of [
          [firmSettingsEndpoint, {}],
          [changePhoneKeyHoursEndpoint, { payload: { hours: 48 } }],
          [changeViewerTwoStepEndpoint, { payload: { required: true } }],
        ] as const) {
          expect(told(await ask(served, nobody, served_, more)), served_.name).toEqual([
            403,
            'NOT_ALLOWED',
          ]);
        }
      }
      expect(saved(firmSettingsEndpoint, await ask(served, dana, firmSettingsEndpoint))).toEqual({
        phoneKeyRevokedAfterHours: 24,
        viewerTwoStepRequired: false,
      });
      // Setup opens the hours to Luis, never the viewers' sign-in.
      await tx.userPermission.create({ data: { userId: who.luis, permission: 'SETUP' } });
      expect(told(await ask(served, luis, firmSettingsEndpoint))).toEqual([200, undefined]);
      expect(
        told(await ask(served, luis, changeViewerTwoStepEndpoint, { payload: { required: true } })),
      ).toEqual([403, 'NOT_ALLOWED']);
      const changed = await ask(served, luis, changePhoneKeyHoursEndpoint, {
        payload: { hours: 72, note: 'Our crews work three-day rotations' },
      });
      expect(saved(changePhoneKeyHoursEndpoint, changed)).toEqual({
        phoneKeyRevokedAfterHours: 72,
        viewerTwoStepRequired: false,
      });
      expect(
        await tx.auditRecord.findMany({
          where: { requestId: changed.requestId },
          select: {
            tableName: true,
            actorId: true,
            changedFields: true,
            reason: true,
            domain: true,
          },
        }),
      ).toEqual([
        {
          tableName: 'firm_settings',
          actorId: who.luis,
          changedFields: ['phone_key_revoked_after_hours'],
          reason: 'Our crews work three-day rotations',
          domain: 'SECURITY',
        },
      ]);
      expect(
        saved(
          changePhoneKeyHoursEndpoint,
          await ask(served, dana, changePhoneKeyHoursEndpoint, { payload: { hours: null } }),
        ).phoneKeyRevokedAfterHours,
      ).toBeNull();
    });
  });

  it('AC-10-83 takes whole hours from 1 to a year, or null for off; anything else is refused by the schema', async () => {
    await world(async (served) => {
      const dana = await served.signedIn(danasEmail, long);
      for (const payload of [
        { hours: 0 },
        { hours: 8761 },
        { hours: 1.5 },
        { hours: '24' },
        { hours: 24, off: true },
        {},
      ]) {
        expect(
          told(await ask(served, dana, changePhoneKeyHoursEndpoint, { payload })),
          JSON.stringify(payload),
        ).toEqual([400, 'BAD_REQUEST']);
      }
      for (const hours of [1, 8760]) {
        expect(
          told(await ask(served, dana, changePhoneKeyHoursEndpoint, { payload: { hours } })),
        ).toEqual([200, undefined]);
      }
    });
  });
});

describe('the service asks again inside its own piece of work (ADR-364)', () => {
  it('AC-10-83 called as a manager/analyst without Setup, a read-only viewer, a monitor or nobody on record, it reads nothing and changes nothing; the viewers’ two-step, as anybody but an admin', async () => {
    await world(async (served, tx, who, within) => {
      const service = new FirmSettings(within, served.clock);
      for (const caller of [who.luis, who.viewer, who.kim]) {
        expect(await service.read(caller), caller).toBeUndefined();
        const outcome = await service.changePhoneKeyHours(caller, 48);
        expect(outcome.saved ? 'saved' : outcome.refusal.code, caller).toBe('NOT_ALLOWED');
      }
      await tx.userPermission.create({ data: { userId: who.luis, permission: 'SETUP' } });
      const luis = await service.changeViewerTwoStep(who.luis, true);
      expect(luis.saved ? 'saved' : luis.refusal.code).toBe('NOT_ALLOWED');
      expect(await service.changePhoneKeyHours(who.luis, 48)).toMatchObject({ saved: true });
      expect(
        await tx.firmSettings.findUniqueOrThrow({
          where: { id: 1 },
          select: { phoneKeyRevokedAfterHours: true, viewerTwoStepRequired: true },
        }),
      ).toEqual({ phoneKeyRevokedAfterHours: 48, viewerTwoStepRequired: false });
      // Nobody on record, last: what it states to the database stays for the test's work.
      const nobody = randomUUID();
      expect(await service.read(nobody)).toBeUndefined();
      const outcome = await service.changePhoneKeyHours(nobody, 72);
      expect(outcome.saved ? 'saved' : outcome.refusal.code).toBe('NOT_ALLOWED');
    });
  });
});

describe('the read-only viewers’ two-step', () => {
  it('AC-10-85 required by the firm: a viewer with no authenticator is sent to set one up at their very next request, and goes on once they have; turned off, nobody’s is cleared', async () => {
    await world(async (served, tx, who, within) => {
      const dana = await served.signedIn(danasEmail, long);
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      expect(told(await write(served, viewer))).toEqual([200, undefined]);
      saved(
        changeViewerTwoStepEndpoint,
        await ask(served, dana, changeViewerTwoStepEndpoint, {
          payload: { required: true, note: 'Bayline County asked for it' },
        }),
      );
      // Signed in already: refused at once, as a grant taken away is (AC-02-12).
      expect(told(await write(served, viewer))).toEqual([403, 'TWO_STEP_SETUP_REQUIRED']);
      const current = await served.current(viewer.cookies);
      expect(sessionAnswerSchema.parse(current.body)).toMatchObject({
        twoStepSetUp: false,
        twoStepSetupRequired: true,
      });
      // What setting one up takes is still open to them.
      expect(told(await served.ask('POST', '/two-step/setups', viewer))).toEqual([200, undefined]);
      // Staff and monitors are as they were.
      expect(told(await write(served, dana))).toEqual([200, undefined]);
      // Turned off: the viewer goes on, and nobody's authenticator is touched.
      const authenticators = await tx.userCredential.count({
        where: { twoStepSecret: { not: null } },
      });
      saved(
        changeViewerTwoStepEndpoint,
        await ask(served, dana, changeViewerTwoStepEndpoint, { payload: { required: false } }),
      );
      expect(told(await write(served, viewer))).toEqual([200, undefined]);
      expect(await tx.userCredential.count({ where: { twoStepSecret: { not: null } } })).toBe(
        authenticators,
      );
    });
  });
});
