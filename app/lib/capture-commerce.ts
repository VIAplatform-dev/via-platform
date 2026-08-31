// Bridges a captured store's products into VYA's checkout. When a seller brings
// their site over, their products are imported as real db/items (the inventory the
// Stripe checkout reads), and each captured product page is matched to its item so
// "Buy now" runs through VYA's existing Stripe flow.
import { getSellerBySlug } from "./db/sellers";
import { sweepRefusal } from "./feed-completeness.ts";
import { reasonFromImport, reasonForVanished } from "./unavailable-label.ts";
import { needsCopyAfterImport, sameImagesAlreadyCopied } from "./rehost-images-core.ts";
import { createItem, listAvailableItems, listStorefrontItems } from "./db/inventory";
import { getImportedOrderTitleSet } from "./imported-orders-db";
import { extractMeasurements } from "./measurements";
import { inferItemFields } from "./infer-item-fields";
import type { ImportedProduct } from "./store-import";
import { MAX_ITEM_IMAGES } from "./item-limits";

// Pure helpers (money, identity, hashing) live in capture-commerce-core.ts so they can be unit
// tested without the database layer — same split as inventory-core.ts.
export { productContentHash, centsOf, currencyOf, identityKey, slugifyHandle } from "./capture-commerce-core.ts";
import { unfileVanished, taggedSlugs, membershipToWrite, worthImporting, updateNeeded, centsOf, currencyOf, norm, identityKey, isTitleDuplicate, plannedCollectionOrder, priorForProduct, productContentHash, unreadCollectionSlugs } from "./capture-commerce-core.ts";

/** Create/refresh db/items (checkout-able inventory) for a captured store's products.
 *
 *  Matching is by SOURCE IDENTITY (platform + the source's own id/handle), not title. Title
 *  matching broke both ways on one-of-one vintage: two listings called "Vintage Levi's 501"
 *  collapsed into one, and retitling an item re-imported it as a duplicate. Identity also makes
 *  this re-runnable — a second import UPDATES the store's catalog instead of wiping and re-adding
 *  it, which is what lets inventory stay in sync without a destructive re-crawl.
 *
 *  Items a human has edited (`origin = 'user'`) are never overwritten. */
export async function importProductsAsItems(
 slug: string,
 products: ImportedProduct[],
 /**
  * Did the read that produced `products` reach the END of the seller's catalogue? Defaults to
  * false: a caller that cannot vouch for its read does not get to mark the seller's stock sold.
  */
 opts: {
  feedComplete?: boolean;
  /**
   * Source ids the feed listed but that never became products here (no photo, filtered out). They
   * are on the seller's site, so the sweep must not treat them as taken down.
   */
  feedSourceIds?: string[];
  /** A person has confirmed an unusually large retirement is real. See feed-completeness.ts. */
  approvedLargeSweep?: boolean;
 } = {},
): Promise<ImportStats> {
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
  // A row WITH an identity is matched by that identity and nothing else. Indexing it by title too
  // meant the source's SECOND piece of the same name — a different bag, with its own handle — found
  // this row by title and overwrote it, so the store still ended up one listing short and the
  // survivor was whichever of the two came last.
  if (it.sourceId) byIdentity.set(identityKey(it.sourcePlatform, it.sourceId), it);
  else byTitle.set(norm(it.title), it); // legacy fallback: rows imported before source ids existed
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
 // A price of zero used to disqualify a piece outright. A vintage seller zeroes the price when
 // something SELLS and keeps it published as her archive — bag-crush has 24 such pieces with 19 to
 // 28 photographs each, and every one was silently dropped. See worthImporting().
 if (!worthImporting({ title, cents, available: p.available })) { stats.skipped++; continue; }
 if (p.available === false && coveredByOrders.has(norm(title))) { stats.skipped++; continue; }

 const key = p.sourceId ? identityKey(p.sourcePlatform, p.sourceId) : null;
 const prior = priorForProduct({ ...p, name: title }, byIdentity, byTitle);
 if (key) seen.add(key);

 const hash = productContentHash(p);
 const status: "active" | "sold" = p.available === false ? "sold" : "active";
 // The platform's own statement, kept. Without it a sold-out piece and a vanished one were
 // indistinguishable later, and both were told to shoppers as "Sold out".
 const unavailableReason = reasonFromImport(p.available);
 const compareAtCents = p.compareAtCents ?? null;
 // Store the source URLs now (fast import); the rehost-images cron copies them onto
 // OUR storage in the background so the interactive import doesn't wait on hundreds of
 // image uploads. Durability without the slow import.
 // MAX_ITEM_IMAGES is main's — a deliberate raise from 8 so a seller's fuller galleries survive.
 const images = (p.images?.length ? p.images : p.image ? [p.image] : []).slice(0, MAX_ITEM_IMAGES);
 // A re-sync writes the seller's own image URLs back over our copies. Left alone, that undoes the
 // photo copying AND keeps the "copied" marker set — we-thieves lost all 163 of its items that way
 // an hour after they were copied. Hand the work back instead. See needsCopyAfterImport.
 const imagesRehosted = !needsCopyAfterImport(images);
 // Sort the unstructured signal (title + description) into brand/era/condition/category/material.
 const inf = inferItemFields(title, p.description);

 if (prior) {
  // The seller edited this item — their version wins, always.
  if (prior.origin === "user") { stats.skipped++; continue; }
  // Everything this re-sync would write. Built first so the decision to skip can be made by
  // comparing it with what we already hold — see updateNeeded. Asking "has the source changed?"
  // needed a hand-maintained list of fields to fingerprint, and four separate fixes were silently
  // skipped because their field was not on it. A piece coming back from sold and an availability
  // disagreement both simply show up here as a changed `status`, with no special rule needed.
  // Photos we have already copied are the SAME photos, so leave them alone rather than writing the
  // seller's URLs back over our copies. Without this the importer and the copier undo each other on
  // every run and nothing is ever "unchanged" — blummier reported 155 updated on a run where nothing
  // had changed. See sameImagesAlreadyCopied.
  const keepCopies = sameImagesAlreadyCopied((prior.images as string[]) || [], images);
  const patch = {
   title, priceCents: cents, currency: currencyOf(p), ...(keepCopies ? {} : { images }),
   // unavailableReason is rewritten every time, so a resurrected piece stops carrying "vanished".
   description: p.description ?? null, size: p.size ?? null, status, unavailableReason, compareAtCents,
   // Keeping our copies means the photos are already on our storage, whatever the feed says.
   imagesRehosted: keepCopies ? true : imagesRehosted,
   variants: p.variants ?? [], contentHash: hash,
   sourcePlatform: p.sourcePlatform ?? null, sourceId: p.sourceId ?? null, sourceUrl: p.sourceUrl ?? null,
  };
  if (!updateNeeded(prior as unknown as Record<string, unknown>, patch as unknown as Record<string, unknown>)) { stats.unchanged++; continue; }
  // A failed update must not be counted as an update — that's how a broken sync reported success.
  try {
   await updateItemFromSource(prior.id, patch);
   stats.updated++;
  } catch (e) {
   stats.skipped++;
   failures.push(`“${title}” (${msgOf(e)})`);
  }
  continue;
 }

 // Never on a piece that carries its own source identity. This guard exists for listings imported
 // before source ids did — with no id to match on, a same-titled product really was the same
 // product coming round again. A product WITH a source id has already been matched on it above
 // (`prior`), so reaching here means the source genuinely lists two different pieces under one
 // name, which is ordinary on one-of-one vintage: Love Again Vintage lists two "Louis Vuitton Mini
 // Papillon Pouch"es, two "Gucci Boat Pochette"s, two "Dior Trotter Pouch"es — different handles,
 // different photos, different bags. Skipping the second lost four of that store's pieces on
 // import, which is the exact collapse source identity was added to prevent.
 if (isTitleDuplicate({ ...p, name: title }, have)) { stats.skipped++; continue; }
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
 unavailableReason,
 compareAtCents,
 imagesRehosted,
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
 // A piece the feed listed but that we could not import (no photo) is on their site all the same.
 for (const id of opts.feedSourceIds || []) seen.add(identityKey("shopify", id));
 const goneKeys = [...byIdentity.keys()].filter((k) => !seen.has(k));
 // …but only if the read can be trusted to have SEEN the whole catalogue. An incomplete read means
 // "I don't know", and "I don't know" is never "they're all gone": with the reader's old 1,500
 // ceiling this rule would have marked ~89 of chill-boutique's live pieces sold, and on a timeout
 // (which hands back an empty feed) it would have marked every piece in a shop sold at once.
 const refusal = sweepRefusal({ complete: opts.feedComplete === true, productsRead: products.length, held: byIdentity.size, wouldRemove: goneKeys.length, approvedLargeSweep: opts.approvedLargeSweep });
 if (goneKeys.length && refusal) {
  stats.warnings.push(`${goneKeys.length} piece${goneKeys.length === 1 ? "" : "s"} missing from this read were left as they are, because ${refusal}.`);
 } else if (goneKeys.length) {
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
): Promise<{ collections: number; links: number; warnings: string[]; order?: Map<string, string[]> }> {
 const seller = await getSellerBySlug(slug);
 if (!seller) return { collections: 0, links: 0, warnings: [] };
 const { listCollections, setItemCollections, listItemCollectionIds } = await import("./db/collections.ts");
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
 // Collections we could NOT read from the source on this pass. Their membership below is partial,
 // so anything we already hold for them has to be left alone — see the preserve step in the loop.
 let unreadSlugs: string[] = [];
 // How much of each collection SHE lists as unavailable — the evidence for whether she keeps sold
 // pieces there. Empty for a scrape we could not do, which is correctly "we do not know".
 let stockBySlug = new Map<string, { unavailable: number; total: number }>();
 // Collections read to the end without error. Only their EMPTY answers are believed.
 let completedSlugs = new Set<string>();
 // collection slug → its products in the SELLER'S OWN ORDER, straight off the listings we just
 // paged through. Handed back so syncCollectionOrder can use today's order instead of the one the
 // collection page happened to have on crawl day. Only the scrape rung fills it: the CONNECTED
 // rung's collectionHandles arrive grouped by product, in whole-catalogue order, which is not the
 // order of any one collection — so those stores keep the captured fallback.
 let liveOrder: Map<string, string[]> | undefined;
 const fromApi = products.filter((p) => p.sourceId && p.collectionHandles?.length);
 if (fromApi.length) {
  for (const p of fromApi) membership.set(p.sourceId as string, p.collectionHandles as string[]);
 } else {
  try {
   const read = await getShopifyCollectionMembership(domain, [...colBySlug.keys()]);
   membership = read.membership;
   liveOrder = read.order;
   stockBySlug = read.stock;
   completedSlugs = read.completed;
   unreadSlugs = read.incomplete;
  } catch {
   // The listing pass failed outright, so we know NOTHING about membership. Falling through to
   // tags alone (the old behaviour) would then rewrite every item's collections from tags — which
   // is how a throttled re-import silently emptied the store's curated collections.
   unreadSlugs = [...colBySlug.keys()];
  }
 }
 // What we already hold, so "the source dropped this item" can be told apart from "we couldn't read
 // it". One query, and it is also what makes the empty-collection guard below possible.
 const policyWarnings: string[] = [];
 const currentByItem = await listItemCollectionIds(seller.id);
 // Which of the pieces we hold are sold — needed to tell "she cleared this collection out" from
 // "nothing in it has sold yet", which look identical from her feed alone.
 // If this read fails we must NOT carry on with an empty set: zero sold pieces would make every
 // collection look like one she had cleared out, and we would hide her archive on the strength of a
 // failed query. `null` means "do not judge the sold policy this run".
 let soldItemIds: Set<string> | null = null;
 try {
  const held = (await (await import("./db/inventory.ts")).listStorefrontItems(seller.id)) as { id: string; status?: string }[];
  soldItemIds = new Set(held.filter((i) => i.status === "sold").map((i) => i.id));
 } catch (e) {
  policyWarnings.push(`couldn't tell which pieces are sold, so no collection's sold policy was updated (${String((e as Error).message).slice(0, 50)})`);
 }
 if (!fromApi.length) {
  // See unreadCollectionSlugs(): a scraped collection that reads as empty while we already hold
  // members for it is a failed read, not an emptied collection. A CONNECTED store is exempt —
  // its API answer is exact, so an empty collection there really is empty.
  const readCount = new Map<string, number>();
  for (const [, colSlugs] of membership) for (const s of colSlugs) readCount.set(s, (readCount.get(s) ?? 0) + 1);
  const slugByColId = new Map([...colBySlug].map(([s, id]) => [id, s]));
  const storedCount = new Map<string, number>();
  for (const [, colIds] of currentByItem) {
   for (const id of colIds) {
    const s = slugByColId.get(id);
    if (s) storedCount.set(s, (storedCount.get(s) ?? 0) + 1);
   }
  }
  unreadSlugs = unreadCollectionSlugs({ readCount, storedCount, unread: unreadSlugs, completed: completedSlugs });
 }
 const unreadIds = new Set(unreadSlugs.map((s) => colBySlug.get(s)).filter(Boolean) as string[]);
 // A collection we have judged unread must not hand over an order either. Belt and braces — an
 // unread collection records no order in the first place — but the two judgements are made in
 // different places and only one of them knows about the empty-read heuristic above.
 if (liveOrder) for (const s of unreadSlugs) liveOrder.delete(s);
 // Remember which ones we DID read. The serve path needs to tell "never read" from "read, and
 // empty" — without it a collection the seller has emptied keeps showing the pieces that were in
 // it on capture day. See app/lib/plan-b/collection-contents.ts.
 // WHAT SHE DOES WITH SOLD PIECES, recorded per collection from the pages we just read. Six of
 // eight sellers list sold pieces in their collections; two clear them out, and on those two we
 // were putting the archive back — the whole of the "31 here, 21 on hers" difference the parity
 // check reported against us. Her decision is observable, so we stop making it for her.
 // See app/lib/collection-sold-policy.ts for why "unknown" is a third answer and not a default.
 if (soldItemIds) {
  const { soldPolicy } = await import("./collection-sold-policy.ts");
  const { setCollectionKeepsSold } = await import("./db/collections.ts");
  const heldSold = new Map<string, number>();
  for (const [itemId, colIds] of currentByItem) {
   for (const id of colIds) heldSold.set(id, (heldSold.get(id) ?? 0) + (soldItemIds.has(itemId) ? 1 : 0));
  }
  for (const c of cols) {
   if (unreadIds.has(c.id)) continue; // a read we could not finish tells us nothing
   const st = stockBySlug.get(c.slug);
   if (!st) continue;
   const verdict = soldPolicy({ feedUnavailable: st.unavailable, feedTotal: st.total, weHoldSold: heldSold.get(c.id) ?? 0 });
   if (verdict === "unknown") continue;
   try {
    await setCollectionKeepsSold(c.id, verdict === "keeps");
   } catch (e) {
    // Said out loud: a failure here leaves the collection on the previous answer, which is the safe
    // direction but must not look like a decision we made this run.
    policyWarnings.push(`couldn't record what ${c.slug} does with sold pieces (${String((e as Error).message).slice(0, 50)})`);
   }
  }
 }

 const readIds = cols.map((c) => c.id).filter((id) => !unreadIds.has(id));
 const stampWarnings: string[] = [];
 try {
  const { markCollectionsRead } = await import("./db/collections.ts");
  await markCollectionsRead(readIds);
 } catch (e) {
  // Said out loud, not swallowed. If this stamp fails the serve path keeps falling back to the
  // captured grid for these collections — the exact bug this is here to end — and a silent failure
  // would look identical to it working.
  stampWarnings.push(`couldn't record which collections were read (${String((e as Error).message).slice(0, 60)})`);
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
  // Tags only get a vote on collections we could NOT read this pass — see taggedSlugs.
  const tagSlugs = taggedSlugs({ tags: p.tags || [], known: new Set(colBySlug.keys()), unread: new Set(unreadSlugs) });
  const slugs = [...new Set([...handleSlugs, ...tagSlugs])].filter((s) => colBySlug.has(s));

  const ids = slugs.map((s) => colBySlug.get(s)!).filter(Boolean);
  const held = currentByItem.get(item.id) || [];
  // NO `continue` when the feed places this piece nowhere. That empty answer IS an answer — she has
  // taken it out of everything we read — and skipping it left the old links standing for ever:
  // shop-vintage-charm's "USA" kept all 34 pieces even after the read was believed. What it keeps
  // is its place in collections we could NOT read. See membershipToWrite.
  if (!slugs.length && !held.length) continue; // nothing filed, nothing to say
  const finalIds = membershipToWrite({ fromFeed: ids, held, unread: [...unreadIds] });
  try {
   await setItemCollections(item.id, finalIds);
   slugs.forEach((s) => used.add(s));
   links += finalIds.length;
  } catch (e) {
   // Counted as a failure rather than a link — otherwise the tally claims work that didn't happen.
   failed.push(`“${item.title}” (${msgOf(e)})`);
  }
 }
 // Pieces her store no longer lists at all. The loop above can't reach them — it walks the feed —
 // so they are handled here, from the decision the item sweep already recorded on the row.
 const vanished = new Set(items.filter((i) => i.origin !== "user" && i.unavailableReason === reasonForVanished()).map((i) => i.id));
 for (const [id, keep] of unfileVanished({ held: currentByItem, vanished, unread: [...unreadIds] })) {
  try {
   await setItemCollections(id, keep);
   links += keep.length;
  } catch (e) {
   failed.push(`a piece your store no longer lists (${msgOf(e)})`);
  }
 }

 const warnings = failed.length
  ? [`${failed.length} product${failed.length === 1 ? "" : "s"} couldn’t be filed into their collections: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? ` and ${failed.length - 3} more` : ""}.`]
  : [];
 // An unread collection is REPORTED, never silent. Its contents were kept as they were, which is
 // the safe outcome — but "we kept what we had" and "we confirmed this against your store" are
 // different facts, and the seller is entitled to know which one they got.
 if (unreadSlugs.length) {
  warnings.push(
   `We couldn’t read ${unreadSlugs.length} of your collections from your store this time (${unreadSlugs.slice(0, 3).join(", ")}${unreadSlugs.length > 3 ? ` and ${unreadSlugs.length - 3} more` : ""}) — their contents were left as they were rather than overwritten. Re-run the import to refresh them.`,
  );
 }
 return { collections: used.size, links, warnings: [...warnings, ...stampWarnings], order: liveOrder };
}



/**
 * Adopt the SOURCE store's ordering for each collection.
 *
 * Membership alone isn't fidelity: a curated collection has an order the seller chose, and without
 * it their archive page came back sorted by import date — the same 37 pieces, but nobody's first
 * four matched.
 *
 * That order used to be read off the CAPTURED collection page — a photograph of crawl day, frozen
 * for good. Which pieces a rail shows, and in what sequence, is the most volatile thing about a
 * shop: bag-crush's "crush-edit" still opened with three sold Guccis and a Dior months after she
 * had put an LV Looping first, and every piece the parity check flagged as missing from that rail
 * was sitting in our catalogue the whole time — we were simply asking for the wrong ones.
 *
 * So the live order wins when we have it. `liveOrder` (collection slug → product handles) comes
 * from syncCollectionMembership, which already pages through /collections/{slug}/products.json IN
 * FEED ORDER and used to throw the order away: zero extra outbound requests. A collection missing
 * from it — a store with no readable feed, a read that failed or came back partial — falls back to
 * the captured page, which is still the best answer when nothing better exists.
 *
 * Best-effort per collection: a collection we can order from neither is left untouched.
 */
export async function syncCollectionOrder(
 slug: string,
 liveOrder?: Map<string, string[]> | null,
): Promise<{ collections: number; ordered: number; live: number }> {
 const seller = await getSellerBySlug(slug);
 if (!seller) return { collections: 0, ordered: 0, live: 0 };
 const { listCollections, reorderCollectionItems, listCollectionItems } = await import("./db/collections.ts");
 const { listCapturePaths, getCapturePage } = await import("./site-capture-db.ts");
 const cheerio = await import("cheerio");

 const cols = await listCollections(seller.id, true);
 const paths = await listCapturePaths(slug);
 let collections = 0, ordered = 0, live = 0;

 const capturePathFor = (colSlug: string) =>
  paths.find((p) => p === `/collections/${colSlug}` || p === `/collections/${colSlug}/`) || null;

 /** The order the source listed its products in on CAPTURE DAY, read off the page's own links. */
 const capturedHandles = async (colSlug: string): Promise<string[]> => {
  const path = capturePathFor(colSlug);
  if (!path) return [];
  const html = await getCapturePage(slug, path);
  if (!html) return [];
  const $ = cheerio.load(html);
  const handles: string[] = [];
  $("a[href*='/products/']").each((_, el) => {
   const m = ($(el).attr("href") || "").match(/\/products\/([^/?#]+)/);
   if (m && !handles.includes(m[1])) handles.push(m[1]);
  });
  return handles;
 };

 for (const col of cols) {
  const fromFeed = liveOrder?.get(col.slug);
  // Neither the live feed nor a captured page has anything to say about this one, so don't pay for
  // its member list. (A store can carry hundreds of collections.)
  if (!fromFeed?.length && !capturePathFor(col.slug)) continue;
  const members = await listCollectionItems(col.id, { manage: true });
  // Live first, and the capture is only loaded when the live feed had nothing to say about this
  // collection — no point parsing a page whose order we are about to overrule.
  let plan = plannedCollectionOrder({ live: fromFeed, members });
  if (!plan) plan = plannedCollectionOrder({ captured: await capturedHandles(col.slug), members });
  if (!plan) continue;
  await reorderCollectionItems(col.id, plan.ids);
  collections++;
  ordered += plan.ids.length;
  if (plan.source === "live") live++;
 }
 return { collections, ordered, live };
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
 const images = raw.slice(0, MAX_ITEM_IMAGES); // rehost-images cron copies these to our storage in the background
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
