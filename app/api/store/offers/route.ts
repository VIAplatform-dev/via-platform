import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { listOffersByStore, countPendingForStore } from "@/app/lib/offers-db";

export const dynamic = "force-dynamic";

// GET: all offers for the acting store, plus the count awaiting the store's response.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const [offers, pending] = await Promise.all([listOffersByStore(slug), countPendingForStore(slug)]);
 return NextResponse.json({ ok: true, offers, pending });
}
