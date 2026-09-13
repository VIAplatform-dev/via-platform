import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFacetLabels, resolveFacetValue } from "./facet-labels.ts";

// Venus Vintage's theme (Shopify Horizon-generation) files its Brand facet through a linked
// Metaobject and its Size/Fabric facets through Shopify's Standard Product Taxonomy. Both submit an
// opaque id as the filter VALUE — "gid://shopify/Metaobject/441893388388",
// "gid://shopify/TaxonomyValue/2885" — never the label a shopper actually ticked. Reading the id as
// if it were the label ("gid://shopify/…" never equals "Balenciaga") is why ticking a filter changed
// nothing: applyFacets matched against the raw id and nothing has that as its brand or size.
//
// Every checkbox carries `data-label` right next to `value` for exactly this reason — it's the
// theme's own answer to "what does this id mean?" — see the real markup this is built from:
//   <input name="filter.p.m.custom.brand" value="gid://shopify/Metaobject/441893388388"
//          data-label="Balenciaga">
//   <input name="filter.v.t.shopify.size" value="gid://shopify/TaxonomyValue/2885" data-label="2">

const brandInput = `<div class="checkbox" on:pointerenter="/prefetchPage"><input type="checkbox" name="filter.p.m.custom.brand" value="gid://shopify/Metaobject/441893388388" id="Filter-1" class="checkbox__input" data-label="Balenciaga" ref="facetInputs[]"><label class="checkbox__label" for="Filter-1">Balenciaga</label></div>`;
const sizeInput = `<div class="checkbox"><input type="checkbox" name="filter.v.t.shopify.size" value="gid://shopify/TaxonomyValue/2885" id="Filter-2" class="checkbox__input" data-label="2" ref="facetInputs[]"><label class="checkbox__label" for="Filter-2">2</label></div>`;
const fabricInput = `<input type="checkbox" name="filter.v.t.shopify.fabric" value="gid://shopify/TaxonomyValue/66" data-label="Cashmere">`;
// A plain (non-taxonomy) theme's own filter markup — no data-label at all, because its value already
// IS the label. Must not end up in the map (nothing to resolve) and must not throw.
const plainInput = `<input type="checkbox" name="filter.p.vendor" value="Chanel">`;

test("extracts a GID → label map from the page's own filter checkboxes", () => {
 const map = extractFacetLabels(`<ul>${brandInput}${sizeInput}</ul>`);
 assert.equal(map.get("gid://shopify/Metaobject/441893388388"), "Balenciaga");
 assert.equal(map.get("gid://shopify/TaxonomyValue/2885"), "2");
});

test("a checkbox with no data-label contributes nothing, and nothing throws", () => {
 const map = extractFacetLabels(`<ul>${plainInput}${fabricInput}</ul>`);
 assert.equal(map.has("Chanel"), false);
 assert.equal(map.get("gid://shopify/TaxonomyValue/66"), "Cashmere");
});

test("an HTML-entity label decodes ('Levi's', 'D&G')", () => {
 const input = `<input name="filter.p.m.custom.brand" value="gid://shopify/Metaobject/1" data-label="Levi&#39;s &amp; Co.">`;
 assert.equal(extractFacetLabels(input).get("gid://shopify/Metaobject/1"), "Levi's & Co.");
});

test("a page with no filter markup at all returns an empty map, not a throw", () => {
 assert.equal(extractFacetLabels("<html><body>no filters here</body></html>").size, 0);
});

test("resolveFacetValue: a known id resolves to its label", () => {
 const map = new Map([["gid://shopify/Metaobject/441893388388", "Balenciaga"]]);
 assert.equal(resolveFacetValue("gid://shopify/Metaobject/441893388388", map), "Balenciaga");
});

test("resolveFacetValue: a plain value with no map entry passes through unchanged", () => {
 // The classic (non-taxonomy) case: filter.p.vendor=Chanel already IS the label.
 assert.equal(resolveFacetValue("Chanel", new Map()), "Chanel");
});

test("resolveFacetValue: an UNRESOLVED id is not silently treated as its own label", () => {
 // A page with a stale or missing map must not match "gid://shopify/…" against an item's brand —
 // that string will never equal a real brand, so the filter correctly matches nothing rather than
 // pretending the id itself is meaningful.
 assert.equal(resolveFacetValue("gid://shopify/TaxonomyValue/999", new Map()), "gid://shopify/TaxonomyValue/999");
});
