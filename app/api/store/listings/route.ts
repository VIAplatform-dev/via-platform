import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { stores } from "@/app/lib/stores";
import { getListingsByStore, createListing, sanitizeListingInput } from "@/app/lib/listings-db";

export const dynamic = "force-dynamic";

// GET: all of the acting store's listings (for the editor).
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const listings = await getListingsByStore(slug, false);
 return NextResponse.json({ ok: true, listings });
}

// POST: create a new listing.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => null);
 if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

 const store = stores.find((s) => s.slug === slug);
 const input = sanitizeListingInput(body, store?.currency || "USD");
 if (!input.title) return NextResponse.json({ error: "Title is required." }, { status: 400 });

 const listing = await createListing(slug, input);
 return NextResponse.json({ ok: true, listing });
}
