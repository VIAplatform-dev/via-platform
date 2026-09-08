import { test } from "node:test";
import assert from "node:assert/strict";
import { salePush, messagePush, formatMoney } from "./seller-push-core.ts";

// The words on a seller's lock screen. A sale and a buyer message are the two pushes that matter;
// they have to read at a glance, name the piece, and carry enough data for the app to open the
// right screen when tapped.

test("money is whole units with the symbols VYA's stores price in, no Intl", () => {
 assert.equal(formatMoney(12_000, "GBP"), "£120");
 assert.equal(formatMoney(123_456, "USD"), "$1,235");
 assert.equal(formatMoney(5_000, "eur"), "€50");
 assert.equal(formatMoney(5_000, "CAD"), "CAD 50");
 assert.equal(formatMoney(-2_500, "USD"), "-$25");
});

test("a sale names the piece, the money, and where it sold", () => {
 assert.deepEqual(salePush({ itemTitle: "Blumarine slip dress", amountCents: 18_000, currency: "GBP", channel: "storefront", orderId: "o1" }), {
  title: "Sold: Blumarine slip dress",
  body: "£180 · on your storefront",
  data: { type: "sold", orderId: "o1" },
 });
 assert.equal(salePush({ itemTitle: "X", amountCents: 100, currency: "USD", channel: "ebay", orderId: "o2" }).body, "$1 · on eBay");
 assert.equal(salePush({ itemTitle: "X", amountCents: 100, currency: "USD", channel: "depop", orderId: "o3" }).body, "$1 · on Depop");
 assert.equal(salePush({ itemTitle: "X", amountCents: 100, currency: "USD", channel: "market", orderId: "o4" }).body, "$1 · at the market");
});

test("a sale with no title still reads as a sale", () => {
 assert.equal(salePush({ itemTitle: null, amountCents: 100, currency: "USD", channel: "storefront", orderId: "o1" }).title, "Sold: a piece");
 assert.equal(salePush({ itemTitle: "   ", amountCents: 100, currency: "USD", channel: "storefront", orderId: "o1" }).title, "Sold: a piece");
});

test("a message says who asked about what, with the first line of what they said", () => {
 assert.deepEqual(messagePush({ buyerName: "Ana", itemTitle: "Sixty-day skirt", message: "Is the waist elasticated?", conversationId: 42, source: "storefront" }), {
  title: "Ana asked about Sixty-day skirt",
  body: "Is the waist elasticated?",
  data: { type: "store_message", source: "storefront", conversationId: 42 },
 });
});

test("a message falls back gracefully when the buyer or the piece is unknown", () => {
 assert.equal(messagePush({ buyerName: null, itemTitle: "Coat", message: "hi", conversationId: 1, source: "marketplace" }).title, "A buyer asked about Coat");
 assert.equal(messagePush({ buyerName: "Ana", itemTitle: null, message: "hi", conversationId: 1, source: "marketplace" }).title, "Ana messaged you");
 assert.equal(messagePush({ buyerName: null, itemTitle: null, message: "hi", conversationId: 1, source: "marketplace" }).title, "A buyer messaged you");
});

test("the body is the first 140 characters — a lock screen is not an inbox", () => {
 const long = "x".repeat(300);
 const p = messagePush({ buyerName: "A", itemTitle: "B", message: long, conversationId: 1, source: "storefront" });
 assert.equal(p.body.length, 141);
 assert.ok(p.body.endsWith("…"));
 assert.equal(messagePush({ buyerName: "A", itemTitle: "B", message: "  short  ", conversationId: 1, source: "storefront" }).body, "short");
});
