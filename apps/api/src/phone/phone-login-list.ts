// The login list and the master passcode's check a phone takes (ARCHITECTURE §7.1, §7.2, §7.5;
// adms-field-app §4A.0 (6), (7); spec/acceptance/02-people-and-devices.md AC-02-17, AC-02-41;
// BACKLOG 2.5.3, C90, C110, C117, C119; ADR-105, 106, 139, 240, 449, 454). What each check is
// made of is offline-checks.ts.
//
// - **Who is on a phone's list** (ADR-449 (5)(b)): the monitor signed in, and every monitor in
//   service with an assignment that stands on the project of the assignment the phone takes
//   now, for that project's today or a later day. Which assignment is the sign-in's own rule,
//   asked again. A phone that takes none is sent no list and keeps what it holds.
// - **A monitor with no offline seed is left off**: one is kept when their password is set and
//   at their next sign-in online, and until then no phone could check them.
// - **The phone says what it holds**, a mark for each entry and the version of the passcode's
//   check, and is made only what it lacks: each entry is a slow hash (about 12 ms of a processor
//   each, measured 2026-10-09), so a project's whole list at every read would be seconds of
//   work a phone. A password set anew makes its mark good no more. The phone drops the entry
//   of anybody the answer doesn't name.
// - **One call makes so many entries and no more** (`LOGIN_LIST_ENTRIES_PER_CALL`), one after
//   another, so that a sign-in's own hash never waits behind a list; the answer says there are
//   more, and the phone asks again.
// - **The master passcode's check is sent whatever the assignment**: a phone with none is set up
//   under the passcode. When a phone is sent a later version's check, the version its record
//   holds moves to it, written as the device key's actor on that phone (ADR-440).
// - **Entries are kept nowhere on the server**, and nothing here is part of a setup version
//   (ADR-453): a login list is who may sign in, never the project's setup.
import { byDeviceKey, type Database } from '@open-adms/db';
import { ProjectClock, type NoAssignmentReason } from '@open-adms/domain';

import type { OfflineCheck, OfflineChecks } from './offline-checks.ts';
import type { PhoneAssignments } from './phone-assignments.ts';

// What a phone says it holds.
export interface LoginListHeld {
  // The version of the master passcode whose check it holds; none on a phone just enrolled.
  readonly masterPasscodeVersion: number | null;
  readonly entries: readonly { readonly monitorId: string; readonly mark: string }[];
}

export interface LoginListMonitor {
  readonly monitorId: string;
  readonly monitorNumber: string;
  readonly name: string;
  readonly mark: string;
  // None where the phone holds the entry of that mark, or where this call made its share and
  // the phone asks again (`more`).
  readonly check: OfflineCheck | null;
}

export interface LoginListTaken {
  readonly masterPasscode: { readonly version: number; readonly check: OfflineCheck | null };
  readonly noAssignment: NoAssignmentReason | null;
  readonly loginList: {
    readonly projectId: string;
    readonly monitors: readonly LoginListMonitor[];
    readonly more: boolean;
  } | null;
  // For the server's log: entries made by this call, and monitors left off for want of a seed.
  readonly made: number;
  readonly withoutSeed: number;
}

export interface PhoneLoginListParts {
  readonly assignments: PhoneAssignments;
  readonly offline: OfflineChecks;
  readonly clock: { now(): Date };
  // The most entries one call makes (`LOGIN_LIST_ENTRIES_PER_CALL`).
  readonly entriesPerCall: number;
}

export class PhoneLoginList {
  private readonly db: Database;
  private readonly parts: PhoneLoginListParts;

  constructor(db: Database, parts: PhoneLoginListParts) {
    this.db = db;
    this.parts = parts;
  }

  async taken(
    monitor: { readonly userId: string; readonly deviceId: string },
    held: LoginListHeld,
  ): Promise<LoginListTaken> {
    const { assignments, offline, clock, entriesPerCall } = this.parts;
    const now = clock.now();
    const masterPasscode = await this.passcodeBrought(monitor.deviceId, held.masterPasscodeVersion);
    const taken = await assignments.taken(monitor.userId, monitor.deviceId, now);
    if (!taken.taken) {
      return { masterPasscode, noAssignment: taken.why, loginList: null, made: 0, withoutSeed: 0 };
    }
    const { project } = taken.assignment;
    const today = new ProjectClock(project.timeZone).day(now);
    const people = await this.db.$read((tx) =>
      tx.user.findMany({
        where: {
          role: 'MONITOR',
          archivedAt: null,
          monitorNumber: { not: null },
          OR: [
            { id: monitor.userId },
            {
              assignments: {
                some: {
                  projectId: project.id,
                  archivedAt: null,
                  workDate: { gte: new Date(`${today}T00:00:00Z`) },
                },
              },
            },
          ],
        },
        select: {
          id: true,
          name: true,
          monitorNumber: true,
          credential: { select: { offlineSeed: true } },
        },
        orderBy: { monitorNumber: 'asc' },
      }),
    );
    const holds = new Map(held.entries.map((entry) => [entry.monitorId, entry.mark]));
    const monitors: LoginListMonitor[] = [];
    let made = 0;
    let withoutSeed = 0;
    let more = false;
    for (const person of people) {
      const kept = person.credential?.offlineSeed ?? null;
      if (kept === null || person.monitorNumber === null) {
        withoutSeed += 1;
        continue;
      }
      const mark = offline.mark(monitor.deviceId, person.id, kept);
      const heldMark = holds.get(person.id);
      let check: OfflineCheck | null = null;
      if (heldMark === undefined || !offline.sameMark(heldMark, mark)) {
        if (made < entriesPerCall) {
          const entry = await offline.entry(person.id, kept);
          // A seed this process can't open is no seed: made again at their next sign-in.
          if (entry === undefined) {
            withoutSeed += 1;
            continue;
          }
          check = entry;
          made += 1;
        } else {
          more = true;
        }
      }
      monitors.push({
        monitorId: person.id,
        monitorNumber: person.monitorNumber,
        name: person.name,
        mark,
        check,
      });
    }
    return {
      masterPasscode,
      noAssignment: null,
      loginList: { projectId: project.id, monitors, more },
      made,
      withoutSeed,
    };
  }

  // The passcode's version in force, with its check for a phone that doesn't hold that one.
  // A sync brings it too, with nobody signed in (ADR-473).
  async passcodeBrought(
    deviceId: string,
    heldVersion: number | null,
  ): Promise<LoginListTaken['masterPasscode']> {
    const { inForce, phone } = await this.db.$read(async (tx) => ({
      inForce: await tx.masterPasscode.findFirstOrThrow({
        orderBy: { version: 'desc' },
        select: { version: true, hash: true },
      }),
      phone: await tx.device.findUniqueOrThrow({
        where: { id: deviceId },
        select: { masterPasscodeVersion: true },
      }),
    }));
    if (heldVersion === inForce.version) return { version: inForce.version, check: null };
    const check = await this.parts.offline.ofPasscode(inForce.hash);
    if (check === undefined) {
      throw new Error('The master passcode’s hash is none a phone’s check can be made from.');
    }
    // Written before the check is sent: a phone whose answer is lost asks again and is sent it
    // again, and the record never says less than was sent.
    if (phone.masterPasscodeVersion < inForce.version) {
      await this.db.$write(byDeviceKey(deviceId), (tx) =>
        tx.device.update({
          where: { id: deviceId },
          data: { masterPasscodeVersion: inForce.version },
        }),
      );
    }
    return { version: inForce.version, check };
  }
}
