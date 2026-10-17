// The device key's own actor, and the challenge a phone answered (ARCHITECTURE §5.3, §7.4,
// §9 (1); spec/acceptance/10-api-and-sync.md AC-10-45, 46; spec/THREAT-MODEL.md T-02, T-11;
// ADR-437, 440; BACKLOG C110, C111; REQ-202a): a phone proves itself before anybody on it is
// known to the server, so what is written then is written as a user that is no person. Only
// the API states it, only for a phone, always naming the phone; nobody changes its row; no
// record names it. Which challenge a phone last answered is written by that phone's own proof
// alone, only ever later, and never once its key is revoked.
import { describe, expect, it } from 'vitest';

import { deviceKeyActorId, deviceKeyActorName } from '../src/device-key-actor.ts';
import { masterPasscodeActorId } from '../src/master-passcode-actor.ts';
import { systemActorId } from '../src/system-actor.ts';
import { refusedBy } from './support/database.ts';
import { deviceKeyLike } from './support/device-keys.ts';
import { insertOf, projectLike } from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';
import { columnsNamingAUser } from './support/master-passcode-actor.ts';

const tested = eachTestRolledBack();

// Shaped like an Argon2id hash (a PHC string); nothing hashes to it.
const aHash = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA';

const answered = `UPDATE "device" SET "last_answered_challenge_made_at" = $2 WHERE "id" = $1`;

const newProject = (): [string, unknown[]] => insertOf('project', projectLike(tested.world));

async function auditedFor(
  recordId: string,
): Promise<
  { actor: string; source: string; device: string | null; domain: string; changed: string[] }[]
> {
  const { db } = tested;
  await db.administer();
  return db.rows(
    `SELECT "actor_id"::text AS actor, "source"::text AS source, "device_id"::text AS device,
            "domain"::text AS domain, "changed_fields" AS changed
     FROM "audit_record" WHERE "record_id" = $1 ORDER BY "id"`,
    [recordId],
  );
}

// As the API, for the phone that proved itself.
async function asThePhone(deviceId: string): Promise<void> {
  const { db } = tested;
  await db.as('adms_api');
  await db.actor(deviceKeyActorId, 'DEVICE', { deviceId, requestId: 'req-proof-1' });
}

describe("a phone's own act is written as the device key's actor", () => {
  it("AC-10-45 the seed made it: one user, role DEVICE_KEY, nobody's person", async () => {
    const { db } = tested;
    expect(
      await db.rows(
        `SELECT "id"::text AS id, "name", "monitor_number", "email", "phone", "contractor_id",
                "employer_id", "viewer_kind", "archived_at"
         FROM "user" WHERE "role" = 'DEVICE_KEY'`,
      ),
    ).toEqual([
      {
        id: deviceKeyActorId,
        name: deviceKeyActorName,
        monitor_number: null,
        email: null,
        phone: null,
        contractor_id: null,
        employer_id: null,
        viewer_kind: null,
        archived_at: null,
      },
    ]);
    // Made by the system actor, as the seed's other rows are.
    expect(
      (await auditedFor(deviceKeyActorId)).map(({ actor, source }) => [actor, source]),
    ).toEqual([[systemActorId, 'SYSTEM']]);
  });

  it('AC-10-45 the API writes which challenge P1-COL-1 answered as it, for that phone, and the audit log says so', async () => {
    const { db, world } = tested;
    await asThePhone(world.device);
    expect(await db.run(answered, [world.device, '2026-10-12T16:05:00.000Z'])).toBe(1);
    expect((await auditedFor(world.device)).at(-1)).toEqual({
      actor: deviceKeyActorId,
      source: 'DEVICE',
      device: world.device,
      domain: 'SECURITY',
      changed: ['last_answered_challenge_made_at'],
    });
  });

  it('only for a phone, and only naming it: any other source, or no phone, is refused', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    for (const source of ['BACK_OFFICE', 'SYSTEM'] as const) {
      await db.actor(deviceKeyActorId, source, { deviceId: world.device });
      const refusal = await db.refused(...newProject());
      expect(refusal.code, source).toBe(refusedBy.grant);
      if (source === 'BACK_OFFICE') {
        expect(refusal.message).toBe(
          "The device key's actor writes only for a phone: source BACK_OFFICE may not be stated with it (a write to project)",
        );
      }
    }
    await db.actor(deviceKeyActorId, 'DEVICE');
    expect(await db.refused(...newProject())).toEqual({
      code: refusedBy.grant,
      message:
        "The device key's actor writes only for the phone whose key it is: state adms.device_id with it (a write to project)",
    });
  });

  it('only the API: the worker, the owner and the server’s superuser are refused it', async () => {
    const { db, world } = tested;
    const refusal = (login: string, table: string) => ({
      code: refusedBy.grant,
      message: `Only the API writes as the device key's actor: ${login} may not state it (a write to ${table})`,
    });
    await db.as('adms_worker');
    await db.actor(deviceKeyActorId, 'DEVICE', { deviceId: world.device });
    expect(
      await db.refused(`UPDATE "field_event" SET "status" = 'COMPLETED' WHERE "id" = $1`, [
        world.loads.l101001.disposal,
      ]),
    ).toEqual(refusal('adms_worker', 'field_event'));
    await db.as('adms_owner');
    await db.actor(deviceKeyActorId, 'DEVICE', { deviceId: world.device });
    expect(await db.refused(...newProject())).toEqual(refusal('adms_owner', 'project'));
    await db.administer();
    await db.actor(deviceKeyActorId, 'DEVICE', { deviceId: world.device });
    expect(await db.refused(...newProject())).toEqual(refusal('postgres', 'project'));
  });
});

describe("the device key's actor's row", () => {
  it('no runtime login may change it', async () => {
    const { db, world } = tested;
    const changes = [
      `UPDATE "user" SET "name" = 'P1-COL-1' WHERE "id" = $1`,
      `UPDATE "user" SET "role" = 'ADMIN' WHERE "id" = $1`,
      `UPDATE "user" SET "archived_at" = now() WHERE "id" = $1`,
      `UPDATE "user" SET "id" = uuidv7() WHERE "id" = $1`,
      `UPDATE "user" SET "email" = 'adms@gates.example' WHERE "id" = $1`,
    ];
    for (const sql of changes) {
      await db.as('adms_api');
      await db.actor(world.admin, 'BACK_OFFICE');
      expect(await db.refused(sql, [deviceKeyActorId]), `adms_api: ${sql}`).toEqual({
        code: refusedBy.grant,
        message: "The device key's actor can't be changed: adms_api may not update it",
      });
      await db.administer();
      await db.actor(world.admin, 'BACK_OFFICE');
      expect(await db.refused(sql, [deviceKeyActorId]), `superuser: ${sql}`).toEqual({
        code: refusedBy.grant,
        message: "The device key's actor can't be changed: postgres may not update it",
      });
    }
    expect(await auditedFor(deviceKeyActorId)).toHaveLength(1);
  });

  it('nobody but the seed makes a DEVICE_KEY user, or takes its id', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
    const message =
      "Only the installer's seed makes the device key's actor: adms_api may not write role DEVICE_KEY or its id";
    const attempts: [string, unknown[]][] = [
      [`INSERT INTO "user" ("name", "role") VALUES ('Device key 2', 'DEVICE_KEY')`, []],
      [`UPDATE "user" SET "role" = 'DEVICE_KEY' WHERE "id" = $1`, [world.monitor]],
    ];
    for (const [sql, values] of attempts) {
      expect(await db.refused(sql, values), sql).toEqual({ code: refusedBy.grant, message });
    }
  });

  it("the owner's migrations pass the trigger, never the check: the role is one id, never a person", async () => {
    const { db, world } = tested;
    await db.as('adms_owner');
    await db.actor(world.admin, 'BACK_OFFICE');
    const attempts: [string, unknown[]][] = [
      [
        `INSERT INTO "user" ("name", "role", "monitor_number") VALUES ('Second key', 'DEVICE_KEY', NULL)`,
        [],
      ],
      [`UPDATE "user" SET "role" = 'DEVICE_KEY' WHERE "id" = $1`, [world.monitor]],
      ...[
        `"role" = 'ADMIN'`,
        `"monitor_number" = 'M004199'`,
        `"contractor_id" = '${world.coastline}'`,
        `"employer_id" = '${world.coastline}'`,
        `"email" = 'adms@gates.example'`,
        `"phone" = '555-0142'`,
        `"archived_at" = now()`,
      ].map((change): [string, unknown[]] => [
        `UPDATE "user" SET ${change} WHERE "id" = $1`,
        [deviceKeyActorId],
      ]),
    ];
    const refusals = [];
    for (const [sql, values] of attempts) refusals.push(await db.refused(sql, values));
    for (const refusal of refusals) {
      expect(refusal.code, refusal.message).toBe(refusedBy.check);
      expect(refusal.message).toContain('"user_device_key_actor_check"');
    }
  });
});

describe('no record names it', () => {
  it('every column that names a user refuses it, but the audit record’s actor', async () => {
    const { db } = tested;
    const checks = await db.rows<{ conname: string }>(
      `SELECT conname FROM pg_constraint
       WHERE conname LIKE '%\\_not\\_device\\_key\\_check' AND connamespace = 'public'::regnamespace
       ORDER BY conname`,
    );
    expect(checks.map((check) => check.conname)).toEqual(
      columnsNamingAUser.map(([table, column]) => `${table}_${column}_not_device_key_check`).sort(),
    );
  });

  it('it holds no permission, signs in nowhere, and is nobody’s monitor or author', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
    const attempts: [string, string, unknown[]][] = [
      [
        'user_permission_user_id',
        `INSERT INTO "user_permission" ("user_id", "permission") VALUES ($1, 'VOID')`,
        [deviceKeyActorId],
      ],
      [
        'user_credential_user_id',
        `INSERT INTO "user_credential" ("user_id", "password_hash") VALUES ($1, $2)`,
        [deviceKeyActorId, aHash],
      ],
      [
        'session_user_id',
        `INSERT INTO "session" ("user_id", "refresh_token_hash", "expires_at")
         VALUES ($1, repeat('a', 64), now() + interval '1 hour')`,
        [deviceKeyActorId],
      ],
      [
        'security_event_user_id',
        `INSERT INTO "security_event" ("kind", "user_id", "occurred_at")
         VALUES ('MASTER_PASSCODE_USE', $1, now())`,
        [deviceKeyActorId],
      ],
      [
        'field_event_monitor_id',
        `UPDATE "field_event" SET "monitor_id" = $1 WHERE "id" = $2`,
        [deviceKeyActorId, world.loads.l101001.disposal],
      ],
      ['assignment_person_id', `UPDATE "assignment" SET "person_id" = $1`, [deviceKeyActorId]],
    ];
    for (const [named, sql, values] of attempts) {
      const refusal = await db.refused(sql, values);
      expect(refusal.code, named).toBe(refusedBy.check);
      expect(refusal.message).toContain(`"${named}_not_device_key_check"`);
    }
  });
});

describe('the challenge a phone last proved itself with', () => {
  const goodOnce = {
    code: refusedBy.trigger,
    message: 'A challenge is good once: a phone answers only one made after the last it answered',
  };
  const notItsOwn = {
    code: refusedBy.grant,
    message: "Only a phone's own proof says which challenge it answered",
  };

  it('AC-10-45 moves only later: an older challenge, or none, is refused', async () => {
    const { db, world } = tested;
    await asThePhone(world.device);
    expect(await db.run(answered, [world.device, '2026-10-12T16:05:00.000Z'])).toBe(1);
    // The same moment written again changes nothing, and nothing is audited: the phone's
    // enrolment and the one proof are all its record holds.
    expect(await db.run(answered, [world.device, '2026-10-12T16:05:00.000Z'])).toBe(1);
    expect(await auditedFor(world.device)).toHaveLength(2);
    await asThePhone(world.device);
    for (const older of ['2026-10-12T16:04:59.999Z', null]) {
      expect(await db.refused(answered, [world.device, older]), String(older)).toEqual(goodOnce);
    }
    // One made a millisecond later is taken.
    expect(await db.run(answered, [world.device, '2026-10-12T16:05:00.001Z'])).toBe(1);
  });

  it('AC-10-45 is written by that phone’s own proof alone: not by a person, the master passcode, or another phone’s proof', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
    expect(await db.refused(answered, [world.device, '2026-10-12T16:05:00Z'])).toEqual(notItsOwn);
    await db.actor(masterPasscodeActorId, 'DEVICE', { deviceId: world.device });
    expect(await db.refused(answered, [world.device, '2026-10-12T16:05:00Z'])).toEqual(notItsOwn);
    await asThePhone(world.certifyingDevice);
    expect(await db.refused(answered, [world.device, '2026-10-12T16:05:00Z'])).toEqual(notItsOwn);
    // And a phone is enrolled having answered none.
    await db.actor(masterPasscodeActorId, 'DEVICE');
    expect(
      await db.refused(
        `INSERT INTO "device" ("name", "public_key", "master_passcode_version", "last_answered_challenge_made_at")
         VALUES ('P1-UR-1', $1, 1, '2026-10-12T16:05:00Z')`,
        [deviceKeyLike('jo-kim')],
      ),
    ).toEqual({
      code: refusedBy.trigger,
      message: 'A phone is enrolled having answered no challenge',
    });
  });

  it('AC-10-46 a phone taken out of service still proves itself; one whose key is revoked proves nothing', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
    // Luis marks P1-COL-1 lost at 6:10 pm on Monday.
    await db.run(
      `UPDATE "device" SET "status" = 'LOST', "out_of_service_at" = '2026-10-12T22:10:00Z', "out_of_service_marked_at" = '2026-10-12T22:10:00Z' WHERE "id" = $1`,
      [world.device],
    );
    await asThePhone(world.device);
    expect(await db.run(answered, [world.device, '2026-10-13T12:00:00Z'])).toBe(1);
    // It synced, everything on it was confirmed, and it was turned in on Wednesday: its key is
    // revoked, by its turn-in alone (ADR-488).
    await db.actor(masterPasscodeActorId, 'DEVICE', { deviceId: world.device });
    await db.run(
      `UPDATE "device" SET "key_revoked_at" = '2026-10-14T13:30:00Z', "key_revoked_by" = 'TURN_IN' WHERE "id" = $1`,
      [world.device],
    );
    await asThePhone(world.device);
    expect(await db.refused(answered, [world.device, '2026-10-14T14:00:00Z'])).toEqual({
      code: refusedBy.trigger,
      message: 'A phone whose key is revoked proves nothing',
    });
  });
});

describe('a device key as the database keeps it', () => {
  it('AC-10-44 is written as a P-256 public key is, and as nothing else', async () => {
    const { db } = tested;
    await db.as('adms_api');
    await db.actor(masterPasscodeActorId, 'DEVICE');
    const enrol = `INSERT INTO "device" ("name", "public_key", "master_passcode_version") VALUES ('P1-UR-1', $1, 1)`;
    const key = deviceKeyLike('jo-kim');
    const refused = {
      'a made-up string': 'story-key-p1-ur-1',
      'no key at all': 'c3RvcnktUDEtQ09MLTE=',
      'cut short': key.slice(0, -4),
      'with something after it': `${key}AAAA`,
      // An RSA key's SubjectPublicKeyInfo begins otherwise.
      'another kind of key': `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A${key.slice(32)}`,
      'in the URL’s alphabet': `${key.slice(0, -3)}-==`,
    };
    for (const [what, sent] of Object.entries(refused)) {
      const refusal = await db.refused(enrol, [sent]);
      expect(refusal.code, what).toBe(refusedBy.check);
      expect(refusal.message, what).toContain('"device_public_key_check"');
    }
    expect(await db.run(enrol, [key])).toBe(1);
  });
});
