import { test } from "node:test";
import assert from "node:assert/strict";
import { allPhotosMoved, isOnOurStorage, needsCopyAfterImport, PLATFORM_HOSTED_PATTERN } from "./rehost-images-core.ts";

const OURS = "https://q74gqbmcafgdbaxy.public.blob.vercel-storage.com/imported/blummier/abc.jpg";
const THEIRS = "https://cdn.shopify.com/s/files/1/0945/image_abc.jpg";

test("a photo on our storage counts as moved", () => {
 assert.equal(isOnOurStorage(OURS), true);
});

test("a photo still on the seller's platform has not moved", () => {
 assert.equal(isOnOurStorage(THEIRS), false);
});

test("an item is only done when EVERY photo actually moved", () => {
 // The bug: `rehostImage` returns the original URL on any failure — no storage token, a failed
 // download, an empty file, an exception — and the job then marked the item done regardless. So a
 // failure was recorded as a success and the item was never looked at again. 429 items across six
 // stores are in that state: blummier 155 of 164, loved-again 33 of 33.
 assert.equal(allPhotosMoved([OURS, OURS]), true);
 assert.equal(allPhotosMoved([OURS, THEIRS]), false, "one left behind means not done");
 assert.equal(allPhotosMoved([THEIRS]), false);
});

test("an item with no photos is done — there is nothing to move", () => {
 assert.equal(allPhotosMoved([]), true);
});

test("a photo that was never on a platform we copy from does not block the item", () => {
 // A seller-uploaded image already on a neutral host, or a data URI. Nothing to fetch, nothing to
 // fix, and it must not keep the item in the queue for ever.
 assert.equal(allPhotosMoved(["https://images.example.com/a.jpg"]), true);
 assert.equal(allPhotosMoved(["data:image/png;base64,AAAA"]), true);
});

test("a Shopify photo blocks the item even alongside neutral ones", () => {
 assert.equal(allPhotosMoved(["https://images.example.com/a.jpg", THEIRS]), false);
});

test("the repair script hunts for the same platforms the copier does", () => {
 // scripts/reset-false-photo-markers.mts asks the database "which items claim their photos are
 // copied while still holding a platform URL?" — and it used to carry its own hand-typed list of
 // four platforms against the code's eight. A store on Etsy or Big Cartel would have been invisible
 // to the one tool that exists to un-stick these items. Both now read this single pattern; it is
 // written for Postgres `~*` as well as JavaScript, so keep it to plain alternation and escaped dots.
 const re = new RegExp(PLATFORM_HOSTED_PATTERN, "i");
 for (const u of [
  "https://cdn.shopify.com/s/files/x.jpg",
  "https://i.etsystatic.com/1/x.jpg",
  "https://assets.bigcartel.com/x.jpg",
 ]) {
  assert.equal(re.test(u), true, u);
  assert.equal(allPhotosMoved([u]), false, `${u} must also block the item`);
 }
 assert.equal(re.test("https://q74gqbmcafgdbaxy.public.blob.vercel-storage.com/imported/x/a.jpg"), false);
});

test("every platform we copy away from is recognised, not just Shopify", () => {
 for (const u of [
  "https://cdn.shopify.com/s/files/x.jpg",
  "https://blummier.myshopify.com/cdn/shop/files/x.jpg",
  "https://images.squarespace-cdn.com/content/x.jpg",
  "https://static.wixstatic.com/media/x.jpg",
  "https://i.etsystatic.com/1/x.jpg",
 ]) assert.equal(allPhotosMoved([u]), false, u);
});

// ── the import must not undo the copying ─────────────────────────────────────────────────────────
// A re-sync writes the seller's own image URLs back onto the item. So the copier moves 3,472 photos
// onto our storage, and the next import puts them straight back on Shopify's — with the "copied"
// marker still set, because nothing clears it. we-thieves lost all 163 items that way, one hour
// after they were copied.

test("writing the seller's own image URLs marks the item as needing copying again", () => {
 assert.equal(needsCopyAfterImport(["https://cdn.shopify.com/s/files/x.jpg"]), true);
 assert.equal(needsCopyAfterImport(["https://images.squarespace-cdn.com/x.jpg"]), true);
});

test("an import that brings back our own URLs leaves the item alone", () => {
 assert.equal(needsCopyAfterImport(["https://q74gqbmcafgdbaxy.public.blob.vercel-storage.com/imported/x/a.jpg"]), false);
});

test("a mixed set still needs copying", () => {
 assert.equal(needsCopyAfterImport([
  "https://q74gqbmcafgdbaxy.public.blob.vercel-storage.com/imported/x/a.jpg",
  "https://cdn.shopify.com/s/files/x.jpg",
 ]), true);
});

test("an item with no photos needs nothing", () => {
 assert.equal(needsCopyAfterImport([]), false);
});

// ── the importer and the copier must stop fighting ───────────────────────────────────────────────
// The copier rewrites an item's photos to our storage. The next import writes the seller's URLs back
// over them, so the two never agree and every re-sync rewrites every listing: blummier reported
// "155 updated, 0 unchanged" on a run where nothing at all had changed. Our copy's filename is
// derived from the source URL, so we can tell "these are the same photos, already copied" from
// "these are different photos".
import { sameImagesAlreadyCopied } from "./rehost-images-core.ts";

const OURS_FOR = (src: string) => `https://q74gqbmcafgdbaxy.public.blob.vercel-storage.com/imported/blummier/${expectedCopyId(src)}.jpg`;
import { expectedCopyId } from "./rehost-images-core.ts";

test("photos we already copied are recognised as the same photos", () => {
 const src = ["https://cdn.shopify.com/s/files/1/a.jpg", "https://cdn.shopify.com/s/files/1/b.jpg"];
 assert.equal(sameImagesAlreadyCopied(src.map(OURS_FOR), src), true);
});

test("a genuinely new photo is not mistaken for one we hold", () => {
 const src = ["https://cdn.shopify.com/s/files/1/a.jpg"];
 assert.equal(sameImagesAlreadyCopied([OURS_FOR(src[0])], ["https://cdn.shopify.com/s/files/1/DIFFERENT.jpg"]), false);
});

test("a photo added to the set is caught", () => {
 const a = "https://cdn.shopify.com/s/files/1/a.jpg", b = "https://cdn.shopify.com/s/files/1/b.jpg";
 assert.equal(sameImagesAlreadyCopied([OURS_FOR(a)], [a, b]), false);
});

test("re-ordered photos are a change, because order is what a shopper sees", () => {
 const a = "https://cdn.shopify.com/s/files/1/a.jpg", b = "https://cdn.shopify.com/s/files/1/b.jpg";
 assert.equal(sameImagesAlreadyCopied([OURS_FOR(a), OURS_FOR(b)], [b, a]), false);
});

test("a photo that is still on Shopify is NOT 'already copied', however familiar it looks", () => {
 // The one that cost us 964 photos. An item holds the seller's Shopify URLs, the feed offers the
 // same Shopify URLs, and the old check said "same photos — already copied" because the two strings
 // matched. Nothing had been copied at all: they matched precisely BECAUSE the copy never happened.
 // The importer then stamped "photos copied" on the item, and the copier — which only ever looks at
 // items NOT marked copied — never saw it again. blummier sat at 136 of 164 items in that state
 // while the fleet dashboard reported the store's photography as safe. The day that seller cancels
 // Shopify, every one of those pictures goes blank on a store we told her she owned.
 const src = ["https://cdn.shopify.com/s/files/1/a.jpg"];
 assert.equal(sameImagesAlreadyCopied(src, src), false, "identical Shopify URLs mean nothing was copied");
 assert.equal(sameImagesAlreadyCopied(src, ["https://cdn.shopify.com/s/files/1/z.jpg"]), false);
});

test("a re-sync of an already-copied item does not re-download a thing", () => {
 // The other half of the promise: copying is slow and costs money, so a store that IS safe must be
 // recognised as safe. Our copy's filename is derived from the source URL, so we can say "this blob
 // is our copy of that Shopify photo" without fetching anything. If this breaks, every nightly sync
 // re-downloads thousands of photos and the seller's storefront churns for no reason.
 const src = ["https://cdn.shopify.com/s/files/1/a.jpg", "https://cdn.shopify.com/s/files/1/b.jpg"];
 assert.equal(sameImagesAlreadyCopied(src.map(OURS_FOR), src), true);
});

test("an item where only some photos were copied counts as not copied, so the rest get another go", () => {
 // A half-finished item: one photo made it onto our storage, one download failed and was left on
 // Shopify. Treating that as "copied" is how a listing ends up with two good pictures and one broken
 // one after the seller leaves. We hand the whole item back to the copier — re-copying the good one
 // is one cheap fetch that lands at the same address, and the seller ends up with a whole listing.
 const a = "https://cdn.shopify.com/s/files/1/a.jpg", b = "https://cdn.shopify.com/s/files/1/b.jpg";
 assert.equal(sameImagesAlreadyCopied([OURS_FOR(a), b], [a, b]), false);
 assert.equal(sameImagesAlreadyCopied([a, OURS_FOR(b)], [a, b]), false);
});

test("an item with no photos is left alone rather than rewritten every night", () => {
 // Nothing to rescue and nothing to write. It must not read as a change, or every empty listing
 // shows up as "updated" on every sync and hides the updates that matter.
 assert.equal(sameImagesAlreadyCopied([], []), true);
});

test("a photo count that changed is always a change", () => {
 // The seller added or removed a picture. Even if the ones we hold are our own copies, the shopper
 // would see the wrong set, so the item must be rewritten.
 const a = "https://cdn.shopify.com/s/files/1/a.jpg", b = "https://cdn.shopify.com/s/files/1/b.jpg";
 assert.equal(sameImagesAlreadyCopied([OURS_FOR(a), OURS_FOR(b)], [a]), false);
 assert.equal(sameImagesAlreadyCopied([], [a]), false);
 assert.equal(sameImagesAlreadyCopied([OURS_FOR(a)], []), false);
});

test("a photo we never copied is not called copied just because the feed still offers it", () => {
 // Same trap as the Shopify one, for a photo hosted somewhere we do not rescue from. It is not on
 // our storage, so it is not our copy, and we do not claim it is. Harmless in practice — the URLs
 // are identical, so rewriting them changes nothing a shopper sees — but the honest answer keeps the
 // "copied" marker meaning exactly one thing: the bytes are on our storage.
 const src = ["https://images.example.com/a.jpg"];
 assert.equal(sameImagesAlreadyCopied(src, src), false);
});

test("a Shopify photo on the seller's OWN domain counts as platform-hosted", () => {
 // THE SAME BUG WE SPENT A DAY REPAIRING, in a different shape. Shopify serves a store's assets
 // from its custom domain as well as from cdn.shopify.com — `blummier.com/cdn/shop/files/…` is a
 // Shopify URL that stops serving the day she cancels. Missing it means an item is marked "photos
 // copied" while its photographs still die, which is exactly the state 136 of blummier's items
 // were in this morning: silent, and invisible to every check.
 assert.equal(allPhotosMoved(["https://blummier.com/cdn/shop/files/a.jpg"]), false);
 assert.equal(allPhotosMoved(["https://shopvintagecharm.com/cdn/shop/products/b.jpg"]), false);
 assert.equal(allPhotosMoved(["//wethieves.com/cdn/shop/files/c.jpg"]), false);
});

test("a seller's own hosting that is NOT Shopify is still left alone", () => {
 // The point of the platform list is "would this go dark when she stops paying". A photo she hosts
 // herself is her business; treating it as unfinished work queues the item for ever.
 assert.equal(allPhotosMoved(["https://images.blummier.com/lookbook/a.jpg"]), true);
 assert.equal(allPhotosMoved(["https://res.cloudinary.com/x/a.jpg"]), true);
});
