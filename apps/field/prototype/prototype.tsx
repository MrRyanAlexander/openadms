// The clickable prototype (ADR-561 (7); task 3.1.4): the field app's key screens on its own
// components and look, the example world's records, and the four open designs as switches beside
// them. It is never part of the app's build (apps/field/dist/web): it is built on its own into
// dist/prototype, tested there by e2e/prototype.e2e.ts, and published for the user to try.
import { useEffect, useState } from 'react';
import { Label, RadioButton, RadioField, RadioGroup, Text } from 'react-aria-components';

import { Home, type Work } from '../src/home.tsx';
import { Button, ListRow, StatusStrip, type Standing } from '../src/look/index.ts';
import { counted, words as appWords } from '../src/words.ts';
import { Collection } from './collection.tsx';
import { choices, recommended, type Designs } from './designs.ts';
import { Sync } from './sync.tsx';
import { Tower } from './tower.tsx';
import { UnitRate } from './unit-rate.tsx';
import { words, world, type Monitor } from './world.ts';

type Screen = 'home' | 'collection' | 'tower' | 'unitRate' | 'sync' | 'stop';
type Theme = 'phone' | 'light' | 'dark';

const works: Readonly<Record<Monitor, readonly Work[]>> = {
  collector: ['collection'],
  tower: ['disposal', 'dropOff'],
  unitRate: ['unitRate', 'incident'],
};

const capture: Partial<Record<Work, Screen>> = {
  collection: 'collection',
  disposal: 'tower',
  unitRate: 'unitRate',
};

// The bottom menu Q-217 asks about, as each choice has it.
const menus = {
  trimmed: ['work', 'time', 'sync', 'settings'],
  board: ['time', 'map', 'work', 'chats', 'settings'],
  none: [],
} as const;
type MenuItem = (typeof menus)[keyof typeof menus][number];

function Menu({
  items,
  onPick,
}: {
  readonly items: readonly MenuItem[];
  readonly onPick: (item: MenuItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <nav aria-label={words.menu.label} className="prototype-menu">
      {items.map((item) => (
        <Button
          key={item}
          onPress={() => {
            onPick(item);
          }}
        >
          {words.menu[item]}
        </Button>
      ))}
    </nav>
  );
}

function Stop({
  standing,
  what,
  onHome,
}: {
  readonly standing: Standing;
  readonly what: string;
  readonly onHome: () => void;
}) {
  return (
    <main data-screen="prototype-stop" className="screen">
      <StatusStrip standing={standing} />
      <div className="screen-body">
        <h1>{what}</h1>
        <p>{words.page.stop}</p>
      </div>
      <div className="screen-actions">
        <Button main onPress={onHome}>
          {words.flow.home}
        </Button>
      </div>
    </main>
  );
}

function Choosing({
  design,
  designs,
  onChange,
}: {
  readonly design: keyof Designs;
  readonly designs: Designs;
  readonly onChange: (designs: Designs) => void;
}) {
  const said = words.page[design] as Record<string, string> & { label: string; about: string };
  return (
    <RadioGroup
      className="prototype-choice"
      value={designs[design]}
      onChange={(value) => {
        onChange({ ...designs, [design]: value });
      }}
    >
      <Label className="field-label">{said.label}</Label>
      <Text slot="description" className="quiet">
        {said.about}
      </Text>
      {choices[design].map((choice: string) => (
        <RadioField key={choice} value={choice}>
          <RadioButton className="prototype-radio">{said[choice]}</RadioButton>
        </RadioField>
      ))}
    </RadioGroup>
  );
}

export function Prototype() {
  const [screen, setScreen] = useState<Screen>('home');
  const [who, setWho] = useState<Monitor>('collector');
  const [stopped, setStopped] = useState('');
  const [designs, setDesigns] = useState<Designs>(recommended);
  const [theme, setTheme] = useState<Theme>('phone');
  const [made, setMade] = useState<Readonly<Record<Monitor, number>>>({
    collector: 0,
    tower: 0,
    unitRate: 0,
  });
  const [run, setRun] = useState(0);
  const [crew, setCrew] = useState<string | null>(null);

  useEffect(() => {
    if (theme === 'phone') delete document.documentElement.dataset['theme'];
    else document.documentElement.dataset['theme'] = theme;
  }, [theme]);

  const standing: Standing = {
    signedIn: world.monitors[who],
    waiting: world.waiting[who].length + made[who],
    lastSent: world.lastSent,
    now: world.now,
    timeZone: world.timeZone,
    clock: 'in',
  };
  const go = (to: Screen, as: Monitor = who) => {
    setWho(as);
    setScreen(to);
    setRun((count) => count + 1);
  };
  const home = () => {
    go('home');
  };
  const madeOne = () => {
    setMade({ ...made, [who]: made[who] + 1 });
  };
  const ticketNumber = (first: string) => String(Number(first) + made[who]);
  const stop = (what: string) => {
    setStopped(what);
    go('stop');
  };

  const shown = () => {
    switch (screen) {
      case 'home':
        return (
          <Home
            key={run}
            standing={standing}
            project={world.project}
            site={who === 'tower' ? world.site : null}
            works={works[who]}
            startable={works[who]}
            onStart={(work) => {
              const to = capture[work];
              if (to === undefined) stop(appWords.home.start[work]);
              else go(to);
            }}
            after={
              <Menu
                items={menus[designs.menu]}
                onPick={(item) => {
                  if (item === 'work') home();
                  else if (item === 'sync') go('sync');
                  else stop(words.menu[item]);
                }}
              />
            }
          >
            {designs.count === 'today' ? (
              <p className="quiet">{counted(words.flow.today, made[who])}</p>
            ) : null}
          </Home>
        );
      case 'collection':
        return (
          <Collection
            key={run}
            designs={designs}
            standing={standing}
            number={ticketNumber(world.numbers.collection)}
            onMade={madeOne}
            onNext={() => {
              go('collection');
            }}
            onHome={home}
          />
        );
      case 'tower':
        return (
          <Tower
            key={run}
            designs={designs}
            standing={standing}
            onMade={madeOne}
            onNext={() => {
              go('tower');
            }}
            onHome={home}
          />
        );
      case 'unitRate':
        return (
          <UnitRate
            key={run}
            designs={designs}
            standing={standing}
            number={ticketNumber(world.numbers.unitRate)}
            crew={crew}
            onCrew={setCrew}
            onMade={madeOne}
            onNext={() => {
              go('unitRate');
            }}
            onHome={home}
          />
        );
      case 'sync':
        return <Sync key={run} who={who} standing={standing} onHome={home} />;
      case 'stop':
        return <Stop key={run} standing={standing} what={stopped} onHome={home} />;
    }
  };

  return (
    <div className="prototype">
      <div className="prototype-phone">{shown()}</div>
      <aside className="prototype-panel" aria-labelledby="prototype-heading">
        <h2 id="prototype-heading">{words.page.heading}</h2>
        <p>{words.page.about}</p>
        <section className="prototype-section" aria-labelledby="prototype-go-to">
          <h3 id="prototype-go-to">{words.page.goTo}</h3>
          {(['collector', 'tower', 'unitRate'] as const).map((monitor) => (
            <ListRow
              key={monitor}
              label={words.page.screens[monitor]}
              onPress={() => {
                go('home', monitor);
              }}
            />
          ))}
          <ListRow
            label={words.page.screens.sync}
            onPress={() => {
              go('sync');
            }}
          />
        </section>
        <section className="prototype-section" aria-labelledby="prototype-designs">
          <h3 id="prototype-designs">{words.page.designs}</h3>
          <p className="quiet">{words.page.designsAbout}</p>
          <Choosing design="confirm" designs={designs} onChange={setDesigns} />
          <Choosing design="count" designs={designs} onChange={setDesigns} />
          <Choosing design="menu" designs={designs} onChange={setDesigns} />
          <Choosing design="again" designs={designs} onChange={setDesigns} />
        </section>
        <RadioGroup
          className="prototype-choice"
          value={theme}
          onChange={(value) => {
            setTheme(value === 'light' || value === 'dark' ? value : 'phone');
          }}
        >
          <Label className="field-label">{words.page.theme.label}</Label>
          {(['phone', 'light', 'dark'] as const).map((choice) => (
            <RadioField key={choice} value={choice}>
              <RadioButton className="prototype-radio">{words.page.theme[choice]}</RadioButton>
            </RadioField>
          ))}
        </RadioGroup>
      </aside>
    </div>
  );
}
