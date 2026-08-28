import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeBlocks, type BlockStyle } from "./storefront-blocks.ts";

// Every autosave round-trips through sanitizeBlocks (see app/api/store/storefront/design/route.ts),
// and that function rebuilds `style` from scratch as a whitelist. So a field that BlockStyle declares
// and the CSS compiler renders, but the whitelist forgets, is written to the block, drawn once, and
// silently discarded on the next save — it looks like it works right up until the page is reloaded.
//
// That is exactly what happened to 23 of these: section height, the entire button style panel,
// per-field alignment, explicit heading/subtext px sizes, line-height, and bold/italic/underline.
//
// This is the guard. Add a field to BlockStyle → add it here → the test tells you if the sanitizer
// still needs teaching.
const FULL_STYLE: Required<Omit<BlockStyle, "bgMedia" | "free">> = {
 bg: "#F4F0E8",
 bgGradient: "#F4F0E8|#E9E0CE|180",
 bgImage: "https://example.com/a.jpg",
 bgOverlay: 40,
 textColor: "#1a1a1a",
 align: "center",
 headingAlign: "right",
 subtextAlign: "left",
 ctaAlign: "center",
 bodyAlign: "right",
 headingSize: "lg",
 headingSizePx: 51,
 headingFont: "Newsreader",
 tracking: 4,
 subtextSizePx: 17,
 subtextFont: "IBM Plex Sans",
 lineHeight: 140,
 textBold: true,
 textItalic: true,
 textUnderline: true,
 ctaBg: "#5D0F17",
 ctaColor: "#ffffff",
 ctaShape: "pill",
 ctaHoverBg: "#4a0c12",
 ctaHoverColor: "#ffffff",
 ctaBorder: 2,
 ctaBorderColor: "#5D0F17",
 ctaOutline: true,
 ctaFont: "Newsreader",
 ctaSize: "lg",
 ctaFullWidth: true,
 space: "lg",
 padY: 80,
 padTop: 0,
 padBottom: 120,
 padX: 32,
 radius: 24,
 border: 2,
 borderColor: "#1a1a1a",
 shadow: "md",
 minH: 640,
};

test("sanitizeBlocks preserves every declared BlockStyle field", () => {
 const [b] = sanitizeBlocks([{ id: "x", type: "hero", props: { heading: "Hi" }, style: FULL_STYLE }]);
 const got = (b.style || {}) as Record<string, unknown>;
 const dropped = Object.keys(FULL_STYLE).filter((k) => got[k] === undefined);
 assert.deepEqual(dropped, [], `sanitizeBlocks dropped: ${dropped.join(", ")}`);
 for (const [k, want] of Object.entries(FULL_STYLE)) {
  assert.equal(got[k], want, `style.${k} changed on round-trip`);
 }
});

test("sanitizeBlocks is idempotent for style", () => {
 const once = sanitizeBlocks([{ id: "x", type: "hero", props: {}, style: FULL_STYLE }]);
 const twice = sanitizeBlocks(JSON.parse(JSON.stringify(once)));
 assert.deepEqual(twice[0].style, once[0].style);
});

test("section height is clamped to the same bounds the canvas resize handle enforces", () => {
 // A hero may run tall; a strip section (announcement/marquee) may not — the clamp is per type, so a
 // value copied from one onto the other can't produce a 2000px announcement bar.
 const [tall] = sanitizeBlocks([{ id: "x", type: "hero", props: {}, style: { minH: 99999 } }]);
 assert.equal(tall.style?.minH, 2000);
 const [strip] = sanitizeBlocks([{ id: "y", type: "announcement", props: {}, style: { minH: 99999 } }]);
 assert.equal(strip.style?.minH, 64);
});

test("a photo's free transform (position AND size) round-trips", () => {
 // A photo is the only free field with a height: text sizes itself from its content, a photo's frame
 // is a box the merchant drags. If `h` were dropped here, resizing a photo would work until reload.
 const [b] = sanitizeBlocks([{
  id: "x", type: "hero", props: { image: "https://example.com/a.jpg" },
  style: { free: { image: { x: 40, y: 60, w: 55, h: 70 } } } as unknown as BlockStyle,
 }]);
 assert.deepEqual(b.style?.free?.image, { x: 40, y: 60, w: 55, h: 70 });

 // `h` is an aspect ratio (percent of the frame's own width), so it must be allowed past 100 — a
 // portrait photo is taller than it is wide. Clamped at the old 5–100 a portrait frame silently
 // became a square.
 const [tall] = sanitizeBlocks([{ id: "y", type: "hero", props: {}, style: { free: { image: { w: 40, h: 180 } } } as unknown as BlockStyle }]);
 assert.equal(tall.style?.free?.image?.h, 180);
});

test("numeric style values survive as strings, which is how the studio writes them", () => {
 // setBlockStyle stores every numeric control as a string; only the sanitizer coerces. If it stopped,
 // the whole Style panel would round-trip to undefined without a single type error.
 const [b] = sanitizeBlocks([{ id: "x", type: "hero", props: {}, style: { padTop: "0", padBottom: "96", minH: "500" } as unknown as BlockStyle }]);
 assert.equal(b.style?.padTop, 0);
 assert.equal(b.style?.padBottom, 96);
 assert.equal(b.style?.minH, 500);
});
