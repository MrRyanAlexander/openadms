// The person signed in, as every screen of the back office reads them (ARCHITECTURE §6; ADR-408,
// 539): who they are, their role, and what they're granted, so the page shows only what they may
// open (the API asks again on every request, and a grant taken away refuses their very next one).
import type { SessionAnswer } from '@open-adms/contracts';
import type { PermissionName } from '@open-adms/domain';
import { createContext, useContext } from 'react';

export interface Signed {
  readonly session: SessionAnswer;
  // The session read again (after a change of password or authenticator).
  readonly reread: () => Promise<void>;
  readonly signOut: () => Promise<void>;
}

export const SignedContext = createContext<Signed | null>(null);

export function useSigned(): Signed {
  const signed = useContext(SignedContext);
  if (signed === null) throw new Error('A screen asked who is signed in outside the app.');
  return signed;
}

// Whether the person may do what takes this permission: an admin always, a manager/analyst while
// granted it, a read-only viewer never.
export function holds(session: SessionAnswer, permission: PermissionName): boolean {
  if (session.user.role === 'ADMIN') return true;
  if (session.user.role !== 'MANAGER_ANALYST') return false;
  return session.granted.includes(permission);
}

export const isAdmin = (session: SessionAnswer): boolean => session.user.role === 'ADMIN';
