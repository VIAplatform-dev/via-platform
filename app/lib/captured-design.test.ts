import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDesign, buildDesignCss } from "./captured-design.ts";

test("empty settings produce no design block (just preserved rest)", () => {
 assert.equal(buildDesignCss({ accent: null, heading: null, body: null }, ".x{color:red}"), ".x{color:red}");
 assert.equal(buildDesignCss({ accent: null, heading: null, body: null }, ""), "");
});

test("build → parse round-trips the settings", () => {
 const settings = { accent: "#5D0F17", heading: "Playfair Display", body: "Inter", bg: null, text: null, radius: null };
 const css = buildDesignCss(settings, "");
 const parsed = parseDesign(css);
 assert.deepEqual(parsed.settings, settings);
 assert.match(css, /font-family:'Playfair Display'.*!important/);
 assert.match(css, /body\{font-family:'Inter'/);
 assert.match(css, /background-color:#5D0F17!important/);
 assert.match(css, /fonts\.googleapis\.com/);
});

test("other custom CSS is preserved across a design update", () => {
 // Assistant-added CSS sits after the design block; re-building keeps it.
 const original = buildDesignCss({ accent: "#5D0F17", heading: null, body: null }, ".hero{padding:80px}");
 const { settings, rest } = parseDesign(original);
 assert.equal(rest, ".hero{padding:80px}");
 assert.equal(settings.accent, "#5D0F17");
 // Change only the heading font; the .hero rule must survive.
 const updated = buildDesignCss({ ...settings, heading: "Fraunces" }, rest);
 assert.ok(updated.includes(".hero{padding:80px}"));
 assert.equal(parseDesign(updated).settings.heading, "Fraunces");
});

// Fonts are no longer restricted to a curated list (any reasonable Google-font family is
// allowed), so validation is about SHAPE: a malformed color or a name with markup-unsafe
// characters is dropped; an ordinary family name is kept.
test("an invalid accent is dropped while an arbitrary font family is kept", () => {
 const css = buildDesignCss({ accent: "not-a-color", heading: "Comic Sans", body: "Inter", bg: null, text: null, radius: null }, "");
 assert.ok(!css.includes("not-a-color"));
 assert.equal(parseDesign(css).settings.accent, null);
 assert.equal(parseDesign(css).settings.heading, "Comic Sans");
 assert.equal(parseDesign(css).settings.body, "Inter");
});

test("a font name with unsafe characters is rejected", () => {
 const css = buildDesignCss({ accent: null, heading: "Evil'; }", body: null, bg: null, text: null, radius: null }, "");
 assert.ok(!css.includes("Evil"));
 assert.equal(parseDesign(css).settings.heading, null);
});

test("bg, text and radius round-trip through the design block", () => {
 const settings = { accent: null, heading: null, body: null, bg: "#FFF8F0", text: "#221111", radius: "round" as const };
 const parsed = parseDesign(buildDesignCss(settings, ""));
 assert.deepEqual(parsed.settings, settings);
});

test("parseDesign on a blob with no design block returns it all as rest", () => {
 const { settings, rest } = parseDesign(".a{color:blue}");
 assert.deepEqual(settings, { accent: null, heading: null, body: null, bg: null, text: null, radius: null });
 assert.equal(rest, ".a{color:blue}");
});
