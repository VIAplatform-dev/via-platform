import { test } from "node:test";
import assert from "node:assert/strict";
import { extractProductLinks, pickIndexedPath, type ProductIndex } from "./product-index.ts";

// The three link shapes real captures use, in the markup they actually appear in: Squarespace's
// aria-labelled card link, a Shopify card whose name is the link text, and a bare image link.
const COLLECTION = `
<div class="products">
 <a class="product-list-item-link" href="/site/montrose-edit/shop/p/d1djte223uh5vh70ab962ibspzd4z3" aria-label="Christian Louboutin So Kate &#8211; Pink Suede">
  <figure><img alt="Christian Louboutin So Kate &#8211; Pink Suede" src="//cdn/x.jpg"></figure>
 </a>
 <a href="/products/fendi-beaded-baguette"><span class="card__heading">Fendi &amp; Co Beaded Baguette</span></a>
 <a href="https://montroseedit.com/shop/p/chanel-heels"><img alt="Chanel Heels" src="//cdn/y.jpg"></a>
 <a href="/shop/shoes">All shoes</a>
 <a href="/about">About</a>
</div>`;

test("reads each product's page and the name it is listed under", () => {
 const links = extractProductLinks(COLLECTION, "/site/montrose-edit");
 assert.deepEqual(links, [
  { title: "Christian Louboutin So Kate – Pink Suede", path: "/shop/p/d1djte223uh5vh70ab962ibspzd4z3" },
  { title: "Fendi & Co Beaded Baguette", path: "/products/fendi-beaded-baguette" },
  { title: "Chanel Heels", path: "/shop/p/chanel-heels" },
 ]);
});

test("a random source slug is found — the case slugifying a title can never solve", () => {
 const index: ProductIndex = { version: 2, entries: extractProductLinks(COLLECTION, "/site/montrose-edit") };
 assert.equal(
  pickIndexedPath(index, "Christian Louboutin So Kate – Pink Suede"),
  "/shop/p/d1djte223uh5vh70ab962ibspzd4z3",
 );
});

test("the Plan A `/site/{slug}` prefix a capture baked into its links is stripped", () => {
 const [first] = extractProductLinks(COLLECTION, "/site/montrose-edit");
 assert.ok(first.path.startsWith("/shop/p/"), first.path);
});

test("a REAL product card — a thousand characters of markup between the link and its close", () => {
 // The first version of this only matched an anchor it could see the `</a>` of within a few hundred
 // characters. Every real card is bigger than that, so it found nothing on an actual captured page
 // while passing on a small fixture.
 const filler = "<div class=\"grid-image-wrapper\">" + "<span data-x=\"y\"></span>".repeat(80) + "</div>";
 const card = `<a class="product-list-item-link" href="/shop/p/random-slug-xyz" aria-label="Chanel Slingbacks">${filler}</a>`;
 assert.deepEqual(extractProductLinks(card), [{ title: "Chanel Slingbacks", path: "/shop/p/random-slug-xyz" }]);
});

test("collection and content links are not products", () => {
 const paths = extractProductLinks(COLLECTION, "/site/montrose-edit").map((l) => l.path);
 assert.ok(!paths.includes("/shop/shoes"));
 assert.ok(!paths.includes("/about"));
});

test("matching ignores case, punctuation and entities", () => {
 const index: ProductIndex = { version: 2, entries: extractProductLinks(COLLECTION, "/site/montrose-edit") };
 assert.equal(pickIndexedPath(index, "fendi & co beaded baguette"), "/products/fendi-beaded-baguette");
 assert.equal(pickIndexedPath(index, "Fendi and Co Beaded Baguette"), null, "a different name is not a match");
});

test("two one-of-one pieces sharing a name resolve to NOTHING, never to one of them", () => {
 // Real: this store lists two separate products both called "Christian Louboutin So Kate". Picking
 // either would show half of those shoppers the other shoe.
 const index: ProductIndex = {
  version: 1,
  entries: [
   { title: "Christian Louboutin So Kate", path: "/shop/p/christian-louboutin-so-kate" },
   { title: "Christian Louboutin So Kate", path: "/shop/p/christian-louboutin-so-kate-1" },
  ],
 };
 assert.equal(pickIndexedPath(index, "Christian Louboutin So Kate"), null);
});

test("the same product listed on several pages is still one answer", () => {
 const index: ProductIndex = {
  version: 1,
  entries: [
   { title: "Chanel Heels", path: "/shop/p/chanel-heels" },
   { title: "Chanel heels", path: "/shop/p/chanel-heels" },
  ],
 };
 assert.equal(pickIndexedPath(index, "Chanel Heels"), "/shop/p/chanel-heels");
});

test("an empty or missing index answers nothing rather than throwing", () => {
 assert.equal(pickIndexedPath(null, "Anything"), null);
 assert.equal(pickIndexedPath({ version: 2, entries: [] }, "Anything"), null);
 assert.equal(pickIndexedPath({ version: 2, entries: [{ title: "x", path: "/products/x" }] }, ""), null);
});
