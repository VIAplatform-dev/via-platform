import { test } from "node:test";
import assert from "node:assert/strict";
import { channelLabel, fromOrderChannel, fromImportSource, fromPlatform, rollUp } from "./channels.ts";

test("her own sales are told apart: the shop, and standing in front of her", () => {
 assert.equal(fromOrderChannel("online"), "storefront");
 assert.equal(fromOrderChannel("market"), "in-person");
 assert.equal(fromOrderChannel("pos"), "in-person");
 // `channel` did not always exist; a blank one on an old row is a storefront sale.
 assert.equal(fromOrderChannel(null), "storefront");
 assert.equal(fromOrderChannel(""), "storefront");
});

test("cash means somebody stood in front of her, whatever the column says", () => {
 // The two disagreed on rows written before `channel` existed, and "sold at the market for cash"
 // showing up as a website sale is the kind of wrong that makes a seller stop trusting the page.
 assert.equal(fromOrderChannel("online", "cash"), "in-person");
 assert.equal(fromOrderChannel("online", "card"), "storefront");
});

test("the marketplaces name themselves", () => {
 assert.equal(fromPlatform("depop"), "depop");
 assert.equal(fromPlatform("ebay"), "ebay");
 assert.equal(fromPlatform("vestiaire"), "vestiaire");
 // Spelt out in full, as Vestiaire's own name sometimes is.
 assert.equal(fromPlatform("vestiaire_collective"), "vestiaire");
 assert.equal(fromPlatform("Depop"), "depop");
});

test("history she brought over is labelled by where it came FROM", () => {
 // "Shopify" is the useful answer, not "an import" — it sits next to Depop and answers the same
 // question she was already asking.
 assert.equal(fromImportSource("shopify"), "shopify");
 assert.equal(fromImportSource("square"), "square");
 // A bare CSV says only that it came out of a file.
 assert.equal(fromImportSource("csv"), "imported");
 assert.equal(fromImportSource(""), "imported");
 assert.equal(fromImportSource(null), "imported");
});

test("what a seller reads", () => {
 assert.equal(channelLabel("storefront"), "Your shop");
 assert.equal(channelLabel("in-person"), "In person");
 assert.equal(channelLabel("depop"), "Depop");
 assert.equal(channelLabel("ebay"), "eBay");
 // A channel added later and not labelled here should look like itself, not like a bug.
 assert.equal(channelLabel("grailed"), "Grailed");
 assert.equal(channelLabel(""), "Other");
});

test("revenue per channel, biggest first — the answer to 'is Depop worth it'", () => {
 const out = rollUp([
  { channel: "depop", amountCents: 5000 },
  { channel: "storefront", amountCents: 40000 },
  { channel: "depop", amountCents: 3000 },
  { channel: "in-person", amountCents: 12000 },
 ]);
 assert.deepEqual(out.map((c) => [c.label, c.revenueCents, c.orders]), [
  ["Your shop", 40000, 1],
  ["In person", 12000, 1],
  ["Depop", 8000, 2],
 ]);
 assert.deepEqual(rollUp([]), []);
 assert.deepEqual(rollUp(null as never), []);
});
