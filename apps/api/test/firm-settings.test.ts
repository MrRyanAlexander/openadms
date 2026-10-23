// The firm's own settings, against the database (REQ-214, 215; ARCHITECTURE §6, §7.4;
// spec/acceptance/10-api-and-sync.md AC-10-83, 85; ADR-170, 412, 511, 520, 530, 531). OWASP ASVS 5.0
// 6.3.3, 8.2.1; API Security Top 10 API5. The real process, in this test's own memory, on the
// installation's database as `adms_api`: it needs `pnpm local:up` after `pnpm installer`, and
// fails saying so. Each test's work is undone (support/database.ts).
import {
  brandEndpoint,
  changeBrandNameEndpoint,
  changeMonitorSessionHoursEndpoint,
  changePhoneKeyHoursEndpoint,
  changeReportContactEndpoint,
  changeViewerTwoStepEndpoint,
  firmSettingsEndpoint,
  monitorCreatedAnswerSchema,
  monitorSignedInAnswerSchema,
  requestPasswordResetEndpoint,
  sessionAnswerSchema,
} from '@open-adms/contracts';
import { builtOn, builtOnLine } from '@open-adms/domain';
import { randomUUID } from 'node:crypto';

import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FirmSettings } from '../src/firm/firm-settings.ts';
import { releaseVersion } from '../src/process/release.ts';
import { installationSettings, openInstallation } from './support/database.ts';
import { enrolledPhone, passcode, proven } from './support/phones.ts';
import { Outbox } from './support/sign-in.ts';
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
          [changeReportContactEndpoint, { payload: { email: 'reports@gates.example' } }],
          [changeBrandNameEndpoint, { payload: { name: 'Gates ADMS' } }],
          [changeViewerTwoStepEndpoint, { payload: { required: true } }],
          [changeMonitorSessionHoursEndpoint, { payload: { hours: 12 } }],
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
        monitorSessionHours: 24,
        reportContactEmail: null,
        brandName: 'Open ADMS',
      });
      // Setup opens the hours to Luis, never the viewers' sign-in.
      await tx.userPermission.create({ data: { userId: who.luis, permission: 'SETUP' } });
      expect(told(await ask(served, luis, firmSettingsEndpoint))).toEqual([200, undefined]);
      expect(
        told(await ask(served, luis, changeViewerTwoStepEndpoint, { payload: { required: true } })),
      ).toEqual([403, 'NOT_ALLOWED']);
      // Nor how long a monitor's sign-in lasts: an admin's alone (ADR-531).
      expect(
        told(
          await ask(served, luis, changeMonitorSessionHoursEndpoint, { payload: { hours: 12 } }),
        ),
      ).toEqual([403, 'NOT_ALLOWED']);
      const changed = await ask(served, luis, changePhoneKeyHoursEndpoint, {
        payload: { hours: 72, note: 'Our crews work three-day rotations' },
      });
      expect(saved(changePhoneKeyHoursEndpoint, changed)).toEqual({
        phoneKeyRevokedAfterHours: 72,
        viewerTwoStepRequired: false,
        monitorSessionHours: 24,
        reportContactEmail: null,
        brandName: 'Open ADMS',
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
      // Nor how long a monitor's sign-in lasts, Setup or not: an admin's alone (ADR-531).
      const hours = await service.changeMonitorSessionHours(who.luis, 12);
      expect(hours.saved ? 'saved' : hours.refusal.code).toBe('NOT_ALLOWED');
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

describe('AC-10-91 how long a monitor’s sign-in on a phone lasts (ADR-531)', () => {
  it('a day as shipped; an admin sets it from 1 to 24 hours, audited with their note; a sign-in made after reads it, one already open keeps its end', async () => {
    await world(async (served, tx) => {
      const dana = await served.signedIn(danasEmail, long);
      for (const hours of [0, 25]) {
        expect(
          told(await ask(served, dana, changeMonitorSessionHoursEndpoint, { payload: { hours } })),
          String(hours),
        ).toEqual([400, 'BAD_REQUEST']);
      }
      const changed = await ask(served, dana, changeMonitorSessionHoursEndpoint, {
        payload: { hours: 14, note: 'Our shifts end by eight at night' },
      });
      expect(saved(changeMonitorSessionHoursEndpoint, changed).monitorSessionHours).toBe(14);
      expect(
        await tx.auditRecord.findMany({
          where: { requestId: changed.requestId },
          select: { tableName: true, changedFields: true, reason: true, domain: true },
        }),
      ).toEqual([
        {
          tableName: 'firm_settings',
          changedFields: ['monitor_session_hours'],
          reason: 'Our shifts end by eight at night',
          domain: 'SECURITY',
        },
      ]);
      // A monitor signs in on a phone: the session lasts the firm's hours now.
      const phone = await enrolledPhone(served, tx, 'P1-COL-1');
      const token = await proven(served, phone);
      const made = await served.ask('POST', '/phones/current/monitors', {
        bearer: token,
        payload: { name: 'Lee Morgan', password: '5550142', passcode },
      });
      expect(told(made)).toEqual([200, undefined]);
      const { monitorNumber } = monitorCreatedAnswerSchema.parse(made.body);
      const signedIn = await served.ask('POST', '/phones/current/sign-ins', {
        bearer: token,
        payload: { monitorNumber, password: '5550142' },
      });
      expect(monitorSignedInAnswerSchema.parse(signedIn.body).expiresInSeconds).toBe(14 * 3600);
    });
  });
});

describe('REQ-410 where a reader of the firm’s reports writes', () => {
  it('none as shipped; set by whoever sets the firm up, audited with their note, and cleared with null; an address that isn’t one is refused by the schema', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      const changed = await ask(served, dana, changeReportContactEndpoint, {
        payload: { email: 'reports@gates.example', note: 'The reports desk' },
      });
      expect(saved(changeReportContactEndpoint, changed).reportContactEmail).toBe(
        'reports@gates.example',
      );
      expect(
        await tx.auditRecord.findMany({
          where: { requestId: changed.requestId },
          select: { tableName: true, actorId: true, changedFields: true, reason: true },
        }),
      ).toEqual([
        {
          tableName: 'firm_settings',
          actorId: who.dana,
          changedFields: ['report_contact_email'],
          reason: 'The reports desk',
        },
      ]);
      expect(
        told(
          await ask(served, dana, changeReportContactEndpoint, {
            payload: { email: 'not an address' },
          }),
        ),
      ).toEqual([400, 'BAD_REQUEST']);
      const cleared = await ask(served, dana, changeReportContactEndpoint, {
        payload: { email: null },
      });
      expect(saved(changeReportContactEndpoint, cleared).reportContactEmail).toBeNull();
    });
  });
});

describe('what the firm calls its ADMS', () => {
  it('is the product’s own name as shipped; set by whoever sets the firm up, audited with their note and the name it was; trimmed, and refused by the schema when it is empty, over forty characters or has a control character', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      const changed = await ask(served, dana, changeBrandNameEndpoint, {
        payload: { name: '  Gates ADMS ', note: 'The client’s name for it' },
      });
      expect(saved(changeBrandNameEndpoint, changed).brandName).toBe('Gates ADMS');
      expect(
        await tx.auditRecord.findMany({
          where: { requestId: changed.requestId },
          select: {
            tableName: true,
            actorId: true,
            changedFields: true,
            reason: true,
          },
        }),
      ).toEqual([
        {
          tableName: 'firm_settings',
          actorId: who.dana,
          changedFields: ['brand_name'],
          reason: 'The client’s name for it',
        },
      ]);
      // The name it was is kept in the audit log, in full.
      const [audited] = await tx.auditRecord.findMany({
        where: { requestId: changed.requestId },
        select: { priorValue: true },
      });
      expect((audited?.priorValue as { brand_name?: string } | null)?.brand_name).toBe('Open ADMS');
      for (const name of ['', '   ', 'x'.repeat(41), 'Gates\nADMS']) {
        expect(
          told(await ask(served, dana, changeBrandNameEndpoint, { payload: { name } })),
          JSON.stringify(name),
        ).toEqual([400, 'BAD_REQUEST']);
      }
    });
  });

  it('is read by anybody, with the release it is built on, and nothing else: no sign-in, no setting', async () => {
    await world(async (served) => {
      const dana = await served.signedIn(danasEmail, long);
      const read = async () => ask(served, undefined, brandEndpoint);
      expect(saved(brandEndpoint, await read())).toEqual({
        name: 'Open ADMS',
        version: releaseVersion(),
      });
      saved(
        changeBrandNameEndpoint,
        await ask(served, dana, changeBrandNameEndpoint, {
          payload: { name: 'Gates ADMS' },
        }),
      );
      expect(saved(brandEndpoint, await read())).toEqual({
        name: 'Gates ADMS',
        version: releaseVersion(),
      });
    });
  });

  it('is the name in the firm’s mail, with the line that says which Open ADMS it is built on; the product’s own until the firm names it', async () => {
    const outbox = new Outbox();
    await world(async (served) => {
      const dana = await served.signedIn(danasEmail, long);
      const reset = () =>
        ask(served, undefined, requestPasswordResetEndpoint, { payload: { email: luissEmail } });
      await reset();
      saved(
        changeBrandNameEndpoint,
        await ask(served, dana, changeBrandNameEndpoint, { payload: { name: 'Gates ADMS' } }),
      );
      await reset();
      const [before, after] = outbox.sent.filter(({ subject }) => subject.startsWith('Reset your'));
      expect(before?.subject).toBe('Reset your Open ADMS password');
      expect(after?.subject).toBe('Reset your Gates ADMS password');
      expect(after?.text).toContain(
        'Somebody asked to reset the password of your Gates ADMS login.',
      );
      expect(after?.text).not.toContain('your Open ADMS login');
      expect(after?.text.trimEnd().split('\n').at(-1)).toBe(
        `${builtOnLine(releaseVersion())} (${builtOn.licence}). Source: ${builtOn.source}`,
      );
    }, outbox);
  });
});
