// What a screen says when the server didn't do what it was asked (ADR-572): every word the
// translation file's. No signal says so; a limit says how long to wait, as the answer told it
// (ADR-416, 524); a screen names the codes it has words of its own for; anything else is "try
// again". Never the code itself, and never anything the server sent but its code.
import type { ErrorCode } from '@open-adms/contracts';

import type { NotAnswered } from './server.ts';
import { counted, words } from './words.ts';

export function refusalWords(
  reply: NotAnswered,
  own: Partial<Readonly<Record<ErrorCode, string>>> = {},
): string {
  const said = words.refusals;
  if (reply.kind === 'unreachable') return said.unreachable;
  if (reply.kind === 'unreadable') return said.other;
  const special = own[reply.code];
  if (special !== undefined) return special;
  if (reply.waitSeconds !== undefined) return counted(said.wait, reply.waitSeconds);
  if (reply.code === 'PHONE_OUT_OF_SERVICE') return said.outOfService;
  return said.other;
}

// What a wrong try of the master passcode with no signal says (ADR-577): that it wasn't taken, or
// the wait its count put on, in seconds from now.
export function passcodeWrong(waitUntil: Date | null, now = new Date()): string {
  if (waitUntil === null) return words.refusals.passcode;
  const seconds = Math.max(1, Math.ceil((waitUntil.getTime() - now.getTime()) / 1000));
  return counted(words.refusals.passcodeWait, seconds);
}
