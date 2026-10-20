// Open ADMS receipts (ARCHITECTURE §12, §18; ADR-595): one receipt content model, rendered to ZPL
// for the Zebra and to PDF, its barcode Code 128 of the bare number; and the printable test set
// of control tickets. Shared by the field app and, for its receipt batch, the back office.
// Depends on `@open-adms/domain` alone (a certification's capacity).
export { Code128, quietModules } from './code128.ts';
export { controlTicketSheet, type ControlTicketSet } from './control-tickets.ts';
export { PdfPage, pdfOf, receiptPage, receiptPointsWide, receiptsPdf, winAnsi } from './pdf.ts';
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
