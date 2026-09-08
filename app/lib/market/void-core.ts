// Whether a stall sale can be undone, and what undoing it means. Pure — no I/O.
//
// A void at the stall is a refund with the customer standing there: the cash goes back out of
// the tin, or the card payment is refunded, and the piece goes back on the rack. Only the acting
// seller's own market sales, only while it is still "today" — the open session, or the last 24
// hours of a closed one. Anything older is a return, which is the Orders page's job.

export const VOID_WINDOW_MS = 24 * 3_600_000;

export type VoidableSale = {
 status: string;
 tender: string | null;
 paidAt: string | null;
 sessionId: string | null;
 stripePaymentIntent: string | null;
};

export type VoidEligibility =
 | { ok: true; kind: "cash" | "card" }
 | { ok: false; alreadyVoided?: true; reason: string };

export function voidEligibility(sale: VoidableSale, ctx: { openSessionId: string | null; now?: Date }): VoidEligibility {
 if (sale.status === "refunded") return { ok: false, alreadyVoided: true, reason: "Already voided" };
 if (sale.status !== "paid") return { ok: false, reason: `This sale is ${sale.status}, so there's nothing to void.` };
 const inOpenSession = !!ctx.openSessionId && sale.sessionId === ctx.openSessionId;
 if (!inOpenSession) {
  const now = (ctx.now ?? new Date()).getTime();
  const paid = sale.paidAt ? new Date(sale.paidAt).getTime() : NaN;
  if (!Number.isFinite(paid) || now - paid > VOID_WINDOW_MS) return { ok: false, reason: "Only sales from the last 24 hours can be voided here — older ones are refunded from Orders." };
 }
 if (sale.tender === "cash") return { ok: true, kind: "cash" };
 if (!sale.stripePaymentIntent) return { ok: false, reason: "There's no card payment on record for this sale, so it can't be refunded from here." };
 return { ok: true, kind: "card" };
}

const money = (cents: number, currency: string) => {
 const whole = cents % 100 === 0;
 return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
};

/** What the confirm says. Money first, then the piece. */
export function describeVoid(v: { kind: "cash" | "card"; amountCents: number; currency: string }): string {
 const amt = money(v.amountCents, v.currency);
 return v.kind === "cash"
  ? `Cash: ${amt} comes off the tin. Piece goes back on the rack.`
  : `Card: ${amt} is refunded to their card. Piece goes back on the rack.`;
}
