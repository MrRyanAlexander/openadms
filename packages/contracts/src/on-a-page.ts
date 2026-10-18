// Zod reads a payload faster by writing a function from a string (`new Function`) where it may,
// and finds out by trying when each schema is made. Our pages let no code be made from a string
// (the field app's policy, AC-11-61; ADR-565), so on a page Zod is told, before any schema here is
// made, never to try: the page then has nothing to refuse, and every payload is read the same,
// only without that shortcut. A server keeps it. `index.ts` imports this module first.
import { z } from 'zod';

if ('document' in globalThis) z.config({ jitless: true });
