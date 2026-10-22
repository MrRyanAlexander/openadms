// Open ADMS receipts (ARCHITECTURE §12, §18; ADR-595): one receipt content model, rendered to ZPL
// for the Zebra and to PDF, its barcode Code 128 of the bare number; and the printable test set
// of control tickets. Shared by the field app and, for its receipt batch and the back office's
// other documents (the daily report, photo PDFs), the API: the PDF writer draws any page, in
// colour, with shapes and photographs, still with no dependency.
// Depends on `@open-adms/domain` alone (a certification's capacity).
export { Code128, quietModules } from './code128.ts';
export { controlTicketSheet, type ControlTicketSet } from './control-tickets.ts';
export { fitted, linesOf, textWidth } from './helvetica.ts';
export { jpegImage, pdfImageOf, pngImage, shownSize, type PdfImage } from './images.ts';
export {
  fittedIn,
  PdfPage,
  pdfOf,
  receiptPage,
  receiptPointsWide,
  receiptsPdf,
  winAnsi,
  type Drawn,
  type PagePoint,
  type Rgb,
} from './pdf.ts';
export {
  Receipts,
  printedWords,
  wrapped,
  type CertificationReceiptFacts,
  type PrintedBlock,
  type Receipt,
  type ReceiptBox,
  type ReceiptCopy,
  type ReceiptKind,
  type ReceiptLine,
  type ReceiptMonitor,
  type ReceiptScaleReceipt,
  type ReceiptSection,
  type ReceiptTruck,
  type ReceiptUnitRate,
  type ReceiptWords,
  type TicketReceiptFacts,
  type TicketReceiptKind,
} from './receipt.ts';
export { receiptLabel, receiptsZpl, zplText, zq620Paper, type ZebraPaper } from './zpl.ts';
