import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getCheckoutSettings, setCheckoutSettings } from "@/app/lib/store-checkout-db";

export const dynamic = "force-dynamic";

// GET — the store's checkout payment-method toggles (Cash App / Affirm / Klarna). Card + wallets
// (Apple Pay, Google Pay, Link) are always on and aren't part of this.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 return NextResponse.json({ ok: true, settings: await getCheckoutSettings(slug) });
}

// POST { cashapp, affirm, klarna } — save which extra methods the store offers at checkout.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const b = await request.json().catch(() => ({}));
 await setCheckoutSettings(slug, { cashapp: !!b?.cashapp, affirm: !!b?.affirm, klarna: !!b?.klarna });
 return NextResponse.json({ ok: true });
}
