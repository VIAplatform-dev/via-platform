import { test } from "node:test";
import assert from "node:assert/strict";
import { productsFromLinks, type ProductLinkCandidate } from "./product-links.ts";

const link = (p: Partial<ProductLinkCandidate>): ProductLinkCandidate =>
 ({ href: "", ownText: "", labelledByText: "", tileText: "", imgAlt: "", visible: true, ...p });

test("the ordinary case: a link whose own text is the product name", () => {
 const out = productsFromLinks([link({ href: "/products/silk-slip", ownText: "1990s Silk Slip" })]);
 assert.deepEqual(out, [{ handle: "silk-slip", title: "1990s Silk Slip" }]);
});

test("an invisible overlay link takes its name from what it points at", () => {
 // hachi-archive's theme: the whole tile is covered by an empty <a>, and the product name lives
 // outside it, referenced by aria-labelledby. The old rule ("a link with text") saw nothing here,
 // so parity reported 0 products on BOTH sides and graded the store "couldn't compare" — a pass by
 // way of not looking.
 const out = productsFromLinks([link({
  href: "/products/prada-2000s-pink-bow-slingback-heels",
  ownText: "",
  labelledByText: "prada 2000s pink bow slingback heels",
 })]);
 assert.deepEqual(out, [{ handle: "prada-2000s-pink-bow-slingback-heels", title: "prada 2000s pink bow slingback heels" }]);
});

test("a link wrapping only a photo falls back to the photo's alt text", () => {
 const out = productsFromLinks([link({ href: "/products/city-bag", imgAlt: "balenciaga 2000s denim city bag" })]);
 assert.deepEqual(out.map((p) => p.title), ["balenciaga 2000s denim city bag"]);
});

test("failing all of those, the name comes from the tile, with the price stripped out", () => {
 const out = productsFromLinks([link({
  href: "/products/hobo",
  tileText: "balenciaga 2000s brown large hobo bag $1,745.00 USD Add to cart",
 })]);
 assert.equal(out[0].title, "balenciaga 2000s brown large hobo bag");
});

test("the same product linked twice is one product", () => {
 // Themes routinely emit a mobile link and a desktop link for the same tile — `block lg:hidden`
 // beside `hidden lg:block`. Counting both doubled every product on the page.
 const out = productsFromLinks([
  link({ href: "/products/city-bag", ownText: "", labelledByText: "denim city bag" }),
  link({ href: "/products/city-bag", ownText: "", labelledByText: "denim city bag" }),
 ]);
 assert.equal(out.length, 1);
});

test("a variant link is the same product", () => {
 const out = productsFromLinks([
  link({ href: "/products/city-bag?variant=44012#gallery", ownText: "Denim City Bag" }),
  link({ href: "https://shop.example.com/products/city-bag", ownText: "Denim City Bag" }),
 ]);
 assert.deepEqual(out.map((p) => p.handle), ["city-bag"]);
});

test("grid order is preserved — it is what the order comparison measures", () => {
 const out = productsFromLinks([
  link({ href: "/products/c", ownText: "Third" }),
  link({ href: "/products/a", ownText: "First" }),
  link({ href: "/products/b", ownText: "Second" }),
 ]);
 assert.deepEqual(out.map((p) => p.handle), ["c", "a", "b"]);
});

test("links that are not a product are ignored", () => {
 const out = productsFromLinks([
  link({ href: "/collections/all", ownText: "Shop all" }),
  link({ href: "/products/", ownText: "All products" }),
  link({ href: "/products", ownText: "Catalog" }),
  link({ href: "/products/real-bag", ownText: "A Real Bag" }),
 ]);
 assert.deepEqual(out.map((p) => p.handle), ["real-bag"]);
});

test("a hidden link is skipped, but an overlay one is not", () => {
 // `display:none` markup a shopper never sees should not count. A transparent overlay covering a
 // tile IS seen — it is the thing you click.
 const out = productsFromLinks([
  link({ href: "/products/ghost", ownText: "Ghost", visible: false }),
  link({ href: "/products/overlay", labelledByText: "Overlay Bag", visible: true }),
 ]);
 assert.deepEqual(out.map((p) => p.handle), ["overlay"]);
});

test("a product reachable ONLY through a hidden link still counts once a visible one exists", () => {
 const out = productsFromLinks([
  link({ href: "/products/bag", ownText: "Bag", visible: false }),
  link({ href: "/products/bag", labelledByText: "Bag", visible: true }),
 ]);
 assert.deepEqual(out, [{ handle: "bag", title: "Bag" }]);
});

test("a tile with nothing but a price yields no usable name, and is still counted as a product", () => {
 // The handle is the identity; the title is only for quoting back to the seller. A product with no
 // readable name must not vanish from the count — that is how a page silently compares as empty.
 const out = productsFromLinks([link({ href: "/products/mystery", tileText: "$1,200.00" })]);
 assert.deepEqual(out, [{ handle: "mystery", title: "" }]);
});

test("names are trimmed of whitespace and absurd length", () => {
 const out = productsFromLinks([link({ href: "/products/x", tileText: "  " + "A".repeat(300) + "  " })]);
 assert.ok(out[0].title.length <= 120, "a whole card's text is not a product name");
});

test("markup is never a product name", () => {
 // Reading a tile's textContent picks up the source of any <noscript> inside it — themes put a
 // fallback <img> there for JS-less browsers. bag-crush's names came back as
 // '<img src="//mybagcrush.com/cdn/shop/file…' until this rule existed.
 const out = productsFromLinks([link({
  href: "/products/bottega",
  tileText: '<img src="//mybagcrush.com/cdn/shop/files/x.jpg" alt="Bottega"> Bottega Intrecciato Shoulder $1,200.00',
 })]);
 assert.doesNotMatch(out[0].title, /[<>]|src=/, `got: ${out[0].title}`);
});

test("a name that is nothing but markup falls through to the next source", () => {
 const out = productsFromLinks([link({
  href: "/products/x",
  imgAlt: '<img src="//cdn/x.jpg">',
  tileText: "Real Product Name",
 })]);
 assert.equal(out[0].title, "Real Product Name");
});

test("an ordinary name containing an angle bracket is not thrown away", () => {
 const out = productsFromLinks([link({ href: "/products/y", ownText: "Size < 8 Vintage Boot" })]);
 assert.equal(out[0].title, "Size < 8 Vintage Boot");
});

test("a badge is not a name — whichever source it came from", () => {
 // bag-crush quoted two pieces back to the seller as "SOLD OUT". The noise filter only ran on the
 // tile fallback; a theme that puts the badge in the link's own text slipped straight past it.
 const out = productsFromLinks([
  link({ href: "/products/a", ownText: "Sold out", tileText: "Valentino Rockstud Clutch $900.00" }),
  link({ href: "/products/b", labelledByText: "Quick add", imgAlt: "Louis Vuitton Looping GM" }),
 ]);
 assert.deepEqual(out.map((p) => p.title), ["Valentino Rockstud Clutch", "Louis Vuitton Looping GM"]);
});

// ── a product name is not a section heading ──────────────────────────────────────────────────────
import { sectionHeadings } from "./product-links.ts";

test("a heading that is a product's name is not a section heading", () => {
 // bag-crush's theme marks product titles as <h2> (class product-item__title). So the featured strip
 // showing different pieces was reported as "2 section headings missing" — on top of already being
 // reported as different products, and as a different order. One difference, counted three times.
 const heads = ["Featured Crushes", "Louis Vuitton Looping GM", "Guaranteed Authenticity"];
 const products = [{ handle: "lv-looping", title: "Louis Vuitton Looping GM" }];
 assert.deepEqual(sectionHeadings(heads, products), ["Featured Crushes", "Guaranteed Authenticity"]);
});

test("matching ignores case and spacing, the way the rest of the comparison does", () => {
 const heads = ["  louis   vuitton looping gm ", "Featured Crushes"];
 const products = [{ handle: "x", title: "Louis Vuitton Looping GM" }];
 assert.deepEqual(sectionHeadings(heads, products), ["Featured Crushes"]);
});

test("a section whose name happens to contain a product's name is kept", () => {
 // "Shop Louis Vuitton" is a section, not a piece.
 const heads = ["Shop Louis Vuitton"];
 const products = [{ handle: "x", title: "Louis Vuitton" }];
 assert.deepEqual(sectionHeadings(heads, products), ["Shop Louis Vuitton"]);
});

test("with no products on the page every heading is a section", () => {
 assert.deepEqual(sectionHeadings(["About us", "Our story"], []), ["About us", "Our story"]);
});

test("a heading is judged against the products on BOTH pages, not one", () => {
 // we-thieves: their collection page and ours are identical — 14 headings, 13 of them product
 // names. But their theme labels a product differently in its link than in its heading, so the
 // names matched on our side and not on theirs: ours filtered down to 1 heading, theirs kept 12,
 // and a page that matched perfectly reported "11 section headings missing".
 const heads = ["Mothers Day", "Sacred Heart Stud Earring", "Midi Hair Claw"];
 // Their link text carries the price; ours does not. Neither list alone covers both pages.
 const theirs = [{ title: "Sacred Heart Stud Earring $48.00" }];
 const ours = [{ title: "Sacred Heart Stud Earring" }, { title: "Midi Hair Claw" }];
 assert.deepEqual(sectionHeadings(heads, [...theirs, ...ours]), ["Mothers Day"]);
});
