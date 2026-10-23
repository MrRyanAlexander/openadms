// A person's own ways with the desktop, kept in this browser alone (a convenience, never a record):
// the theme, light or dark or as the computer has it (the look's tokens follow `data-theme` on the
// root element, tokens.css), and whether windows open maximized. Unreadable or refused, each falls
// back to its default and the desktop works the same.
import { useCallback, useState } from 'react';

export type Theme = 'computer' | 'light' | 'dark';

const themeKey = 'adms-office-theme';
const maximizedKey = 'adms-office-maximized';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Not kept: it holds for this page until it is loaded again.
  }
}

export function keptTheme(): Theme {
  const kept = read(themeKey);
  return kept === 'light' || kept === 'dark' ? kept : 'computer';
}

// The theme put on the page: `data-theme` on the root element, or none to follow the computer.
export function showTheme(theme: Theme): void {
  if (theme === 'computer') delete document.documentElement.dataset['theme'];
  else document.documentElement.dataset['theme'] = theme;
}

export function useTheme(): readonly [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(keptTheme);
  const choose = useCallback((next: Theme) => {
    write(themeKey, next === 'computer' ? null : next);
    showTheme(next);
    setTheme(next);
  }, []);
  return [theme, choose];
}

export function useMaximized(): readonly [boolean, (maximized: boolean) => void] {
  const [maximized, setMaximized] = useState(() => read(maximizedKey) === 'yes');
  const choose = useCallback((next: boolean) => {
    write(maximizedKey, next ? 'yes' : null);
    setMaximized(next);
  }, []);
  return [maximized, choose];
}
