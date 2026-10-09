// A simulated phone (ARCHITECTURE §7–§10, §15): enrolled, holding the assignment its monitor took at
// sign-in (so one project) and the numbered version of its lists, and offline. What its monitor records stays on it, in the order recorded, until it finds signal
// and syncs; then each field event goes to the server in that order, and leaves the phone once
// received. It stamps times from its own clock (the story's, plus any error the story gives it) and
// makes each field event's id itself (ids.ts). Its screens and checks are the field app's (Phase 3).
import type { FieldEventKind, Workflow } from '@open-adms/db';

import { utcOffsetMinutes, type StoryClock } from './clock.ts';
import { uuidv7 } from './ids.ts';

// A field event as the phone sends it at sync.
export interface RecordedEvent {
  readonly id: string;
  readonly projectId: string;
  readonly workflow: Workflow;
  readonly kind: FieldEventKind;
  readonly ticketNumber: string;
  readonly splitSuffix: string;
  readonly monitorId: string;
  readonly deviceId: string;
  // The assignment the phone held, and the version of its lists it captured with (ADR-240).
  readonly assignmentId: string;
  readonly setupVersion: number;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly deviceUtcOffsetMinutes: number;
  readonly endLatitude: string | null;
  readonly endLongitude: string | null;
  readonly loadCall: number | null;
}

// What receives a phone's field events at sync: in the harness, a stand-in for the API's sync
// endpoint (Phase 2), which writes them as the API's login (intake.ts).
export interface SyncIntake {
  receive(event: RecordedEvent): Promise<void>;
}

export interface PhoneSetup {
  // The phone's name on the dispatch board, e.g. P1-COL-1.
  readonly name: string;
  readonly deviceId: string;
  // The monitor signed in, the assignment the phone took for them, and its project.
  readonly monitorId: string;
  readonly assignmentId: string;
  readonly projectId: string;
  // The numbered version of the lists the phone holds for that assignment.
  readonly setupVersion: number;
  // The phone's own time zone: the project's, unless the story says otherwise.
  readonly timeZone: string;
  // How far the phone's clock is off the story's, in minutes (0 when not given).
  readonly clockErrorMinutes?: number;
}

// Filled in on Complete: badge first, number last (ADR-209).
export interface Completion {
  readonly ticketNumber: string;
  readonly splitSuffix?: string;
  readonly endLatitude?: string;
  readonly endLongitude?: string;
  readonly loadCall?: number;
}

interface Started {
  readonly id: string;
  readonly workflow: Workflow;
  readonly kind: FieldEventKind;
  readonly startedAt: Date;
}

export class SimulatedDevice {
  readonly setup: PhoneSetup;
  private readonly clock: StoryClock;
  private readonly started = new Map<string, Started>();
  private readonly outbox: RecordedEvent[] = [];

  constructor(setup: PhoneSetup, clock: StoryClock) {
    this.setup = setup;
    this.clock = clock;
  }

  get name(): string {
    return this.setup.name;
  }

  // The phone's clock: what it stamps on what its monitor records.
  now(): Date {
    return new Date(this.clock.now().getTime() + (this.setup.clockErrorMinutes ?? 0) * 60_000);
  }

  // New: the monitor starts a field event (the badge scanned); its id is made now, on the phone.
  begin(workflow: Workflow, kind: FieldEventKind): string {
    const startedAt = this.now();
    const id = uuidv7(startedAt);
    this.started.set(id, { id, workflow, kind, startedAt });
    return id;
  }

  // Complete: the details and the number last. The field event waits on the phone for signal.
  complete(id: string, completion: Completion): RecordedEvent {
    const started = this.started.get(id);
    if (started === undefined) throw new Error(`${this.name} has no field event ${id} started.`);
    this.started.delete(id);
    const endedAt = this.now();
    const event: RecordedEvent = {
      id,
      projectId: this.setup.projectId,
      workflow: started.workflow,
      kind: started.kind,
      ticketNumber: completion.ticketNumber,
      splitSuffix: completion.splitSuffix ?? '',
      monitorId: this.setup.monitorId,
      deviceId: this.setup.deviceId,
      assignmentId: this.setup.assignmentId,
      setupVersion: this.setup.setupVersion,
      startedAt: started.startedAt,
      endedAt,
      deviceUtcOffsetMinutes: utcOffsetMinutes(this.setup.timeZone, endedAt),
      endLatitude: completion.endLatitude ?? null,
      endLongitude: completion.endLongitude ?? null,
      loadCall: completion.loadCall ?? null,
    };
    this.outbox.push(event);
    return event;
  }

  // What is still on the phone, waiting for signal.
  get waiting(): readonly RecordedEvent[] {
    return [...this.outbox];
  }

  // The phone finds signal: each waiting field event is sent in the order recorded and leaves the
  // phone once received. One that isn't received stays, with the rest after it. How many were sent.
  async sync(intake: SyncIntake): Promise<number> {
    let sent = 0;
    while (this.outbox.length > 0) {
      const [next] = this.outbox;
      if (next === undefined) break;
      await intake.receive(next);
      this.outbox.shift();
      sent += 1;
    }
    return sent;
  }
}
