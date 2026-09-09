import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { getItem, markSold, removeItem, publishItem, updateItem, deleteItemForever } from "@/app/lib/db/inventory";
import { getOrCreateCollection, setItemCollections } from "@/app/lib/db/collections";
import { delistEverywhere } from "@/app/lib/cross-listing-db";
import { placeHold, releaseHold } from "@/app/lib/holds-db";
import { normalizeFlaws } from "@/app/lib/flaws-core";
import { normalizeMeasurements, unitFor, type Measurement } from "@/app/lib/measurements-core";
import { getShippingSettings, hasShipFrom } from "@/app/lib/store-shipping-db";
import { publishRefusal } from "@/app/lib/setup-gate-core";
import { stores } from "@/app/lib/stores";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST { action: "sold" | "remove" | "publish" | "hold" | "release" } — run a lifecycle transition
// on one of the acting store's items (ownership-scoped). `hold` takes { name?, days? | until? }.
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
 else if (action === "publish") {
 // A draft cannot go live without a ship-from address (no rates, no labels) — the same wall the
 // intake publish route has, so Inventory's "Draft · blocked" is a fact, not a decoration.
 const refusal = publishRefusal(hasShipFrom(await getShippingSettings(slug)));
 if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
 result = await publishItem(id);
 } else if (action === "hold") {
 // Keep it back for someone: a reservation tagged with their name, released by the same sweep
 // that frees an abandoned checkout, so nothing new needs to expire it.
 const name = typeof body?.name === "string" ? body.name : "";
 const until = { days: typeof body?.days === "number" ? body.days : undefined, until: typeof body?.until === "string" ? body.until : undefined };
 let res;
 try { res = await placeHold(id, name, until); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Bad hold" }, { status: 400 }); }
 if (!res) return NextResponse.json({ error: item.status === "reserved" ? "This piece is already reserved" : "Only a live piece can be held" }, { status: 409 });
 result = await getItem(id);
 } else if (action === "release") {
 const r = await releaseHold(id);
 if (!r.released) return NextResponse.json({ error: r.reason }, { status: 409 });
 result = await getItem(id);
 } else return NextResponse.json({ error: "Unknown action" }, { status: 400 });

 return NextResponse.json({ ok: true, item: result, pull });
}

// DELETE — gone for good. Only a draft or a removed piece that never sold: "remove" keeps a row
// (sales history, cross-listing records); this is for a mistake, a duplicate, or a test row.
export async function DELETE(request: NextRequest, { params }: Ctx) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await params;
 const seller = await getSellerBySlug(slug);
 if (!seller) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const item = await getItem(id);
 if (!item || item.sellerId !== seller.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
 if (item.status !== "draft" && item.status !== "removed") return NextResponse.json({ error: "Only a draft or a removed piece can be deleted for good — remove it first." }, { status: 409 });
 const deleted = await deleteItemForever(seller.id, id);
 if (!deleted) return NextResponse.json({ error: "This piece has an order against it, so it stays on record." }, { status: 409 });
 return NextResponse.json({ ok: true, deleted: true, id });
}

// PATCH — full edit of one of the acting store's items: title, price, cost, brand, era, material, colour,
// condition, size, category, description, status, images, shipping dims, flaws,
// and collections. Every field
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
 flaws: string[];
 conditionNote: string | null; measurements: string | null; measurementsJson: Measurement[] | null;
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
 // Beyond the grade: her own words on the wear. Never folded into the grade.
 if (body.conditionNote !== undefined) patch.conditionNote = trimOrNull(body.conditionNote, 400);
 // Measurements: a list is structure (measurements-core.ts, in the store's unit); a string is the
 // old free-text column. Sending a list clears the text so the page never prints both.
 if (Array.isArray(body.measurements)) {
 const [shipping, store] = [await getShippingSettings(slug).catch(() => null), stores.find((s) => s.slug === slug)];
 patch.measurementsJson = normalizeMeasurements(body.measurements, unitFor({ country: shipping?.shipFrom?.country, currency: store?.currency }));
 patch.measurements = null;
 } else if (typeof body.measurements === "string") patch.measurements = trimOrNull(body.measurements, 300);
 if (typeof body.status === "string" && (STATUSES as readonly string[]).includes(body.status)) {
 // Setting status to active IS publishing — same wall as the publish action, so a draft cannot slip
 // live through the edit form on a store with no ship-from address.
 if (body.status === "active" && item.status !== "active") {
 const refusal = publishRefusal(hasShipFrom(await getShippingSettings(slug)));
 if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
 }
 patch.status = body.status as (typeof STATUSES)[number];
 }
 if (Array.isArray(body.images)) patch.images = body.images.filter((x: unknown) => typeof x === "string" && (x as string).trim()).map((x: string) => x.trim()).slice(0, 20);
 if (body.weightOz !== undefined) patch.weightOz = intOrNull(body.weightOz);
 if (body.lengthIn !== undefined) patch.lengthIn = intOrNull(body.lengthIn);
 if (body.widthIn !== undefined) patch.widthIn = intOrNull(body.widthIn);
 if (body.heightIn !== undefined) patch.heightIn = intOrNull(body.heightIn);
 // Flaws: an array (even empty) replaces the list. Normalised against the condition being saved.
 if (Array.isArray(body.flaws)) patch.flaws = normalizeFlaws(body.flaws, patch.condition !== undefined ? patch.condition : item.condition);
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
