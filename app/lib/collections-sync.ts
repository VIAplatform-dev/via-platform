import { neon } from "@neondatabase/serverless";

// ─────────────────────────────────────────────────────────────────────────────
// Collections capture — a store's OWN collections (e.g. "1990s", "Chanel", "Bags")
// are the richest seller-labeled signal we get: era, brand, and category as the
// seller themselves filed each piece. We sync collection membership per product
// (from the public /collections.json + /collections/{handle}/products.json), store
// it, and DERIVE a canonical era from it — so the intake accuracy loop and pricing
// comps learn from real labels instead of the AI re-guessing. Internal data only;
// buyer-facing "auto-fill VYA collections" is a separate curation pass.
// ─────────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

// Collections that carry no product meaning — navigation, catch-alls, price bands,
// internal drop codes. We never want these as era/brand/category signal.
const JUNK_COLLECTION_RE =
 /^(home\s*page|frontpage|shop\s*all|all|all\s*products|latest\s*drop|new\s*(arrivals?|in)|new\s*releases?|featured|best\s*sellers?|sale|on\s*sale|tier\s*\d+|coming\s*soon|available|sold|sold\s*archive|permanent\s*collection|sourcing|special\s*pricing|rental|frontpage)$/i;
const MONTHS_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i;
// Collections that carry no product meaning — navigation, catch-alls, price bands, presale/drop batches,
// Shopify demo data, and numbered dupes. Never a real era/brand/category, and never worth importing.
export function isJunkCollection(title: string): boolean {
 const t = (title || "").trim();
 if (!t || t.length > 60) return true;
 const l = t.toLowerCase();
 if (JUNK_COLLECTION_RE.test(l)) return true;
 if (t.startsWith("#")) return true; // internal batch/drop codes like "#SBS-July20"
 if (/asset\s*pack|example\s*products?|sample\s*data/.test(l)) return true; // Shopify demo/starter data
 if (/\bpre-?sale\b|\bdrop\s*\d/.test(l)) return true; // "August Presale", "Drop 001"
 if (MONTHS_RE.test(l) && /\d/.test(l)) return true; // dated batches: "Gf Oct 25 26 Bags"
 // Price-band / numeric-range collections: "$50 and under", "Above 5000", "Items 1 000 To 5000", "1000 5000".
 if (/\$\s*\d|\b(under|over|above|below|greater\s*than|less\s*than)\b|\bitems?\b[\s\w]*\d|\bto\b[\s\d,]*\d/.test(l)) return true;
 if (/^[\d\s,–-]+$/.test(l)) return true; // pure number ranges like "1 000 5 000"
 if (/\(test\)|\btest\b/.test(l)) return true; // "Y2K (test)"
 if (/\s\d{1,3}$/.test(t) && !/(19|20)\d0s?$/i.test(t)) return true; // dupe/drop suffixes: "Dresses 1", "Drop 002" (keep "1990s")
 return false;
}

// Derive a canonical era from the collection titles a piece belongs to. Stores file by
// decade ("1990s", "2000s") or Y2K — the strongest era ground truth we get.
export function eraFromCollections(titles: string[]): string | null {
 const j = titles.join(" ").toLowerCase();
 if (/\b(1970s|1970|70s)\b/.test(j)) return "1970s";
 if (/\b(1980s|1980|80s)\b/.test(j)) return "1980s";
 if (/\b(1990s|1990|90s)\b/.test(j)) return "1990s";
 if (/\b(2000s|2000|y2k|00s)\b/.test(j)) return "2000s";
 if (/\b(2010s|2010|10s)\b/.test(j)) return "2010s";
 return null;
}

type ShopCollection = { handle: string; title: string };
type ShopColProduct = { id: number | string };

async function getJson(url: string): Promise<any | null> {
 try {
 const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
 if (!r.ok) return null;
 return await r.json();
 } catch {
 return null;
 }
}

/**
 * Sync one Shopify store's collection membership into products.collections + products.era.
 * Idempotent — safe to run on every pass. Returns counts for logging.
 */
export async function syncStoreCollections(
 storeSlug: string,
 storeDomain: string,
): Promise<{ collections: number; productsUpdated: number }> {
 const base = `https://${storeDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
 const colData = await getJson(`${base}/collections.json?limit=250`);
 const collections: ShopCollection[] = Array.isArray(colData?.collections) ? colData.collections : [];
 if (!collections.length) return { collections: 0, productsUpdated: 0 };

 // shopifyProductId (string) → set of meaningful collection titles it belongs to.
 const membership = new Map<string, Set<string>>();
 for (const col of collections) {
 if (!col.handle || isJunkCollection(col.title)) continue;
 for (let page = 1; page <= 4; page++) {
 const pd = await getJson(`${base}/collections/${col.handle}/products.json?limit=250&page=${page}`);
 const prods: ShopColProduct[] = Array.isArray(pd?.products) ? pd.products : [];
 if (!prods.length) break;
 for (const p of prods) {
 const id = String(p.id);
 if (!membership.has(id)) membership.set(id, new Set());
 membership.get(id)!.add(col.title.trim());
 }
 if (prods.length < 250) break;
 }
 }

 const sql = db();
 let productsUpdated = 0;
 for (const [pid, set] of membership) {
 const titles = [...set];
 const era = eraFromCollections(titles);
 try {
 // COALESCE era so a seller-typed era is never overwritten by a null derivation.
 const res = (await sql`
  UPDATE products
  SET collections = ${titles}, era = COALESCE(${era}, era)
  WHERE store_slug = ${storeSlug} AND shopify_product_id = ${pid}
  RETURNING id
 `) as { id: number }[];
 productsUpdated += res.length;
 } catch { /* skip a bad row, keep going */ }
 }

 return { collections: collections.length, productsUpdated };
}
