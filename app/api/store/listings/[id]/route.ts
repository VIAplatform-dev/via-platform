import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { stores } from "@/app/lib/stores";
import { updateListing, deleteListing, sanitizeListingInput } from "@/app/lib/listings-db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH: edit one of the acting store's listings (scoped to its slug).
export async function PATCH(request: NextRequest, { params }: Ctx) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const { id } = await params;
 if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

 const body = await request.json().catch(() => null);
 if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

 const store = stores.find((s) => s.slug === slug);
 const input = sanitizeListingInput(body, store?.currency || "USD");
 if (!input.title) return NextResponse.json({ error: "Title is required." }, { status: 400 });

 const listing = await updateListing(id, slug, input);
 if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
 return NextResponse.json({ ok: true, listing });
}

// DELETE: remove one of the acting store's listings.
export async function DELETE(request: NextRequest, { params }: Ctx) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const { id } = await params;
 if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

 const ok = await deleteListing(id, slug);
 if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
 return NextResponse.json({ ok: true });
}
