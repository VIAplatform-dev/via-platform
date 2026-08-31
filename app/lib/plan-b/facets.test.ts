import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFacets, parseSort, hasFacetParams, type FacetItem } from "./facets.ts";

const P = (qs: string) => new URLSearchParams(qs);
const it = (o: Partial<FacetItem> & { title: string }): FacetItem =>
 ({ priceCents: 10000, brand: null, category: null, era: null, condition: null, size: null, status: "active", createdAt: null, ...o });

const CATALOGUE: FacetItem[] = [
 it({ title: "Chanel Flap", brand: "Chanel", category: "Bags", priceCents: 500000, size: "OS", createdAt: "2026-01-01" }),
 it({ title: "Dior Saddle", brand: "Dior", category: "Bags", priceCents: 250000, size: "OS", createdAt: "2026-02-01" }),
 it({ title: "Alaia Dress", brand: "Alaia", category: "Dresses", priceCents: 90000, size: "US 4", createdAt: "2026-03-01" }),
 it({ title: "Sold Chanel Tote", brand: "Chanel", category: "Bags", priceCents: 300000, status: "sold", createdAt: "2026-04-01" }),
 it({ title: "Unpriced Piece", brand: "Dior", category: "Bags", priceCents: null, createdAt: "2026-05-01" }),
];

test("no params → everything, seller order preserved", () => {
 const r = applyFacets(CATALOGUE, P(""), { perPage: 50 });
 assert.equal(r.total, 5);
 assert.deepEqual(r.items.map((i) => i.title), CATALOGUE.map((i) => i.title));
});

test("vendor filter is case- and punctuation-insensitive", () => {
 assert.equal(applyFacets(CATALOGUE, P("filter.p.vendor=chanel"), { perPage: 50 }).total, 2);
 assert.equal(applyFacets(CATALOGUE, P("filter.p.vendor=CHANEL"), { perPage: 50 }).total, 2);
});

test("a repeated filter key is OR, not last-wins", () => {
 // Ticking a second brand must GROW the results. Reading only the first value shrank them.
 const r = applyFacets(CATALOGUE, P("filter.p.vendor=Chanel&filter.p.vendor=Dior"), { perPage: 50 });
 assert.equal(r.total, 4);
});

test("price bounds are whole currency units, not cents", () => {
 // ?filter.v.price.lte=2600 means $2600, NOT 2600 cents. Dior ($2500) and Alaia ($900) qualify;
 // Chanel ($5000) and the sold tote ($3000) don't. Read as cents, every item would be excluded and
 // the collection would look empty rather than filtered.
 const r = applyFacets(CATALOGUE, P("filter.v.price.lte=2600"), { perPage: 50 });
 assert.deepEqual(r.items.map((i) => i.title).sort(), ["Alaia Dress", "Dior Saddle"]);
});

test("an unpriced item never satisfies a price bound, but survives when none is set", () => {
 assert.ok(applyFacets(CATALOGUE, P(""), { perPage: 50 }).items.some((i) => i.title === "Unpriced Piece"));
 assert.ok(!applyFacets(CATALOGUE, P("filter.v.price.gte=0"), { perPage: 50 }).items.some((i) => i.title === "Unpriced Piece"));
});

test("availability=1 drops sold one-of-ones", () => {
 const r = applyFacets(CATALOGUE, P("filter.v.availability=1"), { perPage: 50 });
 assert.ok(!r.items.some((i) => i.status === "sold"));
 assert.equal(r.total, 4);
});

test("size filter — the one that matters most on one-of-one vintage", () => {
 assert.deepEqual(applyFacets(CATALOGUE, P("filter.v.option.size=US+4"), { perPage: 50 }).items.map((i) => i.title), ["Alaia Dress"]);
});

test("price sort puts unpriced LAST in both directions", () => {
 const asc = applyFacets(CATALOGUE, P("sort_by=price-ascending"), { perPage: 50 }).items.map((i) => i.title);
 const desc = applyFacets(CATALOGUE, P("sort_by=price-descending"), { perPage: 50 }).items.map((i) => i.title);
 assert.equal(asc[0], "Alaia Dress");
 assert.equal(asc.at(-1), "Unpriced Piece");
 assert.equal(desc[0], "Chanel Flap");
 assert.equal(desc.at(-1), "Unpriced Piece");
});

test("date sort", () => {
 assert.equal(applyFacets(CATALOGUE, P("sort_by=created-descending"), { perPage: 50 }).items[0].title, "Unpriced Piece");
 assert.equal(applyFacets(CATALOGUE, P("sort_by=created-ascending"), { perPage: 50 }).items[0].title, "Chanel Flap");
});

test("manual / best-selling keep the seller's own order", () => {
 for (const s of ["manual", "best-selling", "nonsense"]) {
  const r = applyFacets(CATALOGUE, P(`sort_by=${s}`), { perPage: 50 });
  assert.deepEqual(r.items.map((i) => i.title), CATALOGUE.map((i) => i.title), s);
 }
});

test("total is the count BEFORE paging, so pagination knows how many pages exist", () => {
 const r = applyFacets(CATALOGUE, P("page=2"), { perPage: 2 });
 assert.equal(r.total, 5);
 assert.equal(r.items.length, 2);
 assert.deepEqual(r.items.map((i) => i.title), ["Alaia Dress", "Sold Chanel Tote"]);
});

test("filter runs before sort before page", () => {
 const r = applyFacets(CATALOGUE, P("filter.p.category=Bags&filter.p.product_type=Bags&sort_by=price-ascending&page=1"), { perPage: 2 });
 assert.deepEqual(r.items.map((i) => i.title), ["Dior Saddle", "Sold Chanel Tote"]);
});

test("sorting does not mutate the caller's array", () => {
 const copy = [...CATALOGUE];
 applyFacets(CATALOGUE, P("sort_by=price-ascending"), { perPage: 50 });
 assert.deepEqual(CATALOGUE.map((i) => i.title), copy.map((i) => i.title));
});

test("parseSort rejects junk", () => {
 assert.equal(parseSort(P("sort_by=<script>")), "manual");
 assert.equal(parseSort(P("sort_by=price-ascending")), "price-ascending");
});

test("hasFacetParams only fires on real facet activity", () => {
 assert.equal(hasFacetParams(P("")), false);
 assert.equal(hasFacetParams(P("q=chanel")), false);
 assert.equal(hasFacetParams(P("page=1")), false);
 assert.equal(hasFacetParams(P("page=2")), true);
 assert.equal(hasFacetParams(P("sort_by=manual")), true);
 assert.equal(hasFacetParams(P("filter.p.vendor=Dior")), true);
});

test("paginate:false hands the caller the whole filtered set — the theme owns page size", () => {
 // The captured-page route paginates from the theme's OWN rendered card count, which this module
 // can't know. Paginating here too emptied page 2 of every collection.
 const r = applyFacets(CATALOGUE, P("page=2"), { perPage: 0, paginate: false });
 assert.equal(r.items.length, 5);
 assert.equal(r.total, 5);
});

test("paginate:false still filters and sorts", () => {
 const r = applyFacets(CATALOGUE, P("filter.p.vendor=Chanel&sort_by=price-ascending"), { perPage: 0, paginate: false });
 assert.deepEqual(r.items.map((i) => i.title), ["Sold Chanel Tote", "Chanel Flap"]);
});
