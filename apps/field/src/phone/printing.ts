// Printing a receipt on the phone (ARCHITECTURE §12; REQ-314, 321; BACKLOG 3.6.2; AC-04-97,
// AC-11-46…48; ADR-102, 115, 595). **The receipt is the receipts package's one content model**
// (`@open-adms/receipts`): this module only names what the phone recorded, from its lists, and
// hands the receipt to the phone's printer.
//
// - **Printed at submit, on every project** (no setting turns it off): a ticket's copies, or a
//   certification's itemised receipt. On a control-ticket project a collection prints none (the
//   control ticket is handed over and its stub kept); a disposal still prints the driver's copy,
//   or its monitor writes on the back of the driver's ticket instead (ADR-115).
// - **Never a record** (the user, Q-95 (Q6); AC-11-48): printing reads what the phone holds and
//   writes nothing, to the store, the outbox or the server; nothing counts it. So it is printed
//   again at any time, from home, while the phone holds the ticket (until it is turned in).
// - **The printer is the build's**: the browser build's is `PdfPrinter`, the receipt as a PDF the
//   browser saves (AC-11-47); the iPhone's and Android's send its ZPL over Bluetooth to a Zebra ZQ
//   through a native plugin on Zebra's SDK (3.8.3, 3.9.1). One that can't print says so and the
//   work goes on (ADR-052): it is printed again when the printer is ready.
import type { PhoneListsRecord } from '@open-adms/contracts';
import {
  Receipts,
  receiptsPdf,
  type Receipt,
  type ReceiptCopy,
  type ReceiptMonitor,
  type ReceiptTruck,
} from '@open-adms/receipts';

import type { PhoneCertification } from './certifications.ts';
import type { PhoneTicket } from './tickets.ts';

// What a print came to: the copies printed, or nothing printed (the printer not there or off).
export type Printed =
  | { readonly kind: 'printed'; readonly copies: readonly ReceiptCopy[] }
  | { readonly kind: 'notPrinted' };

export interface ReceiptPrinter {
  print(receipt: Receipt, copies: readonly ReceiptCopy[]): Promise<Printed>;
}

// What the browser build's printer hands a PDF to: by default, the browser, to save as a file.
export type SavePdf = (name: string, bytes: Uint8Array<ArrayBuffer>) => void;

function savedByTheBrowser(name: string, bytes: Uint8Array<ArrayBuffer>): void {
  const address = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = address;
  link.download = name;
  link.click();
  // Let go once the browser has it.
  setTimeout(() => {
    URL.revokeObjectURL(address);
  }, 10_000);
}

// The browser build's printer (ARCHITECTURE §12: "the browser test build prints to PDF"): each
// copy a page of one PDF, named by the bare number.
export class PdfPrinter implements ReceiptPrinter {
  private readonly save: SavePdf;

  constructor(save: SavePdf = savedByTheBrowser) {
    this.save = save;
  }

  print(receipt: Receipt, copies: readonly ReceiptCopy[]): Promise<Printed> {
    if (copies.length > 0) {
      this.save(
        `receipt-${receipt.barcode}.pdf`,
        receiptsPdf(copies.map((copy) => ({ receipt, copy }))),
      );
    }
    return Promise.resolve({ kind: 'printed', copies });
  }
}

// The truck or crew the badge loaded, as the phone's lists hold its certification.
function truckOf(ticket: PhoneTicket, lists: PhoneListsRecord): ReceiptTruck {
  const found = lists.certifications.find(({ certNumber }) => certNumber === ticket.certNumber);
  const sub = found?.secondTierSub ?? found?.firstTierSub ?? null;
  return {
    certNumber: ticket.certNumber,
    crew: found === undefined ? ticket.kind === 'UNIT_RATE' : found.kind === 'CREW',
    capacityCy: found?.capacityCy ?? null,
    prime: found?.prime.name ?? null,
    sub: sub?.name ?? null,
    keyedByHand: ticket.certKeyedByHand,
    typedCapacityCy: ticket.typedCapacityCy,
  };
}

// A ticket's receipt, from its field event as the phone holds it and the names its lists give.
export function ticketReceipt(
  ticket: PhoneTicket,
  lists: PhoneListsRecord,
  project: string,
  monitor: ReceiptMonitor,
): Receipt {
  const named = (id: string | null, from: readonly { id: string; name: string }[]) =>
    id === null ? null : (from.find((one) => one.id === id)?.name ?? null);
  const payItem = lists.payItems.find(({ id }) => id === ticket.payItemId);
  const payable = lists.payItems.find(({ payableType }) => payableType.id === ticket.payableTypeId);
  const hours = (payItem ?? payable)?.kindOfWork.countShape === 'ITEM_HOURS';
  const debrisTypes =
    ticket.workflow === 'HAUL_OUT' ? lists.debrisTypes.HAUL_OUT : lists.debrisTypes.LOAD;
  return Receipts.ofTicket({
    kind: ticket.kind,
    project,
    timeZone: ticket.timeZone,
    ticketNumber: ticket.ticketNumber,
    splitSuffix: ticket.splitSuffix,
    controlTicket:
      lists.numbering.ticketNumberSource === 'CONTROL' &&
      ticket.workflow !== 'UNIT_RATE' &&
      ticket.numberFrom !== 'MADE',
    truck: truckOf(ticket, lists),
    monitor,
    startedAt: new Date(ticket.startedAt),
    endedAt: ticket.endedAt === null ? null : new Date(ticket.endedAt),
    site: named(ticket.siteId, lists.sites),
    debrisType: named(ticket.formDebrisTypeId, debrisTypes),
    estimateCy: ticket.estimateCy,
    loadCall: ticket.loadCall,
    carriedCount: ticket.carriedCount,
    scaleReceipt: ticket.scaleReceipt,
    roeNumber: ticket.roeNumber,
    address: ticket.address,
    end: ticket.end,
    unitRate:
      ticket.kind === 'UNIT_RATE'
        ? {
            payableType: payable?.payableType.name ?? null,
            payItem: payItem?.code ?? null,
            count: ticket.unitCount,
            measurement:
              ticket.measurementInches !== null && ticket.measuredAs !== null
                ? { inches: ticket.measurementInches, as: ticket.measuredAs }
                : null,
            rootBallInches: ticket.rootBallInches,
            halfExposed: ticket.rootBallHalfExposed,
            surveyNumber: ticket.surveyNumber,
            ineligible: ticket.markedIneligible,
            items: ticket.items.map(({ itemNameId, quantity }) => ({
              name: named(itemNameId, lists.itemNames) ?? '',
              quantity,
              hours,
            })),
          }
        : null,
  });
}

// A certification's itemised receipt, from what its monitor entered on the phone.
export function certificationReceipt(
  certification: PhoneCertification,
  lists: PhoneListsRecord,
  project: string,
  monitor: ReceiptMonitor,
): Receipt {
  const named = (id: string | null, from: readonly { id: string; name: string }[]) =>
    id === null ? null : (from.find((one) => one.id === id)?.name ?? null);
  const crew = certification.kind === 'CREW';
  const tag = [certification.tagNumber, certification.tagState].filter((part) => part !== null);
  return Receipts.ofCertification({
    project,
    timeZone: certification.timeZone,
    certNumber: certification.certNumber,
    crew,
    prime: named(certification.primeId, lists.primes),
    sub: certification.secondTierSub ?? certification.firstTierSub,
    driver: certification.driverName,
    vehicle: crew
      ? named(certification.crewTypeId, lists.crewTypes)
      : (named(certification.vehicleTypeId, lists.vehicleTypes) ?? certification.vehicleTypeOther),
    tag: tag.length === 0 ? null : tag.join(' '),
    boxes: crew
      ? []
      : certification.boxes.map((box) => ({
          ...box,
          name: named(box.featureId, lists.vehicleFeatures) ?? box.featureOther,
        })),
    certifiedAt: new Date(certification.certifiedAt),
    monitor,
    helpers: certification.helperIds.flatMap((id) => named(id, lists.helpers) ?? []),
  });
}
