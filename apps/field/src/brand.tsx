// The firm's own name for its ADMS on the phone, and the line that says which Open ADMS it is built
// on (the user, 2026-10-22; AGPL-3.0 §13: people using it over a network can get the source).
// `BrandProvider` holds the name the phone last read (phone/brand.ts) and sets the page's title
// from it; a screen that learns it from the server says so with `learned`. The version is the
// build's: the code on the phone is that release's, whatever the server runs. Every word is the
// translation file's.
import { builtOn } from '@open-adms/domain';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-aria-components';

import type { PhoneBrand } from './phone/brand.ts';
import { say, words } from './words.ts';

export interface Brand {
  // What the firm calls its ADMS.
  readonly name: string;
  // What the field app is called: the firm's ADMS, and Field. The page's title and its first
  // screens' heading.
  readonly title: string;
  // Which Open ADMS this build is of.
  readonly version: string;
  // The server told this name: kept for the next time the phone has no signal.
  readonly learned: (told: string) => void;
}

const BrandContext = createContext<Brand>({
  name: words.brand.starting,
  title: say(words.app.title, { brand: words.brand.starting }),
  version: import.meta.env.ADMS_RELEASE,
  learned: () => {
    // Nothing keeps it outside a provider.
  },
});

export function BrandProvider({
  phone,
  children,
}: {
  readonly phone: Promise<{ readonly brand: PhoneBrand }>;
  readonly children: ReactNode;
}) {
  // What the phone holds, once its store has opened; a ref, so `learned` is one function for the
  // life of the page and a screen that asks the server in an effect asks once.
  const held = useRef<PhoneBrand | null>(null);
  const [name, setName] = useState(words.brand.starting);

  useEffect(() => {
    let shown = true;
    void phone.then(({ brand }) => {
      if (!shown) return;
      held.current = brand;
      setName(brand.now());
    });
    return () => {
      shown = false;
    };
  }, [phone]);

  const title = say(words.app.title, { brand: name });
  useEffect(() => {
    document.title = title;
  }, [title]);

  const learned = useCallback((told: string) => {
    if (held.current !== null) void held.current.keep(told).then(setName);
  }, []);
  const brand = useMemo(
    () => ({ name, title, version: import.meta.env.ADMS_RELEASE, learned }),
    [name, title, learned],
  );
  return <BrandContext value={brand}>{children}</BrandContext>;
}

export function useBrand(): Brand {
  return useContext(BrandContext);
}

// "Built on Open ADMS 0.1.0, AGPL-3.0." and the way to the source.
export function BuiltOnLine() {
  const { version } = useBrand();
  return (
    <p className="built-on">
      {say(words.brand.builtOn, { version, licence: builtOn.licence })}
      <Link href={builtOn.source} target="_blank" rel="noopener noreferrer">
        {words.brand.source}
      </Link>
    </p>
  );
}
