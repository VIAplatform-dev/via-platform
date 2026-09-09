import { test } from "node:test";
import assert from "node:assert/strict";
import { flattenHits, hitTarget, searchPlaceholder } from "./search.ts";

// The web's /api/store/search answers { groups: [{ group, hits: [{ id, label, sub, href }] }] } with
// the status already written into `sub` ("SKU-1042 · $180 · active"). The phone shows the same rows
// and only has to decide where a tap goes.

const GROUPS = [
  { group: "Orders", hits: [{ id: "o1", label: "#1042 · Fendi baguette", sub: "ana@x.com · $420 · paid", href: "/admin/orders/o1" }] },
  { group: "Inventory", hits: [{ id: "i1", label: "Fendi baguette", sub: "SKU-1042 · $420 · active", href: "/admin/inventory?item=i1" }] },
];

test("hits are flattened in the server's order with their group kept", () => {
  const rows = flattenHits(GROUPS);
  assert.deepEqual(rows.map((r) => [r.group, r.id]), [["Orders", "o1"], ["Inventory", "i1"]]);
  assert.equal(rows[1].sub, "SKU-1042 · $420 · active");
});

test("a tap lands on the phone screen for that kind of thing", () => {
  assert.deepEqual(hitTarget("Inventory", "i1"), { pathname: "/(seller)/piece/[id]", params: { id: "i1" } });
  assert.deepEqual(hitTarget("Orders", "o1"), { pathname: "/(seller)/orders", params: { id: "o1" } });
  assert.deepEqual(hitTarget("Customers", "c1"), { pathname: "/(seller)/customers", params: {} });
  assert.deepEqual(hitTarget("Consignors", "c2"), { pathname: "/(seller)/consignment", params: {} });
  assert.deepEqual(hitTarget("Discounts", "d1"), { pathname: "/(seller)/discounts", params: {} });
  assert.deepEqual(hitTarget("Collections", "k1"), { pathname: "/(seller)/inventory", params: {} });
});

test("the placeholder says what she can type", () => {
  assert.equal(searchPlaceholder(), "Search a piece, order, SKU or customer");
});
