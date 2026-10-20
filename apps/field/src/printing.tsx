// A receipt printed, and printed again (ARCHITECTURE §12; REQ-314; BACKLOG 3.6.2; AC-04-97,
// AC-11-47, 48; ADR-115, 595): what a submitted ticket's or certification's screen says of its
// receipt, with "Print the receipt again"; and home's "Print a receipt again", the monitor's own
// submitted tickets and certifications on the project, newest first, each printed again with a
// press. **Printing writes nothing** (`phone/printing.ts`): no record, no audit row, no count.
import { Receipts, type Receipt, type ReceiptCopy } from '@open-adms/receipts';
import { useState, type ReactNode } from 'react';

import { Banner, Button, ListRow, StatusStrip, type Standing } from './look/index.ts';
import type { Printed, ReceiptPrinter } from './phone/printing.ts';
import { dayOf, say, timeOfDay, words } from './words.ts';

const said = words.printing;

// The copies' names, as a list in words: "Driver’s copy and Monitor’s copy".
export function copiesSaid(copies: readonly ReceiptCopy[]): string {
  return new Intl.ListFormat(words.language, { type: 'conjunction' }).format(
    copies.map((copy) => Receipts.copyName(copy)),
  );
}

// A print, said never to have thrown: a printer that fails says so, and the work goes on.
export async function printed(
  printer: ReceiptPrinter,
  receipt: Receipt,
  copies: readonly ReceiptCopy[],
): Promise<Printed> {
  try {
    return await printer.print(receipt, copies);
  } catch {
    return { kind: 'notPrinted' };
  }
}

// What a submitted screen says of its receipt, and its button to print it again.
export function ReceiptPrinted({
  printer,
  receipt,
  first,
}: {
  readonly printer: ReceiptPrinter;
  readonly receipt: Receipt;
  // What the print at submit came to; none yet while it prints, or where nothing printed.
  readonly first: Printed | null;
}) {
  const [now, setNow] = useState<Printed | null>(null);
  const [printing, setPrinting] = useState(false);
  const shown = now ?? first;
  const nothing = receipt.copies.length === 0;
  return (
    <>
      {nothing ? <p>{said.controlTicket}</p> : null}
      {shown === null ? null : shown.kind === 'printed' && shown.copies.length > 0 ? (
        <p role="status">{say(said.printed, { copies: copiesSaid(shown.copies) })}</p>
      ) : shown.kind === 'notPrinted' ? (
        <Banner tone="notice" announced>
          <p>{said.notPrinted}</p>
        </Banner>
      ) : null}
      <Button
        wide
        isDisabled={printing}
        onPress={() => {
          setPrinting(true);
          void printed(printer, receipt, Receipts.again(receipt)).then((answer) => {
            setNow(answer);
            setPrinting(false);
          });
        }}
      >
        {nothing ? said.print : said.again}
      </Button>
    </>
  );
}

// One receipt home may print again: a ticket or a certification the phone holds, by its title and
// number, when it was submitted.
export interface Reprintable {
  readonly id: string;
  readonly receipt: Receipt;
  readonly closedAt: string;
  readonly timeZone: string;
}

export function ReceiptsToPrint({
  printer,
  standing,
  receipts,
  onBack,
  below,
}: {
  readonly printer: ReceiptPrinter;
  readonly standing: Standing;
  readonly receipts: readonly Reprintable[];
  readonly onBack: () => void;
  readonly below?: ReactNode;
}) {
  const [last, setLast] = useState<{ readonly heading: string; readonly answer: Printed } | null>(
    null,
  );
  return (
    <main data-screen="receipts" className="screen">
      <StatusStrip standing={standing} />
      <div className="screen-body">
        <h1>{said.title}</h1>
        <p className="quiet">{said.about}</p>
        {last === null ? null : last.answer.kind === 'printed' ? (
          <p role="status">
            {say(said.printedAgain, {
              heading: last.heading,
              copies: copiesSaid(last.answer.copies),
            })}
          </p>
        ) : (
          <Banner tone="notice" announced>
            <p>{said.notPrinted}</p>
          </Banner>
        )}
        <ul className="list-rows">
          {receipts.map(({ id, receipt, closedAt, timeZone }) => (
            <li key={id}>
              <ListRow
                label={say(said.row, { title: receipt.title, number: receipt.heading })}
                detail={say(said.when, {
                  day: dayOf(new Date(closedAt), timeZone),
                  time: timeOfDay(new Date(closedAt), timeZone),
                })}
                onPress={() => {
                  void printed(printer, receipt, Receipts.again(receipt)).then((answer) => {
                    setLast({ heading: receipt.heading, answer });
                  });
                }}
              />
            </li>
          ))}
        </ul>
      </div>
      <div className="screen-actions">
        <Button main wide onPress={onBack}>
          {said.back}
        </Button>
      </div>
      {below}
    </main>
  );
}
