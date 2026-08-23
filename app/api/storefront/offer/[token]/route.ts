import { NextRequest, NextResponse } from "next/server";
import { getOfferByToken, getOfferEvents, publicOffer, respondToOffer } from "@/app/lib/offers-db";
import { getStorefrontBySlug } from "@/app/lib/storefront-db";
import { sendOfferUpdateToStore } from "@/app/lib/email";

export const dynamic = "force-dynamic";

// GET — the buyer's view of their offer (state + the full back-and-forth). `handle` is the
// store's storefront handle, so the page can send the buyer back to the piece on the store's
// OWN storefront (/s/{handle}/p/{id}) rather than the marketplace product page, which is
// waitlist-gated and may not even carry this item.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
 const { token } = await params;
 const offer = await getOfferByToken(token);
 if (!offer) return NextResponse.json({ error: "Offer not found." }, { status: 404 });
 const sf = await getStorefrontBySlug(offer.storeSlug).catch(() => null);
 return NextResponse.json({ ok: true, offer: publicOffer(offer), handle: sf?.handle ?? null, events: await getOfferEvents(offer.id) });
}

// POST — the buyer responds. { action: "accept" | "counter" | "decline" | "withdraw", amountCents? }
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
 const { token } = await params;
 const offer = await getOfferByToken(token);
 if (!offer) return NextResponse.json({ error: "Offer not found." }, { status: 404 });

 const b = await request.json().catch(() => ({}));
 const action = String(b?.action || "");
 if (!["accept", "counter", "decline", "withdraw"].includes(action)) return NextResponse.json({ error: "Invalid action." }, { status: 400 });
 const amountCents = action === "counter" ? Number(b?.amountCents) : undefined;
 if (action === "counter") {
 if (!amountCents || amountCents <= 0) return NextResponse.json({ error: "Enter a counter price." }, { status: 400 });
 if (amountCents >= offer.listPriceCents) return NextResponse.json({ error: "Counter below the asking price." }, { status: 400 });
 }

 const updated = await respondToOffer(offer, "buyer", action as "accept" | "counter" | "decline" | "withdraw", amountCents);
 if (!updated) return NextResponse.json({ error: "This offer can’t be changed anymore." }, { status: 409 });
 await sendOfferUpdateToStore(updated).catch(() => {});
 return NextResponse.json({ ok: true, offer: publicOffer(updated), events: await getOfferEvents(updated.id) });
}
