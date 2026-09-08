import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listCustomerProfiles, listCustomerTags, setCustomerTags, setCustomerNote } from "@/app/lib/store-customers-db";
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

 const [profiles, seller, offersAll, convsAll, allTags] = await Promise.all([
 listCustomerProfiles(slug).catch(() => []),
 getSellerBySlug(slug).catch(() => null),
 listOffersByStore(slug).catch(() => []),
 getConversationsByStore(slug).catch(() => []),
 listCustomerTags(slug).catch(() => []),
 ]);

 const profile = profiles.find((c) => eq(c.email)) || { email, name: null, phone: null, location: null, subscribed: false, source: "buyer" as const, orders: 0, spentCents: 0, lastOrderAt: null, addedAt: null, tags: [], notes: null, categories: [] };

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

 return NextResponse.json({ ok: true, profile, orders, offers, conversations, allTags: allTags.map((t) => t.tag) });
}

// PATCH { email, notes?, tags? } — the seller's memory of one customer. Only the fields sent change;
// `tags` (an array, even empty) replaces the set, `notes` (a string, "" clears) replaces the note.
export async function PATCH(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => ({}));
 const email = String(body?.email || "").trim().toLowerCase();
 if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "email required" }, { status: 400 });
 const hasNotes = typeof body?.notes === "string" || body?.notes === null;
 const hasTags = Array.isArray(body?.tags);
 if (!hasNotes && !hasTags) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
 if (hasTags) await setCustomerTags(slug, email, body.tags.filter((t: unknown) => typeof t === "string"));
 if (hasNotes) await setCustomerNote(slug, email, body.notes);
 const profiles = await listCustomerProfiles(slug).catch(() => []);
 const profile = profiles.find((c) => (c.email || "").trim().toLowerCase() === email) ?? null;
 return NextResponse.json({ ok: true, profile: profile ? { email: profile.email, tags: profile.tags, notes: profile.notes } : { email, tags: hasTags ? body.tags : [], notes: hasNotes ? body.notes : null } });
}
