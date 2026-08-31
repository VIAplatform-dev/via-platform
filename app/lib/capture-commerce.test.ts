import { test } from "node:test";
import assert from "node:assert/strict";
import { updateNeeded, isTitleDuplicate, plannedCollectionOrder, priorForProduct, productContentHash, unreadCollectionSlugs } from "./capture-commerce-core.ts";
import type { ImportedProduct } from "./store-import.ts";

// ── M1: money and identity ─────────────────────────────────────────────────────────────────
// The import used to round-trip money through a FORMATTED string ("£120.00" → digits → cents)
// and guess the currency from the glyph, which labelled a UK store's GBP catalogue as USD.
// It also matched products by title, which on one-of-one vintage both merges distinct pieces
// and duplicates renamed ones. These tests pin the corrected behaviour.

const base = (over: Partial<ImportedProduct> = {}): ImportedProduct => ({
 name: "Gucci by Tom Ford Fall 1999 Black Velvet Jacket",
 price: "£627.00",
 priceCents: 62700,
 currency: "GBP",
 image: "https://cdn/img1.jpg",
 images: ["https://cdn/img1.jpg"],
 available: true,
 sourcePlatform: "shopify",
 sourceId: "gucci-tom-ford-velvet-jacket",
 ...over,
});

test("content hash is stable for an unchanged product", () => {
 assert.equal(productContentHash(base()), productContentHash(base()));
});

test("content hash changes when the price changes", () => {
 assert.notEqual(productContentHash(base()), productContentHash(base({ priceCents: 59900, price: "£599.00" })));
});

test("content hash changes when the item sells out", () => {
 assert.notEqual(productContentHash(base()), productContentHash(base({ available: false })));
});

test("content hash changes when images change", () => {
 assert.notEqual(
  productContentHash(base()),
  productContentHash(base({ images: ["https://cdn/img1.jpg", "https://cdn/img2.jpg"] })),
 );
});

test("content hash is currency-aware — same number, different currency is NOT the same listing", () => {
 // The bug this guards: 627 GBP and 627 USD are different prices, and a re-sync must notice.
 assert.notEqual(productContentHash(base()), productContentHash(base({ currency: "USD" })));
});

test("content hash survives a formatted-price-only product (legacy sources)", () => {
 // Sources that give us no numeric price fall back to parsing the display string; that path must
 // still produce a usable, stable hash rather than throwing.
 const legacy = base({ priceCents: undefined, currency: undefined, price: "$627.00" });
 assert.equal(typeof productContentHash(legacy), "string");
 assert.equal(productContentHash(legacy), productContentHash(legacy));
});

test("two distinct one-of-one pieces sharing a title hash differently when their images differ", () => {
 // Vintage stores really do list two different garments under the same name. Title alone can't
 // tell them apart — this is why matching keys on sourceId, and why the hash includes images.
 const a = base({ sourceId: "levis-501-a", images: ["https://cdn/a.jpg"] });
 const b = base({ sourceId: "levis-501-b", images: ["https://cdn/b.jpg"] });
 assert.notEqual(productContentHash(a), productContentHash(b));
});

// ── Matching an incoming product to what the store already holds ────────────────────────────────
// Real data, from Love Again Vintage's Shopify feed: two DIFFERENT bags listed under one name.
const A = { sourceId: "louis-vuitton-mini-papillon-pouch", sourcePlatform: "shopify", name: "Louis Vuitton Mini Papillon Pouch" };
const B = { sourceId: "dior-terry-cloth-handbag-copy", sourcePlatform: "shopify", name: "Louis Vuitton Mini Papillon Pouch" };
const row = (id: string, sourceId: string | null) => ({ id, sourceId, sourcePlatform: sourceId ? "shopify" : null });

test("a product matches the row with its own source id", () => {
 const byIdentity = new Map([["shopify:louis-vuitton-mini-papillon-pouch", row("item-a", "louis-vuitton-mini-papillon-pouch")]]);
 assert.equal(priorForProduct(A, byIdentity, new Map())?.id, "item-a");
});

test("the SECOND same-titled piece is not mistaken for the first — it is a different bag", () => {
 const byIdentity = new Map([["shopify:louis-vuitton-mini-papillon-pouch", row("item-a", "louis-vuitton-mini-papillon-pouch")]]);
 // byTitle deliberately holds only identity-less rows (see priorForProduct), so B finds nothing
 // and is imported as its own listing instead of overwriting A.
 assert.equal(priorForProduct(B, byIdentity, new Map()), null);
});

test("a row with no source id is still adopted by title — the legacy case the fallback is for", () => {
 const byTitle = new Map([["louis vuitton mini papillon pouch", row("legacy-1", null)]]);
 assert.equal(priorForProduct(A, new Map(), byTitle)?.id, "legacy-1");
});

test("isTitleDuplicate blocks a repeat only when the product has no identity of its own", () => {
 const held = new Set(["louis vuitton mini papillon pouch"]);
 assert.equal(isTitleDuplicate({ name: "Louis Vuitton Mini Papillon Pouch" }, held), true, "no id: same name means same product");
 assert.equal(isTitleDuplicate(B, held), false, "with an id, same name is just a vintage seller reusing a name");
 assert.equal(isTitleDuplicate({ name: "Gucci Boat Pochette" }, held), false);
});

// ── Collection membership is never rewritten from an incomplete read ────────────────────────────
// The regression this guards: a re-import of a 1,439-product store dropped 417 curated memberships
// (Shop All 1324 → 970, Best Dressed Guest 34 → 13) because the source answered some collection
// listings with `200 {"products":[]}` under load, and setItemCollections() replaces wholesale.

test("a collection that reads EMPTY while we hold members is treated as unread, not emptied", () => {
 const readCount = new Map([["shop", 0], ["dresses", 94]]);
 const storedCount = new Map([["shop", 1324], ["dresses", 94]]);
 assert.deepEqual(unreadCollectionSlugs({ readCount, storedCount }), ["shop"]);
});

test("a genuinely empty collection we hold nothing for is NOT flagged — no permanent false warning", () => {
 const readCount = new Map([["dresses", 94]]);
 const storedCount = new Map([["dresses", 94], ["brand-new-empty", 0]]);
 assert.deepEqual(unreadCollectionSlugs({ readCount, storedCount }), []);
});

test("collections the fetch layer already failed on are carried through", () => {
 const out = unreadCollectionSlugs({
  readCount: new Map([["shop", 1324]]),
  storedCount: new Map([["shop", 1324]]),
  unread: ["wedding-guest"],
 });
 assert.deepEqual(out, ["wedding-guest"]);
});

test("a fetch failure and an empty read are reported once, not twice", () => {
 const out = unreadCollectionSlugs({
  readCount: new Map(),
  storedCount: new Map([["shop", 1324]]),
  unread: ["shop"],
 });
 assert.deepEqual(out, ["shop"], "shop is unread for both reasons but listed once");
});

test("a complete read of every collection preserves nothing — the normal path still writes", () => {
 const readCount = new Map([["shop", 1324], ["dresses", 94]]);
 const storedCount = new Map([["shop", 1324], ["dresses", 94]]);
 assert.deepEqual(unreadCollectionSlugs({ readCount, storedCount }), []);
});


// The behaviour those tests pinned — a piece returning from sold, an availability disagreement, a
// missing fingerprint — is now covered by the updateNeeded tests below, without needing a rule of
// its own: all three show up as a changed field in the write.


test("a markdown starting or ending changes the fingerprint", () => {
 // The fingerprint decides whether a re-sync bothers to update a listing. It covered name, price,
 // currency, sold state, images and size — not the compare-at price. So when we started capturing
 // markdowns, every existing item was skipped as "unchanged" and no markdown was ever recorded:
 // we-thieves re-synced 168 items, updated 0, and reported 0 pieces on sale while her own site was
 // running a sale.
 const base = { name: "Kon Dangle Earrings", priceCents: 8260, currency: "USD", image: "a.jpg", images: ["a.jpg"], available: true } as never;
 const plain = productContentHash(base);
 const onSale = productContentHash({ ...(base as object), compareAtCents: 12000 } as never);
 assert.notEqual(plain, onSale, "a piece going on sale must look changed");

 const deeper = productContentHash({ ...(base as object), compareAtCents: 9900 } as never);
 assert.notEqual(onSale, deeper, "…and so must a change to the markdown itself");
});

// ── deciding whether a listing needs updating ────────────────────────────────────────────────────
// The content fingerprint is a hand-maintained list of fields: name, price, currency, sold state,
// photos, size. Anything not on the list is invisible to it, so when we start caring about something
// new, every existing listing is skipped as "unchanged" and the feature silently does nothing. That
// has now happened four times — resurrected pieces, sale prices, the photo markers, and the original
// stuck-sold bug — and each time the fix looked shipped.
//
// So the question changes from "has the source changed?" (which needs a list) to "would this write
// change anything?" (which cannot miss a field, because it compares the write itself).

test("a write that changes nothing is skipped", () => {
 const prior = { title: "Silk Slip", priceCents: 18000, status: "active", images: ["a.jpg"] };
 assert.equal(updateNeeded(prior, { title: "Silk Slip", priceCents: 18000, status: "active", images: ["a.jpg"] }), false);
});

test("a changed price is caught", () => {
 const prior = { title: "Silk Slip", priceCents: 18000 };
 assert.equal(updateNeeded(prior, { title: "Silk Slip", priceCents: 15000 }), true);
});

test("a field NOBODY remembered to add to a list is caught automatically", () => {
 // This is the whole point. compareAtCents was invisible to the fingerprint, so we-thieves re-synced
 // 168 listings, updated none, and recorded no markdowns while her site was running a sale.
 const prior = { title: "Kon Dangle Earrings", priceCents: 8260, compareAtCents: null };
 assert.equal(updateNeeded(prior, { title: "Kon Dangle Earrings", priceCents: 8260, compareAtCents: 12000 }), true);
});

test("a piece coming back from sold is caught, without a special rule for it", () => {
 // Yesterday this needed its own hand-written check. It now falls out for free.
 const prior = { status: "sold", priceCents: 5000 };
 assert.equal(updateNeeded(prior, { status: "active", priceCents: 5000 }), true);
});

test("photos and variants are compared by value, not by reference", () => {
 assert.equal(updateNeeded({ images: ["a.jpg", "b.jpg"] }, { images: ["a.jpg", "b.jpg"] }), false);
 assert.equal(updateNeeded({ images: ["a.jpg"] }, { images: ["a.jpg", "b.jpg"] }), true);
 assert.equal(updateNeeded({ variants: [{ size: "M", available: true }] }, { variants: [{ size: "M", available: false }] }), true);
});

test("only the fields being written are compared", () => {
 // The prior row carries columns the importer never touches — a seller's own edits, timestamps.
 // Comparing those would make every listing look changed for ever.
 const prior = { title: "Silk Slip", priceCents: 18000, updatedAt: new Date(), sellerNote: "hers" };
 assert.equal(updateNeeded(prior, { title: "Silk Slip", priceCents: 18000 }), false);
});

test("null and undefined mean the same absence", () => {
 // The database says null; a feed that omits a field gives undefined. Treating them as different
 // would rewrite every listing on every run.
 assert.equal(updateNeeded({ size: null }, { size: undefined }), false);
 assert.equal(updateNeeded({ compareAtCents: null }, { compareAtCents: null }), false);
 assert.equal(updateNeeded({ size: null }, { size: "M" }), true);
});

test("the same values in a different key order are not a change", () => {
 // What actually kept blummier at "155 updated, 0 unchanged": the stored variants and the feed's
 // carry identical values with the keys written in a different order, so comparing their JSON text
 // said they differed on every item, on every run.
 const prior = { variants: [{ size: "Default Title", color: null, available: true, priceCents: 24500, sourceVariantId: "53512155857162" }] };
 const patch = { variants: [{ sourceVariantId: "53512155857162", size: "Default Title", color: null, priceCents: 24500, available: true }] };
 assert.equal(updateNeeded(prior, patch), false);
});

test("a real change inside a variant is still caught", () => {
 const prior = { variants: [{ size: "M", available: true, priceCents: 100 }] };
 assert.equal(updateNeeded(prior, { variants: [{ priceCents: 100, size: "M", available: false }] }), true);
});

test("array order still matters — it is the order a shopper sees", () => {
 assert.equal(updateNeeded({ images: ["a.jpg", "b.jpg"] }, { images: ["b.jpg", "a.jpg"] }), true);
});

// ── which order a collection is shown in ─────────────────────────────────────────────────────────
// The order used to come off the captured copy of /collections/{slug} — crush-edit's rail still led
// with three sold Guccis and a Dior months after the seller had put an LV Looping first. The live
// feed already tells us her order; the capture is only the answer of last resort.

const members = [
 { id: "i-lv", sourceId: "lv-looping" },
 { id: "i-gucci", sourceId: "gucci-jackie" },
 { id: "i-dior", sourceId: "dior-saddle" },
 { id: "i-legacy", sourceId: null },
];

test("the live feed's order wins over the capture", () => {
 const plan = plannedCollectionOrder({
  live: ["lv-looping", "gucci-jackie", "dior-saddle"],
  captured: ["gucci-jackie", "dior-saddle", "lv-looping"],
  members,
 });
 assert.deepEqual(plan, { ids: ["i-lv", "i-gucci", "i-dior"], source: "live" });
});

test("with no live order the capture is still the best answer we have", () => {
 // A non-Shopify store, or a read that failed. The old behaviour, kept.
 const plan = plannedCollectionOrder({ live: null, captured: ["dior-saddle", "lv-looping"], members });
 assert.deepEqual(plan, { ids: ["i-dior", "i-lv"], source: "captured" });
});

test("a collection whose live read came back incomplete is never ordered from the fragment", () => {
 // An incomplete read hands over NO live order (see collection-membership.ts), so the plan falls
 // back rather than pushing every unread piece to the bottom of the seller's rail.
 const plan = plannedCollectionOrder({ live: undefined, captured: ["gucci-jackie"], members });
 assert.equal(plan?.source, "captured");
});

test("handles we hold no item for are skipped, not turned into gaps", () => {
 const plan = plannedCollectionOrder({ live: ["not-ours", "lv-looping", "also-not-ours"], members });
 assert.deepEqual(plan, { ids: ["i-lv"], source: "live" });
});

test("a piece named twice in the source order is positioned once", () => {
 const plan = plannedCollectionOrder({ live: ["lv-looping", "gucci-jackie", "lv-looping"], members });
 assert.deepEqual(plan?.ids, ["i-lv", "i-gucci"]);
});

test("nothing to order leaves the collection alone", () => {
 assert.equal(plannedCollectionOrder({ live: [], captured: [], members }), null);
 assert.equal(plannedCollectionOrder({ live: ["not-ours"], members }), null);
});

test("a live order that matches none of our items falls back to the capture", () => {
 // Only when the live list resolves to nothing at all — otherwise live always wins.
 const plan = plannedCollectionOrder({ live: ["not-ours"], captured: ["dior-saddle"], members });
 assert.deepEqual(plan, { ids: ["i-dior"], source: "captured" });
});
