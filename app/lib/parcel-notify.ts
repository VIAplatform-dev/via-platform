// One "it's on its way" per bag. Sending is injected so this runs under test with fakes.
//
// Orders are per piece; the buyer's email should be per parcel. The seller can press Mark posted
// on the whole bag (orders/parcel route) or on one piece (orders/[id] mark_shipped) — both come
// through here, and whichever is pressed first sends the one email that lists every piece.

import { shouldSendParcelEmail } from "./parcels-core.ts";

export type ParcelNotifyOrder = {
 id: string;
 status: string;
 itemTitle: string | null;
 buyerEmail: string | null;
 trackingNumber: string | null;
 trackingUrl: string | null;
 trackingEmailSentAt: string | Date | null;
};

export type TrackingEmail = {
 storeSlug: string;
 buyerEmail: string;
 storeName: string;
 itemTitle: string;
 itemTitles: string[];
 trackingNumber: string;
 trackingUrl: string | null;
 orderId: string;
 replyTo: string | null;
};

export type ParcelNotifyDeps = {
 send: (p: TrackingEmail) => Promise<void>;
 markSent: (orderIds: string[]) => Promise<void>;
};

export type ParcelNotifyResult =
 | { sent: true; orderIds: string[] }
 | { sent: false; reason: "already-sent" | "no-tracking" | "no-buyer-email" | "empty" }
 | { sent: false; reason: "send-failed"; error: string };

export async function notifyParcelPosted(
 args: { storeSlug: string; storeName: string; replyTo: string | null; orders: ParcelNotifyOrder[] },
 deps: ParcelNotifyDeps,
): Promise<ParcelNotifyResult> {
 const orders = args.orders.filter((o) => o.status !== "refunded");
 if (!orders.length) return { sent: false, reason: "empty" };
 if (orders.some((o) => o.trackingEmailSentAt)) return { sent: false, reason: "already-sent" };
 if (!shouldSendParcelEmail(orders)) return { sent: false, reason: "no-tracking" };
 const tracked = orders.find((o) => o.trackingNumber)!;
 const buyerEmail = orders.find((o) => o.buyerEmail)?.buyerEmail ?? null;
 if (!buyerEmail) return { sent: false, reason: "no-buyer-email" };
 const titles = orders.map((o) => o.itemTitle || "your item");
 try {
  await deps.send({
   storeSlug: args.storeSlug, buyerEmail, storeName: args.storeName,
   itemTitle: titles[0], itemTitles: titles,
   trackingNumber: tracked.trackingNumber!, trackingUrl: tracked.trackingUrl ?? null,
   orderId: tracked.id, replyTo: args.replyTo,
  });
 } catch (e) {
  return { sent: false, reason: "send-failed", error: e instanceof Error ? e.message : String(e) };
 }
 const ids = orders.map((o) => o.id);
 await deps.markSent(ids);
 return { sent: true, orderIds: ids };
}
