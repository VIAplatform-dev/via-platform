import { test } from "node:test";
import assert from "node:assert/strict";
import { filterItems, itemDot, inventoryCount, reservedWord, lacks, parseMissing, missingLabel, type InventoryFilter } from "./inventory.ts";

const items = [
  { id: "1", title: "Prada bag", status: "active" },
  { id: "2", title: "Yohji coat", status: "draft" },
  { id: "3", title: "Miu Miu heels", status: "sold" },
  { id: "4", title: "Margiela boots", status: "active" },
  { id: "5", title: "Gucci skirt", status: "reserved" },
  { id: "6", title: "Old thing", status: "removed" },
];

test("the All chip hides removed pieces — they are deleted, not a state to browse", () => {
  assert.deepEqual(filterItems(items, "all").map((i) => i.id), ["1", "2", "3", "4", "5"]);
});

test("each chip shows exactly its own state", () => {
  assert.deepEqual(filterItems(items, "live").map((i) => i.id), ["1", "4"]);
  assert.deepEqual(filterItems(items, "drafts").map((i) => i.id), ["2"]);
  assert.deepEqual(filterItems(items, "sold").map((i) => i.id), ["3"]);
});

test("a reserved piece counts as live — it is on the site and spoken for, not sold", () => {
  // Market Mode reserves an item mid-sale. Showing it under Sold would tell her she has money she
  // has not been paid, and hiding it entirely would look like the piece vanished.
  assert.deepEqual(filterItems(items, "live").map((i) => i.status).includes("reserved"), false);
  assert.equal(filterItems([{ id: "9", title: "x", status: "reserved" }], "sold").length, 0);
});

test("the dot colour follows the state, and sold has no dot at all", () => {
  assert.equal(itemDot("active"), "live");
  assert.equal(itemDot("reserved"), "pending");
  assert.equal(itemDot("draft"), "pending");
  assert.equal(itemDot("sold"), null);
});

test("the header counts pieces and what sold this week", () => {
  assert.equal(inventoryCount(230, 6), "230 pieces · 6 sold this week");
  assert.equal(inventoryCount(1, 1), "1 piece · 1 sold this week");
});

test("nothing sold this week drops the clause rather than saying 0", () => {
  assert.equal(inventoryCount(230, 0), "230 pieces");
});

test("an empty inventory says so instead of counting to zero", () => {
  assert.equal(inventoryCount(0, 0), "Nothing listed yet");
});

test("every filter is a known key", () => {
  const keys: InventoryFilter[] = ["all", "live", "drafts", "sold"];
  for (const k of keys) assert.equal(Array.isArray(filterItems(items, k)), true);
});

test("a reserved piece says on hold only when a person is holding it; a buyer mid-checkout is reserved", () => {
  assert.equal(reservedWord("reserved", true), "on hold");
  assert.equal(reservedWord("reserved", false), "reserved");
  assert.equal(reservedWord("active", true), null);
  assert.equal(reservedWord("sold", false), null);
});

const rows = [
  { id: "a", status: "active", images: [], priceCents: 1200, costCents: null },
  { id: "b", status: "active", images: ["x.jpg"], priceCents: 0, costCents: 300 },
  { id: "c", status: "draft", images: ["y.jpg"], priceCents: 900, costCents: null },
  { id: "d", status: "sold", images: null, priceCents: 900, costCents: null },
  { id: "e", status: "active", images: ["z.jpg"], priceCents: 4000, costCents: 800 },
];

test("?missing= answers with the same pieces the web Inventory would", () => {
  assert.deepEqual(lacks(rows, "photo").map((r) => r.id), ["a", "d"]);
  assert.deepEqual(lacks(rows, "price").map((r) => r.id), ["b"]);
  // Only a LIVE piece is missing its cost: a draft is not costed yet and a sold one is history.
  assert.deepEqual(lacks(rows, "cost").map((r) => r.id), ["a"]);
  assert.deepEqual(lacks(rows, "confidence", ["e", "zzz"]).map((r) => r.id), ["e"]);
  assert.deepEqual(lacks(rows, null).length, rows.length);
});

test("only a known filter is honoured from the URL, and each has a name", () => {
  assert.equal(parseMissing("photo"), "photo");
  assert.equal(parseMissing("details"), null);
  assert.equal(parseMissing(undefined), null);
  assert.equal(missingLabel("cost"), "No cost");
  assert.equal(missingLabel("confidence"), "AI price to check");
});
