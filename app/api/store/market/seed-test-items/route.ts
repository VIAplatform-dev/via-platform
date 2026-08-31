import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { actingSeller } from "@/app/lib/market/auth";
import { isOwner } from "@/app/lib/storeAuth";
import { createItem, ensurePublishAtColumn } from "@/app/lib/db/inventory";
import { indexItems } from "@/app/lib/market/embeddings-db";

export const dynamic = "force-dynamic";

// Owner (admin password / via-admin) — or anyone on a LOCAL dev server, where a store login is
// usually the owner testing their own build.
const allowed = (request: NextRequest, slug: string) => isOwner(request, slug) || process.env.NODE_ENV === "development";

// POST — OWNER ONLY (or local dev). Seeds a dozen realistic vintage items into the acting store so Market Mode can
// be exercised end to end (search, confirm, cash/QR checkout, refund, bring list). Photos are borrowed
// from live marketplace listings so photo matching (Phase 3) has something real to embed.
const SEED = [
 { title: "Vintage Levi's 501 Jeans — Made in USA", brand: "Levi's", category: "Jeans", size: "32", price: 85, era: "1990s", condition: "Good" },
 { title: "1980s Nike Windbreaker Jacket", brand: "Nike", category: "Coats & Jackets", size: "L", price: 120, era: "1980s", condition: "Very good" },
 { title: "Carhartt Detroit Jacket, Blanket Lined", brand: "Carhartt", category: "Coats & Jackets", size: "XL", price: 145, era: "1990s", condition: "Good" },
 { title: "Y2K Blumarine Slip Dress, Floral", brand: "Blumarine", category: "Dresses", size: "S", price: 220, era: "2000s", condition: "Excellent" },
 { title: "Pendleton Wool Board Shirt, Plaid", brand: "Pendleton", category: "Tops", size: "M", price: 68, era: "1970s", condition: "Good" },
 { title: "Vintage Harley-Davidson Tee, Sturgis 1994", brand: "Harley-Davidson", category: "Tops", size: "L", price: 95, era: "1990s", condition: "Good" },
 { title: "Coach Court Bag, Black Glovetanned Leather", brand: "Coach", category: "Bags", size: null, price: 130, era: "1990s", condition: "Very good" },
 { title: "Wrangler Cowboy Cut Denim Jacket", brand: "Wrangler", category: "Coats & Jackets", size: "M", price: 75, era: "1980s", condition: "Good" },
 { title: "Champion Reverse Weave Hoodie, Grey", brand: "Champion", category: "Tops", size: "XL", price: 60, era: "1990s", condition: "Good" },
 { title: "Vintage Silk Scarf, Hermès-style Print", brand: null, category: "Accessories", size: null, price: 40, era: "1980s", condition: "Excellent" },
 { title: "Dr. Martens 1460 Boots, Oxblood", brand: "Dr. Martens", category: "Shoes", size: "US 9", price: 110, era: "1990s", condition: "Good" },
 { title: "Ralph Lauren Cable Knit Sweater, Cream", brand: "Ralph Lauren", category: "Tops", size: "M", price: 72, era: "1990s", condition: "Very good" },
];

export async function POST(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!allowed(request, acting.slug)) return NextResponse.json({ error: "Owner only" }, { status: 403 });
 await ensurePublishAtColumn();

 // Borrow photos from live marketplace listings, one per category so they roughly match the titles.
 const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
 const photoFor = async (needle: string): Promise<string | null> => {
 const rows = (await sql`SELECT image FROM products WHERE image IS NOT NULL AND image <> '' AND title ILIKE ${"%" + needle + "%"} ORDER BY random() LIMIT 1`.catch(() => [])) as Array<{ image: string }>;
 return rows[0]?.image ?? null;
 };
 const created: { id: string; title: string }[] = [];
 for (const s of SEED) {
 const needle = s.brand || s.category.split(" ")[0];
 const image = (await photoFor(needle)) ?? (await photoFor(s.category.split(" ")[0]));
 const row = await createItem({
 sellerId: acting.seller.id,
 title: `${s.title} (test)`,
 description: `Seeded test item for Market Mode. ${s.era} ${s.brand ?? ""} ${s.category}. Safe to delete.`,
 priceCents: s.price * 100,
 currency: "USD",
 images: image ? [image] : [],
 brand: s.brand, era: s.era, condition: s.condition, size: s.size, category: s.category,
 status: "active",
 source: "manual",
 origin: "user",
 });
 created.push({ id: row.id, title: row.title });
 }
 const indexed = await indexItems(acting.seller.id, 48).catch(() => null);
 return NextResponse.json({ ok: true, count: created.length, created, indexed });
}

// DELETE — remove every seeded "(test)" item of the acting store (owner only).
export async function DELETE(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!allowed(request, acting.slug)) return NextResponse.json({ error: "Owner only" }, { status: 403 });
 const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
 const rows = (await sql`DELETE FROM items WHERE seller_id = ${acting.seller.id} AND title LIKE '% (test)' AND description LIKE 'Seeded test item for Market Mode.%' RETURNING id`) as Array<{ id: string }>;
 return NextResponse.json({ ok: true, deleted: rows.length });
}
