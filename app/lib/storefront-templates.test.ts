import { test } from "node:test";
import assert from "node:assert/strict";
import {
 STOREFRONT_TEMPLATES,
 STOREFRONT_PALETTES,
 HEADING_FONTS,
 BODY_FONTS,
 getTemplate,
 templateTheme,
 templateBlocks,
 templateShopBlocks,
 templatePages,
} from "./storefront-templates.ts";
import { blockDef } from "./storefront-blocks.ts";
import { isKnownVariant } from "./storefront-variants.ts";

// A template is hand-written data — eight of them, each naming section types, layout variants, page
// slugs and font families that live in four other files. Every assertion below is a mistake that
// would otherwise only show up as a silently wrong storefront on a real seller's store.

const every = (fn: (t: (typeof STOREFRONT_TEMPLATES)[number]) => void) => STOREFRONT_TEMPLATES.forEach(fn);

test("the eight templates are present and uniquely identified", () => {
 assert.equal(STOREFRONT_TEMPLATES.length, 8);
 const ids = STOREFRONT_TEMPLATES.map((t) => t.id);
 assert.equal(new Set(ids).size, 8, "template ids must be unique");
 for (const id of ids) assert.match(id, /^[a-z][a-z0-9-]*$/, `${id} is not a slug`);
});

test("every section names a real block type", () => {
 every((t) => {
  const specs = [...t.layout, ...t.shop, ...t.pages.flatMap((p) => p.blocks)];
  for (const s of specs) assert.ok(blockDef(s.type), `${t.id}: unknown block type "${s.type}"`);
 });
});

// The whole point of the rewrite: templates differ by LAYOUT, not just palette. A typo'd variant id
// falls back to the default layout, which is exactly the same-y look this was meant to fix — and it
// fails silently, because sanitizeBlocks deliberately keeps unrecognized ids.
test("every layout variant exists for its block type", () => {
 every((t) => {
  const specs = [...t.layout, ...t.shop, ...t.pages.flatMap((p) => p.blocks)];
  for (const s of specs) {
   if (!s.variant) continue;
   assert.ok(isKnownVariant(s.type, s.variant), `${t.id}: "${s.variant}" is not a layout for ${s.type}`);
  }
 });
});

test("templates pick their fonts from the registered families", () => {
 every((t) => {
  assert.ok(HEADING_FONTS.includes(t.fonts.heading), `${t.id}: heading font "${t.fonts.heading}" is not in HEADING_FONTS`);
  assert.ok(BODY_FONTS.includes(t.fonts.body), `${t.id}: body font "${t.fonts.body}" is not in BODY_FONTS`);
 });
});

test("every template ships a home page, a shop intro, and its own pages", () => {
 every((t) => {
  assert.ok(t.layout.length >= 5, `${t.id}: home page has only ${t.layout.length} sections`);
  assert.ok(t.shop.length >= 1, `${t.id}: no Shop page content`);
  assert.ok(t.pages.length >= 2, `${t.id}: only ${t.pages.length} extra page(s)`);
  // Every template needs a way to be contacted, whether that's a Contact page or a form on another.
  const hasContact = t.pages.some((p) => p.blocks.some((b) => b.type === "contact"));
  assert.ok(hasContact, `${t.id}: no contact form on any page`);
 });
});

test("page slugs are unique per template and never shadow a built-in route", () => {
 const reserved = new Set(["shop", "home", "cart", "checkout", "preview", "p", "collections", "messages"]);
 every((t) => {
  const slugs = t.pages.map((p) => p.slug);
  assert.equal(new Set(slugs).size, slugs.length, `${t.id}: duplicate page slug`);
  for (const s of slugs) {
   assert.ok(!reserved.has(s), `${t.id}: page slug "${s}" collides with a built-in route`);
   assert.match(s, /^[a-z0-9][a-z0-9-]*$/, `${t.id}: "${s}" is not a slug`);
  }
 });
});

// The placeholder-tile trap: a starter template that names designers the store doesn't carry sends a
// shopper to an empty aisle on their first click. Tiles must be categories, eras or vibes — never a
// fashion house we invented on the store's behalf.
test("no template ships tiles naming a designer the store may not carry", () => {
 const houses = /gucci|prada|dior|chanel|versace|mugler|cavalli|blumarine|gaultier|tom ford|balenciaga|fendi|hermes|hermès|ysl|saint laurent|margiela|mcqueen|valentino/i;
 every((t) => {
  const tileBlocks = [...t.layout, ...t.shop, ...t.pages.flatMap((p) => p.blocks)].filter((b) => b.type === "collections");
  for (const b of tileBlocks) {
   const items = b.props?.items ?? "";
   assert.doesNotMatch(items, houses, `${t.id}: collections tiles name a designer — ${items.split("\n")[0]}`);
  }
 });
});

test("catalogue density is within what the renderer can express", () => {
 every((t) => {
  assert.ok([2, 3, 4, 5].includes(t.grid.cols), `${t.id}: ${t.grid.cols} columns`);
  assert.ok(["4/5", "1/1", "5/6", "3/4"].includes(t.grid.ratio), `${t.id}: ratio ${t.grid.ratio}`);
  assert.ok(["tight", "normal", "wide"].includes(t.grid.gutter), `${t.id}: gutter ${t.grid.gutter}`);
  assert.ok(["classic", "rail", "stacked"].includes(t.productLayout), `${t.id}: product layout ${t.productLayout}`);
 });
});

test("each template's palette is offered in the palette picker", () => {
 every((t) => {
  const match = STOREFRONT_PALETTES.find(
   (p) => p.colors.bg === t.colors.bg && p.colors.text === t.colors.text && p.colors.accent === t.colors.accent,
  );
  assert.ok(match, `${t.id}: its palette can't be re-picked from the Design panel`);
 });
});

// A store saved before the rewrite still names editorial-luxe / playful-drop / etc. Those must resolve
// to something rather than leaving the picker blank and a re-apply doing nothing.
test("retired template ids still resolve", () => {
 for (const old of ["editorial-luxe", "archive-noir", "modern-minimal", "literary-archive", "romantic", "warm-earthy", "playful-drop"]) {
  const t = getTemplate(old);
  assert.ok(t, `retired id "${old}" no longer resolves`);
  assert.ok(STOREFRONT_TEMPLATES.some((x) => x.id === t.id));
 }
 assert.equal(getTemplate("not-a-template"), undefined);
});

test("applying a template produces a complete, fresh theme", () => {
 every((t) => {
  const a = templateTheme(t.id);
  assert.ok(a, `${t.id}: templateTheme returned null`);
  assert.equal(a.template, t.id);
  assert.equal(a.blocks.length, t.layout.length);
  assert.equal(a.shopBlocks.length, t.shop.length);
  assert.equal(a.extraPages.length, t.pages.length);
  assert.equal(a.productLayout, t.productLayout);
  // Fresh ids each time, or applying a template twice would collide with the previous application.
  const again = templateTheme(t.id);
  assert.notEqual(a.blocks[0].id, again?.blocks[0].id, `${t.id}: block ids are not fresh`);
 });
});

test("the variant survives the trip from spec to block", () => {
 const heirloom = templateBlocks("elegant");
 assert.equal(heirloom.find((b) => b.type === "hero")?.variant, "stack");
 assert.equal(templateShopBlocks("archival")[0].variant, "row");
 assert.equal(templatePages("catalogue").find((p) => p.slug === "faq")?.blocks[0].variant, "index");
});

test("an unknown template id yields nothing rather than throwing", () => {
 assert.deepEqual(templateBlocks("nope"), []);
 assert.deepEqual(templateShopBlocks("nope"), []);
 assert.deepEqual(templatePages("nope"), []);
 assert.equal(templateTheme("nope"), null);
});
