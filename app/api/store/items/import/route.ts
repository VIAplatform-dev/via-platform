import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { createItem, listAvailableItems } from "@/app/lib/db/inventory";
import { parseItems } from "@/app/lib/parse-items";
import { rehostImages } from "@/app/lib/rehost-images";

// POST { csv, status? } — bulk-add inventory from a pasted/uploaded CSV. The on-ramp for
// stores with no Shopify to connect. Accepts flexible exports (Shopify/Square/spreadsheet);
// a row needs a title + price. Images (URLs in the file) are re-hosted to our storage.
// Idempotent by title. Items land as drafts by default so the seller reviews before go-live.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => null);
 const csv = typeof body?.csv === "string" ? body.csv : "";
 const status: "draft" | "active" = body?.status === "active" ? "active" : "draft";
 if (!csv.trim()) return NextResponse.json({ error: "Paste or upload your inventory file first." }, { status: 400 });

 const parsed = parseItems(csv);
 if (!parsed.length) {
 return NextResponse.json({ error: "Couldn’t read any items — make sure your file has a header row with at least a title and price column." }, { status: 400 });
 }

 const seller = await getSellerBySlug(slug);
 if (!seller) return NextResponse.json({ error: "Store not found" }, { status: 404 });

 const existing = await listAvailableItems(seller.id);
 const have = new Set(existing.map((i) => i.title.toLowerCase().trim()));

 let added = 0;
 for (const p of parsed) {
 if (have.has(p.title.toLowerCase())) continue;
 const images = p.images.length ? await rehostImages(p.images, slug) : [];
 await createItem({
 sellerId: seller.id,
 title: p.title,
 priceCents: p.priceCents,
 currency: p.currency,
 images,
 brand: p.brand,
 era: p.era,
 material: p.material,
 condition: p.condition,
 size: p.size,
 category: p.category,
 description: p.description,
 status,
 source: "imported",
 }).catch(() => {});
 have.add(p.title.toLowerCase());
 added++;
 }

 return NextResponse.json({ ok: true, found: parsed.length, added });
}
