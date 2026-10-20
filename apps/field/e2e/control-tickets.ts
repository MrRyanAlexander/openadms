// The printable test set of control tickets (`pnpm field:control-tickets`; BACKLOG 3.6.2; REQ-315;
// AC-11-50; ADR-595): "Bayline County PARKS, Hurricane Delphine"'s 400001–400050, the first fifty
// of the load range the browser world enters for it (400001–405000), as a PDF of US Letter pages
// to print on paper and scan with each phone (3.6.3, 3.8.3, 3.9.1). Written into the repository's
// own cache, never committed: it is made again the same, byte for byte, whenever it is asked.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { controlTicketSheet } from '@open-adms/receipts';

const folder = fileURLToPath(new URL('../../../.cache/adms/', import.meta.url));
const set = {
  project: 'Bayline County PARKS, Hurricane Delphine',
  firstNumber: 400001,
  lastNumber: 400050,
};
const file = `${folder}control-tickets-${String(set.firstNumber)}-${String(set.lastNumber)}.pdf`;
mkdirSync(folder, { recursive: true });
writeFileSync(file, controlTicketSheet(set));
process.stdout.write(
  `The test set of control tickets, ${String(set.firstNumber)}–${String(set.lastNumber)} for ${set.project}: ${file}\n`,
);
