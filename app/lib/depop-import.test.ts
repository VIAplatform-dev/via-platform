import { test } from "node:test";
import assert from "node:assert/strict";
import { toItem, prepare, importSummary } from "./depop-import.ts";

const raw = (over = {}) => ({
 slug: "black-velvet-jacket", title: "Black velvet jacket", description: "Gorgeous 90s piece",
 images: ["https://cdn.depop.com/a.jpg", "https://cdn.depop.com/b.jpg"],
 priceCents: 14500, currency: "usd", brand: "Gucci", category: "Jackets", size: "M", status: "active", ...over,
});

test("a Depop listing becomes a VYA draft, with everything she already typed", () => {
 const it = toItem(raw(), 12);
 assert.equal(it?.title, "Black velvet jacket");
 assert.equal(it?.priceCents, 14500);
 assert.equal(it?.currency, "USD");
 assert.equal(it?.brand, "Gucci");
 assert.equal(it?.size, "M");
 assert.deepEqual(it?.images, ["https://cdn.depop.com/a.jpg", "https://cdn.depop.com/b.jpg"]);
 // A DRAFT. An import is a copy of another marketplace's listing; 400 pieces landing live on her
 // storefront is not a migration, it is an accident.
 assert.equal(it?.status, "draft");
});

test("sold pieces come over as sold — her history, not her stock", () => {
 assert.equal(toItem(raw({ status: "sold" }), 12)?.status, "sold");
 // Anything else is a draft; Depop has no third state we act on.
 assert.equal(toItem(raw({ status: "reserved" }), 12)?.status, "draft");
 assert.equal(toItem(raw({ status: undefined }), 12)?.status, "draft");
});

test("a piece with no title or no handle is not an item", () => {
 // Unfindable in her own inventory.
 assert.equal(toItem(raw({ title: "" }), 12), null);
 assert.equal(toItem(raw({ title: null }), 12), null);
 // Without the Depop handle a re-import cannot tell it apart, so it would arrive again every run.
 assert.equal(toItem(raw({ slug: "" }), 12), null);
 assert.equal(toItem(null as never, 12), null);
 assert.equal(toItem("nonsense" as never, 12), null);
});

test("only real image URLs are kept, and no more than the limit", () => {
 const it = toItem(raw({ images: ["https://ok.jpg", "not-a-url", null, 7, "http://also-ok.jpg"] }), 12);
 assert.deepEqual(it?.images, ["https://ok.jpg", "http://also-ok.jpg"]);
 assert.equal(toItem(raw({ images: Array(30).fill("https://x.jpg") }), 12)?.images.length, 12);
 assert.deepEqual(toItem(raw({ images: null }), 12)?.images, []);
});

test("a price that didn't survive the read becomes a draft with no price, not a refusal", () => {
 // "Needs a price" is something her inventory already knows how to show her; dropping the piece
 // silently is not.
 assert.equal(toItem(raw({ priceCents: undefined }), 12)?.priceCents, 0);
 assert.equal(toItem(raw({ priceCents: "12.50" }), 12)?.priceCents, 0);
 assert.equal(toItem(raw({ priceCents: -5 }), 12)?.priceCents, 0);
 assert.equal(toItem(raw({ priceCents: 1999.6 }), 12)?.priceCents, 2000);
});

test("re-importing brings the new pieces, not four hundred duplicates", () => {
 const board = [raw({ slug: "a" }), raw({ slug: "b" }), raw({ slug: "c" })];
 // Nothing imported yet.
 assert.deepEqual(prepare(board, new Set(), 12).map((x) => x.sourceId), ["a", "b", "c"]);
 // "a" and "b" are already in VYA from a previous run.
 assert.deepEqual(prepare(board, new Set(["a", "b"]), 12).map((x) => x.sourceId), ["c"]);
 // And a collection that repeats a handle only yields it once.
 assert.deepEqual(prepare([raw({ slug: "a" }), raw({ slug: "a" })], new Set(), 12).map((x) => x.sourceId), ["a"]);
});

test("junk in the payload cannot break an import", () => {
 assert.deepEqual(prepare(null, new Set(), 12), []);
 assert.deepEqual(prepare("nope" as never, new Set(), 12), []);
 assert.deepEqual(prepare([null, undefined, 5, raw({ slug: "ok" })], new Set(), 12).map((x) => x.sourceId), ["ok"]);
});

test("what the seller is told", () => {
 assert.match(importSummary(42, 9), /42 pieces.*9 of them already sold/);
 assert.match(importSummary(1, 0), /^1 piece brought over/);
 assert.match(importSummary(0, 0), /Nothing new to bring over/);
});
