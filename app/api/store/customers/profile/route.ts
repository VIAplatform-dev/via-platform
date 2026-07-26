import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listCustomerProfiles } from "@/app/lib/store-customers-db";
import { listSellerOrders } from "@/app/lib/db/orders";
import { listOffersByStore } from "@/app/lib/offers-db";
import { getConversationsByStore } from "@/app/lib/messaging-db";

export const dynamic = "force-dynamic";

// GET ?email= — one customer's 360: profile + their orders, offers and conversations with this store.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const email = (new URL(request.url).searchParams.get("email") || "").trim().toLowerCase();
 if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

 const eq = (v: string | null | undefined) => (v || "").trim().toLowerCase() === email;

 const [profiles, seller, offersAll, convsAll] = await Promise.all([
 listCustomerProfiles(slug).catch(() => []),
 getSellerBySlug(slug).catch(() => null),
 listOffersByStore(slug).catch(() => []),
 getConversationsByStore(slug).catch(() => []),
 ]);

 const profile = profiles.find((c) => eq(c.email)) || { email, name: null, phone: null, location: null, subscribed: false, source: "buyer" as const, orders: 0, spentCents: 0, lastOrderAt: null, addedAt: null };

 const ordersAll = seller ? await listSellerOrders(seller.id).catch(() => []) : [];
 const orders = ordersAll.filter((o) => eq(o.buyerEmail)).map((o) => ({
 id: String(o.id), orderNo: o.orderNo, itemTitle: o.itemTitle, amountCents: o.amountCents, status: o.status, paidAt: o.paidAt, createdAt: o.createdAt,
 }));
 const offers = offersAll.filter((o) => eq(o.buyerEmail)).map((o) => ({
 id: o.id, itemTitle: o.itemTitle, amountCents: o.amountCents, listPriceCents: o.listPriceCents, status: o.status, lastActor: o.lastActor, createdAt: o.createdAt,
 }));
 const conversations = convsAll.filter((c) => eq(c.buyerEmail)).map((c) => ({
 id: c.id, itemTitle: c.itemTitle, lastMessage: c.lastMessage, lastMessageAt: c.lastMessageAt, storeUnread: c.storeUnread,
 }));

 return NextResponse.json({ ok: true, profile, orders, offers, conversations });
}
