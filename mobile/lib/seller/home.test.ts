import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney, percentDelta, ordersToPostLabel, inventoryLabel, toPostOrders, toPostSubtitle, greeting } from "./home.ts";

/* ── money ──────────────────────────────────────────────────────────────── */

test("money is shown in the store's own currency, not a hardcoded pound", () => {
  // /api/store/me returns `currency` per store. The mockups are one London store; a New York
  // store on the same screen must not be told it took £840.
  assert.equal(formatMoney(84000, "GBP"), "£840");
  assert.equal(formatMoney(84000, "USD"), "$840");
  assert.equal(formatMoney(84000, "EUR"), "€840");
});

test("an unknown currency falls back to its code rather than guessing a symbol", () => {
  assert.equal(formatMoney(84000, "JPY"), "JPY 840");
});

test("thousands are grouped, because £4820 is misread at a glance", () => {
  assert.equal(formatMoney(482000, "GBP"), "£4,820");
  assert.equal(formatMoney(199500, "GBP"), "£1,995");
});

test("money rounds to whole units — Home has no room for pennies", () => {
  assert.equal(formatMoney(84049, "GBP"), "£840");
  assert.equal(formatMoney(84050, "GBP"), "£841");
});

test("zero takings is a real number, not a blank", () => {
  // The tile stays put on a quiet morning; hiding it would make the screen jump.
  assert.equal(formatMoney(0, "GBP"), "£0");
});

test("a negative total keeps its sign inside the symbol", () => {
  // Refunds can outrun sales on a slow day.
  assert.equal(formatMoney(-42000, "GBP"), "-£420");
});

/* ── the delta beside it ────────────────────────────────────────────────── */

test("the delta is the percentage change against the prior period", () => {
  assert.equal(percentDelta(84000, 68852), 22);
  assert.equal(percentDelta(50000, 100000), -50);
});

test("no prior takings means no delta, not an infinite one", () => {
  // Her first day selling: 840 against 0 is not "up 100%", it is a number we cannot state.
  assert.equal(percentDelta(84000, 0), null);
});

test("no takings against a prior period is a real fall, not a missing delta", () => {
  assert.equal(percentDelta(0, 84000), -100);
});

test("the delta is rounded to whole percent", () => {
  assert.equal(percentDelta(84000, 82000), 2);
});

/* ── the tile labels ────────────────────────────────────────────────────── */

test("the orders tile counts one order in the singular", () => {
  // The wide tile at the top of Home. "1 orders to post" is the kind of thing a seller notices
  // every single morning.
  assert.equal(ordersToPostLabel(1), "1 order to post");
  assert.equal(ordersToPostLabel(2), "2 orders to post");
});

test("nothing to post says so in words rather than showing a zero", () => {
  assert.equal(ordersToPostLabel(0), "Nothing to post");
});

test("the inventory tile reads live and drafts together", () => {
  assert.equal(inventoryLabel({ active: 212, draft: 18 }), "212 live · 18 drafts");
  assert.equal(inventoryLabel({ active: 1, draft: 1 }), "1 live · 1 draft");
});

test("no drafts drops the clause instead of saying 0 drafts", () => {
  assert.equal(inventoryLabel({ active: 212, draft: 0 }), "212 live");
});

test("an empty inventory is stated plainly, since this is a new store's first screen", () => {
  assert.equal(inventoryLabel({ active: 0, draft: 0 }), "Nothing listed yet");
});

/* ── which orders are waiting on her ────────────────────────────────────── */

test("orders to post are the paid ones — not shipped, delivered or cancelled", () => {
  // Money is in and the parcel has not left. `shipped` is already in transit; `cancelled` and
  // `refunded` are nobody's work. Counting those would send her to the post office for nothing.
  const orders = [
    { status: "paid", itemTitle: "Valentino gown" },
    { status: "shipped", itemTitle: "Gucci skirt" },
    { status: "paid", itemTitle: "Miu Miu heels" },
    { status: "cancelled", itemTitle: "Prada bag" },
    { status: "delivered", itemTitle: "Issey top" },
    { status: "refunded", itemTitle: "Margiela boots" },
  ];
  assert.deepEqual(toPostOrders(orders).map((o) => o.itemTitle), ["Valentino gown", "Miu Miu heels"]);
});

test("pending orders are not hers to post — the money has not landed", () => {
  assert.deepEqual(toPostOrders([{ status: "pending", itemTitle: "Yohji coat" }]), []);
});

test("the tile's subtitle names the first two pieces", () => {
  assert.equal(
    toPostSubtitle([{ itemTitle: "Valentino gown" }, { itemTitle: "Miu Miu heels" }]),
    "Valentino gown · Miu Miu heels",
  );
});

test("a long queue still names only two, because the tile is one line", () => {
  const many = [{ itemTitle: "A" }, { itemTitle: "B" }, { itemTitle: "C" }, { itemTitle: "D" }];
  assert.equal(toPostSubtitle(many), "A · B");
});

test("an untitled piece is skipped rather than printed as null", () => {
  // itemTitle comes from a LEFT JOIN, so it can genuinely be null.
  assert.equal(toPostSubtitle([{ itemTitle: null }, { itemTitle: "Miu Miu heels" }]), "Miu Miu heels");
  assert.equal(toPostSubtitle([{ itemTitle: null }]), "");
});

/* ── the greeting ───────────────────────────────────────────────────────── */

test("the greeting follows the seller's own clock", () => {
  assert.equal(greeting(0), "Good evening");
  assert.equal(greeting(5), "Good morning");
  assert.equal(greeting(9), "Good morning");
  assert.equal(greeting(12), "Good afternoon");
  assert.equal(greeting(17), "Good afternoon");
  assert.equal(greeting(18), "Good evening");
  assert.equal(greeting(23), "Good evening");
});
