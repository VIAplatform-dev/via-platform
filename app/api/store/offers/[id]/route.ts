import { NextRequest, NextResponse } from "next/server";
import { chargeAcceptedOffer } from "@/app/lib/offer-charge";
import { sendOpsAlert } from "@/app/lib/ops-alert";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getOfferForStore, respondToOffer, markOfferPaid } from "@/app/lib/offers-db";
import { reserveItem } from "@/app/lib/db/inventory";
import { sendOfferUpdateToBuyer } from "@/app/lib/email";

export const dynamic = "force-dynamic";

// POST: the store responds to an offer. { action: "accept" | "decline" | "counter", amountCents? }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await params;
 const offer = await getOfferForStore(Number(id), slug);
 if (!offer) return NextResponse.json({ error: "Offer not found." }, { status: 404 });

 const b = await request.json().catch(() => ({}));
 const action = String(b?.action || "");
 if (!["accept", "decline", "counter"].includes(action)) return NextResponse.json({ error: "Invalid action." }, { status: 400 });
 const amountCents = action === "counter" ? Number(b?.amountCents) : undefined;
 if (action === "counter" && (!amountCents || amountCents <= 0)) return NextResponse.json({ error: "Enter a counter price." }, { status: 400 });

 const updated = await respondToOffer(offer, "store", action as "accept" | "decline" | "counter", amountCents);
 if (!updated) return NextResponse.json({ error: "That offer can’t be responded to anymore." }, { status: 409 });

 // ACCEPTING A BINDING OFFER IS THE SALE, not a promise to make one.
 //
 // The buyer authorised a card and gave an address when she made it, so there is nothing left to
 // wait for: this takes the money. The PaymentIntent carries the same metadata the storefront's own
 // checkout uses, so the existing webhook writes the order, marks the piece sold, credits the
 // consignor, delists it elsewhere and sends both emails. One path (offer-charge.ts).
 let charged: string | null = null;
 let chargeFailed = false;
 if (updated.status === "accepted" && updated.binding && updated.itemId) {
  const r = await chargeAcceptedOffer(updated).catch(() => null);
  if (r?.ok) {
   charged = r.paymentIntent;
   // Stamped now rather than when the webhook lands, so the buyer's page never tells a buyer whose
   // card has just been charged that we couldn't take it.
   await markOfferPaid(updated.token).catch(() => {});
  } else {
   chargeFailed = true;
   // A card expires, funds run out, or this is an older offer made before cards were collected.
   // The seller has already said yes, so fall back to what binding used to do: hold the piece and
   // email a link. A second step beats a sale that silently didn't happen.
   await reserveItem(updated.itemId, `offer-${updated.token}`).catch(() => {});
   if (r?.reason === "declined") {
    await sendOpsAlert(
     `Binding offer accepted but the card declined: ${updated.storeSlug}`,
     `Offer ${updated.token} on "${updated.itemTitle ?? updated.itemId}" for ${updated.amountCents}c. ` +
     `${r.detail ?? ""}. The piece is held and the buyer has been emailed a link instead.`,
    ).catch(() => {});
   }
  }
 } else if (updated.status === "accepted" && updated.itemId && updated.binding) {
  await reserveItem(updated.itemId, `offer-${updated.token}`).catch(() => {});
 }

 // Let the buyer know it's their move (or that it's a deal / a pass). A charged offer needs no
 // link: the webhook's order confirmation is the email that matters, and two "you bought it"
 // messages for one purchase is how a buyer ends up thinking she paid twice.
 if (!charged) await sendOfferUpdateToBuyer(updated).catch(() => {});

 return NextResponse.json({ ok: true, offer: updated, charged: Boolean(charged), chargeFailed });
}
