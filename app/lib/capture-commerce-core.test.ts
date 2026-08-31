import { test } from "node:test";
import assert from "node:assert/strict";
import { worthImporting } from "./capture-commerce-core.ts";

// ── a piece she has sold and zeroed the price on ─────────────────────────────────────────────────
test("a SOLD piece with no price is still imported", () => {
 // bag-crush keeps 24 sold pieces published with 19–28 photographs each and the price zeroed —
 // Chanel Mademoiselle Flap, a Louis Vuitton Multi Pochette, a Chanel Classic Flap. Every one was
 // dropped by `!cents`, so her archive was 24 of her best pieces smaller on our copy, silently.
 //
 // The Squarespace reader in this same codebase already got this right: "Keep sold items even
 // though Squarespace zeroes their price; only skip a LIVE item that has no price." The Shopify
 // path skipped all of them.
 assert.equal(worthImporting({ title: "Chanel Mademoiselle Flap", cents: 0, available: false }), true);
});

test("a LIVE piece with no price is still skipped", () => {
 // Nobody can buy this, and showing it offers a price we do not have. That is the case the rule
 // was written for, and it stays.
 assert.equal(worthImporting({ title: "Draft listing", cents: 0, available: true }), false);
});

test("a piece with no title is skipped whatever else it has", () => {
 assert.equal(worthImporting({ title: "", cents: 5000, available: true }), false);
 assert.equal(worthImporting({ title: "   ", cents: 0, available: false }), false);
});

test("an ordinary priced piece is imported", () => {
 assert.equal(worthImporting({ title: "Gucci bag", cents: 42000, available: true }), true);
 assert.equal(worthImporting({ title: "Gucci bag", cents: 42000, available: false }), true);
});

test("availability we could not read is treated as live, so a priceless piece is not imported", () => {
 // `undefined` means the feed did not say. Guessing "sold" would import every draft with no price.
 assert.equal(worthImporting({ title: "Unknown", cents: 0, available: undefined }), false);
});
