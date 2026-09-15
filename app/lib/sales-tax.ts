// Sales tax on the checkout paths that actually run.
//
// WHY THIS EXISTS. Tax was implemented once, on the Stripe-hosted Checkout Session
// (app/api/storefront/checkout), using `automatic_tax`. Checkout then moved to the embedded Payment
// Element, item-intent and cart-intent, which build a PaymentIntent themselves, and the hosted
// route was left with no callers at all. So a seller could switch tax on, finish Stripe Tax
// registration, see it confirmed, and never charge a penny of tax on any sale. The setting was real,
// the screen was real, and the only code that honoured it was unreachable.
//
// `automatic_tax` is a Checkout/Invoice feature; a PaymentIntent has no equivalent. The supported
// route is the Tax Calculation API: ask Stripe what the tax is, add it to the amount you charge, and
// after the payment succeeds turn that calculation into a Tax Transaction so it lands in the
// seller's Stripe Tax reporting (see recordTaxTransaction, called from the webhook).
//
// LIABILITY IS UNCHANGED. The calculation runs on the SELLER's connected account, against THEIR
// registrations, on a direct charge. They remain merchant of record. VYA calculates nothing and
// owes nothing, exactly as the hosted route was written to do.

import { stripePost } from "./stripe";
import { getTaxSettings, stripeTaxReady } from "./store-tax-db";
import { taxCodeForItem, TAX_CODE_SHIPPING } from "./tax-codes";
import { taxBehaviorForSale } from "./tax-inclusive";

export type TaxableLine = {
 /** Stable id for this line. Stripe requires one per line item. */
 reference: string;
 amountCents: number;
 title: string;
 category: string | null;
};

export type SalesTax = {
 /** What to ADD to the charge. Zero where the price already includes tax, which is not a failure:
  *  a UK seller's "200" means £200 all in, so the buyer pays 200 and the VAT is carved out of it. */
 addCents: number;
 /** Stripe's calculation id, to be turned into a Tax Transaction once the payment succeeds. */
 calculationId: string | null;
 behavior: "inclusive" | "exclusive";
};

export type TaxAddress = { line1?: unknown; line2?: unknown; city?: unknown; state?: unknown; zip?: unknown; country?: unknown };

const s = (v: unknown) => String(v ?? "").trim();

/**
 * What tax this sale owes, or null when there is none to add.
 *
 * Returns null, never throws, when the store hasn't enabled tax, hasn't finished Stripe Tax setup,
 * or when Stripe can't calculate. That is deliberate and matches the rule the hosted route was
 * written to: losing a sale is worse than not charging tax on it.
 */
export async function calculateSalesTax(opts: {
 /** "shipping" for a parcel, "billing" for a sale handed over in person. See below. */
 addressSource?: "shipping" | "billing";
 slug: string;
 acctId: string;
 currency: string;
 lines: TaxableLine[];
 shippingCents: number;
 ship: TaxAddress;
}): Promise<SalesTax | null> {
 try {
  if (!opts.lines.length) return null;
  const pref = await getTaxSettings(opts.slug).catch(() => ({ enabled: false, productTaxCode: null as string | null }));
  if (!pref.enabled) return null;
  // An account that never finished setup can fail the call outright; ask first.
  const ready = await stripeTaxReady(opts.acctId).catch(() => ({ active: false, registrations: 0, country: null as string | null }));
  if (!ready.active) return null;

  const country = s(opts.ship.country) || "US";
  const behavior = taxBehaviorForSale(ready.country, country);
  const currency = (opts.currency || "usd").toLowerCase();

  // Stripe's form encoder wants indexed objects, not arrays. The same shape the hosted route used.
  const body: Record<string, unknown> = {
   currency,
   "customer_details[address][line1]": s(opts.ship.line1),
   "customer_details[address][line2]": s(opts.ship.line2),
   "customer_details[address][city]": s(opts.ship.city),
   "customer_details[address][state]": s(opts.ship.state),
   "customer_details[address][postal_code]": s(opts.ship.zip),
   "customer_details[address][country]": country,
   // WHERE THE SALE HAPPENED, which is not always a delivery. A parcel is taxed at the address it
  // goes to ("shipping"); a piece handed over at a market stall is taxed where it was handed over,
  // and that address is the seller's own. Passing "shipping" for an in-person sale would tell
  // Stripe a parcel was posted to the seller's own studio.
  "customer_details[address_source]": opts.addressSource ?? "shipping",
  };
  opts.lines.forEach((l, i) => {
   body[`line_items[${i}][amount]`] = Math.max(0, Math.round(l.amountCents));
   body[`line_items[${i}][reference]`] = l.reference;
   body[`line_items[${i}][tax_behavior]`] = behavior;
   // Per ITEM, not per store: New York exempts clothing under $110 and PA/NJ exempt most apparel,
   // but none of that covers handbags, jewellery or sunglasses. One blanket code would under-collect
   // on bags. Tax the seller owes and never charged.
   body[`line_items[${i}][tax_code]`] = pref.productTaxCode || taxCodeForItem(l.category, l.title);
  });
  if (opts.shippingCents > 0) {
   body["shipping_cost[amount]"] = Math.round(opts.shippingCents);
   body["shipping_cost[tax_behavior]"] = behavior;
   body["shipping_cost[tax_code]"] = TAX_CODE_SHIPPING;
  }

  const calc = await stripePost("tax/calculations", body, opts.acctId) as { id?: string; tax_amount_exclusive?: number };
  // Only the EXCLUSIVE part is added. Inclusive tax is already inside the price the buyer was shown,
  // so adding it would charge the tax twice.
  const addCents = Math.max(0, Math.round(Number(calc?.tax_amount_exclusive) || 0));
  return { addCents, calculationId: calc?.id ?? null, behavior };
 } catch {
  return null; /* allow-swallow: tax must never be the reason a sale fails */
 }
}

/**
 * Turn a calculation into a Tax Transaction, once the money is actually taken.
 *
 * Without this the tax is collected but never appears in the seller's Stripe Tax reports, which is
 * the half of the job that matters at filing time. Idempotent on `reference` (the PaymentIntent id),
 * so a webhook delivered twice records one transaction.
 */
export async function recordTaxTransaction(opts: { acctId: string; calculationId: string; reference: string }): Promise<string | null> {
 try {
  const txn = await stripePost(
   "tax/transactions/create_from_calculation",
   { calculation: opts.calculationId, reference: opts.reference },
   opts.acctId,
   `tax-txn-${opts.reference}`,
  ) as { id?: string };
  // The id is returned now, not discarded: a refund has to reverse this exact transaction, and
  // Stripe offers no way to look one up by the reference we gave it.
  return typeof txn?.id === "string" ? txn.id : null;
 } catch {
  return null; /* allow-swallow: the sale is done; reporting is retried by Stripe's own dashboard tools */
 }
}

/**
 * Undo a tax transaction when the order behind it is refunded.
 *
 * THE OTHER HALF OF FILING, AND IT WAS MISSING. A refund reversed the payout, VYA's fee, the
 * consignment credit and the shipping label, and left the tax transaction standing. So the seller's
 * Stripe Tax report kept counting tax on a sale that no longer existed, and she would have filed
 * and PAID tax she had already handed back to the buyer. Nobody would notice until a return.
 *
 * Full reversal only. VYA refunds the item and deducts fees from what the SELLER keeps; the buyer
 * is never charged tax on a restocking fee, so there is no partial case to model.
 *
 * Idempotent on the reference, so a double-clicked refund files one reversal.
 */
export async function reverseTaxTransaction(opts: { acctId: string; transactionId: string; reference: string }): Promise<boolean> {
 if (!opts.transactionId) return false;
 try {
  await stripePost(
   "tax/transactions/create_reversal",
   { mode: "full", original_transaction: opts.transactionId, reference: `refund-${opts.reference}` },
   opts.acctId,
   `tax-rev-${opts.reference}`,
  );
  return true;
 } catch {
  return false; /* allow-swallow: the buyer has their money back; reporting can be corrected after */
 }
}
