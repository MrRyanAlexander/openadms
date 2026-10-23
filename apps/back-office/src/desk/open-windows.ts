// The windows open on the desktop (the user, 2026-10-22). **The address is the truth**: the one
// window shown is the screen the address names, so a reload, a link copied, Back and Forward, and a
// browser test's `goto(url)` all keep working, and only one routed screen is ever mounted. Every
// other open window is an entry on the taskbar that holds its address and opens it again as it
// was. A window is one kind of place in one project (a ticket's window shows the ticket last
// opened in it), so the taskbar never grows past the places there are. What is open is kept for
// this tab alone (session storage), a convenience: lost, the desktop starts clear.
import type { GlyphName } from './glyphs.tsx';

export interface OpenWindow {
  // One kind of place in one project: `<project or ->|<the place's address pattern>`.
  readonly key: string;
  // Where it was last: its address with its query.
  readonly href: string;
  readonly title: string;
  readonly glyph: GlyphName;
  readonly projectId: string | null;
}

// The most windows kept open: the oldest one not shown is closed past it.
export const mostOpen = 12;

export const windowKey = (projectId: string | null, pattern: string): string =>
  `${projectId ?? '-'}|${pattern}`;

// A window shown: put in its place on the taskbar where it was open, added at the end where not.
export function opened(windows: readonly OpenWindow[], shown: OpenWindow): readonly OpenWindow[] {
  const at = windows.findIndex((each) => each.key === shown.key);
  if (at >= 0) {
    const was = windows[at];
    if (was?.href === shown.href && was.title === shown.title && was.glyph === shown.glyph) {
      return windows;
    }
    return windows.map((each, index) => (index === at ? shown : each));
  }
  const more = [...windows, shown];
  return more.length > mostOpen ? more.slice(more.length - mostOpen) : more;
}

export function closed(windows: readonly OpenWindow[], key: string): readonly OpenWindow[] {
  return windows.filter((each) => each.key !== key);
}

// The windows the taskbar shows: the firm's, and the open project's.
export function onTaskbar(
  windows: readonly OpenWindow[],
  projectId: string | null,
): readonly OpenWindow[] {
  return windows.filter((each) => each.projectId === null || each.projectId === projectId);
}

// What the desktop keeps for this tab: its windows, and the project last open.
export interface DeskMemory {
  readonly windows: readonly OpenWindow[];
  readonly projectId: string | null;
}

const empty: DeskMemory = { windows: [], projectId: null };
const keyOf = (userId: string) => `adms-desk:${userId}`;

function isOpenWindow(value: unknown): value is OpenWindow {
  if (typeof value !== 'object' || value === null) return false;
  const each = value as Record<string, unknown>;
  return (
    typeof each['key'] === 'string' &&
    typeof each['href'] === 'string' &&
    each['href'].startsWith('/') &&
    typeof each['title'] === 'string' &&
    typeof each['glyph'] === 'string' &&
    (each['projectId'] === null || typeof each['projectId'] === 'string')
  );
}

// Read back, where the browser keeps it; anything unreadable is a clear desktop.
export function recalled(userId: string): DeskMemory {
  try {
    const kept = window.sessionStorage.getItem(keyOf(userId));
    if (kept === null) return empty;
    const read = JSON.parse(kept) as { windows?: unknown; projectId?: unknown };
    const windows = Array.isArray(read.windows) ? read.windows.filter(isOpenWindow) : [];
    const projectId = typeof read.projectId === 'string' ? read.projectId : null;
    return { windows: windows.slice(-mostOpen), projectId };
  } catch {
    return empty;
  }
}

export function kept(userId: string, memory: DeskMemory): void {
  try {
    window.sessionStorage.setItem(keyOf(userId), JSON.stringify(memory));
  } catch {
    // Not kept (a private window, storage refused): the desktop still works, it just starts clear.
  }
}
