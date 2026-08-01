import { NextRequest, NextResponse } from "next/server";
import { validateDiscount, computeDiscount } from "@/app/lib/store-discounts-db";
import { getItem } from "@/app/lib/db/inventory";
import { getSellerById } from "@/app/lib/db/sellers";

export const dynamic = "force-dynamic";

// POST { code, subtotalCents?, storeSlug? | itemId? } — buyer-facing check that a code is
// valid FOR THIS STORE. validateDiscount is scoped by store_slug, so a code only ever
// resolves for its own store; another store's code returns { ok: false }.
export async function POST(request: NextRequest) {
 const body = (await request.json().catch(() => ({}))) as { storeSlug?: string; itemId?: string; code?: string; subtotalCents?: number };
 const code = (body.code || "").trim();
 if (!code) return NextResponse.json({ ok: false, error: "Enter a code." }, { status: 400 });

 // Resolve the store from an explicit slug or from the item being bought.
 let storeSlug = (body.storeSlug || "").trim();
 if (!storeSlug && body.itemId) {
 const item = await getItem(String(body.itemId)).catch(() => null);
 if (item) storeSlug = (await getSellerById(item.sellerId).catch(() => null))?.slug || "";
 }
 if (!storeSlug) return NextResponse.json({ ok: false, error: "Unknown store." }, { status: 400 });

 const d = await validateDiscount(storeSlug, code);
 if (!d) return NextResponse.json({ ok: false, error: "That code isn’t valid for this store." });

 const subtotal = Math.max(0, Math.round(Number(body.subtotalCents) || 0));
 const { offCents, freeShipping } = computeDiscount(d, subtotal);
 return NextResponse.json({ ok: true, code: d.code, label: d.label, kind: d.kind, value: d.value, offCents, freeShipping });
}
