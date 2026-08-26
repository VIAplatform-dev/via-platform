// Bridges a captured store's products into VYA's checkout. When a seller brings
// their site over, their products are imported as real db/items (the inventory the
// Stripe checkout reads), and each captured product page is matched to its item so
// "Buy now" runs through VYA's existing Stripe flow.
import { getSellerBySlug } from "./db/sellers";
import { createItem, listAvailableItems, listStorefrontItems } from "./db/inventory";
import { getImportedOrderTitleSet } from "./imported-orders-db";
import { extractMeasurements } from "./measurements";
import { inferItemFields } from "./infer-item-fields";
import type { ImportedProduct } from "./store-import";

// Pure helpers (money, identity, hashing) live in capture-commerce-core.ts so they can be unit
// tested without the database layer — same split as inventory-core.ts.
export { productContentHash, centsOf, currencyOf, identityKey, slugifyHandle } from "./capture-commerce-core.ts";
import { centsOf, currencyOf, norm, identityKey, productContentHash, slugifyHandle } from "./capture-commerce-core.ts";

/** Create/refresh db/items (checkout-able inventory) for a captured store's products.
 *
 *  Matching is by SOURCE IDENTITY (platform + the source's own id/handle), not title. Title
 *  matching broke both ways on one-of-one vintage: two listings called "Vintage Levi's 501"
 *  collapsed into one, and retitling an item re-imported it as a duplicate. Identity also makes
 *  this re-runnable — a second import UPDATES the store's catalog instead of wiping and re-adding
 *  it, which is what lets inventory stay in sync without a destructive re-crawl.
 *
 *  Items a human has edited (`origin = 'user'`) are never overwritten. */
export async function importProductsAsItems(slug: string, products: ImportedProduct[]): Promise<ImportStats> {
 const seller = await getSellerBySlug(slug);
 if (!seller) return { added: 0, updated: 0, unchanged: 0, skipped: 0, removed: 0, warnings: [] };
 const { listItemsBySource, updateItemFromSource, markItemsMissingFromSource } = await import("./db/inventory.ts");

 // Everything this store previously imported, indexed by the source's own id.
 // NOT wrapped in a catch: an empty list here is indistinguishable from "this store has never been
 // imported", so a transient database error would make every existing product look new and re-import
 // the entire catalog as duplicates. Failing loudly is strictly safer than guessing.
 const previous = await listItemsBySource(seller.id, "captured");
 const byIdentity = new Map<string, (typeof previous)[number]>();
 const byTitle = new Map<string, (typeof previous)[number]>();
 for (const it of previous) {
  if (it.sourceId) byIdentity.set(identityKey(it.sourcePlatform, it.sourceId), it);
  byTitle.set(norm(it.title), it); // legacy fallback: rows imported before source ids existed
 }

 const existing = await listAvailableItems(seller.id);
 const have = new Set(existing.map((i) => i.title.toLowerCase().trim()));
 // A sold-out piece still on the seller's page is the SAME sale that arrives (authoritatively)
 // in their uploaded order history — importing it here as a phantom `sold` item would double-
 // count it. Skip any sold-out product the order list already covers (matched by title).
 // Degradation, not a failure: without the order list a sold-out product may be imported as a
 // phantom `sold` item that the order history also covers. Worth continuing — worth reporting.
 const stats: ImportStats = { added: 0, updated: 0, unchanged: 0, skipped: 0, removed: 0, warnings: [] };
 // Per-product failures are collected rather than thrown: one unwritable listing must not cost the
 // seller the other 300. They're summarised into a warning at the end so they're still visible.
 const failures: string[] = [];
 let coveredByOrders = new Set<string>();
 try {
  coveredByOrders = await getImportedOrderTitleSet(slug);
 } catch (e) {
  stats.warnings.push(`We couldn’t read your imported order history (${msgOf(e)}), so a few sold pieces may appear twice.`);
 }
 const seen = new Set<string>();

 for (const p of products) {
 const title = (p.name || "").trim();
 const cents = centsOf(p);
 if (!title || !cents) { stats.skipped++; continue; }
 if (p.available === false && coveredByOrders.has(norm(title))) { stats.skipped++; continue; }

 const key = p.sourceId ? identityKey(p.sourcePlatform, p.sourceId) : null;
 const prior = (key && byIdentity.get(key)) || byTitle.get(norm(title)) || null;
 if (key) seen.add(key);

 const hash = productContentHash(p);
 const status: "active" | "sold" = p.available === false ? "sold" : "active";
 // Store the source URLs now (fast import); the rehost-images cron copies them onto
 // OUR storage in the background so the interactive import doesn't wait on hundreds of
 // image uploads. Durability without the slow import.
 const images = (p.images?.length ? p.images : p.image ? [p.image] : []).slice(0, 8);
 // Sort the unstructured signal (title + description) into brand/era/condition/category/material.
 const inf = inferItemFields(title, p.description);

 if (prior) {
  // The seller edited this item — their version wins, always.
  if (prior.origin === "user") { stats.skipped++; continue; }
  // Unchanged AND already carrying its identity → nothing to do. Rows imported before source ids
  // existed match by title on this pass, and must be backfilled even if their content is identical,
  // or every future import would keep falling back to fragile title matching.
  const hasIdentity = !p.sourceId || prior.sourceId === p.sourceId;
  if (prior.contentHash && prior.contentHash === hash && hasIdentity) { stats.unchanged++; continue; }
  // A failed update must not be counted as an update — that's how a broken sync reported success.
  try {
   await updateItemFromSource(prior.id, {
    title, priceCents: cents, currency: currencyOf(p), images,
    description: p.description ?? null, size: p.size ?? null, status,
    variants: p.variants ?? [], contentHash: hash,
    sourcePlatform: p.sourcePlatform ?? null, sourceId: p.sourceId ?? null, sourceUrl: p.sourceUrl ?? null,
   });
   stats.updated++;
  } catch (e) {
   stats.skipped++;
   failures.push(`“${title}” (${msgOf(e)})`);
  }
  continue;
 }

 if (have.has(title.toLowerCase())) { stats.skipped++; continue; }
 try {
 await createItem({
 sellerId: seller.id,
 title,
 priceCents: cents,
 currency: currencyOf(p),
 images,
 description: p.description ?? null,
 brand: inf.brand,
 era: inf.era,
 material: inf.material,
 condition: inf.condition,
 category: inf.category,
 size: p.size ?? null,
 measurements: extractMeasurements(p.description), // pull flat measurements out of the imported prose
 status,
 source: "captured",
 sourcePlatform: p.sourcePlatform ?? null,
 sourceId: p.sourceId ?? null,
 sourceUrl: p.sourceUrl ?? null,
 contentHash: hash,
 variants: p.variants ?? [],
 origin: "source",
 });
 have.add(title.toLowerCase());
 stats.added++;
 } catch (e) {
 stats.skipped++;
 failures.push(`“${title}” (${msgOf(e)})`);
 }
 }

 if (failures.length) {
  const shown = failures.slice(0, 3).join(", ");
  stats.warnings.push(`${failures.length} product${failures.length === 1 ? "" : "s"} couldn’t be saved: ${shown}${failures.length > 3 ? ` and ${failures.length - 3} more` : ""}.`);
 }

 // Anything we imported before that the source no longer lists has been taken down or sold there.
 // Mark it sold rather than deleting: it's real sales history, and deleting would also break the
 // captured product page that still links to it. Seller-edited rows are left alone.
 const goneKeys = [...byIdentity.keys()].filter((k) => !seen.has(k));
 if (goneKeys.length) {
  try {
   stats.removed = await markItemsMissingFromSource(goneKeys.map((k) => byIdentity.get(k)!.id).filter(Boolean));
  } catch (e) {
   // Reported, not fatal: the import succeeded, but pieces the store has taken down are still
   // showing as available on VYA — which the seller needs to know about.
   stats.warnings.push(`${goneKeys.length} piece${goneKeys.length === 1 ? "" : "s"} your store no longer lists couldn’t be marked sold (${msgOf(e)}).`);
  }
 }
 return stats;
}

/** A thrown value as a short readable clause for a warning. */
function msgOf(e: unknown): string {
 return e instanceof Error && e.message ? e.message : String(e);
}

export type ImportStats = { added: number; updated: number; unchanged: number; skipped: number; removed: number; warnings: string[] };


/**
 * Put imported items INTO the collections their captured pages render.
 *
 * The capture pre-creates a VYA collection per captured `/collections/{handle}` page, and the
 * storefront swaps each captured grid for live VYA inventory — but only for collections that
 * actually contain items. Nothing was ever linking the two, so every collection sat empty and the
 * live-inventory swap silently fell back to the frozen source grid. This is that missing link.
 *
 * Membership comes from the source's own collection endpoints (authoritative), keyed on the
 * product handle. Falls back to the product's tags when a platform has no membership API.
 */
export async function syncCollectionMembership(
 slug: string,
 domain: string,
 products: ImportedProduct[],
): Promise<{ collections: number; links: number; warnings: string[] }> {
 const seller = await getSellerBySlug(slug);
 if (!seller) return { collections: 0, links: 0, warnings: [] };
 const { listCollections, setItemCollections } = await import("./db/collections.ts");
 const { listItemsBySource } = await import("./db/inventory.ts");
 const { getShopifyCollectionMembership } = await import("./store-import.ts");

 // Not caught: an empty collection list reads as "this store has no collections", which silently
 // turns a database blip into "membership sync did nothing" — the failure that left every captured
 // collection page falling back to the frozen source grid.
 const cols = await listCollections(seller.id, true);
 if (!cols.length) return { collections: 0, links: 0, warnings: [] };
 const colBySlug = new Map(cols.map((c) => [c.slug, c.id]));

 // handle → [collection slugs]. A CONNECTED store already told us each product's collections
 // (adminGetProducts returns collectionHandles), so we use that and skip the crawl entirely —
 // exact, and one API call instead of up to 25 collection listings. Only scrape when we have to.
 let membership = new Map<string, string[]>();
 const fromApi = products.filter((p) => p.sourceId && p.collectionHandles?.length);
 if (fromApi.length) {
  for (const p of fromApi) membership.set(p.sourceId as string, p.collectionHandles as string[]);
 } else {
  try {
   membership = await getShopifyCollectionMembership(domain, [...colBySlug.keys()]);
  } catch { /* fall through to tags */ }
 }

 const items = await listItemsBySource(seller.id, "captured");
 const bySourceId = new Map(items.filter((i) => i.sourceId).map((i) => [i.sourceId as string, i]));
 const byTitle = new Map(items.map((i) => [norm(i.title), i]));

 let links = 0;
 const failed: string[] = [];
 const used = new Set<string>();
 for (const p of products) {
  const item = (p.sourceId && bySourceId.get(p.sourceId)) || byTitle.get(norm(p.name || "")) || null;
  if (!item) continue;
  // A seller who has organised their own collections owns that decision — don't reshuffle it.
  if (item.origin === "user") continue;

  const handleSlugs = p.sourceId ? membership.get(p.sourceId) || [] : [];
  const tagSlugs = (p.tags || []).map((t) => slugifyHandle(t)).filter((s) => colBySlug.has(s));
  const slugs = [...new Set([...handleSlugs, ...tagSlugs])].filter((s) => colBySlug.has(s));
  if (!slugs.length) continue;

  const ids = slugs.map((s) => colBySlug.get(s)!).filter(Boolean);
  try {
   await setItemCollections(item.id, ids);
   slugs.forEach((s) => used.add(s));
   links += ids.length;
  } catch (e) {
   // Counted as a failure rather than a link — otherwise the tally claims work that didn't happen.
   failed.push(`“${item.title}” (${msgOf(e)})`);
  }
 }
 const warnings = failed.length
  ? [`${failed.length} product${failed.length === 1 ? "" : "s"} couldn’t be filed into their collections: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? ` and ${failed.length - 3} more` : ""}.`]
  : [];
 return { collections: used.size, links, warnings };
}



/**
 * Adopt the SOURCE store's ordering for each collection.
 *
 * Membership alone isn't fidelity: a curated collection has an order the seller chose, and without
 * it their archive page came back sorted by import date — the same 37 pieces, but nobody's first
 * four matched. The captured collection page already shows that order (the sequence its product
 * links appear in), so it's read from there rather than guessed or configured.
 *
 * Best-effort per collection: a page we can't read leaves that collection's order untouched.
 */
export async function syncCollectionOrder(slug: string): Promise<{ collections: number; ordered: number }> {
 const seller = await getSellerBySlug(slug);
 if (!seller) return { collections: 0, ordered: 0 };
 const { listCollections, reorderCollectionItems, listCollectionItems } = await import("./db/collections.ts");
 const { listCapturePaths, getCapturePage } = await import("./site-capture-db.ts");
 const cheerio = await import("cheerio");

 const cols = await listCollections(seller.id, true);
 const paths = await listCapturePaths(slug);
 let collections = 0, ordered = 0;

 for (const col of cols) {
  const path = paths.find((p) => p === `/collections/${col.slug}` || p === `/collections/${col.slug}/`);
  if (!path) continue;
  const html = await getCapturePage(slug, path);
  if (!html) continue;
  // The order the source lists its products in, read off the page's own product links.
  const $ = cheerio.load(html);
  const handles: string[] = [];
  $("a[href*='/products/']").each((_, el) => {
   const m = ($(el).attr("href") || "").match(/\/products\/([^/?#]+)/);
   if (m && !handles.includes(m[1])) handles.push(m[1]);
  });
  if (!handles.length) continue;

  const members = await listCollectionItems(col.id, { manage: true });
  const bySource = new Map(members.filter((i) => i.sourceId).map((i) => [i.sourceId as string, i.id]));
  const ids = handles.map((h) => bySource.get(h)).filter((x): x is string => Boolean(x));
  if (!ids.length) continue;
  await reorderCollectionItems(col.id, ids);
  collections++;
  ordered += ids.length;
 }
 return { collections, ordered };
}

/**
 * Convert a store's SYNCED marketplace catalog (the read-only `products` rows from a
 * Shopify/Squarespace/etc. connection) into managed, sellable OS `items` — the self-serve
 * fix for the two-table trap, so a connected store can actually edit/reprice/manage its
 * inventory instead of only browsing it. Re-hosts images (survives leaving the old platform),
 * carries over everything we captured (brand/era/material/condition/measurements/size), and
 * is idempotent by title so re-running only adds what's new.
 */
export async function convertCatalogToItems(slug: string): Promise<{ added: number; total: number }> {
 const { getProductsByStore } = await import("./db");
 const seller = await getSellerBySlug(slug);
 if (!seller) return { added: 0, total: 0 };
 // Uncaught: returning [] on error would report "added 0 of 0" — a successful no-op — when the
 // seller's whole synced catalog simply failed to load.
 const products = await getProductsByStore(slug);
 const existing = await listAvailableItems(seller.id);
 const have = new Set(existing.map((i) => i.title.toLowerCase().trim()));
 let added = 0;
 for (const p of products) {
 const title = (p.title || "").trim();
 const cents = Math.round(Number(p.price) * 100);
 if (!title || !cents || have.has(title.toLowerCase())) continue;
 let raw: string[] = [];
 if (p.images) { try { const a = JSON.parse(p.images); if (Array.isArray(a)) raw = a; } catch {} }
 if (!raw.length && p.image) raw = [p.image];
 const images = raw.slice(0, 8); // rehost-images cron copies these to our storage in the background
 // Carry over what the source had; fill any blanks by inferring from title + description.
 const inf = inferItemFields(title, p.description, { brand: p.brand, era: p.era, material: p.materials, condition: p.condition, category: p.product_type });
 await createItem({
 sellerId: seller.id,
 title,
 priceCents: cents,
 currency: p.currency || "USD",
 images,
 description: p.description ?? null,
 brand: inf.brand,
 era: inf.era,
 material: inf.material,
 condition: inf.condition,
 size: p.size ?? null,
 measurements: p.measurements || extractMeasurements(p.description), // structured field, else pull from the prose
 category: inf.category,
 status: "active",
 source: "imported",
 });
 have.add(title.toLowerCase());
 added++;
 }
 return { added, total: products.length };
}

/** Find the db/item id behind a captured product page — for its Buy button.
 *
 *  `handle` is the SOURCE's own product id (it's the /products/{handle} segment we captured), so
 *  matching on it is exact. Title matching is kept only as a fallback for items imported before
 *  source ids existed: on one-of-one vintage it both merges distinct pieces that share a name and
 *  misses renamed ones, and its substring branch could point a Buy button at the wrong garment. */
export async function matchItemId(slug: string, title: string, handle?: string | null): Promise<string | null> {
 const seller = await getSellerBySlug(slug);
 if (!seller) return null;
 if (handle) {
  const { listItemsBySource } = await import("./db/inventory.ts");
  // Uncaught deliberately: swallowing here would drop through to the TITLE fallback below, whose
  // substring branch can point a Buy button at a different garment. On one-of-one stock that sells
  // the wrong piece — far worse than the page failing to render a buy button at all.
  const imported = await listItemsBySource(seller.id, "captured");
  const exact = imported.find((i) => i.sourceId === handle);
  if (exact) return exact.id;
 }
 if (!title) return null;
 // Storefront visibility (active + sold), not just active: a vintage store's archive is part of
 // browsing, and this match feeds the SAME identity rewrite for every captured product page,
 // active or not (see plan-b/sqs-product.ts). Scoping it to active-only meant a SOLD piece's own
 // page never got wired to its VYA item at all — the button silently posted the source store's id,
 // which VYA can't resolve, so clicking it did nothing. isSellable() still stops anyone actually
 // buying a sold piece; this only decides whether the page even knows which item it's showing.
 const items = await listStorefrontItems(seller.id);
 const nt = norm(title);
 const m = items.find((i) => norm(i.title) === nt) || items.find((i) => nt.includes(norm(i.title)) || norm(i.title).includes(nt));
 return m?.id ?? null;
}
