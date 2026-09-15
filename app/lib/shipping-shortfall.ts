// When a label costs more than the buyer paid for it, and whose fault that is. Pure, no I/O.
//
// WHY IT MATTERS THAT THE TWO ARE TOLD APART. The buyer's postage goes to VYA in the application
// fee and VYA buys the label, so every shortfall lands on VYA by default. There are two completely
// different reasons for one, and only one of them is the seller's:
//
//   · SHE UNDER-DECLARED THE PARCEL. The quote and the label are both built from the size on the
//     piece, so a coat listed as 8oz was quoted and posted as a small parcel. That is recoverable
//     from her, and the settings page says so.
//
//   · VYA PRICED IT THIN. The route, the size band, or the markup was wrong for this parcel. That
//     is ours, it is not billable to anybody, and the fix is to re-tune the table rather than to
//     send an invoice.
//
// Before this, both produced the same thing: one email to ops saying "thin shipping margin", with
// no record kept and no way to tell the two apart afterwards. So a seller who under-declared every
// parcel cost VYA money indefinitely and nothing accumulated against her name.
//
// WHAT THIS CANNOT SEE. A label is bought at the size the piece DECLARES, so the carrier accepts it
// and bills the correction weeks later as an adjustment. Nothing in VYA ingests those yet: there is
// no Shippo or EasyPost webhook. So this catches the shortfall that is visible at purchase, which
// is the unmeasured-piece case, and `carrier-adjustment` exists as a cause for the day those
// invoices are read in.

export type ShortfallCause =
 /** No weight and no dimensions on the piece, so the quote was a guess and the parcel was not. */
 | "unmeasured"
 /** The carrier re-rated after shipping. Only ever set from a carrier adjustment, never at purchase. */
 | "carrier-adjustment"
 /** Several pieces in one box: the combined parcel outgrew what the cart was quoted. */
 | "combined-parcel"
 /** Nothing wrong with the declaration. VYA's own price for this route was thin. */
 | "pricing";

export type Shortfall = {
 /** Positive cents VYA is out of pocket. Zero when the label came in at or under the quote. */
 shortfallCents: number;
 cause: ShortfallCause;
 /** Whether it is the seller's to cover. Only an unmeasured piece or a carrier re-rate ever is. */
 recoverable: boolean;
 /** One line for the ledger and for whoever reads it. */
 note: string;
};

export type ShortfallInput = {
 /** What the buyer paid for postage, in cents. */
 paidCents: number | null | undefined;
 /** What the label actually cost. */
 labelCostCents: number | null | undefined;
 /** The pieces in this shipment, as they were declared. */
 items: { weightOz?: number | null; lengthIn?: number | null; widthIn?: number | null; heightIn?: number | null }[];
 /** Set when a carrier invoice re-rated a parcel after it shipped. */
 fromCarrierAdjustment?: boolean;
};

const cents = (v: unknown): number => {
 const n = Math.round(Number(v));
 return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Did the seller give this piece a size at all? One real figure is enough. */
export function isDeclared(it: { weightOz?: number | null; lengthIn?: number | null; widthIn?: number | null; heightIn?: number | null }): boolean {
 const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
 return n(it.weightOz) > 0 || n(it.lengthIn) + n(it.widthIn) + n(it.heightIn) > 0;
}

/**
 * What this order cost VYA beyond what the buyer paid, and whether anyone can be billed for it.
 *
 * A shortfall of zero is the normal case and still returns a row-shaped answer, so a caller can
 * log every order and let the ledger decide what is worth keeping.
 */
export function classifyShortfall(input: ShortfallInput): Shortfall {
 const paid = cents(input.paidCents);
 const cost = cents(input.labelCostCents);
 const shortfallCents = Math.max(0, cost - paid);

 if (shortfallCents === 0) {
  return { shortfallCents: 0, cause: "pricing", recoverable: false, note: "The postage covered the label." };
 }

 // A carrier re-rate is the seller's by definition: the carrier weighed the parcel and disagreed
 // with what she wrote on it.
 if (input.fromCarrierAdjustment) {
  return {
   shortfallCents,
   cause: "carrier-adjustment",
   recoverable: true,
   note: "The carrier re-rated this parcel after it shipped. It was bigger or heavier than the piece said.",
  };
 }

 const items = (input.items || []).filter(Boolean);
 const unmeasured = items.filter((it) => !isDeclared(it));

 // Nothing on the piece at all: the quote came from a category default and the box did not. This
 // is the one she can prevent, and the one the app warns her about on Review.
 if (unmeasured.length > 0) {
  const all = unmeasured.length === items.length;
  return {
   shortfallCents,
   cause: "unmeasured",
   recoverable: true,
   note: all
    ? "Nothing on the piece had a weight or measurements, so the postage was priced off a category guess."
    : `${unmeasured.length} of ${items.length} pieces had no weight or measurements, so the parcel was priced off a guess.`,
  };
 }

 // Every piece was measured and there is more than one of them: the combined box outgrew the
 // quote. That is VYA's arithmetic, not her declaration.
 if (items.length > 1) {
  return {
   shortfallCents,
   cause: "combined-parcel",
   recoverable: false,
   note: `${items.length} pieces went in one box and the combined parcel cost more than the cart was quoted.`,
  };
 }

 // Measured, single piece, still short. Nothing was misdeclared: the price was wrong.
 return {
  shortfallCents,
  cause: "pricing",
  recoverable: false,
  note: "The piece was measured and the postage still didn't cover the label. VYA's price for this route is thin.",
 };
}

/** "£4.20 recoverable from the seller" / "£1.10, ours". For the ledger's summary line. */
export function describeShortfall(s: Shortfall, format: (cents: number) => string): string {
 if (s.shortfallCents === 0) return "No shortfall.";
 return `${format(s.shortfallCents)} ${s.recoverable ? "to recover from the seller" : "ours to absorb"}: ${s.note}`;
}
