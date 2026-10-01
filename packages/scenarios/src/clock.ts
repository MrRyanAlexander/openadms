// The story's clock (ARCHITECTURE §10, §15): the one time a story runs on, moved by the story, never
// read from the machine. The server reads it as its own clock (a field event's received time); each
// simulated phone reads it through its own, which may be off (device.ts). Time only moves forward.
export class StoryClock {
  private current: Date;

  // An instant with its offset, e.g. '2026-10-12T07:00:00-04:00'.
  constructor(start: string) {
    this.current = StoryClock.instant(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  // Moves to a later instant; the story says when things happen.
  set(to: string): void {
    const next = StoryClock.instant(to);
    if (next < this.current) {
      throw new Error(
        `The story's clock can't go back: ${to} is before ${this.current.toISOString()}.`,
      );
    }
    this.current = next;
  }

  advance(minutes: number): void {
    if (minutes < 0) throw new Error("The story's clock can't go back.");
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }

  private static instant(text: string): Date {
    if (!/[zZ]|[+-]\d\d:\d\d$/.test(text)) {
      throw new Error(`Give the story's times with their offset (…-04:00): ${text}`);
    }
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) throw new Error(`Not a time: ${text}`);
    return parsed;
  }
}

// How far a time zone is from UTC at an instant, in minutes (America/New_York in October: -240).
export function utcOffsetMinutes(timeZone: string, at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')?.value;
  const match = /^GMT(?:([+-])(\d\d):(\d\d))?$/.exec(name ?? '');
  if (match === null) throw new Error(`No UTC offset for ${timeZone}`);
  const [, sign, hours, minutes] = match;
  if (sign === undefined || hours === undefined || minutes === undefined) return 0;
  return (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes));
}

// An instant as the project's people read it: 'Mon 12 Oct 08:40'.
export function projectTime(timeZone: string, at: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return `${String(parts['weekday'])} ${String(parts['day'])} ${String(parts['month'])} ${String(parts['hour'])}:${String(parts['minute'])}`;
}
