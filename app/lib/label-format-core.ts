// What a shipping label comes out as, and where that choice is made.
//
// THE PROBLEM. We never told the carrier what we wanted, so it returned its default — for USPS
// that is an 8.5×11 PDF with the label occupying the top quarter and three-quarters of a blank
// page under it. Anyone with a thermal label printer (a Rollo, a DYMO, a Zebra — which is what a
// resale shop actually owns) got a page they had to scale, crop or scissor. On a phone it is worse
// still: there is no crop step, so the only path was AirPrint an A4 sheet and cut it out.
//
// A label printer wants a 4×6 image, and nothing else. That is one option on the shipment, set at
// creation because buying references the shipment by id.
//
// Pure: no network, no database, so the mapping can be read and tested on its own.

/** What the store prints on. */
export type LabelPrinter = "sheet" | "thermal";

export const LABEL_PRINTERS: { key: LabelPrinter; label: string; hint: string }[] = [
  { key: "thermal", label: "Label printer", hint: "4×6 — Rollo, DYMO, Zebra" },
  { key: "sheet", label: "Regular printer", hint: "Full page, cut it out" },
];

export function isLabelPrinter(v: unknown): v is LabelPrinter {
  return v === "sheet" || v === "thermal";
}

/**
 * The carrier options for a printer choice.
 *
 * PDF rather than PNG or ZPL, deliberately. ZPL is the native language of a Zebra and prints
 * pixel-perfect — but it is a text blob no phone, no email client and no Files app can display, so
 * a seller who opened it would see gibberish and think the label had failed. Every thermal printer
 * sold to a small shop prints a 4×6 PDF correctly through the normal print dialog. Correct
 * everywhere beats optimal on one device.
 *
 * `label_size` only means anything to USPS; other carriers ignore it, which is why it is safe to
 * send unconditionally.
 */
export function labelOptionsFor(printer: LabelPrinter): Record<string, string> {
  return printer === "thermal"
    ? { label_format: "PDF", label_size: "4x6" }
    : { label_format: "PDF" };
}

/** Shippo's spelling of the same idea. Its field is on the transaction, not the shipment. */
export function shippoLabelFileType(printer: LabelPrinter): string {
  return printer === "thermal" ? "PDF_4x6" : "PDF";
}

/** What to tell the seller she is about to get. */
export function labelFormatNote(printer: LabelPrinter): string {
  return printer === "thermal"
    ? "4×6, ready for a label printer."
    : "Full page — you'll need to cut it out.";
}

/**
 * A sensible default for a store that has never said.
 *
 * Sheet, not thermal. A 4×6 on an ordinary printer comes out tiny in the middle of a page and can
 * be genuinely unscannable; a full page on a thermal printer is merely annoying. When we are
 * guessing, guess the failure that is recoverable.
 */
export const DEFAULT_LABEL_PRINTER: LabelPrinter = "sheet";
