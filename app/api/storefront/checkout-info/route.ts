import { NextRequest, NextResponse } from "next/server";
import { getItem, currentReservationRef } from "@/app/lib/db/inventory";
import { getSellerById } from "@/app/lib/db/sellers";
import { getShippingSettings } from "@/app/lib/store-shipping-db";
import { getRedeemableBindingOffer } from "@/app/lib/offers-db";

export const dynamic = "force-dynamic";

// GET ?item=ID[&offer=TOKEN] — what the buyer checkout page needs: the item, the store, and
// whether shipping is free for this piece (so the page knows to quote a rate or not). When an
// accepted binding-offer token is passed, the price shown is the AGREED price (not the list price),
// and the piece is allowed through even though the store's acceptance reserved it for this buyer.
export async function GET(request: NextRequest) {
 const itemId = request.nextUrl.searchParams.get("item") || "";
 if (!itemId) return NextResponse.json({ error: "item required" }, { status: 400 });
 const offerToken = request.nextUrl.searchParams.get("offer") || "";

 const item = await getItem(itemId);
 if (!item) return NextResponse.json({ error: "This piece is no longer available." }, { status: 409 });

 // Binding-offer checkout: agreed price + let this buyer past their own reservation.
 let priceCents = item.priceCents;
 let agreed = false;
 if (offerToken) {
 const offer = await getRedeemableBindingOffer(offerToken, itemId);
 if (!offer) return NextResponse.json({ error: "This offer is no longer available." }, { status: 409 });
 priceCents = offer.amountCents;
 agreed = true;
 }

 if (item.status !== "active") {
 const heldByThisOffer = agreed && item.status === "reserved" && (await currentReservationRef(itemId)) === `offer-${offerToken}`;
 if (!heldByThisOffer) return NextResponse.json({ error: "This piece is no longer available." }, { status: 409 });
 }

 const seller = await getSellerById(item.sellerId);
 const shipping = seller ? await getShippingSettings(seller.slug) : null;

 const mode = shipping?.mode ?? "buyer_pays";
 const threshold = shipping?.freeThresholdCents ?? null;
 const freeShipping = mode === "store_pays" || (mode === "free_over" && threshold != null && priceCents >= threshold);

 return NextResponse.json({
 item: { id: item.id, title: item.title, priceCents, currency: item.currency, image: item.images?.[0] || null },
 storeName: seller?.name || "the store",
 freeShipping,
 agreed,
 publishableKey: (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY)?.trim(),
 });
}
