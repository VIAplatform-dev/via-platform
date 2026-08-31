import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { createItem, ensurePublishAtColumn } from "@/app/lib/db/inventory";
import { getShippingSettings, hasShipFrom } from "@/app/lib/store-shipping-db";
import { indexItem } from "@/app/lib/market/embeddings-db";
import { startCheckout } from "@/app/lib/market/checkout-db";
import { getOrOpenSession } from "@/app/lib/market/sessions-db";
import { stores } from "@/app/lib/stores";

export const dynamic = "force-dynamic";

// Market quick list, step 2: create the item, index its photo, optionally start the checkout — all in
// one round trip so the seller never leaves Market Mode. Reuses the intake publish sanitation rules.
// A store WITHOUT a ship-from address gets a draft (a live listing must be shippable); Market Mode
// can still sell a draft in person (draft → reserved → sold).
export async function POST(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

 const str = (v: unknown, n: number) => { const s = (typeof v === "string" ? v : "").trim(); return s ? s.slice(0, n) : null; };
 const price = Math.max(0, Math.min(1_000_000, Number(body.price) || 0));
 if (!(price > 0)) return NextResponse.json({ error: "Enter a price." }, { status: 400 });
 const imageUrl = str(body.imageUrl, 500);
 const brand = str(body.brand, 80), category = str(body.category, 60);
 // Title is the only DB-required field: fall back to something honest rather than blocking the sale.
 const title = str(body.title, 200) || [brand, category].filter(Boolean).join(" ") || "Market item";

 const store = stores.find((s) => s.slug === acting.slug);
 const shipping = await getShippingSettings(acting.slug).catch(() => null);
 const status = shipping && hasShipFrom(shipping) ? "active" : "draft";
 await ensurePublishAtColumn();
 const item = await createItem({
 sellerId: acting.seller.id,
 title, description: str(body.description, 2000),
 priceCents: Math.round(price * 100), currency: store?.currency || "USD",
 images: imageUrl ? [imageUrl] : [],
 brand, era: str(body.era, 40), material: str(body.material, 120), condition: str(body.condition, 80), size: str(body.size, 40), category,
 status, source: "market", origin: "user", // 'market' = quick-listed on the spot; finish the details later
 });
 // Make it findable by camera right away (best-effort, ~1 s).
 if (imageUrl) await indexItem(item.id, acting.seller.id, imageUrl).catch(() => {});

 // Cash can complete right here. A card (QR) checkout needs the Stripe Session, which the Confirm
 // screen creates — so for "qr" we return the item and let Confirm auto-start it (?go=qr).
 const tender = body.startCheckout === "cash" ? "cash" : null;
 if (!tender) return NextResponse.json({ ok: true, item: { id: item.id, status: item.status } });
 const session = await getOrOpenSession(acting.seller.id);
 const r = await startCheckout({ sellerId: acting.seller.id, lines: [{ itemId: item.id }], sessionId: session.id, clientKey: String(body.clientKey || `ql-${item.id}`), tender, deviceLabel: null });
 return NextResponse.json({ ok: true, item: { id: item.id, status: item.status }, checkout: r.ok ? { id: r.checkout.id, tender } : null });
}
