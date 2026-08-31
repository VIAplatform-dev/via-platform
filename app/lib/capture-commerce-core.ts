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
 * (2) USED TO mean "any empty answer for a collection we hold members for", on the grounds that
 * nothing at the fetch layer could separate a throttled read from a genuinely empty collection.
 * That was true when it was written and is not true now: a throttled store answers 429 and the
 * fetch layer reports it (see CollectionPageResult's `Throttled`, and its `null` for "failed for
 * some other reason — never empty"). That layer was hardened later and this guard never caught up.
 *
 * The cost of not catching up: shop-vintage-charm's "USA" served 34 pieces where her own shop shows
 * none, frames 21, plates-bowls 26, and the same on ascensio's boots and flats — 86 products in
 * categories the sellers had cleared out, frozen at capture day through every repair, while she was
 * told "we couldn't read these, re-run the import" for a problem that did not exist. Re-running
 * produced the identical result, for ever.
 *
 * A collection that does not exist also answers `200 {"products":[]}` — that much is still true and
 * still indistinguishable. It does not matter: missing and emptied both mean she is showing nothing
 * there, so neither should we.
 *
 * What remains protected, and why:
 *  • a read the fetch layer failed on is still unread, always;
 *  • an empty answer with no CLEAN read behind it is still unread — that is the original fear, and
 *    erring the other way once cost a store 417 curated memberships in a single re-run;
 *  • and a whole store emptying at once is refused however clean each answer looked. One seller
 *    clearing one category is ordinary; every category emptying in one pass is a store-wide failure
 *    wearing an ordinary answer. Same shape as the product sweep guard in feed-completeness.ts.
 */
/** Above this share of a store's collections emptying in one pass, we assume the store, not the seller. */
const IMPLAUSIBLE_EMPTYING = 0.5;
export function unreadCollectionSlugs(opts: {
 /** collection slug → how many members THIS read of the source found. */
 readCount: Map<string, number>;
 /** collection slug → how many members we already hold. */
 storedCount: Map<string, number>;
 /** Collections the fetch layer already knows it failed to read. */
 unread?: string[];
 /** Collections whose listing was read to the end without error. An empty answer is only an ANSWER
  *  when it came from one of these; otherwise it is silence, and silence is not evidence. */
 completed?: Set<string>;
}): string[] {
 const out = [...new Set(opts.unread || [])];
 const completed = opts.completed ?? new Set<string>();
 const emptied: string[] = [];
 for (const [slug, stored] of opts.storedCount) {
  if (stored <= 0 || (opts.readCount.get(slug) ?? 0) !== 0 || out.includes(slug)) continue;
  if (completed.has(slug)) emptied.push(slug);
  else out.push(slug); // empty, with no clean read behind it — protect what we hold
 }
 // A whole store emptying in one pass is the store failing, not the seller tidying up.
 const held = [...opts.storedCount.values()].filter((n) => n > 0).length;
 if (held > 0 && emptied.length / held > IMPLAUSIBLE_EMPTYING) out.push(...emptied.filter((s) => !out.includes(s)));
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

/**
 * The collections an item should end up in, after a membership read.
 *
 * `setItemCollections` REPLACES an item's collections, so this decides both what it joins and what
 * it leaves. Two failures live here, and they pull in opposite directions:
 *
 *  • Writing only what the feed said, while a listing was throttled, DELETES the memberships that
 *    listing would have confirmed. One throttled read turned "34 pieces in Best Dressed Guest"
 *    into 13. So anything we hold in a collection we could not read is carried over untouched.
 *
 *  • Skipping an item the feed places NOWHERE leaves its old links standing for ever. That is how
 *    shop-vintage-charm's "USA" kept 34 pieces after she emptied it, and kept them even once the
 *    read was believed — the guard stopped calling it a failure, and nothing then removed anything.
 *    An empty answer about an item IS an answer: it belongs in no collection we read.
 */
/**
 * Which of a piece's TAGS may file it into one of her collections?
 *
 * Only ones we could not read. A tag is a guess about where a piece belongs; a collection listing
 * we paged through to the end is the seller's own answer. When we have the answer, the guess does
 * not get a vote — otherwise a piece she has taken OUT of a collection walks straight back in on
 * the strength of a tag she never removed. ascensio's Boots collection is empty on her site; all
 * three sold pairs are still tagged "Boots", and that is why our copy kept showing them.
 *
 * When the listing failed (Squarespace, a throttled read), the tag is the only signal there is,
 * so it stands — that is the whole reason the tag path exists.
 */
export function taggedSlugs(o: { tags: string[]; known: Set<string>; unread: Set<string> }): string[] {
 const out = new Set<string>();
 for (const t of o.tags) {
  const s = slugifyHandle(t);
  if (o.known.has(s) && o.unread.has(s)) out.add(s);
 }
 return [...out];
}


/**
 * What should we file a piece under when her store no longer lists it AT ALL?
 *
 * The membership loop walks the feed, so a piece she has deleted is never visited and its links
 * stand for ever — blummier's Chantal Thomass corset sold, she took the listing down, and our copy
 * of her Chantal Thomass collection went on showing it. It is not in her collection listings for
 * the same reason it is not in her feed, so it comes out of every collection we READ, and keeps its
 * place only in the ones we could not.
 *
 * `vanished` is not decided here. The item sweep already made that call under sweepRefusal — "the
 * read did not reach the end of the catalogue" is never "they're all gone" — and wrote it on the
 * row. This reads that decision rather than making a second, less careful one.
 *
 * Returns only the items whose filing actually changes: no write, no risk.
 */
export function unfileVanished(o: {
 held: Map<string, string[]>;
 vanished: Set<string>;
 unread: string[];
}): Map<string, string[]> {
 const out = new Map<string, string[]>();
 const unread = new Set(o.unread);
 for (const id of o.vanished) {
  const held = o.held.get(id);
  if (!held?.length) continue;
  const keep = held.filter((c) => unread.has(c));
  if (keep.length === held.length) continue; // all of them unread — nothing we know changes
  out.set(id, keep);
 }
 return out;
}


export function membershipToWrite(o: { fromFeed: string[]; held: string[]; unread: string[] }): string[] {
 const unread = new Set(o.unread);
 const preserved = o.held.filter((id) => unread.has(id));
 return [...new Set([...o.fromFeed, ...preserved])];
}
