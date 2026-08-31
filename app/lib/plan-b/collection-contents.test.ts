import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseCollectionItems } from "./collection-contents.ts";

const a = { id: "a" }, b = { id: "b" }, c = { id: "c" };

test("a collection the seller has filed shows what they filed", () => {
 const r = chooseCollectionItems({ assigned: [a, b], fromCapturedGrid: [c] });
 assert.deepEqual(r.items, [a, b]);
 assert.equal(r.renderEmpty, false);
});

test("nothing filed, but the captured page knows what was on it — use that", () => {
 // A hand-curated collection ("collection-1", six pieces someone dragged in) has no pattern behind
 // it, but the page we copied still lists exactly which products belonged there.
 const r = chooseCollectionItems({ assigned: [], fromCapturedGrid: [a, b] });
 assert.deepEqual(r.items, [a, b]);
});

test("an empty collection renders EMPTY — never the whole shop", () => {
 // blummier had 47 collections in this state, ange-archive 4. Every one of them served the seller's
 // entire catalogue: click "Alaïa" and get all 164 pieces, click "Blumarine" and get the same 164.
 // Those collections are empty on the sellers' own sites too, so empty is the 1:1 answer.
 const r = chooseCollectionItems({ assigned: [], fromCapturedGrid: [] });
 assert.deepEqual(r.items, []);
 assert.equal(r.renderEmpty, true, "the captured grid must be cleared, not left frozen");
});

test("a collection whose pieces we no longer hold renders empty too", () => {
 // The captured page named products, none of which resolved to live inventory. Showing the frozen
 // capture would advertise pieces we cannot sell; showing everything would be a different lie.
 const r = chooseCollectionItems({ assigned: [], fromCapturedGrid: [], capturedNamedProducts: true });
 assert.deepEqual(r.items, []);
 assert.equal(r.renderEmpty, true);
});

test("the shop-all page is not a collection and keeps showing everything", () => {
 // /collections/all means the whole catalogue by definition — the one page where "everything" is
 // the correct answer.
 const r = chooseCollectionItems({ assigned: [a, b, c], fromCapturedGrid: [], isShopAll: true });
 assert.deepEqual(r.items, [a, b, c]);
 assert.equal(r.renderEmpty, false);
});

test("shop-all with no inventory does not blank the store", () => {
 // Nothing live to show on the catch-all page is a data problem, not a shopper-facing statement.
 // Leave the captured page alone rather than declaring the shop empty.
 const r = chooseCollectionItems({ assigned: [], fromCapturedGrid: [], isShopAll: true });
 assert.equal(r.renderEmpty, false);
});

test("a collection we have synced and found empty is shown empty, not refilled from the capture", () => {
 // shop-vintage-charm had FIFTEEN collections reading exactly `6/0` — six products on our copy,
 // none on hers. Athleisure, All Mini, Occasions Cards: empty on her site today, and on ours still
 // showing the six pieces that happened to be in them on the day we photographed the page.
 //
 // The cascade could not tell "we have never read this collection" from "we read it and it is
 // empty", and answered both with the stale snapshot. Same confusion as every other bug this week.
 const got = chooseCollectionItems({ assigned: [], fromCapturedGrid: ["stale1", "stale2"], membershipKnown: true });
 assert.deepEqual(got.items, []);
 assert.equal(got.renderEmpty, true);
});

test("a collection we have never read still falls back to the capture", () => {
 // The fallback is not wrong — it is the best answer available when nothing has been synced. What
 // was wrong was using it when we DID know better.
 const got = chooseCollectionItems({ assigned: [], fromCapturedGrid: ["a", "b"], membershipKnown: false });
 assert.deepEqual(got.items, ["a", "b"]);
 assert.equal(got.renderEmpty, false);
});

test("knowing the membership never overrides pieces actually filed in it", () => {
 const got = chooseCollectionItems({ assigned: ["real"], fromCapturedGrid: ["stale"], membershipKnown: true });
 assert.deepEqual(got.items, ["real"]);
});

test("/collections/all is never emptied, however much we know", () => {
 // It is the catch-all: empty there means we have no live inventory at all, which is a data
 // problem of ours and not a statement to make to a shopper.
 const got = chooseCollectionItems({ assigned: [], fromCapturedGrid: [], membershipKnown: true, isShopAll: true });
 assert.equal(got.renderEmpty, false);
});
