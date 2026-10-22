// Where the page is (ARCHITECTURE §14): the address bar's path is the screen, so a reload, a link
// copied or the browser's Back keeps a person's place. Nothing here is a library: the History API,
// and React Aria's `RouterProvider`, so that every React Aria link and button with an `href`
// moves the page without loading it again.
import { useSyncExternalStore, type ReactNode } from 'react';
import { RouterProvider } from 'react-aria-components';

const moved = 'adms-moved';

function subscribe(changed: () => void): () => void {
  window.addEventListener('popstate', changed);
  window.addEventListener(moved, changed);
  return () => {
    window.removeEventListener('popstate', changed);
    window.removeEventListener(moved, changed);
  };
}

const where = (): string => `${window.location.pathname}${window.location.search}`;

// The path and query the page is at.
export function useWhere(): { readonly path: string; readonly query: URLSearchParams } {
  const at = useSyncExternalStore(subscribe, where);
  const url = new URL(at, window.location.origin);
  return { path: url.pathname, query: url.searchParams };
}

// The page moved to another place, kept in the browser's history (or put in place of this one).
export function navigate(to: string, options: { readonly replace?: boolean } = {}): void {
  if (to === where()) return;
  if (options.replace === true) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  window.dispatchEvent(new Event(moved));
  window.scrollTo(0, 0);
}

// A path matched against a pattern, `/projects/:projectId/tickets`: its parameters by name, or
// nothing where it doesn't match.
export function matched(pattern: string, path: string): Readonly<Record<string, string>> | null {
  const wanted = pattern.split('/').filter(Boolean);
  const given = path.split('/').filter(Boolean);
  if (wanted.length !== given.length) return null;
  const params: Record<string, string> = {};
  for (const [at, part] of wanted.entries()) {
    const one = given[at] ?? '';
    if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(one);
    else if (part !== one) return null;
  }
  return params;
}

export function Routed({ children }: { readonly children: ReactNode }) {
  return (
    <RouterProvider
      navigate={(to) => {
        navigate(to);
      }}
    >
      {children}
    </RouterProvider>
  );
}
