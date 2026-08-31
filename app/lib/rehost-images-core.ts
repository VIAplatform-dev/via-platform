import { createHash } from "node:crypto";

/**
 * Has a listing's photography actually been moved onto our storage?
 *
 * The point of copying product photos is that the store keeps its pictures when the seller leaves
 * their old platform. The job that does it marked every item it touched as done:
 *
 *   const rehosted = await rehostImage(u, sellerId);   // returns the ORIGINAL url on ANY failure
 *   out.push(rehosted);
 *   await sql`UPDATE items SET images = …, images_rehosted = TRUE …`;   // done regardless
 *
 * `rehostImage` hands back the input unchanged when there is no storage token, when the download
 * fails, when the file is empty, or when anything throws. So a failure was written down as a
 * success, and the item was never looked at again. 429 items across six stores are in that state —
 * blummier 155 of 164, loved-again 33 of 33, every photo in the shop.
 *
 * The marker now means what it says: done only when nothing is left behind.
 */

/** Where our copies live. */
const OUR_STORAGE = /\.public\.blob\.vercel-storage\.com/i;

/**
 * Platforms whose images disappear when a seller stops paying them. A photo on one of these is the
 * thing we are trying to rescue; a photo anywhere else is somebody's own hosting and not our problem
 * — treating it as unfinished work would keep the item in the queue for ever.
 *
 * `/cdn/shop/` is in the list as a PATH, not a host, and that is deliberate. Shopify serves a
 * store's assets from its custom domain too — `blummier.com/cdn/shop/files/a.jpg` is a Shopify URL
 * that stops serving the day she cancels, and matching only `cdn.shopify.com` missed every one of
 * them. That is the same silent failure that left 136 of blummier's items marked "photos copied"
 * while their photographs still pointed at Shopify. A seller's own hosting on a different path is
 * untouched.
 *
 * Exported as a string because the repair script asks the same question in SQL (`~*`), and a
 * hand-copied second list there had drifted to half the platforms. Plain alternation and escaped
 * dots only, so it stays valid in both JavaScript and Postgres.
 */
export const PLATFORM_HOSTED_PATTERN = "cdn\\.shopify\\.com|myshopify\\.com|shopifycdn|squarespace-cdn\\.com|wixstatic\\.com|etsystatic\\.com|bigcartel\\.com|cdn\\.bcbits\\.com|/cdn/shop/";
const PLATFORM_HOSTED = new RegExp(PLATFORM_HOSTED_PATTERN, "i");

export function isOnOurStorage(url: string): boolean {
 return OUR_STORAGE.test(url || "");
}

/** True when nothing in this listing would go dark if the seller cancelled. */
export function allPhotosMoved(urls: (string | null | undefined)[]): boolean {
 return !urls.some((u) => !!u && PLATFORM_HOSTED.test(u));
}


/**
 * Does an import that just wrote these image URLs leave work for the copier?
 *
 * A re-sync overwrites `images` with whatever the seller's feed says, which is their own URLs. So
 * the copier moves the photos onto our storage and the very next import puts them back on the
 * seller's — while `images_rehosted` stays TRUE, because nothing clears it. we-thieves lost all 163
 * of its items that way within an hour of being copied, and a fleet run would have undone the lot.
 *
 * So the importer clears the marker whenever it writes a platform-hosted URL, and the copier picks
 * the item up again. Re-copying is cheap: the storage path is derived from the source URL, so the
 * same photo lands in the same place.
 */
export function needsCopyAfterImport(urls: (string | null | undefined)[]): boolean {
 return !allPhotosMoved(urls);
}

/**
 * The filename our copy of a photo gets, derived from the photo's own URL.
 *
 * Kept in step with rehostImage(), which names the copy `imported/<slug>/<this>.<ext>`. Because it
 * is derived rather than random, we can look at an item's current photos and tell "these are the
 * ones we already copied" from "these are different photos" — without fetching anything.
 */
export function expectedCopyId(sourceUrl: string): string {
 // Same digest and length as rehost-images.ts. A change there must be mirrored here.
 return createHash("sha1").update(sourceUrl).digest("hex").slice(0, 16);
}

/**
 * Are the photos this item already holds simply our copies of the photos the feed is offering?
 *
 * The copier rewrites an item's photos to our storage; the next import writes the seller's URLs back
 * over them; the two never agree, so every re-sync rewrites every listing. blummier reported
 * "155 updated, 0 unchanged" on a run where nothing had changed at all — and each of those rewrites
 * undid the photo copying.
 *
 * Only a photo ON OUR STORAGE can be one we copied. The first version of this also accepted a plain
 * string match — and a stored URL equals the incoming one precisely WHEN NOTHING WAS COPIED, because
 * both are still the seller's Shopify URL. The importer read that as "already copied", wrote
 * `images_rehosted = TRUE` over an item whose photos were untouched, and the copier — which only
 * looks at items not yet marked copied — never went near it again. A stable dead end: blummier 136
 * of 164 items, 964 photos across three stores, with the fleet reporting "0 items · 0 photos" to do.
 *
 * All or nothing, deliberately. A half-copied item (one photo moved, one download failed) is NOT
 * "already copied": we hand the whole set back so the copier retries it. Re-copying the good one
 * costs a single fetch and lands at the same address, and a listing with one broken picture after
 * the seller cancels is worse than a listing we copied twice.
 *
 * Order matters: it is the order a shopper sees.
 */
export function sameImagesAlreadyCopied(current: (string | null | undefined)[], incoming: (string | null | undefined)[]): boolean {
 const a = current.filter(Boolean) as string[];
 const b = incoming.filter(Boolean) as string[];
 if (a.length !== b.length) return false;
 return b.every((src, i) => isOnOurStorage(a[i]) && (a[i] === src || a[i].includes(expectedCopyId(src))));
}
