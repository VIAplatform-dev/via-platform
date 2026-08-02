import { NextRequest, NextResponse } from "next/server";
import { createOffer } from "@/app/lib/offers-db";
import { getInboxSettings } from "@/app/lib/storefront-settings-db";
import { sendNewOfferToStore } from "@/app/lib/email";
import { getItem } from "@/app/lib/db/inventory";
import { getSellerBySlug } from "@/app/lib/db/sellers";

export const dynamic = "force-dynamic";

// GET ?slug= — public: whether this store takes offers (so the storefront can show/hide the button).
export async function GET(request: NextRequest) {
 const slug = new URL(request.url).searchParams.get("slug") || "";
 if (!slug) return NextResponse.json({ offersEnabled: false });
 const s = await getInboxSettings(slug);
 return NextResponse.json({ offersEnabled: s.offersEnabled });
}

// Public: a shopper makes a price offer on a piece.
// { storeSlug, itemId?, itemTitle?, listPriceCents, amountCents, name?, email }
export async function POST(request: NextRequest) {
 const b = await request.json().catch(() => null);
 const storeSlug = b?.storeSlug ? String(b.storeSlug).trim() : "";
 const amountCents = Math.round(Number(b?.amountCents) || 0);
 const email = b?.email ? String(b.email).trim().slice(0, 200) : "";
 const itemId = b?.itemId ? String(b.itemId) : null;
 if (!storeSlug || amountCents <= 0) return NextResponse.json({ error: "Missing offer details." }, { status: 400 });
 if (!email) return NextResponse.json({ error: "Enter your email so the seller can respond." }, { status: 400 });

 // Authoritative list price comes from the REAL item, read server-side — never the buyer-supplied
 // listPriceCents. Otherwise the min-offer floor (computed against it) is trivially bypassed by
 // sending an inflated list price. Verify the item belongs to this store, too.
 let listPriceCents = Math.round(Number(b?.listPriceCents) || 0);
 let itemTitle = b?.itemTitle ? String(b.itemTitle).slice(0, 300) : null;
 if (itemId) {
 const [item, seller] = await Promise.all([getItem(itemId).catch(() => null), getSellerBySlug(storeSlug).catch(() => null)]);
 if (!item || !seller || item.sellerId !== seller.id || item.status === "removed") {
 return NextResponse.json({ error: "That item isn’t available." }, { status: 404 });
 }
 listPriceCents = item.priceCents;
 itemTitle = item.title || itemTitle;
 }
 if (listPriceCents <= 0) return NextResponse.json({ error: "Missing offer details." }, { status: 400 });
 if (amountCents >= listPriceCents) return NextResponse.json({ error: "Your offer is at or above the asking price — just buy it directly." }, { status: 400 });

 const settings = await getInboxSettings(storeSlug);
 if (!settings.offersEnabled) return NextResponse.json({ error: "This store isn’t accepting offers." }, { status: 403 });
 if (settings.minOfferPct > 0 && amountCents < Math.round((listPriceCents * settings.minOfferPct) / 100)) {
 return NextResponse.json({ error: `This seller only considers offers of at least ${settings.minOfferPct}% of the asking price.` }, { status: 422 });
 }

 const offer = await createOffer({
 storeSlug,
 itemId,
 itemTitle,
 buyerName: b?.name ? String(b.name).slice(0, 200) : null,
 buyerEmail: email,
 listPriceCents,
 amountCents,
 binding: settings.offersBinding,
 });
 await sendNewOfferToStore(offer).catch(() => {});
 return NextResponse.json({ ok: true, token: offer.token });
}
