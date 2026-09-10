// WHO a discount is for, and WHAT it comes off.
//
// A code used to be one number: X% off whatever the total was, for anyone, on anything. The two
// things a seller actually asks for are narrower — "20% off the dresses" and "50% off for people who
// haven't bought from me in six months" — and neither was expressible.
//
// The arithmetic lives here, pure and away from any database, because it decides what a buyer is
// charged and four separate places have to agree on it: the code box the buyer types into, single
// item checkout, cart checkout, and anything that comes later. Where those disagree, the price shown
// is not the price taken, which is the worst bug a checkout can have.

/** One thing in the bag. `itemId` is what a product-scoped code is matched against. */
export type OrderLine = { itemId: string; amountCents: number };

/** Who may use a code. `lapsed` includes someone who has never bought — a shop asking for people who
 *  "haven't bought in six months" means them too. */
export type DiscountAudience = "all" | "new" | "lapsed";

export type DiscountRule = {
 kind: string;
 value: number | null;
 /** Item ids this code applies to. Empty/absent = the whole order. */
 itemIds?: string[] | null;
 audience?: DiscountAudience | null;
 /** For `lapsed`: how long since their last order counts as lapsed. */
 lapsedDays?: number | null;
};

export type DiscountOutcome = {
 offCents: number;
 freeShipping: boolean;
 /** What the code was allowed to act on — the whole subtotal, or just the named pieces. */
 eligibleCents: number;
 /** Set when the code is valid for this store but does nothing for THIS order. */
 refusal: string | null;
};

const money = (cents: number) => `$${Math.round(cents / 100)}`;

/** The part of this order a code is allowed to touch. */
export function eligibleLines(rule: DiscountRule, lines: OrderLine[]): OrderLine[] {
 const only = (rule.itemIds ?? []).filter(Boolean);
 if (!only.length) return lines;
 const want = new Set(only.map(String));
 return lines.filter((l) => want.has(String(l.itemId)));
}

/**
 * What a code takes off THIS order.
 *
 * A product-scoped code is worked out on the pieces it names and nothing else: 20% off a £100 dress
 * is £20, whatever else is in the bag. A code that names pieces none of which are in the bag is
 * refused rather than silently applied to zero — "it did nothing" and "it isn't for these pieces"
 * look identical on a receipt and only one of them is honest.
 */
export function computeOrderDiscount(rule: DiscountRule, lines: OrderLine[]): DiscountOutcome {
 const scoped = eligibleLines(rule, lines);
 const eligibleCents = scoped.reduce((s, l) => s + Math.max(0, Math.round(l.amountCents)), 0);
 const none = (refusal: string): DiscountOutcome => ({ offCents: 0, freeShipping: false, eligibleCents, refusal });

 if ((rule.itemIds ?? []).length && scoped.length === 0) {
  return none("That code is for particular pieces, and none of them are in your bag.");
 }
 if (rule.kind === "free_shipping") return { offCents: 0, freeShipping: true, eligibleCents, refusal: null };

 const v = rule.value ?? 0;
 if (v <= 0) return none("That code hasn’t been set up with an amount yet.");

 if (rule.kind === "percent") {
  const off = Math.min(eligibleCents, Math.max(0, Math.round((eligibleCents * v) / 100)));
  return { offCents: off, freeShipping: false, eligibleCents, refusal: null };
 }
 if (rule.kind === "fixed") {
  // Capped at what the code may act on, never at the whole order — a £25-off-dresses code cannot
  // eat into the bag sitting next to it.
  const off = Math.min(eligibleCents, Math.max(0, Math.round(v * 100)));
  return { offCents: off, freeShipping: false, eligibleCents, refusal: null };
 }
 return none("That code can’t be applied here.");
}

/**
 * May this buyer use this code, given when they last bought from this store?
 *
 * `lastOrderAt` is null for someone who has never ordered. Kept separate from the arithmetic above so
 * the rule can be tested without a database, and so the same rule answers the buyer's code box and
 * the payment itself — those two disagreeing is how a shopper gets quoted one price and charged another.
 */
export function audienceAllows(
 rule: DiscountRule,
 buyer: { lastOrderAt: Date | string | null; email?: string | null },
 now: Date = new Date(),
): { ok: boolean; refusal: string | null } {
 const aud = rule.audience ?? "all";
 if (aud === "all") return { ok: true, refusal: null };
 if (!buyer.email) return { ok: false, refusal: "Add your email to use this code." };

 const last = buyer.lastOrderAt ? new Date(buyer.lastOrderAt) : null;
 const everBought = !!last && !Number.isNaN(last.getTime());

 if (aud === "new") {
  return everBought
   ? { ok: false, refusal: "That code is for a first order." }
   : { ok: true, refusal: null };
 }
 // lapsed — never bought counts, which is what "haven't bought in six months" means to a shop.
 if (!everBought) return { ok: true, refusal: null };
 const days = Math.max(1, Math.round(rule.lapsedDays ?? 180));
 const cutoff = new Date(now.getTime() - days * 86_400_000);
 return last! <= cutoff
  ? { ok: true, refusal: null }
  : { ok: false, refusal: `That code is for customers who haven’t ordered in ${days >= 60 ? `${Math.round(days / 30)} months` : `${days} days`}.` };
}

/** One answer for "can this code be used, and for how much". */
export function applyDiscountToOrder(
 rule: DiscountRule,
 lines: OrderLine[],
 buyer: { lastOrderAt: Date | string | null; email?: string | null },
 now?: Date,
): DiscountOutcome {
 const who = audienceAllows(rule, buyer, now);
 if (!who.ok) {
  return { offCents: 0, freeShipping: false, eligibleCents: 0, refusal: who.refusal };
 }
 return computeOrderDiscount(rule, lines);
}

/** How a seller's rule reads back to her in the discounts table. */
export function describeScope(rule: DiscountRule, itemNames?: Map<string, string>): string {
 const parts: string[] = [];
 const ids = (rule.itemIds ?? []).filter(Boolean);
 if (ids.length === 1) parts.push(`only ${itemNames?.get(String(ids[0])) ?? "1 piece"}`);
 else if (ids.length > 1) parts.push(`only ${ids.length} pieces`);
 const aud = rule.audience ?? "all";
 if (aud === "new") parts.push("first order only");
 if (aud === "lapsed") {
  const d = Math.max(1, Math.round(rule.lapsedDays ?? 180));
  parts.push(`not ordered in ${d >= 60 ? `${Math.round(d / 30)} months` : `${d} days`}`);
 }
 return parts.join(" · ");
}

export { money as _money };
