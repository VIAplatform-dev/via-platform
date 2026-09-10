// Sales tax on the checkout paths that actually run.
//
// WHY THIS EXISTS. Tax was implemented once, on the Stripe-hosted Checkout Session
// (app/api/storefront/checkout), using `automatic_tax`. Checkout then moved to the embedded Payment
// Element — item-intent and cart-intent, which build a PaymentIntent themselves — and the hosted
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
// registrations, on a direct charge — they remain merchant of record. VYA calculates nothing and
// owes nothing, exactly as the hosted route was written to do.

import { stripePost } from "./stripe";
import { getTaxSettings, stripeTaxReady } from "./store-tax-db";
import { taxCodeForItem, TAX_CODE_SHIPPING } from "./tax-codes";
import { taxBehaviorForSale } from "./tax-inclusive";

export type TaxableLine = {
 /** Stable id for this line — Stripe requires one per line item. */
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
 * Returns null — never throws — when the store hasn't enabled tax, hasn't finished Stripe Tax setup,
 * or when Stripe can't calculate. That is deliberate and matches the rule the hosted route was
 * written to: losing a sale is worse than not charging tax on it.
 */
export async function calculateSalesTax(opts: {
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

  // Stripe's form encoder wants indexed objects, not arrays — the same shape the hosted route used.
  const body: Record<string, unknown> = {
   currency,
   "customer_details[address][line1]": s(opts.ship.line1),
   "customer_details[address][line2]": s(opts.ship.line2),
   "customer_details[address][city]": s(opts.ship.city),
   "customer_details[address][state]": s(opts.ship.state),
   "customer_details[address][postal_code]": s(opts.ship.zip),
   "customer_details[address][country]": country,
   "customer_details[address_source]": "shipping",
  };
  opts.lines.forEach((l, i) => {
   body[`line_items[${i}][amount]`] = Math.max(0, Math.round(l.amountCents));
   body[`line_items[${i}][reference]`] = l.reference;
   body[`line_items[${i}][tax_behavior]`] = behavior;
   // Per ITEM, not per store: New York exempts clothing under $110 and PA/NJ exempt most apparel,
   // but none of that covers handbags, jewellery or sunglasses. One blanket code would under-collect
   // on bags — tax the seller owes and never charged.
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
export async function recordTaxTransaction(opts: { acctId: string; calculationId: string; reference: string }): Promise<boolean> {
 try {
  await stripePost(
   "tax/transactions/create_from_calculation",
   { calculation: opts.calculationId, reference: opts.reference },
   opts.acctId,
   `tax-txn-${opts.reference}`,
  );
  return true;
 } catch {
  return false; /* allow-swallow: the sale is done; reporting is retried by Stripe's own dashboard tools */
 }
}
