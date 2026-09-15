import { NextRequest, NextResponse } from "next/server";
import { stores, storeContactEmails } from "@/app/lib/stores";
import { getOrCreateSeller } from "@/app/lib/db/sellers";
import { createItem, listSellerItems } from "@/app/lib/db/inventory";
import { getListingsByStore } from "@/app/lib/listings-db";

export const dynamic = "force-dynamic";

// Promote a store's imported storefront listings (display-only) into buyable
// VYA-native items (the transactional inventory the cart/checkout sells from).
// Idempotent by title: safe to re-run. Admin-gated by middleware.
// POST /api/admin/publish-inventory?store=<slug>[&dry=1]
export async function POST(request: NextRequest) {
 const slug = request.nextUrl.searchParams.get("store") || "";
 if (!slug) return NextResponse.json({ error: "?store=<slug> required" }, { status: 400 });
 const dry = request.nextUrl.searchParams.get("dry") === "1";

 const store = stores.find((s) => s.slug === slug);
 const email = storeContactEmails[slug] || `${slug}@imported.vya`;
 const seller = await getOrCreateSeller(slug, store?.name || slug, email);

 const listings = await getListingsByStore(slug, false); // include sold (we mirror status)
 const existing = new Set((await listSellerItems(seller.id)).map((i) => i.title.trim().toLowerCase()));

 let created = 0;
 let skipped = 0;
 const samples: string[] = [];
 for (const l of listings) {
 const key = (l.title || "").trim().toLowerCase();
 if (!key || existing.has(key)) { skipped++; continue; }
 existing.add(key);
 if (samples.length < 5) samples.push(`${l.title}: $${l.price}`);
 if (!dry) {
 await createItem({
 sellerId: seller.id,
 title: l.title,
 description: l.description ?? undefined,
 priceCents: Math.round((Number(l.price) || 0) * 100),
 currency: l.currency || "USD",
 images: l.images ?? [],
 size: l.size ?? undefined,
 category: l.category ?? undefined,
 status: l.status === "sold" ? "sold" : l.status === "draft" ? "draft" : "active",
 source: "imported",
 });
 }
 created++;
 }

 return NextResponse.json({ ok: true, dry, store: slug, sellerId: seller.id, listings: listings.length, created, skipped, samples });
}
