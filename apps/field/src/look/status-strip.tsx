// The status strip (ADR-561 (4)), on every screen: who is signed in, what waits on the phone and
// when it last sent, and the time clock where the project has it on. Words beside icons, never a
// spinner waiting on the network; a change to what waits is announced (WCAG 4.1.3). Times are the
// project's, in its time zone (ADR-100).
import { counted, dayOf, sameDay, say, timeOfDay, words } from '../words.ts';
import { Clock, Person, Tick, Waiting } from './icons.tsx';

export interface Standing {
  readonly signedIn: string | null;
  readonly waiting: number;
  readonly sending?: boolean;
  readonly lastSent: Date | null;
  readonly now: Date;
  // The project's time zone; a phone with no project has sent nothing.
  readonly timeZone?: string;
  // The time clock, where the project has it on.
  readonly clock?: keyof typeof words.look.strip.clock;
}

function sent({ lastSent, now, timeZone }: Standing): string {
  const strip = words.look.strip;
  if (lastSent === null || timeZone === undefined) return strip.sent.never;
  const time = timeOfDay(lastSent, timeZone);
  return sameDay(lastSent, now, timeZone)
    ? say(strip.sent.today, { time })
    : say(strip.sent.earlier, { day: dayOf(lastSent, timeZone), time });
}

export function StatusStrip({ standing }: { readonly standing: Standing }) {
  const strip = words.look.strip;
  return (
    <div className="status-strip">
      <span>
        <Person />
        {standing.signedIn ?? strip.nobody}
      </span>
      <span aria-live="polite">
        <Waiting />
        {standing.sending === true ? strip.sending : counted(strip.waiting, standing.waiting)}
      </span>
      <span>
        <Tick />
        {sent(standing)}
      </span>
      {standing.clock === undefined ? null : (
        <span>
          <Clock />
          {strip.clock[standing.clock]}
        </span>
      )}
    </div>
  );
}
