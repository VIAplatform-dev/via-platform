import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { createItem } from "@/app/lib/db/inventory";
import { getDb, items } from "@/app/lib/db/index";
import { eq, and, isNotNull } from "drizzle-orm";
import { MAX_ITEM_IMAGES } from "@/app/lib/item-limits";
import { prepare, importSummary } from "@/app/lib/depop-import";
import { logError } from "@/app/lib/error-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // a shop can be hundreds of pieces

// POST { items }: a seller's existing Depop shop, moved into VYA.
//
// THE ON-RAMP. A vintage seller arriving at VYA already has her whole shop on Depop: the photographs
// taken, the descriptions written, the prices decided. Asking her to type it all again is asking her
// not to move at all. The extension walks her own selling hub in her own browser. Her session, her
// pages, no scraping of anyone else, and posts what it found here.
//
// THIS ROUTE DID NOT EXIST. The button was in VYA's cross-listing settings, the extension collected
// everything correctly, and then vya.js POSTed it to /api/store/import/depop and got a 404. The
// import kept the collection "to retry", so it retried into the same 404 for ever. Nothing about it
// looked broken from the outside, which is why it is worth saying plainly here.
//
// Pieces land as DRAFTS (see depop-import.ts), and sold ones land sold, as history.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => null);
 const seller = await getSellerBySlug(slug);
 if (!seller) return NextResponse.json({ error: "Store not found" }, { status: 404 });

 // What this store has already taken from Depop, by its Depop handle. Re-running the import after
 // listing a few more pieces should bring the few, not everything again.
 const db = getDb();
 const already = await db
  .select({ sourceId: items.sourceId })
  .from(items)
  .where(and(eq(items.sellerId, seller.id), eq(items.sourcePlatform, "depop"), isNotNull(items.sourceId)))
  .catch(() => [] as { sourceId: string | null }[]);
 const known = new Set(already.map((r) => String(r.sourceId)).filter(Boolean));

 const ready = prepare(body?.items, known, MAX_ITEM_IMAGES);
 if (!ready.length) {
  return NextResponse.json({ ok: true, created: 0, results: [], message: importSummary(0, 0) });
 }

 const results: { sourceId: string; status: string }[] = [];
 for (const it of ready) {
  try {
   await createItem({
    sellerId: seller.id,
    title: it.title,
    description: it.description,
    priceCents: it.priceCents,
    currency: it.currency,
    // The rehost-images cron copies these to our own storage in the background, the same way the
    // CSV importer leaves them. A seller's pictures must not depend on Depop continuing to serve
    // them, least of all after she has stopped selling there.
    images: it.images,
    brand: it.brand,
    category: it.category,
    size: it.size,
    status: it.status,
    source: "imported",
    sourcePlatform: "depop",
    sourceId: it.sourceId,
    // Sold pieces are history and need a date to sit on in the analytics. The real sale date is not
    // on the page the extension read, so this records when it came over rather than inventing one.
    soldAt: it.status === "sold" ? new Date() : null,
   });
   results.push({ sourceId: it.sourceId, status: it.status });
  } catch (e) {
   // One bad piece must not lose the other 399, and a silent skip is how a seller ends up short
   // without knowing which.
   await logError("depop-import-item", e, { context: { slug, sourceId: it.sourceId, title: it.title } }).catch(() => {});
  }
 }

 const sold = results.filter((r) => r.status === "sold").length;
 return NextResponse.json({
  ok: true,
  created: results.length,
  skipped: ready.length - results.length,
  results,
  message: importSummary(results.length, sold),
 });
}
