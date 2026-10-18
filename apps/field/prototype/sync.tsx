// Sending the work on the prototype (adms-field-app §4A.0 (11); ARCHITECTURE §9): what waits on
// the phone, sent record by record, and what the server said of each (saved, or not saved and
// why: a duplicate kept for the back office, ADR-022), never swallowed; the lists refreshed. Words
// as it goes, never a spinner.
import { useEffect, useId, useState } from 'react';

import { Banner, Button, ListRow, StatusStrip, type Standing } from '../src/look/index.ts';
import { Problem, Tick } from '../src/look/icons.tsx';
import { counted, say, timeOfDay } from '../src/words.ts';
import { words, world, type Monitor } from './world.ts';

// How long the prototype takes over each record, so the strip's words can be seen changing.
const sendingEach = 600;

export function Sync({
  who,
  standing,
  onHome,
}: {
  readonly who: Monitor;
  readonly standing: Standing;
  readonly onHome: () => void;
}) {
  const titleId = useId();
  const records = world.waiting[who];
  const [sent, setSent] = useState<number | null>(null);
  const [refreshed, setRefreshed] = useState(false);
  const sending = sent !== null && sent < records.length;
  const done = sent === records.length;

  useEffect(() => {
    if (!sending) return;
    const timer = setTimeout(() => {
      setSent((count) => (count ?? 0) + 1);
    }, sendingEach);
    return () => {
      clearTimeout(timer);
    };
  }, [sending, sent]);

  const now: Standing = done
    ? { ...standing, waiting: 0, lastSent: standing.now, sending: false }
    : { ...standing, waiting: records.length, sending };

  return (
    <main data-screen="prototype-sync" className="screen">
      <StatusStrip standing={now} />
      <div className="screen-body">
        <h1 id={titleId}>{words.sync.title}</h1>
        {done ? null : (
          <>
            <p>{counted(words.sync.events, records.length)}</p>
            <p>{counted(words.sync.photos, world.photosWaiting[who])}</p>
          </>
        )}
        <p role="status">
          {sending
            ? say(words.sync.sending, { done: sent + 1, all: records.length })
            : done
              ? words.sync.done
              : ''}
        </p>
        {sent === null || sent === 0 ? null : (
          <section aria-labelledby={`${titleId}-said`}>
            <h2 id={`${titleId}-said`}>{words.sync.said}</h2>
            <ul className="prototype-results">
              {records.slice(0, sent).map((record, place) => (
                <li key={`${record.number}-${String(place)}`}>
                  <span className={record.saved ? 'prototype-saved' : 'prototype-not-saved'}>
                    {record.saved ? <Tick /> : <Problem />}
                    {record.saved ? words.sync.saved : words.sync.notSaved}
                  </span>
                  <span>
                    {say(words.sync.record, {
                      kind: words.kinds[record.kind],
                      number: record.number,
                      time: timeOfDay(record.at, world.timeZone),
                    })}
                  </span>
                  {record.saved ? null : (
                    <Banner tone="notice">
                      <p>{say(words.sync.quarantined, { number: record.number })}</p>
                    </Banner>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        <ListRow
          label={words.sync.refresh}
          detail={
            refreshed
              ? words.sync.refreshed
              : say(words.sync.lists, { time: timeOfDay(world.listsFrom, world.timeZone) })
          }
          onPress={() => {
            setRefreshed(true);
          }}
        />
      </div>
      <div className="screen-actions">
        {done ? null : (
          <Button
            main
            isDisabled={sending}
            onPress={() => {
              setSent(0);
            }}
          >
            {words.sync.send}
          </Button>
        )}
        <Button wide onPress={onHome}>
          {words.flow.home}
        </Button>
      </div>
    </main>
  );
}
