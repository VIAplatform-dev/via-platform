/**
 * A shopper's bag, as an abandoned cart the store's own email tool can act on. Pure.
 *
 * WHY THIS IS THE ONE THAT MATTERS. Abandoned-cart flows are most of the reason a vintage shop pays
 * for Klaviyo or Mailchimp at all: somebody put a £400 jacket in a bag and walked away, and one
 * email brings a good share of them back. VYA had the whole client for it — syncCart, deleteCart,
 * the Mailchimp cart shape — written, tested and called by absolutely nothing.
 *
 * A CART WITH NO NAME CANNOT BE EMAILED. The bag is a cookie; the shopper is only a person once she
 * has signed in to that store. So this returns null without an email rather than inventing an
 * identity, and the caller simply doesn't sync. That is also why it belongs with the sign-in work:
 * before store accounts existed there was nobody to send to.
 *
 * ONE CART PER SHOPPER PER STORE. The id is derived from both, so a second bag does not appear every
 * time a cookie rotates — an inbox with four "you left something behind" emails for one jacket is
 * worse than none.
 */
import type { CommerceOrder } from "./esp-commerce";

export type BagLine = { id: string; priceCents: number; currency?: string | null; available?: boolean };

/** Stable per shopper per store, and safe in a URL path. */
export function cartId(storeSlug: string, email: string): string {
 const who = String(email || "").trim().toLowerCase().replace(/[^a-z0-9_.@-]/g, "-").slice(0, 60);
 return `${String(storeSlug || "").slice(0, 40)}-${who}`.slice(0, 100);
}

/**
 * The bag as a cart, or null when there is nothing to send.
 *
 * Sold and unavailable pieces are dropped: on one-of-one stock the bag routinely holds something
 * that went while she was deciding, and "come back for this" about a piece that is gone is the worst
 * email a vintage shop can send.
 */
export function bagToCart(
 storeSlug: string,
 email: string | null | undefined,
 lines: BagLine[],
 opts: { name?: string | null; subscribed?: boolean } = {},
): CommerceOrder | null {
 const who = String(email || "").trim().toLowerCase();
 if (!who || !who.includes("@")) return null;

 const live = (Array.isArray(lines) ? lines : []).filter((l) => l && l.id && l.available !== false);
 if (!live.length) return null;

 const totalCents = live.reduce((n, l) => n + (Number(l.priceCents) || 0), 0);
 return {
  id: cartId(storeSlug, who),
  customer: {
   email: who,
   name: opts.name ?? null,
   // Her customer at this store, and a cart is not consent to market — the subscription state comes
   // from the contact record, not from having a bag.
   subscribed: opts.subscribed === true,
  },
  totalCents,
  currency: live.find((l) => l.currency)?.currency || "USD",
  lines: live.map((l) => ({ id: String(l.id), productId: String(l.id), priceCents: Number(l.priceCents) || 0, quantity: 1 })),
 };
}
