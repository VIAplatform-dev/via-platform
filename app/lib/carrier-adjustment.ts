// Reading a carrier's "we re-weighed it and you owe us more" message. Pure, no I/O.
//
// WHAT THIS IS FOR. A label is bought at the size the PIECE declares, so the carrier accepts it and
// says nothing. Days or weeks later it puts the parcel on its own scale, finds a coat where the
// label said 8oz, and bills the difference. That invoice goes to whoever bought the label, which is
// VYA. Until this existed nothing in VYA read those at all, so a seller who under-declared every
// parcel cost money indefinitely and nobody could see it.
//
// TWO PROVIDERS, ONE SHAPE. Shippo is the live one (ship-provider.ts defaults to it) and EasyPost is
// wired for when it isn't, so both are parsed here rather than in the route.
//
//   EasyPost: a real event for exactly this. `shipment.invoice.created` / `.updated`, carrying a
//             ShipmentInvoice with the adjustment on it.
//   Shippo:   no adjustment event exists. Its list is transaction_created, transaction_updated,
//             track_updated, batch_created, batch_purchased. So a re-rate arrives as
//             `transaction_updated` with a changed amount, and the caller compares it to what was
//             recorded at purchase.
//
// THE FIELD NAMES ARE DEFENSIVE ON PURPOSE. EasyPost documents the two event names but not the
// ShipmentInvoice body, so the amount is read from any of the shapes it plausibly uses and the
// route logs anything this returns null for. Better a logged payload we can tighten against than a
// confident parse of a guess: this decides whether a seller gets billed.

export type CarrierAdjustment = {
 provider: "easypost" | "shippo";
 /** The carrier's id for the shipment. Matches shippo_labels.transaction_id. */
 shipmentId: string;
 /** What the label cost in the end, when the payload says. Null when only a delta is given. */
 finalCents: number | null;
 /** The extra, when the payload states it directly. Null when only a final total is given. */
 adjustmentCents: number | null;
 /** The carrier's words for why, when it gives them. */
 reason: string | null;
};

/** Money arrives as "12.40", 12.4, or 1240 depending on who is talking. Dollars unless told cents. */
function money(v: unknown, alreadyCents = false): number | null {
 if (v === null || v === undefined || v === "") return null;
 const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
 if (!Number.isFinite(n)) return null;
 return alreadyCents ? Math.round(n) : Math.round(n * 100);
}

const str = (v: unknown): string | null => {
 const s = String(v ?? "").trim();
 return s ? s.slice(0, 300) : null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseEasyPost(body: any): CarrierAdjustment | null {
 const description = String(body?.description ?? "");
 if (!description.startsWith("shipment.invoice.")) return null;
 const r = body?.result ?? {};

 const shipmentId = str(r.shipment_id ?? r.shipment?.id ?? r.id);
 if (!shipmentId) return null;

 // Whichever it gives. A stated adjustment is preferred: it is the carrier's own arithmetic rather
 // than ours, and it survives a label that was already partly adjusted once.
 const adjustmentCents = money(r.adjustment_amount ?? r.adjustment ?? r.difference_amount);
 const finalCents = money(r.final_amount ?? r.amount ?? r.total_amount ?? r.invoice_amount);
 if (adjustmentCents === null && finalCents === null) return null;

 return {
  provider: "easypost",
  shipmentId,
  finalCents,
  adjustmentCents,
  reason: str(r.adjustment_reason ?? r.reason ?? r.description),
 };
}

function parseShippo(body: any): CarrierAdjustment | null {
 const event = String(body?.event ?? body?.type ?? "");
 if (event && event !== "transaction_updated" && event !== "all") return null;
 // Shippo posts the object itself under `data` on a subscription, and bare on some older hooks.
 const t = body?.data ?? body;
 const shipmentId = str(t?.object_id);
 if (!shipmentId) return null;
 // Shippo has no adjustment field: it restates the transaction. The final amount is all there is,
 // and the caller works out the delta from what it recorded when the label was bought.
 const finalCents = money(t?.amount ?? t?.rate?.amount);
 if (finalCents === null) return null;
 return {
  provider: "shippo",
  shipmentId,
  finalCents,
  adjustmentCents: null,
  reason: str(t?.messages?.[0]?.text ?? t?.status_details),
 };
}

/**
 * A carrier adjustment out of a webhook body, or null when this payload is not one.
 *
 * Null is the ordinary answer: most events are tracking updates. The route logs null results ONLY
 * when the body looked like it was meant to be an adjustment, so an unrecognised ShipmentInvoice
 * shape surfaces instead of being dropped.
 */
export function parseCarrierAdjustment(body: unknown): CarrierAdjustment | null {
 if (!body || typeof body !== "object") return null;
 return parseEasyPost(body) ?? parseShippo(body);
}

/** Did this body claim to be an adjustment, whether or not we could read it? For the "log it" rule. */
export function looksLikeAdjustment(body: unknown): boolean {
 if (!body || typeof body !== "object") return false;
 const b = body as any;
 return String(b.description ?? "").startsWith("shipment.invoice.") || String(b.event ?? "") === "transaction_updated";
}

/**
 * What the label cost in the end, given what we recorded when we bought it.
 *
 * `null` means the payload told us nothing usable and the caller must not write a debt from it.
 * Only an INCREASE counts: carriers issue credits too, and a refund is not something to bill a
 * seller for.
 */
export function adjustedTotalCents(a: CarrierAdjustment, recordedCostCents: number | null | undefined): number | null {
 const recorded = Math.max(0, Math.round(Number(recordedCostCents) || 0));
 if (a.adjustmentCents !== null) {
  return a.adjustmentCents > 0 ? recorded + a.adjustmentCents : null;
 }
 if (a.finalCents !== null) {
  return a.finalCents > recorded ? a.finalCents : null;
 }
 return null;
}
