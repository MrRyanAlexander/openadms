// The taskbar's clock: the computer's own time, to the minute, as on a desktop. A `time` element so
// it reads as one; it announces nothing as it changes.
import { useEffect, useState } from 'react';

const minute = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = window.setInterval(() => {
      setNow(new Date());
    }, 15_000);
    return () => {
      window.clearInterval(tick);
    };
  }, []);
  return (
    <time className="taskbar-clock" dateTime={now.toISOString()}>
      {minute.format(now)}
    </time>
  );
}
