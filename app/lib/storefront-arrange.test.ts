import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { arrangeControls, variantSupports, variantsFor, VARIANTS } from "./storefront-variants.ts";
import { BLOCK_TYPES } from "./storefront-blocks.ts";

test("every layout that claims a resize control now offers one", () => {
 // `supports.resize` described these on seventeen layouts and nothing read it. The point of this
 // test is that the promise and the control can't drift apart again.
 const claims: [string, string][] = [
  ["featured", "grid"], ["featured", "carousel"], ["featured", "mosaic"],
  ["collections", "grid"], ["collections", "row"],
  ["columns", "image"], ["gallery", "grid"], ["gallery", "loose"], ["gallery", "mosaic"],
  ["hero", "split"],
 ];
 for (const [type, variant] of claims) {
  const resize = variantSupports(type, variant).resize || [];
  const offered = arrangeControls(type, variant).map((a) => a.prop);
  // `cols` is served by the layout's own "Per row" field rather than a slider.
  const expected = resize.filter((r) => r !== "cols").length;
  assert.equal(offered.length, expected, `${type}/${variant} claims ${resize.join()} but offers ${offered.join() || "nothing"}`);
 }
});

test("a layout with nothing to arrange offers nothing", () => {
 assert.deepEqual(arrangeControls("featured", "editorial"), []);
 assert.deepEqual(arrangeControls("text", "plain"), []);
});

test("the slider's bounds are the renderer's own clamps", () => {
 // featured.tsx clamps cardW to 18–60, collections.tsx to 10–40, hero.tsx splitRatio to 25–75.
 const card = arrangeControls("featured", "carousel").find((a) => a.prop === "cardW")!;
 assert.deepEqual([card.min, card.max, card.fallback], [18, 60, 26]);
 const tile = arrangeControls("collections", "row").find((a) => a.prop === "cardW")!;
 assert.deepEqual([tile.min, tile.max, tile.fallback], [10, 40, 15]);
 const split = arrangeControls("hero", "split").find((a) => a.prop === "splitRatio")!;
 assert.deepEqual([split.min, split.max, split.fallback], [25, 75, 50]);
});

test("gallery's grid can finally set photos per row", () => {
 // media.tsx reads p.cols for this layout; without a field nothing could ever write it.
 const grid = variantsFor("gallery").find((v) => v.id === "grid");
 assert.ok(grid?.fields?.some((f) => f.key === "cols"));
});

test("no layout advertises a control its renderer ignores", () => {
 // Four layouts declared a draggable split and never read splitRatio; two gallery layouts declared
 // a gap and never read it; gallery/grid and faq/cards declared a column count with no field to set
 // it. A control that moves a number nothing renders is worse than no control at all.
 const FILE: Record<string, string> = {
  hero: "hero", featured: "featured", collections: "collections", columns: "columns",
  gallery: "media", split: "split", spotlight: "editorial", appointments: "appointments", faq: "faq",
 };
 for (const g of VARIANTS) {
  for (const v of g.variants) {
   const resize = v.supports?.resize || [];
   if (!resize.length) continue;
   const src = readFileSync(new URL(`../s/blocks/${FILE[g.type]}.tsx`, import.meta.url), "utf8");
   for (const a of arrangeControls(g.type, v.id)) {
    const read = src.includes(`p.${a.prop}`) || (a.prop === "splitRatio" && src.includes("splitRatioOf"));
    assert.ok(read, `${g.type}/${v.id} offers ${a.prop} but ${FILE[g.type]}.tsx never reads it`);
   }
   if (resize.includes("cols")) {
    const fields = [...(BLOCK_TYPES.find((d) => d.type === g.type)?.fields || []), ...(v.fields || [])];
    // collections and columns carry a per-row control in the studio rather than a block field.
    const settable = fields.some((f) => f.key === "cols") || g.type === "collections" || g.type === "columns";
    assert.ok(settable, `${g.type}/${v.id} claims a column count with nothing to set it`);
   }
  }
 }
});
