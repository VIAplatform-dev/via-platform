import { test } from "node:test";
import assert from "node:assert";
import { filterRack, sortRack, rackSubtitle, rackEmptyMessage, SELLABLE, type RackItem } from "./rack.ts";

const it = (o: Partial<RackItem> & { id: string; title: string }): RackItem => ({
  priceCents: 5000, currency: "USD", image: null, brand: null, size: null,
  category: null, status: "active", onBringList: true, ...o,
});

const RACK: RackItem[] = [
  it({ id: "1", title: "Jacket", brand: "Dior", size: "M", category: "coats-jackets" }),
  it({ id: "2", title: "Baguette", brand: "Fendi", category: "bags" }),
  it({ id: "3", title: "Shoulder bag", brand: "Fendi", category: "bags" }),
  it({ id: "4", title: "Silk scarf", brand: "Hermes", category: "scarves" }),
  it({ id: "5", title: "Ankle boot", brand: "Prada", size: "38", category: "boots", status: "reserved" }),
];

test("typing finds a piece — the thing the camera was the only way to do", () => {
  assert.deepEqual(filterRack(RACK, "fendi").map((i) => i.id), ["2", "3"]);
  assert.deepEqual(filterRack(RACK, "scarf").map((i) => i.id), ["4"]);
});

test("every word, anywhere — not the whole phrase in one field", () => {
  // "fendi bag": the brand is on one field, "bag" on the title of one and the CATEGORY ("bags")
  // of both — so both Fendis match, which is right. This is the exact failure the server-side
  // search had, and the client half must not reintroduce it.
  assert.deepEqual(filterRack(RACK, "fendi bag").map((i) => i.id), ["2", "3"]);
  // Narrowing further still works.
  assert.deepEqual(filterRack(RACK, "fendi shoulder").map((i) => i.id), ["3"]);
  // "dior jacket": brand on one field, title on another.
  assert.deepEqual(filterRack(RACK, "dior jacket").map((i) => i.id), ["1"]);
});

test("case and spacing don't matter", () => {
  assert.deepEqual(filterRack(RACK, "FENDI").map((i) => i.id), ["2", "3"]);
  assert.deepEqual(filterRack(RACK, "  fendi   bag  ").map((i) => i.id), ["2", "3"]);
});

test("size and category are searchable", () => {
  assert.deepEqual(filterRack(RACK, "38").map((i) => i.id), ["5"]);
  assert.deepEqual(filterRack(RACK, "boots").map((i) => i.id), ["5"]);
});

test("an empty query shows the whole rack", () => {
  // The rack is visible by default. You should not have to search to see anything.
  assert.equal(filterRack(RACK, "").length, RACK.length);
  assert.equal(filterRack(RACK, "   ").length, RACK.length);
});

test("no match returns nothing rather than everything", () => {
  assert.deepEqual(filterRack(RACK, "zzzz"), []);
});

test("sorted so she can scan a rail: brought first, sellable before reserved, then A–Z", () => {
  const mixed: RackItem[] = [
    it({ id: "z", title: "Zebra coat" }),
    it({ id: "r", title: "Aa reserved", status: "reserved" }),
    it({ id: "a", title: "Apple dress" }),
    it({ id: "n", title: "Aaa not brought", onBringList: false }),
  ];
  assert.deepEqual(sortRack(mixed).map((i) => i.id), ["a", "z", "r", "n"]);
});

test("sorting does not mutate the list it was given", () => {
  const before = RACK.map((i) => i.id);
  sortRack(RACK);
  assert.deepEqual(RACK.map((i) => i.id), before);
});

test("the subtitle says what she needs before quoting a price", () => {
  const money = (c: number) => `$${(c / 100).toFixed(0)}`;
  assert.equal(rackSubtitle(it({ id: "x", title: "T" }), money), "$50");
  assert.equal(rackSubtitle(it({ id: "x", title: "T", size: "M" }), money), "$50 · Size M");
  assert.equal(rackSubtitle(it({ id: "x", title: "T", status: "reserved" }), money), "$50 · reserved");
});

test("the empty state explains WHY it is empty", () => {
  assert.match(rackEmptyMessage(0, ""), /Quick-list/);
  assert.match(rackEmptyMessage(12, "fendi"), /matches/);
  assert.match(rackEmptyMessage(12, ""), /Nothing available/);
});

test("a reserved piece is still sellable; a sold one is not", () => {
  assert.ok(SELLABLE.has("active"));
  assert.ok(SELLABLE.has("draft"));
  assert.ok(SELLABLE.has("reserved"));
  assert.ok(!SELLABLE.has("sold"));
});
