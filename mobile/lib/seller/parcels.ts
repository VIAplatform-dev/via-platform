// Parcels, not pieces — the phone's mirror of app/lib/parcels-core.ts. Pure.
//
// VYA records one order per piece; she posts one bag. Orders bought together share a payment id,
// and that is the key. Rows without one (recorded before it was kept) fall back to the same buyer,
// the same way home, paid within two minutes. Keep this in step with the web module.

export type ParcelOrder = {
  id: string;
  status: string;
  paymentIntent?: string | null;
  buyerEmail?: string | null;
  paidAt?: string | null;
  deliveryMethod?: "ship" | "pickup";
  itemTitle?: string | null;
  amountCents?: number;
  currency?: string;
  trackingNumber?: string | null;
  labelUrl?: string | null;
};

export type Parcel<T extends ParcelOrder = ParcelOrder> = {
  key: string;
  orders: T[];
  pieces: number;
  status: string;
  deliveryMethod: "ship" | "pickup";
  amountCents: number;
  currency: string | null;
  buyerEmail: string | null;
  trackingNumber: string | null;
  labelUrl: string | null;
};

const TWO_MINUTES = 2 * 60 * 1000;
const RANK: Record<string, number> = { pending: 0, paid: 1, shipped: 2, delivered: 3, fulfilled: 3 };
const method = (o: ParcelOrder): "ship" | "pickup" => (o.deliveryMethod === "pickup" ? "pickup" : "ship");

export function parcelStatus(orders: ParcelOrder[]): string {
  const live = orders.filter((o) => o.status !== "refunded");
  if (!live.length) return orders.length ? "refunded" : "paid";
  return live.reduce((worst, o) => ((RANK[o.status] ?? 1) < (RANK[worst] ?? 1) ? o.status : worst), live[0].status);
}

export function groupIntoParcels<T extends ParcelOrder>(orders: T[]): Parcel<T>[] {
  const byKey = new Map<string, T[]>();
  const fallbacks: { key: string; email: string; method: "ship" | "pickup"; at: number }[] = [];
  for (const o of orders) {
    let key: string;
    if (o.paymentIntent) key = `pi:${o.paymentIntent}`;
    else {
      const email = String(o.buyerEmail ?? "").toLowerCase();
      const at = o.paidAt ? new Date(o.paidAt).getTime() : NaN;
      const m = method(o);
      const hit = email && Number.isFinite(at) ? fallbacks.find((f) => f.email === email && f.method === m && Math.abs(f.at - at) <= TWO_MINUTES) : undefined;
      if (hit) key = hit.key;
      else {
        key = `order:${o.id}`;
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
      trackingNumber: live.find((o) => o.trackingNumber)?.trackingNumber ?? null,
      labelUrl: live.find((o) => o.labelUrl)?.labelUrl ?? null,
    });
  }
  return out;
}

/** Bags on her table: paid, going by post. */
export function parcelsToPost<T extends ParcelOrder>(parcels: Parcel<T>[]): Parcel<T>[] {
  return parcels.filter((p) => p.status === "paid" && p.deliveryMethod === "ship");
}

/** Paid and waiting to be picked up at the counter — the Orders screen's Collections tab. */
export function parcelsToCollect<T extends ParcelOrder>(parcels: Parcel<T>[]): Parcel<T>[] {
  return parcels.filter((p) => p.status === "paid" && p.deliveryMethod === "pickup");
}

export function parcelsToPostLabel(count: number): string {
  if (count === 0) return "Nothing to post";
  return `${count} ${count === 1 ? "parcel" : "parcels"} to post`;
}
