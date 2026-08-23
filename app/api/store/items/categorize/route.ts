import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listSellerItems, updateItem } from "@/app/lib/db/inventory";
import { categorizeItems } from "@/app/lib/categorize-ai";
import { toCategorySlug, isCanonicalCategory } from "@/app/lib/item-tags";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BATCH = 60; // a sweep, not a whole-catalog migration — keeps us inside maxDuration

// POST { ids?: string[], scope?: "untagged" } — re-tag the acting store's items from their
// photos. `ids` targets an explicit selection; `scope: "untagged"` picks every item whose
// stored category doesn't fold onto the taxonomy. Items the model can't place are skipped,
// not guessed at, and reported back in `skipped`.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI isn’t configured on this deployment." }, { status: 503 });

 const seller = await getSellerBySlug(slug);
 if (!seller) return NextResponse.json({ error: "Not found" }, { status: 404 });

 const body = await request.json().catch(() => ({}));
 const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
 const untaggedOnly = body?.scope === "untagged";
 if (!ids.length && !untaggedOnly) return NextResponse.json({ error: "Nothing to tag" }, { status: 400 });

 // Scope to the seller's own items — an id from another store is simply not found.
 const all = await listSellerItems(seller.id);
 let targets = ids.length ? all.filter((i) => ids.includes(i.id)) : all;
 if (untaggedOnly) targets = targets.filter((i) => !isCanonicalCategory(toCategorySlug(i.category)));
 targets = targets.filter((i) => i.status !== "removed").slice(0, MAX_BATCH);

 if (!targets.length) return NextResponse.json({ ok: true, tagged: 0, skipped: 0, results: [] });

 const results = await categorizeItems(
  targets.map((i) => ({ id: i.id, title: i.title, imageUrl: i.images?.[0] ?? null })),
 );

 let tagged = 0, skipped = 0;
 for (const r of results) {
  if (!r.slug) { skipped++; continue; }
  const ok = await updateItem(r.id, { category: r.slug }).then(() => true).catch(() => false);
  if (ok) tagged++; else skipped++;
 }

 return NextResponse.json({ ok: true, tagged, skipped, capped: targets.length === MAX_BATCH, results });
}
