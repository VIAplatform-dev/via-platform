// Parcels, not pieces. Pure — no I/O.
//
// VYA records one order per piece (one-of-one inventory, one row per item), so a buyer who takes
// three things in one checkout is three orders. She posts ONE bag. Everything that counts, labels
// or marks "posted" should count the bag: that is what this groups. The key is the payment — every
// piece bought together shares a Stripe PaymentIntent — with a fallback for rows recorded without
// one (the same buyer, the same way home, paid within two minutes).
//
// Mirrored on the phone in mobile/lib/seller/parcels.ts. Keep the two in step.

export type ParcelOrder = {
 id: string;
 status: string;
 paymentIntent?: string | null;
 buyerEmail?: string | null;
 paidAt?: string | Date | null;
 deliveryMethod?: "ship" | "pickup";
 itemTitle?: string | null;
 amountCents?: number;
 currency?: string;
 trackingNumber?: string | null;
 trackingUrl?: string | null;
 labelUrl?: string | null;
 trackingEmailSentAt?: string | Date | null;
};

export type Parcel<T extends ParcelOrder = ParcelOrder> = {
 /** Stable within a list: the payment id, or the fallback bucket's first order id. */
 key: string;
 orders: T[];
 pieces: number;
 status: string;
 deliveryMethod: "ship" | "pickup";
 amountCents: number;
 currency: string | null;
 buyerEmail: string | null;
 paidAt: string | null;
 trackingNumber: string | null;
 trackingUrl: string | null;
 labelUrl: string | null;
};

const TWO_MINUTES = 2 * 60 * 1000;
const ms = (d: string | Date | null | undefined): number => (d ? new Date(d).getTime() : NaN);
const method = (o: ParcelOrder): "ship" | "pickup" => (o.deliveryMethod === "pickup" ? "pickup" : "ship");

/** The payment id when there is one; else a bucket id the grouping assigns. */
export function parcelKey(o: ParcelOrder): string {
 return o.paymentIntent ? `pi:${o.paymentIntent}` : `order:${o.id}`;
}

// Fulfilment, in order. A refunded piece has left the parcel; a parcel of nothing but refunds is
// refunded itself.
const RANK: Record<string, number> = { pending: 0, paid: 1, shipped: 2, delivered: 3, fulfilled: 3 };

/** The least-advanced piece decides: a bag with one piece still "paid" is still to post. */
export function parcelStatus(orders: ParcelOrder[]): string {
 const live = orders.filter((o) => o.status !== "refunded");
 if (!live.length) return orders.length ? "refunded" : "paid";
 return live.reduce((worst, o) => ((RANK[o.status] ?? 1) < (RANK[worst] ?? 1) ? o.status : worst), live[0].status);
}

/** Orders → parcels, each in the position of its first piece. Refunded pieces are dropped. */
export function groupIntoParcels<T extends ParcelOrder>(orders: T[]): Parcel<T>[] {
 const byKey = new Map<string, T[]>();
 const fallbacks: { key: string; email: string; method: "ship" | "pickup"; at: number }[] = [];
 for (const o of orders) {
  let key: string;
  if (o.paymentIntent) key = parcelKey(o);
  else {
   const email = String(o.buyerEmail ?? "").toLowerCase();
   const at = ms(o.paidAt);
   const m = method(o);
   const hit = email && Number.isFinite(at) ? fallbacks.find((f) => f.email === email && f.method === m && Math.abs(f.at - at) <= TWO_MINUTES) : undefined;
   if (hit) key = hit.key;
   else {
    key = parcelKey(o);
    if (email && Number.isFinite(at)) fallbacks.push({ key, email, method: m, at });
   }
  }
  const list = byKey.get(key);
  if (list) list.push(o); else byKey.set(key, [o]);
 }
 const out: Parcel<T>[] = [];
 for (const [key, all] of byKey) {
  const status = parcelStatus(all);
  const live = status === "refunded" ? all : all.filter((o) => o.status !== "refunded");
  const first = live[0];
  out.push({
   key,
   orders: live,
   pieces: live.length,
   status,
   deliveryMethod: method(first),
   amountCents: live.reduce((s, o) => s + (o.amountCents ?? 0), 0),
   currency: first.currency ?? null,
   buyerEmail: first.buyerEmail ?? null,
   paidAt: first.paidAt ? new Date(first.paidAt).toISOString() : null,
   trackingNumber: live.find((o) => o.trackingNumber)?.trackingNumber ?? null,
   trackingUrl: live.find((o) => o.trackingUrl)?.trackingUrl ?? null,
   labelUrl: live.find((o) => o.labelUrl)?.labelUrl ?? null,
  });
 }
 return out;
}

/** Bags on her table: paid, going by post. A collection is waiting for a person, not a postbag. */
export function parcelsToPost<T extends ParcelOrder>(parcels: Parcel<T>[]): Parcel<T>[] {
 return parcels.filter((p) => p.status === "paid" && p.deliveryMethod === "ship");
}

// "Packages", not "parcels" — the seller reading this is American and said so. The unit is
// unchanged: one bag for one buyer, however many pieces are in it.
export function parcelsToPostLabel(count: number): string {
 if (count === 0) return "Nothing to ship";
 return `${count} ${count === 1 ? "package" : "packages"} to ship`;
}

/**
 * One tracking email per bag. True only when there is a tracking number to give and no piece in
 * the bag has been emailed about — the per-order route and the parcel route both ask this, so a
 * buyer of three pieces gets one email whichever button the seller pressed.
 */
export function shouldSendParcelEmail(orders: ParcelOrder[]): boolean {
 if (orders.some((o) => o.trackingEmailSentAt)) return false;
 return orders.some((o) => o.trackingNumber);
}
