import { test } from "node:test";
import assert from "node:assert/strict";
import { productFromJsonLd, jsonLdNodes, sitemapCandidates } from "./rungs.ts";

// Parsing rules for the generic rung, pinned against the real shapes seen on live stores.

const wrap = (ld: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body>x</body></html>`;

test("reads a schema.org Product into an ImportedProduct", () => {
 const p = productFromJsonLd(wrap({
  "@context": "https://schema.org", "@type": "Product",
  name: "Late 1940s black cocktail dress", sku: "DR1764",
  image: ["https://cdn/a.jpg", "https://cdn/b.jpg"],
  description: "<p>A <b>lovely</b> dress</p>",
  offers: { "@type": "Offer", price: "150.00", priceCurrency: "USD", availability: "https://schema.org/InStock" },
 }), "https://store.com/late-1940s-black-cocktail-dress/");
 assert.ok(p);
 assert.equal(p!.name, "Late 1940s black cocktail dress");
 assert.equal(p!.priceCents, 15000, "money is cents, never a formatted string");
 assert.equal(p!.currency, "USD");
 assert.equal(p!.available, true);
 assert.equal(p!.sourceId, "DR1764", "SKU is the stable identity when present");
 assert.equal(p!.images?.length, 2);
 assert.equal(p!.description, "A lovely dress", "HTML stripped out of the description");
});

test("falls back to the URL slug when a product has no SKU", () => {
 const p = productFromJsonLd(wrap({ "@type": "Product", name: "No SKU Dress", image: "https://cdn/a.jpg", offers: { price: "10", priceCurrency: "GBP" } }),
  "https://store.com/products/no-sku-dress/");
 assert.equal(p!.sourceId, "no-sku-dress");
 assert.equal(p!.currency, "GBP", "currency comes from the offer, never guessed");
});

test("handles offers as an array and as an AggregateOffer", () => {
 const arr = productFromJsonLd(wrap({ "@type": "Product", name: "A", image: "i.jpg", offers: [{ price: "5", priceCurrency: "USD" }] }), "https://s.com/a");
 assert.equal(arr!.priceCents, 500);
 const agg = productFromJsonLd(wrap({ "@type": "Product", name: "B", image: "i.jpg", offers: { "@type": "AggregateOffer", lowPrice: "12.50", priceCurrency: "EUR" } }), "https://s.com/b");
 assert.equal(agg!.priceCents, 1250);
 assert.equal(agg!.currency, "EUR");
});

test("marks a sold-out product unavailable rather than dropping it", () => {
 // Sold pieces are the archive of a vintage store — they belong in the import, flagged.
 const p = productFromJsonLd(wrap({ "@type": "Product", name: "Sold Dress", image: "i.jpg", offers: { price: "99", priceCurrency: "USD", availability: "https://schema.org/OutOfStock" } }), "https://s.com/x");
 assert.equal(p!.available, false);
});

test("finds Products nested inside an @graph", () => {
 const html = wrap({ "@context": "https://schema.org", "@graph": [{ "@type": "WebPage" }, { "@type": "Product", name: "Graph Dress", image: "i.jpg", offers: { price: "20", priceCurrency: "USD" } }] });
 assert.equal(productFromJsonLd(html, "https://s.com/g")!.name, "Graph Dress");
});

test("ignores pages whose only JSON-LD is not a Product", () => {
 assert.equal(productFromJsonLd(wrap({ "@type": "Organization", name: "A Shop" }), "https://s.com/about"), null);
});

test("survives malformed JSON-LD without throwing", () => {
 assert.equal(productFromJsonLd(`<script type="application/ld+json">{ not json </script>`, "https://s.com/x"), null);
 assert.deepEqual(jsonLdNodes(`<script type="application/ld+json">{{{</script>`), []);
});

test("a Product with no usable price still parses (price is optional, name is not)", () => {
 const p = productFromJsonLd(wrap({ "@type": "Product", name: "Price on request", image: "i.jpg" }), "https://s.com/p");
 assert.ok(p);
 assert.equal(p!.priceCents, null);
});

test("sitemap candidates are platform-specific", () => {
 // BigCommerce's entry point is the bare xmlsitemap.php index — "?type=products" returns an empty
 // document, which is why the first implementation discovered nothing on those stores.
 assert.equal(sitemapCandidates("https://s.com", "bigcommerce")[0], "https://s.com/xmlsitemap.php");
 assert.equal(sitemapCandidates("https://s.com", "woocommerce")[0], "https://s.com/wp-sitemap.xml");
 assert.deepEqual(sitemapCandidates("https://s.com", "shopify"), ["https://s.com/sitemap.xml"]);
 assert.ok(sitemapCandidates("https://s.com", "static").includes("https://s.com/sitemap.xml"));
});
