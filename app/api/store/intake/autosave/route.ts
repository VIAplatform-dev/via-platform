import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { stores } from "@/app/lib/stores";
import { createListing, updateListing, sanitizeListingInput } from "@/app/lib/listings-db";
import { recordIntakeExample } from "@/app/lib/training-data-db";

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

 // Record the accuracy signal for this DRAFT (not only at publish) — the seller's edits to the AI
 // draft are the label, and most test drafts are never published. Only when the AI actually drafted
 // (aiDraft present); upserts per draft id, so each save refreshes the same row. Best-effort.
 const ai = (body.aiDraft && typeof body.aiDraft === "object" ? body.aiDraft : {}) as Record<string, unknown>;
 if (listing?.id && Object.keys(ai).length > 0) {
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const aiStr = (k: string) => (typeof ai[k] === "string" ? (ai[k] as string) : null);
  await recordIntakeExample({
   itemId: listing.id, storeSlug: slug, imageUrls: input.images,
   final: { brand: s(body.brand, 80), era: s(body.era, 40), material: s(body.material, 120), condition: s(body.condition, 80), category: s(body.category, 60), size: s(body.size, 40), title: input.title, description: s(body.description, 2000) },
   priceCents: typeof body.price === "number" && body.price > 0 ? Math.round(body.price * 100) : null,
   marketCents: typeof body.marketCents === "number" ? Math.round(body.marketCents) : null,
   ai: { brand: aiStr("brand"), era: aiStr("era"), material: aiStr("material"), condition: aiStr("condition"), category: aiStr("category"), title: aiStr("title"), description: aiStr("description"), runway: null, celebrity: null },
   reverseImage: body.reverseImage ?? null,
   promptVersion: typeof body.promptVersion === "string" ? body.promptVersion : null,
   trust: "medium", // an unpublished draft — reviewed=high is only stamped at publish
  }).catch(() => {});
 }
 return NextResponse.json({ ok: true, id: listing?.id ?? null });
}
