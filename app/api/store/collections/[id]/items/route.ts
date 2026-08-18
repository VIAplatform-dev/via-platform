import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { getCollection, addItemsToCollection, removeItemsFromCollection } from "@/app/lib/db/collections";

export const dynamic = "force-dynamic";

async function seller(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return null;
 return getSellerBySlug(slug);
}
const idsOf = (b: unknown) => (Array.isArray((b as { ids?: unknown[] })?.ids) ? (b as { ids: unknown[] }).ids.filter((x): x is string => typeof x === "string") : []);

// POST { ids } — add items to this collection (an item can live in many collections; no others are touched).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const s = await seller(request);
 if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await params;
 const col = await getCollection(s.id, id);
 if (!col) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const ids = idsOf(await request.json().catch(() => ({})));
 if (!ids.length) return NextResponse.json({ error: "No items" }, { status: 400 });
 await addItemsToCollection(s.id, col.title, ids);
 return NextResponse.json({ ok: true, count: ids.length });
}

// DELETE { ids } — remove items from this collection (the items themselves stay, as do their other collections).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const s = await seller(request);
 if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await params;
 const ids = idsOf(await request.json().catch(() => ({})));
 if (!ids.length) return NextResponse.json({ error: "No items" }, { status: 400 });
 await removeItemsFromCollection(s.id, id, ids);
 return NextResponse.json({ ok: true, count: ids.length });
}
