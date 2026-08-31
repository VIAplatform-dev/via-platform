// Pure rules for turning a captured storefront's products into VYA inventory — no database, no
// network, so they can be unit-tested directly (same split as inventory-core.ts next door).
// capture-commerce.ts holds the DB-touching half and re-exports these.
import type { ImportedProduct } from "./store-import.ts";

// Money comes off the product as NUMBERS (priceCents + an ISO currency the platform told us).
// These string parsers are the legacy fallback for sources that only give a formatted price —
// never the primary path. Guessing currency from a "£"/"€" glyph is what labelled a UK store's
// GBP catalogue as USD, so the glyph check only runs when the platform gave us nothing.
export const parseCents = (price?: string) => Math.round((parseFloat((price || "").replace(/[^0-9.]/g, "")) || 0) * 100);
export const detectCur = (price?: string) => (/£/.test(price || "") ? "GBP" : /€/.test(price || "") ? "EUR" : "USD");
export const centsOf = (p: ImportedProduct) => (typeof p.priceCents === "number" && p.priceCents > 0 ? p.priceCents : parseCents(p.price));
export const currencyOf = (p: ImportedProduct) => (p.currency && /^[A-Z]{3}$/.test(p.currency) ? p.currency : detectCur(p.price));
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Identity of an imported product: the platform plus the platform's OWN id/handle. This is what
 *  makes a re-import a merge instead of a duplicate — titles can't do it, because vintage stores
 *  list distinct one-of-one pieces under the same name and rename items freely. */
export const identityKey = (platform: string | null | undefined, id: string) => `${platform || "?"}:${id}`;

export const slugifyHandle = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Fingerprint of the fields a re-sync cares about, so an unchanged listing can be skipped and a
 *  changed one detected without diffing every column. Currency is part of it on purpose: 627 GBP
 *  and 627 USD are different prices. */
export function productContentHash(p: ImportedProduct): string {
 // compareAtCents is part of it for the same reason currency is: a piece going on sale, or the
 // markdown changing, is a real change a shopper sees. Leaving it out meant we-thieves re-synced
 // 168 listings, updated none, and recorded no markdowns at all while her site was running a sale.
 const parts = [p.name, centsOf(p), currencyOf(p), p.available === false ? "sold" : "live", (p.images || [p.image]).filter(Boolean).join("|"), p.size || "", p.compareAtCents ?? ""];
 let h = 0;
 const s = parts.join("§");
 for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
 return (h >>> 0).toString(36);
}

/** The minimum an already-imported row has to tell us for matching. */
export type PriorItem = { sourceId?: string | null; sourcePlatform?: string | null };

/**
 * The already-imported row this product IS, or null when it is new.
 *
 * IDENTITY IS AUTHORITATIVE; TITLE IS ONLY A FALLBACK FOR DATA THAT HAS NO IDENTITY. The title
 * index must therefore hold only rows that carry no `sourceId` of their own (rows imported before
 * source ids existed) — see the caller. On a one-of-one vintage store the source really does list
 * two different bags under one name, and letting a title match reach an identified row makes the
 * second one overwrite the first: the store stays a listing short and which bag survives depends on
 * feed order.
 */
export function priorForProduct<T extends PriorItem>(
 p: { sourceId?: string | null; sourcePlatform?: string | null; name?: string },
 byIdentity: Map<string, T>,
 byTitle: Map<string, T>,
): T | null {
 if (p.sourceId) {
  const found = byIdentity.get(identityKey(p.sourcePlatform, p.sourceId));
  if (found) return found;
 }
 return byTitle.get(norm(p.name || "")) || null;
}

/**
 * Is this product a repeat of one the store already holds under the same name?
 *
 * Only ever true for a product with NO source identity. With an id, "same title" is not evidence of
 * "same product" — it is evidence of a vintage seller naming two pieces the same way.
 */
export function isTitleDuplicate(p: { sourceId?: string | null; name?: string }, titlesHeld: Set<string>): boolean {
 return !p.sourceId && titlesHeld.has((p.name || "").trim().toLowerCase());
}

/**
 * Which collections must NOT be rewritten from this read of the source.
 *
 * Membership is written with setItemCollections(), which REPLACES an item's collections — so a set
 * built from an incomplete read deletes whatever it didn't see. Two things make a read incomplete:
 *
 *  1. the listing genuinely failed (the fetch layer reports these as `unread`), and
 *  2. it came back EMPTY for a collection we already hold members for.
 *
 * (2) is the one that does the damage. A throttled — or missing — Shopify collection answers
 * `200 {"products":[]}`, byte for byte what a truly empty collection returns, so nothing at the
 * fetch layer can separate them. These collections exist only because we captured their page, and
 * that page had products on it; so when the source reports nobody and we already hold somebody,
 * the read is wrong, not the database.
 *
 * Erring this way costs a stale collection until the next import. Erring the other way cost this
 * store 417 curated memberships in a single re-run.
 */
export function unreadCollectionSlugs(opts: {
 /** collection slug → how many members THIS read of the source found. */
 readCount: Map<string, number>;
 /** collection slug → how many members we already hold. */
 storedCount: Map<string, number>;
 /** Collections the fetch layer already knows it failed to read. */
 unread?: string[];
}): string[] {
 const out = [...new Set(opts.unread || [])];
 for (const [slug, stored] of opts.storedCount) {
  if (stored > 0 && (opts.readCount.get(slug) ?? 0) === 0 && !out.includes(slug)) out.push(slug);
 }
 return out;
}


/**
 * In what order should one collection's pieces be shown?
 *
 * Two answers, and the difference is the whole point of this function:
 *
 *  LIVE — the order the seller's own /collections/{slug}/products.json listed them in on this run.
 *         That is her shop as it stands today, and it is already on the wire during the membership
 *         read, so it costs nothing to keep.
 *  CAPTURED — the order the collection page had on the day we crawled her site. A photograph. It
 *         was the ONLY answer we had, which is why bag-crush's rail still opened with three sold
 *         Guccis and a Dior long after she had put an LV Looping first.
 *
 * Live wins whenever there is one. Captured is the fallback for a store with no readable feed (not
 * Shopify) and for a collection whose read failed or came back partial — an incomplete read hands
 * over no live order at all, precisely so that a fragment can never be used here.
 *
 * The one exception: a live order that resolves to none of our items tells us nothing, so the
 * capture is tried rather than leaving the collection unordered.
 */
export function plannedCollectionOrder(opts: {
 /** The seller's live order, product handles. Absent/null when this pass could not read it. */
 live?: string[] | null;
 /** The order read off the captured collection page. */
 captured?: string[] | null;
 /** The collection's current members, so a handle can be resolved to the item we hold for it. */
 members: { id: string; sourceId?: string | null }[];
}): { ids: string[]; source: "live" | "captured" } | null {
 const bySource = new Map<string, string>();
 for (const m of opts.members) if (m.sourceId) bySource.set(m.sourceId, m.id);
 const resolve = (handles?: string[] | null) => {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const h of handles || []) {
   const id = bySource.get(h);
   // A handle we hold nothing for is skipped, not a gap: reorderCollectionItems only touches the
   // ids it is given, so an unknown piece keeps whatever position it already had.
   if (!id || seen.has(id)) continue;
   seen.add(id);
   ids.push(id);
  }
  return ids;
 };
 const live = resolve(opts.live);
 if (live.length) return { ids: live, source: "live" };
 const captured = resolve(opts.captured);
 if (captured.length) return { ids: captured, source: "captured" };
 return null;
}


/**
 * Would writing this patch actually change the listing?
 *
 * This replaces asking "has the source changed?", which needed a hand-maintained list of fields to
 * fingerprint — name, price, currency, sold state, photos, size. Anything not on the list was
 * invisible, so the first re-sync after we started caring about something new skipped every existing
 * listing as "unchanged" and the feature silently did nothing.
 *
 * That happened four times: pieces coming back from sold, sale prices (we-thieves re-synced 168
 * listings, updated none, and reported no markdowns while her site was running a sale), the photo
 * markers, and the original stuck-sold bug. Each time the fix looked shipped and did nothing, and
 * each time the answer was to add one more field to the list — which sets up the next failure.
 *
 * Comparing the write itself cannot miss a field, because the field is in the write. It also makes
 * two hand-written special cases unnecessary: a piece returning to sale and an availability
 * disagreement both simply appear as a changed `status`.
 *
 * Only the keys being written are compared — the row carries columns the importer never touches
 * (the seller's own edits, timestamps), and comparing those would make every listing look changed.
 */
/** JSON with object keys in a fixed order, so only VALUES decide. Array order is preserved: it is
 *  the order a shopper sees. */
function stable(v: unknown): string {
 const walk = (x: unknown): unknown => {
  if (Array.isArray(x)) return x.map(walk);
  if (x && typeof x === "object") {
   return Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, walk((x as Record<string, unknown>)[k])]));
  }
  return x;
 };
 return JSON.stringify(walk(v));
}

export function updateNeeded(prior: Record<string, unknown>, patch: Record<string, unknown>): boolean {
 for (const [k, next] of Object.entries(patch)) {
  const now = prior[k];
  // null from the database and undefined from a feed that omits the field are the same absence;
  // treating them as different would rewrite every listing on every run.
  if (now == null && next == null) continue;
  if (now == null || next == null) return true;
  if (typeof now === "object" || typeof next === "object") {
   // Key order is not a change. The stored variants and the feed's carry identical values with the
   // keys in a different order, so comparing their JSON text reported every listing as changed on
   // every run — blummier re-synced 155 items and marked none unchanged, which also meant every run
   // wrote the seller's photo URLs back over our copies.
   if (stable(now) !== stable(next)) return true;
   continue;
  }
  if (now !== next) return true;
 }
 return false;
}

/**
 * Is this piece worth importing at all?
 *
 * A price of zero used to disqualify anything. But a vintage seller zeroes the price when a piece
 * SELLS and keeps it published as her archive — bag-crush has 24 such pieces, with 19 to 28
 * photographs each: a Chanel Mademoiselle Flap, a Louis Vuitton Multi Pochette, a Chanel Classic
 * Flap. Every one was dropped, and nothing told her.
 *
 * The Squarespace reader already had the right rule in this codebase ("keep sold items even though
 * Squarespace zeroes their price; only skip a LIVE item that has no price"). This is that rule,
 * applied everywhere.
 *
 * A LIVE piece with no price is still skipped: nobody can buy it, and putting it on a card means
 * advertising a price we do not have.
 */
export function worthImporting(p: { title: string; cents: number | null | undefined; available?: boolean }): boolean {
 if (!p.title.trim()) return false;
 if (p.cents) return true;
 // No price. Keep it only if her own shop says it is sold — an archive piece, not a draft.
 // `undefined` means the feed did not say, and guessing "sold" would import every unpriced draft.
 return p.available === false;
}
