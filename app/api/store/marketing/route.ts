import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getPromoCode, setPromoCode } from "@/app/lib/store-marketing-db";

export const dynamic = "force-dynamic";

// GET: the acting store's marketing settings (promo code).
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const promoCode = await getPromoCode(slug).catch(() => null);
 return NextResponse.json({ ok: true, promoCode });
}

// POST: save the promo code (seller-editable). Send promoCode: "" to clear it.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
 await setPromoCode(slug, typeof body.promoCode === "string" ? body.promoCode : null);
 const promoCode = await getPromoCode(slug).catch(() => null);
 return NextResponse.json({ ok: true, promoCode });
}
