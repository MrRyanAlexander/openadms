// A project's clock: every "which day" question, and every date and time a person reads, is
// answered in the project's time zone (ARCHITECTURE §10; ADR-100). An instant is the device's
// clock as a UTC instant; a day is a calendar day, written 2026-10-12 as the database gives a
// date. A message words them as spec/CONVENTIONS.md §3's report format does: 12-Oct-2026 and
// 14:35, on the 24-hour clock (spec/FLAGS.md §5 (4), ADR-290).

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayText = /^(\d{4})-(\d{2})-(\d{2})$/;

// U+2212, the minus of "UTC−05:00", and the en dash of "09:10–09:40", as spec/FLAGS.md has them.
const minus = '−';
export const enDash = '–';

export class ProjectClock {
  // An IANA name, such as America/New_York.
  readonly timeZone: string;
  private readonly format: Intl.DateTimeFormat;

  constructor(timeZone: string) {
    this.timeZone = timeZone;
    // Throws on a name that isn't a time zone: a project always has one (ADR-100).
    this.format = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  private parts(instant: Date): Record<string, string> {
    const parts: Record<string, string> = {};
    for (const part of this.format.formatToParts(instant)) parts[part.type] = part.value;
    return parts;
  }

  // The calendar day the instant falls on in the project's time zone: 2026-10-12.
  day(instant: Date): string {
    const { year = '', month = '', day = '' } = this.parts(instant);
    return `${year}-${month}-${day}`;
  }

  // When the calendar day the instant falls on ends in the project's time zone: the first
  // instant of the next day there. Found by halving, so a day of 23 or 25 hours (a clock
  // change) ends where its own zone says it does.
  dayEnds(instant: Date): Date {
    const today = this.day(instant);
    let still = instant.getTime();
    // Further than any day is long.
    let later = still + 27 * 3_600_000;
    while (later - still > 1) {
      const middle = Math.floor((still + later) / 2);
      if (this.day(new Date(middle)) === today) still = middle;
      else later = middle;
    }
    return new Date(later);
  }

  // 21:40.
  time(instant: Date): string {
    const { hour = '', minute = '' } = this.parts(instant);
    return `${hour}:${minute}`;
  }

  // 12-Oct-2026.
  date(instant: Date): string {
    return ProjectClock.dateOf(this.day(instant));
  }

  // How far the project's time zone stands from UTC at the instant, in minutes: −240 in Bayline
  // County in October.
  offsetMinutes(instant: Date): number {
    const { year, month, day, hour, minute, second } = this.parts(instant);
    const shown = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
    return Math.round((shown - instant.getTime()) / 60_000);
  }

  // A calendar day as a message words it: 2026-09-30 is 30-Sep-2026.
  static dateOf(day: string): string {
    const read = dayText.exec(day);
    const month = months[Number(read?.[2]) - 1];
    if (read === null || month === undefined) throw new Error(`Not a calendar day: ${day}.`);
    return `${read[3] ?? ''}-${month}-${read[1] ?? ''}`;
  }

  // An offset as a message words it: −300 is UTC−05:00.
  static offsetOf(minutes: number): string {
    const size = Math.abs(minutes);
    const hours = String(Math.floor(size / 60)).padStart(2, '0');
    const rest = String(size % 60).padStart(2, '0');
    return `UTC${minutes < 0 ? minus : '+'}${hours}:${rest}`;
  }
}
