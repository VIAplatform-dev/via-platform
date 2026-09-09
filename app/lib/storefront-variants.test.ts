import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sanitizeBlocks, makeBlock, blockDef, featuredCount, MAX_FEATURED, autoColumns } from "./storefront-blocks.ts";
import { resolveVariant, defaultVariantId, isKnownVariant, variantsFor, normalizeVariant, variantDefaults, VARIANTS, SECTION_CATEGORIES } from "./storefront-variants.ts";
import { readItems, writeItems, addItem, removeItem, moveItem, duplicateItem, ITEM_SCHEMAS } from "./storefront-items.ts";

// ── the sanitizer is the thing that would silently destroy a merchant's layout ──────────────────
// Every autosave round-trips through sanitizeBlocks, so anything it drops is gone for good.

test("keeps a valid variant through a save round-trip", () => {
 const [b] = sanitizeBlocks([{ id: "x", type: "hero", variant: "slides", props: { heading: "Hi" } }]);
 assert.equal(b.variant, "slides");
});

test("a block with no variant stays without one (old storefronts render as they always did)", () => {
 const [b] = sanitizeBlocks([{ id: "x", type: "hero", props: { heading: "Hi" } }]);
 assert.equal(b.variant, undefined);
 assert.equal(resolveVariant("hero", b.variant)?.id, defaultVariantId("hero"));
});

test("an UNKNOWN variant id is preserved, not stripped", () => {
 // It may have been written by a newer deploy (or a preview build). Stripping it here would destroy
 // that merchant's layout on the next autosave; the renderer falls back safely instead.
 const [b] = sanitizeBlocks([{ id: "x", type: "hero", variant: "mosaic-from-the-future", props: {} }]);
 assert.equal(b.variant, "mosaic-from-the-future");
 assert.equal(resolveVariant("hero", b.variant)?.id, defaultVariantId("hero"));
});

test("a malformed variant is dropped rather than stored", () => {
 for (const bad of [{ nope: 1 }, 42, "", "a".repeat(40), "Has Spaces", "../../etc", null]) {
  const [b] = sanitizeBlocks([{ id: "x", type: "hero", variant: bad, props: {} }]);
  assert.equal(b.variant, undefined, `expected ${JSON.stringify(bad)} to be dropped`);
 }
});

test("variant survives a second round-trip (save, reload, save again)", () => {
 const once = sanitizeBlocks([{ id: "x", type: "hero", variant: "split", props: { heading: "Hi" } }]);
 const twice = sanitizeBlocks(JSON.parse(JSON.stringify(once)));
 assert.equal(twice[0].variant, "split");
 assert.equal(twice[0].props.heading, "Hi");
});

test("adding a section composes the registry's defaults with the type's", () => {
 // How the studio builds one: makeBlock(type, variantDefaults(...), normalizeVariant(...)).
 const mk = (v: string) => makeBlock("hero", variantDefaults("hero", v), normalizeVariant("hero", v));
 const bleed = mk("bleed");
 assert.equal(bleed.variant, undefined, "the default layout needs no stored id");
 assert.equal(bleed.props.heading, "New Arrivals", "the type's own defaults still apply");
 const split = mk("split");
 assert.equal(split.variant, "split");
 assert.equal(split.props.imageSide, "left", "variant defaults layer over the type's");
});

// ── registry invariants ─────────────────────────────────────────────────────────────────────────

test("every block type has at least one variant, with unique ids", () => {
 for (const g of VARIANTS) {
  assert.ok(g.variants.length >= 1, `${g.type} has no variants`);
  const ids = g.variants.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length, `${g.type} has duplicate variant ids`);
  for (const id of ids) assert.match(id, /^[a-z0-9-]{1,32}$/, `${g.type}/${id} is not a valid slug`);
 }
});

test("isKnownVariant only accepts ids that are actually registered", () => {
 assert.equal(isKnownVariant("hero", "slides"), true);
 assert.equal(isKnownVariant("hero", "nope"), false);
 assert.equal(isKnownVariant("hero", undefined), false);
 assert.equal(isKnownVariant("not-a-type", "slides"), false);
});

test("hero exposes the full layout family", () => {
 assert.deepEqual(variantsFor("hero").map((v) => v.id), ["bleed", "slides", "split", "stack", "frame"]);
});

// ── the items codec: the seam in front of the pipe-delimited storage ────────────────────────────

test("reads the format every existing storefront already stores", () => {
 const items = readItems({ items: "Great find. | Maya R.\nShipped fast. | Jordan T." }, ITEM_SCHEMAS.testimonials);
 assert.deepEqual(items, [{ quote: "Great find.", name: "Maya R." }, { quote: "Shipped fast.", name: "Jordan T." }]);
});

test("round-trips unchanged, so a save can't churn untouched content", () => {
 const raw = "Dresses | https://x/1.jpg\nOuterwear\nHandbags";
 assert.equal(writeItems(readItems({ items: raw }, ITEM_SCHEMAS.collections), ITEM_SCHEMAS.collections), raw);
});

test("a pipe or a line break INSIDE a value no longer splits the row", () => {
 // The bug the codec exists to prevent: a review saying "in | out" used to become a phantom name.
 const items = [{ quote: "Day | night, it works.\nTruly.", name: "Maya R." }];
 const stored = writeItems(items, ITEM_SCHEMAS.testimonials);
 assert.deepEqual(readItems({ items: stored }, ITEM_SCHEMAS.testimonials), items);
});

test("a comma inside a loose value no longer shatters it into extra items", () => {
 // A Cloudinary/imgix transform puts commas in the path, and a loose schema splits rows on commas —
 // so one gallery photo used to come back as three broken entries.
 const src = "https://res.cloudinary.com/x/image/upload/w_800,h_600,c_fill/bag.jpg";
 const stored = writeItems([{ src }], ITEM_SCHEMAS.gallery);
 const read = readItems({ images: stored }, ITEM_SCHEMAS.gallery);
 // One entry, and its URL intact. Asserted on the FIELD rather than deep-equal on the whole item:
 // a schema gains fields over time (gallery grew `pos` for focal point), and this test is about
 // commas surviving, not about the shape of a gallery item.
 assert.equal(read.length, 1);
 assert.equal(read[0].src, src);
 // Same for a marquee label that just happens to contain a comma.
 const labels = [{ label: "Free shipping, always" }, { label: "Authenticated" }];
 assert.deepEqual(readItems({ items: writeItems(labels, ITEM_SCHEMAS.marquee) }, ITEM_SCHEMAS.marquee), labels);
});

test("a strict schema keeps commas bare — they aren't a delimiter there", () => {
 // Escaping commas everywhere would litter backslashes through ordinary body copy.
 const items = [{ quote: "Fast, kind, and honest.", name: "Maya R." }];
 const stored = writeItems(items, ITEM_SCHEMAS.testimonials);
 assert.ok(!stored.includes("\\,"), stored);
 assert.deepEqual(readItems({ items: stored }, ITEM_SCHEMAS.testimonials), items);
});

test("sellers can still paste a comma-separated list by hand", () => {
 // The escape is only about what WE write; a hand-typed list must keep splitting on commas.
 assert.deepEqual(readItems({ items: "Dresses, Outerwear, Handbags" }, ITEM_SCHEMAS.marquee),
  [{ label: "Dresses" }, { label: "Outerwear" }, { label: "Handbags" }]);
});

test("missing trailing fields read as empty, extras are ignored", () => {
 const [it] = readItems({ items: "Title | Excerpt" }, ITEM_SCHEMAS.blog);
 assert.deepEqual(it, { title: "Title", excerpt: "Excerpt", img: "", link: "" });
 const [ex] = readItems({ items: "A | B | C | D | E | F" }, ITEM_SCHEMAS.blog);
 assert.deepEqual(ex, { title: "A", excerpt: "B", img: "C", link: "D" });
});

test("blank and separator-only rows are dropped", () => {
 assert.deepEqual(readItems({ items: "\n\n  |  | \nReal | Row\n" }, ITEM_SCHEMAS.testimonials), [{ quote: "Real", name: "Row" }]);
 assert.deepEqual(readItems({}, ITEM_SCHEMAS.testimonials), []);
 assert.deepEqual(readItems({ items: "   " }, ITEM_SCHEMAS.testimonials), []);
});

test("loose schemas accept commas as well as newlines", () => {
 assert.deepEqual(readItems({ items: "Dior, Chanel\nHermès" }, ITEM_SCHEMAS.marquee).map((i) => i.label), ["Dior", "Chanel", "Hermès"]);
});

test("list operations preserve the other items", () => {
 const base = readItems({ items: "A | 1\nB | 2\nC | 3" }, ITEM_SCHEMAS.testimonials);
 assert.deepEqual(moveItem(base, 0, 2).map((i) => i.quote), ["B", "C", "A"]);
 assert.deepEqual(removeItem(base, 1).map((i) => i.quote), ["A", "C"]);
 assert.deepEqual(duplicateItem(base, 1).map((i) => i.quote), ["A", "B", "B", "C"]);
 assert.deepEqual(addItem(base, ITEM_SCHEMAS.testimonials).at(-1), { quote: "", name: "" });
 assert.equal(base.length, 3, "operations must not mutate the input");
});

// ── switching layouts: the merchant's work must survive, in both directions ──────────────────────
import { applyVariant, switchNotes } from "./storefront-variant-switch.ts";

test("switching hero → slideshow turns the existing hero into slide one", () => {
 const b = { id: "x", type: "hero" as const, props: { heading: "New Arrivals", subtext: "Curated.", cta: "Shop", image: "https://x/1.jpg" } };
 const next = applyVariant(b, "slides");
 assert.equal(next.variant, "slides");
 assert.deepEqual(readItems(next.props, ITEM_SCHEMAS.slides), [{ heading: "New Arrivals", subtext: "Curated.", cta: "Shop", image: "https://x/1.jpg" }]);
});

test("switching slideshow → hero keeps the extra slides on disk, not just the first", () => {
 const b = { id: "x", type: "hero" as const, variant: "slides", props: { slides: "One | a | Shop | https://x/1.jpg\nTwo | b | Shop | https://x/2.jpg" } };
 const next = applyVariant(b, "bleed");
 assert.equal(next.variant, undefined);
 assert.equal(next.props.heading, "One", "the first slide is hoisted into the layout's own fields");
 assert.equal(next.props.image, "https://x/1.jpg");
 assert.ok(next.props.slides.includes("Two"), "slide two is still stored — switching back must restore it");
 // …and it does:
 assert.equal(readItems(applyVariant(next, "slides").props, ITEM_SCHEMAS.slides).length, 2);
});

test("a switch never overwrites content the merchant already set", () => {
 const b = { id: "x", type: "hero" as const, variant: "slides", props: { heading: "Kept", slides: "Slide one | a | Shop | " } };
 assert.equal(applyVariant(b, "bleed").props.heading, "Kept");
});

test("a switch never deletes props, and round-trips to the same content", () => {
 const props = { heading: "H", subtext: "S", cta: "C", image: "https://x/1.jpg" };
 const b = { id: "x", type: "hero" as const, props };
 const there = applyVariant(b, "slides");
 const back = applyVariant(there, "bleed");
 for (const [k, v] of Object.entries(props)) assert.equal(back.props[k], v, `${k} survived the round trip`);
});

test("switching into a layout seeds its structural defaults only when unset", () => {
 const fresh = applyVariant({ id: "x", type: "hero" as const, props: {} }, "split");
 assert.equal(fresh.props.imageSide, "left");
 const chosen = applyVariant({ id: "x", type: "hero" as const, props: { imageSide: "right" } }, "split");
 assert.equal(chosen.props.imageSide, "right");
});

test("an unknown destination leaves the block untouched", () => {
 const b = { id: "x", type: "hero" as const, variant: "split", props: { heading: "H" } };
 assert.deepEqual(applyVariant(b, "no-such-layout"), b);
});

test("the merchant is told what a lossy switch will do, before it happens", () => {
 const many = { id: "x", type: "hero" as const, variant: "slides", props: { slides: "A | | | \nB | | | \nC | | | " } };
 assert.match(switchNotes(many, "bleed")[0], /other 2 stay saved/);
 assert.deepEqual(switchNotes({ id: "x", type: "hero" as const, props: { heading: "H" } }, "split"), [], "a lossless switch says nothing");
});

test("every variant's declared item schema actually exists", () => {
 // `supports.items` drives the panel's repeated-content editor. A name with no schema behind it
 // would mean a layout that renders items the merchant has no way to add.
 for (const g of VARIANTS) for (const v of g.variants) {
  if (v.supports?.items) assert.ok(ITEM_SCHEMAS[v.supports.items], `${g.type}/${v.id} names a missing schema`);
 }
});

test("a variant's extra fields don't collide with the type's own", () => {
 for (const g of VARIANTS) {
  const base = new Set((blockDef(g.type)?.fields || []).map((f) => f.key));
  for (const v of g.variants) for (const f of v.fields || []) {
   assert.ok(!base.has(f.key), `${g.type}/${v.id} redeclares the base field "${f.key}"`);
  }
 }
});

test("switching between layouts of every core family preserves content", () => {
 // The families built in phase 2. Each switch must keep what the merchant wrote, in both directions.
 const content: Record<string, Record<string, string>> = {
  featured: { heading: "The Edit", eyebrow: "New" },
  collections: { heading: "Shop", items: "Dresses | https://x/1.jpg\nDenim" },
  testimonials: { heading: "Loved", items: "Great. | Maya\nFast. | Jordan" },
  columns: { heading: "Why us", items: "Sourced | By hand |  |  | \nOne of one | No restocks |  |  | " },
  split: { heading: "Our story", body: "Long copy.", cta: "Read more", image: "https://x/2.jpg" },
 };
 for (const [type, props] of Object.entries(content)) {
  const ids = variantsFor(type).map((v) => v.id);
  for (const to of ids) {
   const next = applyVariant({ id: "x", type: type as "featured", props }, to);
   for (const [k, v] of Object.entries(props)) assert.equal(next.props[k], v, `${type} → ${to} lost ${k}`);
   // …and every one of them survives a save.
   const [saved] = sanitizeBlocks([next]);
   assert.equal(saved.variant, next.variant, `${type} → ${to} lost its variant on save`);
  }
 }
});

// ── skins: the second axis. A skin must never be able to overrule the merchant ──────────────────
import { SKINS, skinCss, isSkin } from "./storefront-skins.ts";

test("no skin emits !important — per-section overrides must always win", () => {
 // sectionOverrideCss emits the merchant's own choices with !important. If a skin used it too, the
 // later-declared rule would win and applying a skin could silently undo their work.
 for (const s of SKINS) assert.ok(!skinCss(s.id).includes("!important"), `${s.id} uses !important`);
});

test("skin rules stay at single-class specificity and scope to their own root", () => {
 for (const s of SKINS) {
  // Split into rules, then drop at-rule preludes (`@container (max-width:640px){`) and the stray
  // closing brace they leave behind: the rules INSIDE them still have to be scoped, and were —
  // this check just couldn't see past the wrapper once skins started carrying mobile padding.
  for (const rule of skinCss(s.id).split("}").filter(Boolean)) {
   const sel = rule.split("{").filter((part) => !part.trim().startsWith("@")).slice(0, -1).join("{") || rule.split("{")[0];
   if (!sel.trim() || sel.trim().startsWith("@")) continue;
   for (const part of sel.split(",")) {
    const t = part.trim();
    if (!t) continue;
    assert.ok(t.startsWith(`.vya-skin-${s.id}`), `${s.id} leaks outside its scope: ${t}`);
   }
  }
 }
});

test("an unknown or absent skin emits nothing at all", () => {
 assert.equal(skinCss(undefined), "");
 assert.equal(skinCss(""), "");
 assert.equal(skinCss("not-a-skin"), "");
 assert.equal(isSkin("statement"), true);
 assert.equal(isSkin("nope"), false);
});

test("every skin targets the classes layouts actually render with", () => {
 // A skin works on all ~75 layouts precisely because it targets the shared classes, never a layout.
 for (const s of SKINS) {
  const css = skinCss(s.id);
  for (const cls of [".vya-heading", ".vya-cta", ".vya-sec"]) assert.ok(css.includes(cls), `${s.id} never styles ${cls}`);
 }
});

test("every layout in the picker carries a label, a description, and a category", () => {
 // The picker lists one card per LAYOUT and searches across all three fields. A blank one would be
 // an unfindable, unlabelled card.
 for (const g of VARIANTS) {
  assert.ok(SECTION_CATEGORIES.includes(g.category), `${g.type} has an unknown category`);
  for (const v of g.variants) {
   assert.ok(v.label.trim(), `${g.type}/${v.id} has no label`);
   assert.ok(v.description.trim().length > 10, `${g.type}/${v.id} has no real description`);
  }
 }
});

test("layout labels are unique within a section type", () => {
 // Two cards reading "Grid" under the same section would be indistinguishable in the picker.
 for (const g of VARIANTS) {
  const labels = g.variants.map((v) => v.label.toLowerCase());
  assert.equal(new Set(labels).size, labels.length, `${g.type} has duplicate layout labels`);
 }
});

test("every registered layout has a thumbnail case, or falls back to its type's", () => {
 // The picker keys thumbnails on `type/variant`. A layout with no case still renders (it falls back
 // to the section's generic wireframe) — this test just reports which ones are generic, so a family
 // can't quietly ship a wall of identical-looking cards.
 const src = readFileSync(new URL("../store/storefront/SectionThumb.tsx", import.meta.url), "utf8");
 const missing: string[] = [];
 for (const g of VARIANTS) for (const v of g.variants.slice(1)) {
  // slice(1): a type's DEFAULT layout intentionally uses the type-level thumbnail.
  if (!src.includes(`case "${g.type}/${v.id}"`)) missing.push(`${g.type}/${v.id}`);
 }
 assert.deepEqual(missing, [], `layouts without their own thumbnail: ${missing.join(", ")}`);
});

test("switching between FAQ layouts keeps every question and answer", () => {
 // All six read the same q0/a0 pairs, so a switch is purely presentational — nothing to migrate,
 // nothing to lose, in either direction.
 const props = { heading: "Frequently asked", subtext: "Everything about sourcing and returns.", q0: "How are pieces sourced?", a0: "Hand-selected.", q1: "Returns?", a1: "14 days for credit." };
 for (const to of variantsFor("faq").map((v) => v.id)) {
  const next = applyVariant({ id: "x", type: "faq", props }, to);
  for (const [k, v] of Object.entries(props)) assert.equal(next.props[k], v, `faq → ${to} lost ${k}`);
  const [saved] = sanitizeBlocks([next]);
  for (const [k, v] of Object.entries(props)) assert.equal(saved.props[k], v, `faq → ${to} lost ${k} on save`);
 }
});

test("a per-field width survives a save, and is clamped to something usable", () => {
 // Set by dragging a side handle. Without sanitizer support it would vanish on the next autosave,
 // exactly like `variant` would have.
 const [b] = sanitizeBlocks([{ id: "x", type: "text", props: {}, style: { free: { heading: { w: 62 } } } }]);
 assert.equal(b.style?.free?.heading?.w, 62);
 for (const [input, expected] of [[0, 5], [500, 100], [4.6, 5]] as [number, number][]) {
  const [c] = sanitizeBlocks([{ id: "x", type: "text", props: {}, style: { free: { heading: { w: input } } } }]);
  assert.equal(c.style?.free?.heading?.w, expected, `width ${input} should clamp to ${expected}`);
 }
 const [d] = sanitizeBlocks([{ id: "x", type: "text", props: {}, style: { free: { heading: { w: "wide" } } } }]);
 assert.equal(d.style?.free?.heading?.w, undefined, "a non-numeric width is dropped");
});

test("width and font size are independent — a side drag can't disturb the type", () => {
 const [b] = sanitizeBlocks([{ id: "x", type: "text", props: {}, style: { free: { heading: { w: 40, fontPx: 52 } } } }]);
 assert.equal(b.style?.free?.heading?.w, 40);
 assert.equal(b.style?.free?.heading?.fontPx, 52);
});

// ── the product-count ceiling ───────────────────────────────────────────────────────────────────
// A section can be pointed at a collection of any size, so the cap is what stops a homepage from
// becoming the whole catalogue. It has to hold against values the picker can't produce.

test("a section never shows more than the cap, whatever the stored value says", () => {
 assert.equal(featuredCount("500", 8), MAX_FEATURED);      // hand-edited or imported
 assert.equal(featuredCount("21", 8), MAX_FEATURED);       // one past the top option
 assert.equal(featuredCount(String(MAX_FEATURED), 8), MAX_FEATURED);
});

test("a chosen count under the cap is respected exactly", () => {
 for (const n of [4, 8, 12, 16, 20]) assert.equal(featuredCount(String(n), 8), n);
});

test("no value falls back to the layout's own default, not to the cap", () => {
 // Each featured layout passes its own fallback (grid 8, carousel 12, archive 10) — the cap must not
 // flatten them all to the same number when the merchant hasn't chosen.
 assert.equal(featuredCount(undefined, 8), 8);
 assert.equal(featuredCount("", 12), 12);
 assert.equal(featuredCount("not-a-number", 5), 5);
});

test("a nonsense count can never render zero products", () => {
 // 0 or a negative would otherwise slice to an empty grid — a section that silently shows nothing.
 assert.equal(featuredCount("0", 8), 8);
 assert.equal(featuredCount("-4", 8), 1);
});

// ── auto-fitting the grid ───────────────────────────────────────────────────────────────────────
// A curated collection is whatever size the seller made it. The grid has to look deliberate at any
// of those sizes without the seller reasoning about divisibility.

test("a small collection sits on one row rather than wrapping", () => {
 assert.equal(autoColumns(1), 1);
 assert.equal(autoColumns(2), 2);
 assert.equal(autoColumns(3), 3);
});

test("never leaves a single piece stranded alone on the last row", () => {
 // The case that reads as broken rather than as a layout: 5 items at 4-across = 4 + 1.
 for (let n = 1; n <= 40; n++) {
  const c = autoColumns(n);
  const lastRow = n % c;
  assert.notEqual(lastRow, 1, `${n} pieces at ${c} per row leaves one stranded`);
 }
});

test("prefers a row length that divides evenly", () => {
 assert.equal(autoColumns(4), 4);   // 4
 assert.equal(autoColumns(5), 5);   // 5 — one clean row, not 4 + 1
 assert.equal(autoColumns(6), 3);   // 3 + 3
 assert.equal(autoColumns(8), 4);   // 4 + 4
 assert.equal(autoColumns(9), 3);   // 3 + 3 + 3
 assert.equal(autoColumns(12), 4);  // 4 + 4 + 4
});

test("an awkward count still lands on a full-looking grid", () => {
 assert.equal(autoColumns(7), 4);   // 4 + 3 reads fine; 3+3+1 would not
 assert.equal(autoColumns(11), 4);  // 4 + 4 + 3
});

test("only ever returns a column count the grid can actually render", () => {
 for (let n = 1; n <= 60; n++) assert.ok([1, 2, 3, 4, 5].includes(autoColumns(n)), `${n} -> ${autoColumns(n)}`);
});
