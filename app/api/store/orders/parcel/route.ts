import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { getOrderDetail, listParcelOrders, markOrdersShipped, markOrdersDelivered, markTrackingEmailSentMany } from "@/app/lib/db/orders";
import { notifyParcelPosted } from "@/app/lib/parcel-notify";
import { sendBuyerTrackingEmail } from "@/app/lib/email";
import { logError } from "@/app/lib/error-log";

export const dynamic = "force-dynamic";

// POST { orderIds, action: "posted" | "delivered" | "collected" } — one transition for the whole bag.
//
// Orders are per piece; she posts one parcel. Every id is checked to be this store's, the status
// flips in ONE statement (all or none), and a "posted" parcel gets ONE tracking email listing every
// piece — never one per order. `tracking` is accepted for parity with the brief but ignored:
// tracking comes from the label VYA bought, and a typed number would be a second source of truth.
const ACTIONS = ["posted", "delivered", "collected"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const seller = await getSellerBySlug(slug);
 if (!seller) return NextResponse.json({ error: "No store" }, { status: 404 });

 const body = await request.json().catch(() => null);
 const action = body?.action as Action;
 const orderIds: string[] = Array.isArray(body?.orderIds) ? body.orderIds.filter((x: unknown): x is string => typeof x === "string" && !!x).slice(0, 50) : [];
 if (!ACTIONS.includes(action)) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
 if (!orderIds.length) return NextResponse.json({ error: "No orders" }, { status: 400 });

 // Ownership, every id — never act on another store's order because it shared a list with ours.
 const details = await Promise.all(orderIds.map((id) => getOrderDetail(id).catch(() => null)));
 if (details.some((d) => !d || d.sellerId !== seller.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

 if (action === "delivered" || action === "collected") {
  const changed = await markOrdersDelivered(seller.id, orderIds);
  return NextResponse.json({ ok: true, status: "delivered", changed });
 }

 const changed = await markOrdersShipped(seller.id, orderIds);
 // The bag is every order on the payment, not just the ids sent — a seller who ticked two of three
 // pieces still posts one parcel, and the buyer must still get one email.
 const pi = details.find((d) => d?.stripePaymentIntent)?.stripePaymentIntent ?? null;
 const parcel = pi ? await listParcelOrders(seller.id, pi).catch(() => []) : details.filter((d): d is NonNullable<typeof d> => !!d).map((d) => ({ id: String(d.id), status: String(d.status), itemTitle: d.itemTitle, buyerEmail: d.buyerEmail, trackingNumber: d.trackingNumber, trackingUrl: d.trackingUrl, trackingEmailSentAt: null }));
 const email = await notifyParcelPosted(
  { storeSlug: slug, storeName: seller.name, replyTo: seller.email, orders: parcel.map((o) => ({ ...o, id: String(o.id), status: String(o.status), trackingEmailSentAt: o.trackingEmailSentAt ?? null })) },
  {
   send: (p) => sendBuyerTrackingEmail(p),
   markSent: (ids) => markTrackingEmailSentMany(ids),
  },
 );
 if (!email.sent && email.reason === "send-failed") await logError("parcel-tracking-email", new Error(email.error), { context: { orderIds } });
 return NextResponse.json({ ok: true, status: "shipped", changed, email: email.sent ? "sent" : email.reason });
}
