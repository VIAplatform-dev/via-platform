import { neon } from "@neondatabase/serverless";
import { deriveDisplaySize, expandSizeKeys } from "./inventory";
import { GENERIC_CLOTHING_SIZE } from "./shopifyClient";
import { ensureSizeKeysColumn, type DBProduct } from "./db";

// ---------------------------------------------------------------------------
// products.size_keys backfill.
//
// The web grid filters on the DERIVED display size (deriveSize, which reads the
// seller's fit note, so "best fits US 2-4" becomes the shown size). The SQL list
// endpoints (new-arrivals, feed) used to filter on the RAW Shopify variant size,
// so they could neither see the derived fit size nor handle ranges.
//
// This computes, for every product, the set of bare size tokens it should match
// a filter on, the derived size expanded over its range ("US 2-4" → {2,3,4}),
// and stores it in products.size_keys. The endpoints then filter with a GIN
// array-overlap, matching the EXACT sizes shoppers see, ranges included.
// ---------------------------------------------------------------------------

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

export async function backfillSizeKeys(
 opts: { onlyMissing?: boolean; limit?: number } = {},
): Promise<{ scanned: number; updated: number; groups: number; sizesFixed: number }> {
 const sql = db();
 await ensureSizeKeysColumn();

 // Cap rows per run so the nightly job stays bounded as the catalog grows. This was a
 // full, unbounded table scan+rewrite every night. With onlyMissing it only touches rows
 // that don't have size_keys yet (new/re-synced items), draining any backlog over a few runs.
 const cap = opts.limit ?? 1_000_000;
 const rows = (opts.onlyMissing
 ? await sql`SELECT id, title, description, size, currency FROM products WHERE size_keys IS NULL LIMIT ${cap}`
 : await sql`SELECT id, title, description, size, currency FROM products LIMIT ${cap}`) as Array<{
 id: number;
 title: string;
 description: string | null;
 size: string | null;
 currency: string | null;
 }>;

 // Group products by identical key-set so the whole table updates in a handful
 // of statements (most items share a size) rather than one query per row.
 const groups = new Map<string, { keys: string[]; ids: number[] }>();
 // Separately, fix the stored `size` column when it's a GENERIC letter (or null)
 // but the title/description yields a real size. E.g. shoes mislabeled "M" by a
 // stray Squarespace tag. We only touch generic/null sizes, never a real numeric
 // one, so this can't clobber correct data. Keyed by the value to set (or null).
 const sizeFixes = new Map<string | null, number[]>();

 for (const r of rows) {
 const derived = deriveDisplaySize({ title: r.title, description: r.description, size: r.size, currency: r.currency } as DBProduct);
 const keys = derived ? expandSizeKeys(derived) : [];
 const sig = JSON.stringify(keys);
 const g = groups.get(sig);
 if (g) g.ids.push(r.id);
 else groups.set(sig, { keys, ids: [r.id] });

 const current = r.size?.trim() ?? null;
 const currentIsGeneric = current == null || GENERIC_CLOTHING_SIZE.test(current);
 const next = derived ?? null;
 if (currentIsGeneric && next !== current) {
 const arr = sizeFixes.get(next);
 if (arr) arr.push(r.id);
 else sizeFixes.set(next, [r.id]);
 }
 }

 let updated = 0;
 for (const g of groups.values()) {
 await sql`UPDATE products SET size_keys = ${g.keys}::text[] WHERE id = ANY(${g.ids})`;
 updated += g.ids.length;
 }

 let sizesFixed = 0;
 for (const [val, ids] of sizeFixes) {
 await sql`UPDATE products SET size = ${val} WHERE id = ANY(${ids})`;
 sizesFixed += ids.length;
 }

 return { scanned: rows.length, updated, groups: groups.size, sizesFixed };
}
