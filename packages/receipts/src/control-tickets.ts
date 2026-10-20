// The printable test set of control tickets (ARCHITECTURE §12; REQ-315; AC-11-50; the user, Q-95
// (Q4): "we need to have a better test case to run against a set of pre-printed control tickets
// we're able to actually print out on paper and use to test things"). A PDF of US Letter pages,
// five tickets a page, each a control ticket and its stub with the project's name, the number and
// its Code 128 barcode (the bare number, as a receipt's), the stub cut off along the dashes and
// kept by the monitor. **Marked as a test set on every page**, so it is never taken for a firm's
// stock. Its numbers are a project's control range as the setup entered it: the browser world's
// PARKS project takes 400001–405000 for its loads, and the set is 400001–400050 (`pnpm
// field:control-tickets`).
import { Code128, quietModules } from './code128.ts';
import { PdfPage, pdfOf } from './pdf.ts';
import { printedWords } from './receipt.ts';

const letter = { width: 612, height: 792 } as const;
const margin = 36;
const perPage = 5;
const ticketHeight = (letter.height - margin * 2) / perPage;
// Where the stub is torn off: a third of the way from the right.
const stubAt = margin + ((letter.width - margin * 2) * 2) / 3;

export interface ControlTicketSet {
  readonly project: string;
  readonly firstNumber: number;
  readonly lastNumber: number;
}

const said = printedWords.controlTickets;

const filled = (word: string, first: number, last: number) =>
  word.replace('{first}', String(first)).replace('{last}', String(last));

// A barcode as wide as it can be in a space, two points a module at the most.
function drawn(page: PdfPage, data: string, x: number, y: number, room: number, height: number) {
  const code = new Code128(data);
  const module = Math.min(2, room / (code.modules() + quietModules * 2));
  page.barcode(code, x + quietModules * module, y, module, height);
}

export function controlTicketSheet(set: ControlTicketSet): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(set.firstNumber) || set.lastNumber < set.firstNumber) {
    throw new Error('A test set runs from its first number up to its last.');
  }
  const numbers: string[] = [];
  for (let number = set.firstNumber; number <= set.lastNumber; number += 1) {
    numbers.push(String(number));
  }
  const pages: PdfPage[] = [];
  for (let at = 0; at < numbers.length; at += perPage) {
    const page = new PdfPage(letter.width, letter.height);
    page.text(margin, margin / 2, 8, false, filled(said.testSet, set.firstNumber, set.lastNumber));
    numbers.slice(at, at + perPage).forEach((number, row) => {
      const top = letter.height - margin - row * ticketHeight;
      // Its edge, and the dashes the stub tears along.
      page.bar(margin, top - ticketHeight, letter.width - margin * 2, 0.5);
      for (let y = top - ticketHeight; y < top; y += 6) page.bar(stubAt, y, 0.5, 3);
      page.text(margin + 8, top - 18, 10, true, said.title);
      page.text(margin + 8, top - 32, 8, false, set.project);
      page.text(margin + 8, top - 60, 22, true, number);
      drawn(page, number, margin + 8, top - ticketHeight + 14, stubAt - margin - 24, 50);
      page.text(stubAt + 8, top - 18, 8, false, said.stub);
      page.text(stubAt + 8, top - 40, 16, true, number);
      drawn(
        page,
        number,
        stubAt + 8,
        top - ticketHeight + 14,
        letter.width - margin - stubAt - 16,
        40,
      );
    });
    pages.push(page);
  }
  return pdfOf(pages);
}
