/**
 * Compare a collection's contents on the seller's own site with ours, honestly.
 *
 * Two asymmetries make a raw count-vs-count comparison lie, and both of them used to show up on
 * the seller's Hosted Store page as "N collections have a different number of products":
 *
 *  1. The seller's `/collections/<h>/products.json` lists the pieces still on their site. We keep
 *     pieces that have vanished from that feed (see items.status) so a shopper who follows an old
 *     link still lands somewhere. So we compare only the pieces their feed still lists — the same
 *     rule the catalog-level `extraHere` already uses.
 *  2. What we FILE and what we SERVE are not the same number, and only one of them reaches a
 *     shopper. A rail held 94 pieces in the database and served 401, because the storefront padded
 *     it out with every piece whose inferred category matched the handle. Every check compared the
 *     database with the seller's site, so the store graded clean. `served` closes that hole: the
 *     page states its own rail size (see stampCollectionSize) and any disagreement with what we
 *     filed is our bug, not the seller's.
 *  3. A read of their site that failed, was throttled, or hit our page cap tells us nothing about
 *     what is in the collection. Treating it as "0 products" invented differences (`usa 33/0`) and
 *     capped ones invented the opposite (`all-items 1586/1500`). Those collections are excluded
 *     from the comparison and reported separately.
 */

/** One collection as read from the seller's site. */
export type SourceCollectionRead = {
 handle: string;
 count: number;
 /** The read failed or was throttled — `count` is not evidence. */
 unread?: boolean;
 /** The read stopped at our page cap — `count` is a floor, not a total. */
 truncated?: boolean;
 /**
  * The product handles their feed actually returned. When present, the comparison is made on these
  * rather than on `count` — see the note on ourActive below.
  */
 handles?: string[];
};

export type CollectionComparison = {
 /** Collections actually compared (excludes unread/truncated ones). */
 collections: number;
 collectionsExact: number;
 /** On their site, never created here. */
 collectionsMissingHere: string[];
 /** `handle ours/source`, capped for display. */
 collectionsOff: string[];
 /** Could not be read from their site; not counted either way. */
 collectionsUnread: string[];
 /** `handle served/filed` — the page disagrees with our own filing. Always our bug. */
 collectionsInflated: string[];
};

const OFF_SHOWN = 8;

export function compareCollections(opts: {
 source: SourceCollectionRead[];
 /** collection handle → the `source_id` of every item we hold in it. */
 ours: Map<string, string[]>;
 /** Every product handle the seller's site still lists. */
 liveSourceIds: Set<string>;
 /**
  * The `source_id` of every piece we hold that is still for sale. Needed because sellers' collection
  * feeds disagree with each other about sold pieces: ascensio-demo's DROPS them (its 31-piece
  * "dresses" reads 21 on their side, which is exactly our active count), while sourcedbyscottie's
  * KEEPS them (its 51-piece "resort" reads 50). No arithmetic rule is right for both, so when their
  * feed gives us the actual handles we compare those, and a sold piece missing from their side is
  * expected rather than counted against us.
  */
 ourActive?: Set<string>;
 /**
  * Handles the seller shows but does not sell — no price and nothing available, an archive display
  * piece. The importer skips these on purpose and the catalogue comparison excludes them on purpose;
  * the collection comparison has to do the same or it reports them as pieces we are missing.
  */
 unsellable?: Set<string>;
 /** collection handle → the rail size the served page states, or null when it could not be read. */
 served?: Map<string, number | null>;
 /**
  * collection handle → which answer the page says it is giving. A page serving what the captured
  * page showed (because the collection could not be read from the seller's store) legitimately
  * differs from our filing and is not a fault; only a page claiming to serve our filing is held to
  * it. An unstamped page is still checked — absence must not be an escape hatch.
  */
 servedSource?: Map<string, string | null | undefined>;
}): CollectionComparison {
 const { source, ours, liveSourceIds, served, servedSource, ourActive, unsellable } = opts;
 const compared: { handle: string; ours: number; source: number }[] = [];
 const missingHere: string[] = [];
 const unread: string[] = [];

 for (const c of source) {
  const mine = ours.get(c.handle);
  // A `200 {"products":[]}` is the shape a throttled Shopify read takes, so an empty read is only
  // believable when we hold nothing either. Anything else is treated as unread.
  const emptyButWeHavePieces = c.count === 0 && !!mine?.length;
  if (c.unread || c.truncated || emptyButWeHavePieces) { unread.push(c.handle); continue; }
  if (!mine) {
   // `all` is Shopify's catch-all; we serve it from live inventory and never create a collection
   // for it, so listing it as missing would read as "every collection is missing".
   if (c.count > 0 && c.handle !== "all") missingHere.push(c.handle);
   continue;
  }
  // Like for like. Preferred form: compare the pieces themselves. A piece on their page we do not
  // have is a real gap; a piece we show that they do not is a real extra ONLY if it is still for
  // sale on their site — a sold piece their feed dropped is expected, and is what made a correct
  // store like ascensio-demo read as drifting in eleven collections.
  let comparable: number;
  if (c.handles) {
   // Their list, minus the pieces they are not selling — we were never going to import those.
   const sellableHandles = unsellable ? c.handles.filter((h) => !unsellable.has(h)) : c.handles;
   const theirs = new Set(sellableHandles);
   const held = new Set(mine);
   const missingFromUs = sellableHandles.filter((h) => !held.has(h)).length;
   const extraOnUs = mine.filter((id) => !theirs.has(id) && (ourActive ? ourActive.has(id) : liveSourceIds.has(id))).length;
   // Expressed as a count so the reported "ours/theirs" stays readable, but derived from the sets.
   comparable = sellableHandles.length - missingFromUs + extraOnUs;
  } else {
   // No handles (an older report, or a feed that only gave us a total): fall back to counting the
   // pieces their catalogue still lists.
   comparable = mine.filter((id) => liveSourceIds.has(id)).length;
  }
  // …unless the page is not serving our filing at all. When it falls back to the captured copy,
  // what we filed is not what a shopper sees, and quoting it misstates the seller's problem:
  // blummier's Gucci page was reported as "0 of 24" while a shopper was looking at 16 of them.
  const servedHere = served?.get(c.handle);
  const usesFiling = (servedSource?.get(c.handle) ?? "filed") === "filed";
  const oursCount = !usesFiling && servedHere != null ? servedHere : comparable;
  // Their side counts only what they are actually selling, for the same reason ours does.
  const theirCount = c.handles && unsellable ? c.handles.filter((h) => !unsellable.has(h)).length : c.count;
  compared.push({ handle: c.handle, ours: oursCount, source: theirCount });
 }

 // What we serve must equal what we filed — compared against RAW membership, because the page
 // serves sold and vanished pieces too. This is checked for every rail we filed anything in,
 // including ones we could not read from the seller's site: it needs no answer from them.
 const inflated: string[] = [];
 for (const [handle, ids] of ours) {
  const n = served?.get(handle);
  if (n == null) continue;
  if (servedSource?.get(handle) === "captured") continue; // never claimed to follow our filing
  if (n !== ids.length) inflated.push(`${handle} ${n}/${ids.length}`);
 }

 const off = compared.filter((c) => c.ours !== c.source);
 return {
  collections: compared.length,
  collectionsExact: compared.length - off.length,
  collectionsMissingHere: missingHere,
  collectionsOff: off.slice(0, OFF_SHOWN).map((c) => `${c.handle} ${c.ours}/${c.source}`),
  collectionsUnread: unread,
  collectionsInflated: inflated,
 };
}
