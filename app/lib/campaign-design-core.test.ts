import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCampaignDesign } from "./campaign-design-core.ts";

// The composer's layout, sanitised. Both the preview and the send read a design through this, and a
// scheduled campaign reads one back out of the database months later — so it has to survive junk
// without either path having to guess.

test("a full design survives the round trip", () => {
 const d = parseCampaignDesign({
  design: "grid", headline: "We just added 2 new pieces.", subhead: "Have a look before they go.",
  ctaLabel: "Shop new arrivals", link: "https://shop.example", pieceCount: 4, itemIds: [],
  eyebrow: "NYFW Special", preheader: "Don't miss out", productsHeading: "Just in", code: "SPRING10",
  links: [{ label: "New arrivals", url: "https://x" }], ground: "brand", showPrices: false,
 });
 assert.equal(d.design, "grid");
 assert.equal(d.eyebrow, "NYFW Special");
 assert.equal(d.code, "SPRING10");
 assert.equal(d.ground, "brand");
 assert.equal(d.showPrices, false);
 assert.deepEqual(d.links, [{ label: "New arrivals", url: "https://x" }]);
});

test("an unknown layout falls back rather than rendering nothing", () => {
 assert.equal(parseCampaignDesign({ design: "haunted" }).design, "classic");
 assert.equal(parseCampaignDesign({}).design, "classic");
});

test("the seller's casing on the eyebrow is left alone", () => {
 // She wrote "NYFW Special" and the email used to shout it. Nothing here may re-case it.
 assert.equal(parseCampaignDesign({ eyebrow: "NYFW Special" }).eyebrow, "NYFW Special");
 assert.equal(parseCampaignDesign({ eyebrow: "new in" }).eyebrow, "new in");
});

test("empty text is null, not an empty string that renders as a blank line", () => {
 const d = parseCampaignDesign({ eyebrow: "   ", subhead: "", code: "", productsHeading: "  " });
 assert.equal(d.eyebrow, null);
 assert.equal(d.subhead, null);
 assert.equal(d.code, null);
 assert.equal(d.productsHeading, null);
});

test("piece count is clamped, and junk ids are dropped", () => {
 assert.equal(parseCampaignDesign({ pieceCount: 99 }).pieceCount, 8);
 assert.equal(parseCampaignDesign({ pieceCount: -3 }).pieceCount, 0);
 assert.equal(parseCampaignDesign({ pieceCount: "four" }).pieceCount, 0);
 assert.deepEqual(parseCampaignDesign({ itemIds: ["a", 7, null, "b"] }).itemIds, ["a", "b"]);
 assert.equal(parseCampaignDesign({ itemIds: Array(20).fill("x") }).itemIds.length, 8);
});

test("half-written links are dropped rather than rendered as empty anchors", () => {
 const d = parseCampaignDesign({ links: [{ label: "Ok", url: "https://x" }, { label: "", url: "https://y" }, { label: "Z", url: "" }, "nope"] });
 assert.deepEqual(d.links, [{ label: "Ok", url: "https://x" }]);
});

test("no more than four links reach the footer", () => {
 const many = Array.from({ length: 9 }, (_, i) => ({ label: `L${i}`, url: `https://x/${i}` }));
 assert.equal(parseCampaignDesign({ links: many }).links.length, 4);
});

test("showPrices defaults on, ground defaults plain", () => {
 assert.equal(parseCampaignDesign({}).showPrices, true);
 assert.equal(parseCampaignDesign({ showPrices: false }).showPrices, false);
 assert.equal(parseCampaignDesign({}).ground, "white");
 assert.equal(parseCampaignDesign({ ground: "nonsense" }).ground, "white");
});

test("nothing at all still yields something sendable", () => {
 const d = parseCampaignDesign(null);
 assert.equal(d.headline, "Your headline");
 assert.equal(d.design, "classic");
 assert.deepEqual(d.itemIds, []);
 assert.deepEqual(d.links, []);
});

// ── Where the pieces go ─────────────────────────────────────────────────────────────────────────
// Typing a heading above the pieces used to empty `products`, which silently broke the two layouts
// built from them: Photo lost its lead image and Grid lost its grid, so both collapsed into
// Standard and picking them "didn't change anything".
import { bandsPieces } from "./campaign-design-core.ts";

test("Photo and Grid keep their pieces even when a heading is set", () => {
 for (const design of ["photo", "grid"] as const) {
  assert.equal(bandsPieces(design, "Just in", 3), false, design);
 }
});

test("the other layouts band the pieces under the heading, as before", () => {
 for (const design of ["classic", "statement", "editorial"] as const) {
  assert.equal(bandsPieces(design, "Just in", 3), true, design);
 }
});

test("no heading means no band, whatever the layout", () => {
 for (const design of ["classic", "statement", "photo", "editorial", "grid"] as const) {
  assert.equal(bandsPieces(design, null, 3), false, design);
  assert.equal(bandsPieces(design, "", 3), false, design);
 }
});

test("a heading with nothing to head is not a band", () => {
 assert.equal(bandsPieces("classic", "Just in", 0), false);
});
