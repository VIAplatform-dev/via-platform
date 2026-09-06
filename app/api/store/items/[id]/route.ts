import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { getItem, markSold, removeItem, publishItem, updateItem } from "@/app/lib/db/inventory";
import { getOrCreateCollection, setItemCollections } from "@/app/lib/db/collections";
import { delistEverywhere } from "@/app/lib/cross-listing-db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST { action: "sold" | "remove" | "publish" } — run a lifecycle transition on
// one of the acting store's items (ownership-scoped).
export async function POST(request: NextRequest, { params }: Ctx) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const { id } = await params;
 const body = await request.json().catch(() => ({}));
 const action = body?.action;

 const seller = await getSellerBySlug(slug);
 if (!seller) return NextResponse.json({ error: "Not found" }, { status: 404 });

 const item = await getItem(id);
 if (!item || item.sellerId !== seller.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

 let result;
 // When an item sells (anywhere), pull it from every cross-listed channel so it can't double-sell.
 // `soldOn` attributes the sale to a channel (defaults to VYA); API channels (eBay) end automatically,
 // and we return the no-API channels (Depop/Vestiaire) the seller still needs to remove by hand.
 let pull: { platform: string; name: string; handle: string | null; hasApi: boolean }[] = [];
 if (action === "sold") {
 result = await markSold(id);
 const soldOn = typeof body?.soldOn === "string" && body.soldOn ? body.soldOn : "vya";
 pull = await delistEverywhere(id, soldOn).catch(() => []);
 } else if (action === "remove") result = await removeItem(id);
 else if (action === "publish") result = await publishItem(id);
 else return NextResponse.json({ error: "Unknown action" }, { status: 400 });

 return NextResponse.json({ ok: true, item: result, pull });
}

// PATCH — full edit of one of the acting store's items: title, price, cost, brand, era, material, colour,
// condition, size, category, description, status, images, shipping dims, and collections. Every field
// is optional (only sent fields change). Works on any status, so drafts can be tweaked before going live.
export async function PATCH(request: NextRequest, { params }: Ctx) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const { id } = await params;
 const seller = await getSellerBySlug(slug);
 if (!seller) return NextResponse.json({ error: "Not found" }, { status: 404 });

 const item = await getItem(id);
 if (!item || item.sellerId !== seller.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

 const body = await request.json().catch(() => ({}));
 const trimOrNull = (v: unknown, n: number) => { const s = String(v ?? "").trim().slice(0, n); return s || null; };

 const cents = (v: unknown) => Math.round(Math.max(0, Math.min(1_000_000, Number(v) || 0)) * 100);
 const intOrNull = (v: unknown) => { if (v === null || v === "" || v === undefined) return null; const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 ? Math.min(n, 100_000) : null; };
 const STATUSES = ["draft", "active", "reserved", "sold", "removed"] as const;

 const patch: Partial<{
 title: string; priceCents: number; costCents: number | null; size: string | null; category: string | null; description: string | null;
 brand: string | null; era: string | null; material: string | null; colour: string | null; condition: string | null;
 status: (typeof STATUSES)[number]; images: string[]; weightOz: number | null; lengthIn: number | null; widthIn: number | null; heightIn: number | null;
 }> = {};
 if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim().slice(0, 200);
 if (body.price !== undefined) patch.priceCents = cents(body.price);
 if (body.cost !== undefined) patch.costCents = body.cost === null || body.cost === "" ? null : cents(body.cost);
 if (body.size !== undefined) patch.size = trimOrNull(body.size, 40);
 if (body.category !== undefined) patch.category = trimOrNull(body.category, 60);
 if (body.description !== undefined) patch.description = trimOrNull(body.description, 2000);
 if (body.brand !== undefined) patch.brand = trimOrNull(body.brand, 80);
 if (body.era !== undefined) patch.era = trimOrNull(body.era, 40);
 if (body.material !== undefined) patch.material = trimOrNull(body.material, 80);
 if (body.colour !== undefined) patch.colour = trimOrNull(body.colour, 60);
 if (body.condition !== undefined) patch.condition = trimOrNull(body.condition, 60);
 if (typeof body.status === "string" && (STATUSES as readonly string[]).includes(body.status)) patch.status = body.status as (typeof STATUSES)[number];
 if (Array.isArray(body.images)) patch.images = body.images.filter((x: unknown) => typeof x === "string" && (x as string).trim()).map((x: string) => x.trim()).slice(0, 20);
 if (body.weightOz !== undefined) patch.weightOz = intOrNull(body.weightOz);
 if (body.lengthIn !== undefined) patch.lengthIn = intOrNull(body.lengthIn);
 if (body.widthIn !== undefined) patch.widthIn = intOrNull(body.widthIn);
 if (body.heightIn !== undefined) patch.heightIn = intOrNull(body.heightIn);
 // Collections (titles). Only touched when the field is sent; an array (even empty) sets membership.
 const cols = Array.isArray(body.collections)
 ? body.collections.filter((x: unknown) => typeof x === "string" && (x as string).trim()).map((x: string) => x.trim().slice(0, 80)).slice(0, 20)
 : undefined;
 if (!Object.keys(patch).length && cols === undefined) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

 const updated = Object.keys(patch).length ? await updateItem(id, patch) : item;
 if (cols !== undefined) {
 const ids: string[] = [];
 for (const t of cols) ids.push((await getOrCreateCollection(seller.id, t)).id);
 await setItemCollections(id, ids);
 }
 return NextResponse.json({ ok: true, item: updated });
}
