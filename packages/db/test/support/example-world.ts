// The example world (spec/CONVENTIONS.md §6), as the rows the guards are tested on. Built by the
// server's administrator inside the test's rolled-back work, with Dana Reyes stated as the actor,
// so its own inserts are audited like any other. New ids every time, so it never meets real rows.
//
//   P1 "Bayline County ROW, Hurricane Delphine": loads 101001 (Coastline) and 101002 (Summit)
//   P2 "Bayline County PPDR, Hurricane Delphine": load 102001 (Coastline)
// Each load is a collection and a disposal event (load call at the tower), its completed load and
// one transaction for its prime. Nothing is locked as invoiced; a test locks what it needs.
// Ana Brooks records every event here, on the one phone, under her assignment on each project
// (Monday 12 October 2026, written on the board by Dana); P1's site is the Marsh Road TDSR. The
// phone holds version 1 of the master passcode, which the installer's seed keeps (ADR-281).
import { systemActorId } from '../../src/system-actor.ts';
import type { GuardedDatabase } from './database.ts';

export interface Load {
  collection: string;
  disposal: string;
  completedLoad: string;
  transaction: string;
}

export interface World {
  // Dana Reyes, admin: the actor the world is written by.
  admin: string;
  // Ana Brooks, a monitor, and the phone she records on, P1-COL-1.
  monitor: string;
  device: string;
  // Her assignments for the day, one on each project, and P1's site.
  assignments: { p1: string; p2: string };
  site: string;
  // The worker's system actor, made by the installer's seed (ADR-273).
  worker: string;
  coastline: string;
  summit: string;
  // A Coastline Haulers LLC read-only viewer.
  coastlineViewer: string;
  p1: string;
  p2: string;
  loads: { l101001: Load; l101002: Load; l102001: Load };
  // Every row the world wrote, by table, for tests that look at its audit records.
  written: Record<string, string[]>;
}

export class ExampleWorld {
  private readonly db: GuardedDatabase;
  private readonly written: Record<string, string[]> = {};

  private constructor(db: GuardedDatabase) {
    this.db = db;
  }

  static async build(db: GuardedDatabase): Promise<World> {
    return new ExampleWorld(db).build();
  }

  private async build(): Promise<World> {
    await this.db.administer();
    // The first user is written with itself as the actor (ADR-270 (4)).
    const admin = (await this.db.one<{ id: string }>('SELECT uuidv7()::text AS id')).id;
    await this.db.actor(admin, 'BACK_OFFICE');
    await this.insert('user', { id: admin, name: 'Dana Reyes', role: 'ADMIN' });

    const coastline = await this.insert('contractor', { name: 'Coastline Haulers LLC' });
    const summit = await this.insert('contractor', { name: 'Summit Debris Services' });
    const monitor = await this.insert('user', { name: 'Ana Brooks', role: 'MONITOR' });
    const coastlineViewer = await this.insert('user', {
      name: 'Coastline Haulers LLC viewer',
      role: 'READ_ONLY_VIEWER',
      contractor_id: coastline,
    });
    const device = await this.insert('device', {
      name: 'P1-COL-1',
      public_key: 'test-public-key-ana-brooks',
      master_passcode_version: 1,
    });
    const p1 = await this.insert('project', {
      name: 'Bayline County ROW, Hurricane Delphine',
      time_zone: 'America/New_York',
    });
    const p2 = await this.insert('project', {
      name: 'Bayline County PPDR, Hurricane Delphine',
      time_zone: 'America/New_York',
    });

    const site = await this.insert('disposal_site', { project_id: p1, name: 'Marsh Road TDSR' });
    const assignment = (projectId: string): Promise<string> =>
      this.insert('assignment', {
        person_id: monitor,
        work_date: '2026-10-12',
        project_id: projectId,
        field_event_kinds: '{COLLECTION,DISPOSAL}',
        device_id: device,
        origin: 'PLANNED',
        made_by_id: admin,
      });
    const assignments = { p1: await assignment(p1), p2: await assignment(p2) };

    const place = { monitor, device };
    return {
      admin,
      monitor,
      device,
      assignments,
      site,
      worker: systemActorId,
      coastline,
      summit,
      coastlineViewer,
      p1,
      p2,
      loads: {
        l101001: await this.load(
          { ...place, assignment: assignments.p1 },
          p1,
          '101001',
          80,
          coastline,
          ['52.0000', '4.9000', '254.80'],
        ),
        l101002: await this.load(
          { ...place, assignment: assignments.p1 },
          p1,
          '101002',
          75,
          summit,
          ['36.0000', '5.2500', '189.00'],
        ),
        l102001: await this.load(
          { ...place, assignment: assignments.p2 },
          p2,
          '102001',
          90,
          coastline,
          ['43.2000', '4.9000', '211.68'],
        ),
      },
      written: this.written,
    };
  }

  // A load: its collection and disposal events, the completed load and one transaction.
  private async load(
    place: { monitor: string; device: string; assignment: string },
    projectId: string,
    ticketNumber: string,
    loadCall: number,
    primeId: string,
    [quantity, rate, amount]: [string, string, string],
  ): Promise<Load> {
    const event = (kind: string, ended: string, call: number | null): Promise<string> =>
      this.insert('field_event', {
        id: null,
        project_id: projectId,
        workflow: 'LOAD',
        kind,
        ticket_number: ticketNumber,
        monitor_id: place.monitor,
        device_id: place.device,
        assignment_id: place.assignment,
        setup_version: 1,
        started_at: '2026-10-12T13:40:00Z',
        ended_at: ended,
        device_utc_offset_minutes: -240,
        end_latitude: '27.94620000',
        end_longitude: '-82.45870000',
        load_call: call,
      });
    const collection = await event('COLLECTION', '2026-10-12T14:05:00Z', null);
    const disposal = await event('DISPOSAL', '2026-10-12T14:35:00Z', loadCall);
    const completedLoad = await this.insert('completed_load', {
      project_id: projectId,
      ticket_number: ticketNumber,
      collection_event_id: collection,
      disposal_event_id: disposal,
      updated_at: '2026-10-12T20:00:00Z',
    });
    const transaction = await this.insert('transaction', {
      completed_load_id: completedLoad,
      slot: 1,
      quantity,
      rate,
      amount,
      prime_id: primeId,
    });
    return { collection, disposal, completedLoad, transaction };
  }

  // Inserts one row and returns its id. An id of null asks the database for a UUIDv7 up front, as
  // a phone makes a field event's own.
  private async insert(table: string, values: Record<string, unknown>): Promise<string> {
    const row = { ...values };
    if (row['id'] === null)
      row['id'] = (await this.db.one<{ id: string }>('SELECT uuidv7()::text AS id')).id;
    const columns = Object.keys(row);
    const { id } = await this.db.one<{ id: string }>(
      `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')})
       VALUES (${columns.map((_, index) => `$${String(index + 1)}`).join(', ')})
       RETURNING id::text`,
      Object.values(row),
    );
    (this.written[table] ??= []).push(id);
    return id;
  }
}
