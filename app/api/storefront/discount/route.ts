import { NextRequest, NextResponse } from "next/server";
import { validateDiscount, lastOrderAtForBuyer } from "@/app/lib/store-discounts-db";
import { applyDiscountToOrder, type OrderLine } from "@/app/lib/discount-scope";
import { getItem } from "@/app/lib/db/inventory";
import { getSellerById } from "@/app/lib/db/sellers";

export const dynamic = "force-dynamic";

// POST { code, subtotalCents?, storeSlug? | itemId? } — buyer-facing check that a code is
// valid FOR THIS STORE. validateDiscount is scoped by store_slug, so a code only ever
// resolves for its own store; another store's code returns { ok: false }.
export async function POST(request: NextRequest) {
 const body = (await request.json().catch(() => ({}))) as { storeSlug?: string; itemId?: string; code?: string; subtotalCents?: number; email?: string | null; lines?: { itemId?: unknown; amountCents?: unknown }[] };
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

 // The SAME rule the payment will use. If this quote and the intent disagree, the shopper is shown
 // one price and charged another — see app/lib/discount-scope.ts.
 const subtotal = Math.max(0, Math.round(Number(body.subtotalCents) || 0));
 const lines: OrderLine[] = Array.isArray(body.lines) && body.lines.length
 ? body.lines.filter((l): l is OrderLine => !!l && typeof l.itemId === "string").map((l) => ({ itemId: l.itemId, amountCents: Math.max(0, Math.round(Number(l.amountCents) || 0)) }))
 : [{ itemId: String(body.itemId || ""), amountCents: subtotal }];
 const lastOrderAt = d.audience === "all" ? null : await lastOrderAtForBuyer(storeSlug, body.email);
 const out = applyDiscountToOrder(d, lines, { lastOrderAt, email: body.email ?? null });
 if (out.refusal) return NextResponse.json({ ok: false, error: out.refusal });
 return NextResponse.json({ ok: true, code: d.code, label: d.label, kind: d.kind, value: d.value, offCents: out.offCents, freeShipping: out.freeShipping });
}
