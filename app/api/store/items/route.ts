import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny, isOwner } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listSellerItems, deleteAllItems, publishItems, removeItems, applyLot, priceWeights } from "@/app/lib/db/inventory";
import { getCollectionTitlesForItems, addItemsToCollection, deleteAllCollections } from "@/app/lib/db/collections";
import { splitLotCost, newLotId, parseAcquiredAt } from "@/app/lib/lot-core";
import { getShippingSettings, hasShipFrom } from "@/app/lib/store-shipping-db";
import { publishRefusal } from "@/app/lib/setup-gate-core";

export const dynamic = "force-dynamic";

// GET — all of the acting store's VYA-native items (any status).
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const seller = await getSellerBySlug(slug);
 const items = seller ? await listSellerItems(seller.id) : [];
 // Attach each item's collections (titles) so the editor's picker can prefill.
 const colMap = items.length ? await getCollectionTitlesForItems(items.map((i) => i.id)).catch(() => ({} as Record<string, string[]>)) : {};
 const withCols = items.map((i) => ({ ...i, collections: colMap[i.id] || [] }));
 // isAdmin gates the owner-only "clear all inventory" reset.
 return NextResponse.json({ ok: true, items: withCols, isAdmin: isOwner(request, slug) });
}

// POST { action: "publish" | "remove" | "addToCollection" | "lot" | "cost", ids: string[] } — bulk
// action on the acting store's items, e.g. push a whole drop of drafts live at once. Scoped to the
// seller, so passing another store's ids is a no-op.
//
//   lot  { sourceName?, acquiredAt?, lotCostCents? } — where the batch came from and when, written to
//        every piece; the lot cost split across them in proportion to their prices (equal when a
//        price is missing), remainder pennies to the first. The batch gets one lot id.
//   cost { eachCents } | { totalCents } — fill in cost: the same on every piece, or a total split.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const seller = await getSellerBySlug(slug);
 if (!seller) return NextResponse.json({ error: "Not found" }, { status: 404 });

 const body = await request.json().catch(() => ({}));
 const action = body?.action;
 const ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
 if (!ids.length) return NextResponse.json({ error: "No items selected" }, { status: 400 });

 let count = 0;
 if (action === "publish") {
 // Same wall as the single publish: no ship-from address, nothing goes live.
 const refusal = publishRefusal(hasShipFrom(await getShippingSettings(slug)));
 if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
 count = await publishItems(seller.id, ids);
 }
 else if (action === "remove") count = await removeItems(seller.id, ids);
 else if (action === "addToCollection") {
 const title = String(body?.collection ?? "").trim();
 if (!title) return NextResponse.json({ error: "Collection name required" }, { status: 400 });
 const col = await addItemsToCollection(seller.id, title, ids);
 return NextResponse.json({ ok: true, count: ids.length, collection: { id: col.id, title: col.title } });
 } else if (action === "lot") {
 const sourceName = body?.sourceName === undefined ? undefined : (String(body.sourceName ?? "").trim().slice(0, 80) || null);
 const acquiredAt = body?.acquiredAt === undefined ? undefined : parseAcquiredAt(body.acquiredAt);
 if (body?.acquiredAt && acquiredAt === null) return NextResponse.json({ error: "That date didn't make sense — use YYYY-MM-DD." }, { status: 400 });
 const lotCost = body?.lotCostCents == null || body.lotCostCents === "" ? null : Math.round(Number(body.lotCostCents));
 if (lotCost != null && !(Number.isFinite(lotCost) && lotCost >= 0)) return NextResponse.json({ error: "Enter what the lot cost." }, { status: 400 });
 if (sourceName === undefined && acquiredAt === undefined && lotCost == null) return NextResponse.json({ error: "Nothing to set" }, { status: 400 });
 // Split by price where every piece has one, so the coat carries more of the lot than the scarf.
 const weights = lotCost != null ? await priceWeights(seller.id, ids) : {};
 const owned = lotCost != null ? ids.filter((id: string) => id in weights) : ids;
 const costs = lotCost != null ? splitLotCost(lotCost, owned, weights) : undefined;
 const lotId = newLotId();
 count = await applyLot(seller.id, owned, { sourceName, acquiredAt, lotId, costs });
 return NextResponse.json({ ok: true, count, lotId, costs: costs ?? null });
 } else if (action === "cost") {
 const each = body?.eachCents == null || body.eachCents === "" ? null : Math.round(Number(body.eachCents));
 const total = body?.totalCents == null || body.totalCents === "" ? null : Math.round(Number(body.totalCents));
 if (each == null && total == null) return NextResponse.json({ error: "Enter a cost." }, { status: 400 });
 if ((each != null && !(Number.isFinite(each) && each >= 0)) || (total != null && !(Number.isFinite(total) && total >= 0))) return NextResponse.json({ error: "Enter a cost." }, { status: 400 });
 const weights = await priceWeights(seller.id, ids);
 const owned = ids.filter((id: string) => id in weights);
 const costs = each != null ? Object.fromEntries(owned.map((id: string) => [id, each])) : splitLotCost(total as number, owned, weights);
 count = await applyLot(seller.id, owned, { costs });
 return NextResponse.json({ ok: true, count, costs });
 } else return NextResponse.json({ error: "Unknown action" }, { status: 400 });

 return NextResponse.json({ ok: true, count });
}

// DELETE — owner-only: wipe ALL of this store's inventory, sold included (plus the
// orders behind sold items). For you as the tester/owner, not a per-seller feature.
export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!isOwner(request, slug)) return NextResponse.json({ error: "Owner only" }, { status: 403 });
 const seller = await getSellerBySlug(slug);
 const deleted = seller ? await deleteAllItems(seller.id).catch(() => 0) : 0;
 // Clearing the whole inventory also clears the store's collections — otherwise they'd linger empty.
 if (seller) await deleteAllCollections(seller.id).catch(() => 0);
 return NextResponse.json({ ok: true, deleted });
}
