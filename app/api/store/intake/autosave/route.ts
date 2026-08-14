import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { stores } from "@/app/lib/stores";
import { createListing, updateListing, sanitizeListingInput } from "@/app/lib/listings-db";

export const dynamic = "force-dynamic";

// Silent autosave of an in-progress intake as a DRAFT — so leaving the add-listing screen
// (e.g. clicking out to consignment) before publishing/scheduling never loses the work.
// Upserts by draftId so repeated saves update one row instead of piling up duplicates.
// Deliberately lightweight: NO rememberItem / logPredictions / cross-listing — those belong
// to a real publish, not an autosave. Also serves navigator.sendBeacon on tab-close/unmount.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => null);
 if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

 const store = stores.find((s) => s.slug === slug);
 const input = sanitizeListingInput(body, store?.currency || "USD");
 input.status = "draft"; // an autosave is always a draft

 // Nothing worth persisting yet (no photos and no title) — no-op, don't create empty drafts.
 if (!input.images.length && !input.title) {
  return NextResponse.json({ ok: true, id: typeof body?.draftId === "string" ? body.draftId : null, skipped: true });
 }
 // Photos-first drafts (clicked out before the AI drafted a title) still deserve to be saved.
 if (!input.title) input.title = "Untitled listing";

 const draftId = typeof body?.draftId === "string" && body.draftId ? body.draftId : null;
 let listing = draftId ? await updateListing(draftId, slug, input) : null; // upsert existing draft
 if (!listing) listing = await createListing(slug, input); // first save (or the draft was deleted)
 return NextResponse.json({ ok: true, id: listing?.id ?? null });
}
